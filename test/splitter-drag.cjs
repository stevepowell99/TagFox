// The Viewer splitter must track the pointer, and only the pointer.
//
// Two faults this guards against, both reported as the divider "having a mind of its own":
//   1. The Viewer holds iframes and the PDF preview runs in its own process, so a drag that crossed
//      one stopped delivering moves to this document: the divider froze, then jumped when the pointer
//      came back. A fixed transparent shield over the window for the length of the drag keeps every
//      hit test in this document.
//   2. The drag counted up to a fixed 1600px while CSS held the panel at 90vw, so past the visible
//      end of its travel the pointer bought nothing and had to be dragged all the way back before the
//      divider moved again, and the results pane could be crushed to a few pixels on the way.
//
// Widths are read after pointerup, which flushes the pending frame: the test window is never shown,
// so requestAnimationFrame is not a reliable clock here.
//
// Run: node test/splitter-drag.cjs

const { connect, SCOPES, sleep } = require('./harness.cjs');

const MIN_HITTABLE_PX = 12; // of a 21px window centred on the bar (6px bar inside a 22px grab band)

// Drag with real PointerEvents through the element the app binds, so the wiring under test is the
// wiring that ships (pointerdown -> capture -> pointermove on the splitter -> pointerup).
const DRAG = `(() => {
  const split = document.getElementById('splitProps');
  const aside = document.getElementById('propsAside');
  if (!split || !aside) return { error: 'splitter or viewer missing' };
  const width = () => Math.round(aside.getBoundingClientRect().width);
  const barX = () => {
    const r = split.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };
  const fire = (type, x, y) =>
    split.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: 'mouse' })
    );

  const out = { start: width() };

  // How wide is the grab band, measured the way the mouse sees it.
  const p0 = barX();
  let hit = 0;
  for (let dx = -10; dx <= 10; dx++) {
    const el = document.elementFromPoint(p0.x + dx, p0.y);
    if (el === split) hit++;
  }
  out.hit = hit;

  // Drag 1: straight 120px left. Also the shield checks, which only hold mid-drag.
  fire('pointerdown', p0.x, p0.y);
  out.shieldDuringDrag = !!document.querySelector('.tagfox-split-drag-shield');
  const ar = aside.getBoundingClientRect();
  const overViewer = document.elementFromPoint(Math.round(ar.left + ar.width / 2), Math.round(ar.top + ar.height / 2));
  out.viewerCoveredByShield = !!(overViewer && overViewer.classList.contains('tagfox-split-drag-shield'));
  fire('pointermove', p0.x - 120, p0.y);
  fire('pointerup', p0.x - 120, p0.y);
  out.shieldAfterDrag = !!document.querySelector('.tagfox-split-drag-shield');
  out.afterDrag120 = width();

  // Drag 2: far past the clamp. The panel must stop where the layout stops it, leaving the results
  // pane usable, and coming back to the same point must give the same width back.
  const p1 = barX();
  const results = document.querySelector('.results-viewer-wrap');
  
  fire('pointerdown', p1.x, p1.y);
  fire('pointermove', p1.x - 5000, p1.y);
  fire('pointerup', p1.x - 5000, p1.y);
  out.sharedWidth = results ? Math.round(results.getBoundingClientRect().width + aside.getBoundingClientRect().width) : 0;
  out.atClamp = width();
  out.resultsAtClamp = results ? Math.round(results.getBoundingClientRect().width) : 0;
  const p2b = barX();
  fire('pointerdown', p2b.x, p2b.y);
  fire('pointermove', p2b.x + 120, p2b.y);
  fire('pointerup', p2b.x + 120, p2b.y);
  out.afterBack120 = width();

  // A right-button press must not start a drag at all.
  const p2 = barX();
  split.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: p2.x, clientY: p2.y, button: 2, buttons: 2, pointerId: 2, isPrimary: true, pointerType: 'mouse' })
  );
  out.shieldAfterRightPress = !!document.querySelector('.tagfox-split-drag-shield');
  return out;
})()`;

async function main() {
  const failures = [];
  let drv;
  try {
    drv = await connect({ port: 9311, profile: 'tagfox-test-splitter', scope: SCOPES.repo });
    console.log('Hook ready.');
    await drv.settle('startup');
    await sleep(200);

    const d = await drv.ev(DRAG);
    if (!d || d.error) throw new Error(d ? d.error : 'drag probe returned nothing');

    const checks = [
      [d.hit >= MIN_HITTABLE_PX, `grab band: ${d.hit}/21 px land on the splitter (want >= ${MIN_HITTABLE_PX})`],
      [d.shieldDuringDrag, 'a drag shield exists while dragging'],
      [d.viewerCoveredByShield, 'the shield covers the Viewer, so a drag across a preview keeps its events'],
      [!d.shieldAfterDrag, 'the shield is gone once the drag ends'],
      [
        Math.abs(d.afterDrag120 - (d.start + 120)) <= 2,
        `dragging 120px left widened the Viewer by ${d.afterDrag120 - d.start}px (want 120)`,
      ],
      [
        d.resultsAtClamp >= 300,
        `dragged hard right, the results pane keeps ${d.resultsAtClamp}px (want >= 300; it used to be crushed to a sliver)`,
      ],
      [
        d.atClamp <= d.sharedWidth - 300,
        `at the clamp the Viewer is ${d.atClamp}px of the ${d.sharedWidth}px the two panes share (want it to leave the results pane 300px+)`,
      ],
      [
        Math.abs(d.afterBack120 - (d.atClamp - 120)) <= 2,
        `dragging 120px back off the clamp narrowed the Viewer to ${d.afterBack120}px (want ${d.atClamp - 120}: the divider moves at once, no dead travel)`,
      ],
      [!d.shieldAfterRightPress, 'a right-button press starts no drag'],
    ];
    for (const [ok, msg] of checks) {
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${msg}`);
      if (!ok) failures.push(msg);
    }
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== SPLITTER DRAG RESULT ==========');
  if (!failures.length) console.log('PASS: the Viewer splitter follows the pointer and releases cleanly');
  else {
    console.log('FAIL:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
