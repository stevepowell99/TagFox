// The main window's × hides TagFox, and only a real quit ends it.
// Closing the window used to quit TagFox, which took the global shortcut with it, so the next press of the
// shortcut did nothing. This drives the real window and checks:
//   - WM_CLOSE posted to the main window (what the × sends) leaves TagFox running: the page still answers.
//     Positive control, run by hand on 25 October 2026: with the close handler switched off, the same
//     message ended the process. The renderer's own window.close() is no stand-in: it ends the window
//     without the close event the handler listens for;
//   - the options panel, and so the / list, offers Quit TagFox;
//   - quitTagFox (that command's route) ends the process, as File → Quit does through before-quit.
//
// Run: node test/close-hides.cjs

const koffi = require('koffi');
const { connect, sleep } = require('./harness.cjs');

const WM_CLOSE = 0x10;
const user32 = koffi.load('user32.dll');
const HWND = koffi.pointer('HWND', koffi.opaque());
const EnumProc = koffi.proto('bool __stdcall CloseHidesEnumProc(HWND hwnd, intptr_t lParam)');
const EnumWindows = user32.func('bool __stdcall EnumWindows(CloseHidesEnumProc *cb, intptr_t lParam)');
const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(HWND hwnd, _Out_ uint32 *pid)');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(HWND hwnd, _Out_ uint16 *buf, int n)');
const PostMessageW = user32.func('bool __stdcall PostMessageW(HWND hwnd, uint32 msg, uintptr_t w, intptr_t l)');

/** The process's top-level browser windows (class Chrome_WidgetWin_1). */
function browserWindowsOf(pid) {
  const out = [];
  const cb = koffi.register((h) => {
    const p = [0];
    GetWindowThreadProcessId(h, p);
    if (p[0] === pid) {
      const buf = new Uint16Array(64);
      const n = GetClassNameW(h, buf, 64);
      if (String.fromCharCode(...buf.slice(0, n)) === 'Chrome_WidgetWin_1') out.push(h);
    }
    return true;
  }, koffi.pointer(EnumProc));
  EnumWindows(cb, 0);
  koffi.unregister(cb);
  return out;
}

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  let drv;
  // An evaluation that gives up after ms: a window that has gone never answers.
  const answers = (expr, ms = 3000) => Promise.race([drv.ev(expr).then(() => true, () => false), sleep(ms).then(() => false)]);
  try {
    drv = await connect({ profile: 'tagfox-test-close-hides' });
    console.log('Hook ready.');
    await drv.settle('startup');
    await drv.T('setRunnerMode', true);
    await drv.settle('runner');

    const wins = browserWindowsOf(drv.pid);
    check(wins.length === 1, `set up: the test TagFox has one browser window (${wins.length})`);
    check(await answers('1 + 1'), 'set up: the page answers');
    if (wins.length === 1) PostMessageW(wins[0], WM_CLOSE, 0, 0);
    await sleep(1500);
    check(await answers('document.readyState'), 'closing the main window (WM_CLOSE) leaves TagFox running');

    const hasQuit = await drv.ev(`(() => { const b = document.getElementById('btnRunnerOpts'); b.click(); const on = !!document.querySelector('#runnerOptsPanel [data-cmd-id="quit"]'); b.click(); return on; })()`);
    check(hasQuit, 'the options panel, and so the / list, offers Quit TagFox');

    await drv.ev('window.tagBrowser.quitTagFox(), 1').catch(() => {});
    await sleep(2500);
    check(!(await answers('1 + 1')), 'Quit TagFox ends it');
  } catch (e) {
    failures.push('threw: ' + (e && e.message));
    console.log('  FAIL threw:', e && e.message);
  } finally {
    if (drv) drv.close();
  }
  if (failures.length) {
    console.log(`\nclose-hides: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\nclose-hides: all checks passed');
}

main();
