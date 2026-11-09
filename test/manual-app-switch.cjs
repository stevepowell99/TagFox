// Enter on a Start menu app, against a real program: with no window open the shortcut starts the app; with
// one open, even minimised, the same call switches to it (restored) and starts nothing new. Then the same for
// a Store app, Calculator, through the shortcut main writes for it.
//
// By hand only: it starts Windows' Character Map and Calculator on screen for a few seconds, then closes each
// by the PID it found. It refuses to run while a Character Map is open, and skips the Calculator half while a
// Calculator is open, so it never touches one of yours. The
// test window is hidden and so never in front, which means Windows may refuse to hand it the foreground;
// that is reported, not failed, since in use Whippet is in front when Enter is pressed.
//
// Run: node test/manual-app-switch.cjs

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { connect, APP_DIR, sleep } = require('./harness.cjs');
const win32 = require('../win32.js');
const appWindows = require('../app-windows.js');

const CHARMAP = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'charmap.exe');

function charmapWindows(u) {
  return win32.topLevelWindows(u).filter((h) => {
    if (!u.IsWindowVisible(h)) return false;
    return path.win32.basename(win32.processIdentity(u, win32.pidOf(u, h)).exe).toLowerCase() === 'charmap.exe';
  });
}

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const u = win32.load();
  if (!u) throw new Error('koffi did not load: ' + win32.loadError());
  if (charmapWindows(u).length) {
    console.log('A Character Map is already open; close it and run again.');
    process.exit(1);
  }
  const root = path.join(APP_DIR, '_tmp', 'manual-app-switch-' + process.pid);
  const appRoot = path.join(root, 'Programs');
  fs.mkdirSync(appRoot, { recursive: true });
  const lnk = path.join(appRoot, 'Character Map.lnk');
  const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); $s.TargetPath=$env:TARGET; $s.Save()`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, LNK: lnk, TARGET: CHARMAP } });
  process.env.TAGFOX_TEST_APP_ROOTS = appRoot;
  process.env.TAGFOX_TEST_STORE_APPS = '1';

  const waitFor = async (fn, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(150);
    }
    return fn();
  };
  let drv;
  const pids = new Set();
  const calcPids = new Set();
  try {
    drv = await connect({ profile: 'tagfox-test-app-switch' });
    await drv.settle('startup');
    const go = (p = lnk) => drv.ev(`window.tagBrowser.appSwitchOrLaunch(${JSON.stringify(p)})`);

    let r = await go();
    check(r && r.ok && r.did === 'started', `with no window open, the shortcut starts the app (${JSON.stringify(r)})`);
    const first = await waitFor(() => charmapWindows(u)[0]);
    check(!!first, 'and its window appears');
    if (!first) throw new Error('Character Map did not open');
    pids.add(win32.pidOf(u, first));

    u.ShowWindow(first, 6); // SW_MINIMIZE
    await waitFor(() => u.IsIconic(first), 3000);
    r = await go();
    check(r && r.ok && r.did === 'switched' && /Character Map/i.test(r.title || ''), `with it open and minimised, the same call switches to it (${JSON.stringify(r)})`);
    check(await waitFor(() => !u.IsIconic(first), 3000), 'and restores it');
    console.log(`  INFO foreground handed over: ${r && r.foreground} (the hidden test window is not in front, so Windows may refuse)`);
    await sleep(500);
    const all = charmapWindows(u);
    for (const h of all) pids.add(win32.pidOf(u, h));
    check(all.length === 1, `and starts no second copy (${all.length} Character Map window(s))`);

    /* A Store app, through the shortcut main writes for it: Calculator, found by its AppUserModelID. */
    const calcId = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
    if (appWindows.findAppWindow({ aumid: calcId })) {
      console.log('  SKIP Store app: a Calculator is already open');
    } else {
      const calcLnk = path.join(drv.userData, 'Store apps', 'Calculator.lnk');
      check(!!(await waitFor(() => fs.existsSync(calcLnk), 45000)), `main wrote the Calculator shortcut (${calcLnk})`);
      r = await go(calcLnk);
      check(r && r.ok && r.did === 'started', `a Store app with no window starts (${JSON.stringify(r)})`);
      const calc = await waitFor(() => appWindows.findAppWindow({ aumid: calcId }), 15000);
      check(!!calc, `and its window is found by its AppUserModelID (${calc && calc.title})`);
      if (calc) {
        r = await go(calcLnk);
        check(r && r.ok && r.did === 'switched', `the same call then switches to it (${JSON.stringify(r)})`);
        for (const c of win32.children(u, calc.hwnd)) {
          if (win32.className(u, c) === 'Windows.UI.Core.CoreWindow') calcPids.add(win32.pidOf(u, c));
        }
        if (!calcPids.size) calcPids.add(win32.pidOf(u, calc.hwnd));
      }
    }
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) await drv.close();
    for (const pid of [...pids, ...calcPids]) {
      try {
        process.kill(pid);
      } catch (_) {}
    }
    for (const d of [root, drv && path.join(drv.userData, 'Store apps')]) {
      try {
        if (d) fs.rmSync(d, { recursive: true, force: true });
      } catch (_) {}
    }
  }
  if (failures.length) {
    console.log(`\nmanual-app-switch: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nmanual-app-switch: all checks passed');
  process.exit(0);
}

main();
