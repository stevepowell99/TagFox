/**
 * Serve the bundled gmist: the built Cloudflare Worker under Miniflare, plus the
 * localfs sidecar it reads and writes files through. This is what a machine with
 * no gmist checkout runs, so Gabriele's TagFox opens markdown in gmist exactly as
 * Steve's does. Steve's own machine still prefers `npm run dev:local` (hot reload);
 * see startLocalGmist() in main.js.
 *
 * Why Miniflare and not `wrangler dev`: gmist is a Worker with a Durable Object, so
 * it needs workerd either way, but Miniflare is the embedding API and wrangler is a
 * developer CLI. Measured 24 August 2026: wrangler's arg parsing breaks under
 * ELECTRON_RUN_AS_NODE (yargs' hideBin() drops one fewer argv entry when it sees
 * process.versions.electron), and even past that its dev server never bound its
 * port. Miniflare starts clean under Electron's own node and needs no wrangler,
 * which also keeps 26MB out of the installer.
 *
 * Config arrives in the environment, so no file is written and no secret is logged:
 *   GMIST_DIR         the bundled folder (build/, runtime/, scripts/)
 *   GMIST_PORT        worker port (5173, matching what the dev server uses)
 *   LOCAL_FS_URL      sidecar origin (http://127.0.0.1:5199)
 *   LOCAL_FS_TOKEN    the sidecar's whole access control; see gmist's CLAUDE.md
 *   GMIST_SESSION_SECRET
 *   GMIST_PERSIST_DIR where the Durable Object keeps its state
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const GMIST_DIR = process.env.GMIST_DIR;
if (!GMIST_DIR) fail('GMIST_DIR is not set');
const PORT = Number(process.env.GMIST_PORT || 5173);
const SERVER_DIR = path.join(GMIST_DIR, 'build', 'server');
const CLIENT_DIR = path.join(GMIST_DIR, 'build', 'client');
const RUNTIME_MODULES = path.join(GMIST_DIR, 'runtime', 'node_modules');

function fail(msg) {
  console.error('serve-gmist: ' + msg);
  process.exit(1);
}

/* The sidecar is a plain node http server over node:fs, so Electron's own node runs
   it unchanged; it is gmist's file, copied in by scripts/bundle-gmist.js, never a
   reimplementation. It owns all path arithmetic and refuses any request without the
   token, so keep both halves on the same generated secret. */
function startSidecar() {
  const script = path.join(GMIST_DIR, 'scripts', 'localfs-server.mjs');
  if (!fs.existsSync(script)) fail('the localfs sidecar is missing from ' + GMIST_DIR);
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code) => {
    console.error('serve-gmist: localfs sidecar exited (' + (code == null ? 'signal' : code) + ')');
    process.exit(code == null ? 1 : code);
  });
  return child;
}

/* Miniflare cannot follow the dynamic imports the build emits between its chunks, so
   every emitted module is handed over by name. index.js must lead: Miniflare takes the
   first entry as the entrypoint. */
function collectModules() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.m?js$/.test(e.name)) out.push(p);
    }
  })(SERVER_DIR);
  const entry = path.join(SERVER_DIR, 'index.js');
  if (!out.includes(entry)) fail('the built worker has no index.js in ' + SERVER_DIR);
  return [entry, ...out.filter((p) => p !== entry)].map((p) => ({
    type: 'ESModule',
    path: p,
    contents: fs.readFileSync(p),
  }));
}

async function main() {
  if (!fs.existsSync(SERVER_DIR)) fail('no built worker at ' + SERVER_DIR);
  const cfgPath = path.join(SERVER_DIR, 'wrangler.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

  const miniflarePath = path.join(RUNTIME_MODULES, 'miniflare', 'dist', 'src', 'index.js');
  if (!fs.existsSync(miniflarePath)) fail('miniflare is missing from ' + RUNTIME_MODULES);
  const { Miniflare } = await import(pathToFileURL(miniflarePath).href);

  startSidecar();

  const mf = new Miniflare({
    name: cfg.name || 'mist',
    modulesRoot: SERVER_DIR,
    modules: collectModules(),
    compatibilityDate: cfg.compatibility_date,
    compatibilityFlags: cfg.compatibility_flags,
    /* has_user_worker is load-bearing: without it the assets router answers 404 for every
       route the worker owns, so /go and /open never reach gmist at all. */
    assets: { directory: CLIENT_DIR, binding: 'ASSETS', routerConfig: { has_user_worker: true } },
    durableObjects: { DocumentAgent: { className: 'DocumentAgent', useSQLite: true } },
    bindings: {
      LIBRARY_FOLDER_ID: (cfg.vars && cfg.vars.LIBRARY_FOLDER_ID) || '',
      SESSION_SECRET: process.env.GMIST_SESSION_SECRET,
      LOCAL_FS_URL: process.env.LOCAL_FS_URL,
      LOCAL_FS_TOKEN: process.env.LOCAL_FS_TOKEN,
    },
    host: '127.0.0.1',
    port: PORT,
    defaultPersistRoot: process.env.GMIST_PERSIST_DIR,
  });
  await mf.ready;
  console.log('serve-gmist: gmist ready on http://127.0.0.1:' + PORT);
}

main().catch((e) => {
  console.error('serve-gmist: ' + String((e && e.stack) || e));
  process.exit(1);
});
