/**
 * The one set of user32, kernel32 and dwmapi bindings Whippet calls through koffi, and the small helpers
 * over them that more than one module needs. koffi registers a named type once per process, so a second
 * module declaring its own `HWND` would throw; every caller loads from here instead.
 *
 * A koffi call costs about 5µs (measured October 2026; PowerShell cost a second a call). Nothing here imports
 * Electron, so a test can load it from plain node.
 */
'use strict';

const path = require('path');

let api = null;
let loadError = '';

function load() {
  if (api || loadError) return api;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const dwmapi = koffi.load('dwmapi.dll');
    koffi.pointer('HWND', koffi.opaque());
    const EnumProc = koffi.proto('bool __stdcall TagFoxEnumChildProc(HWND hwnd, intptr_t lParam)');
    api = {
      koffi,
      EnumProc,
      GetForegroundWindow: user32.func('HWND __stdcall GetForegroundWindow()'),
      SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(HWND hWnd)'),
      IsWindow: user32.func('bool __stdcall IsWindow(HWND hWnd)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(HWND hWnd)'),
      IsIconic: user32.func('bool __stdcall IsIconic(HWND hWnd)'),
      ShowWindow: user32.func('bool __stdcall ShowWindow(HWND hWnd, int nCmdShow)'),
      IsChild: user32.func('bool __stdcall IsChild(HWND hWndParent, HWND hWnd)'),
      GetParent: user32.func('HWND __stdcall GetParent(HWND hWnd)'),
      GetWindow: user32.func('HWND __stdcall GetWindow(HWND hWnd, uint32_t uCmd)'),
      GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND hWnd, int nIndex)'),
      GetDlgItem: user32.func('HWND __stdcall GetDlgItem(HWND hDlg, int nIDDlgItem)'),
      GetDlgCtrlID: user32.func('int __stdcall GetDlgCtrlID(HWND hWnd)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(HWND hWnd, _Out_ uint16_t *lpClassName, int nMaxCount)'),
      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(HWND hWnd, _Out_ uint16_t *lpString, int nMaxCount)'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *pid)'),
      EnumWindows: user32.func('bool __stdcall EnumWindows(TagFoxEnumChildProc *cb, intptr_t lParam)'),
      EnumChildWindows: user32.func('bool __stdcall EnumChildWindows(HWND hWndParent, TagFoxEnumChildProc *cb, intptr_t lParam)'),
      SendTextOut: user32.func('SendMessageTimeoutW', 'intptr_t', ['HWND', 'uint32_t', 'uintptr_t', koffi.out(koffi.pointer('uint16_t')), 'uint32_t', 'uint32_t', koffi.out(koffi.pointer('uintptr_t'))]),
      SendTextIn: user32.func('SendMessageTimeoutW', 'intptr_t', ['HWND', 'uint32_t', 'uintptr_t', 'str16', 'uint32_t', 'uint32_t', koffi.out(koffi.pointer('uintptr_t'))]),
      SendInts: user32.func('SendMessageTimeoutW', 'intptr_t', ['HWND', 'uint32_t', 'intptr_t', 'intptr_t', 'uint32_t', 'uint32_t', koffi.out(koffi.pointer('uintptr_t'))]),
      PostCommand: user32.func('PostMessageW', 'bool', ['HWND', 'uint32_t', 'uintptr_t', 'HWND']),
      OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)'),
      QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)'),
      GetApplicationUserModelId: kernel32.func('long __stdcall GetApplicationUserModelId(void *hProcess, _Inout_ uint32_t *length, _Out_ uint16_t *id)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *hObject)'),
      DwmGetWindowAttribute: dwmapi.func('long __stdcall DwmGetWindowAttribute(HWND hwnd, uint32_t attr, _Out_ uint32_t *value, uint32_t size)'),
    };
  } catch (e) {
    loadError = String((e && e.message) || e);
  }
  return api;
}

const textBuf = Buffer.alloc(4096);
function className(u, h) {
  return textBuf.toString('utf16le', 0, u.GetClassNameW(h, textBuf, 256) * 2);
}
function windowText(u, h) {
  return textBuf.toString('utf16le', 0, u.GetWindowTextW(h, textBuf, 2000) * 2);
}
function pidOf(u, h) {
  const pid = [0];
  u.GetWindowThreadProcessId(h, pid);
  return pid[0];
}
function sameHandle(u, a, b) {
  return !!a && !!b && u.koffi.address(a) === u.koffi.address(b);
}

function enumerate(u, parent) {
  const out = [];
  const cb = u.koffi.register((h) => {
    out.push(h);
    return true;
  }, u.koffi.pointer(u.EnumProc));
  try {
    if (parent) u.EnumChildWindows(parent, cb, 0);
    else u.EnumWindows(cb, 0);
  } finally {
    u.koffi.unregister(cb);
  }
  return out;
}
/** Every descendant window of `parent`. */
function children(u, parent) {
  return enumerate(u, parent);
}
/** Every top-level window, frontmost first (EnumWindows walks the Z order). */
function topLevelWindows(u) {
  return enumerate(u, null);
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
/** { exe: full image path, aumid: the packaged app's AppUserModelID or '' } for a process; '' fields when it cannot be opened. */
function processIdentity(u, pid) {
  const h = u.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (!h) return { exe: '', aumid: '' };
  try {
    const buf = Buffer.alloc(2048);
    const size = [1000];
    const exe = u.QueryFullProcessImageNameW(h, 0, buf, size) ? buf.toString('utf16le', 0, size[0] * 2) : '';
    const idBuf = Buffer.alloc(2 * 256);
    const idLen = [256];
    /* 0 is ERROR_SUCCESS; an unpackaged process answers APPMODEL_ERROR_NO_APPLICATION (15703). The length counts the NUL. */
    const aumid = u.GetApplicationUserModelId(h, idLen, idBuf) === 0 ? idBuf.toString('utf16le', 0, Math.max(0, idLen[0] - 1) * 2) : '';
    return { exe, aumid };
  } finally {
    u.CloseHandle(h);
  }
}

function exeBaseName(u, pid) {
  return path.win32.basename(processIdentity(u, pid).exe).replace(/\.exe$/i, '');
}

module.exports = {
  load,
  loadError: () => (load(), loadError),
  className,
  windowText,
  pidOf,
  sameHandle,
  children,
  topLevelWindows,
  processIdentity,
  exeBaseName,
};
