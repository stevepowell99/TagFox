// Shared test harness for TagFox: launches an isolated Electron instance under the Chrome DevTools
// Protocol and drives the real renderer through the #tagfoxtest hook (renderer.js). No extra deps:
// raw CDP over Node's global WebSocket (Node 18+). Used by the dual-pane / refresh regression tests.

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_DIR = path.resolve(__dirname, '..');
const ELECTRON = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');

// Everything HTTP server URL: env override wins, else probe the common ports (8080 is the documented
// default; 7070 is also common). Keeps the suite machine-independent rather than hardcoding one port.
const URL_CANDIDATES = [process.env.TAGFOX_TEST_URL, 'http://localhost:8080', 'http://localhost:7070'].filter(Boolean);
// Test scopes are inside the repo itself, so the suite works on any checkout regardless of where it lives.
const SCOPES = {
  repo: APP_DIR,
  vendor: path.join(APP_DIR, 'vendor'),
  scripts: path.join(APP_DIR, 'scripts'),
  test: path.join(APP_DIR, 'test'),
};

// Each checkout (C:\dev\TagFox and every worktree) runs its own suite, often at the same time, so a test's
// profile folder carries a tag for its checkout and its CDP port comes from the OS: two checkouts never share
// a profile, which connect() wipes at launch, or a port, which each would otherwise drive the other through.
const CHECKOUT_TAG = require('crypto').createHash('sha1').update(APP_DIR.toLowerCase()).digest('hex').slice(0, 6);
const testProfileDir = (name) => path.join(os.tmpdir(), `${name}-${CHECKOUT_TAG}`);
const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOOK_WAIT_MS = 45000;
const HOOK_SLOW_MS = 5000;
const httpGet = (url, timeoutMs = 2000) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });

// Retry, and allow well over the old 2s: this probe runs a real search over the whole index, and a
// cold one measured 4.8s on a machine where the server was up and healthy the whole time. A single
// short shot made whole test files abort at connect() with "no Everything HTTP server reachable",
// which reads as a broken app rather than an impatient probe.
async function resolveEverythingUrl() {
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const base of URL_CANDIDATES) {
      try {
        const body = await httpGet(`${base}/?json=1&count=1&search=test`, 8000);
        JSON.parse(body); // valid Everything JSON
        return base;
      } catch (_) {}
    }
    if (attempt < 3) await sleep(600 * (attempt + 1));
  }
  throw new Error(
    `No Everything HTTP server reachable after 4 attempts. Tried: ${URL_CANDIDATES.join(', ')}. Set TAGFOX_TEST_URL.`,
  );
}

async function findPageTarget(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const list = JSON.parse(await httpGet(`http://localhost:${port}/json`));
      const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url || ''));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('No index.html CDP target appeared');
}

function makeCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const ready = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', (e) => rej(new Error('ws ' + (e.message || '')))); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
  });
  // A TagFox that goes away mid-test closes this socket. Fail what was waiting on it, or node runs out of work
  // with the promise unsettled and exits 0 before the test prints a result.
  ws.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('CDP connection closed: the test TagFox went away'));
    pending.clear();
  });
  const send = (method, params) => { const id = nextId++; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); }); };
  return { ready, send, close: () => ws.close() };
}

// Launch Electron (isolated profile + remote debugging), load the app with the #tagfoxtest hook, and
// return a driver. Each test passes a unique profile name, so its runs do not collide with another test's.
// profileFiles: { name: text } written into the fresh profile before launch, for settings main reads at startup.
// autoRefresh: leave the 5-second auto-refresh timer running. Off by default: a tick is a whole search arriving
// at a moment no test chose, which shifted a count in runner-query-order one run in five, and a stranded test
// instance ticking for an hour once loaded Everything for the whole machine. Tests drive ticks with autoTick.
// scope: the folder connect() goes into with a search before it returns, as a folder pick does. Runner starts
// from its own state, whose scope is the whole machine, and a folder set without a search leaves the
// breadcrumb and the list on the old one.
async function connect({ profile, maxResults = 60, scope = SCOPES.repo, disableAutofill = true, profileFiles = {}, autoRefresh = false } = {}) {
  if (!profile) throw new Error('connect needs { profile }');
  const baseUrl = await resolveEverythingUrl();
  const port = await freePort();
  const userData = testProfileDir(profile);
  // Wipe the profile so every run starts fresh (deterministic startup: no settings carried over from a
  // prior run).
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (_) {}
  for (const [name, text] of Object.entries(profileFiles)) {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, name), text, 'utf8');
  }
  // TAGFOX_TEST_HIDDEN keeps the window offscreen (never shown) so test runs do not flash up onscreen;
  // the hidden window still renders and drives through the #tagfoxtest hook over CDP.
  const child = spawn(ELECTRON, [APP_DIR, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TAGFOX_TEST_HIDDEN: '1', TAGFOX_TEST_PARENT_PID: String(process.pid) },
  });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d.toString()));
  const exited = new Promise((resolve) => child.once('exit', resolve));

  const page = await findPageTarget(port);
  const cdp = makeCdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
    return r.result.value;
  };
  const T = (m, ...args) => ev(`window.__tagfoxTest.${m}(${args.map((a) => JSON.stringify(a)).join(',')})`);
  const state = () => ev('window.__tagfoxTest.state()');
  const diag = () => ev('window.__tagfoxTest.diag()');

  // reload with the hook hash; this also re-runs the dual-pane startup dance
  // The hook is up in about 1s, but a machine busy with other Electron starts has taken over 12s, which
  // failed whole test files before any check ran. So wait long, say when a start was slow, and on a real
  // timeout report what the page was doing, so a loaded machine and a broken renderer read differently.
  // The target is listed under index.html while its first load may still be committing, so a hash set then can
  // land on the outgoing document and its reload be swallowed by the pending load: index.html finishes without
  // #tagfoxtest and the hook never appears, which is how every hung start looked (complete, no hash in the href).
  // So set it as soon as the document evaluated in is index.html itself (still loading is fine), never the blank
  // page before it. Letting a hook-less load finish is no cure: on a fresh profile, CDP key events then stop
  // reaching the page, so key tests fail instead (_tmp probe, 25 October 2026). If a loaded index.html still
  // turns out to lack the hash, set it again, and say so.
  const ARM_EARLY = "location.href.includes('index.html') ? (location.hash = '#tagfoxtest', location.reload(), 'armed') : location.href";
  const ARM = `(() => {
    if (location.hash.includes('tagfoxtest')) return 'has-hash';
    if (!location.href.includes('index.html') || document.readyState !== 'complete') return 'loading';
    location.hash = '#tagfoxtest'; location.reload(); return 'armed';
  })()`;
  let arms = 0;
  for (let t0 = Date.now(); Date.now() - t0 < 15000; ) {
    try { if ((await ev(ARM_EARLY)) === 'armed') { arms = 1; break; } } catch (_) {}
    await sleep(50);
  }
  const hookT0 = Date.now();
  let ok = false;
  let lastArm = hookT0;
  while (Date.now() - hookT0 < HOOK_WAIT_MS) {
    try {
      if (await ev("typeof window.__tagfoxTest === 'object' && !!window.__tagfoxTest")) { ok = true; break; }
      if (Date.now() - lastArm > 3000 && (await ev(ARM)) === 'armed') { arms++; lastArm = Date.now(); }
    } catch (_) {}
    await sleep(150);
  }
  const hookMs = Date.now() - hookT0;
  if (!ok) {
    let page = 'page unreachable';
    try { page = JSON.stringify(await ev("({ href: location.href, readyState: document.readyState })")); } catch (_) {}
    throw new Error(`#tagfoxtest hook never appeared after ${hookMs}ms, hash set ${arms} time(s) (${page}); Electron stderr tail: ${stderr.slice(-600) || '(empty)'}`);
  }
  if (arms > 1) console.log(`(the test hash had to be set ${arms} times: the first load swallowed it)`);
  if (hookMs > HOOK_SLOW_MS) console.log(`(slow start: the test hook took ${hookMs}ms to appear)`);

  if (disableAutofill) await T('disableAutofill'); // headless viewport makes autofill page count nondeterministic
  await T('configure', { baseUrl, rootFolder: scope, maxResults });
  if (!autoRefresh) await T('autoStop');

  // Settle: quiescent when no search flow is running, nothing is in flight, and no debounce timer is pending.
  const settle = async (label, maxMs = 15000) => {
    const t0 = Date.now(); let stableSince = null; let last = null;
    while (Date.now() - t0 < maxMs) {
      const s = await state(); last = s;
      if (!s.searchFlowRunning && !s.searchInFlight && !s.pendingDebounce) {
        if (stableSince == null) stableSince = Date.now();
        else if (Date.now() - stableSince > 500) return s;
      } else stableSince = null;
      await sleep(100);
    }
    throw new Error(`[${label}] did not settle within ${maxMs}ms (last flowRunning=${last && last.searchFlowRunning}, inFlight=${last && last.searchInFlight})`);
  };
  await T('setScope', scope);
  await settle('scope');

  // A key pressed as a user presses it, keydown then keyup over CDP. A key that changed nothing either never reached
  // the page, reached it and matched no entry in Runner's key table, or ran its entry to no effect, and only the
  // page's own record of its keys (the #tagfoxtest hook's keysSeen) tells those apart. So key() returns a note of
  // where that record stood, keyFate(note) reads what became of the key, and takeKeys() hands a check the keys
  // pressed since the last one, so that a failed check can say.
  let pressed = [];
  const key = async (k, code, vk, mods = 0, text, extra) => {
    const from = await T('keysSeenCount');
    await cdp.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, text, ...extra });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
    const name = (mods & 2 ? 'Ctrl+' : '') + (mods & 1 ? 'Alt+' : '') + (mods & 8 ? 'Shift+' : '') + (/^(Digit|Key)./.test(code) ? code.replace(/^(Digit|Key)/, '') : k === ' ' ? 'Space' : k);
    const note = { name, code, from };
    pressed.push(note);
    return note;
  };
  const takeKeys = () => { const k = pressed; pressed = []; return k; };
  const keyFate = async (note) => {
    let seen;
    try {
      seen = (await T('keysSeen', note.from)).find((n) => n.code === note.code);
    } catch (e) {
      return `${note.name}: unknown, the page could not be asked (${e.message})`;
    }
    if (!seen) return `${note.name}: never reached the page`;
    const at = `${note.name}: reached the page at ${seen.at}`;
    if (!seen.table) return `${at}, and was taken before the key table`;
    if (!seen.entry) return `${at}, no entry matched`;
    return `${at}, entry ran (${seen.entry})${seen.consumed ? '' : ' and passed the key on'}`;
  };
  // Positive control for keyFate: a key raised inside the page must be recorded as reaching the key table and
  // matching no entry, or a broken record would report every key as never having arrived.
  const keyRecorderWorks = async () => {
    const from = await T('keysSeenCount');
    await ev(`(document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F24', code: 'F24', bubbles: true })), 1)`);
    const seen = (await T('keysSeen', from)).find((n) => n.code === 'F24');
    return { ok: !!seen && seen.table && !seen.entry, seen };
  };

  // A killed Electron is not gone when kill() returns: Windows lists it, with its profile's lockfile held,
  // until it has been torn down, which took up to 5s with two test instances running and can outlast
  // run-all.cjs's 9-second look on a loaded machine. Node's own liveness check (process.kill(pid, 0)) fails
  // within a millisecond of the kill, so close() waits for the child's exit event, which fires only once the
  // process has ended. Every test awaits it before exiting.
  let closed = false;
  let closeDone = false;
  // A test Electron that ends before close() says how, since a main process that dies writes nothing to the perf
  // log and the test sees only its CDP connection close. close-hides.cjs ends one on purpose, with Quit TagFox.
  child.once('exit', (code, signal) => {
    if (closed) return;
    const hex = code > 255 ? ` (0x${(code >>> 0).toString(16)})` : '';
    console.log(`  (the test Electron, PID ${child.pid}, ended before the test closed it: exit code ${code}${hex}, signal ${signal}; stderr tail: ${stderr.slice(-400).trim() || '(empty)'})`);
  });
  const exitedWithin = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      exited.then(() => { clearTimeout(timer); resolve(true); });
    });
  const close = async () => {
    closed = true;
    try { cdp.close(); } catch (_) {}
    try { child.kill('SIGKILL'); } catch (_) {}
    if (!(await exitedWithin(30000))) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      if (await exitedWithin(10000)) console.log(`  (the test Electron, PID ${child.pid}, ended only after taskkill)`);
      else {
        console.log(`  FAIL the test Electron (PID ${child.pid}) had not ended 40s after it was killed`);
        process.exitCode = 1;
      }
    }
    closeDone = true;
  };
  // A test that exits while close() is still waiting has not awaited it, and leaves its Electron being torn down.
  process.on('exit', () => {
    if (!closed || closeDone) return;
    console.log('  FAIL the test exited before close() had finished (await drv.close())');
    process.exitCode = 1;
  });
  // Node running out of work before the test closed its driver means the test stopped part-way, so it must
  // not exit 0 (a test whose TagFox died mid-run used to end silently with success).
  process.on('beforeExit', () => {
    if (closed || process.exitCode) return;
    console.log('  FAIL the test ended before it finished (its driver was never closed)');
    process.exitCode = 1;
  });
  return { baseUrl, userData, port, pid: child.pid, ev, T, state, diag, settle, send: cdp.send, key, takeKeys, keyFate, keyRecorderWorks, stderr: () => stderr, close };
}

// Standard structural invariants every settled state must satisfy. Returns an array of problem strings.
function structuralProblems(s) {
  const probs = [];
  if (!s) return ['no state'];
  if (s.dupBaseIds && s.dupBaseIds.length) probs.push(`dup/missing base ids: ${s.dupBaseIds.join(',')}`);
  if (s.searchFlowRunning || s.searchInFlight) probs.push(`not settled flowRunning=${s.searchFlowRunning} inFlight=${s.searchInFlight}`);
  // What is on screen is what the rows say should be: the render window of the listed rows.
  if (s.tbodyBase !== s.renderedRows) probs.push(`render!=data tbody=${s.tbodyBase} rows to draw=${s.renderedRows} lastRows=${s.lastRows}`);
  return probs;
}

module.exports = { connect, structuralProblems, SCOPES, APP_DIR, sleep, freePort, testProfileDir };
