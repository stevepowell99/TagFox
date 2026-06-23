// Shared test harness for TagFox: launches an isolated Electron instance under the Chrome DevTools
// Protocol and drives the real renderer through the #tagfoxtest hook (renderer.js). No extra deps:
// raw CDP over Node's global WebSocket (Node 18+). Used by the dual-pane / refresh regression tests.

const { spawn } = require('child_process');
const http = require('http');
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpGet = (url, timeoutMs = 2000) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });

async function resolveEverythingUrl() {
  for (const base of URL_CANDIDATES) {
    try {
      const body = await httpGet(`${base}/?json=1&count=1&search=test`);
      JSON.parse(body); // valid Everything JSON
      return base;
    } catch (_) {}
  }
  throw new Error(`No Everything HTTP server reachable. Tried: ${URL_CANDIDATES.join(', ')}. Set TAGFOX_TEST_URL.`);
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
  const send = (method, params) => { const id = nextId++; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); }); };
  return { ready, send, close: () => ws.close() };
}

// Launch Electron (isolated profile + remote debugging), load the app with the #tagfoxtest hook, and
// return a driver. Each test passes a unique port + profile so runs do not collide.
async function connect({ port, profile, maxResults = 60, scope = SCOPES.repo, disableAutofill = true } = {}) {
  if (!port || !profile) throw new Error('connect needs { port, profile }');
  const baseUrl = await resolveEverythingUrl();
  const userData = path.join(os.tmpdir(), profile);
  // TAGFOX_TEST_HIDDEN keeps the window offscreen (never shown) so test runs do not flash up onscreen;
  // the hidden window still renders and drives through the #tagfoxtest hook over CDP.
  const child = spawn(ELECTRON, [APP_DIR, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TAGFOX_TEST_HIDDEN: '1' },
  });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d.toString()));

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
  await ev("location.hash = '#tagfoxtest'; location.reload(); 1");
  let ok = false;
  for (let i = 0; i < 80; i++) { try { if (await ev("typeof window.__tagfoxTest === 'object' && !!window.__tagfoxTest")) { ok = true; break; } } catch (_) {} await sleep(150); }
  if (!ok) throw new Error('#tagfoxtest hook never appeared (renderer load failed?)');

  if (disableAutofill) await T('disableAutofill'); // headless viewport makes autofill page count nondeterministic
  await T('configure', { baseUrl, rootFolder: scope, maxResults });

  // Settle: quiescent when no search depth, nothing in flight, and no pending debounce timer.
  const settle = async (label, maxMs = 15000) => {
    const t0 = Date.now(); let stableSince = null; let last = null;
    while (Date.now() - t0 < maxMs) {
      const s = await state(); last = s;
      if (s.topLevelSearchDepth === 0 && !s.searchInFlight && !s.pendingDebounce) {
        if (stableSince == null) stableSince = Date.now();
        else if (Date.now() - stableSince > 500) return s;
      } else stableSince = null;
      await sleep(100);
    }
    throw new Error(`[${label}] did not settle within ${maxMs}ms (last depth=${last && last.topLevelSearchDepth}, inFlight=${last && last.searchInFlight})`);
  };

  const close = () => { try { cdp.close(); } catch (_) {} try { child.kill('SIGKILL'); } catch (_) {} };
  return { baseUrl, ev, T, state, diag, settle, stderr: () => stderr, close };
}

// Standard structural invariants every settled state must satisfy. Returns an array of problem strings.
function structuralProblems(s) {
  const probs = [];
  if (!s) return ['no state'];
  if (s.dupBaseIds && s.dupBaseIds.length) probs.push(`dup/missing base ids: ${s.dupBaseIds.join(',')}`);
  if (s.baseIdTbodyPane !== s.activeResultsPane) probs.push(`base #tbody in pane ${s.baseIdTbodyPane}, active=${s.activeResultsPane}`);
  if (s.activeClassPane !== s.activeResultsPane) probs.push(`css active ${s.activeClassPane} != logical ${s.activeResultsPane}`);
  if (s.topLevelSearchDepth !== 0 || s.searchInFlight) probs.push(`not settled depth=${s.topLevelSearchDepth} inFlight=${s.searchInFlight}`);
  const activeState = s.activeResultsPane === 'A' ? s.paneA_state : s.paneB_state;
  if (s.lastRows !== activeState) probs.push(`active-state desync lastRows=${s.lastRows} paneState=${activeState}`);
  // recency / folders-only / files-only legitimately hide rows client-side; only assert render==data otherwise
  if (s.recency === 'all' && !s.foldersOnly && !s.filesOnly && (s.lastRows > 0) !== (s.tbodyBase > 0)) probs.push(`render!=data lastRows=${s.lastRows} tbody=${s.tbodyBase}`);
  return probs;
}

module.exports = { connect, structuralProblems, SCOPES, APP_DIR, sleep };
