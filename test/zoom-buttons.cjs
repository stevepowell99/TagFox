// The navbar zoom buttons must actually zoom the page, and say what the level is.
//
// They exist for Gabriele, who has no reason to know Ctrl +/-. A button that only relabels itself
// would look right and change nothing on screen, so this checks the real zoom factor as well as the
// label, and that the level survives a reload (it is kept in localStorage and re-applied on startup).
//
// Run: node test/zoom-buttons.cjs

const { connect, SCOPES, structuralProblems } = require('./harness.cjs');

const LEVEL = `(document.getElementById('btnZoomReset')?.textContent || '').trim()`;
/* Electron folds page zoom into devicePixelRatio, so this is the on-screen truth, not our own bookkeeping. */
const DPR = `window.devicePixelRatio`;

async function main() {
  const failures = [];
  let drv;
  try {
    drv = await connect({ port: 9316, profile: 'tagfox-test-zoom', scope: SCOPES.repo });
    console.log('Hook ready.');
    await drv.settle('startup');

    const inHeader = await drv.ev(
      `(() => { const g = document.querySelector('.tagfox-zoom-group');
         return g ? { header: !!g.closest('header'), buttons: g.querySelectorAll('button').length } : null; })()`,
    );
    if (!inHeader) failures.push('no .tagfox-zoom-group in the DOM');
    else {
      if (!inHeader.header) failures.push('the zoom group is not in the header');
      if (inHeader.buttons !== 3) failures.push(`zoom group has ${inHeader.buttons} buttons, expected out/level/in`);
      console.log(`  ${inHeader.header && inHeader.buttons === 3 ? 'PASS' : 'FAIL'} three zoom buttons in the header`);
    }

    await drv.ev(`document.getElementById('btnZoomReset').click(); 1`);
    await drv.settle('after reset');
    const baseDpr = await drv.ev(DPR);

    await drv.ev(`document.getElementById('btnZoomIn').click(); 1`);
    await drv.settle('after zoom in');
    const inLevel = await drv.ev(LEVEL);
    const inDpr = await drv.ev(DPR);
    const inOk = inLevel === '110%' && inDpr > baseDpr;
    console.log(`  ${inOk ? 'PASS' : 'FAIL'} zoom in: label ${inLevel}, devicePixelRatio ${baseDpr} -> ${inDpr}`);
    if (!inOk) failures.push(`zoom in gave label "${inLevel}" and dpr ${inDpr} (was ${baseDpr}); expected 110% and a rise`);

    await drv.ev(`document.getElementById('btnZoomOut').click(); document.getElementById('btnZoomOut').click(); 1`);
    await drv.settle('after zoom out');
    const outLevel = await drv.ev(LEVEL);
    const outDpr = await drv.ev(DPR);
    const outOk = outLevel === '91%' && outDpr < baseDpr;
    console.log(`  ${outOk ? 'PASS' : 'FAIL'} zoom out: label ${outLevel}, devicePixelRatio ${outDpr}`);
    if (!outOk) failures.push(`two zoom-outs gave label "${outLevel}" and dpr ${outDpr} (base ${baseDpr}); expected 91% and a fall`);

    // The saved level must be re-applied on startup, or every launch throws Gabriele's setting away.
    await drv.ev(`location.reload(); 1`);
    /* The test hook is torn down by the reload, so wait for it before asking the app anything. */
    for (let i = 0; i < 60; i++) {
      try {
        if (await drv.ev(`typeof window.__tagfoxTest === 'object' && !!window.__tagfoxTest`)) break;
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 150));
    }
    await drv.settle('after reload');
    for (let i = 0; i < 40 && (await drv.ev(LEVEL)) !== '91%'; i++) await new Promise((r) => setTimeout(r, 150));
    const afterReload = await drv.ev(LEVEL);
    const reloadDpr = await drv.ev(DPR);
    const reloadOk = afterReload === '91%' && reloadDpr < baseDpr;
    console.log(`  ${reloadOk ? 'PASS' : 'FAIL'} level survives a reload: label ${afterReload}, dpr ${reloadDpr}`);
    if (!reloadOk) failures.push(`after reload the label was "${afterReload}" and dpr ${reloadDpr}; expected the saved 91%`);

    await drv.ev(`document.getElementById('btnZoomReset').click(); 1`);
    await drv.settle('after final reset');
    const resetLevel = await drv.ev(LEVEL);
    const resetDpr = await drv.ev(DPR);
    const resetOk = resetLevel === '100%' && Math.abs(resetDpr - baseDpr) < 0.001;
    console.log(`  ${resetOk ? 'PASS' : 'FAIL'} reset: label ${resetLevel}, dpr back to ${resetDpr}`);
    if (!resetOk) failures.push(`reset gave label "${resetLevel}" and dpr ${resetDpr}; expected 100% and ${baseDpr}`);

    const probs = structuralProblems(await drv.state());
    if (probs.length) failures.push('structural: ' + probs.join('; '));
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== ZOOM BUTTONS RESULT ==========');
  if (!failures.length) console.log('PASS: the navbar zoom buttons change the page zoom, report the level and remember it');
  else {
    console.log('FAIL:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
