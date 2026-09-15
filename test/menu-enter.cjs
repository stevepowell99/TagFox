// Enter on a keyboard-focused menu item must activate that item.
//
// Steve reported that Ctrl+L (recent folders) could be navigated with the arrows but Enter did nothing,
// while a click on the same entry worked. The global keydown handler treats a bare Enter as "open the
// selected result row" and yielded only to a hand-kept list of menus, which did not include this one, so
// it swallowed the key before the focused button could be clicked. The handler now yields to any open
// menu. The keys are sent as real CDP key events, because a synthetic .click() would pass either way.
//
// Run: node test/menu-enter.cjs

const path = require('path');
const { connect, SCOPES, APP_DIR, structuralProblems, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  let drv;
  try {
    drv = await connect({ port: 9314, profile: 'tagfox-test-menu-enter', scope: SCOPES.repo });
    console.log('Hook ready.');
    await drv.settle('startup');

    const target = path.join(APP_DIR, 'test');
    const decoy = path.join(APP_DIR, 'scripts');
    // Newest first: the first item gets focus on the first ArrowDown, so ArrowDown twice lands on `target`.
    await drv.ev(`localStorage.setItem('tagBrowserScopeFolderHist', ${JSON.stringify(JSON.stringify([decoy, target]))}); 1`);

    // Enter needs its text so Chromium raises the keypress that clicks a focused button, as a real key does.
    const key = async (k, code, vk, mods = 0) => {
      const text = k === 'Enter' ? '\r' : undefined;
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(120);
    };
    // A hidden test window runs no animation frames until its first input, so the startup focus-the-query
    // frame would otherwise fire in the middle of this test. Send a harmless key first to flush it.
    await key('Shift', 'ShiftLeft', 16);
    await sleep(300);
    await drv.ev(`document.activeElement && document.activeElement.blur(); 1`);
    // Moving the results selection pulls focus into #resultsWrap, so any visit there means an arrow meant for
    // the menu was also handled by the list (the first ↓ from the menu's toggle button used to be).
    await drv.ev(`window.__listFocus = 0; document.getElementById('resultsWrap').addEventListener('focusin', () => __listFocus++); 1`);
    await key('l', 'KeyL', 76, 2); // Ctrl+L
    const shown = await drv.ev(`document.getElementById('scopeFolderHistoryMenu').classList.contains('show')`);
    console.log(`  ${shown ? 'PASS' : 'FAIL'} Ctrl+L opens the recent-folders menu`);
    if (!shown) failures.push('Ctrl+L did not open #scopeFolderHistoryMenu');

    await key('ArrowDown', 'ArrowDown', 40);
    await key('ArrowDown', 'ArrowDown', 40);
    const focused = await drv.ev(`document.activeElement?.textContent || ''`);
    if (focused !== target) failures.push(`arrows focused "${focused.trim()}", expected "${target}"`);
    const listFocus = await drv.ev(`window.__listFocus`);
    console.log(`  ${listFocus ? 'FAIL' : 'PASS'} arrows stay in the menu (results list took focus ${listFocus} time(s))`);
    if (listFocus) failures.push(`the results list took focus ${listFocus} time(s) while arrowing through the menu`);

    await key('Enter', 'Enter', 13);
    await drv.settle('after Enter');
    const scope = await drv.ev(`document.getElementById('rootFolder').value`);
    const open = await drv.ev(`document.getElementById('scopeFolderHistoryMenu').classList.contains('show')`);
    const ok = scope.replace(/[\\/]+$/, '').toLowerCase() === target.toLowerCase() && !open;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} Enter on the focused entry applies it: scope "${scope}", menu ${open ? 'still open' : 'closed'}`);
    if (!ok) failures.push(`Enter left scope "${scope}" (menu ${open ? 'open' : 'closed'}), expected "${target}"`);

    const probs = structuralProblems(await drv.state());
    if (probs.length) failures.push('structural: ' + probs.join('; '));
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== MENU ENTER RESULT ==========');
  if (!failures.length) console.log('PASS: Enter activates the keyboard-focused recent-folders entry');
  else {
    console.log('FAIL:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
