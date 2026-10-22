// The Runner layout: Settings "Toggle key opens: Runner" turns the same renderer into one large search box
// with a ranked flat list. This drives it with real key events over CDP and checks:
//   - an empty box lists only the current folder's own contents, and typing searches below it;
//   - a file created on disk appears (positive control: an empty list would pass the rest);
//   - Right on a folder makes it the current folder and clears the box; Left goes back up and
//     selects the folder it came from;
//   - the smart order puts name matches above rows that match only in the path;
//   - a leading -word excludes;
//   - / opens the command list, Enter runs the command, and the box gets its text back;
//   - Ctrl+D stars and unstars the selected row in the favourites list, where a starred file is a file chip;
//   - hovering a row shows its action buttons, anchored in the row;
//   - switching back to Classic restores Classic's own view settings.
//
// Run: node test/runner-layout.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, structuralProblems, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-test-' + process.pid);
  const alpha = path.join(root, 'alphafold');
  fs.mkdirSync(alpha, { recursive: true });
  fs.writeFileSync(path.join(root, 'alphafold-note.md'), '# note\n');
  fs.writeFileSync(path.join(alpha, 'inner.txt'), 'inner\n');
  fs.writeFileSync(path.join(root, 'zeta.txt'), 'zeta\n');
  let drv;
  try {
    drv = await connect({ port: 9316, profile: 'tagfox-test-runner', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const classicLayout = await drv.ev(`document.querySelector('input[name="rvViewMode"]:checked')?.value`);

    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(120);
    };
    const R = () => drv.T('runnerState');
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const has = (rows, p) => rows.some((r) => norm(r) === norm(p));
    const focusBox = () => drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); return document.activeElement === q; })()`);
    // Everything indexes new files within a second or so; wait for a row rather than a fixed sleep.
    const waitForRow = async (p, label) => {
      for (let i = 0; i < 20; i++) {
        await drv.T('runSearchNow', 'identity');
        await drv.settle(label);
        if (has((await R()).rows, p)) return true;
        await sleep(400);
      }
      return false;
    };

    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    await drv.T('setRunnerMode', true);
    await drv.settle('runner on');
    let s = await R();
    check(s.on && s.bodyClass && s.layout === 'flat', `Runner is on with a flat list (layout ${s.layout})`);
    // Runner keeps its own search state, so its current folder is set here rather than inherited from Classic.
    await drv.T('configure', { rootFolder: root });

    // Empty box: the folder's own contents only.
    check(await waitForRow(path.join(root, 'alphafold-note.md'), 'browse'), 'empty box lists the current folder');
    s = await R();
    if (process.env.RUNNER_DEBUG) console.log('    browse:', JSON.stringify({ scope: s.scope, subs: s.subfolders, rows: s.rows }));
    check(!s.subfolders && !has(s.rows, path.join(alpha, 'inner.txt')), 'empty box does not list subfolder contents');

    // Positive control: a file created now must appear.
    const fresh = path.join(root, 'fresh-' + Date.now() + '.txt');
    fs.writeFileSync(fresh, 'fresh\n');
    check(await waitForRow(fresh, 'fresh'), 'a file created on disk appears');

    // Typing searches below the folder.
    await focusBox();
    await drv.T('setQuery', 'inner');
    await drv.settle('typed');
    s = await R();
    check(s.subfolders && has(s.rows, path.join(alpha, 'inner.txt')), 'typing searches subfolders too');

    // Name matches above path-only matches.
    await drv.T('setQuery', 'alphafold');
    await drv.settle('alphafold');
    s = await R();
    const iInner = s.rows.findIndex((r) => norm(r) === norm(path.join(alpha, 'inner.txt')));
    const iNote = s.rows.findIndex((r) => norm(r) === norm(path.join(root, 'alphafold-note.md')));
    const iFold = s.rows.findIndex((r) => norm(r) === norm(alpha));
    check(iInner > iNote && iInner > iFold && iNote >= 0 && iFold >= 0, `name matches rank above a path-only match (folder ${iFold}, note ${iNote}, inner ${iInner})`);
    check(norm(s.selected) === norm(s.rows[0]), 'the top row is selected after typing');

    // Exclusion.
    await drv.T('setQuery', 'alphafold -note');
    await drv.settle('exclude');
    s = await R();
    check(!has(s.rows, path.join(root, 'alphafold-note.md')) && has(s.rows, alpha), 'a leading -word excludes');

    // Right into the selected folder: select it by arrowing from the box.
    await drv.T('setQuery', '');
    await drv.settle('cleared');
    await focusBox();
    for (let i = 0; i < 12; i++) {
      s = await R();
      if (norm(s.selected) === norm(alpha)) break;
      await key('ArrowDown', 'ArrowDown', 40);
    }
    s = await R();
    check(norm(s.selected) === norm(alpha) && s.focusInBox, 'Down in the box moves the selection and keeps focus in the box');
    await key('ArrowRight', 'ArrowRight', 39);
    await drv.settle('right');
    s = await R();
    check(norm(s.scope) === norm(alpha), `Right on a folder makes it the current folder (scope ${s.scope})`);
    check(s.query === '' && has(s.rows, path.join(alpha, 'inner.txt')), 'the box is empty and the folder shows its contents');

    await focusBox();
    await key('ArrowLeft', 'ArrowLeft', 37);
    await drv.settle('left');
    s = await R();
    check(norm(s.scope) === norm(root), `Left goes to the parent folder (scope ${s.scope})`);
    check(norm(s.selected) === norm(alpha), 'Left selects the folder it came from');

    // / commands.
    await drv.T('setQuery', 'zeta');
    await drv.settle('zeta');
    await drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(0, 0); return 1; })()`);
    await key('/', 'Slash', 191, 0, '/');
    s = await R();
    check(s.cmdListOpen && s.query === '/', 'typing / at the start opens the command list');
    for (const ch of 'newest') await key(ch, 'Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0), 0, ch);
    s = await R();
    if (process.env.RUNNER_DEBUG) console.log('    after typing:', JSON.stringify({ q: s.query, open: s.cmdListOpen, m: s.cmdMatches.slice(0, 3) }));
    check(s.cmdMatches[0] === 'sort-date', `the list filters as you type (first: ${s.cmdMatches[0]})`);
    await key('Enter', 'Enter', 13, 0, '\r');
    await drv.settle('cmd');
    s = await R();
    check(!s.cmdListOpen && s.sort === 'date' && s.query === 'zeta', `Enter runs it and the box gets its text back (sort ${s.sort}, box "${s.query}")`);
    await drv.T('setRunnerSort', 'smart');
    await drv.settle('smart again');

    // Stars.
    await focusBox();
    const sel = (await R()).selected;
    await key('d', 'KeyD', 68, 2);
    s = await R();
    check(s.stars.some((p) => norm(p) === norm(sel)), 'Ctrl+D stars the selected row in the favourites list');
    const starOn = await drv.ev(`!!document.querySelector('#tbody tr.table-active .results-row-star--on')`);
    check(starOn, 'the starred row shows a filled star');
    // One favourites list: Classic's favourites column shows a starred file as a file chip, not a folder.
    let chip = null;
    for (let i = 0; i < 10 && !chip; i++) {
      await sleep(150);
      chip = await drv.ev(`(() => { const g = Array.from(document.querySelectorAll('#favFoldersBar [aria-label]')).find((x) => x.getAttribute('aria-label').toLowerCase() === ${JSON.stringify('open starred file ' + String(sel).toLowerCase())}); return g ? g.getAttribute('aria-label') : null; })()`);
    }
    check(!!chip, `the favourites column lists the starred file as a file (${chip})`);
    await key('d', 'KeyD', 68, 2);
    s = await R();
    check(!s.stars.some((p) => norm(p) === norm(sel)), 'Ctrl+D again unstars it');

    // Hover: the row's buttons show, inside the row.
    const box = await drv.ev(`(() => { const tr = document.querySelector('#tbody tr'); const r = tr.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await drv.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await sleep(150);
    const hover = await drv.ev(`(() => {
      const tr = document.querySelector('#tbody tr');
      const inner = tr.querySelector('.results-td-actions-inner');
      const cs = getComputedStyle(inner);
      const a = inner.getBoundingClientRect();
      const t = tr.getBoundingClientRect();
      return { display: cs.display, insideRow: a.top >= t.top - 2 && a.bottom <= t.bottom + 2, buttons: inner.querySelectorAll('button').length };
    })()`);
    check(hover.display === 'flex' && hover.insideRow && hover.buttons > 3, `hovering a row shows its buttons in the row (${JSON.stringify(hover)})`);
    await drv.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });

    const probs = structuralProblems(await drv.state());
    check(!probs.length, 'structural invariants hold in Runner' + (probs.length ? ': ' + probs.join('; ') : ''));

    // Back to Classic.
    await drv.T('setRunnerMode', false);
    await drv.settle('classic');
    s = await R();
    const layout = await drv.ev(`document.querySelector('input[name="rvViewMode"]:checked')?.value`);
    check(!s.on && !s.bodyClass && layout === classicLayout, `Classic is back with its own view (${layout}, was ${classicLayout})`);
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
    console.log(`\nrunner-layout: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-layout: all checks passed');
}

main();
