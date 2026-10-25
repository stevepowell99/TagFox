// The main half of sending a row to another app's Open or Save dialog (file-dialog-handoff.js), against a
// real Windows file dialog. It OPENS DIALOGS ON SCREEN for about fifteen seconds, so it is not in npm test:
// run it by hand, and leave the dialogs alone while it runs.
//
// Each dialog is shown by a powershell.exe this script starts (WinForms' OpenFileDialog and SaveFileDialog,
// which are the standard #32770 dialog), so its PID is known and no keystroke is sent to any app. It checks:
//   - an Open dialog is recognised as one, with its folder and an empty file name;
//   - a folder sent to it is navigated to (the dialog's address bar names it afterwards), and the dialog stays;
//   - a file sent to it opens: the dialog closes and hands that path back to PowerShell (the positive control);
//   - the closed dialog is then refused, with a reason;
//   - a Save dialog is recognised as one, with its file name;
//   - a folder sent to it fills in folder + name, and Save is NOT pressed: the dialog is still open seconds
//     later and PowerShell has handed nothing back;
//   - a child control is not taken for a dialog.
// Every powershell it started is killed by PID at the end.
//
// Run: node test/manual-file-dialog.cjs

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const koffi = require('koffi');
const handoff = require('../file-dialog-handoff.js');

const APP_DIR = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();

handoff.available(); // loads the module's bindings first, which declare the HWND type used below
const user32 = koffi.load('user32.dll');
const EnumProc = koffi.proto('bool __stdcall ManualTestEnumProc(HWND hwnd, intptr_t lParam)');
const EnumWindows = user32.func('bool __stdcall EnumWindows(ManualTestEnumProc *cb, intptr_t lParam)');
const EnumChildWindows = user32.func('bool __stdcall EnumChildWindows(HWND hWndParent, ManualTestEnumProc *cb, intptr_t lParam)');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *pid)');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(HWND hWnd, _Out_ uint16_t *lpClassName, int nMaxCount)');
const IsWindow = user32.func('bool __stdcall IsWindow(HWND hWnd)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(HWND hWnd)');
const buf = Buffer.alloc(512);
const cls = (h) => buf.toString('utf16le', 0, GetClassNameW(h, buf, 256) * 2);

function windowsOf(pid, wantClass, parent) {
  const out = [];
  const cb = koffi.register((h) => {
    const p = [0];
    GetWindowThreadProcessId(h, p);
    if (p[0] === pid && cls(h) === wantClass && IsWindowVisible(h)) out.push(h);
    return true;
  }, koffi.pointer(EnumProc));
  if (parent) EnumChildWindows(parent, cb, 0);
  else EnumWindows(cb, 0);
  koffi.unregister(cb);
  return out;
}

function startDialog(kind, folder) {
  const ps =
    `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.${kind}FileDialog; ` +
    `$d.InitialDirectory = '${folder}'; ${kind === 'Save' ? "$d.FileName = 'report.txt'; " : ''}` +
    `if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write('PICKED:' + $d.FileName) }`;
  const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { stdio: ['ignore', 'pipe', 'ignore'] });
  child.out = '';
  child.exited = false;
  child.stdout.on('data', (d) => (child.out += d));
  child.on('exit', () => (child.exited = true));
  return child;
}

async function dialogOf(child) {
  for (let i = 0; i < 80; i++) {
    const found = windowsOf(child.pid, '#32770');
    if (found.length) {
      await sleep(800); // let the dialog finish building its controls
      return found[0];
    }
    await sleep(150);
  }
  return null;
}

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'manual-file-dialog-' + process.pid);
  const a = path.join(root, 'start here');
  const b = path.join(root, 'send here');
  fs.mkdirSync(a, { recursive: true });
  fs.mkdirSync(b, { recursive: true });
  const fileInB = path.join(b, 'pick me.txt');
  fs.writeFileSync(fileInB, 'x\n');
  const started = [];
  try {
    check(handoff.available(), `koffi loads (${handoff.loadError() || 'ok'})`);

    // Open dialog.
    const open = startDialog('Open', a);
    started.push(open);
    console.log(`Open dialog: powershell PID ${open.pid}`);
    const openDlg = await dialogOf(open);
    check(!!openDlg, 'the Open dialog appears');
    if (openDlg) {
      const t = handoff.describeFileDialog(openDlg);
      check(!!t && t.info.kind === 'open', `recognised as an Open dialog (${JSON.stringify(t && t.info)})`);
      check(!!t && norm(t.info.folder) === norm(a) && t.info.fileName === '', 'with its folder and an empty file name');
      const firstChild = windowsOf(open.pid, 'Edit', openDlg)[0];
      check(!!firstChild && handoff.describeFileDialog(firstChild) === null, 'a control inside it is not taken for a dialog');

      let r = handoff.sendToFileDialog(t, b, true);
      check(r.ok && r.did === 'navigated', `a folder is sent (${JSON.stringify(r)})`);
      await sleep(1200);
      const after = handoff.describeFileDialog(openDlg);
      check(!!after && norm(after.info.folder) === norm(b), `the dialog now shows that folder (${after && after.info.folder})`);

      r = handoff.sendToFileDialog(t, fileInB, false);
      check(r.ok && r.did === 'opened', `a file is sent (${JSON.stringify(r)})`);
      for (let i = 0; i < 40 && !open.exited; i++) await sleep(150);
      check(norm(open.out.replace(/^PICKED:/, '')) === norm(fileInB), `the dialog opened that file ("${open.out}")`);
      const stale = handoff.sendToFileDialog(t, b, true);
      check(!stale.ok && /closed/.test(stale.error), `the closed dialog is refused ("${stale.error}")`);
    }

    // Save dialog.
    const save = startDialog('Save', a);
    started.push(save);
    console.log(`Save dialog: powershell PID ${save.pid}`);
    const saveDlg = await dialogOf(save);
    check(!!saveDlg, 'the Save dialog appears');
    if (saveDlg) {
      const t = handoff.describeFileDialog(saveDlg);
      check(!!t && t.info.kind === 'save', `recognised as a Save dialog (${JSON.stringify(t && t.info)})`);
      const name = t ? t.info.fileName : '';
      check(/^report(\.txt)?$/.test(name), `with its file name ("${name}")`);
      const r = handoff.sendToFileDialog(t, b, true);
      check(r.ok && r.did === 'filled' && norm(r.text) === norm(path.join(b, name)), `a folder fills in folder + name (${JSON.stringify(r)})`);
      await sleep(2500);
      check(IsWindow(saveDlg) && !save.exited && save.out === '', 'Save was not pressed: the dialog is still open and nothing was handed back');
      const again = handoff.describeFileDialog(saveDlg);
      check(!!again && norm(again.info.fileName) === norm(path.join(b, name)), `the file-name box holds it ("${again && again.info.fileName}")`);
    }
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    for (const c of started) {
      if (!c.exited) {
        try {
          process.kill(c.pid);
        } catch (_) {}
      }
      console.log(`closed powershell PID ${c.pid}`);
    }
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
  if (failures.length) {
    console.log(`\nmanual-file-dialog: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nmanual-file-dialog: all checks passed');
}

main();
