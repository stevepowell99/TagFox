// Runs the TagFox regression suite sequentially and reports a summary.
// Each test launches its own isolated Electron instance, so they must not run in parallel
// (they would otherwise fight over CDP ports / profiles). Run: node test/run-all.cjs

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const { killTestElectron, testElectronProcesses } = require('./test-processes.cjs');

const NODE = process.execPath;
// One hung test must never stall the suite: past this, its whole process tree (the test, and the
// Electron it launched) is killed and the run counts as failed.
const RUN_DEADLINE_MS = 5 * 60 * 1000;
const runs = [
  { name: 'tag date families', args: ['tags-dates.cjs'] }, // pure logic, no Electron; first because it is instant
  { name: 'help build', args: ['help-build.cjs'] }, // no Electron either
  { name: 'smoke', args: ['smoke.cjs'] },
  { name: 'delete hides its row', args: ['delete-hides-row.cjs'] },
  { name: 'load-more regression', args: ['loadmore-regression.cjs'] },
  { name: 'splitter drag', args: ['splitter-drag.cjs'] },
  { name: 'refresh visibility', args: ['refresh-visible.cjs'] },
  { name: 'quiet auto-refresh', args: ['quiet-refresh.cjs'] },
  { name: 'markdown preview never writes', args: ['md-preview-no-write.cjs'] },
  { name: 'menu Enter activates item', args: ['menu-enter.cjs'] },
  { name: 'recent changes (global hotkey)', args: ['recent-changes.cjs'] },
  { name: 'hotkey raise selects the query', args: ['hotkey-raise-select.cjs'] },
  { name: 'zoom restore', args: ['zoom-restore.cjs'] },
  { name: 'restart stays in the terminal', args: ['restart-in-terminal.cjs'] },
  { name: 'runner layout', args: ['runner-layout.cjs'] },
  { name: 'runner keys', args: ['runner-keys.cjs'] },
  { name: 'runner syntax', args: ['runner-syntax.cjs'] },
  { name: 'runner tags', args: ['runner-tags.cjs'] },
  { name: 'runner query order', args: ['runner-query-order.cjs'] },
  { name: 'runner shelf', args: ['runner-shelf.cjs'] },
  { name: 'runner status line', args: ['runner-status.cjs'] },
  { name: 'runner go to a path', args: ['runner-go-to-path.cjs'] },
  { name: 'an empty box inside a folder selects the folder', args: ['runner-folder-itself.cjs'] },
  { name: 'viewer in runner', args: ['viewer-runner.cjs'] },
  { name: 'viewer: Google shortcuts and .doc', args: ['viewer-google-doc.cjs'] },
  { name: 'runner viewer divider', args: ['runner-viewer-split.cjs'] },
  { name: 'window close hides', args: ['close-hides.cjs'] },
  { name: 'page health logged and a crash recovered', args: ['page-health.cjs'] },
  { name: 'a test Electron outliving its test ends itself', args: ['orphan-exits.cjs'] },
  { name: 'runner empty list says why', args: ['runner-empty-list.cjs'] },
  { name: 'runner stars open in order', args: ['runner-stars.cjs'] },
  { name: 'ranking sliders', args: ['runner-rank-knobs.cjs'] },
  { name: 'settings as / commands', args: ['runner-settings-commands.cjs'] },
  { name: 'runner saved searches', args: ['runner-saved-searches.cjs'] },
  { name: 'machine features', args: ['machine-features.cjs'] },
  { name: 'row buttons by keyboard', args: ['row-actions-keys.cjs'] },
  { name: 'option, dialog and folder keys', args: ['runner-key-actions.cjs'] },
  { name: 'hidden title bar', args: ['window-chrome.cjs'] },
  { name: 'hover preview', args: ['hover-preview.cjs'] },
  { name: 'open and save dialog hand-off', args: ['file-dialog-handoff.cjs'] }, // the real-dialog half is manual-file-dialog.cjs, by hand
  { name: 'gmist start guard', args: ['gmist-start-guard.cjs'] }, // skips loudly if a real gmist holds 5173/5199
  { name: 'fuzz seed 999', args: ['fuzz.cjs', '40', '999'] },
  { name: 'fuzz seed 7', args: ['fuzz.cjs', '40', '7'] },
  { name: 'fuzz seed 2024', args: ['fuzz.cjs', '40', '2024'] },
];

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Which kind of leftover a listed Electron is. Node's liveness check fails as soon as a process has been
    killed, while Windows still lists it until it has been torn down, so the two tell those cases apart. */
function runState(pid) {
  try {
    process.kill(pid, 0);
    return 'still running';
  } catch (e) {
    return e.code === 'EPERM' ? 'still running' : 'already killed, still being torn down';
  }
}

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
    let ok = await runOne(r);
    // A test that leaves a TagFox running (a relaunch escapes the killed process tree) fails, and the
    // TagFox is stopped, so it can neither sit on Steve's screen nor hold a port the next test wants.
    // A test's close() waits for its Electron to end, but one that stops part-way leaves an Electron that
    // its node's exit has only just killed, and Windows lists that until it has been torn down, which takes
    // seconds on a loaded machine. So look again for up to 9s before calling it left running; an escaped
    // relaunch is still there after any wait.
    let left = [];
    for (let t0 = Date.now(); ; ) {
      await sleep(left.length ? 1000 : 1500);
      left = testElectronProcesses();
      if (!left.length || Date.now() - t0 > 9500) break;
    }
    if (left.length) {
      ok = false;
      console.log(`LEFT RUNNING by ${r.name}: ` + left.map((p) => `pid ${p.pid} (${p.profile}, ${runState(p.pid)})`).join(', '));
      const { stillListed } = killTestElectron();
      console.log(stillListed.length ? `  still listed 20s after taskkill: ${stillListed.map((p) => `pid ${p.pid}`).join(', ')}` : '  now stopped');
    }
    if (!ok) failed++;
  }
  console.log(`\n==================================================`);
  console.log(failed === 0 ? `SUITE PASSED (${runs.length}/${runs.length})` : `SUITE FAILED: ${failed}/${runs.length} runs failed`);
  process.exit(failed ? 1 : 0);
})();
