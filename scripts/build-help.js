/**
 * Build help.html from help.md (Bootstrap modal shell + tab panes).
 * Run: npm run build:help  (also prestart / predist)
 */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const root = path.join(__dirname, '..');
const srcPath = path.join(root, 'help.md');
const outPath = path.join(root, 'help.html');
const appVersion = require(path.join(root, 'package.json')).version;

const src = fs.readFileSync(srcPath, 'utf8');

const tabRe = /<!--\s*help:tab\s+(\{[\s\S]*?\})\s*-->/g;
const tabs = [];
let preamble = '';
let lastEnd = 0;
let m;
while ((m = tabRe.exec(src)) !== null) {
  if (tabs.length === 0) {
    preamble = src.slice(0, m.index).trimEnd();
  } else {
    tabs[tabs.length - 1].body = src.slice(lastEnd, m.index).trim();
  }
  let meta;
  try {
    meta = JSON.parse(m[1]);
  } catch (e) {
    console.error('help.md: invalid help:tab JSON:', m[1], e.message);
    process.exit(1);
  }
  if (!meta.id || !meta.label) {
    console.error('help.md: help:tab requires id and label', meta);
    process.exit(1);
  }
  tabs.push({ meta, body: '' });
  lastEnd = tabRe.lastIndex;
}
if (tabs.length) {
  tabs[tabs.length - 1].body = src.slice(lastEnd).trim();
} else {
  preamble = src;
  console.error('help.md: no <!-- help:tab {...} --> sections found');
  process.exit(1);
}

const activeCount = tabs.filter((t) => t.meta.active).length;
if (activeCount !== 1) {
  console.error('help.md: exactly one tab must have "active": true, got', activeCount);
  process.exit(1);
}

marked.use({ gfm: true });

function renderBody(md) {
  if (!md) return '';
  let html = marked.parse(md, { async: false });
  // Bootstrap tables (GFM emits plain <table>).
  html = html.replace(/<table>/g, '<div class="table-responsive">\n<table class="table table-sm table-striped mb-0">');
  html = html.replace(/<\/table>/g, '</table>\n</div>');
  return html;
}

const navItems = tabs
  .map((t) => {
    const { id, label, active } = t.meta;
    const cls = active ? 'nav-link active text-start' : 'nav-link text-start';
    return `          <li class="nav-item" role="presentation">
            <button class="${cls}" id="help-tab-${id}" data-bs-toggle="tab" data-bs-target="#help-pane-${id}" type="button" role="tab" data-help-tab="${escapeAttr(id)}">${escapeHtml(label)}</button>
          </li>`;
  })
  .join('\n');

const panes = tabs
  .map((t) => {
    const { id, active, format } = t.meta;
    const show = active ? ' show active' : '';
    const inner = format === 'html' ? t.body.trim() : renderBody(t.body);
    return `          <div class="tab-pane fade${show}" id="help-pane-${id}" role="tabpanel" aria-labelledby="help-tab-${id}">
            <div class="help-md">
${indent(inner, '              ')}
            </div>
          </div>`;
  })
  .join('\n');

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function indent(html, prefix) {
  return html
    .split('\n')
    .map((line) => (line ? prefix + line : line))
    .join('\n');
}

const out = `${preamble}
<div class="modal fade" id="helpModal" tabindex="-1" aria-labelledby="helpModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" style="max-width: 56rem">
    <div class="modal-content help-modal-content">
      <div class="modal-header py-2">
        <h2 class="modal-title fs-5" id="helpModalLabel">&#x1F98A; TagFox Help <span class="text-secondary fw-normal fs-6 ms-2">v${appVersion}</span></h2>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body p-0 d-flex help-modal-body">
        <ul class="nav nav-pills flex-column flex-shrink-0 help-side-nav py-2 border-end" id="helpModalTabs" role="tablist">
${navItems}
        </ul>
        <div class="tab-content flex-grow-1 min-w-0 px-3 pb-3 overflow-y-auto help-tab-body">
${panes}
        </div>
      </div>
      <div class="modal-footer py-2">
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>
`;

fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', path.relative(root, outPath));
