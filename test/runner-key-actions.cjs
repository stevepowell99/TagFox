// The keys that toggle options, open dialogs and move between folders, driven with real key events over CDP
// against folders made for the test:
//   - Ctrl+W and Ctrl+. switch whole words and system files, and switch them back;
//   - Ctrl+R steps the recency window (any time, last hour, last day) and Ctrl+Shift+R toggles the last hour;
//   - Space checks and unchecks the selected row, Ctrl+A checks every row, and Esc goes back to the one;
//   - Ctrl+J and Ctrl+K move to the next folder and back;
//   - F2, Ctrl+Shift+N, Ctrl+H and Ctrl+/ open the rename, new-folder, bulk-rename and Help dialogs;
//   - Ctrl+, opens Settings, and Esc closes it without unchecking the selected row;
//   - Shift+Space shows the Viewer full screen and Esc puts it back;
//   - Ctrl+↑ from the list and Alt+↑ from the box go up a folder, Ctrl+Shift+Home leaves the folder,
//     and Ctrl+Shift+1…9 goes into a starred folder;
//   - Ctrl+Z with nothing to undo says so;
//   - Enter on a focused button presses the button rather than opening the selected row. The positive control
//     is Enter in the list, which opens that row, so a test that pressed nothing fails.
// Nothing here opens a file outside TagFox: the folder Enter is pressed in holds only folders.
//
// Run: node test/runner-key-actions.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-key-actions-' + process.pid);
  const alpha = path.join(root, 'alpha');
  const beta = path.join(root, 'beta');
  for (const d of [alpha, beta, path.join(root, 'gamma')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(alpha, 'inner.txt'), 'a\n');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-key-actions', scope: root });
    console.log('Hook ready.');
    const ALT = 1;
    const CTRL = 2;
    const SHIFT = 8;
    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(150);
    };
    const R = () => drv.T('runnerState');
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const focusList = () => drv.ev(`(document.getElementById('resultsWrap').focus(), 1)`);
    const focusBox = () => drv.ev(`(document.getElementById('query').focus(), 1)`);
    const waitFor = async (expr, ms = 4000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await drv.ev(expr)) return true;
        await sleep(100);
      }
      return false;
    };
    const shown = (id) => `document.getElementById('${id}')?.classList.contains('show')`;
    // By the dialog's own dismiss button, as a click would, so its caller's promise settles too. Bootstrap
    // ignores a hide while the dialog is still animating in, so the opening is waited out first.
    const closeModal = async (id) => {
      await waitFor(`!bootstrap.Modal.getInstance(document.getElementById('${id}'))?._isTransitioning`);
      await drv.ev(`(document.querySelector('#${id} [data-bs-dismiss="modal"]')?.click(), 1)`);
      check(await waitFor(`!document.querySelector('.modal.show')`), `set up: ${id} closes again`);
      await sleep(300);
    };
    // The folder's list, with the named row selected.
    const goTo = async (folder, selectName) => {
      await drv.T('configure', { rootFolder: folder });
      await drv.T('setQuery', '');
      for (let i = 0; i < 20; i++) {
        await drv.T('runSearchNow', 'identity');
        await drv.settle('go');
        const s = await R();
        if (!selectName) return s;
        const row = s.rows.find((r) => path.basename(r).toLowerCase() === selectName);
        if (row) {
          await focusList();
          await key('Home', 'Home', 36);
          for (let j = 0; j < s.rows.length && norm((await R()).selected) !== norm(row); j++) await key('ArrowDown', 'ArrowDown', 40);
          const got = await R();
          check(norm(got.selected) === norm(row), `set up: ${selectName} is selected (${path.basename(got.selected)})`);
          return got;
        }
        await sleep(400);
      }
      return R();
    };

    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    let s = await goTo(root, 'alpha');
    check(norm(s.selected) === norm(alpha), `set up: alpha is selected (${path.basename(s.selected)})`);

    // Options, from the list.
    await focusList();
    const opt = (id) => drv.ev(`document.getElementById('${id}').checked`);
    const ww = await opt('optWholeWord');
    await key('w', 'KeyW', 87, CTRL);
    const ww1 = await opt('optWholeWord');
    await key('w', 'KeyW', 87, CTRL);
    check(ww1 === !ww && (await opt('optWholeWord')) === ww, `Ctrl+W switches whole words and back (${ww} → ${ww1})`);
    const sys = await opt('optHideSpecial');
    await key('.', 'Period', 190, CTRL);
    const sys1 = await opt('optHideSpecial');
    await key('.', 'Period', 190, CTRL);
    check(sys1 === !sys && (await opt('optHideSpecial')) === sys, `Ctrl+. switches system files and back (${sys} → ${sys1})`);
    await drv.settle('options');

    const rec = [(await R()).recency];
    await key('r', 'KeyR', 82, CTRL);
    rec.push((await R()).recency);
    await key('r', 'KeyR', 82, CTRL);
    rec.push((await R()).recency);
    await key('R', 'KeyR', 82, CTRL | SHIFT);
    rec.push((await R()).recency);
    await key('R', 'KeyR', 82, CTRL | SHIFT);
    rec.push((await R()).recency);
    check(rec.join(' ') === 'all 1h 1d 1h all', `Ctrl+R steps the recency window and Ctrl+Shift+R toggles the last hour (${rec.join(' ')})`);
    await drv.settle('recency');

    // Checks.
    s = await goTo(root, 'alpha');
    const before = s.checked;
    await key(' ', 'Space', 32, 0, ' ');
    const afterSpace = (await R()).checked;
    await key(' ', 'Space', 32, 0, ' ');
    check(before === 1 && afterSpace === 0 && (await R()).checked === 1, `Space unchecks the selected row and checks it again (${before} → ${afterSpace})`);
    await key('a', 'KeyA', 65, CTRL);
    s = await R();
    check(s.checked === s.rows.length && s.rows.length >= 3, `Ctrl+A checks every row (${s.checked} of ${s.rows.length})`);
    await key('Escape', 'Escape', 27);
    check((await R()).checked === 1, `and Esc goes back to the selected row (${(await R()).checked} checked)`);

    // Next folder and back.
    const isFolder = (p) => ['alpha', 'beta', 'gamma'].includes(path.basename(p || '').toLowerCase());
    s = await goTo(root, 'alpha');
    const startJ = s.selected;
    // Ctrl+J goes down the list's folders and Ctrl+K up, so the first key is the one with a folder that way.
    const order = s.rows.filter(isFolder).map(norm);
    const down = order.indexOf(norm(startJ)) < order.length - 1;
    const [first, second] = down ? [['j', 'KeyJ', 74], ['k', 'KeyK', 75]] : [['k', 'KeyK', 75], ['j', 'KeyJ', 74]];
    await key(...first, CTRL);
    const gotJ = (await R()).selected;
    await key(...second, CTRL);
    const gotK = (await R()).selected;
    check(isFolder(gotJ) && norm(gotJ) !== norm(startJ) && norm(gotK) === norm(startJ), `Ctrl+${first[0].toUpperCase()} goes to the ${down ? 'next' : 'previous'} folder and Ctrl+${second[0].toUpperCase()} back (${[startJ, gotJ, gotK].map((p) => path.basename(p || '-')).join(' → ')})`);

    // Dialogs.
    s = await goTo(root, 'alpha');
    await key('F2', 'F2', 113);
    check(await waitFor(shown('renameItemModal')), 'F2 opens Rename');
    await closeModal('renameItemModal');
    await focusList();
    await key('N', 'KeyN', 78, CTRL | SHIFT);
    // With a folder row checked it first asks where the new folder goes.
    const asked = (await waitFor(`!!document.querySelector('#newFolderModal.show, #pasteTargetModal.show')`)) && (await drv.ev(`document.querySelector('.modal.show').id`));
    check(!!asked, `Ctrl+Shift+N opens New folder (${asked})`);
    if (asked) await closeModal(asked);
    await focusList();
    await key('h', 'KeyH', 72, CTRL);
    check(await waitFor(shown('bulkRenameModal')), 'Ctrl+H opens the wildcard rename');
    await closeModal('bulkRenameModal');
    await focusList();
    await key('/', 'Slash', 191, CTRL);
    check(await waitFor(shown('helpModal')), 'Ctrl+/ opens Help');
    await closeModal('helpModal');

    // Settings, and Esc in it.
    s = await goTo(root, 'alpha');
    await key(',', 'Comma', 188, CTRL);
    check(await waitFor(shown('settingsPanel')), 'Ctrl+, opens Settings');
    await sleep(400);
    await key('Escape', 'Escape', 27);
    const settingsClosed = await waitFor(`!document.getElementById('settingsPanel').classList.contains('show')`);
    s = await R();
    check(settingsClosed && s.checked === 1 && norm(s.scope) === norm(root), `Esc closes Settings and leaves the selected row checked (${s.checked} checked)`);

    // The Viewer full screen.
    const theater = `document.getElementById('propsAside').classList.contains('props-theater')`;
    await focusList();
    await key(' ', 'Space', 32, SHIFT, ' ');
    const theaterOn = await waitFor(theater);
    await key('Escape', 'Escape', 27);
    check(theaterOn && (await waitFor(`!${theater}`)), 'Shift+Space shows the Viewer full screen and Esc puts it back');

    // Folders.
    s = await goTo(alpha);
    await focusList();
    await key('ArrowUp', 'ArrowUp', 38, CTRL);
    await drv.settle('ctrl up');
    check(norm((await R()).scope) === norm(root), `Ctrl+↑ from the list goes up a folder (${path.basename((await R()).scope)})`);
    s = await goTo(alpha);
    await focusBox();
    await key('ArrowUp', 'ArrowUp', 38, ALT);
    await drv.settle('alt up');
    check(norm((await R()).scope) === norm(root), `Alt+↑ from the box goes up a folder (${path.basename((await R()).scope)})`);
    await focusList();
    await key('Home', 'Home', 36, CTRL | SHIFT);
    await drv.settle('leave folder');
    check((await R()).scope === '', `Ctrl+Shift+Home leaves the folder ("${(await R()).scope}")`);
    await drv.T('toggleStar', beta);
    s = await goTo(root, 'alpha');
    const n = s.stars.findIndex((p) => norm(p) === norm(beta)) + 1;
    check(n >= 1 && n <= 9, `set up: beta is starred, number ${n}`);
    await key('!@#$%^&*('[n - 1], 'Digit' + n, 48 + n, CTRL | SHIFT);
    await drv.settle('star');
    await waitFor(`(document.getElementById('rootFolder').value || '').toLowerCase().endsWith('beta')`);
    check(norm((await R()).scope) === norm(beta), `Ctrl+Shift+${n} goes into the starred folder (${path.basename((await R()).scope)})`);
    await drv.T('toggleStar', beta);

    // Undo.
    s = await goTo(root, 'alpha');
    await key('z', 'KeyZ', 90, CTRL);
    check(/^Nothing to undo/.test((await R()).status), `Ctrl+Z with nothing to undo says so ("${(await R()).status.slice(0, 40)}")`);

    // Enter on a button presses the button; Enter in the list opens the row.
    s = await goTo(root, 'alpha');
    const btn = await drv.ev(`(() => { const b = document.getElementById('btnPropsTheaterToggle'); if (!b || !b.getClientRects().length) return false; b.focus(); return document.activeElement === b; })()`);
    check(btn, 'set up: the Viewer full-screen button has the focus');
    await key('Enter', 'Enter', 13, 0, '\r');
    const pressed = await waitFor(theater, 2000);
    await drv.settle('enter on button');
    s = await R();
    check(pressed && norm(s.scope) === norm(root), `Enter on a button presses it and leaves the selected row alone (full screen ${pressed}, folder ${path.basename(s.scope)})`);
    await key('Escape', 'Escape', 27);
    await waitFor(`!${theater}`);
    s = await goTo(root, 'alpha');
    await key('Enter', 'Enter', 13, 0, '\r');
    await drv.settle('enter in list');
    check(norm((await R()).scope) === norm(alpha), `Enter in the list opens the selected folder (${path.basename((await R()).scope)})`);
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
  if (failures.length) {
    console.log(`\nrunner-key-actions: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-key-actions: all checks passed');
}

main();
