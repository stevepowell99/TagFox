// Runner's tags, by real key and mouse events against files made for the test: the / list and the options
// panel switch on Classic's tag filter, which drops an untagged file and keeps a tagged one (a file named
// "todo list" must go, so the filter cannot pass by searching for the word) and shows as a chip whose x
// removes it; /not claude and a right-click on a tag's button in the panel leave a tag out, which with an
// empty box thins the folder's own list instead of listing everything below it, and the chip names wanted
// tags first ("Tagged TODO and not CLAUDE"); Ctrl+T opens Classic's tag editor on the selected row, adding a tag renames the file on disk
// and removing it renames it back; Ctrl+T on two checked rows tags both; Down from a selected box leaves
// the caret at the end, so typing adds to the query; and inside a deep folder its path is one line of tiny
// names above the box, whose leading names give way to "…" in a narrow window, and a click on a name goes
// there the way Left does.
//
// Run: node test/runner-tags.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-tags-' + process.pid);
  const deepNames = ['first folder level', 'second folder level', 'third folder level', 'fourth folder level', 'fifth folder level'];
  const deep = path.join(root, ...deepNames);
  fs.mkdirSync(deep, { recursive: true });
  const files = ['alpha xkTODO.md', 'beta.txt', 'gamma xpCLAUDE.txt', 'todo list.txt', 'delta.txt'];
  for (const f of files) fs.writeFileSync(path.join(root, f), 'x\n');
  const onDisk = (name) => fs.existsSync(path.join(root, name));
  const waitOnDisk = async (names, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (names.every(onDisk)) return true;
      await sleep(100);
    }
    return false;
  };

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-tags', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(150);
    };
    const type = async (s) => {
      await drv.send('Input.insertText', { text: s });
      await sleep(150);
    };
    const click = async (selector) => {
      const c = await drv.ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!c) return false;
      await drv.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      await drv.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      await sleep(200);
      return true;
    };
    const R = () => drv.T('runnerState');
    const focusBox = () => drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); return 1; })()`);
    const names = async (q) => {
      await drv.T('setQuery', q);
      await drv.T('runSearchNow');
      await drv.settle('query ' + q);
      return (await R()).rows.map((r) => path.basename(r));
    };
    const shown = async () => (await R()).rows.map((r) => path.basename(r));
    const modal = () =>
      drv.ev(`(() => { const m = document.getElementById('tagModal'); return { shown: m.classList.contains('show'), path: document.getElementById('tagModalPath')?.textContent || '', chips: [...document.querySelectorAll('#tagModalChips .badge')].map((b) => b.textContent.trim()) }; })()`);
    const waitModal = async (want) => {
      for (let i = 0; i < 30; i++) {
        if ((await modal()).shown === want) return true;
        await sleep(100);
      }
      return false;
    };
    /* The editor's input carries a datalist, whose popup leaves CDP's insertText waiting for good, so the
       text is set directly and Enter is a real key. */
    const tagInput = async (text) => {
      await drv.ev(`(() => { const i = document.getElementById('tagModalInput'); i.focus(); i.value = ${JSON.stringify(text)}; return 1; })()`);
      await key('Enter', 'Enter', 13, 0, '\r');
    };
    /* The editor ignores Esc while a rename is still refreshing the list. */
    const closeModal = async () => {
      for (let i = 0; i < 50; i++) {
        if (!(await drv.ev(`document.getElementById('tagModal').classList.contains('tag-renaming')`))) break;
        await sleep(100);
      }
      await key('Escape', 'Escape', 27);
      /* Bootstrap ignores a hide while the dialog is still fading in or out; then ask it again directly. */
      if (!(await waitModal(false))) {
        await drv.ev(`bootstrap.Modal.getInstance(document.getElementById('tagModal'))?.hide(); 1`);
        await waitModal(false);
      }
      await sleep(400);
    };

    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    await drv.T('configure', { rootFolder: root });
    // Everything indexes new files within a second or so; wait until it lists them all.
    let all = [];
    for (let i = 0; i < 25; i++) {
      all = await names('');
      if (files.every((f) => all.includes(f))) break;
      await sleep(400);
    }
    check(files.every((f) => all.includes(f)), `the test files are listed (${all.join(', ')})`);

    // Searching by tag, from the / list: the filter is Classic's tag filter, not a search for the word.
    await focusBox();
    await key('/', 'Slash', 191, 0, '/');
    await type('tagged todo');
    let s = await R();
    check(s.cmdListOpen && s.cmdMatches[0] === 'tag-todo', `/tagged todo offers the TODO tag filter first (${s.cmdMatches.slice(0, 3).join(', ')})`);
    await key('Enter', 'Enter', 13, 0, '\r');
    await drv.settle('tag filter on');
    let rows = await shown();
    s = await R();
    check(rows.includes('alpha xkTODO.md'), `the TODO filter keeps the tagged file (positive control): ${rows.join(', ')}`);
    check(!rows.includes('todo list.txt') && !rows.includes('beta.txt'), 'and drops the untagged ones, "todo list.txt" included');
    check(/regex:/.test(s.sent), 'the filter reaches Everything as a regex clause');
    const chip = await drv.ev(`document.querySelector('#runnerFilterChips [data-filter-id="tags"]')?.textContent || ''`);
    check(s.chips.includes('tags') && /Tagged TODO/.test(chip), `it shows as a chip ("${chip}")`);
    check(s.query === '', 'the box keeps its own text (empty)');
    const chipClicked = await click('#runnerFilterChips [data-filter-id="tags"] .tagfox-runner-filter-chip-x');
    await drv.settle('chip x');
    rows = await shown();
    s = await R();
    check(chipClicked && !s.chips.includes('tags') && rows.includes('todo list.txt') && rows.includes('beta.txt'), "the chip's x removes the filter and the untagged files come back");

    // The options panel draws the tag filters as small buttons; one click switches one on.
    await focusBox();
    await key('o', 'KeyO', 79, 1);
    const panelTags = await drv.ev(`[...document.querySelectorAll('#runnerOptsPanel .tagfox-runner-cmd-tags .tagfox-runner-cmd')].map((b) => b.textContent.trim())`);
    check(panelTags.includes('CLAUDE') && panelTags.includes('TODO'), `Alt+O lists the tag filters (${panelTags.join(' ')})`);
    await click('#runnerOptsPanel [data-cmd-id="tag-claude"]');
    await drv.settle('claude on');
    rows = await shown();
    const pillOn = await drv.ev(`!!document.querySelector('#runnerOptsPanel [data-cmd-id="tag-claude"].tagfox-runner-cmd--on')`);
    check(rows.length > 0 && rows.every((r) => /xpCLAUDE/.test(r)) && pillOn, `clicking CLAUDE in the panel filters to it and marks it on (${rows.join(', ')})`);
    await key('Escape', 'Escape', 27);
    const claudeWasOn = (await R()).chips.includes('tags');
    await drv.T('runCommand', 'tag-claude');
    await drv.settle('claude off');
    check(claudeWasOn && !(await R()).chips.includes('tags'), 'running the command again switches it off');

    // Leaving a tag out: /not claude from the box, and a right-click on a tag's button in the panel.
    await focusBox();
    await key('/', 'Slash', 191, 0, '/');
    await type('not claude');
    s = await R();
    check(s.cmdListOpen && s.cmdMatches[0] === 'not-claude', `/not claude offers "Not tagged CLAUDE" first (${s.cmdMatches.slice(0, 3).join(', ')})`);
    await key('Enter', 'Enter', 13, 0, '\r');
    await drv.settle('not claude on');
    rows = await shown();
    check(rows.includes('beta.txt') && rows.includes('alpha xkTODO.md'), `not CLAUDE keeps the other files (positive control): ${rows.join(', ')}`);
    check(!rows.includes('gamma xpCLAUDE.txt'), 'and drops the CLAUDE one');
    check(rows.includes(deepNames[0]) && !rows.includes(deepNames[1]),'with the box empty it thins the folder\'s own list rather than listing everything below it');
    const chipText = () => drv.ev(`document.querySelector('#runnerFilterChips [data-filter-id="tags"] > span')?.textContent.trim() || ''`);
    let ct = await chipText();
    check(/^Not tagged CLAUDE$/.test(ct), `the chip reads "Not tagged CLAUDE" ("${ct}")`);
    await drv.T('runCommand', 'tag-todo');
    await drv.settle('todo and not claude');
    ct = await chipText();
    rows = await shown();
    check(/^Tagged TODO and not CLAUDE$/.test(ct) && rows.length === 1 && rows[0] === 'alpha xkTODO.md', `with TODO as well it reads "Tagged TODO and not CLAUDE" ("${ct}": ${rows.join(', ')})`);
    await drv.T('runCommand', 'tag-todo');
    await drv.settle('todo off');

    const rightClick = async (selector) => {
      const c = await drv.ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!c) return false;
      await drv.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'right', clickCount: 1 });
      await drv.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'right', clickCount: 1 });
      await sleep(200);
      return true;
    };
    const pill = (id) => drv.ev(`(() => { const b = document.querySelector('#runnerOptsPanel [data-cmd-id="${id}"]'); return b ? { text: b.textContent.trim(), not: b.classList.contains('tagfox-runner-cmd--not') } : null; })()`);
    await focusBox();
    await key('o', 'KeyO', 79, 1);
    let p = await pill('tag-claude');
    check(!!p && p.not && p.text === '¬CLAUDE', `the panel marks CLAUDE as left out (${JSON.stringify(p)})`);
    const notInPanel = await drv.ev(`document.querySelectorAll('#runnerOptsPanel [data-cmd-id^="not-"]').length`);
    check(notInPanel === 0, `the panel has no separate not-tag items (${notInPanel})`);
    await rightClick('#runnerOptsPanel [data-cmd-id="tag-todo"]');
    await drv.settle('not todo');
    rows = await shown();
    p = await pill('tag-todo');
    check(!!p && p.not && !rows.includes('alpha xkTODO.md') && rows.includes('beta.txt'), `right-clicking TODO leaves it out too (${JSON.stringify(p)}: ${rows.join(', ')})`);
    const todoWasOut = !!p && p.not;
    await rightClick('#runnerOptsPanel [data-cmd-id="tag-todo"]');
    await drv.settle('not todo off');
    rows = await shown();
    p = await pill('tag-todo');
    check(todoWasOut && !!p && !p.not && rows.includes('alpha xkTODO.md'), 'right-clicking it again puts it back');
    await key('Escape', 'Escape', 27);
    const clearClicked = await click('#runnerFilterChips [data-filter-id="tags"] .tagfox-runner-filter-chip-x');
    await drv.settle('tags cleared');
    check(clearClicked && !(await R()).chips.includes('tags'), "the chip's x clears what is left");

    // Setting a tag: Ctrl+T on the selected row, from the box.
    await names('beta');
    s = await R();
    check(path.basename(s.selected) === 'beta.txt', `beta.txt is selected (${path.basename(s.selected)})`);
    await focusBox();
    await key('t', 'KeyT', 84, 2);
    let m = (await waitModal(true)) && (await modal());
    check(!!m && m.shown && m.path === path.join(root, 'beta.txt'), `Ctrl+T opens the tag editor on the selected row (${m && m.path})`);
    if (m && m.shown) {
      await tagInput('todo');
      check(await waitOnDisk(['beta xkTODO.txt']), 'adding TODO renames the file on disk to "beta xkTODO.txt"');
      await sleep(300);
      await click('#tagModalChips .badge button');
      check(await waitOnDisk(['beta.txt']), "removing it with the chip's x renames it back to beta.txt");
      await closeModal();
      let inBox = false;
      for (let i = 0; i < 20 && !inBox; i++) {
        inBox = (await R()).focusInBox;
        if (!inBox) await sleep(100);
      }
      const where = await drv.ev(`(() => { const a = document.activeElement; return a ? a.tagName + '#' + a.id + '.' + a.className : 'none'; })()`);
      check(inBox, `closing the editor puts the focus back in the box (focus on ${where})`);
    }

    // Bulk: two checked rows, one Ctrl+T, both renamed. Everything may take a moment to list beta.txt again.
    for (let i = 0; i < 25; i++) {
      const r = await names('beta|delta');
      if (r.includes('beta.txt') && r.includes('delta.txt')) break;
      await sleep(300);
    }
    await focusBox();
    await key('ArrowDown', 'ArrowDown', 40, 8);
    s = await R();
    check(s.checked === 2, `Shift+Down checks two rows (${s.checked})`);
    await focusBox();
    await key('t', 'KeyT', 84, 2);
    m = (await waitModal(true)) && (await modal());
    check(!!m && m.shown && /2 items/.test(m.path), `Ctrl+T on two checked rows opens the editor for both (${m && m.path})`);
    if (m && m.shown) {
      await tagInput('later');
      check(await waitOnDisk(['beta xkLATER.txt', 'delta xkLATER.txt']), 'adding LATER renames both files on disk');
      await closeModal();
    }

    // Down from a box whose text is selected leaves the caret at the end, so typing adds to the query.
    await names('gam');
    await drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(0, q.value.length); return 1; })()`);
    await key('ArrowDown', 'ArrowDown', 40);
    const caret = await drv.ev(`(() => { const q = document.getElementById('query'); return { inBox: document.activeElement === q, start: q.selectionStart, end: q.selectionEnd, len: q.value.length }; })()`);
    check(caret.inBox && caret.start === caret.len && caret.end === caret.len, `Down collapses the selection to the end (${JSON.stringify(caret)})`);
    await key('m', 'KeyM', 77, 0, 'm');
    check((await R()).query === 'gamm', `typing then adds to the query ("${(await R()).query}")`);

    // Inside a deep folder: its path as one line of tiny clickable names above the box, leading names behind
    // "…" when the window is narrow; the box's hint names only the folder.
    const crumbs = () =>
      drv.ev(`(() => {
        const bar = document.getElementById('breadcrumbBar');
        const row = document.querySelector('.scope-breadcrumb-row');
        const vis = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
        const names = [...bar.querySelectorAll(':scope > .tagfox-breadcrumb-folder-chip')].filter(vis);
        const tops = new Set(names.map((c) => Math.round(c.getBoundingClientRect().top)));
        const more = bar.querySelector('.tagfox-runner-crumb-more');
        return {
          shown: vis(row),
          above: vis(row) && row.getBoundingClientRect().bottom <= document.getElementById('queryInputGroup').getBoundingClientRect().top + 0.5,
          names: names.map((c) => c.textContent.replace('›', '').trim()),
          oneLine: tops.size === 1,
          fits: bar.scrollWidth <= bar.clientWidth + 1,
          more: vis(more),
          px: parseFloat(getComputedStyle(names[0] || bar).fontSize),
          room: bar.clientWidth,
          used: bar.scrollWidth,
          window: innerWidth,
          box: Math.round(document.getElementById('queryInputGroup').getBoundingClientRect().width),
          hint: document.getElementById('queryGhostHint').textContent.trim(),
        };
      })()`);
    // The resize reaches the page's ResizeObserver in a rendered frame, which a hidden window runs only
    // after input; so send a key, then wait for a frame to have run.
    const widthTo = async (width) => {
      await drv.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
      await key('Shift', 'ShiftLeft', 16);
      const frame = await drv.ev(`Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), new Promise((r) => setTimeout(() => r(false), 2000))])`);
      if (!frame) console.log(`  (no frame ran within 2s of the resize to ${width}px)`);
    };
    await drv.T('configure', { rootFolder: deep });
    await names('');
    await widthTo(1800);
    let c = await crumbs();
    const last = deepNames[deepNames.length - 1];
    check(c.shown && c.above && c.oneLine && c.fits, `inside a folder its path shows above the box, on one line (${JSON.stringify(c)})`);
    check(c.px <= 12, `in tiny text (${c.px}px)`);
    check(!c.more && c.names.slice(-5).join('|') === deepNames.join('|'), 'with room, every name shows and no "…"');
    check(c.hint === 'Search inside' + last || c.hint === 'Search inside ' + last, `the box's hint names only the folder ("${c.hint}")`);
    await widthTo(700);
    const narrow = await crumbs();
    check(narrow.more && narrow.oneLine && narrow.fits && narrow.names.length < c.names.length && narrow.names[narrow.names.length - 1] === last, `in a narrow window the leading names give way to "…" and the folder's own name stays (${JSON.stringify(narrow)})`);
    await widthTo(1800);

    // A click on a name goes to that folder the way Left does: the box is cleared and the folder you came up
    // through is selected.
    const third = path.join(root, ...deepNames.slice(0, 3));
    const fourth = path.join(third, deepNames[3]);
    await names('gam');
    const at = await drv.ev(`(() => { const w = [...document.querySelectorAll('#breadcrumbBar [data-drop-path]')].find((e) => e.dataset.dropPath.replace(/[\\\\/]+$/, '').toLowerCase() === ${JSON.stringify(third.toLowerCase())}); const b = w && w.querySelector('button'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    check(!!at, 'set up: the third folder has a name to click');
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    if (at) {
      await drv.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      await drv.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      await sleep(200);
      await drv.settle('crumb click');
      const s = await R();
      check(norm(s.scope) === norm(third), `clicking it goes to that folder (${path.basename(s.scope)})`);
      check(s.query === '' && s.focusInBox, `the box is cleared and keeps the focus ("${s.query}", in box: ${s.focusInBox})`);
      check(norm(s.selected) === norm(fourth), `the folder you came up through is selected (${path.basename(s.selected)})`);
    }

    // The box's folder chip carries the folder's buttons (Classic's, on its last breadcrumb), shown on hover.
    // The tags button is the one pressed, since its effect is visible and it leaves the clipboard alone.
    await drv.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 400 });
    const chipActs = () =>
      drv.ev(`(() => { const chip = document.getElementById('runnerScopeChip'); const a = document.getElementById('tagfoxScopeBarRowActions'); const r = chip.getBoundingClientRect(); return { inChip: !!a && chip.contains(a), shown: !!a && getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().width > 0, x: r.left + 12, y: r.top + r.height / 2 }; })()`);
    let ca = await chipActs();
    check(ca.inChip && !ca.shown, `the folder's buttons sit in the box's folder chip, out of sight (${JSON.stringify(ca)})`);
    await drv.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ca.x, y: ca.y });
    await sleep(150);
    check((await chipActs()).shown, 'hovering the chip shows them');
    await click('#btnScopeBarTags');
    m = (await waitModal(true)) && (await modal());
    check(!!m && m.shown && norm(m.path) === norm(third), `its tags button opens the tag editor on the folder (${m && m.path})`);
    if (m && m.shown) await closeModal();
    await drv.T('configure', { rootFolder: '' });
    await names('');
    check(!(await crumbs()).shown, 'searching everywhere, the line is gone');
    await drv.send('Emulation.clearDeviceMetricsOverride');
    await sleep(300);
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
    console.log(`\nrunner-tags: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-tags: all checks passed');
}

/* A CDP call whose answer never comes leaves nothing pending, and Node then exits with code 0 mid-test,
   which run-all would count as a pass. */
let finished = false;
process.on('beforeExit', () => {
  if (finished) return;
  console.log('\nrunner-tags: stopped part way, a page call never returned');
  process.exit(1);
});

main();
