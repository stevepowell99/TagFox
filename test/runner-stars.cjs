// Ctrl+Shift+1…9 opens the Nth star. Stars hold files as well as folders, so the key asks the disk which one
// it has: a folder becomes the current folder, and a file opens. The starred file here is a shortcut (.lnk) to
// a folder, which TagFox follows itself, so the test opens nothing outside TagFox; were the file taken for a
// folder, the current folder would become the shortcut's own path instead of its target.
//
// Run: node test/runner-stars.cjs

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-stars-' + process.pid);
  const start = path.join(root, 'start here');
  const starredFolder = path.join(root, 'starred folder');
  const target = path.join(root, 'shortcut target');
  const lnk = path.join(root, 'to the target.lnk');
  for (const d of [start, starredFolder, target]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(start, 'start note.txt'), 'x');
  fs.writeFileSync(path.join(target, 'inside the target.txt'), 'x');
  const ps = `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}'); $s.TargetPath = '${target.replace(/'/g, "''")}'; $s.Save()`;
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 30000 });

  let drv;
  try {
    check(fs.existsSync(lnk), 'the shortcut file was made (positive control)');
    drv = await connect({ profile: 'tagfox-test-runner-stars', scope: start });
    console.log('Hook ready.');
    await drv.settle('startup');

    const R = () => drv.T('runnerState');
    const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
    const ctrlShiftDigit = async (n) => {
      await drv.ev(`(() => { document.getElementById('query').focus(); return 1; })()`);
      const ev = { key: String(n), code: 'Digit' + n, windowsVirtualKeyCode: 48 + n, modifiers: 2 | 8 };
      await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev });
      await sleep(600);
      await drv.settle('star ' + n);
    };

    await drv.T('toggleStar', starredFolder);
    await drv.T('toggleStar', lnk);
    let s = await R();
    check(s.stars.length === 2 && same(s.stars[0], starredFolder) && same(s.stars[1], lnk), `two stars, the folder first (${s.stars})`);

    await ctrlShiftDigit(1);
    s = await R();
    check(same(s.scope, starredFolder), `Ctrl+Shift+1 makes the starred folder the current folder (folder "${s.scope}")`);

    await ctrlShiftDigit(2);
    s = await R();
    check(same(s.scope, target), `Ctrl+Shift+2 opens the starred file: the shortcut is followed to its target (folder "${s.scope}")`);
    check(!same(s.scope, lnk), 'the starred file is not taken for a folder');
  } catch (e) {
    failures.push('threw: ' + (e.stack || e.message || String(e)));
    console.log('  FAIL threw: ' + (e.stack || e.message));
  } finally {
    if (drv) drv.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(failures.length ? `runner-stars: ${failures.length} failure(s)` : 'runner-stars: all checks passed');
  for (const f of failures) console.log('  - ' + f);
  process.exit(failures.length ? 1 : 0);
}
main();
