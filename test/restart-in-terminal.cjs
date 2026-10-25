// Restart stays in the terminal: TagFox started by `npm start` (scripts/start.js) must report itself
// as such, and a restart request must bring up a NEW TagFox process under the SAME wrapper, which is
// the whole point (app.relaunch detached it from Steve's terminal). Also checks the "Running now"
// facts the Settings block and the header Restart button are drawn from.
//
// Then the case that made TagFox vanish on 23 October 2026: a TagFox carrying the wrapper's environment
// with no wrapper above it, which is what app.relaunch() (Ctrl+F5, the View menu) used to leave behind.
// It must not claim the terminal, and Restart must bring it back as a new process rather than exiting
// with a code nobody is waiting for.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { APP_DIR, sleep, freePort, testProfileDir } = require('./harness.cjs');
const { killTestElectron } = require('./test-processes.cjs');

// The CDP port each TagFox here listens on, from the OS (see harness.cjs); a restart keeps its arguments.
let port = 0;
const userData = testProfileDir('tagfox-test-restart');
const ELECTRON = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');

async function pageWs() {
  for (let i = 0; i < 150; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
      const p = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
      if (p) return p.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('no index.html CDP target');
}

// A page that reloads during startup destroys the context mid-call; that is a retry, not a failure.
// So is a reply that never comes: a call sent to a page on its way out can go unanswered, and this
// test once waited on one for over ten minutes with the suite stalled behind it.
async function evaluate(expr) {
  for (let i = 0; ; i++) {
    try {
      return await evaluateOnce(expr);
    } catch (e) {
      if (i >= 10 || !/context was destroyed|Cannot find context|no reply within|socket closed/i.test(e.message)) throw e;
      await sleep(300);
    }
  }
}

const EVALUATE_TIMEOUT_MS = 15000;

async function evaluateOnce(expr) {
  const ws = new WebSocket(await pageWs());
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('no reply within 5000ms (CDP socket never opened)')), 5000);
      ws.addEventListener('open', () => { clearTimeout(t); res(); });
      ws.addEventListener('error', (e) => { clearTimeout(t); rej(e); });
    });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no reply within ${EVALUATE_TIMEOUT_MS}ms`)), EVALUATE_TIMEOUT_MS);
      ws.addEventListener('close', () => { clearTimeout(timer); reject(new Error('CDP socket closed')); });
      ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id !== 1) return;
        clearTimeout(timer);
        if (m.error || m.result.exceptionDetails) reject(new Error(JSON.stringify(m.error || m.result.exceptionDetails)));
        else resolve(m.result.result.value);
      });
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    });
  } finally {
    ws.close();
  }
}

(async () => {
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (_) {}
  port = await freePort();
  const wrapper = spawn(process.execPath, [path.join(APP_DIR, 'scripts', 'start.js'), `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TAGFOX_TEST_HIDDEN: '1', TAGFOX_TEST_PARENT_PID: String(process.pid) },
  });
  let wrapperExited = false;
  wrapper.on('exit', () => (wrapperExited = true));
  const fail = (msg) => { console.error('FAIL ' + msg); try { spawn('taskkill', ['/PID', String(wrapper.pid), '/T', '/F']); } catch (_) {} process.exit(1); };
  try {
    const info = await evaluate('window.tagBrowser.runtimeInfo({ withGmist: true })');
    if (!info.restartsInTerminal) fail('npm start wrapper not detected: ' + JSON.stringify(info));
    if (!Array.isArray(info.changedSinceStart) || info.changedSinceStart.length) fail('fresh start reports changed code: ' + JSON.stringify(info.changedSinceStart));
    if (!info.gmist || typeof info.gmist.devPortHeld !== 'boolean') fail('no gmist status: ' + JSON.stringify(info.gmist));
    let text = '';
    for (let i = 0; i < 40 && !text.includes('PID'); i++) {
      // A page reloading under the call has not parsed the block yet: that is a wait too.
      text = await evaluate("document.getElementById('runningNowTagFox')?.textContent || ''");
      if (!text.includes('PID')) await sleep(250);
    }
    if (!text.includes('PID ' + info.pid)) fail('Running now block not filled: ' + text);
    console.log('ok   first start: pid ' + info.pid + ', gmist ' + JSON.stringify(info.gmist));
    if (info.gmist.holder && info.gmist.holder.kind === 'unknown') fail('gmist is up but its runner was not recognised');

    // Once only: the page dies mid-call, and a retry would restart the new TagFox as well.
    await evaluateOnce('window.tagBrowser.restartTagFox(), 1').catch(() => {});
    let second = null;
    for (let i = 0; i < 60 && !second; i++) {
      await sleep(500);
      try {
        const again = await evaluate('window.tagBrowser.runtimeInfo({})');
        if (again.pid !== info.pid) second = again;
      } catch (_) {}
    }
    if (!second) fail('no new TagFox after restart');
    if (wrapperExited) fail('the npm start wrapper exited on restart');
    if (!second.restartsInTerminal) fail('restarted TagFox lost the wrapper');
    console.log('ok   restart: new pid ' + second.pid + ' under the same wrapper (pid ' + wrapper.pid + ')');
  } catch (e) {
    fail(e.message);
  }
  spawn('taskkill', ['/PID', String(wrapper.pid), '/T', '/F']);

  // The orphan: the wrapper's variables, naming a wrapper that is not this process's parent. Its Restart
  // relaunches it outside this test's process tree, so cleanup goes by its profile, not by the tree, and
  // the wait for the relaunch is bounded: on 23 October 2026 an unanswered page held this test for the
  // suite's whole five minutes and the relaunched TagFox was left open on Steve's screen.
  port = await freePort();
  const orphanProfile = `${userData}-orphan`;
  const orphan = spawn(ELECTRON, [APP_DIR, `--remote-debugging-port=${port}`, `--user-data-dir=${orphanProfile}`], {
    cwd: APP_DIR,
    stdio: 'ignore',
    env: { ...process.env, TAGFOX_TEST_HIDDEN: '1', TAGFOX_START_WRAPPER: '75', TAGFOX_START_WRAPPER_PID: String(wrapper.pid) },
  });
  let failure = null;
  try {
    const info = await evaluate('window.tagBrowser.runtimeInfo({})');
    if (info.restartsInTerminal) throw new Error('a TagFox with no wrapper above it claims the terminal: ' + JSON.stringify(info));
    await evaluateOnce('window.tagBrowser.restartTagFox(), 1').catch(() => {});
    let relaunched = null;
    for (const deadline = Date.now() + 60000; !relaunched && Date.now() < deadline; ) {
      await sleep(500);
      try {
        const again = await evaluateOnce('window.tagBrowser.runtimeInfo({})');
        if (again.pid !== info.pid) relaunched = again;
      } catch (_) {}
    }
    if (!relaunched) throw new Error('Restart with no wrapper ended TagFox, or the relaunched one never answered within 60s');
    if (relaunched.restartsInTerminal) throw new Error('the relaunched TagFox claims the terminal');
    console.log('ok   no wrapper: pid ' + info.pid + ' relaunched as ' + relaunched.pid + ', neither claiming the terminal');
  } catch (e) {
    failure = e.message;
  } finally {
    for (const p of killTestElectron(orphanProfile)) console.log('     stopped test TagFox pid ' + p.pid + ' (' + p.profile + ')');
    spawn('taskkill', ['/PID', String(orphan.pid), '/T', '/F']);
  }
  if (failure) {
    console.error('FAIL ' + failure);
    process.exit(1);
  }
  console.log('PASS restart stays in the terminal, and comes back without one');
  process.exit(0);
})();
