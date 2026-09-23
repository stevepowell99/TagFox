// The global Ctrl+Shift+Space opens a tab on the last hour's changes anywhere, reusing an existing
// tab with an empty scope folder rather than piling up new ones.
//
// main.js registers the OS-wide accelerator and sends 'tagfox-open-recent-tab'; the renderer half is
// openRecentTab(), driven here through the test hook. A real global keypress cannot be sent from a
// test without raising the window and fighting Steve's running TagFox for the accelerator, so this
// guards what the tab is opened WITH and how often one is opened: empty query, no scope folder, no tag filters, 1 hour recency,
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
    check('recency is 1 hour', after.rec === '1h', after.rec);
    check('whole word is off', after.ww === false);

    // Positive control: the recency window really reaches the search, not just the radio button.
    const q = await ev(`appendRecencyToEverythingQuery('x')`);
    check('the search carries the 1 hour window (dm:>=…)', /dm:/.test(q), q);

    // The tab it was opened from keeps its own state.
    await T('activateTab', firstId);
    await settle('back to first');
    const back = await ev(`JSON.stringify({ q: document.getElementById('query').value, root: document.getElementById('rootFolder').value, rec: document.querySelector('input[name="tagFoxRecencyFilter"]:checked').value })`);
    check('the first tab is unchanged', back === before, before + ' vs ' + back);

    // Second press, from the scoped tab, with a dirty option set: the empty-scope tab is reused, not
    // a third tab opened, and it comes back reset.
    await ev(`document.getElementById('optCase').checked = true; 1`);
    await T('openRecentTab');
    await settle('reuse from scoped tab');
    const secondId = ids[1];
    const reused = JSON.parse(await ev(`JSON.stringify({ q: document.getElementById('query').value, root: document.getElementById('rootFolder').value, rec: document.querySelector('input[name="tagFoxRecencyFilter"]:checked').value, cs: document.getElementById('optCase').checked })`));
    check('no third tab: the empty-scope tab is reused', (await T('tabIds')).length === 2 && (await drv.state()).activeTabId === secondId);
    check('the reused tab is empty and on 1 hour', reused.q === '' && reused.root === '' && reused.rec === '1h' && reused.cs === false, JSON.stringify(reused));

    // Third press, from the empty-scope tab itself, after typing in it and widening the window.
    await T('setQuery', 'leftover text');
    await ev(`document.getElementById('optRecency1m').checked = true; document.getElementById('optDiacritics').checked = true; 1`);
    await T('openRecentTab');
    await settle('reuse in place');
    const inPlace = JSON.parse(await ev(`JSON.stringify({ q: document.getElementById('query').value, rec: document.querySelector('input[name="tagFoxRecencyFilter"]:checked').value, dia: document.getElementById('optDiacritics').checked })`));
    check('pressing it in that tab clears the text and resets the rest', (await T('tabIds')).length === 2 && inPlace.q === '' && inPlace.rec === '1h' && inPlace.dia === false, JSON.stringify(inPlace));

    // The scoped tab was never touched by any of this.
    await T('activateTab', firstId);
    await settle('first again');
    const last = await ev(`JSON.stringify({ q: document.getElementById('query').value, root: document.getElementById('rootFolder').value, rec: document.querySelector('input[name="tagFoxRecencyFilter"]:checked').value })`);
    check('the scoped tab still has its own state', last === before, last);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }
  console.log('\n========== RECENT TAB RESULT ==========');
  if (!failures.length) console.log('PASS: Ctrl+Shift+Space tab opens clean on 1 hour recency');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
