// The Electron processes this suite started, found by the profile the harness gives each one: a folder in
// the temp directory whose name starts "tagfox-test-". Never by image name, so Steve's own TagFox, which runs
// on its default profile, can never match. A test that relaunches TagFox makes a process outside its own
// process tree, which killing the tree misses; this is how such a process is found and stopped.

const { execFileSync, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const PROFILE_PREFIX = 'tagfox-test-';

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
        "@(Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress",
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
    // Both quotings occur: --user-data-dir="X" from a spawn, and "--user-data-dir=X" from app.relaunch().
    const m = /--user-data-dir=(?:"([^"]+)"|([^"\s]+))/.exec(String(r.CommandLine || ''));
    if (!m) continue;
    const dir = path.resolve(m[1] || m[2]).toLowerCase();
    const ours = path.dirname(dir) === tmp && path.basename(dir).startsWith(PROFILE_PREFIX);
    if (ours && (!want || dir === want)) found.push({ pid: r.ProcessId, profile: m[1] || m[2] });
  }
  return found;
}

/** Stop every test Electron on `profile` (or on any test profile), by PID. Returns what it stopped. */
function killTestElectron(profile) {
  const found = testElectronProcesses(profile);
  for (const p of found) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  return found;
}

module.exports = { testElectronProcesses, killTestElectron };
