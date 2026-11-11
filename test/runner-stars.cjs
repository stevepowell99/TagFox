// Ctrl+Shift+1…9 opens the Nth star. Stars hold files as well as folders, so the key asks the disk which one
// it has: a folder becomes the current folder, and a file opens. The starred file here is a shortcut (.lnk) to
// a folder, which TagFox follows itself, so the test opens nothing outside TagFox; were the file taken for a
// folder, the current folder would become the shortcut's own path instead of its target.
// The folder you are in is starred by Ctrl+D with no row selected, by the folder chip's star, and by /star.
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

    // The folder you are in is starred without going up to its parent: Ctrl+D with no row selected (as a
    // browser's Ctrl+D stars the page), the folder chip's star, and /star. The control: with a row selected,
    // Ctrl+D stars the row and leaves the folder alone.
    await drv.T('configure', { rootFolder: start });
    await drv.T('setQuery', '');
    await drv.T('runSearchNow');
    await drv.settle('into start');
    const folderStarred = async () => (await R()).stars.some((p) => same(p, start));
    const chipStar = () =>
      drv.ev(`(() => { const b = document.getElementById('btnScopeBarStar'); return { inChip: !!b && document.getElementById('runnerScopeChip').contains(b), on: !!b && b.classList.contains('results-row-star--on'), n: b?.querySelector('.results-row-star-num')?.textContent || '', disabled: !!b?.disabled }; })()`);
    s = await R();
    check(same(s.scope, start) && s.selected === '', `set up: in the folder with no row selected, the folder itself is the selection ("${path.basename(s.selected)}")`);
    let cs = await chipStar();
    check(cs.inChip && !cs.on && !cs.disabled, `the folder chip carries an unlit star (${JSON.stringify(cs)})`);
    await drv.ev(`(document.getElementById('query').focus(), 1)`);
    await drv.key('d', 'KeyD', 68, 2);
    await sleep(200);
    cs = await chipStar();
    check((await folderStarred()) && cs.on && cs.n === '3', `Ctrl+D with no row selected stars the folder itself, and the chip's star lights with its number (${JSON.stringify(cs)})`);
    await drv.key('d', 'KeyD', 68, 2);
    await sleep(200);
    check(!(await folderStarred()) && !(await chipStar()).on, 'Ctrl+D again unstars it');
    await drv.ev(`(document.getElementById('btnScopeBarStar').click(), 1)`);
    check((await folderStarred()) && (await chipStar()).on, "clicking the chip's star stars the folder");
    await drv.ev(`(document.getElementById('btnScopeBarStar').click(), 1)`);
    check(!(await folderStarred()), 'and clicking it again unstars it');
    for (const [k, code, vk] of [['/', 'Slash', 191], ['s', 'KeyS', 83], ['t', 'KeyT', 84], ['a', 'KeyA', 65], ['r', 'KeyR', 82]]) await drv.key(k, code, vk, 0, k);
    await sleep(200);
    const top = await drv.ev(`(document.querySelector('#runnerCmdList .tagfox-runner-cmd--active')?.textContent || '').trim()`);
    check(/^Star this folder/.test(top), `/star puts Star this folder first ("${top}")`);
    await drv.key('Enter', 'Enter', 13, 0, '\r');
    await sleep(200);
    check(await folderStarred(), '/star then Enter stars the folder');
    await drv.T('runCommand', 'star-folder');
    check(!(await folderStarred()), 'and the command again unstars it');
    await drv.ev(`(document.getElementById('query').focus(), 1)`);
    await drv.key('ArrowDown', 'ArrowDown', 40);
    s = await R();
    await drv.key('d', 'KeyD', 68, 2);
    await sleep(200);
    const after = (await R()).stars;
    check(!!s.selected && after.some((p) => same(p, s.selected)) && !after.some((p) => same(p, start)), `control: with a row selected, Ctrl+D stars the row, not the folder (${path.basename(s.selected || '-')})`);
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
