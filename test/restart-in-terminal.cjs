// Restart stays in the terminal: TagFox started by `npm start` (scripts/start.js) must report itself
// as such, and a restart request must bring up a NEW TagFox process under the SAME wrapper, which is
// the whole point (app.relaunch detached it from Steve's terminal). Also checks the "Running now"
// facts the Settings block and the header Restart button are drawn from.
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { APP_DIR, sleep } = require('./harness.cjs');

const PORT = 9347;
const userData = path.join(os.tmpdir(), 'tagfox-test-restart');

async function pageWs() {
  for (let i = 0; i < 150; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
      if (p) return p.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('no index.html CDP target');
}

// A page that reloads during startup destroys the context mid-call; that is a retry, not a failure.
async function evaluate(expr) {
  for (let i = 0; ; i++) {
    try {
      return await evaluateOnce(expr);
    } catch (e) {
      if (i >= 10 || !/context was destroyed|Cannot find context/i.test(e.message)) throw e;
      await sleep(300);
    }
  }
}

async function evaluateOnce(expr) {
  const ws = new WebSocket(await pageWs());
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const out = await new Promise((resolve, reject) => {
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== 1) return;
      if (m.error || m.result.exceptionDetails) reject(new Error(JSON.stringify(m.error || m.result.exceptionDetails)));
      else resolve(m.result.result.value);
    });
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
  ws.close();
  return out;
}

(async () => {
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (_) {}
  const wrapper = spawn(process.execPath, [path.join(APP_DIR, 'scripts', 'start.js'), `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TAGFOX_TEST_HIDDEN: '1' },
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
      text = await evaluate("document.getElementById('runningNowTagFox').textContent");
      if (!text.includes('PID')) await sleep(250);
    }
    if (!text.includes('PID ' + info.pid)) fail('Running now block not filled: ' + text);
    console.log('ok   first start: pid ' + info.pid + ', gmist ' + JSON.stringify(info.gmist));
    if (info.gmist.holder && info.gmist.holder.kind === 'unknown') fail('gmist is up but its runner was not recognised');

    await evaluate('window.tagBrowser.restartTagFox(), 1').catch(() => {}); // the page dies mid-call
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
  console.log('PASS restart stays in the terminal');
  process.exit(0);
})();
