// help.html is generated from help.md by scripts/build-help.js on every `npm start` and `npm run dist`, and it
// is also committed. So the build has to give back the committed text whichever line endings git checked
// help.md out with, or every start on a CRLF checkout leaves help.html modified. That happened: the build
// read a CRLF help.md, a blank line arrived as "\r", took the indent, and git status showed help.html
// modified after every start, which then blocked merges into Steve's checkout.
//
// This builds a copy of the working help.md, once with LF and once with CRLF, in a temp folder, and checks
// that each build (a) uses one line ending, the one help.md had, and (b) says exactly what the working
// help.html says, line endings aside. (b) also catches help.md edited without rebuilding help.html.
// Nothing in the repo is written. No Electron.
//
// Run: node test/help-build.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const lf = (s) => s.replace(/\r\n?/g, '\n');

function eolKinds(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const bareLf = (text.match(/\n/g) || []).length - crlf;
  return { crlf, bareLf };
}

const failures = [];
const check = (ok, label) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
};

const want = lf(fs.readFileSync(path.join(ROOT, 'help.html'), 'utf8'));
const md = lf(fs.readFileSync(path.join(ROOT, 'help.md'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tagfox-help-build-'));
try {
  fs.mkdirSync(path.join(tmp, 'scripts'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'build-help.js'), path.join(tmp, 'scripts', 'build-help.js'));
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
  for (const [name, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
    fs.writeFileSync(path.join(tmp, 'help.md'), md.replace(/\n/g, eol));
    execFileSync(process.execPath, [path.join(tmp, 'scripts', 'build-help.js')], {
      cwd: tmp,
      env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const out = fs.readFileSync(path.join(tmp, 'help.html'), 'utf8');
    const k = eolKinds(out);
    const uniform = name === 'CRLF' ? k.crlf > 0 && k.bareLf === 0 : k.crlf === 0 && k.bareLf > 0;
    check(uniform, `${name} help.md: help.html is written with ${name} line endings only (${k.crlf} CRLF, ${k.bareLf} LF)`);
    const got = lf(out);
    let firstDiff = '';
    if (got !== want) {
      const a = got.split('\n');
      const b = want.split('\n');
      const i = a.findIndex((line, n) => line !== b[n]);
      firstDiff = ` (first difference at line ${i + 1}: built ${JSON.stringify(a[i])}, committed ${JSON.stringify(b[i])})`;
    }
    check(got === want, `${name} help.md: the build says what help.html says${firstDiff || ''}`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.log(`\nhelp-build: ${failures.length} failure(s). If help.md changed, run npm run build:help and commit help.html.`);
  process.exit(1);
}
console.log('\nhelp-build: all checks passed');
