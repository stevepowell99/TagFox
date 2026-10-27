// Settings "Hide the window's title bar": main.js reads tagfox-window-chrome.json at startup and, when it is
// on, creates the window with titleBarStyle 'hidden', so Windows draws only its window buttons over the
// page's top right. This launches with the setting seeded in the profile and checks:
//   - the page knows it is frameless, and the window buttons are really there (windowControlsOverlay);
//   - the drag strip is the top strip, the content starts below it, and the 3px gradient that is
//     .app-shell's own ::before stays 3px (the strip once took that pseudo-element and stretched it);
//   - nothing clickable sits under the window buttons, in the list or in the expanded Viewer, and nothing in
//     Settings sits in the drag strip, which takes clicks even under the panel;
//   - the window buttons take the page's colours, light and dark;
//   - with the setting off the window is framed as before (positive control: a test that never saw a
//     frameless window would pass the rest of this file on a framed one).
//
// Run: node test/window-chrome.cjs

const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  let drv;
  try {
    drv = await connect({
      profile: 'tagfox-test-window-chrome',
      profileFiles: { 'tagfox-window-chrome.json': JSON.stringify({ hideTitleBar: true }) },
    });
    console.log('Hook ready (title bar hidden).');
    await drv.settle('startup');

    const wco = await drv.ev(`(() => { const o = navigator.windowControlsOverlay; return o ? { visible: o.visible, r: o.getTitlebarAreaRect().toJSON() } : null; })()`);
    check(!!(wco && wco.visible), `window buttons are drawn over the page (${JSON.stringify(wco)})`);
    check(await drv.ev(`document.body.classList.contains('tagfox-frameless')`), 'body carries tagfox-frameless');
    const tba = (wco && wco.r) || { width: 0, height: 0 };

    // Every visible control's rect, flagged where it overlaps the window buttons' corner.
    const underButtons = (scopeSel) => drv.ev(`(() => {
      const tba = navigator.windowControlsOverlay.getTitlebarAreaRect();
      const hits = [];
      for (const el of document.querySelectorAll('${scopeSel} :is(button, a[href], input, select, [role="button"])')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (r.right > tba.right && r.top < tba.bottom) hits.push((el.id || el.className || el.tagName) + ' @' + Math.round(r.left) + ',' + Math.round(r.top));
      }
      return hits;
    })()`);

    const runner = await drv.ev(`(() => {
      const strip = getComputedStyle(document.body, '::after');
      const q = document.getElementById('query').getBoundingClientRect();
      return {
        stripH: parseFloat(strip.height), stripRegion: strip.webkitAppRegion || strip.getPropertyValue('-webkit-app-region'),
        gradientH: parseFloat(getComputedStyle(document.body, '::before').height),
        queryTop: q.top,
      };
    })()`);
    check(Math.abs(runner.stripH - tba.height) < 1 && runner.stripRegion === 'drag', `the drag strip is the title bar's height (${runner.stripH} vs ${tba.height}, ${runner.stripRegion})`);
    check(Math.abs(runner.gradientH - 3) < 0.5, `the gradient stays 3px (${runner.gradientH})`);
    check(runner.queryTop >= tba.height, `the search box starts below the strip (${Math.round(runner.queryTop)})`);
    let hits = await underButtons('body');
    check(hits.length === 0, `nothing clickable under the window buttons ${JSON.stringify(hits)}`);

    // Expanded Viewer (Shift+Space): starts below the strip and keeps its own header buttons clear.
    await drv.ev(`document.getElementById('btnPropsTheaterToggle').click(), 1`);
    await sleep(400);
    const th = await drv.ev(`(() => { const a = document.getElementById('propsAside'); const r = a.getBoundingClientRect(); return { on: a.classList.contains('props-theater'), top: r.top, w: r.width, vw: innerWidth }; })()`);
    check(th.on && th.top >= tba.height - 0.5, `expanded Viewer starts below the strip (top ${Math.round(th.top)})`);
    check(th.w > th.vw * 0.85, `expanded Viewer is near full width (${Math.round(th.w)} of ${th.vw})`);
    hits = await underButtons('#propsAside');
    check(hits.length === 0, `expanded Viewer: nothing clickable under the window buttons ${JSON.stringify(hits)}`);
    await drv.ev(`document.getElementById('btnPropsTheaterToggle').click(), 1`);

    // Settings: a drag region takes the click even under a panel drawn over it, so no control of the panel may
    // sit in the strip. Its x is the one that did (October 2026).
    await drv.ev(`(bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('settingsPanel')).show(), 1)`);
    await sleep(600);
    const inStrip = await drv.ev(`(() => {
      const h = navigator.windowControlsOverlay.getTitlebarAreaRect().height;
      const out = [];
      for (const el of document.querySelectorAll('#settingsPanel :is(button, a[href], input, select, [role="button"])')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.top < h - 0.5) out.push((el.id || el.className || el.tagName) + ' @' + Math.round(r.top));
      }
      const x = document.querySelector('#settingsPanel .btn-close').getBoundingClientRect();
      return { out, xTop: x.top, xH: x.height };
    })()`);
    check(inStrip.xH > 0 && inStrip.out.length === 0, `Settings: nothing clickable in the drag strip, its x included (x at ${Math.round(inStrip.xTop)}) ${JSON.stringify(inStrip.out)}`);
    await drv.ev(`(bootstrap.Offcanvas.getInstance(document.getElementById('settingsPanel'))?.hide(), 1)`);
    await sleep(500);

    // Colours: the window buttons follow the page; main keeps them in the profile for the next start.
    const chromeFile = path.join(drv.userData, 'tagfox-window-chrome.json');
    const readColours = async () => {
      await sleep(400);
      try { return JSON.parse(fs.readFileSync(chromeFile, 'utf8')); } catch (_) { return {}; }
    };
    const light = await readColours();
    await drv.T('runCommand', 'dark');
    const dark = await readColours();
    check(/^#[0-9a-f]{6}$/i.test(light.overlayColor || '') && /^#[0-9a-f]{6}$/i.test(dark.overlayColor || '') && light.overlayColor !== dark.overlayColor,
      `window buttons follow the theme (light ${light.overlayColor}/${light.overlaySymbolColor}, dark ${dark.overlayColor}/${dark.overlaySymbolColor})`);
    await drv.T('runCommand', 'dark');
    await drv.close();
    drv = null;

    // Positive control: the same checks' premise is false on a framed window. Its own port and profile, so
    // it cannot reach the instance just closed while that one is still going down.
    drv = await connect({ profile: 'tagfox-test-window-chrome-framed' });
    console.log('Hook ready (title bar shown).');
    const framed = await drv.ev(`({ frameless: document.body.classList.contains('tagfox-frameless'), wco: !!(navigator.windowControlsOverlay && navigator.windowControlsOverlay.visible) })`);
    check(!framed.frameless && !framed.wco, `with the setting off the window keeps its title bar (${JSON.stringify(framed)})`);
  } catch (e) {
    failures.push(String((e && e.stack) || e));
    console.log('  ERROR ' + ((e && e.stack) || e));
  } finally {
    if (drv) await drv.close();
  }
  console.log(failures.length ? `\nwindow-chrome: ${failures.length} FAILED` : '\nwindow-chrome: all passed');
  process.exit(failures.length ? 1 : 0);
}
main();
