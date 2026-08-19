// MANUAL, not part of npm test: this opens a real browser tab.
//
// Proves the whole open-a-link path end to end: TagFox hands a URL to the shell, the shell picks the
// browser, and the query arrives intact. It guards two faults measured on 19 August 2026. Resolving
// the browser ourselves from `UrlAssociations\https\UserChoice` sent every link to Edge on a machine
// whose shell opens Chrome, so gmist answered {"error":"sign in required"}; and a `cmd /c start`
// fallback truncated the URL at the first &, which would drop `&p=` from every gmist link.
//
// Run: node test/manual-browser-open.cjs
// Passes when the tab lands in Chrome (or whatever the shell's default is) with the full query.

const http = require('http');
const { connect, SCOPES, sleep } = require('./harness.cjs');

let onHit;
const hit = new Promise((r) => (onHit = r));

const srv = http.createServer((req, res) => {
  const ua = String(req.headers['user-agent'] || '');
  res.end('<h3>TagFox browser probe: close this tab.</h3>');
  onHit({ path: req.url, browser: /Edg\//.test(ua) ? 'EDGE' : /Chrome\//.test(ua) ? 'CHROME' : 'OTHER' });
  setTimeout(() => {
    try {
      srv.close();
    } catch (_) {}
  }, 300);
});

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const sent = '/probe?file=abc&p=Causal%20Map/x.md';
  const url = `http://127.0.0.1:${port}${sent}`;
  const drv = await connect({ port: 9323, profile: 'tagfox-test-browser', scope: SCOPES.repo });
  await drv.settle('startup');
  await sleep(200);
  const r = await drv.ev(`window.tagBrowser.openUrlDefaultBrowser(${JSON.stringify({ url })})`);
  console.log('channel returned:', JSON.stringify(r));
  const got = await Promise.race([hit, sleep(15000).then(() => null)]);
  console.log('sent path :', sent);
  console.log('got  path :', got ? got.path : '(nothing arrived)');
  console.log('browser   :', got ? got.browser : '(n/a)');
  const ok = Boolean(got) && got.path === sent;
  console.log(ok ? 'PASS: the link arrived whole, in ' + got.browser : 'FAIL: see above');
  drv.close();
  process.exit(ok ? 0 : 1);
});
