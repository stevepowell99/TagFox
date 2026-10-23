// Runner's keys and what they show, driven with real key and mouse events over CDP:
//   - a setting that differs from Runner's defaults shows as a chip under the box, and its x (or Reset all)
//     puts the default back; with the defaults there are no chips;
//   - checkboxes come back once two or more rows are checked (Shift+Down), and Esc drops them again;
//   - Enter straight after typing, inside the search's wait, acts on the new search's top row, not on the
//     row that was selected before;
//   - typing with the focus off the box goes into the box instead of firing Classic's letter shortcuts;
//   - a held Backspace that runs past the text keeps the folder, while a fresh press drops it;
//   - Ctrl+L lists recent folders under the box and Enter goes to the one typed;
//   - Ctrl held alone numbers the rows on screen and Ctrl+2 opens the second;
//   - PageDown, Ctrl+End and Ctrl+Home move by a page, to the end and back;
//   - Tab and Shift+Tab move between the box and the list, as in Everything, and Space in the list toggles
//     the row's check; Right and Left still go into a folder and back;
//   - Alt+P hides and shows the Viewer; ? in an empty box opens Help at Runner's keys, drawn from the table;
//   - Alt+Home clears the text, the folder and every filter;
//   - Ctrl+M sorts by date and again back to smart; Ctrl+Tab says tabs are Classic's;
//   - F1 opens Help on Runner's own tab;
//   - an AppData file ranks below an equally named file elsewhere;
//   - Esc steps through the selection, the text and the folder, then hides TagFox.
//
// Run: node test/runner-keys.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const tag = 'rk' + process.pid;
  const root = path.join(APP_DIR, '_tmp', 'runner-keys-' + process.pid);
  const many = path.join(root, 'many');
  const race = path.join(root, 'racefolder' + tag);
  const alpha = path.join(root, 'alphadir');
  fs.mkdirSync(alpha, { recursive: true });
  fs.mkdirSync(race, { recursive: true });
  for (let i = 1; i <= 40; i++) fs.mkdirSync(path.join(many, 'n' + String(i).padStart(2, '0')), { recursive: true });
  fs.writeFileSync(path.join(root, 'zeta.txt'), 'zeta\n');
  // Same words in both names; the AppData one is the exact name, so only the penalty puts it second.
  const appDir = path.join(process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'), 'TagFoxTest-' + process.pid);
  fs.mkdirSync(appDir, { recursive: true });
  const appFile = path.join(appDir, 'apdx' + tag + '.txt');
  const plainFile = path.join(root, 'apdx' + tag + ' notes.txt');
  fs.writeFileSync(appFile, 'app\n');
  fs.writeFileSync(plainFile, 'plain\n');

  let drv;
  try {
    drv = await connect({ port: 9317, profile: 'tagfox-test-runner-keys', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const key = async (k, code, vk, mods = 0, text, extra = {}) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text, ...extra });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(120);
    };
    const letter = (ch, mods = 0) => key(ch, 'Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0), mods, mods ? undefined : ch);
    const R = () => drv.T('runnerState');
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const focusBox = () => drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); return 1; })()`);
    const click = async (selector) => {
      const c = await drv.ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!c) return false;
      await drv.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      await drv.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      await sleep(150);
      return true;
    };
    const go = async (folder, query = '') => {
      await drv.T('configure', { rootFolder: folder });
      await drv.T('setQuery', query);
      await drv.T('runSearchNow', 'identity');
      await drv.settle('go ' + path.basename(folder) + ' ' + query);
    };
    const waitRows = async (pred, label) => {
      for (let i = 0; i < 20; i++) {
        await drv.T('runSearchNow', 'identity');
        await drv.settle(label);
        const s = await R();
        if (pred(s)) return s;
        await sleep(400);
      }
      return R();
    };

    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    await drv.T('setRunnerMode', true);
    await drv.settle('runner on');
    await go(root);
    await waitRows((s) => s.rows.some((r) => norm(r) === norm(race)), 'indexed');

    // Filter chips.
    let s = await R();
    const chipsShown = () => drv.ev(`(() => { const w = document.getElementById('runnerFilterChips'); return w && !w.classList.contains('d-none') && w.getBoundingClientRect().height > 0 ? Array.from(w.querySelectorAll('.tagfox-runner-filter-chip')).map((c) => c.dataset.filterId) : []; })()`);
    check(!s.chips.length && !(await chipsShown()).length, `with the defaults there are no filter chips (${s.chips.join(', ')})`);
    await focusBox();
    await letter('m', 2); // Ctrl+M: sort by date
    await drv.settle('ctrl m');
    s = await R();
    check(s.sort === 'date' && (await chipsShown()).includes('sort'), `Ctrl+M sorts by date and a chip says so (sort ${s.sort})`);
    await letter('r', 2); // Ctrl+R: Classic's recency cycle, All to 1h
    await drv.settle('ctrl r');
    s = await R();
    const label = await drv.ev(`document.querySelector('#runnerFilterChips [data-filter-id="recency"]')?.textContent || ''`);
    check(s.recency === '1h' && /last hour/.test(label), `a recency filter shows as a chip ("${label}")`);
    await click('#runnerFilterChips [data-filter-id="recency"] .tagfox-runner-filter-chip-x');
    await drv.settle('chip x');
    s = await R();
    check(s.recency === 'all' && !s.chips.includes('recency') && s.chips.includes('sort'), `a chip's x resets only that filter (${s.chips.join(', ')})`);
    await letter('r', 2);
    await drv.settle('ctrl r again');
    await click('#runnerFilterChips .tagfox-runner-filter-reset');
    await drv.settle('reset all');
    s = await R();
    check(!s.chips.length && s.sort === 'smart' && s.recency === 'all', `Reset all puts every default back (${s.chips.join(', ')})`);
    await focusBox();
    await letter('m', 2);
    await letter('m', 2);
    await drv.settle('ctrl m twice');
    check((await R()).sort === 'smart', 'Ctrl+M again goes back to the smart order');

    // Checkboxes once a multi-selection starts.
    const cbShown = () => drv.ev(`(() => { const td = document.querySelector('#tbody tr td.results-td-cb'); return !!td && getComputedStyle(td).display !== 'none' && td.getBoundingClientRect().width > 0; })()`);
    await focusBox();
    await key('ArrowDown', 'ArrowDown', 40);
    check(!(await cbShown()), 'one selected row shows no checkboxes');
    await key('ArrowDown', 'ArrowDown', 40, 8);
    await key('ArrowDown', 'ArrowDown', 40, 8);
    s = await R();
    check(s.checked >= 2 && (await cbShown()), `Shift+Down checks rows and the checkboxes appear (${s.checked} checked)`);
    await key('Escape', 'Escape', 27);
    s = await R();
    check(s.checked === 1 && s.escStep === 'checks' && !(await cbShown()), `Esc drops the multi-selection and the checkboxes (${s.checked} checked)`);

    // Enter inside the search's wait acts on the new search.
    for (let i = 0; i < 15; i++) {
      s = await R();
      if (norm(s.selected) === norm(alpha)) break;
      await key('ArrowDown', 'ArrowDown', 40);
    }
    check(norm((await R()).selected) === norm(alpha), 'set up: a different folder is selected first');
    await drv.send('Input.insertText', { text: 'racefolder' + tag });
    await key('Enter', 'Enter', 13, 0, '\r');
    await drv.settle('race enter');
    s = await R();
    check(norm(s.scope) === norm(race), `Enter straight after typing goes to the typed folder (scope ${path.basename(s.scope)})`);

    // Typing with the focus off the box.
    await go(root);
    await drv.ev(`document.getElementById('resultsWrap').focus(); 1`);
    await letter('t');
    await letter('z');
    s = await R();
    const modal = await drv.ev(`!!document.querySelector('.modal.show')`);
    check(s.query === 'tz' && s.focusInBox && !modal, `letters typed off the box go into it, not to Classic's shortcuts (box "${s.query}", dialog ${modal})`);

    // A held Backspace keeps the folder; a fresh press drops it.
    await go(alpha, 'ab');
    await focusBox();
    await key('Backspace', 'Backspace', 8);
    await key('Backspace', 'Backspace', 8, 0, undefined, { autoRepeat: true });
    await key('Backspace', 'Backspace', 8, 0, undefined, { autoRepeat: true });
    s = await R();
    check(s.query === '' && norm(s.scope) === norm(alpha), `a held Backspace stops at the empty box and keeps the folder (scope ${path.basename(s.scope)})`);
    await key('Backspace', 'Backspace', 8);
    await drv.settle('backspace fresh');
    check(!(await R()).scope, 'a fresh Backspace in the empty box drops the folder');

    // Ctrl+L: recent folders in the list under the box.
    await drv.ev(`localStorage.setItem('tagBrowserScopeFolderHist', ${JSON.stringify(JSON.stringify([alpha, many, root]))}); 1`);
    await go(root);
    await focusBox();
    await letter('l', 2);
    s = await R();
    const entries = await drv.ev(`Array.from(document.querySelectorAll('#runnerCmdList .tagfox-runner-cmd')).map((b) => b.textContent.trim())`);
    check(s.cmdListOpen && entries.length === 3, `Ctrl+L lists the recent folders under the box (${entries.length})`);
    await drv.send('Input.insertText', { text: 'many' });
    await sleep(150);
    await key('Enter', 'Enter', 13, 0, '\r');
    await drv.settle('ctrl l enter');
    s = await R();
    check(norm(s.scope) === norm(many) && !s.cmdListOpen && s.query === '', `typing filters them and Enter goes there (scope ${path.basename(s.scope)})`);

    // Ctrl held alone numbers the rows; Ctrl+2 opens the second (all folders here, so nothing launches).
    await waitRows((x) => x.rows.length >= 40, 'many');
    await focusBox();
    await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
    await sleep(700);
    const hints = await drv.ev(`Array.from(document.querySelectorAll('#tbody tr[data-runner-n]')).map((tr) => tr.dataset.rowPath)`);
    await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
    await sleep(100);
    const hintsAfter = await drv.ev(`document.querySelectorAll('#tbody tr[data-runner-n]').length`);
    check(hints.length === 9 && hintsAfter === 0, `holding Ctrl numbers nine rows and letting go clears them (${hints.length}, then ${hintsAfter})`);
    await key('2', 'Digit2', 50, 2);
    await drv.settle('ctrl 2');
    s = await R();
    check(hints[1] && norm(s.scope) === norm(hints[1]), `Ctrl+2 opens the second row (scope ${path.basename(s.scope)})`);

    // Page and edge keys.
    await go(many);
    await waitRows((x) => x.rows.length >= 40, 'many again');
    await focusBox();
    await key('PageDown', 'PageDown', 34);
    s = await R();
    const iPage = s.rows.findIndex((r) => norm(r) === norm(s.selected));
    check(iPage > 3, `PageDown moves by a page (row ${iPage})`);
    await key('End', 'End', 35, 2);
    s = await R();
    check(norm(s.selected) === norm(s.rows[s.rows.length - 1]), 'Ctrl+End selects the last row');
    await key('Home', 'Home', 36, 2);
    s = await R();
    check(norm(s.selected) === norm(s.rows[0]) && s.focusInBox, 'Ctrl+Home selects the first row, and the box keeps the focus');

    // Tab between the box and the list, as in Everything; Space in the list checks the row.
    const first = s.selected;
    await key('Tab', 'Tab', 9);
    s = await R();
    check(s.focusInList && norm(s.selected) === norm(first), 'Tab moves the focus to the list, keeping the selection');
    await key('ArrowDown', 'ArrowDown', 40);
    const before = (await R()).checked;
    await key(' ', 'Space', 32, 0, ' ');
    s = await R();
    check(s.focusInList && s.checked === before - 1 && s.query === '', `Space in the list unchecks the selected row (${before} then ${s.checked} checked, box "${s.query}")`);
    await key(' ', 'Space', 32, 0, ' ');
    check((await R()).checked === before, 'and checks it again');
    await key('Tab', 'Tab', 9, 8);
    s = await R();
    check(s.focusInBox, 'Shift+Tab goes back to the box');
    // Into a folder and back with the arrows still works from the box.
    await key('ArrowRight', 'ArrowRight', 39);
    await drv.settle('right');
    s = await R();
    const into = s.scope;
    await key('ArrowLeft', 'ArrowLeft', 37);
    await drv.settle('left');
    s = await R();
    check(norm(into) !== norm(many) && norm(s.scope) === norm(many), `Right goes into the folder and Left back up (${path.basename(into)})`);

    // Alt+P hides and shows the Viewer.
    const viewerShown = () => drv.ev(`getComputedStyle(document.getElementById('propsAside')).display !== 'none'`);
    check(await viewerShown(), 'set up: the Viewer is showing');
    await letter('p', 1);
    s = await R();
    check(s.viewerOff && !(await viewerShown()), 'Alt+P hides the Viewer');
    await letter('p', 1);
    s = await R();
    check(!s.viewerOff && (await viewerShown()), 'Alt+P again shows it');

    // ? in an empty box: Help at Runner's keys, drawn from the key table.
    await drv.T('setQuery', '');
    await focusBox();
    await key('?', 'Slash', 191, 8, '?');
    await sleep(500);
    const keysHelp = await drv.ev(`(() => { const t = document.getElementById('runnerKeysTable'); const tab = document.querySelector('#helpModalTabs .nav-link.active')?.dataset.helpTab; return { tab, rows: t ? t.querySelectorAll('tbody tr').length : 0, altP: !!t && /Alt\\+P/.test(t.textContent.replace(/\\s+/g, '')) }; })()`);
    check(keysHelp.tab === 'runner' && keysHelp.rows > 20 && keysHelp.altP, `? opens Help at Runner's keys (${JSON.stringify(keysHelp)})`);
    await drv.ev(`bootstrap.Modal.getInstance(document.getElementById('helpModal'))?.hide(); 1`);
    await sleep(500);

    // Classic-only keys are answered, not obeyed.
    const tabsBefore = s.tabs;
    await key('Tab', 'Tab', 9, 2);
    s = await R();
    check(s.tabs === tabsBefore && /Classic/.test(s.status), `Ctrl+Tab leaves tabs alone and says why ("${s.status.slice(0, 60)}")`);

    // Help opens on Runner's tab.
    await key('F1', 'F1', 112);
    await sleep(500);
    const helpTab = await drv.ev(`document.querySelector('#helpModalTabs .nav-link.active')?.dataset.helpTab || ''`);
    check(helpTab === 'runner', `F1 opens Help on the Runner tab (${helpTab})`);
    await drv.ev(`bootstrap.Modal.getInstance(document.getElementById('helpModal'))?.hide(); 1`);
    await sleep(500);

    // AppData ranks lower.
    await go('', 'apdx' + tag);
    s = await waitRows((x) => x.rows.some((r) => norm(r) === norm(appFile)) && x.rows.some((r) => norm(r) === norm(plainFile)), 'appdata');
    const iApp = s.rows.findIndex((r) => norm(r) === norm(appFile));
    const iPlain = s.rows.findIndex((r) => norm(r) === norm(plainFile));
    check(iApp >= 0 && iPlain >= 0 && iPlain < iApp, `an AppData file ranks below the same name elsewhere (plain ${iPlain}, AppData ${iApp})`);
    await go(appDir, 'apdx' + tag);
    s = await R();
    check(norm(s.rows[0]) === norm(appFile), 'inside an AppData folder nothing is pushed down');

    // Alt+Left and Alt+Right step through searches. History is shared with Classic, so a Classic entry brings
    // only its text and folder into Runner, never Classic's tree view.
    await drv.T('setRunnerMode', false);
    await drv.settle('classic for history');
    await drv.T('configure', { rootFolder: root });
    await drv.T('setQuery', 'classicword');
    await drv.ev(`(() => { const t = document.getElementById('optRvTree'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await drv.settle('classic tree');
    await drv.T('commitHistory');
    await drv.T('setRunnerMode', true);
    await drv.settle('runner for history');
    await go(alpha, 'runnerword');
    await drv.T('commitHistory');
    await focusBox();
    await key('ArrowLeft', 'ArrowLeft', 37, 1);
    await drv.settle('alt left');
    s = await R();
    check(s.query === 'classicword' && norm(s.scope) === norm(root) && s.layout === 'flat', `Alt+Left brings back a Classic search's text and folder, not its tree view (box "${s.query}", ${s.layout})`);
    await key('ArrowRight', 'ArrowRight', 39, 1);
    await drv.settle('alt right');
    s = await R();
    check(s.query === 'runnerword' && norm(s.scope) === norm(alpha), `Alt+Right goes forward again (box "${s.query}")`);

    // Alt+Home starts again: no text, no folder, no filters.
    await go(alpha, 'qq');
    await focusBox();
    await letter('m', 2);
    await drv.settle('sort for alt home');
    await key('Home', 'Home', 36, 1);
    await drv.settle('alt home');
    s = await R();
    check(s.query === '' && !s.scope && !s.chips.length && s.sort === 'smart', `Alt+Home clears the text, the folder and the filters (${s.chips.join(', ')})`);

    // Esc: text, folder, then hide.
    await go(alpha, 'qq');
    await focusBox();
    await key('Escape', 'Escape', 27);
    s = await R();
    check(s.escStep === 'text' && s.query === '' && norm(s.scope) === norm(alpha), 'Esc clears the text first');
    await key('Escape', 'Escape', 27);
    await drv.settle('esc folder');
    s = await R();
    check(s.escStep === 'folder' && !s.scope, 'then the folder');
    await key('Escape', 'Escape', 27);
    s = await R();
    check(s.escStep === 'hide', 'then hides TagFox');
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(appDir, { recursive: true, force: true });
    } catch (_) {}
  }
  if (failures.length) {
    console.log(`\nrunner-keys: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-keys: all checks passed');
}

main();
