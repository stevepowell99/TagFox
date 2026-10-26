// Inside a folder, with the search box empty, the folder itself is the selection rather than its first row
// (folderItselfSelectable in renderer.js). Driven with real key events over CDP against folders made for the test:
//   - going into a folder selects no row, lights the box's folder chip, and the Viewer shows the folder and its
//     folder doc;
//   - ↓ selects the first row and puts out the chip; ↑ from the first row comes back to the folder, and ↑ again
//     stays there;
//   - typing selects the top match, which Enter would open;
//   - with the folder itself selected, Ctrl+Shift+C copies the folder's path, Del asks nothing and recycles
//     nothing (the folder and its rows are all still on disk), and Enter opens nothing and says how to reach a row;
//   - ← from a subfolder selects the subfolder you came up from, not the folder itself.
// The positive control for Del is the same key on a selected row, which does ask.
//
// Run: node test/runner-folder-itself.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-folder-itself-' + process.pid);
  const proj = path.join(root, 'proj folder');
  const sub = path.join(proj, 'sub folder');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(proj, '-readme.md'), '# Proj\n\nWhat this folder is for.\n');
  fs.writeFileSync(path.join(proj, 'alpha notes.txt'), 'a\n');
  fs.writeFileSync(path.join(proj, 'beta notes.txt'), 'b\n');
  fs.writeFileSync(path.join(sub, 'inner.txt'), 'i\n');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-folder-itself', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const { ev, T } = drv;
    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(200);
    };
    const R = () => T('runnerState');
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const view = () =>
      ev(`(() => ({
        chipLit: document.getElementById('runnerScopeChip').classList.contains('tagfox-runner-scope-chip--selected'),
        viewerName: (document.getElementById('propDisplayName')?.textContent || '').trim(),
        doc: (document.getElementById('readmePreview')?.textContent || '').includes('What this folder is for'),
        modal: document.querySelector('.modal.show')?.id || '',
        chipShape: (() => {
          const c = document.getElementById('runnerScopeChip');
          return { radius: parseFloat(getComputedStyle(c).borderTopLeftRadius), gap: Math.round(c.getBoundingClientRect().left - c.previousElementSibling.getBoundingClientRect().right) };
        })(),
      }))()`);
    const waitFor = async (fn, ms = 6000) => {
      for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
        if (await fn()) return true;
        await sleep(200);
      }
      return false;
    };
    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    await T('configure', { rootFolder: proj });
    await T('setQuery', '');
    for (let i = 0; i < 20; i++) {
      await T('runSearchNow');
      await drv.settle('into proj');
      const listed = (await R()).rows.map((r) => path.basename(r).toLowerCase());
      if (['alpha notes.txt', 'beta notes.txt', 'sub folder'].every((n) => listed.includes(n))) break;
      await sleep(400);
    }
    await ev(`(document.getElementById('query').focus(), 1)`);
    let s = await R();
    check(s.rows.length >= 3, `set up: the folder lists its rows (${s.rows.length})`);
    await waitFor(async () => (await view()).doc);
    let v = await view();
    check(s.selected === '' && v.chipLit, `going into a folder selects no row and lights the folder chip (selected "${path.basename(s.selected)}", chip ${v.chipLit})`);
    check(v.chipShape.radius >= 10 && v.chipShape.gap >= 4, `the lit chip is a pill clear of the box's divider, not squared onto it by the input group (radius ${v.chipShape.radius}px, gap ${v.chipShape.gap}px)`);
    check(v.viewerName === 'proj folder' && v.doc,`the Viewer shows the folder and its folder doc ("${v.viewerName}", doc ${v.doc})`);

    await key('ArrowDown', 'ArrowDown', 40);
    s = await R();
    v = await view();
    check(norm(s.selected) === norm(s.rows[0]) && !v.chipLit, `↓ selects the first row and puts the chip out (${path.basename(s.selected)}, chip ${v.chipLit})`);
    await key('ArrowUp', 'ArrowUp', 38);
    s = await R();
    v = await view();
    check(s.selected === '' && v.chipLit, `↑ from the first row comes back to the folder (selected "${path.basename(s.selected)}", chip ${v.chipLit})`);
    await key('ArrowUp', 'ArrowUp', 38);
    s = await R();
    check(s.selected === '', `↑ again stays on the folder (selected "${path.basename(s.selected)}")`);

    // Ctrl+Shift+C copies the folder's path. The clipboard write is caught in the page, so Steve's clipboard is left alone.
    await ev(`(window.__copied = null, navigator.clipboard.writeText = async (t) => { window.__copied = t; }, 1)`);
    const copyPath = async () => {
      await ev(`(window.__copied = null, 1)`);
      await key('C', 'KeyC', 67, 2 | 8);
      await waitFor(async () => (await ev(`window.__copied`)) != null, 2000);
      return String((await ev(`window.__copied`)) || '');
    };
    let copied = await copyPath();
    check(norm(copied) === norm(proj), `Ctrl+Shift+C with the folder itself selected copies the folder's path ("${copied}")`);

    // Del and Enter on the folder itself.
    await key('Delete', 'Delete', 46);
    await sleep(600);
    v = await view();
    const onDisk = [proj, path.join(proj, 'alpha notes.txt'), path.join(proj, 'beta notes.txt'), sub].every((p) => fs.existsSync(p));
    check(!v.modal && onDisk, `Del with the folder itself selected asks nothing and recycles nothing (dialog "${v.modal}", all on disk ${onDisk})`);
    await key('Enter', 'Enter', 13, 0, '\r');
    await sleep(500);
    s = await R();
    check(norm(s.scope) === norm(proj) && /↓ chooses a row/.test(s.status), `Enter opens nothing and says how to reach a row ("${s.status.slice(0, 60)}")`);
    // On a row, Ctrl+Shift+C copies the row's path; and the positive control: Del on a selected row does ask.
    await key('ArrowDown', 'ArrowDown', 40);
    s = await R();
    copied = await copyPath();
    check(!!s.selected && norm(copied) === norm(s.selected), `and on a row copies the row's path ("${path.basename(copied)}")`);
    await key('Delete', 'Delete', 46);
    const asked = await waitFor(async () => !!(await view()).modal, 3000);
    check(asked, 'positive control: Del on a selected row does ask');
    if (asked) {
      await waitFor(async () => !(await ev(`bootstrap.Modal.getInstance(document.querySelector('.modal.show'))?._isTransitioning`)));
      await ev(`(document.querySelector('.modal.show [data-bs-dismiss="modal"]')?.click(), 1)`);
      await waitFor(async () => !(await view()).modal);
    }

    // Typing selects the top match.
    await ev(`(document.getElementById('query').focus(), 1)`);
    for (const ch of 'beta') await key(ch, 'Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0), 0, ch);
    await waitFor(async () => path.basename((await R()).selected).toLowerCase() === 'beta notes.txt');
    s = await R();
    v = await view();
    check(path.basename(s.selected).toLowerCase() === 'beta notes.txt' && !v.chipLit, `typing selects the top match (${path.basename(s.selected)}, chip ${v.chipLit})`);

    // ← from the subfolder selects the subfolder.
    await T('configure', { rootFolder: sub });
    await T('setQuery', '');
    await T('runSearchNow');
    await drv.settle('into sub');
    await ev(`(document.getElementById('query').focus(), 1)`);
    await key('ArrowLeft', 'ArrowLeft', 37);
    await waitFor(async () => norm((await R()).scope) === norm(proj) && norm((await R()).selected) === norm(sub));
    s = await R();
    v = await view();
    check(norm(s.scope) === norm(proj) && norm(s.selected) === norm(sub) && !v.chipLit, `← from the subfolder selects the subfolder, not the folder itself (${path.basename(s.selected || '-')}, chip ${v.chipLit})`);
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
    console.log(`\nrunner-folder-itself: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-folder-itself: all checks passed');
}

main();
