// The order of terms in Runner's Everything queries, which is most of what a query costs: Everything checks an
// item's terms left to right and stops at the first that fails. A tag filter sends the tag as plain text ahead of
// its regex, the starred-paths query puts its `filelist:` first, and the Temp query puts the Temp folder first.
// Each query is also sent to Everything by the test itself, so a reordering that broke a query cannot pass: the
// tag filter must keep the tagged file and drop "todo list.txt", the starred-paths query must return the starred
// file, and the Temp query the file made in Temp (the positive controls). The main query goes to Everything first,
// so a new list paints its rows before the extra queries are in: the Temp file joins them afterwards, and the merged
// list selects its own top row.
//
// Run: node test/runner-query-order.cjs

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { connect, APP_DIR, sleep } = require('./harness.cjs');

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const stem = 'qorder' + process.pid;
  const root = path.join(APP_DIR, '_tmp', 'runner-query-order-' + process.pid);
  fs.mkdirSync(root, { recursive: true });
  const tagged = path.join(root, stem + ' alpha xkTODO.md');
  const plain = path.join(root, stem + ' beta.txt');
  const wordOnly = path.join(root, stem + ' todo list.txt');
  for (const f of [tagged, plain, wordOnly]) fs.writeFileSync(f, 'x\n');
  const tempIsAppData = /[\\/]appdata[\\/]local[\\/]temp$/i.test(os.tmpdir());
  const tempFile = path.join(os.tmpdir(), stem + ' temp.txt');
  if (tempIsAppData) fs.writeFileSync(tempFile, 'x\n');
  const norm = (p) => String(p || '').toLowerCase().replace(/[\\/]+$/, '');
  const has = (rows, p) => rows.some((r) => norm(r) === norm(p));

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-runner-query-order', scope: root });
    console.log('Hook ready.');
    await drv.settle('startup');
    /* The query as Everything answers it for Runner (Match path on), so each sent text can be checked for rows. */
    const everything = (search) =>
      new Promise((resolve, reject) => {
        const u = new URL(drv.baseUrl.endsWith('/') ? drv.baseUrl : drv.baseUrl + '/');
        for (const [k, v] of Object.entries({ search, json: '1', path_column: '1', p: '1', count: '200' })) u.searchParams.set(k, v);
        http
          .get(u, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
              try {
                resolve(JSON.parse(d).results.map((r) => (r.path ? r.path + '\\' + r.name : r.name)));
              } catch (e) {
                reject(e);
              }
            });
          })
          .on('error', reject);
      });
    const R = () => drv.T('runnerState');
    const search = async (label) => {
      await drv.T('runSearchNow', 'identity');
      await drv.settle(label);
      return R();
    };
    const waitForRow = async (p, label) => {
      for (let i = 0; i < 20; i++) {
        if (has((await search(label)).rows, p)) return true;
        await sleep(400);
      }
      return false;
    };

    await drv.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await drv.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await drv.T('setRunnerMode', true);
    await drv.settle('runner on');
    await drv.T('configure', { rootFolder: root });
    await drv.T('setQuery', stem);
    check(await waitForRow(tagged, 'indexed') && (await waitForRow(wordOnly, 'indexed 2')), 'Everything lists the test files');

    // A tag filter: the tag as plain text, then its regex.
    await drv.T('runCommand', 'tag-todo');
    await drv.settle('tag on');
    let s = await R();
    check(has(s.rows, tagged), 'the TODO filter keeps the tagged file (positive control)');
    check(!has(s.rows, wordOnly) && !has(s.rows, plain), 'and drops "todo list.txt" and the untagged file');
    const tagAt = s.sent.indexOf('noww:noregex:xkTODO regex:');
    check(tagAt >= 0, `the regex follows the tag as plain text (sent: ${s.sent})`);
    const tagRows = await everything(s.sent);
    check(has(tagRows, tagged) && !has(tagRows, wordOnly), 'that query, sent to Everything, finds the tagged file and not "todo list.txt"');
    await drv.T('runCommand', 'tag-todo');
    await drv.settle('tag off');

    // Starred paths: one filelist:, first. Searched everywhere, where Runner fetches them.
    await drv.T('toggleStar', plain);
    await drv.T('configure', { rootFolder: '' });
    await drv.T('setQuery', stem);
    s = await search('starred');
    const pinQuery = (s.sentExtra || []).find((t) => /filelist:/.test(t)) || '';
    check(pinQuery.startsWith('filelist:"') && norm(pinQuery).includes(norm(plain)), `the starred-paths query starts with its filelist: (${pinQuery.slice(0, 120)})`);
    check(pinQuery && has(await everything(pinQuery), plain), 'that query, sent to Everything, finds the starred file');
    check(has(s.rows, plain), 'and Runner lists it');
    await drv.T('toggleStar', plain);

    // Temp: the folder first.
    if (tempIsAppData) {
      const tempDir = os.tmpdir().replace(/[\\/]+$/, '');
      check(await waitForRow(tempFile, 'temp'), 'Runner lists the file made in Temp');
      s = await R();
      const tempQuery = (s.sentExtra || []).find((t) => norm(t).includes(norm(tempDir) + '\\"')) || '';
      check(tempQuery.toLowerCase().startsWith('"' + tempDir.toLowerCase() + '\\"'), `the Temp query starts with the Temp folder (${tempQuery.slice(0, 120)})`);
      check(tempQuery && has(await everything(tempQuery), tempFile), 'that query, sent to Everything, finds the file made in Temp');

      // The main query is sent first, so a new list paints its rows while the extra queries finish: the Temp
      // file, which only the Temp query finds, joins them afterwards, and the merged list selects its own top row.
      await drv.T('setQuery', '');
      await search('cleared');
      await drv.ev(`(() => {
        const T = window.__tagfoxTest;
        window.__snaps = [];
        window.__snapTick = () => {
          window.__snaps.push({ inFlight: !!T.state().searchInFlight, rows: T.runnerState().rows });
          if (window.__snaps.length < 600) setTimeout(window.__snapTick, 3);
        };
        return 1;
      })()`);
      await drv.T('setQuery', stem);
      await drv.ev('window.__snapTick(), 1');
      s = await search('early paint');
      const snaps = await drv.ev('window.__snaps');
      /* The new list's own rows (every one holds the word), not the list the search is replacing. */
      const early = snaps.find(
        (x) => x.inFlight && x.rows.every((r) => norm(r).includes(stem)) && has(x.rows, plain) && !has(x.rows, tempFile)
      );
      check(!!early, `the main rows are on screen before the Temp file arrives (${snaps.length} snapshots)`);
      check(has(s.rows, plain) && has(s.rows, tempFile), 'and the merged list holds both (positive control)');
      check(norm(s.selected) === norm(s.rows[0]), `the merged list selects its own top row (${path.basename(s.selected)})`);
    } else {
      console.log('  SKIP Temp query: the temp folder here is not AppData\\Local\\Temp (' + os.tmpdir() + ')');
    }
  } catch (e) {
    failures.push('threw: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    if (drv) drv.close();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch (_) {}
    try {
      if (tempIsAppData) fs.rmSync(tempFile, { force: true });
    } catch (_) {}
  }
  finished = true;
  if (failures.length) {
    console.log(`\nrunner-query-order: ${failures.length} failure(s)`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nrunner-query-order: all checks passed');
}

/* A CDP call whose answer never comes leaves nothing pending, and Node then exits with code 0 mid-test,
   which run-all would count as a pass. */
let finished = false;
process.on('beforeExit', () => {
  if (finished) return;
  console.log('\nrunner-query-order: stopped part way, a page call never returned');
  process.exit(1);
});

main();
