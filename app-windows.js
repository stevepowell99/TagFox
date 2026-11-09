/**
 * An app's open windows, for Runner's app rows: Enter on a Start menu app switches to its most recently used
 * window, and starts the app only when it has none (Steve, 9 November 2026).
 *
 * A window belongs to an app by its process: the program's full path for an ordinary app (the shortcut's
 * target, or a program of that name below its folder), the AppUserModelID for a packaged one (the Store apps, whose shortcut names `shell:AppsFolder\<id>`).
 * A packaged UWP app draws inside ApplicationFrameHost's frame, so a frame is identified by the process of
 * its CoreWindow child. EnumWindows walks the Z order, so the first match is the one used last.
 *
 * Only windows a person would switch to count: visible, not owned, not a tool window, titled, and not
 * cloaked except by the shell (a window on another virtual desktop). A suspended UWP app leaves an
 * app-cloaked frame behind, which must not count, or Enter would "switch" to nothing.
 */
'use strict';

const win32 = require('./win32.js');

const { load, className, windowText, pidOf, children, topLevelWindows, processIdentity, sameHandle } = win32;

const GW_OWNER = 4;
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x80;
const DWMWA_CLOAKED = 14;
const DWM_CLOAKED_SHELL = 0x2;
const SW_RESTORE = 9;

function normExe(p) {
  return String(p || '').trim().toLowerCase();
}

/* The shortcut's program, or one of the same name below its folder: an app installed by Squirrel (Slack,
   Claude) is started through a stub at `slack\slack.exe` and runs as `slack\app-4.53.276\slack.exe`. */
function exeMatches(target, running) {
  if (!target || !running) return false;
  if (target === running) return true;
  const cut = target.lastIndexOf('\\');
  return cut > 0 && running.startsWith(target.slice(0, cut + 1)) && running.endsWith(target.slice(cut));
}

function switchable(u, h) {
  if (!u.IsWindowVisible(h) || u.GetWindow(h, GW_OWNER)) return false;
  if (Number(u.GetWindowLongPtrW(h, GWL_EXSTYLE)) & WS_EX_TOOLWINDOW) return false;
  const cloaked = [0];
  if (u.DwmGetWindowAttribute(h, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked[0] && cloaked[0] !== DWM_CLOAKED_SHELL) return false;
  return windowText(u, h).trim() !== '';
}

/** { exe, aumid } of the app a top-level window shows, looking through a UWP frame to its CoreWindow. */
function windowIdentity(u, h, cache) {
  const ident = (pid) => {
    if (!cache.has(pid)) cache.set(pid, processIdentity(u, pid));
    return cache.get(pid);
  };
  const own = ident(pidOf(u, h));
  if (className(u, h) !== 'ApplicationFrameWindow') return own;
  for (const c of children(u, h)) {
    if (className(u, c) !== 'Windows.UI.Core.CoreWindow') continue;
    const inner = ident(pidOf(u, c));
    if (inner.aumid) return inner;
  }
  return own;
}

/**
 * The most recently used switchable window of the app, or null. `want` is { exe } or { aumid } (either may
 * be empty); `skipPid` leaves out a process, such as Whippet's own.
 */
function findAppWindow(want, { skipPid = 0 } = {}) {
  const u = load();
  if (!u) return null;
  const exe = normExe(want && want.exe);
  const aumid = String((want && want.aumid) || '').trim().toLowerCase();
  if (!exe && !aumid) return null;
  const cache = new Map();
  for (const h of topLevelWindows(u)) {
    try {
      if (!switchable(u, h)) continue;
      if (skipPid && pidOf(u, h) === skipPid) continue;
      const id = windowIdentity(u, h, cache);
      if ((aumid && id.aumid.toLowerCase() === aumid) || exeMatches(exe, normExe(id.exe))) {
        return { hwnd: h, title: windowText(u, h).trim() };
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Restore the window if minimised and bring it to the front, then read the foreground back: Windows refuses
 * the foreground to a process that is not in front, so call while Whippet is. Returns { ok, foreground }.
 */
function activateWindow(hwnd) {
  const u = load();
  if (!u || !hwnd || !u.IsWindow(hwnd)) return { ok: false, foreground: false };
  if (u.IsIconic(hwnd)) u.ShowWindow(hwnd, SW_RESTORE);
  u.SetForegroundWindow(hwnd);
  return { ok: true, foreground: sameHandle(u, u.GetForegroundWindow(), hwnd), restored: !u.IsIconic(hwnd) };
}

module.exports = {
  available: () => !!load(),
  findAppWindow,
  activateWindow,
};
