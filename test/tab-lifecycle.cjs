// Tab lifecycle regression: open up to the cap, refuse past it, close down to one (never zero), cycle with
// wraparound, reorder by index, and spring-hover activation (the drag-onto-tab path). Checks structural
// invariants throughout.
// Run: node test/tab-lifecycle.cjs

const { connect, structuralProblems, SCOPES } = require('./harness.cjs');

const MAX_TABS = 10;

async function main() {
  const failures = [];
  const log = (...a) => console.log(...a);
  let drv;
  try {
    drv = await connect({ port: 9331, profile: 'tagfox-test-tab-lifecycle', scope: SCOPES.repo });
    const { T, ev, state, settle } = drv;
    log('Hook ready.');

    const check = async (label) => {
      const s = await settle(label);
      const probs = structuralProblems(s);
      if (probs.length) failures.push(`[${label}] ${probs.join(' | ')}`);
      return s;
    };

    await T('runSearchNow', 'identity');
    let s = await check('startup');
    if (s.tabCount !== 1) failures.push(`expected 1 tab at startup, got ${s.tabCount}`);

    // Open up to the cap.
    for (let i = s.tabCount; i < MAX_TABS; i++) { await T('newTab'); }
    s = await check('opened to cap');
    if (s.tabCount !== MAX_TABS) failures.push(`expected ${MAX_TABS} tabs, got ${s.tabCount}`);

    // Refuse the 11th.
    await T('newTab');
    s = await check('refuse past cap');
    if (s.tabCount !== MAX_TABS) failures.push(`tab cap breached: ${s.tabCount} > ${MAX_TABS}`);

    // Cycle wraps: from the active tab, N forward cycles return to the same tab.
    const startId = s.activeTabId;
    for (let i = 0; i < MAX_TABS; i++) { await T('cycleTab', 1); await new Promise((r) => setTimeout(r, 20)); }
    s = await check('cycle wrap');
    if (s.activeTabId !== startId) failures.push(`cycle wrap failed: ${startId} -> ${s.activeTabId} after ${MAX_TABS} steps`);

    // Reorder: move tab at index 0 to index 3.
    let ids = await ev('window.__tagfoxTest.tabIds()');
    const movedId = ids[0];
    await T('reorderTab', 0, 3);
    ids = await ev('window.__tagfoxTest.tabIds()');
    if (ids[3] !== movedId) failures.push(`reorder failed: tab ${movedId} not at index 3 (got ${ids[3]})`);
    await check('after reorder');

    // Spring-hover activation (the drag-onto-tab result): activates the hovered tab.
    ids = await ev('window.__tagfoxTest.tabIds()');
    const target = ids[ids.length - 1];
    await T('springHoverTab', target);
    s = await check('spring-hover activate');
    if (s.activeTabId !== target) failures.push(`spring-hover did not activate tab ${target} (active=${s.activeTabId})`);

    // Close down to one; never drops below a single tab.
    for (let i = 0; i < MAX_TABS + 2; i++) { const st = await state(); await T('closeTab', st.activeTabId); await new Promise((r) => setTimeout(r, 20)); }
    s = await check('close down to one');
    if (s.tabCount !== 1) failures.push(`expected 1 tab after closing all, got ${s.tabCount}`);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== TAB LIFECYCLE RESULT ==========');
  if (!failures.length) console.log('PASS: open/close/cap/cycle/reorder/spring-hover all sound');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
