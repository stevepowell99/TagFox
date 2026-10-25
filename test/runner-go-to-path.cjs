// Runner has no address bar, so a path in the box goes there. A pasted folder path opens that folder and
// empties the box; a pasted file path opens the file's folder with the file selected; a quoted path (Explorer's
// "Copy as path") works the same. A typed path waits for Enter, so the search still runs as it is typed. A path
// that does not exist, pasted or typed and entered, stays an ordinary search: the box keeps the text, the
// folder is unchanged, and the text is what was sent to Everything. A folder lists only its newest rows, so an
// old file in a folder past that cap is found by putting its name in the box.
//
// The paste is the box's own paste input (InputEvent insertFromPaste, which Runner's Ctrl+V sends after reading
// the clipboard), so the test never writes the system clipboard.
//
// Run: node test/runner-go-to-path.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

const BIG_COUNT = 330;

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-go-to-path-' + process.pid);
  const start = path.join(root, 'start here');
  const target = path.join(root, 'target folder');
  const file = path.join(target, 'pick me.txt');
  const missing = path.join(root, 'no such folder');
  fs.mkdirSync(start, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  for (let i = 1; i <= 8; i++) fs.writeFileSync(path.join(target, `aaa padding ${i}.txt`), 'x');
  fs.writeFileSync(file, 'pick me');
  fs.writeFileSync(path.join(start, 'start note.txt'), 'x');
  /* More files than Runner ranks for a folder (RUNNER_RANK.fetchCap, 300), the one to find the oldest. */
  const big = path.join(root, 'big folder');
  fs.mkdirSync(big, { recursive: true });
  for (let i = 1; i <= BIG_COUNT; i++) fs.writeFileSync(path.join(big, `filler ${String(i).padStart(3, '0')}.txt`), 'x');
  const oldFile = path.join(big, 'ancient minutes.txt');
  fs.writeFileSync(oldFile, 'old');
  const longAgo = new Date('2019-03-01T12:00:00Z');
  fs.utimesSync(oldFile, longAgo, longAgo);

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-go-to-path', scope: start });
    console.log('Hook ready.');
    await drv.settle('startup');

    const R = () => drv.T('runnerState');
    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(150);
    };
    const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
    /* Back to the start folder with an empty box. */
    const reset = async () => {
      await drv.T('setQuery', '');
      await drv.T('configure', { rootFolder: start });
      await drv.T('runSearchNow', 'identity');
      await drv.settle('reset');
    };
    const paste = async (text) => {
      await drv.ev(`(() => {
        const q = document.getElementById('query');
        q.focus();
        q.select();
        q.setRangeText(${JSON.stringify(text)}, q.selectionStart, q.selectionEnd, 'end');
        q.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
        return 1;
      })()`);
      await sleep(400);
      await drv.settle('paste');
    };
    const typeIn = async (text) => {
      await drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.select(); return 1; })()`);
      await drv.send('Input.insertText', { text });
      await sleep(400);
      await drv.settle('typed');
    };

    // A pasted folder path: into that folder, box emptied.
    await reset();
    await paste(target);
    let s = await R();
    check(same(s.scope, target) && s.query === '', `a pasted folder path opens that folder and empties the box (folder "${s.scope}", box "${s.query}")`);

    // A pasted file path: its folder, with the file selected.
    await reset();
    await paste(file);
    s = await R();
    check(same(s.scope, target) && s.query === '' && same(s.selected, file), `a pasted file path opens its folder with the file selected (folder "${s.scope}", selected "${s.selected}")`);

    // A folder lists only its newest rows, so an old file in a big folder is found by its name instead.
    await reset();
    await paste(oldFile);
    s = await R();
    const bigListed = s.rows.length;
    check(same(s.scope, big) && same(s.selected, oldFile) && s.query === path.basename(oldFile), `an old file in a folder of ${BIG_COUNT} files is selected, its name in the box (folder "${path.basename(s.scope)}", box "${s.query}", selected "${path.basename(s.selected)}", ${bigListed} rows)`);

    // Explorer's "Copy as path" puts quotes round it.
    await reset();
    await paste('"' + target + '"');
    s = await R();
    check(same(s.scope, target) && s.query === '', `a quoted path works the same (folder "${s.scope}", box "${s.query}")`);

    // A path that does not exist stays an ordinary search.
    await reset();
    await paste(missing);
    s = await R();
    check(same(s.scope, start) && s.query === missing && String(s.sent).includes('no such folder'), `a pasted path that does not exist searches for it as text (folder "${path.basename(s.scope)}", box "${s.query}", sent "${String(s.sent).slice(0, 90)}")`);

    // Typed: nothing happens until Enter, so the search runs as it is typed.
    await reset();
    await typeIn(target);
    s = await R();
    check(same(s.scope, start) && s.query === target, `a typed folder path is searched for as typed, without going there (folder "${path.basename(s.scope)}", box "${s.query}")`);
    await key('Enter', 'Enter', 13, 0, '\r');
    await sleep(400);
    await drv.settle('enter');
    s = await R();
    check(same(s.scope, target) && s.query === '', `and Enter goes there (folder "${s.scope}", box "${s.query}")`);

    // Typed and entered, a path that does not exist stays the search it was.
    await reset();
    await typeIn(missing);
    await key('Enter', 'Enter', 13, 0, '\r');
    await sleep(400);
    await drv.settle('enter missing');
    s = await R();
    check(same(s.scope, start) && s.query === missing, `Enter on a typed path that does not exist leaves the folder and the text alone (folder "${path.basename(s.scope)}", box "${s.query}")`);

    // Text that is not a path at all is untouched by a paste.
    await reset();
    await paste('start note');
    s = await R();
    check(same(s.scope, start) && s.query === 'start note' && s.rows.some((r) => /start note\.txt$/i.test(r)), `pasted ordinary text searches as before (box "${s.query}", ${s.rows.length} rows)`);
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
  finished = true;
  if (failures.length) {
    console.log(`\nrunner-go-to-path: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-go-to-path: all checks passed');
}

/* A CDP call whose answer never comes leaves nothing pending, and Node then exits with code 0 mid-test,
   which run-all would count as a pass. */
let finished = false;
process.on('beforeExit', () => {
  if (finished) return;
  console.log('\nrunner-go-to-path: stopped part way, a page call never returned');
  process.exit(1);
});

main();
