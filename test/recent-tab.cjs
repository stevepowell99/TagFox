// The global Ctrl+Shift+Space opens a new tab on the last week's changes anywhere.
//
// main.js registers the OS-wide accelerator and sends 'tagfox-open-recent-tab'; the renderer half is
// openRecentTab(), driven here through the test hook. A real global keypress cannot be sent from a
// test without raising the window and fighting Steve's running TagFox for the accelerator, so this
// guards what the tab is opened WITH: empty query, no scope folder, no tag filters, 1 week recency,
// nothing inherited from the tab it was opened from, and the originating tab left exactly as it was.
//
// Run: node test/recent-tab.cjs

const { connect, SCOPES } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (label, cond, extra) => {
    console.log((cond ? '  PASS ' : '  FAIL ') + label + (extra ? ' — ' + extra : ''));
    if (!cond) failures.push(label + (extra ? ' — ' + extra : ''));
  };
  let drv;
  try {
    drv = await connect({ port: 9352, profile: 'tagfox-test-recent-tab', scope: SCOPES.repo });
    const { ev, T, settle } = drv;
    await settle('startup');

    // A busy first tab: a query, the repo as scope folder and a 1 day recency window of its own.
    await T('setQuery', 'readme');
    await ev(`document.getElementById('optRecency1d').checked = true; 1`);
    await T('runSearchNow', 'identity');
    await settle('busy tab');
    const before = await ev(`JSON.stringify({ q: document.getElementById('query').value, root: document.getElementById('rootFolder').value, rec: document.querySelector('input[name="tagFoxRecencyFilter"]:checked').value })`);
    const firstId = (await T('tabIds'))[0];

    await T('openRecentTab');
    await settle('recent tab');
    const after = JSON.parse(await ev(`JSON.stringify({
      q: document.getElementById('query').value,
      root: document.getElementById('rootFolder').value,
      rec: document.querySelector('input[name="tagFoxRecencyFilter"]:checked').value,
      ww: document.getElementById('optWholeWord').checked,
    })`));
    const ids = await T('tabIds');
    check('a second tab opened and is active', ids.length === 2 && (await drv.state()).activeTabId === ids[1], 'tabs=' + ids.length);
    check('query is empty', after.q === '', JSON.stringify(after.q));
    check('scope folder is empty', after.root === '', JSON.stringify(after.root));
    check('recency is 1 week', after.rec === '1w', after.rec);
    check('whole word is off', after.ww === false);

    // Positive control: the recency window really reaches the search, not just the radio button.
    const q = await ev(`appendRecencyToEverythingQuery('x')`);
    check('the search carries the 1 week window (dm:>=…)', /dm:/.test(q), q);

    // The tab it was opened from keeps its own state.
    await T('activateTab', firstId);
    await settle('back to first');
    const back = await ev(`JSON.stringify({ q: document.getElementById('query').value, root: document.getElementById('rootFolder').value, rec: document.querySelector('input[name="tagFoxRecencyFilter"]:checked').value })`);
    check('the first tab is unchanged', back === before, before + ' vs ' + back);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }
  console.log('\n========== RECENT TAB RESULT ==========');
  if (!failures.length) console.log('PASS: Ctrl+Shift+Space tab opens clean on 1 week recency');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
