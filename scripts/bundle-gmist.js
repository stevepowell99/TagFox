/**
 * Stage a runnable gmist into _gmist/, so `npm run dist` produces an installer that
 * carries gmist with it. Without this a packaged TagFox has no local gmist at all:
 * markdown is routed to gmist by default, and on a machine with no checkout every
 * markdown row reported "could not find the gmist repo" (Gabriele's build, Aug 2026).
 *
 * What goes in: the built worker and its client assets, the localfs sidecar, and the
 * Miniflare/workerd runtime that runs a Worker outside Cloudflare. No wrangler, no
 * vite, no gmist source, and no node runtime, since Electron's own node runs it.
 * Everything is copied from the gmist checkout, which is the single source; this
 * script never edits it beyond running its build.
 *
 * Steve's own machine still uses `npm run dev:local` from that checkout, so this
 * staging only matters to the installer. Skips itself (leaving any earlier staging in
 * place) when no checkout is present, so a clone without gmist can still build TagFox.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const stage = path.join(root, '_gmist');

/* The runtime Miniflare needs. sharp is deliberately absent: it is a lazy dependency
   behind the images binding, which gmist does not use, and it would add 19MB. */
const RUNTIME_PACKAGES = [
  'miniflare',
  'workerd',
  '@cloudflare/workerd-windows-64',
  'undici',
  'ws',
  'youch',
  '@cspotcode/source-map-support',
];

function findGmistRepo() {
  const candidates = [
    process.env.GMIST_REPO,
    path.resolve(root, '..', 'mist'),
    'C:\dev\mist',
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg && pkg.scripts && pkg.scripts['dev:local']) return dir;
    } catch (_) {}
  }
  return null;
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isSymbolicLink()) continue;
    else fs.copyFileSync(s, d);
  }
}

const repo = findGmistRepo();
if (!repo) {
  console.log('bundle-gmist: no gmist checkout found, leaving _gmist as it is.');
  process.exit(0);
}
console.log('bundle-gmist: using gmist checkout', repo);

/* Build from source every time. A stale build/ is the one failure this script cannot
   report, because the installer would look complete and ship an old gmist. */
const r = spawnSync('npm run build', [], { cwd: repo, shell: true, stdio: 'inherit' });
if (r.status !== 0) {
  console.error('bundle-gmist: gmist build failed, so nothing was staged.');
  process.exit(r.status == null ? 1 : r.status);
}

fs.rmSync(stage, { recursive: true, force: true });
copyTree(path.join(repo, 'build', 'server'), path.join(stage, 'build', 'server'));
copyTree(path.join(repo, 'build', 'client'), path.join(stage, 'build', 'client'));

/* .dev.vars is Steve's own machine's secrets, and react-router copies it into the build.
   It must never reach an installer: it carries his session secret and his sidecar token. */
for (const leak of ['.dev.vars', '.env', '.env.local']) {
  const p = path.join(stage, 'build', 'server', leak);
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log('bundle-gmist: dropped', leak, 'from the staged build');
  }
}

/* The launcher runs as a child process, so it must sit outside app.asar where a plain
   node child can read it. Staging it here also keeps the bundle self-describing. */
fs.copyFileSync(path.join(root, 'serve-gmist.cjs'), path.join(stage, 'serve-gmist.cjs'));

fs.mkdirSync(path.join(stage, 'scripts'), { recursive: true });
for (const f of ['localfs-server.mjs', 'dev-vars.mjs']) {
  fs.copyFileSync(path.join(repo, 'scripts', f), path.join(stage, 'scripts', f));
}

for (const pkg of RUNTIME_PACKAGES) {
  const src = path.join(repo, 'node_modules', ...pkg.split('/'));
  if (!fs.existsSync(src)) {
    console.error('bundle-gmist: missing runtime package ' + pkg + ' in ' + repo + '/node_modules (run npm install there).');
    process.exit(1);
  }
  copyTree(src, path.join(stage, 'runtime', 'node_modules', ...pkg.split('/')));
}

let bytes = 0;
(function measure(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) measure(p);
    else bytes += fs.statSync(p).size;
  }
})(stage);
console.log('bundle-gmist: staged', (bytes / 1024 / 1024).toFixed(0) + 'MB into', stage);
