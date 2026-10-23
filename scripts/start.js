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
const path = require('path');

const RESTART_EXIT_CODE = 75;
const electronBin = require('electron');
const root = path.join(__dirname, '..');

function run() {
  const child = spawn(electronBin, ['.', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, TAGFOX_START_WRAPPER: String(RESTART_EXIT_CODE), TAGFOX_START_WRAPPER_PID: String(process.pid) },
  });
  child.on('exit', (code, signal) => {
    if (code === RESTART_EXIT_CODE) {
      console.log('[TagFox] restarting…');
      run();
    } else {
      process.exit(code == null ? (signal ? 1 : 0) : code);
    }
  });
}

run();
