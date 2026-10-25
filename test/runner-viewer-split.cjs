// The divider between Runner's list and its Viewer.
// This drives the real panel over CDP and checks:
//   - the divider takes no width of its own: the gap between the list's card and the Viewer's card is the
//     centre panel's right padding, as it was before the divider was shown in Runner;
//   - the Viewer starts at a third of the window, and nothing is stored until the divider is dragged;
//   - the gap is the grab band, and a point just inside the Viewer is not;
//   - a drag of 100px to the left widens the Viewer by 100px and stores that width;
//   - a double-click puts the Viewer back to a third and forgets the stored width;
//   - Alt+P hides the divider with the Viewer, and Shift+Space's full screen hides it too.
//
// Widths are read after pointerup, which flushes the pending frame: the test window is never shown,
// so requestAnimationFrame is not a reliable clock here.
//
// Run: node test/runner-viewer-split.cjs

const { connect } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-viewer-split' });
    console.log('Hook ready.');
    await drv.settle('startup');
    const { ev, T } = drv;

    const geo = () =>
      ev(`(() => {
        const split = document.getElementById('splitProps');
        const aside = document.getElementById('propsAside');
        const list = document.getElementById('resultsScroll');
        const wrap = document.querySelector('.center-wrap');
        const a = aside.getBoundingClientRect(), l = list.getBoundingClientRect(), s = split.getBoundingClientRect();
        const gapX = Math.round((l.right + a.left) / 2), y = Math.round(a.top + a.height / 2);
        return {
          splitShown: getComputedStyle(split).display !== 'none',
          splitW: Math.round(s.width),
          gap: Math.round(a.left - l.right),
          asideW: Math.round(a.width),
          wrapW: Math.round(wrap.getBoundingClientRect().width),
          gapIsSplit: document.elementFromPoint(gapX, y) === split,
          insideViewerIsSplit: document.elementFromPoint(Math.round(a.left + 3), y) === split,
          gapX, y,
          sized: document.body.classList.contains('tagfox-runner-viewer-sized'),
          stored: localStorage.getItem('tagBrowserRunnerViewerW'),
        };
      })()`);
    // A third of the row, less the Viewer's right margin (styles.css: calc(33.333% - 1.25rem)).
    const third = (g) => Math.round(g.wrapW / 3 - 20);

    let g = await geo();
    check(g.splitShown && g.splitW === 0, `the divider shows and takes no width (${JSON.stringify({ shown: g.splitShown, w: g.splitW })})`);
    check(g.gap === 20, `the gap between the list and the Viewer is the centre panel's 20px padding (${g.gap}px)`);
    check(Math.abs(g.asideW - third(g)) <= 2 && !g.sized && g.stored === null, `the Viewer starts at a third, nothing stored (${g.asideW}px against ${third(g)}px, stored ${g.stored})`);
    check(g.gapIsSplit, 'the gap is the grab band');
    check(!g.insideViewerIsSplit, 'a point just inside the Viewer is not the divider');

    const fire = (type, x, y) =>
      ev(`document.getElementById('splitProps').dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y}, button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: 'mouse' })), 1`);
    const before = g.asideW;
    await fire('pointerdown', g.gapX, g.y);
    await fire('pointermove', g.gapX - 100, g.y);
    await fire('pointerup', g.gapX - 100, g.y);
    g = await geo();
    check(Math.abs(g.asideW - (before + 100)) <= 1 && g.sized, `a drag of 100px left widens the Viewer by 100px (${before}px to ${g.asideW}px)`);
    check(g.stored === String(g.asideW), `the dragged width is stored (${g.stored})`);
    check(g.gap === 20, `the gap stays 20px after the drag (${g.gap}px)`);

    await ev(`document.getElementById('splitProps').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 1`);
    g = await geo();
    check(Math.abs(g.asideW - third(g)) <= 2 && !g.sized && g.stored === null, `a double-click puts it back to a third and forgets the width (${g.asideW}px, stored ${g.stored})`);

    const key = async (k, code, vk, mods) => {
      await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
    };
    await ev(`document.getElementById('query').focus(), 1`);
    await key('p', 'KeyP', 80, 1); // Alt+P
    g = await geo();
    check(!g.splitShown, 'Alt+P hides the divider with the Viewer');
    await key('p', 'KeyP', 80, 1);
    g = await geo();
    check(g.splitShown, 'Alt+P again shows it');

    await T('setPropsTheaterMode', true).catch(async () => ev(`document.getElementById('btnPropsTheaterToggle').click(), 1`));
    g = await geo();
    check(!g.splitShown, 'the full-screen Viewer hides the divider');
  } catch (e) {
    failures.push('threw: ' + (e && e.message));
    console.log('  FAIL threw:', e && e.message);
  } finally {
    if (drv) drv.close();
  }
  if (failures.length) {
    console.log(`\nrunner-viewer-split: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\nrunner-viewer-split: all checks passed');
}

main();
