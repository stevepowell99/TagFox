// Results column dividers: every visible boundary must be draggable.
//
// The failure this guards against is invisible to the eye and easy to reintroduce: each sticky
// header cell sits at z-index 4, so equal-z siblings paint in DOM order. A .th-resize hanging off
// its own th's RIGHT edge is painted over by the next th, leaving only its left half responsive
// and sending clicks on the boundary itself to that column's sort instead. Handles therefore
// belong to the th on the RIGHT of the boundary they drag. Measured with elementFromPoint, which
// is what the mouse actually does, rather than by reading the CSS back.
//
// Run: node test/column-resize.cjs

const { connect, SCOPES } = require('./harness.cjs');

const MIN_HITTABLE_PX = 9; // of a 15px window centred on the boundary (handle is 12px wide)

const PROBE = `(() => {
  const t = document.getElementById('resultsTable');
  if (!t) return null;
  const ths = [...t.querySelectorAll('thead th')].filter((x) => x.getClientRects().length);
  const out = [];
  for (let i = 0; i < ths.length - 1; i++) {
    const th = ths[i];
    const r = th.getBoundingClientRect();
    if (!r.width) continue;
    const boundary = Math.round(r.right);
    const y = Math.round(r.top + r.height / 2);
    let hit = 0;
    for (let dx = -7; dx <= 7; dx++) {
      const el = document.elementFromPoint(boundary + dx, y);
      if (el && el.classList.contains('th-resize') && el.style.display !== 'none') hit++;
    }
    out.push({
      after: (th.querySelector('.sort-label')?.textContent || th.getAttribute('aria-label') || 'checkbox').trim(),
      hit,
    });
  }
  return out;
})()`;

async function checkView(drv, label, flat, failures) {
  const { T, ev } = drv;
  await ev(
    `(() => { const el = document.getElementById('${flat ? 'optRvFlat' : 'optRvTree'}');
       if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } })()`,
  );
  await T('runSearchNow', 'identity');
  await new Promise((r) => setTimeout(r, 500));

  const rows = await ev(PROBE);
  if (!rows || !rows.length) {
    failures.push(`[${label}] no header boundaries found`);
    return;
  }
  for (const r of rows) {
    const ok = r.hit >= MIN_HITTABLE_PX;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}: boundary after "${r.after}" — ${r.hit}/15 px hittable`);
    if (!ok) {
      failures.push(
        `[${label}] boundary after "${r.after}" only ${r.hit}/15 px hittable — handle is buried under the next th`,
      );
    }
  }
}

async function main() {
  const failures = [];
  let drv;
  try {
    drv = await connect({ port: 9309, profile: 'tagfox-test-colresize', scope: SCOPES.repo });
    console.log('Hook ready.');
    await checkView(drv, 'flat view', true, failures);
    await checkView(drv, 'tree view', false, failures);
  } catch (e) {
    failures.push('ERROR: ' + (e.stack || e.message || String(e)));
  } finally {
    if (drv) drv.close();
  }

  console.log('\n========== COLUMN RESIZE RESULT ==========');
  if (!failures.length) console.log('PASS: every visible column divider is fully draggable');
  else {
    console.log(`${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(' - ' + f));
  }
  process.exit(failures.length ? 1 : 0);
}
main();
