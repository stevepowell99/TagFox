// Hover preview (Settings "Preview on hover"): a large thumbnail while the pointer rests on a file row's icon.
// Steve found previews left stuck over the list. The cause was a repaint: the row under a resting pointer
// is replaced, so the browser never sends a mouseout for it, and a preview opened over a file stayed put
// once the list redrew into folders. This checks, in Runner:
//   - resting on the row's name shows nothing: only the icon at the left of the row opens a preview;
//   - resting on the icon opens it (positive control: a preview that never opened would pass the rest);
//   - a repaint that takes the row away from under the open preview, with the pointer not moving, closes it;
//   - the same repaint while the preview is still on its way stops it from opening;
//   - a key press closes it.
//
// Run: node test/hover-preview.cjs

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

/** A small real PNG (a diagonal gradient), so Windows makes a thumbnail of it. */
function pngBytes(size = 96) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 255) / size;
      raw[o + 1] = (y * 255) / size;
      raw[o + 2] = 160;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'hover-test-' + process.pid);
  fs.mkdirSync(path.join(root, 'subfolder'), { recursive: true });
  const pic = path.join(root, 'hoverpic.png');
  fs.writeFileSync(pic, pngBytes());
  fs.writeFileSync(path.join(root, 'hovernote.txt'), 'note\n');
  let drv;
  try {
    drv = await connect({ runner: true, profile: 'tagfox-test-hover', scope: root });
    console.log('Hook ready.');
    await drv.ev(`(() => { const c = document.getElementById('optHoverPreview'); c.checked = true; c.dispatchEvent(new Event('change')); return 1; })()`);

    const move = (x, y) => drv.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    const shown = () => drv.ev(`(() => { const p = document.querySelector('.tagfox-hover-preview'); return !!p && !p.classList.contains('d-none'); })()`);
    const waitShown = async (ms) => {
      for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
        if (await shown()) return true;
        await sleep(100);
      }
      return false;
    };
    const rects = () => drv.ev(`(() => {
      const tr = [...document.querySelectorAll('#tbody tr[data-thumb-path]')].find((r) => /hoverpic\\.png$/i.test(r.dataset.thumbPath));
      if (!tr) return null;
      const c = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      return { tile: c(tr.querySelector('.file-type-icon')), name: c(tr.querySelector('.name-badges-title')) };
    })()`);
    const waitRow = async (label) => {
      for (let i = 0; i < 40; i++) {
        await drv.T('runSearchNow', 'refresh');
        await drv.settle(label);
        const r = await rects();
        if (r) return r;
        await sleep(500);
      }
      return null;
    };

    // A repaint that puts another row under the resting pointer: the image row is filtered out.
    const repaintWithoutImage = async (label) => {
      await drv.T('setQuery', 'hovernote');
      await drv.T('runSearchNow', 'refresh', { uiHint: 'f5' });
      await drv.settle(label);
    };

    const baseQuery = 'hoverpic';
    await drv.T('setQuery', baseQuery);
    let r = await waitRow('row');
    check(!!r, 'the image row is listed');
    if (!r) throw new Error('the image row never appeared');
    await move(5, 5);
    await sleep(200);

    await move(r.name.x, r.name.y);
    check(!(await waitShown(1200)), "resting on the row's name opens no preview");

    await move(r.tile.x, r.tile.y);
    const opened = await waitShown(4000);
    check(opened, "resting on the row's icon opens the preview");

    // Repaint under the open preview with the pointer not moving: its row is gone, so it must close
    // and stay closed. (The same row repainted in place may reopen it: the pointer is on that icon.)
    await repaintWithoutImage('repaint');
    check(opened && !(await shown()) && !(await waitShown(1200)), 'a repaint that removes the row under the open preview closes it');

    // The same while the preview is still on its way: it must not open afterwards.
    await move(5, 5);
    await drv.T('setQuery', baseQuery);
    r = (await waitRow('row again')) || r;
    await move(r.tile.x, r.tile.y);
    await sleep(60);
    await repaintWithoutImage('repaint pending');
    check(!(await waitShown(1500)), 'a repaint before the preview arrives stops it opening');

    // A key press closes it.
    await move(5, 5);
    await drv.T('setQuery', baseQuery);
    r = (await waitRow('row for key')) || r;
    await move(r.tile.x, r.tile.y);
    const again = await waitShown(4000);
    await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await sleep(150);
    check(again && !(await shown()), `a key press closes the preview (opened: ${again})`);
    await move(5, 5);
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
    console.log(`\nhover-preview: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nhover-preview: all checks passed');
}
main();
