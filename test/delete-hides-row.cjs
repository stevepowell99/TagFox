// A delete hides its row at once and keeps it hidden through a refresh. The renderer side of a delete
// tombstones the paths (removeGonePathsFromUiNow, which the trashed IPC callback calls), because Everything
// can go on listing a file for a moment after it has gone. The row is only tombstoned: nothing on disk is
// touched.
//
// Run: node test/delete-hides-row.cjs

const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-delete-hides-row', scope: SCOPES.repo });
    const { T, diag, settle } = drv;
    log('Hook ready.');

    await T('runSearchNow');
    let s = await settle('search');
    const before = s.lastRows;
    const victim = (await diag()).rows?.[0]?.path;
    // Positive control: there is a row to delete.
    if (!(before > 0) || !victim) failures.push(`expected rows to start with (rows=${before})`);
    else {
      await T('tombstone', [victim]);
      s = await settle('after delete');
      const listed = async () => (await diag()).rows.some((r) => r.path === victim);
      if (s.lastRows >= before || (await listed())) failures.push(`the deleted row is still listed (rows ${before} to ${s.lastRows})`);

      await T('refreshNow');
      s = await settle('after refresh');
      log(`  rows ${before} before, ${s.lastRows} after the delete and a refresh`);
      if (s.lastRows >= before || (await listed())) failures.push(`a refresh brought the deleted row back (rows ${before} to ${s.lastRows})`);
      const p2 = structuralProblems(s);
      if (p2.length) failures.push(`[after-refresh] ${p2.join(' | ')}`);
    }
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== DELETE HIDES ROW RESULT ==========');
  if (!failures.length) console.log('PASS: a deleted row stays hidden through a refresh');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
