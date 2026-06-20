// Dual-pane smoke test: a readable walkthrough of the main flows that used to leave the active pane blank
// or render into the wrong pane. Each step settles, then checks the structural invariants.
// Run: node test/smoke.cjs

const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    drv = await connect({ port: 9301, profile: 'tagfox-test-smoke', scope: SCOPES.repo });
    const { T, settle } = drv;
    log('Hook ready.');

    const step = async (label, fn) => {
      await fn();
      const s = await settle(label);
      const probs = structuralProblems(s);
      if (probs.length) { log(`  FAIL ${label} :: ${probs.join(' | ')}`); failures.push(`[${label}] ${probs.join(' | ')}`); }
      else log(`  PASS ${label} (active=${s.activeResultsPane}, rows=${s.tbodyBase})`);
      return s;
    };

    await step('startup', async () => { await T('runSearchNow', 'identity'); });
    await step('refresh loop (10x F5)', async () => { for (let i = 0; i < 10; i++) { await T('refreshNow'); await new Promise((r) => setTimeout(r, 40)); } });
    await step('type + refresh race', async () => { for (const q of ['m', 'ma', 'main']) { await T('setQuery', q); await T('refreshNow'); await new Promise((r) => setTimeout(r, 60)); } await T('setQuery', ''); });
    await step('switch to B while searching, back to A', async () => { await T('setQuery', 'js'); await T('activatePane', 'B'); await T('refreshNow'); await T('activatePane', 'A'); await T('setQuery', ''); });
    await step('rapid A/B/A/B toggles', async () => { for (const p of ['B', 'A', 'B', 'A', 'B']) { await T('activatePane', p); await T('refreshNow'); await new Promise((r) => setTimeout(r, 50)); } await T('activatePane', 'A'); });
    await step('inactive-pane dance racing a scheduled search', async () => { await T('refreshInactivePane', { singlePaneOnly: true }); await T('scheduleSearch', 'identity'); });
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== SMOKE RESULT ==========');
  if (!failures.length) console.log('ALL CHECKS PASSED');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
