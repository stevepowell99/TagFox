// The first-run setup card (renderer.js "Setup card", everything-setup.js, the everything-setup-* handlers in main.js).
// Nothing is uninstalled and the real Everything is never touched. A fake machine is a JSON file the test rewrites
// (TAGFOX_TEST_EVERYTHING_SOURCE, honoured only in a test instance) naming fake Everything programs and their running
// state; the folders, plugin files and settings files it points at are real files made here, and the HTTP side is
// real too: Whippet's address points at a dead port, or at small local servers that answer the way Everything does.
//
// Each state is checked for the step it shows, and the negatives have positive controls: connected shows no card,
// and the same server that answers with the card gone is what answers while the card shows its 1.4 step.
//
// Run: node test/everything-setup.cjs   (TAGFOX_SETUP_SHOTS=<folder> also saves a screenshot of two states there)

const fs = require('fs');
const http = require('http');
const path = require('path');
const { connect, APP_DIR, sleep, freePort } = require('./harness.cjs');

const PAGE = 'https://www.voidtools.com/everything-1.5/';
const PLUGINS = 'https://www.voidtools.com/support/everything/plugins/';

/** A server that answers like Everything's HTTP server: JSON with the total, or a refused sign-in. */
function fakeEverything(port, mode) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (mode === 'auth') {
        res.writeHead(401, { 'Server': 'Everything HTTP Server', 'Content-Type': 'text/plain', 'WWW-Authenticate': 'Basic realm="Everything"' });
        res.end('Unauthorized');
        return;
      }
      res.writeHead(200, { 'Server': 'Everything HTTP Server', 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ totalResults: mode === 'zero' ? 0 : 7, results: [] }));
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

async function main() {
  const failures = [];
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures.push(label);
  };

  const root = path.join(APP_DIR, '_tmp', 'everything-setup-' + process.pid);
  fs.rmSync(root, { recursive: true, force: true });
  const mk = (rel, text) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text == null ? '' : text);
    return p;
  };

  const okPort = await freePort();
  const zeroPort = await freePort();
  const authPort = await freePort();
  const deadPort = await freePort(); // nothing listens here
  const dead2Port = await freePort();
  const servers = [await fakeEverything(okPort, 'ok'), await fakeEverything(zeroPort, 'zero'), await fakeEverything(authPort, 'auth')];
  const url = (port) => `http://127.0.0.1:${port}`;

  // Fake programs: one folder each, as an install would be laid out.
  const exe15 = mk('pf/Everything 15b/Everything.exe');
  const exe15NoPlugin = mk('pf/Everything 15b-noplugin/Everything.exe');
  mk('pf/Everything 15b/Plugins/http_server64.dll');
  const exe14 = mk('pf/Everything 14/Everything.exe');
  // Everything's per-user settings, as the beta writes them (Plugins.ini), with the HTTP server on a given port.
  const settings = (name, enabled, port, file = 'Plugins.ini') =>
    mk(`appdata/${name}/${file}`, `; Please make sure Everything is not running before modifying this file.\n\n[http_server64.dll]\nenabled=${enabled}\nport=${port}\nusername=\npassword=\nbindings=\n`);
  const offDir = path.dirname(settings('off', 0, okPort));
  const onOkDir = path.dirname(settings('on-ok', 1, okPort));
  const onDeadDir = path.dirname(settings('on-dead', 1, dead2Port));
  const onWhippetDir = path.dirname(settings('on-whippet', 1, deadPort));

  // The pure half, against the layouts voidtools' upgrade guide describes: the beta's Plugins.ini is read before
  // the alpha's Plugins-1.5a.ini (even when the alpha's is newer), the beta uses the 1.5a plugin folder only when
  // its own Plugins folder is missing, and the newest running instance is the one described.
  {
    const S = require('../everything-setup.js');
    const both = path.dirname(settings('both', 1, 1111));
    settings('both', 0, 2222, 'Plugins-1.5a.ini');
    fs.utimesSync(path.join(both, 'Plugins.ini'), new Date(2020, 0, 1), new Date(2020, 0, 1));
    let h = S.readHttpSettings([both]);
    check(h.found && h.port === 1111 && h.enabled && path.basename(h.file) === 'Plugins.ini', `Plugins.ini is read before Plugins-1.5a.ini, though the alpha's file is newer (${h.port}, ${path.basename(h.file || '')})`);
    const alphaOnly = path.dirname(settings('alpha-only', 1, 3333, 'Plugins-1.5a.ini'));
    h = S.readHttpSettings([alphaOnly]);
    check(h.found && h.port === 3333, `with only Plugins-1.5a.ini, that is read (positive control: ${h.port})`);
    check(!S.readHttpSettings([path.join(root, 'nowhere')]).found, 'no settings folder: nothing found');
    mk('pf2/Everything 1.5a/Plugins/http_server64.dll');
    mk('pf2/Everything 1.5a/Everything.exe');
    const beta = mk('pf2/Everything/Everything.exe');
    check(S.httpPluginFiles(beta).length === 1, 'a beta with no Plugins folder of its own uses the 1.5a plugin folder');
    mk('pf2/Everything/Plugins/readme.txt');
    check(S.httpPluginFiles(beta).length === 0, 'a beta with a Plugins folder of its own does not (positive control for the line above)');
    const alpha = path.join(root, 'pf2/Everything 1.5a/Everything.exe');
    const state = (running) => S.decideState({
      exes: [{ path: alpha, version: '1.5.0.1409a', plugins: S.httpPluginFiles(alpha) }, { path: beta, version: '1.5.0.1424b', plugins: [] }],
      running: running.map((p) => ({ path: p })),
      http: { found: true, enabled: true, port: 80, bindings: [] },
    });
    check(state([alpha]).exe === alpha && state([alpha]).state === 'http-on', 'the alpha running with its plugin: that instance is described');
    check(state([]).exe === beta && state([]).state === 'not-running', 'neither running: the newest is the one to start');
    check(state([alpha, beta]).exe === beta && state([alpha, beta]).state === 'no-plugin', 'both running: the beta is described');
  }

  const sourceFile = mk('source.json', '{}');
  const machine = (m) => fs.writeFileSync(sourceFile, JSON.stringify(m));
  const v15 = { path: exe15, version: '1.5.0.1424b' };
  const none = { settingsDir: offDir, running: [], exes: [] };
  machine(none);
  process.env.TAGFOX_TEST_EVERYTHING_SOURCE = sourceFile;

  const waitFor = async (fn, ms = 15000, step = 150) => {
    const t0 = Date.now();
    let v;
    while (Date.now() - t0 < ms) {
      v = await fn();
      if (v) return v;
      await sleep(step);
    }
    return v;
  };

  let drv;
  try {
    drv = await connect({ profile: 'tagfox-test-everything-setup' });
    console.log('Hook ready.');
    const card = () => drv.T('setupCard');
    const bannerShown = () => drv.ev(`!document.getElementById('everythingHttpHelpAlert').classList.contains('d-none')`);
    const showing = (state) => waitFor(async () => { const c = await card(); return c.visible && c.state === state ? c : null; });
    const gone = () => waitFor(async () => { const c = await card(); return !c.visible && !c.active ? c : null; }, 8000);
    const toState = async (m, whippetUrl, state) => {
      await drv.T('setupStop');
      machine(m);
      await drv.T('configure', { baseUrl: whippetUrl });
      await sleep(1100); // detection is refused twice within a second
      await drv.T('setupStart', 'failed');
      return showing(state);
    };

    // Connected: Whippet's address is the real Everything. The page's first search runs at its default address,
    // before the harness has pointed it at Everything, and on a loaded machine that failure brings the card up for a
    // moment; it must go by itself once the address answers, and then nothing is asked of the machine.
    let c = await waitFor(async () => { const k = await card(); return !k.visible && !k.active ? k : null; }, 15000);
    check(!!c && !c.timerOn, `connected to the real Everything: no card and no timer (${JSON.stringify(c || (await card()))})`);
    await drv.T('runSearchNow');
    await drv.settle('connected');
    c = await card();
    await sleep(3500);
    const c2 = await card();
    check(c2.probes === c.probes && c2.detects === c.detects && !c2.visible && !c2.active, `connected: no probe and no detection over 3.5s (${c2.probes - c.probes} probes, ${c2.detects - c.detects} detections)`);

    // A failed search starts the card by itself. The address is a port nothing listens on.
    await drv.T('configure', { baseUrl: url(deadPort) });
    await drv.T('runSearchNow');
    c = await showing('not-installed');
    check(!!c, 'a search that cannot reach Everything brings up the card (positive control for every negative below)');
    check(c && c.title === 'Whippet needs Everything' && /keeps an index of every file name/.test(c.body) && /1\.5/.test(c.body), `not installed: says what Everything is (${c && c.title})`);
    check(c && c.primary && c.primary.text === 'Get Everything 1.5' && c.primary.url === PAGE, `not installed: the button goes to the Everything 1.5 page (${c && c.primary && c.primary.url})`);
    check(c && c.tableHidden, 'the card takes the list\'s place (the table is hidden)');
    check(c && c.primary && c.primary.inView, 'the primary button is on screen without scrolling');
    check(c && c.steps.length === 5 && c.steps[0].cls === 'is-current' && c.steps.slice(1).every((s) => s.cls === ''), `the steps row marks the first as current and the rest to come (${c && c.steps.map((s) => s.cls || '-').join(',')})`);
    check(!(await bannerShown()), 'the old banner stays down while the card is up');

    // It advances by itself: the program appears, and no tick is forced. Cost while it waits: probes about every
    // 2 seconds, detection no more than once in 6.
    const before = await card();
    machine({ settingsDir: offDir, running: [], exes: [v15] });
    const t0 = Date.now();
    c = await showing('not-running');
    const after = await card();
    check(!!c && Date.now() - t0 < 14000, `installed but not running: the card moves on by itself (${Date.now() - t0}ms)`);
    check(after.probes - before.probes >= 2, `the connection probe kept running while the card showed (${after.probes - before.probes} probes)`);
    check(after.detects - before.detects <= 2, `the heavier detection ran at most once in 6 seconds (${after.detects - before.detects} detections in ${Date.now() - t0}ms)`);
    check(c && c.steps[0].cls === 'is-done' && c.steps[1].cls === 'is-current', 'the first step reads done, the second current');
    check(c && c.primary && c.primary.text === 'Start Everything' && c.primary.start, 'not running: the button starts Everything');
    await drv.ev(`document.getElementById('everythingSetupPrimary').click(); 1`);
    const started = await waitFor(async () => { const s = await drv.ev(`window.tagBrowser.everythingSetupTestStarts()`); return s.length ? s : null; }, 5000);
    check(started && started.length === 1 && started[0] === exe15, `Start Everything launches the program detection found, and only that (${JSON.stringify(started)})`);

    // Only Everything 1.4.
    c = await toState({ settingsDir: offDir, running: [{ path: exe14 }], exes: [{ path: exe14, version: '1.4.1.1026' }] }, url(deadPort), 'only-14');
    check(c && c.title === 'Whippet needs Everything 1.5' && /1\.4\.1\.1026/.test(c.body) && /sort-mix:/.test(c.body) && /beta/.test(c.body), 'only 1.4: says why 1.5 is needed, naming sort-mix: and the beta');
    check(c && c.primary && c.primary.url === PAGE, 'only 1.4: the button goes to the Everything 1.5 page');

    // 1.5 running without the HTTP Server plugin.
    c = await toState({ settingsDir: offDir, running: [{ path: exe15NoPlugin }], exes: [{ path: exe15NoPlugin, version: '1.5.0.1424b' }] }, url(deadPort), 'no-plugin');
    check(c && c.primary && c.primary.url === PLUGINS && /HTTP Server plugin/.test(c.title), `no plugin: the button goes to the plugins page (${c && c.primary && c.primary.url})`);
    check(c && c.steps[2].cls === 'is-current' && c.steps[0].cls === 'is-done' && c.steps[1].cls === 'is-done', 'no plugin: the third step is current, the two before it done');

    // Plugin present, HTTP server off in the settings file.
    c = await toState({ settingsDir: offDir, running: [{ path: exe15 }], exes: [v15] }, url(deadPort), 'http-off');
    check(c && c.title === 'Turn on the HTTP server' && /Tools, Options, HTTP Server/.test(c.body) && /Leave the address and port as they are/.test(c.body), 'server off: the steps in Everything, with the address and port left alone');
    check(c && c.primary === null, 'server off: nothing to press but Check again');
    // Positive control for the settings read: the same machine with the server switched on is no longer http-off.
    c = await toState({ settingsDir: onDeadDir, running: [{ path: exe15 }], exes: [v15] }, url(deadPort), 'waiting');
    check(c && /port ${dead2Port}/.test(c.body.replace(/\s+/g, ' ')) || (c && c.body.includes(String(dead2Port))), `server on at a port nothing answers: waits, and names the port (${c && c.body.slice(0, 80)})`);
    check(c && (await card()).baseUrl === url(deadPort), 'a port that does not answer is not written into Whippet\'s address');

    // The same port as Whippet's own, still dead: waiting, address untouched.
    c = await toState({ settingsDir: onWhippetDir, running: [{ path: exe15 }], exes: [v15] }, url(deadPort), 'waiting');
    check(!!c, 'server on at Whippet\'s own port, not answering yet: waiting');

    // Server on at another port, and Everything answers there: the address is set and the card goes.
    await drv.T('setupStop');
    machine({ settingsDir: onOkDir, running: [{ path: exe15 }], exes: [v15] });
    await drv.T('configure', { baseUrl: url(deadPort) });
    await sleep(1100);
    await drv.T('setupStart', 'failed');
    const moved = await waitFor(async () => { const k = await card(); return k.baseUrl === url(okPort) ? k : null; });
    check(!!moved, `the address moves to Everything's port by itself (${moved && moved.baseUrl})`);
    c = await gone();
    check(!!c && !c.timerOn, 'once Everything answers there, the card goes and the checks stop');
    const said = await drv.ev(`document.getElementById('statusMain').textContent`);
    check(/port \d+/.test(said) && said.includes(url(okPort)), `a line says what changed (${said.slice(0, 110)})`);
    const saved = await drv.ev(`localStorage.getItem('tagBrowserBaseUrl')`);
    check(saved === url(okPort), `the new address is saved in Whippet's settings (${saved})`);

    // Connected means nothing runs at all.
    const p1 = (await card()).probes;
    await sleep(3500);
    const p2 = await card();
    check(p2.probes === p1 && !p2.timerOn && !p2.active, `nothing probes while connected (${p2.probes - p1} probes in 3.5s)`);

    // A server that refuses the sign-in is the banner's business, not setup's. Positive control: a dead port shows the card and not the banner.
    await drv.T('setupStop');
    await drv.T('configure', { baseUrl: url(authPort) });
    await drv.T('runSearchNow');
    await waitFor(bannerShown, 8000);
    c = await card();
    check((await bannerShown()) && !c.visible, `a refused sign-in keeps the banner and shows no card (banner ${await bannerShown()}, card ${c.visible}, status ${await drv.ev(`document.getElementById('statusMain').textContent`)})`);

    // Everything 1.4 answering. The server finds nothing for sort-mix:, as 1.4 does; the installed program decides.
    await drv.T('setupStop');
    machine({ settingsDir: offDir, running: [{ path: exe14 }], exes: [{ path: exe14, version: '1.4.1.1026' }] });
    await drv.T('configure', { baseUrl: url(zeroPort) });
    await drv.T('setupStart', 'empty');
    c = await showing('only-14');
    check(!!c, 'a server that answers but finds nothing for sort-mix:, with only 1.4 installed: the 1.4 card (positive control)');
    await drv.T('setupStop');
    machine({ settingsDir: onOkDir, running: [{ path: exe15 }], exes: [v15] });
    await drv.T('setupStart', 'empty');
    c = await gone();
    check(!!c, 'the same server with 1.5 installed and running (an index not built yet): no card');

    if (process.env.TAGFOX_SETUP_SHOTS) {
      fs.mkdirSync(process.env.TAGFOX_SETUP_SHOTS, { recursive: true });
      const shot = async (name) => {
        const r = await drv.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.TAGFOX_SETUP_SHOTS, name), Buffer.from(r.data, 'base64'));
        console.log('  saved ' + path.join(process.env.TAGFOX_SETUP_SHOTS, name));
      };
      for (const [m, state, name] of [
        [{ settingsDir: offDir, running: [{ path: exe15 }], exes: [v15] }, 'http-off', 'setup-card-http-off.png'],
        [{ settingsDir: offDir, running: [], exes: [] }, 'not-installed', 'setup-card-not-installed.png'],
      ]) {
        const k = await toState(m, url(deadPort), state);
        check(!!k, `screenshot state ${state} is showing`);
        await sleep(300);
        await shot(name);
      }
    }
  } catch (e) {
    check(false, 'test threw: ' + (e && e.stack || e));
  } finally {
    if (drv) await drv.close();
    for (const s of servers) s.close();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(failures.length ? `\neverything-setup: ${failures.length} FAILED` : '\neverything-setup: all checks passed');
  process.exit(failures.length ? 1 : 0);
}

main();
