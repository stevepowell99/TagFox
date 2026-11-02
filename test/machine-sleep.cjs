// The laptop's sleep, as a suite meets it. On battery the laptop sleeps after six idle minutes, and a suite
// takes about fourteen; a test TagFox has twice been lost as the machine woke. So run-all.cjs asks Windows to keep
// the machine awake while it runs, and a failed run says whether the machine slept during it, read from the
// System log, where Kernel-Power event 506 is entering Modern Standby and 507 is leaving it.

const { spawnSync } = require('child_process');

const ES_CONTINUOUS = 0x80000000;
const ES_SYSTEM_REQUIRED = 0x1;

/** Keeps the machine out of idle sleep until this process exits, as the pwsh `keepawake` does, and returns a
    line saying what was held. On mains that lasts the whole suite. On battery a Modern Standby machine drops the
    request five minutes after its sleep timeout (PowerSetRequest, Remarks), and a lid close or Start > Sleep
    sleeps it at once whatever is held, so the line says when the machine is on battery. The display is left
    to turn off and lock as usual. */
function keepAwake() {
  try {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const SetThreadExecutionState = kernel32.func('uint32 __stdcall SetThreadExecutionState(uint32 esFlags)');
    const SYSTEM_POWER_STATUS = koffi.struct('SYSTEM_POWER_STATUS', {
      ACLineStatus: 'uint8', BatteryFlag: 'uint8', BatteryLifePercent: 'uint8', SystemStatusFlag: 'uint8',
      BatteryLifeTime: 'uint32', BatteryFullLifeTime: 'uint32',
    });
    const GetSystemPowerStatus = kernel32.func('int __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *status)');
    if (!SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)) return 'Windows refused to keep the machine awake for the suite';
    const power = {};
    const onBattery = GetSystemPowerStatus(power) && power.ACLineStatus === 0;
    return onBattery
      ? 'Keeping the machine awake for the suite, but it is on battery, where Windows drops the request five minutes after the sleep timeout'
      : 'Keeping the machine awake for the suite';
  } catch (e) {
    return `Could not ask Windows to keep the machine awake: ${e.message}`;
  }
}

/** Kernel-Power's standby events matching an XPath time condition, oldest first, as { id, at } with `at` in ms. */
function standbyEvents(timeCondition, extraArgs = []) {
  const timePart = timeCondition ? ` and TimeCreated[${timeCondition}]` : '';
  const query = `*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and (EventID=506 or EventID=507)${timePart}]]`;
  const r = spawnSync('wevtutil', ['qe', 'System', `/q:${query}`, '/f:xml', ...extraArgs], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (r.error || r.status !== 0) throw new Error(`wevtutil: ${r.error ? r.error.message : (r.stderr || '').trim() || 'exit ' + r.status}`);
  return [...r.stdout.matchAll(/<EventID>(\d+)<\/EventID>[\s\S]*?SystemTime='([^']+)'/g)].map((m) => ({ id: Number(m[1]), at: Date.parse(m[2]) }));
}

const utc = (ms) => new Date(ms).toISOString().slice(11, 19);

/** Positive control for sleptDuring: the System log's most recent sleep, so a log that cannot be read, or a
    query that finds nothing, shows before the suite rather than as "did not sleep" after a failure. */
function lastSleepLine() {
  try {
    const [last] = standbyEvents('', ['/c:1', '/rd:true']);
    if (!last) return 'The System log lists no sleep at all, so a failed run cannot be checked for one';
    return `The System log's last sleep event: ${new Date(last.at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  } catch (e) {
    return `The System log could not be read for sleeps (${e.message}), so a failed run cannot be checked for one`;
  }
}

/** Whether the machine slept between t0 and t1 (ms), as one line for a failed run. */
function sleptDuring(t0, t1) {
  let events;
  try {
    events = standbyEvents(`@SystemTime>='${new Date(t0).toISOString()}' and @SystemTime<='${new Date(t1).toISOString()}'`);
  } catch (e) {
    return `whether the machine slept during this run is unknown: ${e.message}`;
  }
  const spans = [];
  let from = null;
  for (const e of events) {
    if (e.id === 506) from = e.at;
    else { spans.push([from ?? t0, e.at]); from = null; }
  }
  if (from != null) spans.push([from, t1]);
  if (!spans.length) return `the machine did not sleep during this run (the System log has no standby event from ${utc(t0)} to ${utc(t1)} UTC)`;
  return 'the machine slept during this run: ' + spans.map(([a, b]) => `${utc(a)}–${utc(b)} UTC (${Math.round((b - a) / 1000)}s)`).join(', ');
}

module.exports = { keepAwake, lastSleepLine, sleptDuring };
