// The Viewer in Runner: what each kind of item shows, and that its labelled actions do what they say.
// This drives the real panel over CDP and checks:
//   - a folder's header carries its name (it used to be squeezed to nothing beside a description), and a line
//     under it gives the folder it is in;
//   - a folder with no folder doc shows "No folder doc here yet" with the name field and Write it, and no bar;
//     Write it opens the editor with the name field moved up into the bar, and Save creates the file on disk
//     (positive control: the file exists with what was typed), after which the bar names the doc and offers Edit;
//   - the Folder doc | Thumbnails tabs switch the body, and the Subfolders switch shows each subfolder's doc;
//   - New TODO opens the Quick TODO box aimed at the folder on screen, and saving puts the file in that folder;
//     the / command "New TODO in this folder" aims it at the current folder;
//   - a markdown file's Edit becomes Done while the editor is open, and an autosave reports Saved beside it;
//   - a kind with no preview names its extension and offers Open and Show in folder;
//   - no mode block carries a heading of its own;
//   - a PDF in the side pane loads with no plugin toolbar and fitted to the width, and expanded at 150%.
//
// Run: node test/viewer-runner.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const root = path.join(APP_DIR, '_tmp', 'viewer-test-' + process.pid);
  const bare = path.join(root, 'bare folder');
  const proj = path.join(root, 'proj folder');
  fs.mkdirSync(path.join(proj, 'sub'), { recursive: true });
  fs.mkdirSync(bare, { recursive: true });
  fs.writeFileSync(path.join(bare, 'inside.txt'), 'x\n');
  fs.writeFileSync(path.join(proj, '-readme.md'), '# Proj\n\nTop doc.\n');
  fs.writeFileSync(path.join(proj, 'sub', 'readme.md'), '# Sub\n\nSub doc.\n');
  const note = path.join(root, 'note.md');
  fs.writeFileSync(note, '# Note\n\nBody.\n');
  const bin = path.join(root, 'blob.qqz');
  fs.writeFileSync(bin, Buffer.alloc(64, 1));
  // A one-page PDF.
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
  const pdfPath = path.join(root, 'page.pdf');
  fs.writeFileSync(pdfPath, pdf);

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-viewer-runner', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const { ev, T } = drv;
    await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await T('configure', { rootFolder: root });
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const waitForRow = async (p, label) => {
      for (let i = 0; i < 20; i++) {
        await T('runSearchNow');
        await drv.settle(label);
        if ((await T('runnerState')).rows.some((r) => norm(r) === norm(p))) return true;
        await sleep(400);
      }
      return false;
    };
    const waitFor = async (fn, ms = 6000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await fn()) return true;
        await sleep(150);
      }
      return false;
    };
    const shown = (id) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; return !e.closest('.d-none') && e.getClientRects().length > 0; })()`);
    const text = (id) => ev(`(document.getElementById(${JSON.stringify(id)})?.textContent || '').trim()`);
    const click = (id) => ev(`(document.getElementById(${JSON.stringify(id)}).click(), 1)`);
    const select = async (p) => { await T('selectViewerFile', p); await sleep(300); };

    check(await waitForRow(bare, 'rows'), 'the fixture folder is listed');
    await waitForRow(proj, 'rows proj');

    // A folder with no doc.
    await select(bare);
    const nameBox = await ev(`(() => { const e = document.getElementById('propDisplayName'); return { t: e.textContent, w: e.getBoundingClientRect().width }; })()`);
    check(nameBox.t === 'bare folder' && nameBox.w > 40, `a folder's name shows in the header (${JSON.stringify(nameBox)})`);
    check(norm(await text('runnerViewerPath')) === norm(root), 'the line under the name gives the folder it is in');
    check(await waitFor(() => shown('readmeEmptyState')), 'no folder doc: the empty state shows');
    check(!(await shown('readmeFolderDocControlsWrap')), 'no folder doc: the bar is hidden');
    check(await ev(`!!document.querySelector('#readmeEmptyNameSlot #readmeFolderDocNameField')`), 'no folder doc: the name field sits in the empty state');
    await click('btnReadmeWrite');
    await sleep(300);
    check(await shown('readmeEditorWrap'), 'Write it opens the editor');
    check(await ev(`!!document.querySelector('#readmeFolderDocNameSlot #readmeFolderDocNameField')`), 'writing: the name field has moved up into the bar');
    check((await text('btnReadmeEdit')) === 'Save' && (await shown('btnReadmeCancel')), 'writing: the bar offers Save and Cancel');
    await ev(`(() => { const cm = document.querySelector('#readmeEditorWrap .CodeMirror'); if (cm && cm.CodeMirror) cm.CodeMirror.setValue('# Bare\\n\\nWritten here.\\n'); else document.getElementById('readmeEditor').value = '# Bare\\n\\nWritten here.\\n'; return 1; })()`);
    await click('btnReadmeEdit');
    const created = path.join(bare, '-readme.md');
    check(await waitFor(() => fs.existsSync(created) && /Written here/.test(fs.readFileSync(created, 'utf8'))), 'Save creates -readme.md with what was typed');
    await select(bare);
    check(await waitFor(async () => (await shown('readmeFolderDocNameLabel')) && !(await shown('readmeEmptyState'))), 'after Save the bar names the doc');
    check((await text('btnReadmeEdit')) === 'Edit', 'and offers Edit');

    // Tabs and the Subfolders switch.
    await select(proj);
    check(await waitFor(() => shown('propsNestedReadmeToggleWrap')), 'a folder shows the Folder doc | Thumbnails tabs');
    await ev(`(document.querySelector('label[for=optViewerDocThumbs]').click(), 1)`);
    check(await waitFor(async () => (await shown('folderThumbsBlock')) && !(await shown('readmeBlock'))), 'Thumbnails swaps the doc for the grid');
    await ev(`(document.querySelector('label[for=optViewerDocKindDoc]').click(), 1)`);
    check(await waitFor(async () => (await shown('readmeBlock')) && !(await shown('folderThumbsBlock'))), 'Folder doc brings the doc back');
    await click('optViewerDocNested');
    check(await waitFor(async () => (await ev(`document.querySelectorAll('#readmePreview .global-readme-section').length`)) === 2), 'Subfolders shows the folder doc and the subfolder doc');
    await click('optViewerDocNested');
    await waitFor(async () => (await ev(`document.querySelectorAll('#readmePreview .global-readme-section').length`)) === 0);

    // New TODO from the folder view goes in that folder, not the Quick TODO folder.
    await click('btnViewerNewTodo');
    check(await waitFor(() => shown('quickTodoPop')), 'New TODO opens the Quick TODO box');
    check((await text('quickTodoPopLabel')) === 'New TODO in proj folder', `the box names the folder (${await text('quickTodoPopLabel')})`);
    await ev(`(document.getElementById('quickTodoTitleInput').value = 'viewer probe', 1)`);
    await click('btnQuickTodoPopSave');
    const todo = path.join(proj, 'viewer probe xkTODO.md');
    check(await waitFor(() => fs.existsSync(todo)), 'saving puts "viewer probe xkTODO.md" in that folder');
    // Main writes the file before its reply reaches the page, so the box can still be open for a moment.
    check(await waitFor(async () => !(await shown('quickTodoPop'))), 'and closes the box');
    await T('runCommand', 'new-todo');
    check(await waitFor(() => shown('quickTodoPop')), '/New TODO in this folder opens the box');
    check((await text('quickTodoPopLabel')) === 'New TODO in ' + path.basename(root), `aimed at the current folder (${await text('quickTodoPopLabel')})`);
    await click('btnQuickTodoPopCancel');

    // A markdown file: Edit, Done, Saved.
    await select(note);
    check((await text('btnMdFileEdit')) === 'Edit' && (await shown('btnMdFileEdit')), 'a markdown file offers Edit');
    check(!(await shown('propsNestedReadmeToggleWrap')), 'a file has no folder tabs');
    await T('mdOpenEditor');
    check((await text('btnMdFileEdit')) === 'Done', 'with the editor open it reads Done');
    await T('mdSetBuffer', '# Note\n\nChanged.\n');
    await T('mdFlush');
    check((await text('propsSaveState')) === 'Saved' && /Changed/.test(fs.readFileSync(note, 'utf8')), 'an autosave reports Saved, and the file has the change');
    await T('mdCloseEditor');
    check(!(await shown('propsSaveState')), 'closing the editor clears Saved');

    // No preview: name the kind, offer Open and Show in folder.
    await select(bin);
    check(await waitFor(() => shown('propPlaceholderActions')), 'a kind with no preview offers Open and Show in folder');
    check(/\.qqz files/.test(await text('propPlaceholder')), `and names its extension ("${await text('propPlaceholder')}")`);
    check(
      (await ev(`['officeTitle', 'textPreviewTitle', 'gdocWorkspaceTitle', 'propsPanelSectionTitle'].filter((id) => document.getElementById(id)).length`)) === 0 &&
        (await ev(`document.querySelectorAll('#propsDetails .fw-semibold.mb-1').length`)) === 0,
      'no mode block carries a heading of its own'
    );

    // PDF fragments.
    await select(pdfPath);
    check(await waitFor(async () => /#toolbar=0&view=FitH$/.test(await ev(`document.getElementById('pdfFrame').src`))), 'a PDF in the side pane loads with no toolbar, fitted to the width');
    await click('btnPropsTheaterToggle');
    check(await waitFor(async () => /#zoom=150&toolbar=0$/.test(await ev(`document.getElementById('pdfFrame').src`))), 'expanded, it loads at 150% with no toolbar');
    await click('btnPropsTheaterToggle');
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  if (failures.length) {
    console.log(`\nviewer-runner: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nviewer-runner: all checks passed');
}

main();
