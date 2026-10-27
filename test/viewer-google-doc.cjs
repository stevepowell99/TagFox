// The Viewer's preview of Google shortcuts and of Word 97-2003 files. Main fetches a shortcut's PDF from
// Google with the Workspace window's sign-in; a test cannot sign in, so TAGFOX_TEST_GOOGLE_DOCS_ORIGIN points
// main at a local server standing in for docs.google.com. Checks:
//   - a .gdoc with access shows Google's PDF in the PDF pane, with Edit and a refresh that fetches again, and
//     the request carried the export path and the shortcut's own account (authuser);
//   - a .gslides goes to the Slides export path;
//   - a .gdoc Google sends no PDF for (its sign-in page) keeps the shortcut block, says TagFox is probably not
//     signed in, and still offers Open in TagFox; the PDF pane stays hidden;
//   - a .doc shows its paragraphs as text, escaped, whether it is Word 97-2003 binary or Word 2003 XML; a .docx
//     under a .doc name gets the .docx preview; anything else named .doc says it could not be read.
//
// Run: node test/viewer-google-doc.cjs

const fs = require('fs');
const http = require('http');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

function onePagePdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'viewer-gdoc-test-' + process.pid);
  fs.mkdirSync(root, { recursive: true });
  const goodDoc = path.join(root, 'shared notes.gdoc');
  fs.writeFileSync(goodDoc, JSON.stringify({ '': 'WARNING!', doc_id: 'goodDocId1234567890', email: 'someone@example.com', resource_key: '' }));
  const deck = path.join(root, 'talk.gslides');
  fs.writeFileSync(deck, JSON.stringify({ doc_id: 'deckId1234567890' }));
  const signedOut = path.join(root, 'private.gdoc');
  fs.writeFileSync(signedOut, JSON.stringify({ doc_id: 'signedOutDoc1234567890' }));
  const word97 = path.join(root, 'old letter.doc');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'word97.doc'), word97);
  const wordMl = path.join(root, 'word 2003 xml.doc');
  fs.writeFileSync(
    wordMl,
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<?mso-application progid="Word.Document"?>\n' +
      '<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"><w:body>' +
      '<w:p><w:r><w:t>WordML first paragraph &amp; more</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Second </w:t></w:r><w:r><w:t>line</w:t></w:r></w:p>' +
      '</w:body></w:wordDocument>\n'
  );
  const docxNamedDoc = path.join(root, 'really a docx.doc');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'docx under a doc name.doc'), docxNamedDoc);
  const notDoc = path.join(root, 'actually text.doc');
  fs.writeFileSync(notDoc, 'plain text wearing a .doc name\n');

  const requests = [];
  const pdf = onePagePdf();
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (/^\/(document\/d\/goodDocId1234567890\/export\?format=pdf|presentation\/d\/deckId1234567890\/export\/pdf)/.test(req.url)) {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(pdf);
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>Sign in - Google Accounts</title>');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.TAGFOX_TEST_GOOGLE_DOCS_ORIGIN = 'http://127.0.0.1:' + server.address().port;

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-viewer-google-doc', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const { ev, T } = drv;
    const waitFor = async (fn, ms = 8000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await fn()) return true;
        await sleep(150);
      }
      return false;
    };
    const shown = (id) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; return !e.closest('.d-none') && e.getClientRects().length > 0; })()`);
    const text = (id) => ev(`(document.getElementById(${JSON.stringify(id)})?.textContent || '').trim()`);
    const pdfSrc = () => ev(`document.getElementById('pdfFrame').src || ''`);
    const select = async (p) => { await T('selectViewerFile', p); await sleep(300); };

    // A shortcut Google answers with a PDF.
    await select(goodDoc);
    check(await waitFor(async () => (await shown('pdfBlock')) && /^blob:/.test(await pdfSrc())), `a .gdoc shows Google's PDF (${await pdfSrc()})`);
    check(!(await shown('gdocWorkspaceBlock')), 'the shortcut block gives way to the PDF');
    check(await shown('btnGdocEdit'), 'Edit shows in the header');
    check((await shown('btnPdfRefresh')) && /Google/.test(await ev(`document.getElementById('btnPdfRefresh').title`)), 'the refresh button fetches again from Google');
    const docReq = requests.find((u) => u.includes('goodDocId1234567890')) || '';
    check(/^\/document\/d\/goodDocId1234567890\/export\?format=pdf&authuser=someone%40example\.com$/.test(docReq), `the export asked for the shortcut's own account (${docReq})`);
    check(await ev(`document.getElementById('btnOpenGoogleWorkspace').dataset.url === 'https://docs.google.com/document/d/goodDocId1234567890/edit'`), 'Edit opens the editor URL the shortcut points at');

    // Slides.
    const before = await pdfSrc();
    await select(deck);
    check(await waitFor(async () => (await shown('pdfBlock')) && /^blob:/.test(await pdfSrc()) && (await pdfSrc()) !== before), 'a .gslides shows its PDF');
    check(requests.some((u) => u.startsWith('/presentation/d/deckId1234567890/export/pdf')), 'a deck uses the Slides export path');

    // A shortcut Google sends its sign-in page for.
    await select(signedOut);
    check(await waitFor(async () => /not signed in/.test(await text('gdocWorkspaceUrl'))), `no PDF: the block says TagFox is probably not signed in ("${await text('gdocWorkspaceUrl')}")`);
    check(await shown('btnOpenGoogleWorkspace'), 'no PDF: Open in TagFox is still offered');
    check(!(await shown('pdfBlock')) && !(await shown('btnGdocEdit')), 'no PDF: the PDF pane and Edit stay hidden');

    // Word 97-2003.
    await select(word97);
    check(await waitFor(() => shown('officeBlock')), 'a .doc shows in the document pane');
    const paras = await ev(`Array.from(document.querySelectorAll('#officePreview p')).map((p) => p.textContent)`);
    check(paras.includes('The first paragraph of a Word 97 document.') && paras.includes('A second paragraph, with <angle> & ampersand.'), `its paragraphs are there as text (${JSON.stringify(paras)})`);
    check(await ev(`!document.querySelector('#officePreview angle')`), 'markup in the text is escaped, not parsed');

    const parasOf = async (p, want) => {
      await select(p);
      let got = [];
      await waitFor(async () => {
        got = await ev(`Array.from(document.querySelectorAll('#officePreview p')).map((p) => p.textContent)`);
        return want.every((w) => got.includes(w));
      });
      return got;
    };
    const ml = await parasOf(wordMl, ['WordML first paragraph & more', 'Second line']);
    check(ml.includes('WordML first paragraph & more') && ml.includes('Second line'), `a Word 2003 XML .doc shows its paragraphs (${JSON.stringify(ml)})`);
    const dx = await parasOf(docxNamedDoc, ['The first paragraph of a Word 97 document.']);
    check(dx.includes('The first paragraph of a Word 97 document.'), `a .docx under a .doc name goes to the .docx preview (${JSON.stringify(dx)})`);

    await select(notDoc);
    check(await waitFor(async () => /Could not read this \.doc/.test(await text('propPlaceholder'))), `a file that is not a real .doc says so ("${await text('propPlaceholder')}")`);
    check(!(await shown('officeBlock')) && (await shown('propPlaceholderActions')), 'and offers Open instead of an empty pane');
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) await drv.close();
    server.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  if (failures.length) {
    console.log(`\nviewer-google-doc: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nviewer-google-doc: all checks passed');
}

main();
