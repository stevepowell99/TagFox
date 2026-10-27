// The Settings drawer as / commands, read from its markup (runnerSettingsCommands): every section heading opens
// Settings at that section, every checkbox is a switch, and every choice in a list sets it. The counts are
// taken from the drawer itself, so a section added without a command fails here, and the switch and the list
// choice must change the control they name (a command that ran and changed nothing would otherwise pass).
//
// Run: node test/runner-settings-commands.cjs

const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-settings-commands', scope: APP_DIR });
    console.log('Hook ready.');
    await drv.settle('startup');
    const R = () => drv.T('runnerState');
    const typeCommand = async (text) => {
      await drv.T('setQuery', '');
      await drv.settle('empty box');
      await drv.ev(`(document.getElementById('query').focus(), 1)`);
      await drv.key('/', 'Slash', 191, 0, '/');
      await drv.send('Input.insertText', { text });
      await sleep(300);
      return R();
    };

    const drawer = await drv.ev(`(() => {
      const body = document.querySelector('#settingsPanel .offcanvas-body');
      const sections = [...body.querySelectorAll('button[aria-controls]')].filter((b) => document.getElementById(b.getAttribute('aria-controls'))?.classList.contains('collapse')).length;
      return { sections };
    })()`);
    let s = await typeCommand('settings:');
    const sectionCmds = s.cmdMatches.filter((id) => id.startsWith('settings-'));
    check(drawer.sections >= 8 && sectionCmds.length === drawer.sections, `every Settings section has a command (${sectionCmds.length} commands, ${drawer.sections} sections)`);

    s = await typeCommand('ranking');
    check(s.cmdListOpen && s.cmdMatches[0] === 'settings-ranking', `/ranking offers Settings: Ranking first (${s.cmdMatches.slice(0, 3)})`);
    await drv.key('Enter', 'Enter', 13);
    let opened = null;
    for (let i = 0; i < 20; i++) {
      opened = await drv.ev(`({ panel: document.getElementById('settingsPanel').classList.contains('show'), section: document.getElementById('settingsRankingDetails').classList.contains('show') })`);
      if (opened.panel && opened.section) break;
      await sleep(150);
    }
    check(opened.panel && opened.section, `Enter on it opens Settings with Ranking expanded (${JSON.stringify(opened)})`);
    await drv.ev(`(bootstrap.Offcanvas.getInstance(document.getElementById('settingsPanel'))?.hide(), 1)`);
    await sleep(500);

    const thumbs = () => drv.ev(`document.getElementById('optResultThumbnails').checked`);
    const before = await thumbs();
    s = await typeCommand('thumbnails');
    check(s.cmdMatches[0] === 'setting-optResultThumbnails', `/thumbnails offers the Thumbnails switch first (${s.cmdMatches.slice(0, 3)})`);
    await drv.key('Enter', 'Enter', 13);
    await sleep(300);
    check((await thumbs()) === !before, `running it turns Thumbnails ${before ? 'off' : 'on'}`);
    await drv.T('runCommand', 'setting-optResultThumbnails');
    check((await thumbs()) === before, 'running it again puts it back');

    const refresh = () => drv.ev(`document.getElementById('autoRefreshSec').value`);
    const was = await refresh();
    await drv.T('runCommand', 'setting-autoRefreshSec-30');
    check((await refresh()) === '30', `"Auto-refresh: Every 30 seconds" sets the list (${await refresh()})`);
    await drv.T('runCommand', 'setting-autoRefreshSec-' + was);
    check((await refresh()) === was, `and the earlier choice can be set back (${was})`);
  } catch (e) {
    failures.push('threw: ' + (e.stack || e.message || String(e)));
    console.log('  FAIL threw: ' + (e.stack || e.message));
  } finally {
    if (drv) await drv.close();
  }
  console.log(failures.length ? `runner-settings-commands: ${failures.length} failure(s)` : 'runner-settings-commands: all checks passed');
  for (const f of failures) console.log('  - ' + f);
  process.exit(failures.length ? 1 : 0);
}
main();
