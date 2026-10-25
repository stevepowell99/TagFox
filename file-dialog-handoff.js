/**
 * Another app's Open or Save dialog: the standard Windows file dialog (window class #32770) that Notepad,
 * Chrome's uploads and most of Office use. The toggle shortcut reads the foreground window here before it
 * raises TagFox; if that is such a dialog, the next row Steve opens in TagFox is sent to it instead.
 *
 * Every call goes to user32 through koffi (about 5µs a call, measured October 2026; PowerShell cost a
 * second a call and a warm PowerShell 13ms). Nothing here imports Electron, so `test/manual-file-dialog.cjs`
 * can drive it from plain node against a real dialog.
 *
 * What the dialog looks like, measured on Windows 11 with the Open and Save As dialogs:
 * - Open: the file-name box is an Edit (control id 1148) in a ComboBox in a ComboBoxEx32, and button 1 reads "&Open".
 * - Save As: the file-name box is an Edit (control id 1001) in a ComboBox in a FloatNotifySink, and button 1 reads "&Save".
 * - Both: the address bar is a ToolbarWindow32 under "Breadcrumb Parent" whose text is "Address: <folder>".
 *
 * Safety, which the callers rely on:
 * - Text goes only to the file-name box of a window that is still the same #32770 dialog (same handle, same
 *   process), found again at the moment of sending, and checked to be inside that dialog.
 * - The dialog's own button is pressed only when it reads Open. A Save dialog, or one whose button says
 *   anything else, is only filled in: pressing Save over an existing file brings up an overwrite prompt.
 * - Nothing is sent as keystrokes, so nothing can land in whichever window happens to have the focus.
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
    const HWND = koffi.pointer('HWND', koffi.opaque());
    const EnumProc = koffi.proto('bool __stdcall TagFoxEnumChildProc(HWND hwnd, intptr_t lParam)');
    const u = {
      koffi,
      EnumProc,
      GetForegroundWindow: user32.func('HWND __stdcall GetForegroundWindow()'),
      SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(HWND hWnd)'),
      IsWindow: user32.func('bool __stdcall IsWindow(HWND hWnd)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(HWND hWnd)'),
      IsChild: user32.func('bool __stdcall IsChild(HWND hWndParent, HWND hWnd)'),
      GetParent: user32.func('HWND __stdcall GetParent(HWND hWnd)'),
      GetWindow: user32.func('HWND __stdcall GetWindow(HWND hWnd, uint32_t uCmd)'),
      GetDlgItem: user32.func('HWND __stdcall GetDlgItem(HWND hDlg, int nIDDlgItem)'),
      GetDlgCtrlID: user32.func('int __stdcall GetDlgCtrlID(HWND hWnd)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(HWND hWnd, _Out_ uint16_t *lpClassName, int nMaxCount)'),
      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(HWND hWnd, _Out_ uint16_t *lpString, int nMaxCount)'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *pid)'),
      EnumChildWindows: user32.func('bool __stdcall EnumChildWindows(HWND hWndParent, TagFoxEnumChildProc *cb, intptr_t lParam)'),
      SendTextOut: user32.func('SendMessageTimeoutW', 'intptr_t', ['HWND', 'uint32_t', 'uintptr_t', koffi.out(koffi.pointer('uint16_t')), 'uint32_t', 'uint32_t', koffi.out(koffi.pointer('uintptr_t'))]),
      SendTextIn: user32.func('SendMessageTimeoutW', 'intptr_t', ['HWND', 'uint32_t', 'uintptr_t', 'str16', 'uint32_t', 'uint32_t', koffi.out(koffi.pointer('uintptr_t'))]),
      SendInts: user32.func('SendMessageTimeoutW', 'intptr_t', ['HWND', 'uint32_t', 'intptr_t', 'intptr_t', 'uint32_t', 'uint32_t', koffi.out(koffi.pointer('uintptr_t'))]),
      PostCommand: user32.func('PostMessageW', 'bool', ['HWND', 'uint32_t', 'uintptr_t', 'HWND']),
      OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)'),
      QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *hObject)'),
    };
    api = u;
  } catch (e) {
    loadError = String((e && e.message) || e);
  }
  return api;
}

const WM_SETTEXT = 0x000c;
const WM_GETTEXT = 0x000d;
const WM_COMMAND = 0x0111;
const EM_SETSEL = 0x00b1;
const SMTO_ABORTIFHUNG = 0x0002;
const GW_OWNER = 4;
const IDOK = 1;
const FILE_NAME_IDS = new Set([1148, 1001]);

const textBuf = Buffer.alloc(4096);
function className(u, h) {
  return textBuf.toString('utf16le', 0, u.GetClassNameW(h, textBuf, 256) * 2);
}
function windowText(u, h) {
  return textBuf.toString('utf16le', 0, u.GetWindowTextW(h, textBuf, 2000) * 2);
}
/** A control's text in another process (GetWindowText reads only captions there). */
function controlText(u, h) {
  const out = Buffer.alloc(4096);
  const res = [0];
  if (!u.SendTextOut(h, WM_GETTEXT, 2000, out, SMTO_ABORTIFHUNG, 1000, res)) return null;
  return out.toString('utf16le', 0, Number(res[0]) * 2);
}
function pidOf(u, h) {
  const pid = [0];
  u.GetWindowThreadProcessId(h, pid);
  return pid[0];
}
function sameHandle(u, a, b) {
  return !!a && !!b && u.koffi.address(a) === u.koffi.address(b);
}

function children(u, parent) {
  const out = [];
  const cb = u.koffi.register((h) => {
    out.push(h);
    return true;
  }, u.koffi.pointer(u.EnumProc));
  try {
    u.EnumChildWindows(parent, cb, 0);
  } finally {
    u.koffi.unregister(cb);
  }
  return out;
}

/** The dialog's file-name box: a visible Edit with control id 1148 (Open) or 1001 (Save As) in a ComboBox. */
function findFileNameBox(u, dlg) {
  for (const h of children(u, dlg)) {
    if (className(u, h) !== 'Edit' || !FILE_NAME_IDS.has(u.GetDlgCtrlID(h)) || !u.IsWindowVisible(h)) continue;
    const parent = u.GetParent(h);
    if (parent && className(u, parent) === 'ComboBox') return h;
  }
  return null;
}

/** 'open' only when button 1 reads Open; anything else is treated as a Save dialog, which is never pressed. */
function dialogKind(u, dlg) {
  const btn = u.GetDlgItem(dlg, IDOK);
  const label = btn ? String(controlText(u, btn) || '').replace(/&/g, '').trim().toLowerCase() : '';
  if (label === 'open') return 'open';
  if (label === 'save') return 'save';
  return 'other';
}

function currentFolder(u, dlg) {
  for (const h of children(u, dlg)) {
    if (className(u, h) !== 'ToolbarWindow32') continue;
    const parent = u.GetParent(h);
    if (!parent || className(u, parent) !== 'Breadcrumb Parent') continue;
    const t = windowText(u, h);
    const i = t.indexOf(': ');
    return i >= 0 ? t.slice(i + 2) : t;
  }
  return '';
}

function exeBaseName(u, pid) {
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const h = u.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (!h) return '';
  try {
    const buf = Buffer.alloc(2048);
    const size = [1000];
    if (!u.QueryFullProcessImageNameW(h, 0, buf, size)) return '';
    return path.win32.basename(buf.toString('utf16le', 0, size[0] * 2)).replace(/\.exe$/i, '');
  } finally {
    u.CloseHandle(h);
  }
}

/** "Untitled - Notepad" → "Notepad"; with no owner title, the program's file name. */
function appName(u, dlg, pid) {
  const owner = u.GetWindow(dlg, GW_OWNER);
  const t = owner ? windowText(u, owner).trim() : '';
  const parts = t.split(/ [-–—] /);
  return (parts.length > 1 ? parts[parts.length - 1] : t).trim() || exeBaseName(u, pid) || 'another app';
}

/** The file dialog in front, or null (see describeFileDialog). */
function foregroundFileDialog() {
  const u = load();
  if (!u) return null;
  try {
    return describeFileDialog(u.GetForegroundWindow());
  } catch (_) {
    return null;
  }
}

/**
 * A window that is a file dialog with its file-name box, as a target; else null. `hwnd` stays in main;
 * `info` is what the renderer is told: { app, title, kind: 'open'|'save'|'other', folder, fileName }.
 */
function describeFileDialog(dlg) {
  const u = load();
  if (!u) return null;
  try {
    if (!dlg || className(u, dlg) !== '#32770' || !u.IsWindowVisible(dlg)) return null;
    const box = findFileNameBox(u, dlg);
    if (!box) return null;
    const pid = pidOf(u, dlg);
    return {
      hwnd: dlg,
      pid,
      info: {
        app: appName(u, dlg, pid),
        title: windowText(u, dlg).trim() || 'file',
        kind: dialogKind(u, dlg),
        folder: currentFolder(u, dlg),
        fileName: String(controlText(u, box) || ''),
      },
    };
  } catch (_) {
    return null;
  }
}

/** Still the same visible #32770 dialog of the same process, with its file-name box found again; else why not. */
function checkTarget(target) {
  const u = load();
  if (!u) return { ok: false, error: 'TagFox cannot reach other windows here: ' + loadError };
  if (!target || !target.hwnd) return { ok: false, error: 'No dialog is waiting.' };
  const dlg = target.hwnd;
  if (!u.IsWindow(dlg) || className(u, dlg) !== '#32770' || pidOf(u, dlg) !== target.pid || !u.IsWindowVisible(dlg)) {
    return { ok: false, error: `${target.info.app}'s ${target.info.title} dialog has closed.` };
  }
  const box = findFileNameBox(u, dlg);
  if (!box || !u.IsChild(dlg, box)) return { ok: false, error: `Could not find the file name box in ${target.info.app}'s dialog.` };
  return { ok: true, u, dlg, box, kind: dialogKind(u, dlg) };
}

/** What goes in the file-name box: the path itself for Open; for Save, the folder plus the name already there. */
function textForDialog(kind, fp, isFolder, currentName) {
  if (kind === 'open') return fp;
  const folder = isFolder ? fp : path.win32.dirname(fp);
  const name = path.win32.basename(String(currentName || '').trim());
  return name ? path.win32.join(folder, name) : folder.replace(/[\\/]*$/, '\\');
}

/** Bring the dialog forward; call while TagFox is still in front, which is what lets Windows allow it. */
function bringToFront(target) {
  const c = checkTarget(target);
  if (c.ok) c.u.SetForegroundWindow(c.dlg);
  return c.ok;
}

/**
 * Send a path to the dialog: an Open dialog gets the path and its Open button, so a file opens and a folder
 * is navigated to; any other dialog only has its file-name box filled. The box is read back before
 * anything is pressed, so a write that did not happen is reported. Returns { ok, did, text } or { ok:false, error }.
 */
function sendToFileDialog(target, fp, isFolder) {
  const c = checkTarget(target);
  if (!c.ok) return c;
  const { u, dlg, box, kind } = c;
  const text = textForDialog(kind, fp, isFolder, controlText(u, box));
  const res = [0];
  if (!u.SendTextIn(box, WM_SETTEXT, 0, text, SMTO_ABORTIFHUNG, 1000, res)) {
    return { ok: false, error: `${target.info.app}'s dialog did not answer.` };
  }
  if (controlText(u, box) !== text) return { ok: false, error: `${target.info.app}'s dialog did not take the path.` };
  if (kind === 'open') {
    if (!u.PostCommand(dlg, WM_COMMAND, IDOK, u.GetDlgItem(dlg, IDOK))) return { ok: false, error: 'Could not press Open.' };
    return { ok: true, did: isFolder ? 'navigated' : 'opened', text };
  }
  u.SendInts(box, EM_SETSEL, text.length, text.length, SMTO_ABORTIFHUNG, 500, res);
  return { ok: true, did: 'filled', text };
}

module.exports = {
  available: () => !!load(),
  loadError: () => (load(), loadError),
  foregroundFileDialog,
  describeFileDialog,
  checkTarget: (t) => {
    const c = checkTarget(t);
    return c.ok ? { ok: true, kind: c.kind } : c;
  },
  bringToFront,
  sendToFileDialog,
  textForDialog,
};
