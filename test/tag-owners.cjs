// Owner tags (`xp`) are a per-user setting, none by default. The status and label families are fixed in
// tags.js; the owner names come from tagfox-tag-owners.json in userData, which Settings writes.
//
// First the pure rules: the normaliser keeps 2 to 12 letters or digits, uppercased and de-duplicated, and
// drops a word of a fixed family; the setter replaces the owner family and nothing else. Then the app: a
// profile without the file recognises no owner tag (xpSAM is plain text, while xkTODO beside it is still
// a tag, so the parse is known to run); saving names in Settings writes the file, reloads the window and,
// after the reload, xpSAM is a tag and the options panel has a button for it; clearing the field takes
// them away again.
//
// Run: node test/tag-owners.cjs

const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('./harness.cjs');

require(path.join(__dirname, '..', 'tags.js'));
const Tn = globalThis.TagBrowserTags;

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // --- Pure rules -----------------------------------------------------------
  const norm = Tn.normaliseOwnerTags('sam, x  todo;Al-ex sam toolongname123 Q7');
  check(same(norm, ['SAM', 'ALEX', 'Q7']), `the normaliser keeps SAM, ALEX and Q7, drops x, TODO, the duplicate and the 14-character name (${JSON.stringify(norm)})`);
  check(same(Tn.normaliseOwnerTags(['bo', 'KEY']), ['BO']), 'an array works the same, and a label word is not an owner');
  check(Tn.ownerTags().length === 0, 'there are no owners by default');
  check(same(Tn.parseSegmentTags('plan xkTODO xpSAM.md').tags, ['TODO']), 'with no owners, xpSAM is part of the name and xkTODO is still a tag');
  Tn.setOwnerTags('sam');
  check(same(Tn.parseSegmentTags('plan xkTODO xpSAM.md').tags, ['TODO', 'SAM']), 'once SAM is an owner, xpSAM is a tag');
  check(Tn.TAG_VOCAB.TODO === 'xk' && Tn.TAG_VOCAB.KEY === 'xx' && Tn.TAG_VOCAB.SAM === 'xp', 'the fixed families stay beside the owner');
  Tn.setOwnerTags([]);
  check(!('SAM' in Tn.TAG_VOCAB) && Tn.TAG_VOCAB.TODO === 'xk', 'setting no owners removes SAM and keeps TODO');

  // --- The app --------------------------------------------------------------
  let drv;
  const ownersFile = () => path.join(drv.userData, 'tagfox-tag-owners.json');
  const readFile = () => {
    try {
      return JSON.parse(fs.readFileSync(ownersFile(), 'utf8'));
    } catch (_) {
      return null;
    }
  };
  /* Save through the Settings field, then wait for main's reload: a marker set before the click is gone
     once the page has reloaded, and the hook is back. */
  const saveOwners = async (text) => {
    await drv.ev(`(window.__ownersMarker = 1, document.getElementById('tagOwnersInput').value = ${JSON.stringify(text)}, document.getElementById('btnSaveTagOwners').click(), 1)`);
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      try {
        if (await drv.ev(`typeof window.__ownersMarker === 'undefined' && typeof window.__tagfoxTest === 'object' && !!window.__tagfoxTest`)) return true;
      } catch (_) {}
    }
    return false;
  };
  const panelHasTagButton = async (word) => {
    await drv.ev(`document.getElementById('btnRunnerOpts').click(), 1`);
    await sleep(200);
    const has = await drv.ev(`!!document.querySelector('#runnerOptsPanel [data-cmd-id="tag-${word}"]')`);
    await drv.ev(`document.getElementById('btnRunnerOpts').click(), 1`);
    await sleep(100);
    return has;
  };
  try {
    drv = await connect({ profile: 'tagfox-test-tag-owners', owners: null });
    console.log('Hook ready.');
    await drv.settle('startup');
    check(!fs.existsSync(ownersFile()), 'the profile starts without an owners file');
    check((await drv.ev(`TagBrowserTags.ownerTags().length`)) === 0, 'and the window has no owners');
    check(same(await drv.ev(`TagBrowserTags.parseSegmentTags('plan xkTODO xpSAM.md').tags`), ['TODO']), 'xpSAM is not a tag there, xkTODO is');
    check((await drv.ev(`document.getElementById('tagOwnersInput').value`)) === '', 'the Settings field is empty');
    const todoButton = await panelHasTagButton('todo');
    check(todoButton, 'the options panel has a TODO button (so the panel check below can find a button)');
    check(!(await panelHasTagButton('sam')), 'and no SAM button');

    const reloaded = await saveOwners('sam, x todo alex');
    check(reloaded, 'saving the owners reloads the window');
    await drv.settle('after saving owners');
    check(same(readFile(), { owners: ['SAM', 'ALEX'] }), `the file holds SAM and ALEX (${JSON.stringify(readFile())})`);
    check(same(await drv.ev(`TagBrowserTags.ownerTags()`), ['SAM', 'ALEX']), 'after the reload the window has SAM and ALEX, read back from the file');
    check(same(await drv.ev(`TagBrowserTags.parseSegmentTags('plan xkTODO xpSAM.md').tags`), ['TODO', 'SAM']), 'and xpSAM is a tag');
    check((await drv.ev(`document.getElementById('tagOwnersInput').value`)) === 'SAM, ALEX', 'the Settings field shows the names as saved');
    check(await panelHasTagButton('sam'), 'the options panel has a SAM button');

    const cleared = await saveOwners('');
    check(cleared, 'saving an empty field reloads the window too');
    await drv.settle('after clearing owners');
    check(same(readFile(), { owners: [] }), 'the file then holds no owners');
    check((await drv.ev(`TagBrowserTags.ownerTags().length`)) === 0, 'and the window has none');
    check(!(await panelHasTagButton('sam')), 'and the SAM button is gone');
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) await drv.close();
  }

  console.log('\n========== TAG OWNERS RESULT ==========');
  if (!failures.length) console.log('PASS: owner tags come from the setting, none by default, and survive a reload');
  else {
    console.log('FAIL:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
