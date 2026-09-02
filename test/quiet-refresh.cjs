// Auto-refresh must be silent until something actually changes.
//
// The timer has always re-run the search every few seconds, but every tick rebuilt the whole table
// whether or not the rows had moved. That dropped the scroll position, disposed and remade every
// tooltip, and shifted the row under the pointer, which is why the setting sat at Off. A tick now
// compares what came back against what is on screen and repaints only on a real difference.
//
// This guards three things: a tick that finds nothing leaves the DOM nodes alone, a repaint keeps the
// scroll position, and a file appearing on disk still gets through.
//
// Run: node test/quiet-refresh.cjs

const fs = require('fs');
const http = require('http');
const path = require('path');
const { connect, SCOPES, sleep } = require('./harness.cjs');

const TMP = path.join(SCOPES.repo, '_tmp');
const STEM = 'quiet-refresh-probe';
/* Enough rows that the list really scrolls, or the scroll assertion below would pass on an empty box. */
const SEED_FILES = 40;
const seedPath = (i) => path.join(TMP, STEM + '-a' + String(i).padStart(2, '0') + '.txt');
const LATE = path.join(TMP, STEM + '-b.txt');

const SNAP = `JSON.stringify({
  stamped: document.querySelectorAll('#tbody tr[data-quiet-refresh-stamp]').length,
  rows: document.getElementById('tbody').childElementCount,
  scrollTop: document.getElementById('resultsScroll').scrollTop,
  hasLate: !!Array.from(document.querySelectorAll('#tbody tr')).find((t) => /${STEM}-b/.test(t.dataset.rowPath || '')),
})`;

const httpGet = (url) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('timeout')));
  });

/* Everything watches the USN journal, so a new file reaches the index within a moment rather than at
   once. Wait for the index rather than for a fixed sleep, or the test measures Everything's latency. */
async function waitForIndex(baseUrl, name, wantCount, maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const body = await httpGet(baseUrl + '/?s=' + encodeURIComponent(name) + '&j=1&count=1');
      const n = JSON.parse(body).totalResults;
      if (n >= wantCount) return n;
    } catch (_) {}
    await sleep(300);
  }
  return -1;
}

function cleanup() {
  for (let i = 0; i < SEED_FILES; i++) { try { fs.unlinkSync(seedPath(i)); } catch (_) {} }
  try { fs.unlinkSync(LATE); } catch (_) {}
}

async function main() {
  const failures = [];
  const check = (label, cond, extra) => {
    console.log((cond ? '  PASS ' : '  FAIL ') + label + (extra ? ' — ' + extra : ''));
    if (!cond) failures.push(label + (extra ? ' — ' + extra : ''));
  };

  fs.mkdirSync(TMP, { recursive: true });
  cleanup();
  for (let i = 0; i < SEED_FILES; i++) fs.writeFileSync(seedPath(i), 'seed\n');

  let drv;
  try {
    drv = await connect({ port: 9351, profile: 'tagfox-test-quiet-refresh' });
    const { ev, T, settle, baseUrl } = drv;

    const seeded = await waitForIndex(baseUrl, STEM + '-a', SEED_FILES);
    if (seeded < SEED_FILES) throw new Error('Everything indexed only ' + seeded + ' of ' + SEED_FILES + ' seed files');

    await T('setQuery', STEM);
    await T('runSearchNow', 'identity');
    await settle('query');
    await T('autoStart', 3);

    /* Stamp the live rows: an attribute set from outside survives only as long as the nodes do, so it
       says whether the table was rebuilt far more directly than a row count can. */
    const started = await ev(`(() => {
      const tb = document.getElementById('tbody');
      const sc = document.getElementById('resultsScroll');
      for (const tr of tb.children) tr.setAttribute('data-quiet-refresh-stamp', '1');
      sc.scrollTop = 60;
      return JSON.stringify({ rows: tb.childElementCount, scrollTop: sc.scrollTop });
    })()`);
    const start = JSON.parse(started);
    check('the seed files are in the results to begin with', start.rows >= SEED_FILES, JSON.stringify(start));
    check('the list is long enough to scroll', start.scrollTop > 0, 'scrollTop=' + start.scrollTop);
    if (!start.rows) throw new Error('nothing to test against');

    for (let i = 0; i < 4; i++) {
      await T('autoTick');
      await sleep(400);
    }
    const quiet = JSON.parse(await ev(SNAP));
    check('four quiet ticks rebuilt nothing', quiet.stamped === start.rows, JSON.stringify(quiet));
    check('the scroll position survived the quiet ticks', quiet.scrollTop === start.scrollTop, 'scrollTop=' + quiet.scrollTop);

    fs.writeFileSync(LATE, 'late\n');
    const late = await waitForIndex(baseUrl, STEM + '-b', 1);
    if (late < 1) throw new Error('Everything never indexed ' + LATE);
    let after = null;
    for (let i = 0; i < 10; i++) {
      await T('autoTick');
      await sleep(500);
      after = JSON.parse(await ev(SNAP));
      if (after.hasLate) break;
    }
    check('a new file on disk got through', !!(after && after.hasLate), JSON.stringify(after));
    check('and the table really was rebuilt for it', !!(after && after.stamped < start.rows), JSON.stringify(after));
    check('the scroll position survived that repaint too', !!(after && after.scrollTop === start.scrollTop), 'scrollTop=' + (after && after.scrollTop));
  } catch (e) {
    failures.push('ERROR: ' + (e && e.stack ? e.stack : e));
  } finally {
    if (drv) drv.close();
    cleanup();
  }

  console.log('\n========== QUIET AUTO-REFRESH RESULT ==========');
  if (failures.length) {
    console.log(failures.length + ' FAILURE(S):');
    for (const f of failures) console.log(' - ' + f);
    process.exit(1);
  }
  console.log('PASS: a tick repaints on a real change and not otherwise');
}

main();
