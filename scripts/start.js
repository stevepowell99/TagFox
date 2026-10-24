/**
 * `npm start`: run Electron in this terminal and start it again when TagFox asks to restart.
 *
 * app.relaunch() starts the new process outside the terminal it came from, so Steve's npm start
 * window "terminated" every time TagFox restarted itself, and there was no longer a console to read.
 * A restart request is instead an exit with RESTART_EXIT_CODE, and this loop starts Electron again
 * in place. Any other exit code ends npm start as before.
 *
 * The wrapper's PID goes with the code, because environment variables outlive the wrapper: a TagFox
 * that app.relaunch() started, or anything it spawns, inherits them with no wrapper above it, and an
 * exit with RESTART_EXIT_CODE there ends TagFox for good. Main trusts the code only when its parent
 * is this PID.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RESTART_EXIT_CODE = 75;
const electronBin = require('electron');
const root = path.join(__dirname, '..');

/* Every Electron exit goes into the autostart log with its code and uptime, because an autostarted TagFox
   has no console: one that vanished (24 October 2026) left nothing to say whether it quit (code 0: the last
   window closed, or File > Exit), was killed, or crashed. */
function logExit(child, startedAt, code, signal) {
  if (process.env.TAGFOX_TEST_HIDDEN) return; // the restart test's instances are not Steve's TagFox
  try {
    const dir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'TagFox');
    fs.mkdirSync(dir, { recursive: true });
    const p = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const mins = Math.round((Date.now() - startedAt) / 60000);
    const line = `${stamp} TagFox (pid ${child.pid}) exited with code ${code}${signal ? ', signal ' + signal : ''} after ${mins} min\n`;
    fs.appendFileSync(path.join(dir, 'autostart.log'), line);
  } catch (_) {}
}

function run() {
  const startedAt = Date.now();
  const child = spawn(electronBin, ['.', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, TAGFOX_START_WRAPPER: String(RESTART_EXIT_CODE), TAGFOX_START_WRAPPER_PID: String(process.pid) },
  });
  child.on('exit', (code, signal) => {
    logExit(child, startedAt, code, signal);
    if (code === RESTART_EXIT_CODE) {
      console.log('[TagFox] restarting…');
      run();
    } else {
      process.exit(code == null ? (signal ? 1 : 0) : code);
    }
  });
}

run();
