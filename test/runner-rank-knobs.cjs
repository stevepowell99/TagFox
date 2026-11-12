// Settings › Ranking: one slider per influence on the smart order, the middle being RUNNER_RANK's own weight.
// Two files match the query equally; the old one is starred and the new one is not, so by default the star
// (35) outweighs the new file's recency (15). Turning Starred off must put the new file first, at once and
// without a new search; Reset must put it back. The default order is the positive control: were the star not
// counted at all, turning it off would change nothing and the test would prove nothing.
//
// Run: node test/runner-rank-knobs.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-rank-knobs-' + process.pid);
  const word = 'knobplan' + process.pid;
  const fresh = path.join(root, `${word} alpha.txt`);
  const starred = path.join(root, `${word} beta.txt`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(fresh, 'x');
  fs.writeFileSync(starred, 'x');
  const yearAgo = new Date(Date.now() - 365 * 864e5);
  fs.utimesSync(starred, yearAgo, yearAgo);

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-rank-knobs', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const R = () => drv.T('runnerState');
    const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
    const order = async () => {
      const rows = (await R()).rows;
      return [rows.findIndex((r) => same(r, fresh)), rows.findIndex((r) => same(r, starred))];
    };
    const knob = (id) =>
      drv.ev(`(() => { const el = document.getElementById('rankKnob-${id}'); return el ? { value: el.value, shows: el.nextElementSibling.textContent } : null; })()`);
    const moveKnob = (id, pos) =>
      drv.ev(`(() => { const el = document.getElementById('rankKnob-${id}'); el.value = '${pos}'; el.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);

    // The profile outlives a run, so start with no stars and every knob in the middle.
    await drv.ev(`(localStorage.removeItem('tagBrowserFavFolders'), localStorage.removeItem('tagBrowserRunnerRankKnobs'), 1)`);
    await drv.T('toggleStar', starred);
    await drv.ev(`(document.getElementById('query').value = ${JSON.stringify(word)}, 1)`);
    let o = [-1, -1];
    for (let i = 0; i < 20 && o.includes(-1); i++) {
      await drv.T('runSearchNow');
      await drv.settle('search');
      o = await order();
      if (o.includes(-1)) await sleep(400);
    }
    check(!o.includes(-1), `both files are listed (positive control) (${o})`);

    const knobs = await drv.ev(`[...document.querySelectorAll('#runnerRankKnobs input[data-knob]')].map((el) => [el.dataset.knob, el.value, el.nextElementSibling.textContent])`);
    check(knobs.length === 7 && knobs.every(([, v, t]) => v === '4' && t === '×1'), `seven sliders, each in the middle at ×1 (${JSON.stringify(knobs)})`);
    check(await drv.ev(`document.getElementById('btnRunnerRankReset').disabled`), 'Reset is greyed out while every slider is in the middle');
    check(o[1] < o[0], `by default the starred old file ranks above the new one (${o})`);

    await drv.T('resetSearchCounters');
    await moveKnob('star', 0);
    o = await order();
    const k = await knob('star');
    check(o[0] < o[1], `with Starred off the new file ranks first (${o})`);
    check(k && k.shows === 'off', `the slider says "off" (${k && k.shows})`);
    check((await drv.T('searchCounters')).run === 0, 'moving a slider re-ranks without searching again');
    check((await drv.ev(`localStorage.getItem('tagBrowserRunnerRankKnobs')`)) === JSON.stringify({ match: 4, recency: 4, star: 0, use: 4, windowsRecent: 4, rankedDown: 4, tilde: 4 }), 'the position is saved');
    check(!(await drv.ev(`document.getElementById('btnRunnerRankReset').disabled`)), 'Reset is offered once a slider has moved');

    await moveKnob('star', 8);
    o = await order();
    check(o[1] < o[0] && (await knob('star')).shows === '×4', `at the right end, ×4, the starred file is first again (${o})`);

    await drv.ev(`(document.getElementById('btnRunnerRankReset').click(), 1)`);
    o = await order();
    const after = await knob('star');
    check(o[1] < o[0], `Reset puts the default order back (${o})`);
    check(after.value === '4' && after.shows === '×1', `Reset puts the slider back in the middle (${JSON.stringify(after)})`);
    check((await drv.ev(`localStorage.getItem('tagBrowserRunnerRankKnobs')`)) === null, 'Reset forgets the saved positions');

    // The / command opens Settings at the section, expanded.
    await drv.T('runCommand', 'settings-ranking');
    let opened = null;
    for (let i = 0; i < 20; i++) {
      opened = await drv.ev(`(() => ({ panel: document.getElementById('settingsPanel').classList.contains('show'), section: document.getElementById('settingsRankingDetails').classList.contains('show') }))()`);
      if (opened.panel && opened.section) break;
      await sleep(150);
    }
    check(opened.panel && opened.section, `the "Settings: Ranking" command opens Settings with Ranking expanded (${JSON.stringify(opened)})`);
  } catch (e) {
    failures.push('threw: ' + (e.stack || e.message || String(e)));
    console.log('  FAIL threw: ' + (e.stack || e.message));
  } finally {
    if (drv) await drv.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(failures.length ? `runner-rank-knobs: ${failures.length} failure(s)` : 'runner-rank-knobs: all checks passed');
  for (const f of failures) console.log('  - ' + f);
  process.exit(failures.length ? 1 : 0);
}
main();
