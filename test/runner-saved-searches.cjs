// Saved searches in Runner, by real key events against folders made for the test:
//   - `/save` offers "Save this search" first, and running it stores the folder, the text and a tag under
//     the text's name, after which the same command reads "Forget this saved search";
//   - after Alt+Home has cleared everything, Alt+1 brings back the folder, the text and the tag, and the tag
//     filter really applies: the tagged file is listed and the untagged one with the same name is not (the
//     positive control is that both are listed before the tag is set);
//   - `/` and a few letters of the name offer that saved search first, and Enter runs it the same way;
//   - Forget removes it;
//   - an entry in the format Classic saved, seeded into localStorage, comes back as a command named after
//     its folder, and Alt+1 and its command both take Runner to that folder; its Classic-only fields
//     (smart view, Subfolders, name sort) leave Runner's sort and view as they were;
//   - Alt+5 with no fifth saved search says so and changes nothing;
//   - the Alt+digit keydown is consumed (defaultPrevented), which is what keeps it from the window's menu
//     bar, and Runner's key table, which ? and Help are drawn from, lists Alt+1…9.
//
// Run: node test/runner-saved-searches.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'saved-searches-' + process.pid);
  const alpha = path.join(root, 'alpha place');
  const beta = path.join(root, 'beta place');
  fs.mkdirSync(alpha, { recursive: true });
  fs.mkdirSync(beta, { recursive: true });
  const tagged = path.join(alpha, 'budget xkTODO.txt');
  const plain = path.join(alpha, 'budget.txt');
  fs.writeFileSync(tagged, 't\n');
  fs.writeFileSync(plain, 'p\n');
  fs.writeFileSync(path.join(beta, 'beta note.txt'), 'b\n');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-saved-searches', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const { ev, T } = drv;
    await T('setRunnerMode', true);
    await drv.settle('runner');
    await ev(`(localStorage.removeItem('tagBrowserFavSearches'), 1)`);
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const R = () => T('runnerState');
    const has = (rows, p) => rows.some((r) => norm(r) === norm(p));
    const ALT = 1;
    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(200);
    };
    const type = async (s) => {
      await drv.send('Input.insertText', { text: s });
      await sleep(200);
    };
    const focusBox = () => ev(`(() => { const q = document.getElementById('query'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); return 1; })()`);
    const altDigit = async (n) => {
      await focusBox();
      await key(String(n), 'Digit' + n, 48 + n, ALT);
      await drv.settle('alt ' + n);
    };
    const slash = async (s) => {
      await focusBox();
      await key('/', 'Slash', 191, 0, '/');
      if (s) await type(s);
      return R();
    };
    const closeList = async () => {
      if ((await R()).cmdListOpen) await key('Escape', 'Escape', 27);
    };
    const saved = () => ev(`JSON.parse(localStorage.getItem('tagBrowserFavSearches') || '[]')`);
    const cmdLabel = (id) => ev(`(document.querySelector('#runnerCmdList [data-cmd-id="${id}"]')?.textContent || '').trim()`);
    const startAgain = async () => {
      await focusBox();
      await key('Home', 'Home', 36, ALT);
      await drv.settle('start again');
    };
    const waitRows = async (want, label) => {
      for (let i = 0; i < 20; i++) {
        await T('runSearchNow', 'identity');
        await drv.settle(label);
        const rows = (await R()).rows;
        if (want.every((p) => has(rows, p))) return rows;
        await sleep(400);
      }
      return (await R()).rows;
    };

    // The search to save: a folder, a word and a tag.
    await T('configure', { rootFolder: alpha });
    await focusBox();
    await type('budget');
    let rows = await waitRows([tagged, plain], 'budget');
    check(has(rows, tagged) && has(rows, plain), 'before the tag, both budget files are listed (the control for the tag filter)');
    await T('runCommand', 'tag-todo');
    await drv.settle('tag');

    let st = await slash('save');
    check(st.cmdListOpen && st.cmdMatches[0] === 'save-search', `/save offers "Save this search" first (${st.cmdMatches.slice(0, 3).join(', ')})`);
    await key('Enter', 'Enter', 13);
    await drv.settle('saved');
    let list = await saved();
    check(list.length === 1 && list[0].name === 'budget' && norm(list[0].rootFolder) === norm(alpha) && list[0].query === 'budget', `the search is saved under its text with its folder (${JSON.stringify(list[0] && { name: list[0].name, rootFolder: list[0].rootFolder, query: list[0].query })})`);
    check(list.length === 1 && JSON.stringify(list[0].activeTagKeys) === '["todo"]', 'with its tag');
    check(/Saved as “budget”, Alt\+1 runs it/.test((await R()).status), `the status line says how to run it ("${(await R()).status}")`);
    await slash('');
    check((await cmdLabel('save-search')) === 'Forget this saved search', `with it on screen the command reads Forget ("${await cmdLabel('save-search')}")`);
    check(/^Saved search: budget \(in alpha place, tagged TODO\) · Alt\+1$/.test(await cmdLabel('saved-search-1')), `the saved search is a command ("${await cmdLabel('saved-search-1')}")`);
    await closeList();

    // Alt+1 after starting again.
    await startAgain();
    st = await R();
    check(st.scope === '' && st.query === '' && !st.chips.includes('tags'), 'Alt+Home cleared the folder, the text and the tag');
    await ev(`(() => { window.__altSeen = null; window.addEventListener('keydown', (e) => { if (e.altKey && /^Digit/.test(e.code)) setTimeout(() => { window.__altSeen = e.defaultPrevented; }, 0); }, true); return 1; })()`);
    await altDigit(1);
    rows = await waitRows([tagged], 'alt 1 rows');
    st = await R();
    check(norm(st.scope) === norm(alpha) && st.query === 'budget' && st.chips.includes('tags'), `Alt+1 brings back the folder, the text and the tag (${JSON.stringify({ scope: st.scope, query: st.query, chips: st.chips })})`);
    check(has(rows, tagged) && !has(rows, plain), 'and the tag applies: the tagged file is listed, the untagged one is not');
    check((await ev('window.__altSeen')) === true, 'the Alt+1 keydown is consumed, so it never reaches the menu bar');

    // By command.
    await startAgain();
    st = await slash('bud');
    check(st.cmdMatches[0] === 'saved-search-1', `/bud offers the saved search first (${st.cmdMatches.slice(0, 3).join(', ')})`);
    await key('Enter', 'Enter', 13);
    await waitRows([tagged], 'by command');
    st = await R();
    check(norm(st.scope) === norm(alpha) && st.query === 'budget' && st.chips.includes('tags'), 'Enter on it brings back the same search');

    // Forget.
    await T('runCommand', 'save-search');
    check((await saved()).length === 0, 'Forget removes it');
    check(/Forgot the saved search “budget”/.test((await R()).status), 'and says so');

    // A Classic entry.
    await startAgain();
    const sortBefore = (await R()).sort;
    const classic = {
      query: '', rootFolder: beta, searchScopeMax: '', activeTagKeys: [], excludedTagKeys: [], tagFilterCombineOr: false,
      flatView: false, smartView: true, resultsLayout: 'smart', resultsContent: 'all', showSubfolders: true, hideFiles: false,
      optCase: false, optWholeWord: false, optPath: true, optDiacritics: false, optHideSpecial: true, optHideTilde: false,
      recencyFilter: 'all', sortColumn: 'name', sortAsc: true, advancedPanelOpen: false,
    };
    await ev(`(localStorage.setItem('tagBrowserFavSearches', ${JSON.stringify(JSON.stringify([classic]))}), 1)`);
    st = await slash('beta');
    check(st.cmdMatches[0] === 'saved-search-1', `a Classic entry comes back as a command, found by its folder's name (${st.cmdMatches.slice(0, 3).join(', ')})`);
    check(/^Saved search: beta place · Alt\+1$/.test(await cmdLabel('saved-search-1')), `named after its folder ("${await cmdLabel('saved-search-1')}")`);
    await key('Enter', 'Enter', 13);
    await drv.settle('classic by command');
    st = await R();
    check(norm(st.scope) === norm(beta) && st.query === '', `its command takes Runner to its folder (${st.scope})`);
    check(st.sort === sortBefore, `its Classic name sort is left out (sort ${st.sort})`);
    await startAgain();
    await altDigit(1);
    check(norm((await R()).scope) === norm(beta), 'and so does Alt+1');

    // An empty slot.
    const before = (await R()).scope;
    await altDigit(5);
    st = await R();
    check(/No saved search 5/.test(st.status) && st.scope === before, `Alt+5 with no fifth saved search says so and changes nothing ("${st.status}")`);

    const names = await T('runnerKeyNames');
    check(Array.isArray(names) && names.includes('Alt+1…9'), "Runner's key table lists Alt+1…9");
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  if (failures.length) {
    console.log(`\nrunner-saved-searches: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-saved-searches: all checks passed');
}

main();
