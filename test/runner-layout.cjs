// The Runner layout: Settings "Toggle key opens: Runner" turns the same renderer into one large search box
// with a ranked flat list. This drives it with real key events over CDP and checks:
//   - an empty box lists only the current folder's own contents, and typing searches below it, unless
//     "Search this folder only" is on, which keeps the same search to the folder's own contents;
//   - a file created on disk appears (positive control: an empty list would pass the rest);
//   - Right on a folder makes it the current folder and clears the box; Left goes back up and
//     selects the folder it came from;
//   - the smart order puts name matches above rows that match only in the path;
//   - recency never outweighs the match: a year-old whole-word name ranks above today's inside-word one;
//   - a leading -word excludes;
//   - text that finds nothing makes the search box pulse, and the empty box does not;
//   - / opens the command list, Enter runs the command, and the box gets its text back;
//   - a row's size shows muted in a column of its own, /size sorts largest first and the other size
//     command smallest first, a smaller unit is fainter, and a cell has a tooltip only where it says more
//     than the cell;
//   - a deadline range or shown hide-until files show as chips whose x clears them, the / due and hidden-until
//     commands set them, and from an empty box a deadline range looks below the folder;
//   - "Show only starred items" lists just the stars under the folder, wherever they are below it;
//   - Windows' Recent list boosts the ranking (with a positive control that the order differs without it);
//   - Ctrl+D stars and unstars the selected row in the favourites list;
//   - hovering a row shows its action buttons, anchored in the row;
//   - AppData\Local\Temp is listed by default, below a file of the same name elsewhere, and the / command
//     hides it;
//   - there is no standing status line: a search leaves the bar hidden, F5's report brings it up and it goes
//     again, and a partly ranked list says so in the box;
//   - the Restart button sits in the search box and takes a click.
//
// Run: node test/runner-layout.cjs

const fs = require('fs');
const os = require('os');
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
  // Four sizes for the size sorts, the second tagged so its name cell keeps a tooltip, and one a year old
  // so its date ("12 Sep 2025") is wider than today's time. These and the chip files sit a folder down, so
  // the empty box's list of the folder itself (which the Down and Right checks walk) is unchanged.
  const extra = path.join(root, 'extra');
  fs.mkdirSync(extra, { recursive: true });
  const sizeFiles = [
    ['sizecheck large.bin', 1.44 * 1024 * 1024],
    ['sizecheck mid.bin', 300 * 1024],
    ['sizecheck tagged xkTODO.bin', 40 * 1024],
    ['sizecheck small.bin', 10],
  ].map(([n, bytes]) => {
    const p = path.join(extra, n);
    fs.writeFileSync(p, Buffer.alloc(Math.round(bytes), 120));
    return p;
  });
  const sizeOld = new Date(Date.now() - 400 * 864e5);
  fs.utimesSync(sizeFiles[0], sizeOld, sizeOld);
  // The deadline and hide-until filters: one file due today, one hidden for a month, one plain.
  const isoDay = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dueFile = path.join(extra, 'chipcheck due xd-' + isoDay(new Date()) + '.txt');
  const laterFile = path.join(extra, 'chipcheck later xh-' + isoDay(new Date(Date.now() + 30 * 864e5)) + '.txt');
  const plainFile = path.join(extra, 'chipcheck plain.txt');
  for (const p of [dueFile, laterFile, plainFile]) fs.writeFileSync(p, 'c\n');
  // Two names that tie on the match, the second a minute newer, so it leads unless the first is in Windows' Recent list.
  const wrOne = path.join(extra, 'wrcheck one.txt');
  const wrTwo = path.join(extra, 'wrcheck two.txt');
  fs.writeFileSync(wrOne, 'w\n');
  fs.writeFileSync(wrTwo, 'w\n');
  const minuteAgo = new Date(Date.now() - 60e3);
  fs.utimesSync(wrOne, minuteAgo, minuteAgo);
  // Back-dated at the start, so Everything has indexed the old time by the time the type check reads it.
  // Where "map" falls in the name: a whole word, the start of the name, the end of a word, inside a word.
  const mapNames = ['old map.txt', 'mapping.txt', 'roadmap.txt', 'xmapx.txt'];
  for (const n of mapNames) fs.writeFileSync(path.join(root, n), 'map\n');
  // Recency must not outweigh the match: a year-old file with "atlas" as a whole word in its name ranks
  // above one modified today that has it only inside a word.
  const atlasOld = path.join(root, 'old atlas.txt');
  const atlasNew = path.join(root, 'xatlasx.txt');
  fs.writeFileSync(atlasOld, 'atlas\n');
  fs.writeFileSync(atlasNew, 'atlas\n');
  const yearAgo = new Date(Date.now() - 365 * 864e5);
  fs.utimesSync(atlasOld, yearAgo, yearAgo);
  // ~ paths are listed and ranked down. Steve's own case: keys.kdbx in a ~folder, typed in full, comes
  // first, above its .bak siblings and above an xk note that only mentions it; the ages mirror his files.
  const tildeDir = path.join(root, '~keys_and_ids');
  const kdbx = path.join(tildeDir, 'keys.kdbx');
  const kdbxBaks = [path.join(tildeDir, 'keys.kdbx.2026-10-23-100926.bak'), path.join(tildeDir, 'keys.kdbx.2026-10-22-172604.bak')];
  const kdbxNote = path.join(root, 'notes', 'check keys.kdbx then retire Bitwarden xkTODO xpSTEVE.md');
  fs.mkdirSync(tildeDir, { recursive: true });
  fs.mkdirSync(path.dirname(kdbxNote), { recursive: true });
  for (const [p, hoursAgo] of [[kdbx, 1], [kdbxBaks[0], 19], [kdbxBaks[1], 76], [kdbxNote, 188]]) {
    fs.writeFileSync(p, 'k\n');
    const t = new Date(Date.now() - hoursAgo * 36e5);
    fs.utimesSync(p, t, t);
  }
  // A Word lock file is new and the document it locks is two months old, so without the ~ penalty the
  // lock file's recency would put it first.
  const reportDoc = path.join(root, 'report.docx');
  const reportLock = path.join(root, '~$report.docx');
  fs.writeFileSync(reportDoc, 'doc\n');
  fs.writeFileSync(reportLock, 'lock\n');
  const twoMonths = new Date(Date.now() - 60 * 864e5);
  fs.utimesSync(reportDoc, twoMonths, twoMonths);
  const olderMd = path.join(root, 'aaa-older.md');
  fs.writeFileSync(olderMd, '# older\n');
  const old = new Date(Date.now() - 30 * 864e5);
  fs.utimesSync(olderMd, old, old);
  let drv;
  let tempFile = null;
  try {
    drv = await connect({ profile: 'tagfox-test-runner', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');

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
    // Runner used to hide ~ paths by default: a saved Runner state that still says so is carried over to
    // showing them, once, and the carried value is saved.
    await drv.ev(`(localStorage.setItem('tagBrowserRunnerState', JSON.stringify({ optHideTilde: true })), 1)`);
    await drv.T('setRunnerMode', true);
    await drv.settle('runner on');
    const carried = await drv.ev(`JSON.stringify({ live: document.getElementById('optHideTilde').checked, saved: JSON.parse(localStorage.getItem('tagBrowserRunnerState')).optHideTilde })`);
    check(carried === '{"live":false,"saved":false}', `an old saved hide-~ is carried over to showing ~ paths (${carried})`);
    let s = await R();
    check(s.on && s.bodyClass, `Runner is on`);
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

    // "Search this folder only": the same search keeps the folder's own matches and drops the one below.
    await drv.T('runCommand', 'this-folder');
    await drv.settle('/this folder only');
    s = await R();
    check(
      s.chips.includes('this-folder') && !s.subfolders && has(s.rows, path.join(root, 'alphafold-note.md')) && has(s.rows, alpha) && !has(s.rows, path.join(alpha, 'inner.txt')),
      `"Search this folder only" keeps the folder's own matches and drops the subfolder's (chips ${s.chips}: ${s.rows.map((r) => path.basename(r))})`
    );
    await drv.T('runCommand', 'this-folder');
    await drv.settle('/this folder only off');
    s = await R();
    check(!s.chips.includes('this-folder') && s.subfolders && has(s.rows, path.join(alpha, 'inner.txt')), `the same command again searches below the folder (chips ${s.chips})`);

    // Matches at the start and end of a word rank above matches inside one.
    await drv.T('setQuery', 'map');
    await drv.settle('map');
    s = await R();
    const mapOrder = s.rows.map((r) => path.basename(r)).filter((n) => mapNames.includes(n));
    check(JSON.stringify(mapOrder) === JSON.stringify(mapNames), `whole word, then start, end and inside a word (${mapOrder.join(', ')})`);

    await drv.T('setQuery', 'atlas');
    await drv.settle('atlas');
    s = await R();
    const atlasOrder = s.rows.map((r) => path.basename(r)).filter((n) => n === 'old atlas.txt' || n === 'xatlasx.txt');
    check(atlasOrder.join(', ') === 'old atlas.txt, xatlasx.txt', `a year-old whole word above today's inside-word match (${atlasOrder.join(', ')})`);

    // ~ paths: listed by default, ranked down, and the penalty gives way to a name typed in full.
    await drv.T('setQuery', 'keys.kdbx');
    const kdbxListed = (await waitForRow(kdbxNote, 'keys.kdbx')) && (await waitForRow(kdbxBaks[1], 'keys.kdbx bak'));
    s = await R();
    const at = (p) => s.rows.findIndex((r) => norm(r) === norm(p));
    check(kdbxListed && has(s.rows, kdbx), `~ paths are listed by default (${s.rows.map((r) => path.basename(r)).join(', ')})`);
    check(
      at(kdbx) === 0 && kdbxBaks.every((b) => at(b) > 0) && at(kdbxNote) > 0,
      `keys.kdbx typed in full comes first, above its .bak siblings and the note that mentions it (${s.rows.map((r) => path.basename(r)).join(', ')})`
    );
    await drv.T('setQuery', 'report');
    await waitForRow(reportLock, 'report');
    s = await R();
    check(at(reportDoc) >= 0 && at(reportLock) > at(reportDoc), `~$report.docx sinks below report.docx (doc ${at(reportDoc)}, lock ${at(reportLock)})`);
    await drv.T('setQuery', 'keys_and_ids');
    await drv.settle('tilde folder');
    s = await R();
    check(at(tildeDir) === 0, `typing a ~folder's name puts it first (${s.rows.map((r) => path.basename(r)).slice(0, 3).join(', ')})`);
    // Hiding them is still a switch: the / command, with a chip that says so.
    await drv.T('setQuery', 'report');
    await drv.ev(`(document.getElementById('btnRunnerOpts').click(), document.querySelector('#runnerOptsPanel [data-cmd-id="tilde"]').click(), 1)`);
    await drv.settle('hide tilde');
    s = await R();
    check(!has(s.rows, reportLock) && has(s.rows, reportDoc) && s.chips.includes('tilde'), `Hide ~ paths hides them and a chip says so (${s.chips.join(', ')})`);
    // Saved as it changes, because Runner's saved state is what a restart in Runner applies.
    const savedHide = await drv.ev(`JSON.parse(localStorage.getItem('tagBrowserRunnerState') || '{}').optHideTilde`);
    check(savedHide === true, `a change made in Runner is saved at once (saved optHideTilde ${savedHide})`);
    await drv.ev(`(document.querySelector('#runnerOptsPanel [data-cmd-id="tilde"]').click(), document.getElementById('btnRunnerOpts').click(), 1)`);
    await drv.settle('show tilde');
    s = await R();
    check(has(s.rows, reportLock) && !s.chips.includes('tilde'), 'and again shows them');

    // A typed file type filters by extension and, with no other words, lists the newest first.
    await drv.T('setQuery', '.md');
    let typeOk = false;
    for (let i = 0; i < 20 && !typeOk; i++) {
      await drv.T('runSearchNow', 'identity');
      await drv.settle('type');
      s = await R();
      typeOk = has(s.rows, olderMd) && has(s.rows, path.join(root, 'alphafold-note.md'));
      if (!typeOk) await sleep(400);
    }
    check(typeOk && s.rows.every((r) => /\.md$/i.test(r)), `.md lists markdown files only (${s.rows.map((r) => path.basename(r)).join(', ')})`);
    check(norm(s.rows[0]) === norm(path.join(root, 'alphafold-note.md')) && norm(s.rows[s.rows.length - 1]) === norm(olderMd), '.md alone puts the newest first');

    // Exclusion.
    await drv.T('setQuery', 'alphafold -note');
    await drv.settle('exclude');
    s = await R();
    check(!has(s.rows, path.join(root, 'alphafold-note.md')) && has(s.rows, alpha), 'a leading -word excludes');

    // Text that finds nothing makes the search box pulse; the empty box, which lists the folder, does not.
    const boxPulses = () => drv.ev(`document.getElementById('queryInputGroup').classList.contains('pulse-hint')`);
    await drv.T('setQuery', 'qzxnomatch' + Date.now());
    await drv.settle('no match');
    const pulsedOnNone = (await R()).rows.length === 0 && (await boxPulses());
    await drv.T('setQuery', '');
    await drv.settle('cleared for pulse');
    check(pulsedOnNone && !(await boxPulses()), `text that finds nothing makes the box pulse, and clearing it stops (${pulsedOnNone})`);

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

    // / commands, typed after a search term: the term stays in the box ahead of the slash.
    await drv.T('setQuery', 'zeta');
    await drv.settle('zeta');
    const zetaRows = (await R()).rows.length;
    await focusBox();
    await key('/', 'Slash', 191, 0, '/');
    s = await R();
    check(s.cmdListOpen && s.query === 'zeta /', `typing / after a search term opens the command list and keeps the term (box "${s.query}")`);
    for (const ch of 'newest') await key(ch, 'Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0), 0, ch);
    s = await R();
    if (process.env.RUNNER_DEBUG) console.log('    after typing:', JSON.stringify({ q: s.query, open: s.cmdListOpen, m: s.cmdMatches.slice(0, 3) }));
    check(s.cmdMatches[0] === 'sort-date', `the list filters as you type (first: ${s.cmdMatches[0]})`);
    await drv.settle('cmd typing');
    s = await R();
    check(zetaRows > 0 && s.rows.length === zetaRows, `the results stay those for the term while the list is open (${s.rows.length} of ${zetaRows})`);
    // On screen, not just in state: the search box clips its children, so the list must sit outside it.
    const listSeen = await drv.ev(`(() => {
      const b = document.querySelector('#runnerCmdList .tagfox-runner-cmd');
      const box = document.getElementById('queryInputGroup').getBoundingClientRect();
      if (!b) return { ok: false, why: 'no entry' };
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { ok: r.top >= box.bottom - 1 && !!hit && b.contains(hit), top: Math.round(r.top), boxBottom: Math.round(box.bottom), hit: hit && (hit.id || hit.className) };
    })()`);
    check(listSeen.ok, `the command list shows below the box, not clipped by it (${JSON.stringify(listSeen)})`);
    await key('Enter', 'Enter', 13, 0, '\r');
    await drv.settle('cmd');
    s = await R();
    check(!s.cmdListOpen && s.sort === 'date' && s.query === 'zeta', `Enter runs it and the box gets its text back (sort ${s.sort}, box "${s.query}")`);
    await drv.T('setRunnerSort', 'smart');
    await drv.settle('smart again');

    // Size: /size sorts largest first, the column shows each size muted and in line, and only the cells
    // that say more than they show carry a tooltip.
    await drv.T('setQuery', 'sizecheck');
    let sizesSeen = false;
    for (let i = 0; i < 20 && !sizesSeen; i++) {
      await drv.T('runSearchNow', 'identity');
      await drv.settle('sizecheck');
      const rowsNow = (await R()).rows;
      sizesSeen = sizeFiles.every((p) => has(rowsNow, p));
      if (!sizesSeen) await sleep(400);
    }
    check(sizesSeen, 'the four size files are listed (positive control)');
    await focusBox();
    await key('/', 'Slash', 191, 0, '/');
    for (const ch of 'size') await key(ch, 'Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0), 0, ch);
    s = await R();
    check(s.cmdMatches[0] === 'sort-size' && s.cmdMatches[1] === 'sort-size-asc', `/size offers largest first, then smallest first (${s.cmdMatches.slice(0, 3)})`);
    await key('Enter', 'Enter', 13, 0, '\r');
    await drv.settle('size sort');
    s = await R();
    const sizeOrder = () => s.rows.filter((r) => sizeFiles.some((p) => norm(p) === norm(r))).map(norm);
    check(s.sort === 'size' && JSON.stringify(sizeOrder()) === JSON.stringify(sizeFiles.map(norm)), `Enter sorts by size, largest first (${s.sort}: ${sizeOrder().map((p) => path.basename(p))})`);
    check(s.chips.includes('sort'), 'the size order shows as a chip');
    const cells = await drv.ev(`(() => {
      const want = ${JSON.stringify(sizeFiles.map(norm))};
      const rows = Array.from(document.querySelectorAll('#tbody tr[data-row-path]')).filter((tr) => want.includes(tr.dataset.rowPath.toLowerCase()));
      const tip = (td) => !!td && !!(td.getAttribute('data-bs-title') || td.getAttribute('title'));
      return rows.map((tr) => {
        const sz = tr.querySelector('td.results-td-size');
        const r = sz.getBoundingClientRect();
        const cs = getComputedStyle(sz);
        const date = tr.querySelector('td:last-child');
        const dr = date.getBoundingClientRect();
        return {
          name: tr.dataset.rowPath.split('\\\\').pop(),
          text: sz.textContent,
          date: date.textContent,
          shown: cs.display !== 'none' && r.width > 0,
          left: Math.round(r.left),
          right: Math.round(r.right),
          dateBox: Math.round(dr.left) + '-' + Math.round(dr.right),
          overflow: sz.scrollWidth > sz.clientWidth + 1 || date.scrollWidth > date.clientWidth + 1,
          color: cs.color,
          opacity: parseFloat(cs.opacity),
          px: parseFloat(cs.fontSize),
          datePx: parseFloat(getComputedStyle(date).fontSize),
          tips: { name: tip(tr.querySelector('td:nth-child(2)')), path: tip(tr.querySelector('td.col-path')), size: tip(sz), date: tip(date) },
        };
      });
    })()`);
    const tagged = cells.find((c) => /tagged/.test(c.name));
    const texts = cells.map((c) => c.text);
    check(cells.length === 4 && cells.every((c) => c.shown && c.text), `every row shows its size (${texts})`);
    check(JSON.stringify(texts) === '["1.4MB","300KB","40KB","10B"]', `a size is at most three figures and its unit (${texts})`);
    check(new Set(cells.map((c) => c.date.length)).size > 1, `the dates differ in width (${cells.map((c) => c.date)})`);
    check(
      cells.every((c) => c.left === cells[0].left && c.right === cells[0].right && c.dateBox === cells[0].dateBox && !c.overflow),
      `the sizes and the dates each sit in one column, nothing cut off (${cells.map((c) => c.left + '-' + c.right + ' ' + c.dateBox + (c.overflow ? ' cut' : ''))})`
    );
    check(new Set(cells.map((c) => c.color)).size === 1 && cells.every((c) => c.px < c.datePx), `the sizes share one muted colour, smaller than the date (${cells[0] && cells[0].color}, ${cells[0] && cells[0].px}px)`);
    // Largest first: MB, KB, KB, B. Each unit down is fainter, so 10 B, with as many digits as some larger sizes, reads lightest.
    const op = cells.map((c) => c.opacity);
    check(op.length === 4 && op[0] > op[1] && op[1] === op[2] && op[2] > op[3], `a smaller unit is fainter (opacity ${op})`);
    check(cells.every((c) => !c.tips.path && !c.tips.size && c.tips.date), `no tooltip on the path or the size, one on the time (${JSON.stringify(cells.map((c) => c.tips))})`);
    check(tagged && tagged.tips.name && cells.filter((c) => c !== tagged).every((c) => !c.tips.name), 'only the tagged name, whose name on disk differs, has a name tooltip');
    await drv.T('setRunnerSort', 'size-asc');
    await drv.settle('size asc');
    s = await R();
    check(JSON.stringify(sizeOrder()) === JSON.stringify(sizeFiles.map(norm).reverse()), `the other size command sorts smallest first (${sizeOrder().map((p) => path.basename(p))})`);
    await drv.T('setRunnerSort', 'smart');

    // A deadline range or a shown hide-until shows as a chip whose x clears it.
    await drv.T('setQuery', 'chipcheck');
    let chipRows = false;
    for (let i = 0; i < 20 && !chipRows; i++) {
      await drv.T('runSearchNow', 'identity');
      await drv.settle('chipcheck');
      const rowsNow = (await R()).rows;
      chipRows = has(rowsNow, dueFile) && has(rowsNow, plainFile);
      if (!chipRows) await sleep(400);
    }
    s = await R();
    check(chipRows && !has(s.rows, laterFile), `the due and plain files are listed and the hidden one is not (positive control: ${s.rows.map((r) => path.basename(r))})`);
    const chipX = (id) => drv.ev(`(() => { const b = document.querySelector('#runnerFilterChips [data-filter-id="${id}"] button'); if (b) b.click(); return !!b; })()`);
    await drv.T('setDeadlineRange', 'today');
    await drv.settle('deadline today');
    s = await R();
    check(s.chips.includes('deadline') && has(s.rows, dueFile) && !has(s.rows, plainFile), `a deadline range shows as a chip and narrows the list (chips ${s.chips})`);
    check(await chipX('deadline'), 'the deadline chip has an x');
    await drv.settle('deadline cleared');
    s = await R();
    check(!s.chips.includes('deadline') && has(s.rows, plainFile), `its x clears the range (chips ${s.chips})`);
    await drv.T('setShowHiddenUntil', true);
    await drv.settle('show hidden');
    s = await R();
    check(s.chips.includes('hidden-until') && has(s.rows, laterFile), `showing hidden-until files shows as a chip (chips ${s.chips})`);
    check(await chipX('hidden-until'), 'the hidden-until chip has an x');
    await drv.settle('hidden again');
    s = await R();
    check(!s.chips.includes('hidden-until') && !has(s.rows, laterFile), `its x hides them again (chips ${s.chips})`);

    // The same filters as / commands, from an empty box: the files sit a folder down, so the list must look below.
    await drv.T('setQuery', '');
    await drv.settle('empty box for due');
    await drv.T('runCommand', 'due-today');
    await drv.settle('/due today');
    s = await R();
    check(s.chips.includes('deadline') && has(s.rows, dueFile) && !has(s.rows, plainFile), `/due today, with the box empty, lists the file due today a folder down (chips ${s.chips}: ${s.rows.map((r) => path.basename(r))})`);
    await drv.T('runCommand', 'due-today');
    await drv.settle('/due today off');
    s = await R();
    check(!s.chips.includes('deadline'), `the same command again turns it off (chips ${s.chips})`);
    await drv.T('runCommand', 'hidden-until');
    await drv.settle('/hidden-until');
    s = await R();
    check(s.chips.includes('hidden-until'), `the hidden-until command shows its chip (chips ${s.chips})`);
    await drv.T('runCommand', 'hidden-until');
    await drv.settle('/hidden-until off');
    // Starred only, from an empty box: exactly the stars under the folder, wherever they are below it.
    await drv.T('toggleStar', plainFile);
    await drv.T('runCommand', 'starred');
    await drv.settle('/starred');
    s = await R();
    check(s.chips.includes('starred') && s.rows.length === 1 && has(s.rows, plainFile), `"Show only starred items" lists just the star a folder down (chips ${s.chips}: ${s.rows.map((r) => path.basename(r))})`);
    await drv.T('runCommand', 'starred');
    await drv.settle('/starred off');
    await drv.T('toggleStar', plainFile);
    s = await R();
    check(!s.chips.includes('starred') && s.rows.length > 1, `the same command again lists the whole folder (${s.rows.length} rows)`);

    // Windows' Recent list boosts the ranking: of two names that tie, the older leads once it is in the list.
    await drv.T('setQuery', 'wrcheck');
    await drv.settle('wrcheck');
    const wrOrder = () => s.rows.filter((r) => norm(r) === norm(wrOne) || norm(r) === norm(wrTwo)).map((r) => path.basename(r));
    s = await R();
    check(JSON.stringify(wrOrder()) === JSON.stringify(['wrcheck two.txt', 'wrcheck one.txt']), `without it the newer name leads (positive control: ${wrOrder()})`);
    await drv.T('setWindowsRecent', [wrOne]);
    await drv.T('runSearchNow', 'identity');
    await drv.settle('wrcheck boosted');
    s = await R();
    check(JSON.stringify(wrOrder()) === JSON.stringify(['wrcheck one.txt', 'wrcheck two.txt']), `in Windows' Recent list the older name leads (${wrOrder()})`);
    await drv.T('setWindowsRecent', []);
    await drv.T('setQuery', 'zeta');
    await drv.settle('smart after size');

    // Stars.
    await focusBox();
    const sel = (await R()).selected;
    await key('d', 'KeyD', 68, 2);
    s = await R();
    check(s.stars.some((p) => norm(p) === norm(sel)), 'Ctrl+D stars the selected row in the favourites list');
    const starOn = await drv.ev(`!!document.querySelector('#tbody tr.table-active .results-row-star--on')`);
    check(starOn, 'the starred row shows a filled star');
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

    // Backspace in an empty box drops the current folder; with text in the box it only edits the text.
    await drv.T('configure', { rootFolder: root });
    await drv.T('setQuery', 'ze');
    await drv.settle('backspace setup');
    await focusBox();
    await key('Backspace', 'Backspace', 8);
    await drv.settle('backspace text');
    s = await R();
    check(s.query === 'z' && norm(s.scope) === norm(root), `Backspace with text in the box edits the text and keeps the folder (box "${s.query}")`);
    await drv.T('setQuery', '');
    await drv.settle('backspace empty');
    await focusBox();
    await key('Backspace', 'Backspace', 8);
    await drv.settle('backspace folder');
    s = await R();
    check(!s.scope, `Backspace in an empty box removes the current folder (scope "${s.scope}")`);

    // AppData\Local\Temp is listed by default, below a file of the same name elsewhere, and the / command
    // hides it. The same-named plain file is the positive control for the hidden check: it must still come up.
    if (/[\\/]appdata[\\/]local[\\/]temp$/i.test(os.tmpdir())) {
      const tempName = 'runnertemp-' + process.pid + '-' + Date.now();
      tempFile = path.join(os.tmpdir(), tempName + '.txt');
      const plainTwin = path.join(root, tempName + '.txt');
      fs.writeFileSync(tempFile, 'temp\n');
      fs.writeFileSync(plainTwin, 'plain\n');
      await drv.T('configure', { rootFolder: '' });
      await drv.T('setQuery', tempName);
      await drv.settle('temp query');
      const runCmd = async (filter) => {
        await drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(0, 0); return 1; })()`);
        await key('/', 'Slash', 191, 0, '/');
        await drv.send('Input.insertText', { text: filter });
        await sleep(150);
        await key('Enter', 'Enter', 13, 0, '\r');
        await drv.settle('cmd ' + filter);
      };
      const bothIn = (await waitForRow(tempFile, 'temp shown')) && (await waitForRow(plainTwin, 'plain twin'));
      s = await R();
      const iTemp = s.rows.findIndex((r) => norm(r) === norm(tempFile));
      const iTwin = s.rows.findIndex((r) => norm(r) === norm(plainTwin));
      check(bothIn && iTwin >= 0 && iTwin < iTemp, `by default a file in AppData\\Local\\Temp is listed, below the same name elsewhere (plain ${iTwin}, Temp ${iTemp})`);
      await runCmd('temp');
      await drv.T('runSearchNow', 'identity');
      await drv.settle('temp hidden');
      s = await R();
      check(!has(s.rows, tempFile) && has(s.rows, plainTwin) && s.query === tempName, `the / temp command hides it and keeps the plain file (${s.rows.length} rows)`);
      check(s.chips.includes('temp'), `hiding temp files shows a chip (${s.chips.join(', ')})`);
      await runCmd('temp');
      check(await waitForRow(tempFile, 'temp shown again'), 'the / temp command again lists it');
    } else {
      console.log('  SKIP temp files: the temp folder here is not AppData\\Local\\Temp (' + os.tmpdir() + ')');
    }

    // No standing status line: a search leaves the bar hidden, a message (here the F5 report) brings it up,
    // and it goes again. A search over the whole index ranks only part of the matches and says so in the box.
    for (let i = 0; i < 40 && (await R()).statusShown; i++) await sleep(250);
    await drv.T('configure', { rootFolder: '' });
    await drv.T('setQuery', 'a');
    await drv.settle('whole index');
    s = await R();
    check(!s.statusShown && !/\bhits?\b|Hiding/.test(s.status), `a search leaves the status bar hidden and writes no standing line ("${s.status.slice(0, 60)}")`);
    check(!!s.rankNote && /^\d+ of [\d.]+[KMB]? ranked$/.test(s.rankNote.text) && /^Ranked the \d+ newest of [\d,]+ matches/.test(s.rankNote.title),
      `a partly ranked list says so in the box (${JSON.stringify(s.rankNote)})`);
    await drv.T('configure', { rootFolder: root });
    await drv.T('setQuery', 'zeta');
    await drv.settle('narrow');
    s = await R();
    check(!s.rankNote, `a list ranked in full shows no note (${JSON.stringify(s.rankNote)})`);
    await focusBox();
    await key('F5', 'F5', 116);
    await drv.settle('f5');
    s = await R();
    check(s.statusShown && /^Refreshed /.test(s.status), `F5 brings the bar up with its report ("${s.status.slice(0, 60)}")`);
    await sleep(6000);
    s = await R();
    check(!s.statusShown, 'the bar goes again after a few seconds');

    // The wait above spans an auto-refresh tick (every 5s), which can still be in flight.
    await drv.settle('after the wait');
    const probs = structuralProblems(await drv.state());
    check(!probs.length, 'structural invariants hold in Runner' + (probs.length ? ': ' + probs.join('; ') : ''));

    // The Restart button sits in the search box.
    const restartWhere = () =>
      drv.ev(`(() => { const b = document.getElementById('btnRestartTagFox'); return !b ? 'missing' : b.closest('#queryInputGroup') ? 'box' : 'elsewhere'; })()`);
    check((await restartWhere()) === 'box', `the Restart button is in the search box (${await restartWhere()})`);
    const restartSeen = await drv.ev(`(() => {
      const b = document.getElementById('btnRestartTagFox');
      b.classList.remove('d-none');
      const r = b.getBoundingClientRect();
      const box = document.getElementById('queryInputGroup').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      b.classList.add('d-none');
      return { ok: r.width > 0 && r.left >= box.left && r.right <= box.right && !!hit && b.contains(hit), w: Math.round(r.width) };
    })()`);
    check(restartSeen.ok, `once code has changed it shows there and takes a click (${JSON.stringify(restartSeen)})`);
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
      if (tempFile) fs.rmSync(tempFile, { force: true });
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
