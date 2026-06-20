// Regression test for the load-more / pane-state desync fix.
// Bug: loadMoreResults() grew lastRows (next page) but never saved it to the active pane's stored state,
// so the background inactive-pane refresh (the dance) restored the pre-load-more page and the extra rows
// vanished. Fix: loadMoreResults persists the active pane state in its finally.
// This test loads a second page, runs the dance, and asserts the loaded rows survive.
// Run: node test/loadmore-regression.cjs

const { connect, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    // small page cap + a file-heavy scope so a second page exists (hasMore)
    drv = await connect({ port: 9303, profile: 'tagfox-test-loadmore', scope: SCOPES.vendor, maxResults: 20 });
    const { T, settle } = drv;
    const active = (s) => (s.activeResultsPane === 'A' ? s.paneA_state : s.paneB_state);

    await T('setView', true, 'files');
    let s = await settle('search');
    const page1 = s.lastRows;
    log('page 1:', page1, 'rows');

    await T('loadMore'); s = await settle('loadMore1');
    await T('loadMore'); s = await settle('loadMore2');
    const grown = s.lastRows;
    log('after 2x load-more:', grown, 'rows (active pane state', active(s), ')');
    if (!(grown > page1)) failures.push(`load-more did not add rows (page1=${page1}, grown=${grown})`);
    if (grown !== active(s)) failures.push(`load-more not saved to active pane: lastRows=${grown} paneState=${active(s)}`);

    // the dance restores the active pane from stored state WITHOUT re-searching it
    await T('refreshInactivePane', { singlePaneOnly: true });
    s = await settle('after-dance');
    log('after inactive-pane dance:', s.lastRows, 'rows, tbody', s.tbodyBase);
    if (s.lastRows !== grown) failures.push(`dance clobbered loaded rows: had ${grown}, now ${s.lastRows}`);
    if (s.tbodyBase < s.lastRows) failures.push(`render mismatch after dance: tbody=${s.tbodyBase} lastRows=${s.lastRows}`);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== LOAD-MORE REGRESSION ==========');
  if (!failures.length) console.log('PASS: load-more rows survive the inactive-pane refresh');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
