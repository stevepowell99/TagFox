// The Shelf in Runner: a strip under the list that is one line high while empty and a few lines at most
// when full, takes a drop (a move, or a copy with Shift), gives its items back to a folder row, keeps the
// status line off its chips, and sends an item to the Recycle Bin rather than deleting it, since a drop onto
// the Shelf moves the original there.
//
// The drags are synthetic DragEvents carrying TagFox's own paths payload, the in-app drag a row or a chip
// starts; a drag to another app (Alt+drag) is a native OS drag and is not driven here.
//
// Run: node test/runner-shelf.cjs

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

const DRAG_TYPE = 'application/x-tagbrowser-paths';

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-shelf-' + process.pid);
  const src = path.join(root, 'src');
  const dest = path.join(root, 'dest');
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(src, 'moved.txt'), 'moved');
  fs.writeFileSync(path.join(src, 'copied.txt'), 'copied');
  const t0 = Date.now();
  const recycleName = `shelf-recycle-${process.pid}.txt`;
  let recycled = [];

  const waitFor = async (fn, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await sleep(100);
    }
    return fn();
  };

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-shelf', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    await drv.T('setRunnerMode', true);
    await drv.settle('runner');
    const shelfDir = path.join(drv.userData, 'TagBrowserShelf');
    await drv.T('renderShelf');

    const geo = () =>
      drv.ev(`(() => {
        const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height, w: b.width }; };
        const aside = document.getElementById('appShelf');
        const zone = document.getElementById('shelfDropZone');
        return {
          winH: innerHeight,
          shelf: r(aside),
          list: r(document.getElementById('resultsWrap')),
          status: r(document.getElementById('tagfoxNavbarStatus')),
          statusOn: document.body.classList.contains('tagfox-runner-status-on'),
          inlineWidth: aside.style.width,
          hint: !document.getElementById('shelfEmptyHint').classList.contains('d-none'),
          chips: [...document.querySelectorAll('#shelfChips .shelf-chip:not(.shelf-chip-all)')].map((c) => c.textContent.trim()),
          scrolls: zone.scrollHeight > zone.clientHeight + 1,
          statusText: document.getElementById('statusMain').textContent,
        };
      })()`);

    let g = await geo();
    check(g.shelf && g.shelf.h > 0 && g.shelf.w > 0, `the Shelf shows in Runner (${JSON.stringify(g.shelf)})`);
    check(g.shelf && g.list && g.shelf.top >= g.list.bottom - 1 && g.shelf.bottom <= g.winH + 1, `it sits under the list, inside the window (list bottom ${g.list && Math.round(g.list.bottom)}, shelf ${g.shelf && Math.round(g.shelf.top)}-${g.shelf && Math.round(g.shelf.bottom)}, window ${g.winH})`);
    check(g.hint && g.shelf && g.shelf.h <= 40, `empty, it is one line high and says what it is for (${g.shelf && Math.round(g.shelf.h)}px)`);
    check(g.inlineWidth === '', `Runner leaves its size to CSS, without the rotated strip's inline width ("${g.inlineWidth}")`);

    /* A drop onto the Shelf: TagFox's own paths payload, as a row drag carries it. */
    const dropOnShelf = (paths, shiftKey) =>
      drv.ev(`(() => {
        const dt = new DataTransfer();
        dt.setData(${JSON.stringify(DRAG_TYPE)}, ${JSON.stringify(JSON.stringify(paths))});
        const aside = document.getElementById('appShelf');
        aside.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, shiftKey: ${!!shiftKey} }));
        aside.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, shiftKey: ${!!shiftKey} }));
        return true;
      })()`);

    await dropOnShelf([path.join(src, 'moved.txt')], false);
    const movedOn = await waitFor(() => fs.existsSync(path.join(shelfDir, 'moved.txt')) && !fs.existsSync(path.join(src, 'moved.txt')));
    check(movedOn, 'a drop onto the Shelf moves the file there');
    await dropOnShelf([path.join(src, 'copied.txt')], true);
    const copiedOn = await waitFor(() => fs.existsSync(path.join(shelfDir, 'copied.txt')));
    check(copiedOn && fs.existsSync(path.join(src, 'copied.txt')), 'a drop with Shift copies it, leaving the original');

    /* The drop's message brings the status line up over the bottom edge; it must sit above the chips it is
       about, and stay readable while the searches the drop starts run under it. */
    const statusEnd = Date.now() + 3000;
    const statusAbove = () => g.statusOn && g.status && g.shelf && g.status.top >= 0 && g.status.bottom <= g.shelf.top + 1;
    do {
      g = await geo();
      if (statusAbove() && !g.hint) break;
      await sleep(100);
    } while (Date.now() < statusEnd);
    check(g.statusOn, `the drop brings the status line up ("${g.statusText}")`);
    check(statusAbove(), `and it shows above the Shelf, not over it (status ${g.status && Math.round(g.status.top)}-${g.status && Math.round(g.status.bottom)}, shelf from ${g.shelf && Math.round(g.shelf.top)}, window ${g.winH})`);
    await drv.T('runSearchNow', 'identity');
    g = await geo();
    check(g.statusOn && /Copied to Shelf/.test(g.statusText), `a search while it is up leaves the message readable ("${g.statusText}", shown ${g.statusOn})`);
    await drv.T('renderShelf');
    g = await geo();
    check(!g.hint && g.chips.includes('moved.txt') && g.chips.includes('copied.txt'), `the Shelf shows them as chips (${JSON.stringify(g.chips)})`);

    /* A chip dragged onto a folder row moves the item into that folder. */
    await drv.T('setQuery', '');
    await drv.settle('folder listing');
    const destRow = await drv.ev(`!![...document.querySelectorAll('#tbody tr')].find((t) => (t.dataset.rowPath || '').toLowerCase() === ${JSON.stringify(dest.toLowerCase())})`);
    check(destRow, 'set up: the dest folder is a row in the list');
    const dragOff = await drv.ev(`(() => {
      const chip = [...document.querySelectorAll('#shelfChips .shelf-chip')].find((c) => c.textContent.trim() === 'moved.txt');
      const tr = [...document.querySelectorAll('#tbody tr')].find((t) => (t.dataset.rowPath || '').toLowerCase() === ${JSON.stringify(dest.toLowerCase())});
      if (!chip || !tr) return 'missing ' + (!chip ? 'chip' : 'row');
      const dt = new DataTransfer();
      chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
      if (!dt.types.includes(${JSON.stringify(DRAG_TYPE)})) return 'the chip put no paths on the drag';
      tr.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      tr.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      chip.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }));
      return 'ok';
    })()`);
    const movedOff = await waitFor(() => fs.existsSync(path.join(dest, 'moved.txt')) && !fs.existsSync(path.join(shelfDir, 'moved.txt')));
    check(dragOff === 'ok' && movedOff, `a chip dragged onto a folder row moves the item into that folder (${dragOff})`);

    /* Full, it grows to a few lines and scrolls rather than taking the list's room. */
    for (let i = 1; i <= 30; i++) fs.writeFileSync(path.join(shelfDir, `item ${String(i).padStart(2, '0')} with a longish name.txt`), 'x');
    await drv.T('renderShelf');
    await sleep(200);
    g = await geo();
    check(g.chips.length >= 31 && g.shelf && g.shelf.h > 40 && g.shelf.h <= 120 && g.scrolls, `with ${g.chips.length} items it grows but stays a few lines high and scrolls (${g.shelf && Math.round(g.shelf.h)}px, scrolls ${g.scrolls})`);
    check(g.list && g.list.h > g.winH * 0.6, `the list keeps most of the window (${g.list && Math.round(g.list.h)}px of ${g.winH})`);

    /* A chip's x sends the item to the Recycle Bin: a moved file on the Shelf may be the only copy. */
    fs.writeFileSync(path.join(shelfDir, recycleName), 'recycle me');
    await drv.T('renderShelf');
    const clicked = await drv.ev(`(() => {
      const row = [...document.querySelectorAll('#shelfChips .shelf-chip-with-remove')].find((r) => r.querySelector('.shelf-chip')?.textContent.trim() === ${JSON.stringify(recycleName)});
      const rm = row && row.querySelector('.shelf-chip-remove');
      if (!rm) return false;
      rm.click();
      return true;
    })()`);
    const gone = await waitFor(() => !fs.existsSync(path.join(shelfDir, recycleName)));
    check(clicked && gone, "set up: a chip's x takes the item off the Shelf");
    recycled = recycleBinEntriesFor(recycleName, t0);
    check(recycled.length === 1, `and it is in the Recycle Bin, not deleted (${recycled.length} Recycle Bin entries for it, out of 1)`);
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    for (const ent of recycled) {
      for (const p of [ent.info, ent.data]) {
        try {
          fs.rmSync(p, { recursive: true, force: true });
        } catch (_) {}
      }
    }
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
  finished = true;
  if (failures.length) {
    console.log(`\nrunner-shelf: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-shelf: all checks passed');
}

/* The Recycle Bin keeps each item as a $R file beside a $I file holding its original path (UTF-16), in a
   folder per user SID on each drive. Returns { info, data } for every entry of this name recycled since t0,
   so the test can say the item was recycled and then take it back out. */
function recycleBinEntriesFor(name, t0) {
  let sid = '';
  try {
    /* Windows' own whoami by full path: Git's coreutils whoami comes first on PATH under Git Bash. */
    const whoami = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe');
    sid = execFileSync(whoami, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' }).trim().split(',').pop().replace(/"/g, '');
  } catch (_) {
    return [];
  }
  const dir = path.join(process.env.SystemDrive || 'C:', '\\$Recycle.Bin', sid);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const out = [];
  for (const n of names) {
    if (!n.startsWith('$I')) continue;
    const full = path.join(dir, n);
    try {
      if (fs.statSync(full).mtimeMs < t0 - 2000) continue;
      const original = fs.readFileSync(full).subarray(28).toString('utf16le').replace(/\0+$/, '');
      if (path.basename(original) !== name) continue;
      out.push({ info: full, data: path.join(dir, '$R' + n.slice(2)) });
    } catch (_) {}
  }
  return out;
}

/* A CDP call whose answer never comes leaves nothing pending, and Node then exits with code 0 mid-test,
   which run-all would count as a pass. */
let finished = false;
process.on('beforeExit', () => {
  if (finished) return;
  console.log('\nrunner-shelf: stopped part way, a page call never returned');
  process.exit(1);
});

main();
