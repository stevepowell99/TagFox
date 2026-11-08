// Del and Shift+Del act on the row under the pointer, as that row's trash button does, and Ctrl+O opens the
// selected markdown file in Obsidian only from inside a vault. Driven with real key and mouse events over CDP,
// against a folder made for the test:
//   - with one row selected and the pointer on another, Del asks about the row under the pointer;
//   - Shift+Del asks with the "for good" wording and no "don't ask again", and confirming it removes the file
//     from disk;
//   - with text in the search box and the pointer off the list, Del asks nothing, since it is the box's key;
//     the positive control is the same key with the pointer on a row, which does ask;
//   - Ctrl+O on a file outside every vault opens nothing and says why.
//
// Run: node test/delete-key-hover.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'delete-key-hover-' + process.pid);
  fs.mkdirSync(root, { recursive: true });
  const names = ['alpha notes.txt', 'beta notes.txt', 'gamma notes.txt'];
  for (const n of names) fs.writeFileSync(path.join(root, n), n + '\n');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-delete-key-hover', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const { ev, T } = drv;
    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(200);
    };
    const move = async (x, y) => {
      await drv.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await sleep(150);
    };
    const R = () => T('runnerState');
    const base = (p) => path.basename(String(p || '')).toLowerCase();
    const waitFor = async (fn, ms = 6000) => {
      for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
        if (await fn()) return true;
        await sleep(200);
      }
      return false;
    };
    const modal = () =>
      ev(`(() => ({
        open: !!document.querySelector('.modal.show'),
        msg: document.getElementById('recycleConfirmMsg')?.textContent || '',
        alwaysHidden: document.getElementById('btnRecycleConfirmAlways')?.classList.contains('d-none') || false,
        ok: (document.getElementById('btnRecycleConfirmOk')?.textContent || '').trim(),
      }))()`);
    const settleModal = () => waitFor(async () => !(await ev(`bootstrap.Modal.getInstance(document.querySelector('.modal.show'))?._isTransitioning`)));
    const dismiss = async () => {
      await settleModal();
      await ev(`(document.querySelector('.modal.show [data-bs-dismiss="modal"]')?.click(), 1)`);
      await waitFor(async () => !(await modal()).open);
    };
    /** Centre of the row for `name`, in the page's own pixels. */
    const rowCentre = (name) =>
      ev(`(() => {
        const tr = [...document.querySelectorAll('#resultsTable tbody tr[data-row-path]')].find((r) => r.dataset.rowPath.toLowerCase().endsWith(${JSON.stringify('\\' + name)}));
        if (!tr) return null;
        const r = tr.querySelector('td:nth-child(2)')?.getBoundingClientRect() || tr.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);

    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    await T('configure', { rootFolder: root });
    await T('setQuery', '');
    for (let i = 0; i < 20; i++) {
      await T('runSearchNow');
      await drv.settle('into root');
      const listed = (await R()).rows.map(base);
      if (names.every((n) => listed.includes(n))) break;
      await sleep(400);
    }
    let s = await R();
    check(names.every((n) => s.rows.map(base).includes(n)), `set up: the folder lists its three files (${s.rows.map(base).join(', ')})`);

    // One row selected, the pointer on another: Del asks about the one under the pointer.
    await ev(`(document.getElementById('query').focus(), 1)`);
    await key('ArrowDown', 'ArrowDown', 40);
    s = await R();
    const selected = base(s.selected);
    const other = names.find((n) => n !== selected);
    const at = await rowCentre(other);
    check(!!selected && !!at, `set up: "${selected}" is selected and "${other}" is on screen`);
    if (at) await move(at.x, at.y);
    await key('Delete', 'Delete', 46);
    let asked = await waitFor(async () => (await modal()).open, 3000);
    let m = await modal();
    check(asked && m.msg.toLowerCase().includes(other) && !m.msg.toLowerCase().includes(selected), `Del asks about the row under the pointer, not the selected one ("${m.msg.split('\n').slice(-1)[0]}")`);
    check(!m.alwaysHidden && m.ok === 'Delete', `Del's dialog is the Recycle Bin one, with "don't ask again" (button "${m.ok}")`);
    if (asked) await dismiss();
    check(names.every((n) => fs.existsSync(path.join(root, n))), 'cancelling Del leaves every file on disk');

    // Shift+Del on the same row: the for-good dialog, and confirming it removes the file.
    if (at) await move(at.x, at.y);
    await key('Delete', 'Delete', 46, 8);
    asked = await waitFor(async () => (await modal()).open, 3000);
    m = await modal();
    check(asked && /for good/i.test(m.msg) && /cannot be undone/i.test(m.msg) && m.msg.toLowerCase().includes(other), `Shift+Del asks with the for-good wording about the row under the pointer ("${m.msg.split('\n')[0]}")`);
    check(m.alwaysHidden && m.ok === 'Delete for good', `Shift+Del's dialog offers no "don't ask again" and says "Delete for good" (button "${m.ok}")`);
    if (asked) {
      await settleModal();
      await ev(`(document.getElementById('btnRecycleConfirmOk').click(), 1)`);
      const gone = await waitFor(async () => !fs.existsSync(path.join(root, other)), 6000);
      check(gone, `confirming Shift+Del removes "${other}" from disk`);
    }
    check(fs.existsSync(path.join(root, selected)), `the selected row, "${selected}", is untouched`);
    await waitFor(async () => !(await modal()).open);

    // Text in the box and the pointer off the list: Del is the box's key and asks nothing.
    await move(5, 5);
    await ev(`(document.getElementById('query').focus(), 1)`);
    for (const ch of 'notes') await key(ch, 'Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0), 0, ch);
    await drv.settle('typed');
    await move(5, 5);
    await key('Delete', 'Delete', 46);
    await sleep(600);
    check(!(await modal()).open, 'with text in the box and the pointer off the list, Del asks nothing');
    // Positive control: the same key with the caret at the end and the pointer on a row does ask.
    const at2 = await rowCentre(selected);
    if (at2) await move(at2.x, at2.y);
    await key('Delete', 'Delete', 46);
    asked = await waitFor(async () => (await modal()).open, 3000);
    check(asked, 'positive control: with the caret at the end and the pointer on a row, Del from the box does ask');
    if (asked) await dismiss();

    // Ctrl+O outside every vault: nothing opens, and the status line says why.
    await move(5, 5);
    await key('ArrowDown', 'ArrowDown', 40, 2);
    await key('o', 'KeyO', 79, 2);
    const said = await waitFor(async () => /Not in an Obsidian vault/.test((await R()).status || ''), 3000);
    check(said, `Ctrl+O on a file outside every vault says so ("${String((await R()).status || '').slice(0, 70)}")`);
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) await drv.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
  if (failures.length) {
    console.log(`\ndelete-key-hover: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\ndelete-key-hover: all checks passed');
}

main();
