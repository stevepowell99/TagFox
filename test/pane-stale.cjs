// Pane-stale regression: when a disk mutation touches the INACTIVE pane's scope (e.g. a file dropped into
// its folder), that pane is a passive snapshot and is not refreshed, so it must show an "out of date" badge.
// Refreshing the pane clears it. Guards the stale-awareness feature (June 2026).
//
// Run: node test/pane-stale.cjs

const path = require('path');
const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  const scope = SCOPES.repo;
  let drv;
  try {
    drv = await connect({ port: 9331, profile: 'tagfox-test-pane-stale', scope });
    const { T, settle } = drv;
    log('Hook ready.');

    // Split the results so the inactive pane (and its breadcrumb) is visible, and give BOTH panes the same
    // real scope folder (so the inactive pane has a breadcrumb to hang the badge on, and scope filtering works).
    await T('setSplit', 0.5);
    await T('setScope', scope);
    await settle('A scoped');
    await T('activatePane', 'B');
    await T('setScope', scope);
    await settle('B scoped');
    await T('activatePane', 'A');
    const s0 = await settle('startup');
    if (structuralProblems(s0).length) failures.push(`[startup] ${structuralProblems(s0).join(' | ')}`);
    if (s0.paneB_stale) failures.push('inactive pane started stale');
    if (s0.staleBadgeShown) failures.push('stale badge shown before any mutation');
    log(`  start: active=${s0.activeResultsPane}, B stale=${s0.paneB_stale}, badge=${s0.staleBadgeShown}`);

    // A copy whose destination is under the inactive pane's scope: it should flag the inactive pane stale.
    await T('mutate', { destFolder: scope, copied: [path.join(scope, 'zzz-dropped.txt')] });
    const s1 = await settle('after mutation into inactive scope');
    if (structuralProblems(s1).length) failures.push(`[after-mutate] ${structuralProblems(s1).join(' | ')}`);
    if (!s1.paneB_stale) failures.push('inactive pane NOT marked stale after a mutation into its scope');
    if (!s1.staleBadgeShown) failures.push('stale badge NOT shown after the inactive pane went stale');
    if (s1.paneA_stale) failures.push('active pane wrongly marked stale');
    log(`  after mutate: B stale=${s1.paneB_stale}, badge=${s1.staleBadgeShown}, A stale=${s1.paneA_stale}`);

    // Refreshing the inactive pane (what clicking the badge does) clears the stale state and the badge.
    await T('refreshInactivePane', { singlePaneOnly: true });
    const s2 = await settle('after refresh');
    if (structuralProblems(s2).length) failures.push(`[after-refresh] ${structuralProblems(s2).join(' | ')}`);
    if (s2.paneB_stale) failures.push('inactive pane still stale after a refresh');
    if (s2.staleBadgeShown) failures.push('stale badge still shown after a refresh');
    log(`  after refresh: B stale=${s2.paneB_stale}, badge=${s2.staleBadgeShown}`);

    // A mutation that does NOT touch the inactive scope must not flag it (no false positives).
    await T('mutate', { destFolder: 'C:\\Windows\\Temp', copied: ['C:\\Windows\\Temp\\unrelated.txt'] });
    const s3 = await settle('after unrelated mutation');
    if (s3.paneB_stale) failures.push('inactive pane wrongly marked stale by an unrelated mutation');
    log(`  after unrelated mutate: B stale=${s3.paneB_stale}`);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== PANE-STALE RESULT ==========');
  if (!failures.length) console.log('PASS: inactive pane flags stale on a scope-affecting mutation and clears on refresh');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
