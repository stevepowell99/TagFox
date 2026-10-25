// The renderer half of sending a row to another app's Open or Save dialog. Main reads the dialog when the
// toggle shortcut is pressed and tells the renderer (tagfox-file-dialog-target); a test cannot press the
// OS-wide shortcut or put a dialog in front, so the message is delivered through the test hook and the
// sends are read back from the renderer's own log. Main has no dialog here, so it answers each send with
// "No Open or Save dialog is waiting", which the status line shows. By real key events, in Runner:
//   - with no dialog waiting there is no strip, and Enter on a folder row goes into it (the positive control);
//   - an Open dialog shows the strip, naming the app and the dialog;
//   - Enter on a file and on a folder row sends that row instead of opening it, and the folder stays as it was;
//   - a double-click sends the row too, and Ctrl+Enter sends the folder TagFox is showing;
//   - a Save dialog's strip keeps its file name and says Save is left to Steve;
//   - Esc stops: the strip goes, nothing more is sent, and Enter goes into a folder again;
//   - Runner's key table, which Help is drawn from, carries the dialog's keys.
// The main half (finding the dialog's file-name box, filling it, pressing Open) is test/manual-file-dialog.cjs,
// which opens a real dialog on screen and so stays out of npm test.
//
// Run: node test/file-dialog-handoff.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'file-dialog-test-' + process.pid);
  const sub = path.join(root, 'handoff folder');
  const file = path.join(root, 'handoff note.txt');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'inside.txt'), 'x\n');
  fs.writeFileSync(file, 'note\n');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-file-dialog', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const { ev, T } = drv;
    await T('setRunnerMode', true);
    await drv.settle('runner');
    await T('configure', { rootFolder: root });
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const R = () => T('runnerState');
    const key = async (k, code, vk, mods = 0) => {
      await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(250);
    };
    const enter = (mods = 0) => key('Enter', 'Enter', 13, mods);
    const CTRL = 2;
    const waitForRow = async (p) => {
      for (let i = 0; i < 20; i++) {
        await T('runSearchNow', 'identity');
        await drv.settle('rows');
        if ((await R()).rows.some((r) => norm(r) === norm(p))) return true;
        await sleep(400);
      }
      return false;
    };
    const backToRoot = async () => {
      await T('configure', { rootFolder: root });
      await waitForRow(file);
    };
    const selectRow = async (p) => {
      const ok = await ev(`(() => {
        const want = ${JSON.stringify(norm(p))};
        const tr = [...document.querySelectorAll('#tbody tr[data-row-path]')].find((t) => t.dataset.rowPath.replace(/[\\\\/]+$/, '').toLowerCase() === want);
        if (!tr) return false;
        tr.click();
        return true;
      })()`);
      await sleep(150);
      await ev(`(document.getElementById('query').focus(), 1)`);
      return ok;
    };
    const barShown = () => ev(`!document.getElementById('fileDialogBar').classList.contains('d-none')`);
    const text = (id) => ev(`(document.getElementById(${JSON.stringify(id)})?.textContent || '').trim()`);
    const sends = () => T('fileDialogSends');

    check(await waitForRow(file), 'the fixture is listed');
    await waitForRow(sub);

    // No dialog waiting: Enter on a folder goes into it.
    check(!(await barShown()), 'no dialog waiting: no strip');
    check(await selectRow(sub), 'the folder row can be selected');
    await enter();
    await drv.settle('into folder');
    check(norm((await R()).scope) === norm(sub), `no dialog waiting: Enter goes into the folder (scope ${(await R()).scope})`);
    check((await sends()).length === 0, 'no dialog waiting: nothing is sent');
    await backToRoot();

    // An Open dialog waiting.
    await T('fileDialogTarget', { app: 'Notepad', title: 'Open', kind: 'open', folder: 'C:\\Users', fileName: '' });
    check(await barShown(), 'an Open dialog waiting: the strip shows');
    check((await text('fileDialogBarTitle')) === 'Next pick goes to: Notepad · Open', `it names the app and the dialog ("${await text('fileDialogBarTitle')}")`);
    check(/a file opens, a folder is shown/.test(await text('fileDialogBarHint')), 'it says what Enter does');

    await selectRow(file);
    await enter();
    let s = await sends();
    check(s.length === 1 && norm(s[0].path) === norm(file) && s[0].isFolder === false, `Enter on a file sends the file (${JSON.stringify(s)})`);
    check(/Not sent to the dialog: No Open or Save dialog is waiting/.test((await R()).status), `main's answer reaches the status line ("${(await R()).status}")`);

    await selectRow(sub);
    await enter();
    s = await sends();
    check(s.length === 2 && norm(s[1].path) === norm(sub) && s[1].isFolder === true, 'Enter on a folder sends the folder');
    check(norm((await R()).scope) === norm(root), 'and TagFox stays in the folder it was in');

    await ev(`(() => { const t = [...document.querySelectorAll('#tbody tr[data-row-path]')].find((x) => /handoff note/.test(x.dataset.rowPath)); t.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); t.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); return 1; })()`);
    await sleep(300);
    s = await sends();
    check(s.length === 3 && norm(s[2].path) === norm(file), 'a double-click sends the row');

    await ev(`(document.getElementById('query').focus(), 1)`);
    await enter(CTRL);
    s = await sends();
    check(s.length === 4 && norm(s[3].path) === norm(root) && s[3].isFolder === true, 'Ctrl+Enter sends the folder TagFox is showing');

    // A Save dialog waiting.
    await T('fileDialogTarget', { app: 'Word', title: 'Save As', kind: 'save', folder: 'C:\\Users', fileName: 'report' });
    const hint = await text('fileDialogBarHint');
    check((await text('fileDialogBarTitle')) === 'Next pick goes to: Word · Save As' && /keeping the name “report”/.test(hint) && /you press Save/.test(hint), `a Save dialog's strip keeps its name and leaves Save to Steve ("${hint}")`);

    // Esc stops.
    await key('Escape', 'Escape', 27);
    check(!(await barShown()), 'Esc takes the strip away');
    await selectRow(sub);
    await enter();
    await drv.settle('into folder again');
    check((await sends()).length === 4, 'after Esc nothing more is sent');
    check(norm((await R()).scope) === norm(sub), 'and Enter goes into the folder again');

    const names = await T('runnerKeyNames');
    check(Array.isArray(names) && names.filter((k) => k === 'Esc').length >= 2, "the key table carries the dialog's Esc beside Runner's own");
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  if (failures.length) {
    console.log(`\nfile-dialog-handoff: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nfile-dialog-handoff: all checks passed');
}

main();
