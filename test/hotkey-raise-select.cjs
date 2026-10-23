// When the global toggle shortcut (Ctrl+Space by default) raises TagFox, the search box must hold the
// whole query as a selection, so typing replaces it and an arrow key steps out of it. Alt-tab and a click
// into the window fire the same window 'focus' event, and those must leave the caret where it was.
//
// main.js sends 'tagfox-hotkey-raised' after show + focus; the renderer half is onHotkeyRaised(), driven
// here through the test hook, and the window 'focus' event is dispatched by hand, because the OS-wide
// shortcut cannot be pressed from a test without raising the window and fighting Steve's running TagFox
// for the accelerator. The message and the focus event reach the renderer in either order, so both are
// covered, with document.hasFocus() pinned to true or false to pick the branch (a hidden test window
// reports false until its first input and true after, whatever the test asks for).
//
// Run: node test/hotkey-raise-select.cjs

const fs = require('fs');
const os = require('os');
const path = require('path');
const { connect, SCOPES, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label, extra) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
    if (!ok) failures.push(label + (extra ? ' — ' + extra : ''));
  };
  // A folder to arrow into, made for the test (the repo itself may not be indexed, as in a worktree).
  const root = path.join(os.tmpdir(), 'tagfox-hk-' + process.pid);
  const word = 'hkfolder' + process.pid;
  const folder = path.join(root, word);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'inside.txt'), 'x\n');
  let drv;
  try {
    drv = await connect({ port: 9362, profile: 'tagfox-test-hotkey-raise-select', scope: SCOPES.repo });
    const { ev, T, settle, send } = drv;
    await settle('startup');
    const key = async (k, code, vk, text) => {
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      await sleep(150);
    };
    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    const pinHasFocus = (on) => ev(`Object.defineProperty(document, 'hasFocus', { value: () => ${on ? 'true' : 'false'}, configurable: true }); 1`);
    const box = () =>
      ev(`(() => { const q = document.getElementById('query'); return { inBox: document.activeElement === q, start: q.selectionStart, end: q.selectionEnd, len: q.value.length, value: q.value, hasFocus: document.hasFocus() }; })()`);
    const whole = (b) => b.inBox && b.len > 0 && b.start === 0 && b.end === b.len;
    const caretAt = (b, n) => b.inBox && b.start === n && b.end === n;
    const desc = (b) => `focus ${b.inBox ? 'in box' : 'elsewhere'}, selection ${b.start}-${b.end} of ${b.len}`;
    /* Put the caret at n inside the query and take the focus off the box, as a hidden TagFox has it. */
    const parkCaret = (n) =>
      ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(${n}, ${n}); q.blur(); return 1; })()`);
    const windowFocusEvent = () => ev(`window.dispatchEvent(new Event('focus')); 1`);
    /* The focus handler acts in an animation frame; wait for the box to take the focus back. */
    const settleBox = async () => {
      for (let i = 0; i < 20; i++) {
        const b = await box();
        if (b.inBox) break;
        await sleep(100);
      }
      await sleep(150);
      return box();
    };
    let hadFocusAtMessage = null;
    const raiseMessageFirst = async (n = 3) => {
      await pinHasFocus(false);
      await parkCaret(n);
      // main's message, ahead of the focus event; note whether the window had the focus when it came
      hadFocusAtMessage = await ev(`(() => { const had = document.hasFocus(); window.__tagfoxTest.hotkeyRaised(); return had; })()`);
      await windowFocusEvent();
      return settleBox();
    };

    await T('setQuery', 'readme');
    await T('runSearchNow', 'identity');
    await settle('rows for readme');

    // Negative control: a plain window focus (alt-tab, a click into the window) keeps the caret.
    await pinHasFocus(false);
    await parkCaret(3);
    await windowFocusEvent();
    let b = await settleBox();
    check(caretAt(b, 3), 'a plain window focus returns to the box and keeps the caret where it was', desc(b));

    // Positive: the shortcut's message first, then the window focus.
    b = await raiseMessageFirst();
    check(hadFocusAtMessage === false, 'branch under test: the window had no focus when the message came');
    check(whole(b), 'hotkey raise, message before the focus event: the whole query is selected', desc(b));

    // One-shot: the next plain focus is not a raise.
    await parkCaret(2);
    await windowFocusEvent();
    b = await settleBox();
    check(caretAt(b, 2), 'the flag is spent: a later plain window focus keeps the caret', desc(b));

    // Positive: the focus event first and its frame already run, then the message.
    await pinHasFocus(true);
    await parkCaret(3);
    await windowFocusEvent();
    b = await settleBox();
    check(caretAt(b, 3) && b.hasFocus, 'focus event first: the box has the focus and the caret is where it was', desc(b));
    await T('hotkeyRaised');
    b = await box();
    check(whole(b), 'hotkey raise, message after the focus event: the whole query is selected', desc(b));

    // Positive: the focus event first, the message before its frame has run, so the frame must not undo it.
    await parkCaret(3);
    await ev(`window.dispatchEvent(new Event('focus')); window.__tagfoxTest.hotkeyRaised(); 1`);
    b = await settleBox();
    check(whole(b), 'hotkey raise, message between the focus event and its frame: still the whole query', desc(b));

    // A message with no focus event after it must not leave a standing order to select.
    await pinHasFocus(false);
    await parkCaret(4);
    await T('hotkeyRaised');
    await sleep(1800);
    await windowFocusEvent();
    b = await settleBox();
    check(caretAt(b, 4), 'a message that no focus event followed expires; a later plain focus keeps the caret', desc(b));

    // Type to replace: a real key, straight after a raise.
    b = await raiseMessageFirst();
    await key('x', 'KeyX', 88, 'x');
    b = await box();
    check(b.value === 'x', 'typing after a raise replaces the whole query', `box "${b.value}"`);

    // Arrow out of it, Classic: ArrowDown steps into the results list.
    await T('setQuery', 'readme');
    await T('runSearchNow', 'identity');
    await settle('rows again');
    b = await raiseMessageFirst();
    check(whole(b), 'Classic: selected again before arrowing', desc(b));
    await key('ArrowDown', 'ArrowDown', 40);
    const where = await ev(`(() => ({ inBox: document.activeElement.id === 'query', value: document.getElementById('query').value }))()`);
    check(!where.inBox && where.value === 'readme', 'Classic: ArrowDown leaves the selected query for the results list, text intact', JSON.stringify(where));

    // Runner uses the same raise and focus path. The box holds a folder's name inside the repo, so Right
    // would enter that folder and Left would go up: the first arrow after a raise must only collapse the
    // selection, and the second (the positive control) must do what it does in an ordinary box.
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const scope = () => ev(`document.getElementById('rootFolder').value`);
    // The index may take a moment to see the new folder, so search again until it is listed.
    const runnerFolderSearch = async () => {
      let st;
      for (let i = 0; i < 25; i++) {
        await T('configure', { rootFolder: root });
        await T('setQuery', word);
        await T('runSearchNow', 'identity');
        await settle('runner folder');
        st = await T('runnerState');
        if (st.rows.some((r) => norm(r) === norm(folder))) break;
        await sleep(400);
      }
      return st;
    };
    await T('setRunnerMode', true);
    await settle('runner on');
    const top = await runnerFolderSearch();
    check(top.rows.some((r) => norm(r) === norm(folder)), 'Runner: the folder is listed', JSON.stringify(top.rows.slice(0, 3)));
    b = await raiseMessageFirst();
    check(whole(b), 'Runner: the hotkey raise selects the whole query', desc(b));
    await key('ArrowRight', 'ArrowRight', 39);
    b = await box();
    check(caretAt(b, b.len) && b.value === word && norm(await scope()) === norm(root), 'Runner: Right collapses the selection to its end and does not enter the folder', desc(b) + `, folder "${await scope()}"`);
    await key('ArrowRight', 'ArrowRight', 39);
    await settle('right again');
    check(norm(await scope()) === norm(folder), 'Runner: Right again, with the caret at the end, enters the folder', `folder "${await scope()}"`);

    await runnerFolderSearch();
    b = await raiseMessageFirst();
    await key('ArrowLeft', 'ArrowLeft', 37);
    b = await box();
    check(caretAt(b, 0) && b.value === word && norm(await scope()) === norm(root), 'Runner: Left collapses the selection to its start and does not go up a folder', desc(b) + `, folder "${await scope()}"`);
    await key('ArrowLeft', 'ArrowLeft', 37);
    await settle('left again');
    check(norm(await scope()) !== norm(root), 'Runner: Left again, with the caret at the start, goes up a folder', `folder "${await scope()}"`);

    await runnerFolderSearch();
    b = await raiseMessageFirst();
    await key('x', 'KeyX', 88, 'x');
    b = await box();
    check(b.value === 'x', 'Runner: typing after a raise replaces the whole query', `box "${b.value}"`);

    await ev(`delete document.hasFocus; 1`);
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
    console.log(`\nhotkey-raise-select: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nhotkey-raise-select: all checks passed');
}

main();
