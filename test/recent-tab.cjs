// The global Ctrl+Shift+Space shows the last hour's changes anywhere. In Classic it resets the search in
// place: empty query, no scope folder, every option off but Match path, 1 hour recency. Runner's half is
// checked in runner-layout.cjs.
//
// main.js registers the OS-wide accelerator and sends 'tagfox-open-recent-tab'; the renderer half is
// openRecentTab(), driven here through the test hook. A real global keypress cannot be sent from a
// test without raising the window and fighting Steve's running TagFox for the accelerator.
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
    drv = await connect({ profile: 'tagfox-test-recent-tab', scope: SCOPES.repo });
    const { ev, T, settle } = drv;
    await settle('startup');
    const read = async () => JSON.parse(await ev(`JSON.stringify({
      q: document.getElementById('query').value,
      root: document.getElementById('rootFolder').value,
      rec: document.querySelector('input[name="tagFoxRecencyFilter"]:checked').value,
      cs: document.getElementById('optCase').checked,
      ww: document.getElementById('optWholeWord').checked,
      dia: document.getElementById('optDiacritics').checked,
      path: document.getElementById('optPath').checked,
    })`));

    // A busy search: a query, the repo as scope folder, a 1 day window, three options on and Match path off.
    await T('setQuery', 'readme');
    await ev(`(() => {
      document.getElementById('optRecency1d').checked = true;
      for (const id of ['optCase', 'optWholeWord', 'optDiacritics']) document.getElementById(id).checked = true;
      document.getElementById('optPath').checked = false;
      return 1;
    })()`);
    await T('runSearchNow', 'identity');
    await settle('busy');
    const before = await read();
    check('the search starts busy (positive control)',
      before.q === 'readme' && before.root !== '' && before.rec === '1d' && before.cs && before.ww && before.dia && !before.path,
      JSON.stringify(before));

    await T('openRecentTab');
    await settle('recent');
    const after = await read();
    check('query is empty', after.q === '', JSON.stringify(after.q));
    check('scope folder is empty', after.root === '', JSON.stringify(after.root));
    check('recency is 1 hour', after.rec === '1h', after.rec);
    check('every option is off but Match path', !after.cs && !after.ww && !after.dia && after.path, JSON.stringify(after));

    // The recency window really reaches the search, not just the radio button.
    const q = await ev(`appendRecencyToEverythingQuery('x')`);
    check('the search carries the 1 hour window (dm:>=…)', /dm:/.test(q), q);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }
  console.log('\n========== RECENT TAB RESULT ==========');
  if (!failures.length) console.log('PASS: Ctrl+Shift+Space resets the search to the last hour anywhere');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
