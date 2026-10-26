// The Electron processes this suite started, found by the profile the harness gives each one: a folder in
// the temp directory whose name starts "tagfox-test-". Never by image name, so Steve's own TagFox, which runs
// on its default profile, can never match. A test that relaunches TagFox makes a process outside its own
// process tree, which killing the tree misses; this is how such a process is found and stopped.
// Only this checkout's Electron binary counts (a relaunch keeps it), so a suite in C:\dev\TagFox and one
// in a worktree such as C:\dev\TagFox-runner never stop each other's instances.

const { execFileSync, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const PROFILE_PREFIX = 'tagfox-test-';
const CHECKOUT = path.resolve(__dirname, '..').toLowerCase() + path.sep;

/** [{ pid, profile }] for every Electron main process running on a test profile. `profile` narrows it to
    one profile folder (a full path). */
function testElectronProcesses(profile) {
  let rows = [];
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "@(Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object ProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress",
      ],
      { encoding: 'utf8', windowsHide: true }
    );
    rows = JSON.parse(out || '[]');
    if (!Array.isArray(rows)) rows = [rows];
  } catch (_) {
    return [];
  }
  const tmp = path.resolve(os.tmpdir()).toLowerCase();
  const want = profile ? path.resolve(profile).toLowerCase() : null;
  const found = [];
  for (const r of rows) {
    if (!String(r.ExecutablePath || '').toLowerCase().startsWith(CHECKOUT)) continue;
    // Both quotings occur: --user-data-dir="X" from a spawn, and "--user-data-dir=X" from app.relaunch().
    const m = /--user-data-dir=(?:"([^"]+)"|([^"\s]+))/.exec(String(r.CommandLine || ''));
    if (!m) continue;
    const dir = path.resolve(m[1] || m[2]).toLowerCase();
    const ours = path.dirname(dir) === tmp && path.basename(dir).startsWith(PROFILE_PREFIX);
    if (ours && (!want || dir === want)) found.push({ pid: r.ProcessId, profile: m[1] || m[2] });
  }
  return found;
}

/** Stop every test Electron on `profile` (or on any test profile), by PID, and wait up to `waitMs` until Windows
    no longer lists them: a killed Electron is listed, holding its profile, for seconds while it is torn down.
    Returns { stopped, stillListed }, the second being what was still there when the wait ran out. */
function killTestElectron(profile, waitMs = 20000) {
  const stopped = testElectronProcesses(profile);
  for (const p of stopped) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  let stillListed = stopped;
  for (const t0 = Date.now(); stillListed.length && Date.now() - t0 < waitMs; ) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    stillListed = testElectronProcesses(profile).filter((p) => stopped.some((s) => s.pid === p.pid));
  }
  return { stopped, stillListed };
}

module.exports = { testElectronProcesses, killTestElectron };
