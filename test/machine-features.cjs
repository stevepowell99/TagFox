// A packaged TagFox handed to someone else usually has no gmist, no JobCat and no Google sign-in, and must not
// show buttons that can only fail there. This runs a markdown row twice: on this machine as it is, where a gmist
// checkout exists and the row carries the local gmist pen (the positive control, so the hidden case cannot pass
// on a row drawn without any buttons), and with TAGFOX_TEST_NO_GMIST=1, which hides the checkout as a recipient's
// machine has none: main reports no gmist and the row has no local pen, while its other buttons stay.
//
// Run: node test/machine-features.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'machine-features-' + process.pid);
  fs.mkdirSync(root, { recursive: true });
  const md = path.join(root, 'features note ' + process.pid + '.md');
  fs.writeFileSync(md, '# note\n');

  /* The row's buttons, once main's answer is in and the table has been drawn with it. */
  const rowButtons = async (drv) => {
    let features = null;
    for (let i = 0; i < 40 && !features; i++) {
      features = await drv.T('machineFeatures');
      if (!features) await sleep(100);
    }
    for (let i = 0; i < 20; i++) {
      await drv.T('runSearchNow');
      await drv.settle('row');
      const labels = await drv.ev(`(() => {
        const tr = [...document.querySelectorAll('#tbody tr')].find((t) => (t.dataset.rowPath || '').toLowerCase() === ${JSON.stringify(md.toLowerCase())});
        return tr ? [...tr.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')) : null;
      })()`);
      if (labels) return { features, labels };
      await sleep(400);
    }
    return { features, labels: null };
  };

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-machine-features', scope: root });
    console.log('Hook ready (this machine as it is).');
    await drv.settle('startup');
    let r = await rowButtons(drv);
    check(r.features && r.features.gmist === true, `main finds a gmist here (${JSON.stringify(r.features)})`);
    check(r.labels && r.labels.includes('Open in local gmist'), `the markdown row carries the local gmist pen (positive control): ${JSON.stringify(r.labels)}`);
    await drv.close();
    drv = null;

    process.env.TAGFOX_TEST_NO_GMIST = '1';
    drv = await connect({ profile: 'tagfox-test-machine-features-none', scope: root });
    console.log('Hook ready (no gmist: checkout hidden).');
    await drv.settle('startup');
    r = await rowButtons(drv);
    check(r.features && r.features.gmist === false, `main reports no gmist (${JSON.stringify(r.features)})`);
    check(r.labels && !r.labels.includes('Open in local gmist'), `the markdown row has no local gmist pen: ${JSON.stringify(r.labels)}`);
    check(r.labels && r.labels.length > 0, 'and keeps its other buttons, so the row was drawn with them');
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) await drv.close();
    delete process.env.TAGFOX_TEST_NO_GMIST;
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
  finished = true;
  if (failures.length) {
    console.log(`\nmachine-features: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nmachine-features: all checks passed');
}

/* A CDP call whose answer never comes leaves nothing pending, and Node then exits with code 0 mid-test,
   which run-all would count as a pass. */
let finished = false;
process.on('beforeExit', () => {
  if (finished) return;
  console.log('\nmachine-features: stopped part way, a page call never returned');
  process.exit(1);
});

main();
