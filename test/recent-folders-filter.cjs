// Ctrl+L recent folders: the filter box narrows the list by fuzzy match, and Enter applies the best match.
//
// The history holds up to 300 paths now, so the menu is filtered rather than scrolled. Positive control: with
// no text typed every seeded path is listed, so "the filter hid everything" cannot pass as "the filter worked".
//
// Run: node test/recent-folders-filter.cjs

const path = require('path');
const { connect, SCOPES, APP_DIR, structuralProblems, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  let drv;
  try {
    drv = await connect({ port: 9315, profile: 'tagfox-test-recent-filter', scope: SCOPES.repo });
    await drv.settle('startup');

    const target = path.join(APP_DIR, 'test');
    const decoy = path.join(APP_DIR, 'scripts');
    const other = path.join(APP_DIR, 'vendor');
    await drv.ev(`localStorage.setItem('tagBrowserScopeFolderHist', ${JSON.stringify(JSON.stringify([decoy, other, target]))}); 1`);

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
    const allOk = all.length === 3;
    console.log(`  ${allOk ? 'PASS' : 'FAIL'} unfiltered list shows all ${all.length} seeded paths`);
    if (!allOk) failures.push(`unfiltered list had ${all.length} entries, expected 3`);

    await type('tes');
    const one = await items();
    const oneOk = one.length === 1 && one[0] === target;
    console.log(`  ${oneOk ? 'PASS' : 'FAIL'} "tes" narrows to the test folder (${JSON.stringify(one.map((x) => path.basename(x)))})`);
    if (!oneOk) failures.push(`"tes" listed ${JSON.stringify(one)}`);

    await drv.ev(`(() => { const f = document.getElementById('scopeFolderHistoryFilter'); f.value = ''; f.dispatchEvent(new Event('input')); return 1; })()`);
    await type('zzqx');
    const none = await drv.ev(`document.querySelector('#scopeFolderHistoryMenu .tagfox-hist-item .dropdown-item-text')?.textContent || ''`);
    const noneOk = /No folders match/.test(none);
    console.log(`  ${noneOk ? 'PASS' : 'FAIL'} a non-matching filter says so`);
    if (!noneOk) failures.push('no "No folders match" message for a non-matching filter');

    await drv.ev(`(() => { const f = document.getElementById('scopeFolderHistoryFilter'); f.value = ''; f.dispatchEvent(new Event('input')); return 1; })()`);
    await type('tes');
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
