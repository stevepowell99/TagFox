// Repro: drive the real app and capture renderer exceptions / process crashes.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const APP_DIR = path.resolve(__dirname, '..');
const ELECTRON = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpGet = (url, t = 2000) => new Promise((resolve, reject) => {
  const req = http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); });
  req.on('error', reject); req.setTimeout(t, () => req.destroy(new Error('timeout')));
});

async function resolveUrl() {
  for (const base of [process.env.TAGFOX_TEST_URL, 'http://localhost:8080', 'http://localhost:7070'].filter(Boolean)) {
    try { JSON.parse(await httpGet(`${base}/?json=1&count=1&search=test`)); return base; } catch (_) {}
  }
  throw new Error('No Everything HTTP server');
}
async function findPage(port) {
  for (let i = 0; i < 100; i++) {
    try { const list = JSON.parse(await httpGet(`http://localhost:${port}/json`)); const p = list.find((t) => t.type === 'page' && /index\.html/.test(t.url || '')); if (p && p.webSocketDebuggerUrl) return p; } catch (_) {}
    await sleep(200);
  }
  throw new Error('no page target');
}

function mkScope() {
  const dir = path.join(os.tmpdir(), 'tf-repro-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Report xkdraft xkurgent.txt'), 'a');
  fs.writeFileSync(path.join(dir, 'Notes xkTODO.md'), 'b');
  fs.writeFileSync(path.join(dir, 'plain file.txt'), 'c');
  fs.mkdirSync(path.join(dir, 'sub xkproject'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sub xkproject', 'inner xkdraft.txt'), 'd');
  return dir;
}

(async () => {
  const baseUrl = await resolveUrl();
  const scope = mkScope();
  const port = 9931;
  const userData = path.join(os.tmpdir(), 'tf-repro-profile-' + Date.now());
  const events = [];
  const child = spawn(ELECTRON, [APP_DIR, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TAGFOX_TEST_HIDDEN: '1' } });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('exit', (code, sig) => events.push(`MAIN PROCESS EXIT code=${code} sig=${sig}`));

  const page = await findPage(port);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1; const pending = new Map();
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', (e) => rej(new Error('ws'))); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      events.push('EXCEPTION: ' + (d.exception?.description || d.text || JSON.stringify(d)).split('\n').slice(0, 4).join(' | '));
    } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      events.push(m.params.type.toUpperCase() + ': ' + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 200));
    } else if (m.method === 'Inspector.targetCrashed') {
      events.push('!!! RENDERER PROCESS CRASHED (Inspector.targetCrashed) !!!');
    }
  });
  const send = (method, params) => { const id = nextId++; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); }); };
  await send('Runtime.enable'); await send('Log.enable'); await send('Inspector.enable');
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval threw: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]); return r.result.value; };
  const T = (m, ...a) => ev(`window.__tagfoxTest.${m}(${a.map((x) => JSON.stringify(x)).join(',')})`);

  await ev("location.hash = '#tagfoxtest'; location.reload(); 1");
  let ok = false;
  for (let i = 0; i < 80; i++) { try { if (await ev("typeof window.__tagfoxTest === 'object' && !!window.__tagfoxTest")) { ok = true; break; } } catch (_) {} await sleep(150); }
  if (!ok) { console.log('HOOK NEVER APPEARED. stderr tail:\n' + stderr.split('\n').slice(-20).join('\n')); console.log('EVENTS:', events); child.kill('SIGKILL'); process.exit(1); }

  await T('disableAutofill');
  await T('configure', { baseUrl, rootFolder: scope, maxResults: 60 });
  await sleep(800);

  // Drive realistic tag actions, the area the other agent changed.
  const steps = [
    ["search 'xk'", () => T('setQuery', 'xk')],
    ["search 'report'", () => T('setQuery', 'report')],
    ["clear query", () => T('setQuery', '')],
    ["rescan tags", () => ev('window.__tagfoxTest.rescanTags ? window.__tagfoxTest.rescanTags() : (document.querySelector("#tagBar [title*=Rescan]")||document.querySelector("#tagBar button"))?.click()')],
    ["toggle first tag pill", () => ev('(document.querySelector("#tagBar .tagfox-tag-pill, #tagBar button.btn"))?.click()')],
    ["toggle first tag pill again", () => ev('(document.querySelector("#tagBar .tagfox-tag-pill, #tagBar button.btn"))?.click()')],
  ];
  for (const [label, fn] of steps) {
    try { await fn(); } catch (e) { events.push('STEP-THREW [' + label + ']: ' + e.message); }
    await sleep(900);
    events.push('-- after: ' + label);
  }
  await sleep(1000);

  console.log('=== CAPTURED EVENTS ===');
  for (const e of events) console.log(e);
  const crashy = stderr.split('\n').filter((l) => /error|exception|crash|throw|undefined|cannot/i.test(l));
  if (crashy.length) { console.log('\n=== stderr (filtered) ==='); console.log(crashy.slice(0, 30).join('\n')); }
  child.kill('SIGKILL');
  process.exit(0);
})().catch((e) => { console.error('REPRO HARNESS ERROR:', e); process.exit(1); });
