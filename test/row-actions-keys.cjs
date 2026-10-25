// The selected row's action buttons by keyboard in Runner, driven with real key events over CDP:
//   - typing selects the top row, so Tab has a row to work on;
//   - Tab from the box goes into the list, and Tab in the list puts the focus on the selected row's first
//     button and marks the row, and shows the strip, which otherwise shows only on hover, with the pointer
//     elsewhere;
//   - further Tabs step along the buttons and wrap; Shift+Tab steps back and wraps the other way;
//   - the status line names the focused button;
//   - Esc goes back to the list and closes the strip, without Runner's own Esc steps clearing the text;
//   - any other key (Down) leaves the strip and acts on the list;
//   - Space presses the focused button. The button pressed is "Open parent folder", whose effect is visible
//     and launches nothing: the scope moves to the row's folder. This is the half that matters, since a strip
//     that took the focus and pressed nothing would pass the rest;
//   - a refresh of the same list does not put back a check taken off a row by hand.
//
// Run: node test/row-actions-keys.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const tag = 'rak' + process.pid;
  const root = path.join(APP_DIR, '_tmp', 'row-actions-keys-' + process.pid);
  const sub = path.join(root, 'sub');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, tag + 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(sub, tag + 'b.txt'), 'b\n');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-row-actions-keys', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(120);
    };
    const tab = (shift) => key('Tab', 'Tab', 9, shift ? 8 : 0);
    const R = () => drv.T('runnerState');
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const focusBox = () => drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); return 1; })()`);
    // Where the focus is, relative to the selected row's strip.
    const strip = () =>
      drv.ev(`(() => {
        const a = document.activeElement;
        const tr = document.querySelector('#tbody tr.table-active');
        const btns = tr ? Array.from(tr.querySelectorAll('.results-td-actions-inner button')).filter((b) => !b.disabled) : [];
        const inner = tr && tr.querySelector('.results-td-actions-inner');
        return {
          index: btns.indexOf(a),
          count: btns.length,
          label: a && a.getAttribute ? a.getAttribute('aria-label') || '' : '',
          marked: document.querySelectorAll('#tbody tr.results-row-actions-kbd').length,
          shown: !!inner && getComputedStyle(inner).display !== 'none' && inner.getBoundingClientRect().width > 0,
          inWrap: a === document.getElementById('resultsWrap'),
        };
      })()`);
    const go = async () => {
      await drv.T('configure', { rootFolder: root });
      await drv.T('setQuery', tag);
      for (let i = 0; i < 20; i++) {
        await drv.T('runSearchNow');
        await drv.settle('go');
        if ((await R()).rows.length >= 2) return;
        await sleep(400);
      }
    };
    // Tab or Shift+Tab until the named button has the focus; false if a full lap never reaches it.
    const tabTo = async (label) => {
      for (let i = 0; i < 12; i++) {
        if ((await strip()).label === label) return true;
        await tab(false);
      }
      return false;
    };

    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    await drv.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }); // no row hovered

    await go();
    let s = await R();
    check(s.rows.length >= 2, `set up: two rows (${s.rows.length})`);
    check(norm(s.selected) === norm(s.rows[0]), `typing selects the top row (${path.basename(s.selected)})`);

    // Into the list, by Tab from the box.
    await focusBox();
    await tab(false);
    s = await R();
    const firstRow = s.selected;
    check(!!firstRow && !s.focusInBox, `set up: a row is selected and the focus has left the box (${path.basename(firstRow)})`);
    let st = await strip();
    check(st.index < 0 && st.marked === 0, 'set up: no button has the focus yet');

    await tab(false);
    st = await strip();
    check(st.index === 0 && st.marked === 1, `Tab in the list focuses the selected row's first button (${JSON.stringify(st)})`);
    check(st.shown, 'and the strip is on screen with the pointer elsewhere');
    s = await R();
    check(st.label && s.status.startsWith(st.label), `the status line names it ("${s.status.slice(0, 60)}")`);
    check(norm(s.selected) === norm(firstRow), 'the selection has not moved');

    await tab(false);
    check((await strip()).index === 1, 'Tab again moves to the second button');
    await tab(true);
    check((await strip()).index === 0, 'Shift+Tab steps back');
    await tab(true);
    st = await strip();
    check(st.index === st.count - 1 && st.count > 2, `Shift+Tab from the first wraps to the last (${st.index} of ${st.count})`);
    await tab(false);
    check((await strip()).index === 0, 'Tab from the last wraps to the first');

    // Esc: back to the list, strip closed, and nothing else.
    const before = await R();
    await key('Escape', 'Escape', 27);
    st = await strip();
    s = await R();
    check(st.inWrap && st.marked === 0 && st.index < 0, `Esc goes back to the list and closes the strip (${JSON.stringify(st)})`);
    check(!st.shown, 'and hides it again');
    check(s.query === before.query && norm(s.scope) === norm(before.scope), `Esc changes nothing else (box "${s.query}")`);

    // Any other key leaves the strip and acts on the list.
    await tab(false);
    await key('ArrowDown', 'ArrowDown', 40);
    st = await strip();
    s = await R();
    check(st.marked === 0 && st.index < 0, `Down leaves the strip (${JSON.stringify(st)})`);
    check(norm(s.selected) !== norm(firstRow) && s.rows.some((r) => norm(r) === norm(s.selected)), `and moves the selection (${path.basename(s.selected)})`);

    // Press a button: Open parent folder, which moves the scope to the row's folder.
    await tab(false);
    check(await tabTo('Open parent folder'), 'Tab reaches Open parent folder');
    await key(' ', 'Space', 32, 0, ' ');
    await drv.settle('pressed');
    s = await R();
    check(norm(s.scope) === norm(sub), `Space presses it: the scope is now the row's folder (${path.basename(s.scope)})`);

    // A refresh of the same list must not put back a check taken off by hand (auto-refresh runs every 5s).
    s = await R();
    check(norm(s.selected) === norm(s.rows[0]) && s.checked === 1, `the new folder's list selects its top row (${path.basename(s.selected)}, ${s.checked} checked)`);
    await drv.ev(`document.getElementById('resultsWrap').focus(); 1`);
    await key(' ', 'Space', 32, 0, ' ');
    s = await R();
    check(s.checked === 0, `set up: Space unchecks it (${s.checked} checked)`);
    await drv.T('runSearchNow');
    await drv.settle('refresh');
    s = await R();
    check(s.checked === 0, `a refresh of the same list leaves it unchecked (${s.checked} checked)`);
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
    console.log(`\nrow-actions-keys: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrow-actions-keys: all checks passed');
}

main();
