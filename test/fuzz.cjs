// Randomized dual-pane fuzz: a random sequence of user actions (type, refresh, pane switch, recency,
// view, scope, inactive-pane dance, auto-refresh tick), settling and checking invariants after each burst:
//   - structural (harness.structuralProblems): id integrity, base #tbody in active pane, render==data,
//     active-pane-state in sync, no deadlock
//   - consistency: re-running the same search gives the same count, UNLESS smart view changed the
//     subfolders/content toggles between the two searches (smart auto narrow/widen is non-idempotent).
// Run: node test/fuzz.cjs [iterations] [seed]

const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

const ITERS = Number(process.argv[2] || 60);
const SEED = Number(process.argv[3] || 999);
const SCOPE_LIST = [SCOPES.repo, SCOPES.vendor, SCOPES.scripts, SCOPES.test];
const QUERIES = ['', 'm', 'js', 'main', '.json'];

let rngState = SEED >>> 0;
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 0xffffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    drv = await connect({ port: 9302, profile: 'tagfox-test-fuzz', scope: SCOPE_LIST[0] });
    const { T, state, diag, settle } = drv;
    log('Fuzz', ITERS, 'iters, seed', SEED);

    await T('runSearchNow', 'identity');
    let s = await settle('baseline');
    let probs = structuralProblems(s);
    if (probs.length) failures.push(`[baseline] ${probs.join(' | ')}`);

    const actions = [
      () => T('setQuery', pick(QUERIES)),
      () => T('refreshNow'),
      () => T('activatePane', pick(['A', 'B'])),
      () => T('setRecency', pick(['all', '1y', '1w'])),
      () => T('setView', rnd() > 0.5, pick(['all', 'folders', 'files'])),
      () => T('setScope', pick(SCOPE_LIST)),
      () => T('scheduleSearch', 'identity'),
      () => T('refreshInactivePane', { singlePaneOnly: true }),
      () => T('autoTick'),
    ];

    for (let it = 0; it < ITERS; it++) {
      const burst = 1 + Math.floor(rnd() * 4);
      const did = [];
      for (let b = 0; b < burst; b++) { const a = Math.floor(rnd() * actions.length); did.push(a); try { await actions[a](); } catch (e) { failures.push(`[iter ${it}] action ${a}: ${e.message}`); } await sleep(Math.floor(rnd() * 100)); }
      const label = `iter ${it} (acts ${did.join(',')})`;
      s = await settle(label);
      probs = structuralProblems(s);
      if (probs.length) { log(`  FAIL ${label} :: ${probs.join(' | ')}`); log('  DIAG: ' + JSON.stringify(await diag())); failures.push(`[${label}] ${probs.join(' | ')}`); }

      // consistency: same search again -> same count, unless smart view toggled the view between them
      if (!probs.length) {
        const count1 = s.lastRows; const d1 = await diag();
        await T('runSearchNow', 'identity');
        const s2 = await settle(label + ' [recheck]'); const d2 = await diag();
        const viewSame = d1.showSubfolders === d2.showSubfolders && d1.foldersOnly === d2.foldersOnly && d1.filesOnly === d2.filesOnly && d1.recencyMode === d2.recencyMode;
        if (s2.lastRows !== count1 && viewSame) { log(`  FAIL ${label} :: STALE ${count1} -> ${s2.lastRows}`); failures.push(`[${label}] stale: ${count1} -> ${s2.lastRows}`); }
      }
      if (failures.length > 8) { log('  too many failures, stopping'); break; }
    }
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== FUZZ RESULT (seed ' + SEED + ') ==========');
  if (!failures.length) console.log('ALL ITERATIONS PASSED');
  else { console.log(`${failures.length} FAILURE(S):`); failures.slice(0, 20).forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
