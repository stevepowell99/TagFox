// An empty Runner list says why, in one muted line where the rows would be: the folder, the text and every
// chip that narrowed it (read from RUNNER_FILTER_CHIPS, so the sort chip, which narrows nothing, is left out),
// and inside a folder that Enter searches everywhere. Enter then drops the folder and keeps the text, which
// finds a file outside it. With no folder and no chips the line only says nothing matches. The positive
// control comes first: a list with rows shows no line.
//
// Run: node test/runner-empty-list.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-empty-list-' + process.pid);
  const docs = path.join(root, 'docs');
  const elsewhere = path.join(root, 'elsewhere');
  const token = 'zebrafinch' + process.pid;
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(elsewhere, { recursive: true });
  fs.writeFileSync(path.join(docs, 'alpha report.txt'), 'x');
  fs.writeFileSync(path.join(elsewhere, token + ' notes.txt'), 'x');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-empty-list', scope: docs });
    console.log('Hook ready.');
    await drv.settle('startup');
    /* Runner starts from its own saved state, which has no folder. */
    await drv.T('configure', { rootFolder: docs });

    const R = () => drv.T('runnerState');
    const note = () =>
      drv.ev(`(() => { const el = document.getElementById('runnerEmptyNote'); return { shown: !!el && !el.classList.contains('d-none') && el.offsetHeight > 0, text: el ? el.textContent : '' }; })()`);
    const search = async (q) => {
      await drv.T('setQuery', q);
      await drv.T('runSearchNow', 'identity');
      await drv.settle('query ' + q);
      await sleep(300);
    };
    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(150);
    };

    // Positive control: rows, no line.
    await search('alpha');
    let s = await R();
    let n = await note();
    check(s.scope.toLowerCase() === docs.toLowerCase(), `set up: inside the docs folder ("${s.scope}")`);
    check(s.rows.length > 0 && !n.shown, `a list with rows shows no line (${s.rows.length} rows, line shown ${n.shown})`);

    // Text that finds nothing in the folder.
    await search(token);
    s = await R();
    n = await note();
    check(s.rows.length === 0 && n.shown, `an empty list shows a line ("${n.text}")`);
    check(n.text.includes('docs') && n.text.includes(token) && n.text.includes('Enter: search everywhere') && !n.text.includes('Filter'), 'it names the folder and the text, offers Enter, and lists no filter when none is on');

    // Chips: one that narrows is named, the sort chip is not.
    await drv.T('runCommand', 'folders');
    await drv.T('runCommand', 'sort-date');
    await drv.settle('chips');
    await search('alpha');
    s = await R();
    n = await note();
    check(s.chips.includes('content') && s.chips.includes('sort') && s.rows.length === 0 && n.shown, `Folders only empties the list (chips ${s.chips.join(', ')})`);
    check(n.shown && n.text.includes('alpha') && n.text.includes('Filter on: Folders only') && !n.text.includes('Sorted by date'), `the line names Folders only and leaves the sort out ("${n.text}")`);
    await drv.T('runCommand', 'folders');
    await drv.T('runCommand', 'sort-smart');
    await drv.settle('chips off');

    // Enter in the box drops the folder and keeps the text.
    await search(token);
    await drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); return 1; })()`);
    await key('Enter', 'Enter', 13, 0, '\r');
    await sleep(400);
    await drv.settle('enter');
    await sleep(300);
    s = await R();
    n = await note();
    check(s.scope === '' && s.query === token && s.rows.some((r) => r.toLowerCase().includes(token)) && !n.shown, `Enter searches everywhere for the same text and finds the file outside the folder (folder "${s.scope}", box "${s.query}", ${s.rows.length} rows, line shown ${n.shown})`);

    // No folder and no chips: it only says nothing matches.
    await search('qqzzy' + process.pid + 'nothing');
    s = await R();
    n = await note();
    check(s.scope === '' && s.chips.length === 0 && n.shown && n.text === `Nothing matches ‘qqzzy${process.pid}nothing’`, `with no folder and no chips it says nothing matches ("${n.text}")`);
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
    console.log(`\nrunner-empty-list: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-empty-list: all checks passed');
}

/* A CDP call whose answer never comes leaves nothing pending, and Node then exits with code 0 mid-test,
   which run-all would count as a pass. */
let finished = false;
process.on('beforeExit', () => {
  if (finished) return;
  console.log('\nrunner-empty-list: stopped part way, a page call never returned');
  process.exit(1);
});

main();
