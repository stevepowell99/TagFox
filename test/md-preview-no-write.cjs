// Previewing a markdown file must never write it back.
//
// Selecting a `.md` or `.txt` file in the Viewer loads its text into the same buffer the editor uses.
// That buffer's write used to be armed by the load rather than by the editor, and flushed on blur, on
// the next selection and on the panel refresh. So TagFox saved a buffer nobody had typed into, over
// whatever had written the file since: an agent, another editor, a checkout. The file reverted to the
// state it had when it was last looked at, seconds or hours later, with nothing on screen to say so.
//
// Three rules guard it, and this asserts all three plus the positive control, which is the half that
// matters: a fix that stops every write would pass the first three and make the editor useless.
//
//   1. The write is armed by the editor being open, never by the preview.
//   2. Opening the editor re-reads the file, so typing never starts from a stale buffer.
//   3. A write whose file has moved on disk since the buffer was loaded is refused, not applied.
//
// Run: node test/md-preview-no-write.cjs

const fs = require('fs');
const path = require('path');
const { connect, SCOPES, sleep } = require('./harness.cjs');

const TMP = path.join(SCOPES.repo, '_tmp');
const PROBE = path.join(TMP, 'md-autosave-probe.md');

const A = '# alpha\n\nthe text the preview loaded\n';
const B = '# beta\n\nwritten by somebody else while the file sat in the preview\n';
const C = '# gamma\n\ntyped into the editor\n';
const D = '# delta\n\nwritten by somebody else while the editor was open\n';
const E = '# epsilon\n\ntyped over a buffer that is now stale\n';
const F = '# zeta\n\ntyped and saved by closing the editor\n';

const onDisk = () => fs.readFileSync(PROBE, 'utf8');

function cleanup() {
  try { fs.unlinkSync(PROBE); } catch (_) {}
}

async function main() {
  const failures = [];
  const check = (label, ok, detail) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label + (detail ? ' — ' + detail : ''));
  };

  let drv;
  try {
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(PROBE, A);

    drv = await connect({ port: 9361, profile: 'tagfox-test-md-preview', scope: SCOPES.repo });
    const { T } = drv;
    console.log('Hook ready.');
    await drv.settle('startup');

    // Preview the file. This is the whole of what a user does before the bug fires.
    await T('selectViewerFile', PROBE);
    let s = await T('mdState');
    check('previewing the file binds it to the Viewer', s.target && s.target.toLowerCase() === PROBE.toLowerCase(), 'target=' + s.target);
    check('and loads its text into the buffer', s.buffer === A, JSON.stringify(s.buffer));
    check('and leaves the editor closed', s.editorOpen === false, 'editorOpen=' + s.editorOpen);

    // 1. Somebody else writes the file, then the Viewer blurs. The old code saved A back over B.
    fs.writeFileSync(PROBE, B);
    await T('mdFlush');
    await sleep(150);
    check('a preview-only flush leaves the other writer alone', onDisk() === B, 'disk=' + JSON.stringify(onDisk()));

    // 2. Opening the editor re-reads, so the user types over what is really there.
    await T('mdOpenEditor');
    await sleep(150);
    s = await T('mdState');
    check('opening the editor re-reads the file', s.buffer === B, JSON.stringify(s.buffer));
    check('and the editor is open', s.editorOpen === true, 'editorOpen=' + s.editorOpen);

    // Positive control: a real edit must still save, or the fix has simply broken saving.
    await T('mdSetBuffer', C);
    await T('mdFlush');
    await sleep(150);
    check('an edit made in the open editor is saved', onDisk() === C, 'disk=' + JSON.stringify(onDisk()));

    // 3. The file moves under an open editor. The write is refused and says so.
    fs.writeFileSync(PROBE, D);
    await T('mdSetBuffer', E);
    await T('mdFlush');
    await sleep(150);
    s = await T('mdState');
    check('a write over a file that has moved on disk is refused', onDisk() === D, 'disk=' + JSON.stringify(onDisk()));
    check('and the refusal is reported', /changed on disk/i.test(s.status), 'status=' + JSON.stringify(s.status));

    // Closing the editor is the other save route, so prove it still writes after all that.
    await T('mdCloseEditor');
    await sleep(150);
    await T('selectViewerFile', PROBE);
    await T('mdOpenEditor');
    await sleep(150);
    await T('mdSetBuffer', F);
    await T('mdCloseEditor');
    await sleep(200);
    check('closing the editor saves the edit', onDisk() === F, 'disk=' + JSON.stringify(onDisk()));
  } catch (e) {
    failures.push('ERROR: ' + (e && e.stack ? e.stack : e));
  } finally {
    if (drv) drv.close();
    cleanup();
  }

  console.log('\n========== MARKDOWN PREVIEW WRITE RESULT ==========');
  if (failures.length) {
    console.log(failures.length + ' FAILURE(S):');
    for (const f of failures) console.log(' - ' + f);
    process.exit(1);
  }
  console.log('PASS: the preview never writes, the editor still does, and a stale write is refused');
}

main();
