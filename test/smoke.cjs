// Tab smoke test: a readable walkthrough of the main flows (search, refresh, and tab open/switch/cycle).
// Each step settles, then checks the structural invariants.
// Run: node test/smoke.cjs

const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    drv = await connect({ port: 9301, profile: 'tagfox-test-smoke', scope: SCOPES.repo });
    const { T, ev, settle } = drv;
    log('Hook ready.');

    const step = async (label, fn) => {
      await fn();
      const s = await settle(label);
      const probs = structuralProblems(s);
      if (probs.length) { log(`  FAIL ${label} :: ${probs.join(' | ')}`); failures.push(`[${label}] ${probs.join(' | ')}`); }
      else log(`  PASS ${label} (tabs=${s.tabCount}, active=${s.activeTabId}, rows=${s.tbodyBase})`);
      return s;
    };

    await step('startup', async () => { await T('runSearchNow', 'identity'); });
    await step('refresh loop (10x F5)', async () => { for (let i = 0; i < 10; i++) { await T('refreshNow'); await new Promise((r) => setTimeout(r, 40)); } });
    await step('type + refresh race', async () => { for (const q of ['m', 'ma', 'main']) { await T('setQuery', q); await T('refreshNow'); await new Promise((r) => setTimeout(r, 60)); } await T('setQuery', ''); });
    await step('open a 2nd tab and search a different scope', async () => { await T('setQuery', 'js'); await T('newTab'); await T('setScope', SCOPES.vendor); await T('setQuery', ''); });
    await step('open a 3rd tab while searching', async () => { await T('setQuery', 'json'); await T('newTab'); await T('setScope', SCOPES.scripts); await T('setQuery', ''); });
    await step('cycle tabs forward and back', async () => { for (const d of [1, 1, -1, 1, -1]) { await T('cycleTab', d); await new Promise((r) => setTimeout(r, 50)); } });
    await step('activate first tab by id', async () => { const ids = await ev('window.__tagfoxTest.tabIds()'); await T('activateTab', ids[0]); });
    await step('close the active tab', async () => { const s = await drv.state(); await T('closeTab', s.activeTabId); });
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
