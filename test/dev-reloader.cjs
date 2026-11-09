// The dev reloader reloads Whippet's own pages on a renderer edit, and reloads nothing once main-process or
// preload code has changed since start, leaving that to the Restart button (startDevReloader in main.js).
// A reload over a stale main ran new renderer code against the old main process and the window stopped
// drawing for 100 minutes (9 November 2026).
//
// The test runs its own copy of the app from a temporary folder (node_modules and vendor are junctions to this
// checkout), so it edits only the copy: an edit to the checkout itself would reach Steve's running Whippet.
// Two launches:
//   - a styles.css edit reloads the window (positive control: the watcher is live);
//   - then a main.js edit reloads nothing, a styles.css edit after it reloads nothing either, and runtime info
//     names main.js as changed since start;
//   - a fresh copy: a styles.css edit reloads, then a preload.js edit and a styles.css edit reload nothing.

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const ELECTRON = path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(ok, label) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

const httpGet = (url) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('timeout')));
  });

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });

/** A copy of the app's root files (package.json's build.files), with node_modules and vendor as junctions. */
function makeAppCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whippet-reloader-'));
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  for (const f of [...pkg.build.files, 'package.json']) {
    if (/[*/\\]/.test(f)) continue;
    const src = path.join(REPO, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
  }
  for (const d of ['node_modules', 'vendor']) fs.symlinkSync(path.join(REPO, d), path.join(dir, d), 'junction');
  return dir;
}

/** Remove the copy, unlinking the junctions first so nothing behind them is touched. */
function removeAppCopy(dir) {
  for (const d of ['node_modules', 'vendor']) {
    const link = path.join(dir, d);
    try { fs.unlinkSync(link); } catch (_) { try { fs.rmdirSync(link); } catch (_) {} }
    if (fs.existsSync(link)) { console.log(`  could not unlink ${link}; leaving ${dir} in place`); return; }
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

async function launch(appDir) {
  const port = await freePort();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'whippet-reloader-profile-'));
  const child = spawn(ELECTRON, [appDir, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    stdio: 'ignore',
    env: { ...process.env, TAGFOX_TEST_HIDDEN: '1', TAGFOX_TEST_DEV_RELOADER: '1', TAGFOX_TEST_PARENT_PID: String(process.pid) },
  });
  let page = null;
  for (let i = 0; i < 150 && !page; i++) {
    try {
      const list = JSON.parse(await httpGet(`http://localhost:${port}/json`));
      page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url || '') && t.webSocketDebuggerUrl);
    } catch (_) {}
    if (!page) await sleep(200);
  }
  if (!page) throw new Error('no index.html page appeared');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('ws error'))); });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  });
  const ev = (expression) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    }).then((r) => (r.exceptionDetails ? undefined : r.result.value));
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const stop = async () => {
    try { ws.close(); } catch (_) {}
    try { child.kill(); } catch (_) {}
    await Promise.race([exited, sleep(8000)]); // the profile stays locked until Electron has gone
    await sleep(500);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch (_) {}
  };
  return { ev, stop };
}

/** Set a marker on the page; a reload clears it. Waits until the page has loaded and can hold one. */
async function mark(ev) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await ev("document.readyState === 'complete' && !!window.tagBrowser && (window.__reloadMarker = 1) === 1")) === true) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

/** True if the page reloaded (marker gone) within ms. */
async function reloadedWithin(ev, ms) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
    await sleep(250);
    try {
      if ((await ev('window.__reloadMarker')) !== 1) return true;
    } catch (_) {
      return true; // the context went away mid-reload
    }
  }
  return false;
}

const touch = (appDir, f) => fs.appendFileSync(path.join(appDir, f), f.endsWith('.css') ? '\n/* touched */\n' : '\n// touched\n');

async function run(label, staleFile) {
  const appDir = makeAppCopy();
  const app = await launch(appDir);
  try {
    check(await mark(app.ev), `${label}: the copy's window loads`);
    touch(appDir, 'styles.css');
    check(await reloadedWithin(app.ev, 6000), `${label}: a styles.css edit reloads the window`);
    check(await mark(app.ev), `${label}: and it loads again`);

    touch(appDir, staleFile);
    check(!(await reloadedWithin(app.ev, 3500)), `${label}: a ${staleFile} edit reloads nothing`);
    touch(appDir, 'styles.css');
    check(!(await reloadedWithin(app.ev, 3500)), `${label}: after it, a styles.css edit reloads nothing either`);
    const info = await app.ev('window.tagBrowser.runtimeInfo({})');
    const changed = (info && info.changedSinceStart) || [];
    check(changed.includes(staleFile), `${label}: runtime info names ${staleFile} as changed, for the Restart button (${JSON.stringify(changed)})`);
  } finally {
    await app.stop();
    removeAppCopy(appDir);
  }
}

(async () => {
  const t0 = Date.now();
  try {
    await run('main', 'main.js');
    await run('preload', 'preload.js');
  } catch (e) {
    console.log('  FAIL ' + (e && e.message ? e.message : e));
    failures++;
  }
  console.log(`\n========== DEV RELOADER RESULT ==========`);
  console.log(failures ? `${failures} FAILURE(S)` : 'PASS: a renderer edit reloads, and nothing reloads over stale main-process or preload code');
  console.log(`(dev reloader: ${Math.round((Date.now() - t0) / 1000)}s)`);
  process.exit(failures ? 1 : 0);
})();
