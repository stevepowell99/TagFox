// A blank window has to say why, and a crashed page comes back by itself (main.js, watchPageHealth).
// This drives a real test instance and checks, against the test perf log (tagfox-mainperf-test.log):
//   - a page load is logged;
//   - a console error in the page is logged, with its text;
//   - a renderer crash (CDP Page.crash) is logged, and the page is loaded again: the test hook comes back
//     on a fresh connection, since the reload keeps the #tagfoxtest hash.
//
// Run: node test/page-health.cjs

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { connect, sleep } = require('./harness.cjs');

const LOG = path.join(os.tmpdir(), 'tagfox-mainperf-test.log');
const logSince = (offset) => {
  try {
    return fs.readFileSync(LOG, 'utf8').slice(offset);
  } catch (_) {
    return '';
  }
};
const logSize = () => {
  try {
    return fs.statSync(LOG).size;
  } catch (_) {
    return 0;
  }
};
const getJson = (url) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('timeout')));
  });

/** A fresh CDP connection to the page, answering whether the test hook is up. */
async function hookUpOnFreshConnection(port) {
  const list = await getJson(`http://localhost:${port}/json`);
  const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url || ''));
  if (!page) return false;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  try {
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    const answer = await new Promise((res) => {
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        if (m.id === 1) res(m.result && m.result.result && m.result.result.value);
      });
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "typeof window.__tagfoxTest === 'object'", returnByValue: true } }));
      setTimeout(() => res(false), 2000);
    });
    return answer === true;
  } finally {
    ws.close();
  }
}

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };
  const waitFor = async (fn, ms) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
      if (await fn().catch(() => false)) return true;
      await sleep(250);
    }
    return false;
  };
  let drv;
  const start = logSize();
  try {
    drv = await connect({ profile: 'tagfox-test-page-health' });
    console.log('Hook ready.');
    check(await waitFor(async () => /page loaded index\.html/.test(logSince(start)), 5000), 'a page load is logged');

    const marker = 'page-health-probe-' + process.pid;
    await drv.ev(`console.error(${JSON.stringify(marker)}), 1`);
    check(await waitFor(async () => logSince(start).includes('page error ' + marker), 5000), 'a console error in the page is logged with its text');

    const beforeCrash = logSize();
    drv.send('Page.crash').catch(() => {});
    check(await waitFor(async () => /page renderer-gone reason=\S+ exit=\S+, reloading/.test(logSince(beforeCrash)), 10000), 'a renderer crash is logged, with a reload');
    check(await waitFor(() => hookUpOnFreshConnection(drv.port), 30000), 'the page comes back by itself, hook and all');
  } catch (e) {
    failures.push('threw: ' + (e && e.message));
    console.log('  FAIL threw:', e && e.message);
  } finally {
    if (drv) drv.close();
  }
  if (failures.length) {
    console.log(`\npage-health: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\npage-health: all checks passed');
}

main();
