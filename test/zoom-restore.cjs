// The page zoom level must survive a restart.
//
// Ctrl+= / Ctrl+- / Ctrl+0 and the View menu change the zoom in main, which tells the page the new factor;
// the page keeps it in localStorage and has main apply it again on startup. A level that was saved but never
// restored would look right in the profile and wrong on screen, so this checks the real zoom
// (devicePixelRatio, which Electron folds page zoom into) after each reload.
//
// The keys themselves cannot be driven from here: a key sent over CDP to the hidden test window reaches the
// page but never main's before-input-event (measured October 2026: Ctrl+= left devicePixelRatio at 1).
//
// Run: node test/zoom-restore.cjs

const { connect, SCOPES, structuralProblems, sleep } = require('./harness.cjs');

const DPR = `window.devicePixelRatio`;
const SAVED = `localStorage.getItem('tagBrowserPageZoom')`;

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-zoom', scope: SCOPES.repo });
    console.log('Hook ready.');
    await drv.settle('startup');

    /* Reload with a saved level and wait for the hook, which the reload tears down, then for main's answer. */
    const reloadWith = async (level, want) => {
      await drv.ev(`localStorage.setItem('tagBrowserPageZoom', '${level}'); location.reload(); 1`);
      for (let i = 0; i < 60; i++) {
        try {
          if (await drv.ev(`typeof window.__tagfoxTest === 'object' && !!window.__tagfoxTest`)) break;
        } catch (_) {}
        await sleep(150);
      }
      await drv.settle('after reload at ' + level);
      let dpr = await drv.ev(DPR);
      for (let i = 0; i < 40 && !want(dpr); i++) {
        await sleep(150);
        dpr = await drv.ev(DPR);
      }
      return dpr;
    };

    const baseDpr = await drv.ev(DPR);
    check((await drv.ev(SAVED)) === '1', `a fresh profile saves 1 (${await drv.ev(SAVED)}), at devicePixelRatio ${baseDpr}`);

    const upDpr = await reloadWith('1.1', (d) => d > baseDpr);
    check(upDpr > baseDpr, `a saved 110% is applied on startup: devicePixelRatio ${baseDpr} -> ${upDpr}`);

    const downDpr = await reloadWith('0.91', (d) => d < baseDpr);
    check(downDpr < baseDpr && (await drv.ev(SAVED)) === '0.91', `a saved 91% is applied on startup: devicePixelRatio ${downDpr}, saved ${await drv.ev(SAVED)}`);

    const backDpr = await reloadWith('1', (d) => Math.abs(d - baseDpr) < 0.001);
    check(Math.abs(backDpr - baseDpr) < 0.001, `a saved 100% puts it back: devicePixelRatio ${backDpr}`);

    const probs = structuralProblems(await drv.state());
    check(!probs.length, 'structural invariants hold' + (probs.length ? ': ' + probs.join('; ') : ''));
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== ZOOM RESTORE RESULT ==========');
  if (!failures.length) console.log('PASS: the saved zoom level is applied again on startup');
  else {
    console.log('FAIL:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
