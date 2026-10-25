// Enter on a keyboard-focused menu item must activate that item.
//
// Steve reported that a menu could be navigated with the arrows but Enter did nothing, while a click on the
// same entry worked. The global keydown handler treats a bare Enter as "open the selected result row" and
// yielded only to a hand-kept list of menus, which did not include that one, so it swallowed the key before
// the focused button could be clicked. The handler now yields to any open menu. This drives the current
// folder's subfolder menu (the breadcrumb's last ▾). The keys are sent as real CDP key events, because a
// synthetic .click() would pass either way.
//
// Run: node test/menu-enter.cjs

const { connect, SCOPES, APP_DIR, structuralProblems, sleep } = require('./harness.cjs');

const TOGGLE = `[...document.querySelectorAll('#breadcrumbBar .breadcrumb-dd-toggle')].pop()`;

async function main() {
  const failures = [];
  let drv;
  try {
    drv = await connect({ runner: true, profile: 'tagfox-test-menu-enter', scope: SCOPES.repo });
    console.log('Hook ready.');
    await drv.settle('startup');

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
    // Moving the results selection pulls focus into #resultsWrap, so any visit there means an arrow meant for
    // the menu was also handled by the list (the first ↓ from the menu's toggle button used to be).
    await drv.ev(`window.__listFocus = 0; document.getElementById('resultsWrap').addEventListener('focusin', () => __listFocus++); 1`);

    // Open the current folder's subfolders from its focused toggle, as the keyboard would leave it.
    const opened = await drv.ev(`(() => {
      const t = ${TOGGLE};
      if (!t) return false;
      t.focus();
      bootstrap.Dropdown.getOrCreateInstance(t).show();
      return true;
    })()`);
    let items = 0;
    for (let i = 0; i < 40 && opened; i++) {
      items = await drv.ev(`${TOGGLE}.parentElement.querySelectorAll('.dropdown-menu.show button.dropdown-item').length`);
      if (items >= 2) break;
      await sleep(150);
    }
    console.log(`  ${items >= 2 ? 'PASS' : 'FAIL'} the subfolder menu opens with the folder's subfolders (${items})`);
    if (items < 2) failures.push(`the subfolder menu of ${APP_DIR} showed ${items} folder(s), expected at least two`);

    await key('ArrowDown', 'ArrowDown', 40);
    await key('ArrowDown', 'ArrowDown', 40);
    const focused = await drv.ev(`(() => {
      const a = document.activeElement;
      const li = a && a.closest('li');
      return { inMenu: !!(a && a.classList.contains('dropdown-item') && ${TOGGLE}.parentElement.contains(a)), path: (li && li.dataset.breadcrumbFlyoutPath) || '', second: !!li && !!li.previousElementSibling };
    })()`);
    const arrowsOk = focused.inMenu && focused.second && !!focused.path;
    console.log(`  ${arrowsOk ? 'PASS' : 'FAIL'} two arrows land on the second folder (${focused.path})`);
    if (!arrowsOk) failures.push(`arrows left focus ${JSON.stringify(focused)}, expected the menu's second folder`);
    const listFocus = await drv.ev(`window.__listFocus`);
    console.log(`  ${listFocus ? 'FAIL' : 'PASS'} arrows stay in the menu (results list took focus ${listFocus} time(s))`);
    if (listFocus) failures.push(`the results list took focus ${listFocus} time(s) while arrowing through the menu`);

    await key('Enter', 'Enter', 13);
    await drv.settle('after Enter');
    const scope = await drv.ev(`document.getElementById('rootFolder').value`);
    const open = await drv.ev(`!!document.querySelector('#breadcrumbBar .dropdown-menu.show')`);
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const ok = !!focused.path && norm(scope) === norm(focused.path) && !open;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} Enter on the focused entry applies it: scope "${scope}", menu ${open ? 'still open' : 'closed'}`);
    if (!ok) failures.push(`Enter left scope "${scope}" (menu ${open ? 'open' : 'closed'}), expected "${focused.path}"`);

    const probs = structuralProblems(await drv.state());
    if (probs.length) failures.push('structural: ' + probs.join('; '));
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== MENU ENTER RESULT ==========');
  if (!failures.length) console.log('PASS: Enter activates the keyboard-focused entry of an open menu');
  else {
    console.log('FAIL:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
