// Runner's status line: a bar docked along the bottom of the list's card, full width, over the list's foot, with
// the list running down to the Shelf. It holds the rotating tip until a message comes; a tip glows as it arrives
// and fades after its ten seconds. A message shows as a box, hides the tip, keeps the list where it was, and
// leaves the line to the tip once it has gone. Then the tips themselves: every key a tip names is a
// key Runner's key table lists (or a global shortcut), and every `/` command a tip names finds that command,
// so a tip cannot describe a key or a command that does not exist.
//
// Run: node test/runner-status.cjs

const path = require('path');
const fs = require('fs');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

/* Keys a tip may name that Runner's key table does not: the global shortcuts (main.js DEFAULT_GLOBAL_TOGGLE_ACCEL
   and RECENT_CHANGES_ACCEL) and modifiers held during a drag. */
const KEYS_OUTSIDE_TABLE = ['Ctrl+Alt+Space', 'Ctrl+Shift+Space', 'Alt', 'Shift'];
/* The command each `/` text in a tip must offer first. */
const SLASH_EXPECT = { '/todo': 'tag-todo', '/not todo': 'not-todo', '/size': 'sort-size', '/smallest': 'sort-size-asc', '/save': 'save-search' };

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-status-' + process.pid);
  fs.mkdirSync(root, { recursive: true });
  for (let i = 1; i <= 5; i++) fs.writeFileSync(path.join(root, `status note ${i}.txt`), 'x');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-status', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    await drv.T('renderShelf');

    const key = async (k, code, vk, mods = 0, text) => {
      await drv.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(150);
    };
    const geo = () =>
      drv.ev(`(() => {
        const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, bottom: b.bottom, h: b.height, w: b.width }; };
        const bar = document.getElementById('tagfoxNavbarStatus');
        const tip = document.getElementById('navbarDidYouKnow');
        const main = document.getElementById('statusMain');
        const cs = getComputedStyle(bar);
        return {
          bar: r(bar),
          list: r(document.getElementById('resultsWrap')),
          shelf: r(document.getElementById('appShelf')),
          on: document.body.classList.contains('tagfox-runner-status-on'),
          tipShown: !!tip && bar.contains(tip) && tip.offsetHeight > 0 && !tip.classList.contains('tagfox-navbar-dyk-faded'),
          tipText: tip ? tip.textContent.trim() : '',
          msgShown: main.offsetHeight > 0,
          msgText: main.textContent.trim(),
          bg: cs.backgroundColor,
          boxed: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(cs.borderTopWidth) >= 2,
        };
      })()`);

    // The bar docked along the bottom of the list, holding a tip; the list runs down to the Shelf.
    // The first search ran before the harness gave the page Everything's address, and its error stays up
    // for a few seconds, so wait for it to go before reading the bar at rest.
    for (let i = 0; i < 60 && (await geo()).on; i++) await sleep(250);
    await drv.T('showNextTip');
    await sleep(300);
    let g = await geo();
    const docked = (x) => x.bar && x.list && Math.abs(x.bar.bottom - x.list.bottom) <= 1 && Math.abs(x.bar.left - x.list.left) <= 1 && Math.abs(x.bar.w - x.list.w) <= 1 && x.bar.top > x.list.top;
    check(docked(g), `the status line is docked along the bottom of the list, full width (list ${g.list && Math.round(g.list.left)}-${g.list && Math.round(g.list.bottom)} w${g.list && Math.round(g.list.w)}, line ${g.bar && Math.round(g.bar.left)}-${g.bar && Math.round(g.bar.bottom)} w${g.bar && Math.round(g.bar.w)})`);
    check(g.list && g.shelf && g.shelf.top - g.list.bottom >= 0 && g.shelf.top - g.list.bottom <= 12, `and the list runs down to the Shelf (list to ${g.list && Math.round(g.list.bottom)}, Shelf from ${g.shelf && Math.round(g.shelf.top)})`);
    check(!g.on && g.tipShown && g.tipText.length > 20 && !g.msgShown, `with no message it shows a tip ("${g.tipText.slice(0, 70)}"; message ${g.on ? 'on' : 'off'} "${g.msgText.slice(0, 60)}")`);
    const idle = g;

    // A message: a box in the same place, the tip hidden, the list where it was.
    await drv.T('refreshNow');
    await drv.settle('refresh');
    g = await geo();
    check(g.on && g.msgShown && /Refreshed/.test(g.msgText) && !g.tipShown, `a message replaces the tip ("${g.msgText.slice(0, 60)}", tip shown ${g.tipShown})`);
    check(g.boxed && g.bg !== idle.bg, `and tints the bar with an accent edge, so it does not read as a tip (${g.bg} against ${idle.bg})`);
    check(docked(g), `still docked along the bottom of the list (line ${g.bar && Math.round(g.bar.left)}-${g.bar && Math.round(g.bar.bottom)})`);
    check(g.list && Math.abs(g.list.bottom - idle.list.bottom) <= 1, `the list does not move (${g.list && Math.round(g.list.bottom)} against ${Math.round(idle.list.bottom)})`);

    // Once the message has had its few seconds, the line is the tip's again.
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) {
      await sleep(250);
      g = await geo();
      gone = !g.on && !g.msgShown;
    }
    check(gone, `the message goes after its few seconds (message shown ${g.on})`);

    // A new tip glows as it arrives, and fades after its ten seconds.
    const tipAt = Date.now();
    await drv.T('showNextTip');
    await sleep(200);
    const arriving = await drv.ev(`document.getElementById('navbarDidYouKnow').classList.contains('tagfox-navbar-dyk-arrive')`);
    g = await geo();
    check(arriving && g.tipShown, `a new tip shows, glowing as it arrives (arriving ${arriving}, shown ${g.tipShown})`);
    let faded = false;
    for (let i = 0; i < 60 && !faded; i++) {
      await sleep(250);
      faded = !(await geo()).tipShown;
    }
    const shownFor = Math.round((Date.now() - tipAt) / 1000);
    check(faded && shownFor >= 9, `and fades after its ten seconds (gone after ${shownFor}s)`);

    // Every key a tip names is in Runner's key table, or is a global shortcut or a held modifier.
    const tips = await drv.ev('window.TagFoxDidYouKnowTips');
    const tableKeys = new Set([...(await drv.T('runnerKeyNames')), ...KEYS_OUTSIDE_TABLE]);
    const kbds = tips.flatMap((t) => t.tip.filter((s) => s && s.kbd).map((s) => s.kbd));
    const unknown = [...new Set(kbds.filter((k) => !tableKeys.has(k)))];
    check(kbds.length > 30 && unknown.length === 0, `every key the tips name is one Runner has (${kbds.length} named; not found: ${unknown.join(', ') || 'none'})`);

    // Every `/` command a tip names finds the command it describes.
    const slashes = [...new Set(tips.flatMap((t) => t.tip.filter((s) => s && s.code && s.code.startsWith('/')).map((s) => s.code)))];
    const wrong = [];
    for (const s of slashes) {
      await drv.T('setQuery', '');
      await drv.settle('empty');
      await drv.ev(`(() => { const q = document.getElementById('query'); q.focus(); return 1; })()`);
      await key('/', 'Slash', 191, 0, '/');
      await drv.send('Input.insertText', { text: s.slice(1) });
      await sleep(200);
      const st = await drv.T('runnerState');
      const first = st.cmdListOpen ? st.cmdMatches[0] : null;
      const want = SLASH_EXPECT[s];
      if (!first || (want && first !== want)) wrong.push(`${s} offers ${first || 'nothing'}${want ? ', not ' + want : ''}`);
      await key('Escape', 'Escape', 27);
    }
    const unlisted = slashes.filter((s) => !(s in SLASH_EXPECT));
    check(slashes.length >= 4 && wrong.length === 0 && unlisted.length === 0, `every / command the tips name is offered first (${slashes.join(', ')}${wrong.length ? '; ' + wrong.join('; ') : ''}${unlisted.length ? '; no expectation for ' + unlisted.join(', ') : ''})`);
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
  finished = true;
  if (failures.length) {
    console.log(`\nrunner-status: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-status: all checks passed');
}

/* A CDP call whose answer never comes leaves nothing pending, and Node then exits with code 0 mid-test,
   which run-all would count as a pass. */
let finished = false;
process.on('beforeExit', () => {
  if (finished) return;
  console.log('\nrunner-status: stopped part way, a page call never returned');
  process.exit(1);
});

main();
