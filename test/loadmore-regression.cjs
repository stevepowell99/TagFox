// Regression test for the load-more / tab-state desync fix.
// Bug: loadMoreResults() grew lastRows (next page) but never saved it to the active tab's stored state,
// so a later restore reverted to the pre-load-more page and the extra rows vanished. Fix: loadMoreResults
// persists the active tab state in its finally.
// This test loads two extra pages and asserts the rows are both rendered and stored on the active tab.
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

    await T('setView', true, 'files');
    let s = await settle('search');
    const page1 = s.lastRows;
    log('page 1:', page1, 'rows');

    await T('loadMore'); s = await settle('loadMore1');
    await T('loadMore'); s = await settle('loadMore2');
    const grown = s.lastRows;
    log('after 2x load-more:', grown, 'rows (active tab state', s.activeTabRows, ')');
    if (!(grown > page1)) failures.push(`load-more did not add rows (page1=${page1}, grown=${grown})`);
    if (grown !== s.activeTabRows) failures.push(`load-more not saved to active tab: lastRows=${grown} tabRows=${s.activeTabRows}`);
    if (s.tbodyBase < grown) failures.push(`render mismatch: tbody=${s.tbodyBase} lastRows=${grown}`);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== LOAD-MORE REGRESSION ==========');
  if (!failures.length) console.log('PASS: load-more rows are stored on the active tab and rendered');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
