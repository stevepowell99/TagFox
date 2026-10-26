// The keys that toggle options, open dialogs and move between folders, driven with real key events over CDP
// against folders made for the test:
//   - Ctrl+B and Ctrl+. switch whole words and system files, and switch them back;
//   - Ctrl+R steps the recency window forward (any time, last hour, last day) and Ctrl+Shift+R back, round
//     past any time to the last year;
//   - Space checks and unchecks the selected row, Ctrl+A checks every row, and Esc goes back to the one;
//   - F2, Ctrl+Shift+N and Ctrl+H open the rename, new-folder and bulk-rename dialogs; Ctrl+/ opens Help on
//     the Keys tab, and F1 on Get started;
//   - Ctrl+N opens the Quick TODO box aimed at the folder on screen;
//   - Ctrl+S saves the search on screen, and again says it is already saved rather than forgetting it;
//   - the / list shows each command's key beside it (Ctrl+B by Whole words only);
//   - Ctrl+, opens Settings, and Esc closes it without unchecking the selected row;
//   - Shift+Space shows the Viewer full screen and Esc puts it back;
//   - Alt+↑ and Ctrl+↑ from the box, with text typed, go up a folder with the one left selected, as ← does, and
//     Ctrl+Shift+1…9 goes into a starred folder;
//   - Ctrl+Z with nothing to undo says so;
// Ctrl+W is not driven: it hides the window, which a test window already is, through the call Esc's last
// step makes.
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
  const keysOf = new Map(); // a failure's index → the keys pressed for its check
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    const keys = drv ? drv.takeKeys() : [];
    if (ok) return;
    if (keys.length) keysOf.set(failures.length, keys);
    failures.push(label);
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
      const note = await drv.key(k, code, vk, mods, text);
      await sleep(150);
      return note;
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
        await drv.T('runSearchNow');
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

    const ctl = await drv.keyRecorderWorks();
    check(ctl.ok, `the page records a key raised in it, and that no key-table entry matched (positive control)${ctl.ok ? '' : ': ' + JSON.stringify(ctl.seen)}`);
    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    let s = await goTo(root, 'alpha');
    check(norm(s.selected) === norm(alpha), `set up: alpha is selected (${path.basename(s.selected)})`);

    // Options, from the list.
    await focusList();
    const opt = (id) => drv.ev(`searchOpts['${id}']`);
    const ww = await opt('optWholeWord');
    const ctrlB = await key('b', 'KeyB', 66, CTRL);
    const ww1 = await opt('optWholeWord');
    await key('b', 'KeyB', 66, CTRL);
    check(ww1 === !ww && (await opt('optWholeWord')) === ww, `Ctrl+B switches whole words and back (${ww} → ${ww1})`);
    const fateB = await drv.keyFate(ctrlB);
    check(fateB.includes('entry ran (Ctrl+B)'), `the page records the key-table entry Ctrl+B ran (positive control: ${fateB})`);
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
    await key('R', 'KeyR', 82, CTRL | SHIFT);
    rec.push((await R()).recency);
    await key('r', 'KeyR', 82, CTRL);
    rec.push((await R()).recency);
    check(rec.join(' ') === 'all 1h 1d 1h all 1y all', `Ctrl+R steps the recency window forward and Ctrl+Shift+R back (${rec.join(' ')})`);
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
    const helpTab = () => drv.ev(`document.querySelector('#helpModalTabs .nav-link.active')?.dataset.helpTab || ''`);
    await key('/', 'Slash', 191, CTRL);
    check((await waitFor(shown('helpModal'))) && (await helpTab()) === 'runner', `Ctrl+/ opens Help on the Keys tab (${await helpTab()})`);
    await closeModal('helpModal');
    await focusList();
    await key('F1', 'F1', 112);
    check((await waitFor(shown('helpModal'))) && (await helpTab()) !== 'runner', `F1 opens Help on Get started, not the Keys tab (${await helpTab()})`);
    await closeModal('helpModal');

    // Ctrl+N: a new TODO, here.
    await focusList();
    await key('n', 'KeyN', 78, CTRL);
    const todo = `(() => { const p = document.getElementById('quickTodoPop'); return !!p && !p.classList.contains('d-none') ? document.getElementById('quickTodoPopLabel').textContent : ''; })()`;
    const todoLabel = (await waitFor(todo)) && (await drv.ev(todo));
    check(todoLabel === 'New TODO in ' + path.basename(root), `Ctrl+N opens the Quick TODO box aimed at this folder ("${todoLabel}")`);
    await drv.ev(`(document.getElementById('btnQuickTodoPopClose').click(), 1)`);

    // Ctrl+S: save this search, and a second press keeps it saved.
    const savedCount = () => drv.ev(`(JSON.parse(localStorage.getItem('tagBrowserFavSearches') || '[]') || []).length`);
    s = await goTo(root, 'alpha');
    const savedBefore = await savedCount();
    await key('s', 'KeyS', 83, CTRL);
    const savedAfter = await savedCount();
    const st1 = (await R()).status;
    check(savedAfter === savedBefore + 1 && /^Saved as/.test(st1), `Ctrl+S saves the search on screen (${savedBefore} → ${savedAfter}, "${st1.slice(0, 40)}")`);
    await key('s', 'KeyS', 83, CTRL);
    const st2 = (await R()).status;
    check((await savedCount()) === savedAfter && /^Already saved/.test(st2), `Ctrl+S again keeps it saved and says so ("${st2.slice(0, 40)}")`);
    await drv.T('runCommand', 'save-search'); // the / command forgets it, so the profile ends as it began
    check((await savedCount()) === savedBefore, 'set up: the / command forgets it again');

    // The / list shows each command's key.
    await drv.T('setQuery', '');
    await focusBox();
    await key('/', 'Slash', 191, 0, '/');
    const wordKey = await drv.ev(`document.querySelector('#runnerCmdList [data-cmd-id="word"] .tagfox-runner-cmd-key')?.textContent || ''`);
    check(wordKey === 'Ctrl+B', `the / list shows Ctrl+B beside Whole words only ("${wordKey}")`);
    await key('Escape', 'Escape', 27);

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
    await drv.T('setQuery', 'inn');
    await focusBox();
    await key('ArrowUp', 'ArrowUp', 38, ALT);
    await drv.settle('alt up');
    await waitFor(`(currentFolderPath || '').replace(/[\\\\/]+$/, '').toLowerCase() === ${JSON.stringify(norm(root))}`);
    await drv.settle('alt up done');
    s = await R();
    check(norm(s.scope) === norm(root) && norm(s.selected) === norm(alpha), `Alt+↑ from the box, with text typed, goes up a folder with the one left selected (${path.basename(s.scope)}, ${path.basename(s.selected || '-')})`);
    s = await goTo(alpha);
    await drv.T('setQuery', 'inn');
    await focusBox();
    await key('ArrowUp', 'ArrowUp', 38, CTRL);
    await drv.settle('ctrl up');
    await waitFor(`(currentFolderPath || '').replace(/[\\\\/]+$/, '').toLowerCase() === ${JSON.stringify(norm(root))}`);
    await drv.settle('ctrl up done');
    s = await R();
    check(norm(s.scope) === norm(root) && norm(s.selected) === norm(alpha), `and so does Ctrl+↑ (${path.basename(s.scope)}, ${path.basename(s.selected || '-')})`);
    await drv.T('toggleStar', beta);
    s = await goTo(root, 'alpha');
    const n = s.stars.findIndex((p) => norm(p) === norm(beta)) + 1;
    check(n >= 1 && n <= 9, `set up: beta is starred, number ${n}`);
    await key('!@#$%^&*('[n - 1], 'Digit' + n, 48 + n, CTRL | SHIFT);
    await drv.settle('star');
    await waitFor(`(currentFolderPath || '').toLowerCase().endsWith('beta')`);
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
    // What became of the keys behind each failed check, asked of the page before it closes.
    if (drv) for (const [i, keys] of keysOf) failures[i] += ` [${(await Promise.all(keys.map(drv.keyFate))).join('; ')}]`;
    if (drv) await drv.close();
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
