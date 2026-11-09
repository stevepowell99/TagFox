// Makes the README screenshot (docs/img/whippet-main.png). It writes a small demo folder of made-up files under
// _tmp/, starts a hidden test instance of Whippet on its own temporary userData through the test harness (the
// #tagfoxtest hook over CDP), waits for Everything to index the demo files, searches them, previews a markdown
// note in the Viewer and captures the window with Page.captureScreenshot at 1400x850. It never touches the
// running app or any real file, and it stops only the test instance it started, by PID. The demo folder is
// removed afterwards (pass --keep to leave it). Not a test, so it is not in test/run-all.cjs; re-run it after UI
// changes with `node scripts/make-readme-screenshot.cjs [output.png] [--keep]`.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { connect, APP_DIR, sleep } = require('../test/harness.cjs');

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const out = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(APP_DIR, 'docs', 'img', 'whippet-main.png'));
const root = path.join(APP_DIR, '_tmp', 'demo-workspace');
const scope = path.join(root, 'Projects');
const QUERY = 'launch';
const SELECT = path.join(scope, 'Website', 'launch checklist xkTODO xpBEN xd-2026-11-27.md');
const SIZE = { width: 1400, height: 850 };

// --- Small file writers: a real PNG, PDF, and zipped docx/xlsx -------------------------------------------------
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      const sun = (x - w * 0.7) ** 2 + (y - h * 0.3) ** 2 < (h * 0.14) ** 2;
      const hill = y > h * (0.62 + 0.08 * Math.sin(x / 22));
      const c = sun ? [250, 205, 90] : hill ? [64, 128, 96] : [110 + (y * 70) / h, 170 + (y * 50) / h, 225];
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function pdf(lines) {
  const stream = 'BT /F1 18 Tf 72 720 Td 22 TL ' + lines.map((l) => `(${l}) Tj T*`).join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = body.length; body += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

function zip(entries) {
  const parts = []; const central = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, 'utf8'); const comp = zlib.deflateRawSync(data); const nm = Buffer.from(name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc32(data), 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc32(data), 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([c, nm]));
    parts.push(h, nm, comp); offset += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const docx = (title, paras) =>
  zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS_REL}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[title, ...paras].map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
  });
const xlsx = (rows) =>
  zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS_REL}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS_REL}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((r, i) => `<row r="${i + 1}">${r.map((v, j) => { const ref = 'ABCD'[j] + (i + 1); return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`; }).join('')}</row>`)
      .join('')}</sheetData></worksheet>`,
  });

// --- The demo folder: [relative path, content, days since modified] ------------------------------------------------
const CHECKLIST = `# Launch checklist

Everything the new site needs before it goes live on the 27th.

## Content

- Proofread the home page and the pricing page
- Replace the placeholder photos with the final set
- Check every link on the contact page

## Technical

- Point the domain at the new host
- Turn on the redirects from the old addresses
- Test the contact form from two devices

## Announcement

- Draft the short post for the newsletter
- Line up two quotes from early users
`;
const files = [
  ['Website/launch checklist xkTODO xpBEN xd-2026-11-27.md', CHECKLIST, 0],
  ['Website/site launch notes xkWAITING.md', '# Site launch notes\n\nWaiting for the final logo files.\n', 1],
  ['Website/launch plan.pdf', pdf(['Website launch plan', 'Content freeze 20 November', 'Go live 27 November']), 3],
  ['Website/press launch image.png', png(240, 160), 4],
  ['Website/launch announcement draft xkTODO xpALICE.md', '# Launch announcement\n\nFirst draft of the headline and three short paragraphs.\n', 2],
  ['Website/homepage copy xkTODO xpALICE.md', '# Homepage copy\n\nShort paragraphs, one idea each.\n', 2],
  ['Budget/launch budget.xlsx', xlsx([['Item', 'Cost'], ['Hosting', 120], ['Photography', 450], ['Printing', 85]]), 6],
  ['Budget/launch budget review xkTODO xpALICE xd-2026-11-20.md', '# Budget review\n\nCompare the quotes and agree the final figure.\n', 5],
  ['Budget/launch supplier quotes.docx', docx('Supplier quotes', ['Three quotes for photography and printing.', 'Preferred supplier to be agreed.']), 9],
  ['Research/reading list xxINFO.md', '# Reading list\n\n- Evaluation basics\n- Writing for the web\n', 12],
  ['Research/interview themes xkLATER.md', '# Interview themes\n\nTo be written up after the second round.\n', 15],
  ['Research/launch survey summary.docx', docx('Survey summary', ['Responses from 42 members.', 'Main themes: speed, clarity, price.']), 18],
  ['Research/survey data.xlsx', xlsx([['Question', 'Yes', 'No'], ['Would recommend', 31, 11], ['Easy to use', 36, 6]]), 20],
  ['Events/workshop agenda xkTODO xpBEN.md', '# Workshop agenda\n\nWelcome, two short exercises and a discussion.\n', 7],
  ['Events/venue map.png', png(200, 140), 25],
  ['Events/launch event guest list xxKEY.md', '# Guest list\n\nTo be confirmed with the venue.\n', 11],
  ['Admin/meeting notes 2026-11-03.md', '# Meeting notes\n\n- Agreed the launch date\n- Budget review next week\n', 6],
  ['Admin/annual plan.pdf', pdf(['Annual plan', 'Priorities for the year ahead']), 30],
  ['Admin/team contacts.md', '# Team contacts\n\nKept in the shared address book.\n', 40],
  ['README.md', '# Projects\n\nA small folder of demo files.\n', 8],
];

function seed() {
  fs.rmSync(root, { recursive: true, force: true });
  const now = Date.now();
  files.forEach(([rel, content, days], i) => {
    const p = path.join(scope, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    const t = new Date(now - days * 86400000 - i * 600000);
    fs.utimesSync(p, t, t);
  });
}

async function main() {
  seed();
  let drv;
  let ok = false;
  try {
    drv = await connect({ profile: 'tagfox-readme-shot', scope, owners: ['ALICE', 'BEN'] });
    const key = async (k, code, vk) => {
      await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk });
      await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
    };
    await key('Shift', 'ShiftLeft', 16); // a hidden window runs no frames until its first input
    await drv.send('Emulation.setDeviceMetricsOverride', { ...SIZE, deviceScaleFactor: 1, mobile: false });
    await drv.T('configure', { rootFolder: scope });

    // Everything indexes new files within a second or so; wait until it lists the files the query should find.
    const want = files.filter(([rel]) => path.basename(rel).toLowerCase().includes(QUERY)).length;
    let rows = [];
    for (let i = 0; i < 40; i++) {
      await drv.T('setQuery', QUERY);
      await drv.T('runSearchNow');
      await drv.settle('query');
      rows = (await drv.T('runnerState')).rows;
      if (rows.length >= want) break;
      await sleep(500);
    }
    if (rows.length < want) throw new Error(`Everything listed ${rows.length} of ${want} demo files for "${QUERY}"`);

    await drv.T('selectViewerFile', SELECT);
    await sleep(1200);
    await key('Shift', 'ShiftLeft', 16);
    await drv.ev(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    await sleep(800);

    const shot = await drv.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(`Wrote ${out} (${rows.length} rows listed for "${QUERY}")`);
    ok = true;
  } finally {
    if (drv) await drv.close();
    if (!keep) fs.rmSync(root, { recursive: true, force: true });
  }
  if (!ok) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
