// Randomized fuzz of Runner's search concurrency: a random sequence of user actions (typing, refresh, recency,
// view, scope, scheduled search, auto-refresh tick, load-more, and files made and deleted on disk), settling
// and checking invariants after each burst:
//   - structural (harness.structuralProblems): id integrity, the rows on screen against the rows to draw,
//     no deadlock
//   - consistency: the list a burst's searches left gives the same count as the same search run again,
//     unless the view changed between the two, load-more had grown the list (a search comes back with the
//     first page), or a file was made or deleted less than DISK_SETTLE_MS before the burst began.
//   - a tick must never run a search on a list grown by load-more, which would throw the extra pages away.
// A path the run never reached is a path it says nothing about, so counters record what the actions really
// did: a search that stepped aside for a newer one, a load-more that grew the list, a tick that ran a search,
// a tick skipped because the list was grown, a made file that reached the list, and a listed file that left
// it on its delete. A closing pass drives any path still at zero from a state set up for it, and the run
// fails if one stays at zero after that, which is what a dead path looks like (every tick was one while the
// harness's interval was 0).
// Run: node test/fuzz.cjs [iterations] [seed]

const fs = require('fs');
const path = require('path');
const { connect, structuralProblems, SCOPES, APP_DIR } = require('./harness.cjs');

const ITERS = Number(process.argv[2] || 60);
const SEED = Number(process.argv[3] || 999);
const DIR = path.join(APP_DIR, '_tmp', 'fuzz-' + process.pid);
// The repo and the fuzz's own folder come up most: the repo's broad queries run to thousands of rows, which
// gives load-more pages to load, and the files the fuzz makes and deletes are listed in its own folder.
const SCOPE_LIST = [SCOPES.repo, SCOPES.repo, SCOPES.repo, DIR, DIR, SCOPES.vendor, SCOPES.scripts, SCOPES.test];
const QUERIES = ['', 'm', 'js', 'main', '.json', 'fuzz'];
// Fast typing: one search per prefix in a single task, so the earlier ones are still queued when the next
// is asked for and must step aside.
const TYPED = ['main', 'json', 'fuzz'];
// A made or deleted file can reach Everything's index at any moment for about this long.
const DISK_SETTLE_MS = 3000;
const COVER_ATTEMPTS = 3;

let rngState = SEED >>> 0;
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 0xffffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (p) => String(p || '').toLowerCase();
// Load-more has grown the list past its first page, which a search or a refresh would collapse again.
const GROWN = '!!(resultsPagingCtx && resultsPagingCtx.singleOffset > resultsPagingCtx.pageSize)';

const REACHED = [
  ['stepAside', 'a search stepped aside for a newer one'],
  ['grew', 'a load-more grew the list'],
  ['tickRan', 'an auto-refresh tick ran a search'],
  ['tickSkippedGrown', 'a tick was skipped because load-more had grown the list'],
  ['madeListed', 'a file made on disk reached the list'],
  ['deletedOffList', 'a listed file left the list on its delete'],
];

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  const n = { stepAside: 0, grew: 0, tickRan: 0, tickSkippedGrown: 0, made: 0, madeListed: 0, deleted: 0, deletedOffList: 0 };
  const made = []; // files this run made and has not deleted
  const loadMoreIdle = {}; // why a load-more did nothing, by reason
  const seenListed = new Set();
  let fileSeq = 0;
  let lastDiskChange = 0;
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  let drv;
  try {
    drv = await connect({ runner: true, profile: 'tagfox-test-fuzz', scope: SCOPE_LIST[0] });
    const { T, ev, diag, settle, state } = drv;
    log('Fuzz', ITERS, 'iters, seed', SEED);
    // An interval of 0 (connect() switches the timer off) makes every tick return before it looks at anything.
    // So the interval is set and the timer stopped again: ticks then come only from the fuzz's own.
    await T('autoStart', 30);
    await ev('(stopAutoRefreshTimer(), 1)');
    await T('resetSearchCounters');
    const listed = async () => new Set((await T('runnerState')).rows.map(norm));
    const noteListed = async () => {
      const on = await listed();
      for (const f of made) if (on.has(norm(f)) && !seenListed.has(f)) { seenListed.add(f); n.madeListed++; }
      return on;
    };

    await T('runSearchNow', 'identity');
    let s = await settle('baseline');
    let probs = structuralProblems(s);
    if (probs.length) failures.push(`[baseline] ${probs.join(' | ')}`);

    // An auto-refresh tick. It returns at once while a search is under way, and must skip a list grown by
    // load-more; when nothing is under way, any search that starts during the call is the tick's own.
    const tick = async () => {
      const before = await ev(`({ grown: ${GROWN}, busy: searchInFlight || !!searchDebounceTimer, seq: searchRunSeq })`);
      await T('autoTick');
      if (before.busy) return;
      const ran = (await state()).searchRunSeq !== before.seq;
      if (ran && before.grown) failures.push('a tick ran a search on a list grown by load-more, which throws the extra pages away');
      else if (ran) n.tickRan++;
      else if (before.grown) n.tickSkippedGrown++;
    };
    // The other actions seldom leave more than a page on the list (Runner's pages are 300 rows and more),
    // which left load-more nothing to load: the repo at any age, with files and folders and a word found
    // thousands of times, does.
    const longList = async (word) => {
      await T('setRecency', 'all');
      await T('setView', true, 'all');
      await T('setScope', SCOPES.repo);
      await T('setQuery', word);
    };
    const typeFast = (word) => T('startSearches', [...word].map((_, i) => word.slice(0, i + 1)));
    const loadMore = async () => {
      const a = await state();
      const why = await ev('!(resultsPagingCtx && resultsPagingCtx.hasMore) ? "no more pages" : searchInFlight ? "a search under way" : resultsLoadMoreBusy ? "already loading" : ""');
      await T('loadMore');
      const b = await state();
      if (why) loadMoreIdle[why] = (loadMoreIdle[why] || 0) + 1;
      if (b.searchRunSeq === a.searchRunSeq && b.lastRows > a.lastRows) {
        n.grew++;
        // A refresh straight after load-more is the race that once threw the extra pages away.
        await tick();
      }
    };
    const makeFile = async () => {
      // A file arrives in the fuzz's folder, as a copy into it would.
      const f = path.join(DIR, `fuzz main ${++fileSeq}.js`);
      fs.writeFileSync(f, 'x');
      made.push(f);
      n.made++;
      lastDiskChange = Date.now();
      await T('mutate', { paths: [f], destFolder: DIR, copied: [f] });
    };
    // A made file is deleted, and the page is told as TagFox's own delete tells it (trashed). One on the list
    // goes first; with none listed, a delete happens one time in three, so made files build up to be listed.
    const deleteFile = async (always = false) => {
      if (!made.length) return;
      const on = await listed();
      const i = made.findIndex((f) => on.has(norm(f)));
      if (i < 0 && !always && rnd() > 1 / 3) return;
      const f = made.splice(Math.max(0, i), 1)[0];
      fs.rmSync(f, { force: true });
      n.deleted++;
      lastDiskChange = Date.now();
      await T('mutate', { paths: [f], trashed: true });
      if (i >= 0 && !(await listed()).has(norm(f))) n.deletedOffList++;
    };

    // [name, weight, action]. Load-more, ticks and file changes carry more weight because each does something
    // only in the right state (a long list, a grown list, a made file on the list).
    const actions = [
      ['type', 2, () => T('setQuery', pick(QUERIES))],
      ['long list', 2, () => longList(pick(['m', 'js', 'main']))],
      ['type fast', 1, () => typeFast(pick(TYPED))],
      ['refresh', 1, () => T('refreshNow')],
      ['recency', 1, () => T('setRecency', pick(['all', '1y', '1w']))],
      ['view', 1, () => T('setView', rnd() > 0.5, pick(['all', 'folders', 'files']))],
      ['scope', 1, () => T('setScope', pick(SCOPE_LIST))],
      ['schedule', 1, () => T('scheduleSearch', 'identity')],
      ['tick', 2, tick],
      ['load more', 3, loadMore],
      ['make file', 2, makeFile],
      ['delete file', 2, () => deleteFile()],
    ];
    const wheel = actions.flatMap(([, w], i) => Array(w).fill(i));
    const tries = Object.fromEntries(actions.map(([name]) => [name, 0]));

    for (let it = 0; it < ITERS; it++) {
      const burst = 1 + Math.floor(rnd() * 4);
      const did = [];
      const burstStart = Date.now();
      const burstSeq = (await state()).searchRunSeq;
      for (let b = 0; b < burst; b++) {
        const [name, , act] = actions[pick(wheel)];
        did.push(name);
        tries[name]++;
        try { await act(); } catch (e) { failures.push(`[iter ${it}] ${name}: ${e.message}`); }
        await sleep(Math.floor(rnd() * 100));
      }
      const label = `iter ${it} (${did.join(', ')})`;
      s = await settle(label);
      probs = structuralProblems(s);
      if (probs.length) { log(`  FAIL ${label} :: ${probs.join(' | ')}`); log('  DIAG: ' + JSON.stringify(await diag())); failures.push(`[${label}] ${probs.join(' | ')}`); }
      await noteListed();

      // consistency: the list this burst's searches left, against the same search run again
      const searched = s.searchRunSeq > burstSeq;
      const diskQuiet = lastDiskChange < burstStart - DISK_SETTLE_MS;
      if (!probs.length && searched && diskQuiet && !(await ev(GROWN))) {
        const count1 = s.lastRows; const d1 = await diag();
        await T('runSearchNow', 'identity');
        const s2 = await settle(label + ' [recheck]'); const d2 = await diag();
        const viewSame = d1.showSubfolders === d2.showSubfolders && d1.foldersOnly === d2.foldersOnly && d1.filesOnly === d2.filesOnly && d1.recencyMode === d2.recencyMode;
        if (s2.lastRows !== count1 && viewSame) { log(`  FAIL ${label} :: STALE ${count1} -> ${s2.lastRows}`); failures.push(`[${label}] stale: ${count1} -> ${s2.lastRows}`); }
      }
      if (failures.length > 8) { log('  too many failures, stopping'); break; }
    }
    n.stepAside = (await T('searchCounters')).stepAside;
    log('  tried ' + JSON.stringify(tries));
    log('  counters ' + JSON.stringify(n));
    log('  load-more did nothing: ' + JSON.stringify(loadMoreIdle));

    // The closing pass: each path still at zero, from a state set up for it.
    const madeFileListed = async () => {
      await T('setScope', DIR);
      await T('setQuery', '');
      if (!made.length) await makeFile();
      for (let i = 0; i < 12; i++) {
        await T('runSearchNow', 'identity');
        await settle('cover: own folder');
        const on = await noteListed();
        if (made.some((f) => on.has(norm(f)))) return;
        await sleep(400);
      }
    };
    const cover = {
      stepAside: () => typeFast('main'),
      grew: async () => { await longList('js'); await settle('cover: long list'); await loadMore(); },
      tickSkippedGrown: async () => { await longList('js'); await settle('cover: long list'); await loadMore(); },
      tickRan: async () => { await T('runSearchNow', 'identity'); await settle('cover: first page'); await tick(); },
      madeListed: madeFileListed,
      deletedOffList: async () => { await madeFileListed(); await deleteFile(true); },
    };
    const covered = [];
    for (const [k] of REACHED) {
      for (let attempt = 0; attempt < COVER_ATTEMPTS && !(n[k] > 0); attempt++) {
        if (!covered.includes(k)) covered.push(k);
        try {
          await cover[k]();
          await settle('cover: ' + k);
        } catch (e) { failures.push(`[closing pass] ${k}: ${e.message}`); }
        n.stepAside = (await T('searchCounters')).stepAside;
      }
    }
    if (covered.length) log('  closing pass drove: ' + covered.join(', ') + ' -> ' + JSON.stringify(n));
    for (const [k, what] of REACHED) {
      if (!(n[k] > 0)) failures.push(`never reached, even from a state set up for it: ${what} (${k} = ${n[k]})`);
    }
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
    fs.rmSync(DIR, { recursive: true, force: true });
  }

  console.log('\n========== FUZZ RESULT (seed ' + SEED + ') ==========');
  if (!failures.length) console.log('ALL ITERATIONS PASSED');
  else { console.log(`${failures.length} FAILURE(S):`); failures.slice(0, 20).forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
