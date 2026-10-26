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
  const keysOf = new Map(); // a failure's index → the keys pressed for its check
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    const keys = drv ? drv.takeKeys() : [];
    if (ok) return;
    if (keys.length) keysOf.set(failures.length, keys);
    failures.push(label);
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
    const ctl = await drv.keyRecorderWorks();
    check(ctl.ok, `the page records a key raised in it, and that no key-table entry matched (positive control)${ctl.ok ? '' : ': ' + JSON.stringify(ctl.seen)}`);

    const R = () => drv.T('runnerState');
    const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
    // The key asks main whether the star is a file or a folder, so wait for the folder to change (up to 8s, as a
    // loaded machine needs) rather than a fixed pause.
    const ctrlShiftDigit = async (n, want) => {
      await drv.ev(`(() => { document.getElementById('query').focus(); return 1; })()`);
      const note = await drv.key(String(n), 'Digit' + n, 48 + n, 2 | 8);
      for (let i = 0; i < 32 && !same((await R()).scope, want); i++) await sleep(250);
      await drv.settle('star ' + n);
      return note;
    };

    // The profile outlives a run, and a run that failed part-way left its stars behind, so start with none.
    await drv.ev(`(localStorage.removeItem('tagBrowserFavFolders'), 1)`);
    await drv.T('toggleStar', starredFolder);
    await drv.T('toggleStar', lnk);
    let s = await R();
    check(s.stars.length === 2 && same(s.stars[0], starredFolder) && same(s.stars[1], lnk), `two stars, the folder first (${s.stars})`);

    // The first nine stars carry their number on the star, and its tooltip names the key. They are listed in root.
    await drv.T('configure', { rootFolder: root });
    for (let i = 0; i < 10; i++) {
      await drv.T('runSearchNow');
      await drv.settle('numbers');
      if ((await R()).rows.some((r) => same(r, starredFolder))) break;
      await sleep(400);
    }
    const nums = await drv.ev(`(() => { const out = {}; for (const tr of document.querySelectorAll('#resultsTable tbody tr')) { const b = tr.querySelector('.results-row-star'); const name = tr.querySelector('.results-td-name, td:nth-child(2)')?.textContent || tr.textContent; if (b) out[(/starred folder|to the target|start here|shortcut target/.exec(name) || ['?'])[0]] = { n: b.querySelector('.results-row-star-num')?.textContent || '', title: b.title }; } return out; })()`);
    check(nums['starred folder']?.n === '1' && nums['to the target']?.n === '2' && nums['start here']?.n === '', `the stars show their numbers, 1 and 2, and an unstarred row none (${JSON.stringify(Object.fromEntries(Object.entries(nums).map(([k, v]) => [k, v.n])))})`);
    check(/Ctrl\+Shift\+1/.test(nums['starred folder']?.title || ''), `the number's tooltip names its key ("${nums['starred folder']?.title}")`);
    await drv.T('configure', { rootFolder: start });
    await drv.T('runSearchNow');
    await drv.settle('back to start');

    const star1 = await ctrlShiftDigit(1, starredFolder);
    s = await R();
    check(same(s.scope, starredFolder), `Ctrl+Shift+1 makes the starred folder the current folder (folder "${s.scope}", status "${s.status}")`);
    const fate1 = await drv.keyFate(star1);
    check(fate1.includes('entry ran (Ctrl+Shift+1…9)'), `the page records the key-table entry Ctrl+Shift+1 ran (positive control: ${fate1})`);

    await ctrlShiftDigit(2, target);
    s = await R();
    check(same(s.scope, target), `Ctrl+Shift+2 opens the starred file: the shortcut is followed to its target (folder "${s.scope}", status "${s.status}")`);
    check(!same(s.scope, lnk), 'the starred file is not taken for a folder');
  } catch (e) {
    failures.push('threw: ' + (e.stack || e.message || String(e)));
    console.log('  FAIL threw: ' + (e.stack || e.message));
  } finally {
    // What became of the keys behind each failed check, asked of the page before it closes.
    if (drv) for (const [i, keys] of keysOf) failures[i] += ` [${(await Promise.all(keys.map(drv.keyFate))).join('; ')}]`;
    if (drv) await drv.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(failures.length ? `runner-stars: ${failures.length} failure(s)` : 'runner-stars: all checks passed');
  for (const f of failures) console.log('  - ' + f);
  process.exit(failures.length ? 1 : 0);
}
main();
