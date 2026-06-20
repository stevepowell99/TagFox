// Runs the TagFox dual-pane regression suite sequentially and reports a summary.
// Each test launches its own isolated Electron instance, so they must not run in parallel
// (they would otherwise fight over CDP ports / profiles). Run: node test/run-all.cjs

const { spawnSync } = require('child_process');
const path = require('path');

const NODE = process.execPath;
const runs = [
  { name: 'smoke', args: ['smoke.cjs'] },
  { name: 'load-more regression', args: ['loadmore-regression.cjs'] },
  { name: 'fuzz seed 999', args: ['fuzz.cjs', '40', '999'] },
  { name: 'fuzz seed 7', args: ['fuzz.cjs', '40', '7'] },
  { name: 'fuzz seed 2024', args: ['fuzz.cjs', '40', '2024'] },
];

let failed = 0;
for (const r of runs) {
  console.log(`\n########## ${r.name} ##########`);
  const res = spawnSync(NODE, [path.join(__dirname, r.args[0]), ...r.args.slice(1)], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

console.log(`\n==================================================`);
console.log(failed === 0 ? `SUITE PASSED (${runs.length}/${runs.length})` : `SUITE FAILED: ${failed}/${runs.length} runs failed`);
process.exit(failed ? 1 : 0);
