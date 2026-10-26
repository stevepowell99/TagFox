// A test Electron whose node test process has gone ends itself (main.js, TAGFOX_TEST_PARENT_PID).
// A spawned child normally dies with its node parent anyway: libuv puts it in a job object that closes with
// the parent. What outlives the parent is a process outside that job, such as one relaunched by app.relaunch.
// So this starts a node process that launches a test Electron detached (outside the job) and with no pipes
// (a broken pipe would end it for another reason), kills that node process alone, and checks:
//   - with TAGFOX_TEST_PARENT_PID set, the Electron ends within 8 seconds and logs why;
//   - without it, the same Electron is still running after 8 seconds (the positive control: the watcher,
//     not the parent's death as such, is what ends it).
//
// Run: node test/orphan-exits.cjs

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, APP_DIR, testProfileDir } = require('./harness.cjs');
const { killTestElectron } = require('./test-processes.cjs');

const ELECTRON = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const LOG = path.join(os.tmpdir(), 'tagfox-mainperf-test.log');
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
const logText = () => {
  try {
    return fs.readFileSync(LOG, 'utf8');
  } catch (_) {
    return '';
  }
};

/** Start a node parent that launches a test Electron and stays up; resolve { parent, pid }. */
async function launch(watch) {
  const userData = testProfileDir('tagfox-test-orphan');
  // The watched run's Electron, which ended itself, may still be being torn down and holding this profile.
  killTestElectron(userData);
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch (_) {}
  const script = `
    const e = require('child_process').spawn(${JSON.stringify(ELECTRON)}, [${JSON.stringify(APP_DIR)}, ${JSON.stringify('--user-data-dir=' + userData)}], {
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, TAGFOX_TEST_HIDDEN: '1'${watch ? ", TAGFOX_TEST_PARENT_PID: String(process.pid)" : ''} },
    });
    console.log('ELECTRON ' + e.pid);
    setInterval(() => {}, 1000);`;
  const parent = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  parent.stdout.on('data', (d) => (out += d));
  for (const t0 = Date.now(); Date.now() - t0 < 15000; await sleep(100)) {
    const m = /ELECTRON (\d+)/.exec(out);
    if (m) return { parent, pid: Number(m[1]) };
  }
  return { parent, pid: 0 };
}

async function endsWithin(pid, ms) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) if (!alive(pid)) return true;
  return false;
}

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  try {
    for (const watch of [true, false]) {
      const { parent, pid } = await launch(watch);
      await sleep(4000); // past startup, so the watcher has been armed
      check(pid > 0 && alive(pid), `set up (${watch ? 'watched' : 'control'}): the test Electron is running (pid ${pid || 'none'})`);
      spawnSync('taskkill', ['/PID', String(parent.pid), '/F'], { stdio: 'ignore', windowsHide: true });
      const ended = await endsWithin(pid, 8000);
      if (watch) {
        check(ended, 'with its parent gone, it ends by itself within 8 seconds');
        check(logText().includes(`test parent ${parent.pid} gone, exiting`), 'and says why in the test perf log');
      } else {
        check(!ended, 'control: without TAGFOX_TEST_PARENT_PID it is still running 8 seconds later');
      }
    }
  } finally {
    killTestElectron(testProfileDir('tagfox-test-orphan'));
  }
  if (failures.length) {
    console.log(`\norphan-exits: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\norphan-exits: all checks passed');
}

main();
