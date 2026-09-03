// startLocalGmist must never spawn a second gmist on top of one that is already listening.
//
// The bug this guards (31 August 2026, and a first go at it on 18 August): the click path decided
// "is gmist up" with an HTTP probe on a 600ms timeout, and the dev server answers HEAD /go anywhere
// between 1.3s and 11.3s on this machine, because it re-evaluates the worker entry per request. So
// a healthy gmist read as down, TagFox ran `npm run dev:local` on top of it, and dev:local died on
// the sidecar port that same gmist was holding. What reached the status bar was
// "dev:local exited straight away (code 1)", which reads as the feature being broken.
//
// The fix is an ordering: read the LISTENING ports before making any HTTP request, because they are
// instant and stable where the probe is a slow judgement about a slow server. This test asserts the
// ordering rather than the timings, by holding port 5173 with a socket that accepts connections and
// never answers, which is the worst case for a probe and the easy case for a port check.
//
// Run: node test/gmist-start-guard.cjs

const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { connect, SCOPES } = require('./harness.cjs');

const DEV_PORT = 5173;
const SIDECAR_PORT = 5199;

/** A listener that accepts and then says nothing, so any HTTP probe against it can only time out. */
function holdPort(port, host) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer((sock) => sock.on('error', () => {}));
    srv.on('error', reject);
    srv.listen(port, host, () => resolve(srv));
  });
}

async function portIsFree(port) {
  for (const host of ['127.0.0.1', '::1']) {
    try {
      const srv = await holdPort(port, host);
      await new Promise((r) => srv.close(r));
    } catch (e) {
      if (e && e.code === 'EADDRINUSE') return false;
    }
  }
  return true;
}

async function main() {
  const failures = [];

  /* Steve's own gmist runs on these ports, so refuse to run rather than report a false pass (or
     worse, a false failure) against a real dev server the suite does not control. */
  for (const port of [DEV_PORT, SIDECAR_PORT]) {
    if (!(await portIsFree(port))) {
      console.log(`SKIP: port ${port} is already in use (a real gmist is running). Stop it and re-run.`);
      process.exit(0);
    }
  }

  let drv;
  const held = [];
  try {
    drv = await connect({ port: 9319, profile: 'tagfox-test-gmist-guard', scope: SCOPES.repo });
    console.log('Hook ready.');
    await drv.settle('startup');

    /* Case 1: something holds the dev port and never answers. A probe cannot tell this from a slow
       gmist, which is the whole point: the answer must come from the port, and it must come fast. */
    held.push(await holdPort(DEV_PORT, '127.0.0.1'));
    const t0 = Date.now();
    const r1 = await drv.ev(`window.tagBrowser.startLocalGmist()`);
    const ms1 = Date.now() - t0;
    if (!r1 || r1.up !== true || r1.alreadyRunning !== true) {
      failures.push(`dev port held: expected {up:true, alreadyRunning:true}, got ${JSON.stringify(r1)}`);
    } else {
      console.log(`  PASS dev port held -> reported already running (${ms1}ms)`);
    }
    /* Fast is part of the contract, not a nicety: the old path spent seconds timing out before
       getting the answer wrong, and a click has to feel like a click. */
    if (ms1 > 3000) failures.push(`dev port held: took ${ms1}ms, expected well under 3s (no HTTP probe should run)`);
    for (const s of held.splice(0)) await new Promise((r) => s.close(r));

    /* Case 2: the dev port is free but the localfs sidecar from an earlier run is not. dev:local
       refuses on exactly this, so TagFox must say so instead of spawning and reading a log tail. */
    held.push(await holdPort(SIDECAR_PORT, '127.0.0.1'));
    const t1 = Date.now();
    const r2 = await drv.ev(`window.tagBrowser.startLocalGmist()`);
    const ms2 = Date.now() - t1;
    if (!r2 || r2.up !== false || r2.portHeld !== true) {
      failures.push(`sidecar port held: expected {up:false, portHeld:true}, got ${JSON.stringify(r2)}`);
    } else if (!/5199/.test(String(r2.error || '')) || !/taskkill/i.test(String(r2.error || ''))) {
      failures.push(`sidecar port held: the error must name port 5199 and how to stop it, got: ${r2.error}`);
    } else {
      console.log(`  PASS sidecar port held -> named the holder, did not spawn (${ms2}ms)`);
    }
    /* Wider than case 1 on purpose: this path now answers a second question (who owns the sidecar)
       on top of the netstat it already ran, and netstat alone measured 2.2s on a loaded machine. It
       is still bounded, because an error the user is waiting on must arrive rather than hang. */
    if (ms2 > 8000) failures.push(`sidecar port held: took ${ms2}ms, expected under 8s (no spawn, no HTTP probe)`);
    for (const s of held.splice(0)) await new Promise((r) => s.close(r));

    /* Case 3: the same two ports, the opposite situation. dev:local brings the sidecar up first and
       vite several seconds later, so a click in that window sees exactly what case 2 sees and used to
       be told to kill the gmist it was about to use (Steve, 3 September 2026, against a gmist that had
       been up since 08:34). The two are told apart by who owns the sidecar, so the fake runner below
       is a process whose command line looks like dev:local with the port holder as its child. */
    const runnerPath = path.join(os.tmpdir(), 'tagfox-test-dev-local-runner.mjs');
    fs.writeFileSync(runnerPath, [
      "import { createServer } from 'net';",
      "const srv = createServer((s) => s.on('error', () => {}));",
      `srv.listen(${SIDECAR_PORT}, '127.0.0.1');`,
      'process.on("SIGTERM", () => process.exit(0));',
      'setInterval(() => {}, 1000);',
    ].join(String.fromCharCode(10)));
    let runner = null;
    try {
      runner = spawn(process.execPath, [runnerPath], { stdio: 'ignore' });
      /* Wait for the fake sidecar to actually be listening, or the case tests nothing. */
      for (let i = 0; i < 40 && (await portIsFree(SIDECAR_PORT)); i++) await new Promise((r) => setTimeout(r, 100));
      if (await portIsFree(SIDECAR_PORT)) throw new Error('the fake sidecar never took port ' + SIDECAR_PORT);

      const call = drv.ev(`window.tagBrowser.startLocalGmist()`);
      /* Let it sit in the wait, then bring the dev port up the way a real vite finally would. */
      await new Promise((r) => setTimeout(r, 2000));
      held.push(await holdPort(DEV_PORT, '127.0.0.1'));
      const r3 = await call;
      if (!r3 || r3.up !== true || r3.alreadyRunning !== true) {
        failures.push(`sidecar held by a live dev:local: expected {up:true, alreadyRunning:true}, got ${JSON.stringify(r3)}`);
      } else if (/taskkill/i.test(String(r3.error || ''))) {
        failures.push(`sidecar held by a live dev:local: must not tell Steve to kill a gmist that is starting: ${r3.error}`);
      } else {
        console.log('  PASS sidecar held by a live dev:local -> waited for the dev port instead of reporting an orphan');
      }
    } finally {
      if (runner) { try { runner.kill(); } catch (_) {} }
      try { fs.unlinkSync(runnerPath); } catch (_) {}
      for (const s of held.splice(0)) await new Promise((r) => s.close(r));
    }
  } catch (e) {
    failures.push(`threw: ${(e && e.stack) || e}`);
  } finally {
    for (const s of held) { try { s.close(); } catch (_) {} }
    if (drv) await drv.close();
  }

  if (failures.length) {
    console.log(`\nFAIL (${failures.length}):`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nAll gmist start-guard checks passed.');
}

main();
