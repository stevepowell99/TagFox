// Task copies are left out of the list, against files made for the test:
//   - a tagged file in an `archive`, `_archive` or `_tmp` folder, or in a linked git worktree (a folder whose
//     .git file points into <repo>\.git\worktrees\), is not listed;
//   - the positive controls: the folder's own tagged file, an untagged file in `archive`, and a tagged file in
//     a folder whose .git file points elsewhere (as a Drive repo's does) are all listed, so the check cannot
//     pass by listing nothing;
//   - the / command "Show task copies" lists all of them and shows its chip; running it again hides them;
//   - inside the archive folder or the worktree itself, their own tasks are listed.
//
// Run: node test/task-copies.cjs

const fs = require('fs');
const path = require('path');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const word = 'qc' + process.pid;
  const root = path.join(APP_DIR, '_tmp', 'task-copies-' + process.pid);
  const at = (...p) => path.join(root, ...p);
  const files = {
    real: at(`${word} real xkTODO.md`),
    notes: at('archive', `${word} notes.txt`),
    own: at('repo', `${word} own xkTODO.md`),
    old: at('archive', `${word} old xkTODO.md`),
    older: at('_archive', `${word} older xkLATER.md`),
    left: at('_tmp', `${word} left xkTODO.md`),
    copied: at('wt', `${word} copied xkTODO.md`),
  };
  for (const f of Object.values(files)) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'x\n');
  }
  fs.writeFileSync(at('wt', '.git'), 'gitdir: C:/nowhere/.git/worktrees/wt\n');
  fs.writeFileSync(at('repo', '.git'), 'gitdir: C:/dev/_gitdirs/repo.git\n');
  const kept = ['real', 'notes', 'own'];
  const copies = ['old', 'older', 'left', 'copied'];

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-task-copies', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    const { T } = drv;
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const listed = async () => {
      await T('setQuery', word);
      await T('runSearchNow');
      await drv.settle('query');
      const rows = (await T('runnerState')).rows.map(norm);
      return Object.fromEntries(Object.entries(files).map(([k, f]) => [k, rows.includes(norm(f))]));
    };
    const missing = (got, keys) => keys.filter((k) => !got[k]);
    const present = (got, keys) => keys.filter((k) => got[k]);

    // Everything has to index the two .git files before the lookup can find the worktree.
    let roots = [];
    for (let i = 0; i < 40 && !roots.includes(norm(at('wt'))); i++) {
      roots = (await T('refreshLinkedWorktrees')) || [];
      if (!roots.includes(norm(at('wt')))) await sleep(250);
    }
    check(roots.includes(norm(at('wt'))), 'the lookup finds the folder whose .git points into .git\\worktrees');
    check(!roots.includes(norm(at('repo'))), 'and not the one whose .git points at a separate git directory');

    let got = {};
    // And the files themselves, before the list can show them.
    for (let i = 0; i < 40 && missing((got = await listed()), kept).length; i++) await sleep(250);
    check(missing(got, kept).length === 0, `the folder's own task, an untagged file in archive and a Drive-style repo's task are listed (missing: ${missing(got, kept).join(', ') || 'none'})`);
    check(present(got, copies).length === 0, `copies in archive, _archive, _tmp and a linked worktree are not (listed: ${present(got, copies).join(', ') || 'none'})`);

    await T('runCommand', 'task-copies');
    await drv.settle('show copies');
    got = await listed();
    check(missing(got, kept.concat(copies)).length === 0, `"Show task copies" lists all seven (missing: ${missing(got, kept.concat(copies)).join(', ') || 'none'})`);
    check((await T('runnerState')).chips.includes('task-copies'), 'and shows its chip');
    await T('runCommand', 'task-copies');
    await drv.settle('hide copies');
    got = await listed();
    check(present(got, copies).length === 0 && missing(got, kept).length === 0, 'running it again hides them again');

    await T('setScope', at('archive'));
    await drv.settle('into archive');
    got = await listed();
    check(got.old && got.notes, "inside the archive folder, its own task is listed");
    await T('setScope', at('wt'));
    await drv.settle('into worktree');
    got = await listed();
    check(got.copied, 'inside the worktree, its own task is listed');
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) await drv.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
  if (failures.length) {
    console.log(`\ntask-copies: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\ntask-copies: all checks passed');
}

main();
