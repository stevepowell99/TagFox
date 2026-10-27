/**
 * Run electron-builder with output outside the repo (LocalAppData).
 * Avoids Windows "app.asar in use" failures when editors watch the project tree.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
// e.g. C:\Users\<you>\AppData\Local\TagFox-dist — not OneDrive, not in workspace watchers
const outDir = path.join(os.homedir(), 'AppData', 'Local', 'TagFox-dist');
// The download folder friends are given a link to, so it holds the current installer and nothing else.
const copyDir = path.join(os.homedir(), 'My Drive (hello@causalmap.app)', 'Causal Map', 'TagFox download');
const eb = path.join(root, 'node_modules', '.bin', 'electron-builder.cmd');

console.log('electron-builder output directory:', outDir);

const r = spawnSync(
  eb,
  ['--win', `--config.directories.output=${outDir}`],
  { stdio: 'inherit', cwd: root, shell: true }
);
if (r.status !== 0) process.exit(r.status == null ? 1 : r.status);

// Copy the built installer exe to the download folder and remove older installers from it; each one is still
// in outDir.
try {
  const exeNames = fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.exe'))
    .map((d) => d.name)
    .sort((a, b) => {
      const aMs = fs.statSync(path.join(outDir, a)).mtimeMs;
      const bMs = fs.statSync(path.join(outDir, b)).mtimeMs;
      return bMs - aMs;
    });
  if (!exeNames.length) throw new Error(`No installer .exe found in ${outDir}`);
  fs.mkdirSync(copyDir, { recursive: true });
  const src = path.join(outDir, exeNames[0]);
  const dest = path.join(copyDir, exeNames[0]);
  fs.copyFileSync(src, dest);
  console.log('Copied installer to:', dest);
  for (const name of fs.readdirSync(copyDir)) {
    if (name !== exeNames[0] && /^TagFox Setup .*\.exe$/i.test(name)) {
      fs.unlinkSync(path.join(copyDir, name));
      console.log('Removed older installer:', name);
    }
  }
} catch (e) {
  console.error('Built OK but could not copy installer:', String(e.message || e));
  process.exit(1);
}

process.exit(0);
