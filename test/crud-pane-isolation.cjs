// CRUD pane-isolation regression: a delete in the ACTIVE pane must never mutate the INACTIVE pane's
// stored rows. This guards the June 2026 bug where a copy/delete in one pane was mirrored into the other
// (a file copied pane-to-pane appeared in both, and deleting either removed both). Root cause: the refresh
// path mirrored the active pane onto the inactive one (copyPaneState when the two panes shared a search)
// and re-ran the inactive-pane dance, applying the global delete tombstones to the inactive pane too.
// The fix makes the inactive pane a passive snapshot: it refreshes only when activated.
//
// Run: node test/crud-pane-isolation.cjs

const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    drv = await connect({ port: 9321, profile: 'tagfox-test-crud-isolation', scope: SCOPES.repo });
    const { T, diag, settle } = drv;
    log('Hook ready.');

    // Startup: both panes share the same search (split panes seed B from A), so this is the mirror case
    // that used to bleed. Kick the active search, then seed the inactive pane from it, and record the
    // inactive pane's stored row count before any CRUD.
    await T('runSearchNow', 'identity');
    await settle('active search');
    await T('refreshInactivePane', { singlePaneOnly: true }); // populate B once (mirrors A's scope)
    const s0 = await settle('startup');
    const p0 = structuralProblems(s0);
    if (p0.length) failures.push(`[startup] ${p0.join(' | ')}`);
    const bBefore = s0.paneB_state;
    const aBefore = s0.lastRows;
    log(`  start: active=A rows=${aBefore}, inactive B stored=${bBefore}`);
    if (!(aBefore > 0) || !(bBefore > 0)) failures.push(`expected both panes populated at start (A=${aBefore} B=${bBefore})`);

    // Pick a real path from the active pane and simulate deleting it: tombstone + the normal refresh path.
    const d = await diag();
    const victim = d.rows && d.rows[0] && d.rows[0].path;
    if (!victim) { failures.push('no row to delete'); }
    else {
      await T('tombstone', [victim]);
      await T('refreshNow'); // the F5 / disk-mutation refresh path, which must stay single-pane now
      const s1 = await settle('after delete in active pane A');
      const p1 = structuralProblems(s1);
      if (p1.length) failures.push(`[after-delete] ${p1.join(' | ')}`);
      log(`  after delete in A: active rows=${s1.lastRows}, inactive B stored=${s1.paneB_state}`);

      // The core assertion: the inactive pane was NOT touched by the active-pane delete.
      if (s1.paneB_state !== bBefore) {
        failures.push(`inactive pane bled: B stored ${bBefore} to ${s1.paneB_state} after a delete in A`);
      }
      // Sanity: the delete did take effect in the active pane (the tombstoned row is hidden).
      if (s1.lastRows >= aBefore) {
        failures.push(`delete had no effect in active pane (A rows ${aBefore} to ${s1.lastRows})`);
      }
    }

    // Switching to the inactive pane re-runs its own search, so it reflects disk truth on demand.
    await T('activatePane', 'B');
    const s2 = await settle('activate B');
    const p2 = structuralProblems(s2);
    if (p2.length) failures.push(`[activate-B] ${p2.join(' | ')}`);
    log(`  activated B: active rows=${s2.lastRows}`);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== CRUD PANE-ISOLATION RESULT ==========');
  if (!failures.length) console.log('PASS: a delete in the active pane leaves the inactive pane untouched');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
