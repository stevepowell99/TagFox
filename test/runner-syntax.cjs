// What can be typed into Runner's box, one check each against files made for the purpose: Everything's own
// syntax passes through untouched (| ! "phrase" ext: dm: size: regex: <grouping> wfn:), Runner's additions
// work on top of it (-word, a bare file type such as `pdf` filtering strictly, ^word at word starts), a
// word that only looks like a type (`map`) stays a word, and the / toggle "Word starts only" applies ^ to
// every word and shows as a chip.
//
// Run: node test/runner-syntax.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'runner-syntax-' + process.pid);
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.mkdirSync(path.join(root, 'pdf exports'), { recursive: true });
  const files = ['alpha report.pdf', 'beta report.docx', 'gamma.txt', 'old map.md', 'mapping.md', 'roadmap.txt', 'map.json', 'big.bin', 'sub/delta.txt'];
  for (const f of files) fs.writeFileSync(path.join(root, f), f === 'big.bin' ? Buffer.alloc(2 * 1024 * 1024) : 'x\n');

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-syntax', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await drv.T('setRunnerMode', true);
    await drv.settle('runner on');
    await drv.T('configure', { rootFolder: root });
    const names = async (q) => {
      await drv.T('setQuery', q);
      await drv.T('runSearchNow', 'identity');
      await drv.settle(q);
      const s = await drv.T('runnerState');
      return s.rows.map((r) => path.relative(root, r).replace(/\\/g, '/')).sort();
    };
    // Wait until Everything has indexed every file, including the 2MB one's size.
    let all = [];
    for (let i = 0; i < 25; i++) {
      all = await names('size:>1mb');
      if (all.includes('big.bin') && (await names('delta')).includes('sub/delta.txt')) break;
      await sleep(400);
    }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify([...b].sort());
    const cases = [
      ['alpha|gamma', (r) => same(r, ['alpha report.pdf', 'gamma.txt'])],
      ['!report', (r) => r.includes('gamma.txt') && !r.some((n) => /report/.test(n))],
      ['-report', (r) => r.includes('gamma.txt') && !r.some((n) => /report/.test(n))],
      ['"old map"', (r) => same(r, ['old map.md'])],
      ['ext:pdf;docx', (r) => same(r, ['alpha report.pdf', 'beta report.docx'])],
      ['dm:today', (r) => r.includes('gamma.txt') && r.includes('sub/delta.txt')],
      ['size:>1mb', (r) => same(r, ['big.bin'])],
      ['regex:^gam', (r) => same(r, ['gamma.txt'])],
      ['<alpha|beta> report', (r) => same(r, ['alpha report.pdf', 'beta report.docx'])],
      ['wfn:gamma.txt', (r) => same(r, ['gamma.txt'])],
      ['report -.docx', (r) => same(r, ['alpha report.pdf'])],
      ['pdf', (r) => same(r, ['alpha report.pdf'])],
      ['-pdf report', (r) => same(r, ['beta report.docx'])],
      ['map', (r) => r.includes('roadmap.txt') && r.includes('map.json') && r.includes('old map.md')],
      ['^map', (r) => r.includes('map.json') && r.includes('old map.md') && r.includes('mapping.md') && !r.includes('roadmap.txt')],
    ];
    for (const [q, ok] of cases) {
      const r = await names(q);
      check(ok(r), `${q}  →  ${r.join(', ') || '(none)'}`);
    }

    // The / toggle: every word at word starts, shown as a chip until switched off.
    await drv.T('runCommand', 'word-starts');
    let r = await names('map');
    let s = await drv.T('runnerState');
    check(r.includes('map.json') && !r.includes('roadmap.txt') && s.chips.includes('word-starts'), `Word starts only: map  →  ${r.join(', ')} (chips ${s.chips.join(', ')})`);
    await drv.T('runCommand', 'word-starts');
    r = await names('map');
    s = await drv.T('runnerState');
    check(r.includes('roadmap.txt') && !s.chips.includes('word-starts'), 'and off again, roadmap.txt is back and the chip gone');
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
  }
  if (failures.length) {
    console.log(`\nrunner-syntax: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-syntax: all checks passed');
}

main();
