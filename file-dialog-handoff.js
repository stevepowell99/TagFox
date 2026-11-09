/**
 * Another app's Open or Save dialog: the standard Windows file dialog (window class #32770) that Notepad,
 * Chrome's uploads and most of Office use. The toggle shortcut reads the foreground window here before it
 * raises TagFox; if that is such a dialog, the next row Steve opens in TagFox is sent to it instead.
 *
 * Every call goes to user32 through koffi, by way of `win32.js` (about 5µs a call, measured October 2026;
 * PowerShell cost a second a call and a warm PowerShell 13ms). Nothing here imports Electron, so
 * `test/manual-file-dialog.cjs` can drive it from plain node against a real dialog.
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
const win32 = require('./win32.js');

const { load, className, windowText, pidOf, children, exeBaseName } = win32;

const WM_SETTEXT = 0x000c;
const WM_GETTEXT = 0x000d;
const WM_COMMAND = 0x0111;
const EM_SETSEL = 0x00b1;
const SMTO_ABORTIFHUNG = 0x0002;
const GW_OWNER = 4;
const IDOK = 1;
const FILE_NAME_IDS = new Set([1148, 1001]);

/** A control's text in another process (GetWindowText reads only captions there). */
function controlText(u, h) {
  const out = Buffer.alloc(4096);
  const res = [0];
  if (!u.SendTextOut(h, WM_GETTEXT, 2000, out, SMTO_ABORTIFHUNG, 1000, res)) return null;
  return out.toString('utf16le', 0, Number(res[0]) * 2);
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
  if (!u) return { ok: false, error: 'Whippet cannot reach other windows here: ' + win32.loadError() };
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
  loadError: win32.loadError,
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
