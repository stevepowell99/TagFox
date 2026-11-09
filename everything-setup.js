'use strict';
/* First-run setup: works out how far Whippet is from a working connection to Voidtools Everything.
   Read only: it looks at running processes, the uninstall registry entries, Program Files and Everything's
   settings files, and never writes, installs or downloads anything.

   Where Everything 1.5 keeps what matters (read on STEVE-DELL, 9 November 2026, and in voidtools' own guide
   forum.voidtools.com/viewtopic.php?t=17663):
   - Install folder: 1.5 beta is `C:\Program Files\Everything` (the folder 1.4 uses too, so 1.4 and 1.5 are told
     apart by the exe's version, never the folder name); the alpha was `C:\Program Files\Everything 1.5a`.
   - Plugins: `<install folder>\Plugins\http_server64.dll` (other builds may be named otherwise, so any
     `http_server*.dll` counts). The beta falls back to `Everything 1.5a\Plugins` when its own folder is missing.
   - Settings of the HTTP server: the user's `%APPDATA%\Everything\Plugins.ini` (the alpha: `Plugins-1.5a.ini`, which
     the beta copies when its own is missing; a portable copy keeps it beside the exe), section `[http_server64.dll]`, keys `enabled`, `port` and
     `bindings`. The `http_server_*` keys of 1.4 are not used by 1.5.
   The beta dropped the `-1.5a` suffix from every settings file name, so `Plugins.ini` is read before
   `Plugins-1.5a.ini`. */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/** Everything's ini files: [section] headers, key=value lines, ; comments. Section and key names are lower-cased. */
function parseIni(text) {
  const out = {};
  let sec = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const m = /^\[(.+)\]$/.exec(line);
    if (m) {
      sec = m[1].trim().toLowerCase();
      if (!out[sec]) out[sec] = {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 1 || !sec) continue;
    out[sec][line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  return out;
}

/** "1.5.0.1409a", "1.4.1.1026" or "1, 5, 0, 1409" into numbers; null when it is not a version. */
function parseVersion(s) {
  const m = /^\s*(\d+)[.,\s]+(\d+)[.,\s]+(\d+)[.,\s]+(\d+)\s*([a-z]*)/i.exec(String(s || ''));
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], build: +m[4], label: m[5].toLowerCase(), text: String(s).trim() };
}

const isFifteenOrLater = (v) => !!v && (v.major > 1 || (v.major === 1 && v.minor >= 5));

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
}

/** The HTTP server plugin's file names for an exe. 1.5 beta loads plugins from `Everything 1.5a\Plugins` beside its
    own folder when its own Plugins folder does not exist (voidtools' upgrade guide), so that one counts then. */
function httpPluginFiles(exePath) {
  const exeDir = path.dirname(exePath);
  const own = path.join(exeDir, 'Plugins');
  const dirs = [own];
  if (!fs.existsSync(own)) dirs.push(path.join(path.dirname(exeDir), 'Everything 1.5a', 'Plugins'));
  const found = [];
  for (const d of dirs) {
    for (const n of safeReaddir(d)) if (/^http_server.*\.dll$/i.test(n)) found.push(path.join(d, n));
  }
  return found;
}

/** The HTTP server's settings. In each folder the unsuffixed `Plugins.ini` (1.5 beta) is read first and then the
    `-1.5a` one, since the beta copies the alpha's file only when its own is missing and uses its own from then on;
    any other `Plugins-*.ini` comes last, newest first. Folders are tried in the order given (the user's settings
    folder, then each exe's folder for a portable copy). The first file with an HTTP server section wins.
    { found: false } when there is none. */
function readHttpSettings(dirs) {
  const rank = (name) => (/^plugins\.ini$/i.test(name) ? 0 : /^plugins-1\.5a\.ini$/i.test(name) ? 1 : 2);
  for (const dir of dirs) {
    const files = [];
    for (const name of safeReaddir(dir)) {
      if (!/^plugins(-[\w.]+)?\.ini$/i.test(name) || /backup/i.test(name)) continue;
      let mtime = 0;
      try {
        mtime = fs.statSync(path.join(dir, name)).mtimeMs;
      } catch (_) {
        continue;
      }
      files.push({ name, mtime });
    }
    files.sort((a, b) => rank(a.name) - rank(b.name) || b.mtime - a.mtime);
    for (const f of files) {
      const file = path.join(dir, f.name);
      let ini;
      try {
        ini = parseIni(fs.readFileSync(file, 'utf8'));
      } catch (_) {
        continue;
      }
      const sec = Object.keys(ini).find((k) => /^http_server.*\.dll$/.test(k));
      if (!sec) continue;
      const port = parseInt(ini[sec].port, 10);
      return {
        found: true,
        file,
        enabled: ini[sec].enabled === '1',
        port: port > 0 && port < 65536 ? port : null,
        bindings: String(ini[sec].bindings || '').split(/[\s;,]+/).filter(Boolean),
      };
    }
  }
  return { found: false };
}

/** Which step the user is on, from what was found. Pure, so it can be tried against any combination.
    facts: { exes: [{ path, version, plugins: [paths] }], running: [{ path }] (Everything processes in a user
    session; a path may be unreadable), http: readHttpSettings() }.
    The ladder, each state being the first step that is not yet done:
    not-installed, only-14, not-running, no-plugin, http-off, http-on (main then probes the port). */
function decideState(facts) {
  const exes = (facts.exes || []).map((e) => ({ ...e, v: parseVersion(e.version) }));
  const lc = (p) => String(p || '').toLowerCase();
  const runningPaths = new Set((facts.running || []).map((r) => lc(r.path)).filter(Boolean));
  const unknownRunning = (facts.running || []).some((r) => !r.path);
  const base = { exes: exes.map((e) => ({ path: e.path, version: e.version })), running: (facts.running || []).length };
  if (!exes.length) return { ...base, state: 'not-installed' };
  const v15 = exes.filter((e) => isFifteenOrLater(e.v));
  if (!v15.length) return { ...base, state: 'only-14' };
  v15.sort((a, b) => b.v.build - a.v.build);
  // Two instances (1.5a and 1.5b) can run at once and only one holds the HTTP port: describe the newest running one.
  const chosen = v15.find((e) => runningPaths.has(lc(e.path))) || v15[0];
  const isRunning = runningPaths.has(lc(chosen.path)) || unknownRunning;
  const common = { ...base, exe: chosen.path, version: chosen.version };
  if (!isRunning) return { ...common, state: 'not-running', startExe: chosen.path };
  if (!(chosen.plugins || []).length) return { ...common, state: 'no-plugin' };
  const http = facts.http || { found: false };
  if (!http.found || !http.enabled) return { ...common, state: 'http-off' };
  return { ...common, state: 'http-on', httpPort: http.port, bindings: http.bindings || [] };
}

/** Facts from a source: { settingsDir, listInstalls(): { running, exes } }. */
async function gatherFacts(source) {
  const { running, exes } = await source.listInstalls();
  // A portable copy keeps its settings beside the exe, so every exe's folder is looked in as well.
  const dirs = [source.settingsDir, ...exes.map((e) => path.dirname(e.path))].filter(Boolean);
  // The plugin belongs to a program, so each 1.5 program carries its own list.
  const withPlugins = exes.map((e) => ({ ...e, plugins: isFifteenOrLater(parseVersion(e.version)) ? httpPluginFiles(e.path) : [] }));
  return { exes: withPlugins, running, http: readHttpSettings(dirs) };
}

/* The real source: one PowerShell call lists the running Everything processes (user sessions only, since the
   Everything service runs in session 0 and serves no HTTP), the uninstall registry entries and Program Files,
   and reads each exe's version. Running first, then the registry, then the folders, as a running copy is the
   one that counts. */
const LIST_INSTALLS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$cand = New-Object System.Collections.Generic.List[string]
$running = @()
foreach ($p in Get-Process -Name Everything) {
  if ($p.SessionId -gt 0) {
    $running += [pscustomobject]@{ path = [string]$p.Path }
    if ($p.Path) { $cand.Add($p.Path) }
  }
}
$keys = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
foreach ($k in Get-ItemProperty $keys) {
  if ($k.DisplayName -match '^Everything(\\s|$)') {
    if ($k.InstallLocation) { $cand.Add((Join-Path $k.InstallLocation 'Everything.exe')) }
    if ($k.DisplayIcon) { $cand.Add(($k.DisplayIcon -replace ',\\d+$','' -replace '"','')) }
  }
}
foreach ($root in @($env:ProgramFiles, \${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
  if ($root) { foreach ($d in Get-ChildItem -LiteralPath $root -Directory -Filter 'Everything*') { $cand.Add((Join-Path $d.FullName 'Everything.exe')) } }
}
$seen = @{}
$exes = @()
foreach ($c in $cand) {
  if (-not $c -or ((Split-Path $c -Leaf) -ne 'Everything.exe') -or -not (Test-Path -LiteralPath $c)) { continue }
  $key = $c.ToLower()
  if ($seen[$key]) { continue }
  $seen[$key] = 1
  $exes += [pscustomobject]@{ path = $c; version = (Get-Item -LiteralPath $c).VersionInfo.FileVersion }
}
[Console]::Out.Write((ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ running = @($running); exes = @($exes) })))
`.trim();

const asArray = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

function systemSource() {
  return {
    settingsDir: path.join(process.env.APPDATA || '', 'Everything'),
    listInstalls: () =>
      new Promise((resolve, reject) => {
        const encoded = Buffer.from(LIST_INSTALLS_SCRIPT, 'utf16le').toString('base64');
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
          { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 1 << 20 },
          (err, stdout) => {
            if (err) return reject(err);
            try {
              const j = JSON.parse(String(stdout).trim() || '{}');
              resolve({ running: asArray(j.running), exes: asArray(j.exes) });
            } catch (e) {
              reject(e);
            }
          }
        );
      }),
  };
}

/** A test instance only: a JSON file, re-read at every detection, names a fake machine so each state can be
    reached without uninstalling anything. { settingsDir, running: [{ path }], exes: [{ path, version }] }.
    The exe folders and settings files are real files made by the test; only the process list and the
    versions, which need a real program, are stated. */
function testSource(file) {
  return {
    get settingsDir() {
      return JSON.parse(fs.readFileSync(file, 'utf8')).settingsDir || '';
    },
    listInstalls: async () => {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { running: asArray(j.running), exes: asArray(j.exes) };
    },
  };
}

/** One detection: the state, and what is needed to explain it. */
async function detect(source) {
  const facts = await gatherFacts(source);
  return decideState(facts);
}

module.exports = { parseIni, parseVersion, httpPluginFiles, readHttpSettings, decideState, detect, systemSource, testSource };
