// The doc tray: a doc window minimised the way its title-bar button does it (WM_SYSCOMMAND SC_MINIMIZE) is
// hidden, so Windows draws no stub on the desktop, and parks as a pill beside the Shelf; the pill restores it
// and its x closes it.
//
// By hand only: it shows a gmist window on screen for a few seconds, and needs the local gmist on 5173 (it
// loads a page that does not exist there, so gmist opens no file). Run: node test/manual-doc-tray.cjs
const { connect, sleep } = require('./harness.cjs');
const koffi = require('koffi');
const user32 = koffi.load('user32.dll');
const HWND = koffi.pointer('HWND', koffi.opaque());
const FindWindowW = user32.func('HWND __stdcall FindWindowW(str16 cls, str16 title)');
const IsWindow = user32.func('bool __stdcall IsWindow(HWND h)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(HWND h)');
const IsIconic = user32.func('bool __stdcall IsIconic(HWND h)');
const PostMessageW = user32.func('bool __stdcall PostMessageW(HWND h, uint32_t msg, uintptr_t w, intptr_t l)');

const LABEL = 'doctray check xkTODO.md';
const TITLE = LABEL + ' — gmist';

(async () => {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const waitFor = async (fn, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await fn();
      if (v) return v;
      await sleep(150);
    }
    return fn();
  };
  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-doctray' });
    await drv.settle('startup');
    const tray = () =>
      drv.ev(`(() => {
        const t = document.getElementById('docTray');
        const b = t.getBoundingClientRect();
        const s = document.getElementById('appShelf').getBoundingClientRect();
        return {
          hidden: t.classList.contains('d-none'),
          pills: [...t.querySelectorAll('.tagfox-doc-pill')].map((p) => p.textContent.trim()),
          box: { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) },
          shelf: { top: Math.round(s.top), bottom: Math.round(s.bottom), right: Math.round(s.right) },
          winW: innerWidth, winH: innerHeight,
        };
      })()`);
    let t = await tray();
    check(t.hidden && !t.pills.length, `no doc windows: the tray is hidden (${JSON.stringify(t.pills)})`);

    const opened = await drv.ev(
      `window.tagBrowser.openGmistWindow({ url: 'http://localhost:5173/doctray-check-404', label: ${JSON.stringify(LABEL)} })`
    );
    check(opened && opened.ok, `set up: a gmist doc window opens (${JSON.stringify(opened)})`);
    const hwnd = await waitFor(() => {
      const h = FindWindowW(null, TITLE);
      return h && IsWindowVisible(h) ? h : null;
    });
    check(!!hwnd, `set up: the doc window is on screen ("${TITLE}")`);
    if (!hwnd) throw new Error('no doc window');

    PostMessageW(hwnd, 0x0112, 0xf020, 0); // WM_SYSCOMMAND SC_MINIMIZE, as the title-bar button sends
    t = await waitFor(async () => {
      const v = await tray();
      return v.pills.length ? v : null;
    });
    check(!IsWindowVisible(hwnd), 'minimised, the doc window is hidden, so Windows draws no stub on the desktop');
    check(t && !t.hidden && t.pills.length === 1 && /doctray check\.md/.test(t.pills[0]) && /^DO/.test(t.pills[0]), `and Whippet shows one pill for it, letters and tag-free name (${JSON.stringify(t && t.pills)})`);
    check(t && t.box.top >= t.shelf.top - 2 && t.box.bottom <= t.winH + 1 && t.box.left >= t.shelf.right - 1 && t.box.right <= t.winW + 1, `the pill sits on the Shelf's row, to its right, inside the window (${JSON.stringify(t && { tray: t.box, shelf: t.shelf, w: t.winW, h: t.winH })})`);

    await drv.ev(`document.querySelector('#docTray .tagfox-doc-pill').click()`);
    const back = await waitFor(() => IsWindowVisible(hwnd) && !IsIconic(hwnd));
    check(back, 'clicking the pill restores the window');
    t = await waitFor(async () => {
      const v = await tray();
      return v.hidden ? v : null;
    });
    check(t && t.hidden && !t.pills.length, `and the pill goes (${JSON.stringify(t && t.pills)})`);

    PostMessageW(hwnd, 0x0112, 0xf020, 0);
    await waitFor(async () => (await tray()).pills.length === 1);
    await drv.ev(`document.querySelector('#docTray .tagfox-doc-pill-close').click()`);
    const gone = await waitFor(() => !IsWindow(hwnd));
    check(gone, "the pill's x closes the window");
    t = await waitFor(async () => {
      const v = await tray();
      return v.hidden ? v : null;
    });
    check(t && t.hidden, 'and the tray empties');
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) await drv.close();
  }
  console.log(failures.length ? `\ndoctray-check: ${failures.length} failure(s)` : '\ndoctray-check: all checks passed');
  process.exit(failures.length ? 1 : 0);
})();
