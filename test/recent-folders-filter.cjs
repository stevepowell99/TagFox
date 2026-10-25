// Ctrl+L recent folders: the filter box narrows the list by fuzzy match, ranks a contiguous match above one
// scattered across folders, and Enter applies the best match.
//
// The history holds up to 300 paths now, so the menu is filtered rather than scrolled. Positive control: with
// no text typed every seeded path is listed, so "the filter hid everything" cannot pass as "the filter worked".
// The match runs over the whole path, so the query uses letters the decoy paths cannot supply from the checkout's
// own folder name (`TagFox-runner\scripts` holds t, e and s in order, which once made "tes" match it).
//
// Run: node test/recent-folders-filter.cjs

const fs = require('fs');
const path = require('path');
const { connect, SCOPES, APP_DIR, structuralProblems, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-recent-filter', scope: SCOPES.repo });
    await drv.settle('startup');

    const target = path.join(APP_DIR, '_tmp', 'quokka-' + process.pid);
    fs.mkdirSync(target, { recursive: true });
    const decoy = path.join(APP_DIR, 'scripts');
    const other = path.join(APP_DIR, 'vendor');
    // Matches "quok" only one letter per folder; seeded most recent, so only the ranking can put it second.
    const scattered = path.join(APP_DIR, '_tmp', 'qa', 'ua', 'oa', 'ka');
    const isSubsequence = (q, t) => {
      let i = 0;
      for (const c of t.toLowerCase()) if (c === q[i]) i++;
      return i === q.length;
    };
    const QUERY = 'quok';
    if (isSubsequence(QUERY, decoy) || isSubsequence(QUERY, other)) throw new Error(`fixture: "${QUERY}" already matches a decoy under ${APP_DIR}`);
    await drv.ev(`localStorage.setItem('tagBrowserScopeFolderHist', ${JSON.stringify(JSON.stringify([scattered, decoy, other, target]))}); 1`);

    const key = async (k, code, vk, mods = 0) => {
      const text = k === 'Enter' ? '\r' : undefined;
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(120);
    };
    await key('Shift', 'ShiftLeft', 16);
    await sleep(300);
    await drv.ev(`document.activeElement && document.activeElement.blur(); 1`);

    const items = () => drv.ev(`Array.from(document.querySelectorAll('#scopeFolderHistoryMenu .tagfox-hist-item .dropdown-item')).map((b) => b.textContent)`);
    const type = async (s) => { await drv.send('Input.insertText', { text: s }); await sleep(150); };

    await key('l', 'KeyL', 76, 2); // Ctrl+L
    const focusOk = await drv.ev(`document.activeElement && document.activeElement.id === 'scopeFolderHistoryFilter'`);
    console.log(`  ${focusOk ? 'PASS' : 'FAIL'} Ctrl+L focuses the filter box`);
    if (!focusOk) failures.push('filter box not focused after Ctrl+L');

    const all = await items();
    const allOk = all.length === 4;
    console.log(`  ${allOk ? 'PASS' : 'FAIL'} unfiltered list shows all ${all.length} seeded paths`);
    if (!allOk) failures.push(`unfiltered list had ${all.length} entries, expected 4`);

    await type(QUERY);
    const one = await items();
    const oneOk = one.length === 2 && one[0] === target && one[1] === scattered;
    console.log(`  ${oneOk ? 'PASS' : 'FAIL'} "${QUERY}" narrows to its two matches, the contiguous one first (${JSON.stringify(one)})`);
    if (!oneOk) failures.push(`"${QUERY}" listed ${JSON.stringify(one)}`);

    await drv.ev(`(() => { const f = document.getElementById('scopeFolderHistoryFilter'); f.value = ''; f.dispatchEvent(new Event('input')); return 1; })()`);
    await type('zzqx');
    const none = await drv.ev(`document.querySelector('#scopeFolderHistoryMenu .tagfox-hist-item .dropdown-item-text')?.textContent || ''`);
    const noneOk = /No folders match/.test(none);
    console.log(`  ${noneOk ? 'PASS' : 'FAIL'} a non-matching filter says so`);
    if (!noneOk) failures.push('no "No folders match" message for a non-matching filter');

    await drv.ev(`(() => { const f = document.getElementById('scopeFolderHistoryFilter'); f.value = ''; f.dispatchEvent(new Event('input')); return 1; })()`);
    await type(QUERY);
    await key('Enter', 'Enter', 13);
    await drv.settle('after Enter');
    const scope = await drv.ev(`document.getElementById('rootFolder').value`);
    const open = await drv.ev(`document.getElementById('scopeFolderHistoryMenu').classList.contains('show')`);
    const ok = scope.replace(/[\/]+$/, '').toLowerCase() === target.toLowerCase() && !open;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} Enter in the filter applies the best match: scope "${scope}", menu ${open ? 'open' : 'closed'}`);
    if (!ok) failures.push(`Enter left scope "${scope}" (menu ${open ? 'open' : 'closed'}), expected "${target}"`);

    const probs = structuralProblems(await drv.state());
    if (probs.length) failures.push('structural: ' + probs.join('; '));
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
    try {
      fs.rmSync(path.join(APP_DIR, '_tmp', 'quokka-' + process.pid), { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n========== RECENT FOLDERS FILTER RESULT ==========');
  if (!failures.length) console.log('PASS: the recent-folders filter narrows fuzzily and Enter applies the best match');
  else {
    console.log('FAIL:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
