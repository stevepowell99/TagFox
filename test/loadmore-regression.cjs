// Rows grown by load-more stay on screen through an auto-refresh tick.
// A refresh comes back with page one, so a tick after load-more would throw the extra pages away;
// autoRefreshTickWouldDisturb() skips the tick once the list has grown past its first page. The positive
// control comes first: on the first page a tick does run a search.
// Run: node test/loadmore-regression.cjs

const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    // Runner asks for at least RUNNER_RANK.fetchCap (300) rows a page, so the query is a file type found
    // thousands of times under the repo (node_modules included), which leaves a second page (hasMore). Typing
    // is what makes Runner search below the folder: an empty box lists only the folder's own contents.
    drv = await connect({ profile: 'tagfox-test-loadmore', scope: SCOPES.repo, autoRefresh: true });
    const { T, settle } = drv;

    await T('setQuery', '.js');
    let s = await settle('search');
    const page1 = s.lastRows;
    log('page 1:', page1, 'rows');
    await T('autoTick'); let t = await settle('tick on page 1');
    if (!(t.searchRunSeq > s.searchRunSeq)) failures.push(`a tick on the first page ran no search (seq ${s.searchRunSeq} -> ${t.searchRunSeq})`);

    await T('loadMore'); s = await settle('loadMore1');
    await T('loadMore'); s = await settle('loadMore2');
    const grown = s.lastRows;
    log('after 2x load-more:', grown, 'rows');
    if (!(grown > page1)) failures.push(`load-more did not add rows (page1=${page1}, grown=${grown})`);
    const p1 = structuralProblems(s);
    if (p1.length) failures.push(`[after load-more] ${p1.join(' | ')}`);
    await T('autoTick'); t = await settle('tick after load-more');
    log('after a tick:', t.lastRows, 'rows, tbody', t.tbodyBase);
    if (t.searchRunSeq !== s.searchRunSeq) failures.push(`a tick after load-more ran a search (seq ${s.searchRunSeq} -> ${t.searchRunSeq})`);
    if (t.lastRows !== grown) failures.push(`the grown rows did not survive the tick: lastRows ${grown} -> ${t.lastRows}`);
    const p2 = structuralProblems(t);
    if (p2.length) failures.push(`[after the tick] ${p2.join(' | ')}`);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) await drv.close();
  }

  console.log('\n========== LOAD-MORE REGRESSION ==========');
  if (!failures.length) console.log('PASS: load-more rows stay on screen through an auto-refresh tick');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
