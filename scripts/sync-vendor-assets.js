/**
 * Copy browser/CSS vendor files from node_modules → vendor/ so the app loads offline (no CDN sync XHR).
 * Run via postinstall, prestart, and predist.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = (...segs) => path.join(root, 'node_modules', ...segs);

function copyRel(fromUnderNm, toUnderRoot) {
  const from = path.join(root, 'node_modules', fromUnderNm);
  const to = path.join(root, toUnderRoot);
  if (!fs.existsSync(from)) {
    console.error('sync-vendor-assets: missing source (run npm install):', path.relative(root, from));
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/** marked package layout differs by major; normalize to vendor/marked/marked.min.js for index.html */
function copyMarkedToVendor() {
  const candidates = markedCandidates().map((rel) => nm(...rel.split('/')));
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    console.error('sync-vendor-assets: no marked browser bundle in node_modules/marked');
    process.exit(1);
  }
  const to = path.join(root, 'vendor/marked/marked.min.js');
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(found, to);
}

function markedCandidates() {
  return ['marked/marked.min.js', 'marked/marked.umd.min.js', 'marked/marked.umd.js', 'marked/lib/marked.umd.min.js', 'marked/lib/marked.umd.js'];
}

// Single files (+ marked via copyMarkedToVendor).
const fileCopies = [
  ['bootstrap/dist/css/bootstrap.min.css', 'vendor/bootstrap/css/bootstrap.min.css'],
  ['bootstrap/dist/js/bootstrap.bundle.min.js', 'vendor/bootstrap/js/bootstrap.bundle.min.js'],
  ['codemirror/lib/codemirror.css', 'vendor/codemirror/lib/codemirror.css'],
  ['codemirror/addon/dialog/dialog.css', 'vendor/codemirror/addon/dialog/dialog.css'],
  ['codemirror/lib/codemirror.js', 'vendor/codemirror/lib/codemirror.js'],
  ['codemirror/mode/xml/xml.js', 'vendor/codemirror/mode/xml/xml.js'],
  ['codemirror/mode/meta.js', 'vendor/codemirror/mode/meta.js'],
  ['codemirror/mode/markdown/markdown.js', 'vendor/codemirror/mode/markdown/markdown.js'],
  ['codemirror/addon/dialog/dialog.js', 'vendor/codemirror/addon/dialog/dialog.js'],
  ['codemirror/addon/search/searchcursor.js', 'vendor/codemirror/addon/search/searchcursor.js'],
  ['codemirror/addon/search/search.js', 'vendor/codemirror/addon/search/search.js'],
  ['codemirror/addon/search/jump-to-line.js', 'vendor/codemirror/addon/search/jump-to-line.js'],
  ['codemirror/addon/edit/continuelist.js', 'vendor/codemirror/addon/edit/continuelist.js'],
  ['mammoth/mammoth.browser.min.js', 'vendor/mammoth/mammoth.browser.min.js'],
  ['xlsx/dist/xlsx.full.min.js', 'vendor/xlsx/xlsx.full.min.js'],
  ['jszip/dist/jszip.min.js', 'vendor/jszip/jszip.min.js'],
];

for (const [fromRel, toRel] of fileCopies) copyRel(fromRel, toRel);
copyMarkedToVendor();

// Font Awesome CSS + webfonts (all.min.css uses ../webfonts/).
fs.cpSync(nm('@fortawesome/fontawesome-free', 'css'), path.join(root, 'vendor/fontawesome/css'), {
  recursive: true,
});
fs.cpSync(nm('@fortawesome/fontawesome-free', 'webfonts'), path.join(root, 'vendor/fontawesome/webfonts'), {
  recursive: true,
});

console.log('sync-vendor-assets: vendor/ updated');
