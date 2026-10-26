// Smoke test: a readable walkthrough of the main flows (search, refresh, typing against a refresh, and a
// change of scope folder).
// Each step settles, then checks the structural invariants.
// Run: node test/smoke.cjs

const fs = require('fs');
const path = require('path');
const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-smoke', scope: SCOPES.repo });
    const { T, settle } = drv;
    log('Hook ready.');

    const step = async (label, fn) => {
      await fn();
      const s = await settle(label);
      const probs = structuralProblems(s);
      if (probs.length) { log(`  FAIL ${label} :: ${probs.join(' | ')}`); failures.push(`[${label}] ${probs.join(' | ')}`); }
      else log(`  PASS ${label} (rows=${s.tbodyBase})`);
      return s;
    };

    await step('startup', async () => { await T('runSearchNow'); });
    await step('refresh loop (10x F5)', async () => { for (let i = 0; i < 10; i++) { await T('refreshNow'); await new Promise((r) => setTimeout(r, 40)); } });
    await step('type + refresh race', async () => { for (const q of ['m', 'ma', 'main']) { await T('setQuery', q); await T('refreshNow'); await new Promise((r) => setTimeout(r, 60)); } await T('setQuery', ''); });
    await step('search a different scope', async () => { await T('setQuery', 'js'); await T('setScope', SCOPES.vendor); await T('setQuery', ''); });
    await step('change scope while searching', async () => { await T('setQuery', 'json'); await T('setScope', SCOPES.scripts); await T('setQuery', ''); });
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) {
      await drv.close();
      // close() resolves only once the test Electron has ended, so the lockfile it holds open in its profile
      // is gone. One that resolved straight after the kill would leave the process being torn down for
      // seconds, which run-all.cjs reports as LEFT RUNNING.
      if (fs.existsSync(path.join(drv.userData, 'lockfile'))) failures.push('close() resolved while the test Electron still held its profile (lockfile)');
    }
  }

  console.log('\n========== SMOKE RESULT ==========');
  if (!failures.length) console.log('ALL CHECKS PASSED');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
