// CRUD tab-isolation regression: a delete in the ACTIVE tab must never mutate another tab's stored rows.
// With tabs, only the active tab has DOM and is refreshed; inactive tabs are passive state snapshots that
// re-run their own search on activation. This guards against a CRUD flow bleeding across tabs (the old
// dual-pane bug: a copy/delete in one pane appeared in / removed from the other).
//
// Run: node test/crud-pane-isolation.cjs

const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

const tabRows = (s, id) => { const t = s.tabs.find((x) => x.id === id); return t ? t.rows : -1; };

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    drv = await connect({ port: 9321, profile: 'tagfox-test-crud-isolation', scope: SCOPES.repo });
    const { T, diag, settle } = drv;
    log('Hook ready.');

    // Tab 1: run a search so it has rows.
    await T('runSearchNow', 'identity');
    let s = await settle('tab1 search');
    const tab1 = s.activeTabId;
    const aBefore = s.activeTabRows;

    // Open tab 2 (seeded from tab 1's search, so it too has rows). Tab 1 becomes inactive with stored rows.
    await T('newTab');
    s = await settle('tab2 open');
    const tab2 = s.activeTabId;
    const tab1Stored = tabRows(s, tab1);
    log(`  tab1(inactive) stored=${tab1Stored}, tab2(active) rows=${s.activeTabRows}`);
    const p0 = structuralProblems(s);
    if (p0.length) failures.push(`[two-tabs] ${p0.join(' | ')}`);
    if (!(aBefore > 0) || !(tab1Stored > 0)) failures.push(`expected both tabs populated (tab1=${tab1Stored} tab2=${s.activeTabRows})`);

    // Delete a real row from the ACTIVE tab (tab 2): tombstone + the normal refresh path.
    const d = await diag();
    const victim = d.rows && d.rows[0] && d.rows[0].path;
    if (!victim) { failures.push('no row to delete'); }
    else {
      await T('tombstone', [victim]);
      await T('refreshNow');
      s = await settle('after delete in tab2');
      const p1 = structuralProblems(s);
      if (p1.length) failures.push(`[after-delete] ${p1.join(' | ')}`);
      log(`  after delete in tab2: active rows=${s.activeTabRows}, tab1 stored=${tabRows(s, tab1)}`);

      // Core assertion: the inactive tab's stored rows were NOT touched by the active-tab delete.
      if (tabRows(s, tab1) !== tab1Stored) {
        failures.push(`inactive tab bled: tab1 stored ${tab1Stored} to ${tabRows(s, tab1)} after a delete in tab2`);
      }
      // Sanity: the delete took effect in the active tab (the tombstoned row is hidden).
      if (s.activeTabRows >= aBefore) {
        failures.push(`delete had no effect in active tab (rows ${aBefore} to ${s.activeTabRows})`);
      }
    }

    // Activating the other tab re-runs its own search, so it reflects disk truth on demand.
    await T('activateTab', tab1);
    s = await settle('activate tab1');
    const p2 = structuralProblems(s);
    if (p2.length) failures.push(`[activate-tab1] ${p2.join(' | ')}`);
    log(`  activated tab1: active rows=${s.activeTabRows}`);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== CRUD TAB-ISOLATION RESULT ==========');
  if (!failures.length) console.log('PASS: a delete in the active tab leaves other tabs untouched');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
