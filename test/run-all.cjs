// Runs the TagFox dual-pane regression suite sequentially and reports a summary.
// Each test launches its own isolated Electron instance, so they must not run in parallel
// (they would otherwise fight over CDP ports / profiles). Run: node test/run-all.cjs

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const NODE = process.execPath;
// One hung test must never stall the suite: past this, its whole process tree (the test, and the
// Electron it launched) is killed and the run counts as failed.
const RUN_DEADLINE_MS = 5 * 60 * 1000;
const runs = [
  { name: 'tag date families', args: ['tags-dates.cjs'] }, // pure logic, no Electron; first because it is instant
  { name: 'smoke', args: ['smoke.cjs'] },
  { name: 'tab lifecycle', args: ['tab-lifecycle.cjs'] },
  { name: 'crud tab-isolation', args: ['crud-pane-isolation.cjs'] },
  { name: 'load-more regression', args: ['loadmore-regression.cjs'] },
  { name: 'column resize', args: ['column-resize.cjs'] },
  { name: 'splitter drag', args: ['splitter-drag.cjs'] },
  { name: 'refresh visibility', args: ['refresh-visible.cjs'] },
  { name: 'quiet auto-refresh', args: ['quiet-refresh.cjs'] },
  { name: 'markdown preview never writes', args: ['md-preview-no-write.cjs'] },
  { name: 'menu Enter activates item', args: ['menu-enter.cjs'] },
  { name: 'recent folders filter', args: ['recent-folders-filter.cjs'] },
  { name: 'recent tab (global hotkey)', args: ['recent-tab.cjs'] },
  { name: 'zoom buttons', args: ['zoom-buttons.cjs'] },
  { name: 'restart stays in the terminal', args: ['restart-in-terminal.cjs'] },
  { name: 'gmist start guard', args: ['gmist-start-guard.cjs'] }, // skips loudly if a real gmist holds 5173/5199
  { name: 'fuzz seed 999', args: ['fuzz.cjs', '40', '999'] },
  { name: 'fuzz seed 7', args: ['fuzz.cjs', '40', '7'] },
  { name: 'fuzz seed 2024', args: ['fuzz.cjs', '40', '2024'] },
];

function runOne(r) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(NODE, [path.join(__dirname, r.args[0]), ...r.args.slice(1)], { stdio: 'inherit' });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.log(`TIMED OUT after ${RUN_DEADLINE_MS / 1000}s: killing the test and its Electron (PID ${child.pid})`);
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    }, RUN_DEADLINE_MS);
    child.on('exit', (code) => {
      clearTimeout(timer);
      console.log(`(${r.name}: ${Math.round((Date.now() - t0) / 1000)}s)`);
      resolve(!timedOut && code === 0);
    });
  });
}

(async () => {
  let failed = 0;
  for (const r of runs) {
    console.log(`\n########## ${r.name} ##########`);
    if (!(await runOne(r))) failed++;
  }
  console.log(`\n==================================================`);
  console.log(failed === 0 ? `SUITE PASSED (${runs.length}/${runs.length})` : `SUITE FAILED: ${failed}/${runs.length} runs failed`);
  process.exit(failed ? 1 : 0);
})();
