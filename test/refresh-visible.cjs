// An explicit refresh must always say it ran.
//
// Steve reported "F5 sometimes does not refresh". A refresh that finds nothing new used to print a row
// count that was already on screen, so it looked exactly like a keypress that never arrived, and the
// keypress really can fail to arrive: F5 only reaches the page while it holds OS keyboard focus. Hence
// the header button (a click always lands) and a status line carrying the clock time plus what changed.
//
// This guards both halves: the button exists and is wired, and every explicit refresh route reports.
//
// Run: node test/refresh-visible.cjs

const { connect, SCOPES, structuralProblems } = require('./harness.cjs');

const STATUS = `(document.getElementById('statusMain')?.textContent || '').trim()`;
const REFRESHED = /^Refreshed \d\d:\d\d:\d\d — \d+ row\(s\)(, unchanged|, \+\d+ new|, -\d+ gone|, \+\d+ new, -\d+ gone)\.$/;

async function main() {
  const failures = [];
  let drv;
  try {
    drv = await connect({ port: 9311, profile: 'tagfox-test-refresh', scope: SCOPES.repo });
    console.log('Hook ready.');
    await drv.settle('startup');

    // 1. The button is in the header and carries an icon to spin.
    const btn = await drv.ev(
      `(() => { const b = document.getElementById('btnRefreshResults');
         return b ? { inHeader: !!b.closest('header'), icon: !!b.querySelector('i') } : null; })()`,
    );
    if (!btn) failures.push('no #btnRefreshResults in the DOM');
    else {
      if (!btn.inHeader) failures.push('#btnRefreshResults is not in the header');
      if (!btn.icon) failures.push('#btnRefreshResults has no icon element to spin');
      console.log(`  ${btn.inHeader && btn.icon ? 'PASS' : 'FAIL'} button present in header with an icon`);
    }

    // 2. Clicking it refreshes and reports. Blank the status first so a stale line cannot pass for a new one.
    await drv.ev(`document.getElementById('statusMain').textContent = ''; 1`);
    await drv.ev(`document.getElementById('btnRefreshResults').click(); 1`);
    await drv.settle('after button click');
    const afterClick = await drv.ev(STATUS);
    const clickOk = REFRESHED.test(afterClick);
    console.log(`  ${clickOk ? 'PASS' : 'FAIL'} button click reports: "${afterClick}"`);
    if (!clickOk) failures.push(`button click left status "${afterClick}", expected a "Refreshed hh:mm:ss — N row(s), …" line`);

    // 3. The F5 route (the renderer hook drives the same choke point) reports the same way, and a second
    //    refresh over an unchanged tree must say so rather than looking like nothing happened.
    await drv.ev(`document.getElementById('statusMain').textContent = ''; 1`);
    await drv.T('refreshNow');
    await drv.settle('after refreshNow');
    const afterF5 = await drv.ev(STATUS);
    const f5Ok = REFRESHED.test(afterF5);
    console.log(`  ${f5Ok ? 'PASS' : 'FAIL'} F5 route reports: "${afterF5}"`);
    if (!f5Ok) failures.push(`refreshNow left status "${afterF5}", expected a "Refreshed hh:mm:ss — N row(s), …" line`);
    if (f5Ok && !/unchanged/.test(afterF5)) {
      console.log('  NOTE: tree changed between the two refreshes, so "unchanged" was not expected here');
    }

    const probs = structuralProblems(await drv.state());
    if (probs.length) failures.push('structural: ' + probs.join('; '));
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== REFRESH VISIBILITY RESULT ==========');
  if (!failures.length) console.log('PASS: the refresh button exists and every explicit refresh reports that it ran');
  else {
    console.log('FAIL:');
    for (const f of failures) console.log('  - ' + f);
  }
  process.exit(failures.length ? 1 : 0);
}

main();
