// Start menu apps in Runner: with no folder chosen, typing an app's name puts its shortcut first, above today's
// files that share the words, and a prefix of the name does too; an uninstaller gets no lift; the app query
// names the app folders and runs only with no folder chosen. Main writes a shortcut for each packaged (Store)
// app, which Everything indexes and Runner then ranks like any other app.
//
// The app folders are this test's own (TAGFOX_TEST_APP_ROOTS), one of them under a folder named AppData, so
// the AppData penalty is exercised as well. Nothing is opened: Enter on an app is manual-app-switch.cjs.
//
// Run: node test/runner-apps.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-apps-' + process.pid);
  const appRoot = path.join(root, 'AppData', 'Start Menu', 'Programs');
  const files = path.join(root, 'files');
  fs.mkdirSync(appRoot, { recursive: true });
  fs.mkdirSync(files, { recursive: true });
  const app = path.join(appRoot, 'Qzvapp Studio.lnk');
  const uninstaller = path.join(appRoot, 'Uninstall Qzvapp Studio.lnk');
  const notes = path.join(files, 'qzvapp studio notes.txt');
  const plan = path.join(files, 'qzvappish plan.txt');
  /* The shortcuts' bytes do not matter: ranking reads names, and nothing here opens them. A year old. */
  const yearAgo = new Date(Date.now() - 365 * 864e5);
  for (const p of [app, uninstaller]) {
    fs.writeFileSync(p, 'x');
    fs.utimesSync(p, yearAgo, yearAgo);
  }
  fs.writeFileSync(notes, 'notes');
  fs.writeFileSync(plan, 'plan');
  process.env.TAGFOX_TEST_APP_ROOTS = appRoot;
  process.env.TAGFOX_TEST_STORE_APPS = '1';

  const norm = (p) => path.normalize(String(p || '')).toLowerCase();
  const waitFor = async (fn, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await fn();
      if (v) return v;
      await sleep(150);
    }
    return fn();
  };

  let drv;
  let storeDir = '';
  try {
    drv = await connect({ profile: 'tagfox-test-runner-apps' });
    storeDir = path.join(drv.userData, 'Store apps');
    await drv.settle('startup');
    await drv.T('setScope', '');
    await drv.settle('no folder');
    const R = () => drv.T('runnerState');
    /* Search until every path in `want` is listed (Everything indexes new files within a second or so). */
    const listing = async (q, want) => {
      let s = null;
      await waitFor(async () => {
        await drv.T('setQuery', q);
        await drv.settle(q);
        s = await R();
        return want.every((w) => s.rows.some((r) => norm(r) === norm(w)));
      }, 15000);
      return s;
    };
    const at = (s, p) => s.rows.findIndex((r) => norm(r) === norm(p));

    let s = await listing('qzvapp studio', [app, uninstaller, notes]);
    check(at(s, app) === 0, `the app's name typed puts its shortcut first, above today's file with the same words (${s.rows.slice(0, 4).map((r) => path.basename(r)).join(', ')})`);
    check(at(s, notes) >= 0 && at(s, uninstaller) > at(s, notes), `an uninstaller gets no lift and sits below that file (notes ${at(s, notes)}, uninstaller ${at(s, uninstaller)})`);
    const marked = await drv.ev(`(() => {
      const rowFor = (p) => [...document.querySelectorAll('#tbody tr')].find((t) => (t.dataset.rowPath || '').toLowerCase() === p.toLowerCase());
      return [${JSON.stringify(app)}, ${JSON.stringify(notes)}, ${JSON.stringify(uninstaller)}].map((p) => !!rowFor(p)?.querySelector('.tagfox-app-icon'));
    })()`);
    check(JSON.stringify(marked) === '[true,false,false]', `the app row carries the app glyph, and the file and the uninstaller do not (${JSON.stringify(marked)})`);
    check(
      (s.sentExtra || []).some((t) => t.includes(appRoot) && /ext:lnk/.test(t)),
      `the app query names the app folders (${(s.sentExtra || []).find((t) => /ext:lnk/.test(t)) || 'none sent'})`
    );

    s = await listing('qzva', [app, notes, plan]);
    check(at(s, app) === 0, `a prefix of the name puts the app first too (${s.rows.slice(0, 4).map((r) => path.basename(r)).join(', ')})`);

    await drv.T('setScope', files);
    await drv.T('setQuery', 'qzvapp studio');
    await drv.settle('in a folder');
    s = await R();
    check(
      at(s, notes) >= 0 && !(s.sentExtra || []).some((t) => /ext:lnk/.test(t)) && at(s, app) < 0,
      `with a folder chosen there is no app query and no app row (${s.rows.map((r) => path.basename(r)).join(', ')})`
    );
    await drv.T('setScope', '');
    await drv.settle('no folder again');

    /* Store apps: main runs Get-StartApps and writes a shortcut per packaged app into the profile. */
    const written = await waitFor(() => {
      try {
        return fs.readdirSync(storeDir).filter((n) => /\.lnk$/i.test(n));
      } catch (_) {
        return null;
      }
    }, 45000);
    check(Array.isArray(written) && written.length > 0, `main writes a shortcut for each Store app (${written ? written.length : 0} in ${storeDir})`);
    if (written && written.length) {
      const pick = written.find((n) => /^calculator\.lnk$/i.test(n)) || written[0];
      const shortcut = path.join(storeDir, pick);
      const q = pick.replace(/\.lnk$/i, '');
      s = await listing(q, [shortcut]);
      check(at(s, shortcut) === 0, `a Store app comes up first for its name, from under the profile's Temp folder (${q}: ${s.rows.slice(0, 3).map((r) => path.basename(r)).join(', ')})`);
    }
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) await drv.close();
    for (const d of [root, storeDir]) {
      try {
        if (d) fs.rmSync(d, { recursive: true, force: true });
      } catch (_) {}
    }
  }
  finished = true;
  if (failures.length) {
    console.log(`\nrunner-apps: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-apps: all checks passed');
}

/* A CDP call whose answer never comes leaves nothing pending, and Node then exits with code 0 mid-test,
   which run-all would count as a pass. */
let finished = false;
process.on('beforeExit', () => {
  if (finished) return;
  console.log('\nrunner-apps: stopped part way, a page call never returned');
  process.exit(1);
});

main();
