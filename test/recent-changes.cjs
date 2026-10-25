// The global Ctrl+Shift+Space shows the last hour's changes anywhere: it resets Runner's one search in place
// to Runner's own defaults, with no text, no scope folder and the last hour, and leaves every other filter
// off.
//
// main.js registers the OS-wide accelerator and sends 'tagfox-open-recent-changes'; the renderer half is
// openRecentChanges(), driven here through the test hook. A real global keypress cannot be sent from a
// test without raising the window and fighting Steve's running TagFox for the accelerator.
//
// Run: node test/recent-changes.cjs

const { connect, SCOPES } = require('./harness.cjs');

// Every filter Runner shows as a chip, so a reset that missed one leaves its chip up.
const ALL_CHIPS = ['sort', 'recency', 'content', 'path', 'system', 'tilde', 'temp', 'word', 'case', 'word-starts', 'this-folder', 'accents', 'tags', 'starred', 'deadline', 'hidden-until'];

async function main() {
  const failures = [];
  const check = (label, cond, extra) => {
    console.log((cond ? '  PASS ' : '  FAIL ') + label + (extra ? ' — ' + extra : ''));
    if (!cond) failures.push(label + (extra ? ' — ' + extra : ''));
  };
  let drv;
  try {
    drv = await connect({ runner: true, profile: 'tagfox-test-recent-changes', scope: SCOPES.repo });
    const { ev, T, settle } = drv;
    const read = async () => {
      const s = await T('runnerState');
      return { q: s.query, root: s.scope, chips: s.chips, rec: (await drv.diag()).recencyMode };
    };

    // A busy search: text, the repo as scope folder, and every filter that has a chip turned on.
    await T('setQuery', 'readme');
    await ev(`(() => {
      runnerSort = 'name';
      setRecencyFilterMode('1d');
      applyResultsViewRadiosToDom(isShowSubfolders(), 'files');
      for (const id of ['optCase', 'optWholeWord', 'optDiacritics', 'optHideTilde']) document.getElementById(id).checked = true;
      for (const id of ['optPath', 'optHideSpecial']) document.getElementById(id).checked = false;
      for (const k of [LS.runnerHideTemp, LS.runnerWordStarts, LS.runnerThisFolderOnly, LS.runnerStarredOnly]) localStorage.setItem(k, '1');
      activeTagKeys.add('TODO');
      setDeadlineRange('overdue');
      setShowHiddenUntil(true);
      return 1;
    })()`);
    await T('runSearchNow', 'identity');
    await settle('busy');
    const before = await read();
    const missing = ALL_CHIPS.filter((c) => !before.chips.includes(c));
    check('the search starts busy, with every chip up (positive control)',
      before.q === 'readme' && before.root !== '' && before.rec === '1d' && !missing.length,
      missing.length ? 'missing ' + missing.join(', ') : JSON.stringify(before));

    await T('openRecentChanges');
    await settle('recent');
    const after = await read();
    check('query is empty', after.q === '', JSON.stringify(after.q));
    check('scope folder is empty', after.root === '', JSON.stringify(after.root));
    check('recency is 1 hour', after.rec === '1h', after.rec);
    check('every other filter is back at Runner\'s default: only the hour has a chip', after.chips.join() === 'recency', after.chips.join(', '));

    // The recency window really reaches the search, not just the radio button.
    const q = await ev(`appendRecencyToEverythingQuery('x')`);
    check('the search carries the 1 hour window (dm:>=…)', /dm:/.test(q), q);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }
  console.log('\n========== RECENT CHANGES RESULT ==========');
  if (!failures.length) console.log('PASS: Ctrl+Shift+Space resets the search to the last hour anywhere');
  else { console.log(`${failures.length} FAILURE(S):`); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(failures.length ? 1 : 0);
}
main();
