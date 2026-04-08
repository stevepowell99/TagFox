// TagBrowser — Electron main: window + IPC to Everything HTTP + open/rename files
const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  dialog,
  shell,
  Menu,
  clipboard,
  nativeImage,
  globalShortcut,
  screen,
} = require('electron');
const { spawn, spawnSync, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const fs = require('fs').promises;
const fssync = require('fs');
const os = require('os');
const path = require('path');

// Populates globalThis.TagBrowserTags (same bracket-tag rules as the renderer).
require(path.join(__dirname, 'tags.js'));
const TagBrowserTags = globalThis.TagBrowserTags;

/** Open Drive web UI search — best-effort; matches names as stored on disk (pretty = tags stripped). */
function googleDriveSearchUrlForPath(fullPath) {
  const base = path.basename(String(fullPath || ''));
  if (!base) return null;
  const pretty =
    TagBrowserTags && typeof TagBrowserTags.parseSegmentTags === 'function'
      ? TagBrowserTags.parseSegmentTags(base).pretty
      : base;
  const q = String(pretty || base).trim();
  if (!q) return null;
  return `https://drive.google.com/drive/search?q=${encodeURIComponent(q)}`;
}

/** Parent folder ID in Google Drive for desktop: `...\ .shortcut-targets-by-id \<id>\ ...` */
function driveFolderUrlFromShortcutTargetsPath(fullPath) {
  const s = String(fullPath || '').replace(/\//g, '\\');
  const m = /\\\.shortcut-targets-by-id\\([^\\/]+)/i.exec(s);
  const id = m && String(m[1] || '').trim();
  if (!id) return null;
  return { driveFolderId: id, driveFolderUrl: `https://drive.google.com/drive/folders/${id}` };
}

/** Normalize Everything HTTP JSON (shape varies slightly by version) into an array of row objects. */
function rowsFromEverythingJson(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && typeof data === 'object') {
    const vals = Object.values(data);
    const looksLikeRow = (v) =>
      v && typeof v === 'object' && ('name' in v || 'path' in v);
    if (vals.length && vals.every(looksLikeRow)) return vals;
  }
  return [];
}

/** PowerShell.exe path (Windows). */
function windowsPowerShellExe() {
  return process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
}

/**
 * Write ps1Body to a temp script, run `-File script arg`, delete script.
 * Returns null on success, or an error string.
 */
function runPowershellScriptFileWithArg(ps1Body, argForScript, failMsgPrefix) {
  const psExe = windowsPowerShellExe();
  const tmpPs1 = path.join(os.tmpdir(), `tagbrowser-ps-${process.pid}-${Date.now()}.ps1`);
  try {
    fssync.writeFileSync(tmpPs1, ps1Body, 'utf8');
    const r = spawnSync(psExe, ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmpPs1, argForScript], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      const msg = [r.stderr, r.stdout].filter(Boolean).join(' ').trim();
      // #region agent log
      const __psf = (globalThis.__tagfoxDbgPsFail = (globalThis.__tagfoxDbgPsFail || 0) + 1);
      if (__psf <= 20) {
        fetch('http://127.0.0.1:7460/ingest/0dfbb0a0-7bdd-458e-8476-39dae77fc97d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0677d7' },
          body: JSON.stringify({
            sessionId: '0677d7',
            location: 'main.js:runPowershellScriptFileWithArg',
            message: 'PowerShell script non-zero',
            data: {
              hypothesisId: 'H2',
              status: r.status,
              msgSnippet: String(msg).slice(0, 220),
              argSnippet: String(argForScript || '').slice(0, 180),
            },
            timestamp: Date.now(),
            runId: 'pre',
          }),
        }).catch(() => {});
      }
      // #endregion
      return msg || failMsgPrefix + ' (exit ' + r.status + ').';
    }
  } catch (e) {
    return String(e.message || e);
  } finally {
    try {
      fssync.unlinkSync(tmpPs1);
    } catch (_) {}
  }
  return null;
}

/** WinForms SetFileDropList — JSON array of absolute paths (UTF-8 file passed as arg). */
const PS1_SET_CLIP_MULTI = `param([Parameter(Mandatory)][string]$JsonPath)
try {
  $raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
  $paths = $raw | ConvertFrom-Json
  if ($paths -isnot [System.Array]) { $paths = @($paths) }
  if (-not $paths -or $paths.Count -lt 1) { throw 'No paths in JSON' }
  Add-Type -AssemblyName System.Windows.Forms
  $sc = New-Object System.Collections.Specialized.StringCollection
  foreach ($p in $paths) { [void]$sc.Add([string]$p) }
  if ($sc.Count -lt 1) { throw 'No paths after parse' }
  [System.Windows.Forms.Clipboard]::SetFileDropList($sc)
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;

/**
 * Explorer paste (CF_HDROP via .NET). Pass one path or many.
 * Returns null on success, or an error string.
 */
function copyPathsForExplorerPaste(pathsIn) {
  if (process.platform !== 'win32') return 'Only available on Windows.';
  const list = (Array.isArray(pathsIn) ? pathsIn : [pathsIn])
    .map((p) => path.normalize(String(p || '').trim()))
    .filter(Boolean);
  if (!list.length) return 'No path.';
  const tmpJson = path.join(os.tmpdir(), `tagbrowser-hdrop-${process.pid}-${Date.now()}.json`);
  try {
    fssync.writeFileSync(tmpJson, JSON.stringify(list), 'utf8');
    const err = runPowershellScriptFileWithArg(PS1_SET_CLIP_MULTI, tmpJson, 'Explorer paste: PowerShell failed');
    if (err) return err;
  } catch (e) {
    return String(e.message || e);
  } finally {
    try {
      fssync.unlinkSync(tmpJson);
    } catch (_) {}
  }
  return null;
}

/**
 * Create a .lnk beside the target, Explorer-style: "name - Shortcut.lnk", "name - Shortcut (2).lnk", …
 */
function createExplorerShortcutLnkWin(targetPathRaw) {
  if (process.platform !== 'win32') return { ok: false, error: 'Only available on Windows.' };
  const targetPath = path.normalize(String(targetPathRaw || '').trim());
  if (!targetPath) return { ok: false, error: 'No path.' };
  let isDir = false;
  try {
    const st = fssync.statSync(targetPath);
    isDir = st.isDirectory();
  } catch {
    return { ok: false, error: 'Path not found.' };
  }
  const parent = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const stem = `${baseName} - Shortcut`;
  let lnkPath = path.join(parent, `${stem}.lnk`);
  for (let n = 2; fssync.existsSync(lnkPath); n++) {
    lnkPath = path.join(parent, `${stem} (${n}).lnk`);
  }
  const workingDir = isDir ? targetPath : parent;
  const psExe = windowsPowerShellExe();
  const r = spawnSync(
    psExe,
    [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '$ErrorActionPreference="Stop"; $ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut($env:TAGFOX_LNK); $s.TargetPath=$env:TAGFOX_TARGET; $s.WorkingDirectory=$env:TAGFOX_CWD; $s.Save()',
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, TAGFOX_LNK: lnkPath, TAGFOX_TARGET: targetPath, TAGFOX_CWD: workingDir },
    }
  );
  if (r.status !== 0) {
    const msg = [r.stderr, r.stdout].filter(Boolean).join(' ').trim();
    return { ok: false, error: msg || 'Create shortcut failed.' };
  }
  return { ok: true, lnkPath };
}

/** Windows Explorer “Properties” dialog (shell verb). */
function openShellPropertiesWin(targetPathRaw) {
  if (process.platform !== 'win32') return 'Only available on Windows.';
  const targetPath = path.normalize(String(targetPathRaw || '').trim());
  if (!targetPath) return 'No path.';
  const psExe = windowsPowerShellExe();
  const r = spawnSync(
    psExe,
    [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '$ErrorActionPreference="Stop"; Start-Process -LiteralPath $env:TAGFOX_PROP -Verb properties',
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, TAGFOX_PROP: targetPath },
    }
  );
  if (r.status !== 0) {
    const msg = [r.stderr, r.stdout].filter(Boolean).join(' ').trim();
    return msg || 'Properties failed.';
  }
  return null;
}

/**
 * Read TargetPath from a Windows .lnk (WScript.Shell). isDirectory when target exists and is a folder.
 */
function resolveShellShortcutLnkWin(lnkPathRaw) {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows only.' };
  const lnk = path.normalize(String(lnkPathRaw || '').trim());
  if (!lnk) return { ok: false, error: 'No path.' };
  if (path.extname(lnk).toLowerCase() !== '.lnk') return { ok: false, error: 'Not a .lnk file.' };
  const psExe = windowsPowerShellExe();
  const cmd = [
    '$ErrorActionPreference="Stop"',
    '$sh=New-Object -ComObject WScript.Shell',
    '$s=$sh.CreateShortcut([string]$env:TAGFOX_LNK)',
    '$t=[string]$s.TargetPath',
    'if([string]::IsNullOrWhiteSpace($t)){exit 2}',
    '$t=$t.Trim()',
    '$dir=$false',
    'if(Test-Path -LiteralPath $t -PathType Container){$dir=$true}',
    '(@{targetPath=$t;isDirectory=[bool]$dir}|ConvertTo-Json -Compress)',
  ].join(';');
  const r = spawnSync(psExe, ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
    windowsHide: true,
    encoding: 'utf8',
    env: { ...process.env, TAGFOX_LNK: lnk },
  });
  if (r.status === 2) return { ok: false, error: 'Shortcut has no target.' };
  if (r.status !== 0) {
    const msg = [r.stderr, r.stdout].filter(Boolean).join(' ').trim();
    return { ok: false, error: msg || 'Could not read shortcut.' };
  }
  let j;
  try {
    j = JSON.parse(String(r.stdout || '').trim());
  } catch {
    return { ok: false, error: 'Invalid shortcut output.' };
  }
  const targetPath = path.normalize(String(j.targetPath || ''));
  if (!targetPath) return { ok: false, error: 'Empty target.' };
  return { ok: true, targetPath, isDirectory: !!j.isDirectory };
}

/** Same as copy but marks clipboard as cut (Explorer paste moves). CF_HDROP + Preferred DropEffect = Move. */
const PS1_SET_CLIP_CUT = `param([Parameter(Mandatory)][string]$JsonPath)
try {
  $raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
  $paths = $raw | ConvertFrom-Json
  if ($paths -isnot [System.Array]) { $paths = @($paths) }
  if (-not $paths -or $paths.Count -lt 1) { throw 'No paths in JSON' }
  Add-Type -AssemblyName System.Windows.Forms
  $sc = New-Object System.Collections.Specialized.StringCollection
  foreach ($p in $paths) { [void]$sc.Add([string]$p) }
  $data = New-Object System.Windows.Forms.DataObject
  $data.SetFileDropList($sc)
  $move = [int][System.Windows.Forms.DragDropEffects]::Move
  $ms = [System.IO.MemoryStream]::new([BitConverter]::GetBytes($move))
  $data.SetData('Preferred DropEffect', $false, $ms)
  [System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;

/**
 * Same-folder rename only — JSON: { "from": "full\\\\path\\\\old", "newLeaf": "newName" }.
 * Clears read-only, tries Rename-Item, then .NET File/Directory Move (helps .gdoc shortcuts + cloud placeholders).
 */
const PS1_RENAME_SAME_DIR = `param([Parameter(Mandatory)][string]$JsonPath)
try {
  $raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
  $j = $raw | ConvertFrom-Json
  $from = [string]$j.from
  $newLeaf = [string]$j.newLeaf
  if (-not $from -or $newLeaf -eq $null -or $newLeaf -eq '') { throw 'Missing from or newLeaf' }
  if (-not (Test-Path -LiteralPath $from)) { throw 'Source path not found' }
  $parent = Split-Path -LiteralPath $from -Parent
  $to = Join-Path $parent $newLeaf
  $item = Get-Item -LiteralPath $from -Force
  if ($item.Attributes -band [System.IO.FileAttributes]::ReadOnly) {
    $item.Attributes = $item.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
  }
  try {
    Rename-Item -LiteralPath $from -NewName $newLeaf -ErrorAction Stop
  } catch {
    if ($item.PSIsContainer) {
      [System.IO.Directory]::Move($from, $to)
    } else {
      [System.IO.File]::Move($from, $to)
    }
  }
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;

/** Node fs.rename often EPERM on virtualized cloud folders; PowerShell uses the same shell stack as Explorer. */
function renameSameDirViaPowershell(fromRaw, toRaw) {
  if (process.platform !== 'win32') return 'Not Windows.';
  const from = path.resolve(normalizeRenameOperand(String(fromRaw || '')));
  const to = path.resolve(normalizeRenameOperand(String(toRaw || '')));
  if (!from || !to) return 'Missing path.';
  if (path.dirname(from).toLowerCase() !== path.dirname(to).toLowerCase()) return 'Paths must share the same parent folder.';
  const newLeaf = path.basename(to);
  const tmpJson = path.join(os.tmpdir(), `tagbrowser-rename-${process.pid}-${Date.now()}.json`);
  try {
    fssync.writeFileSync(tmpJson, JSON.stringify({ from, newLeaf }), 'utf8');
    return runPowershellScriptFileWithArg(PS1_RENAME_SAME_DIR, tmpJson, 'Rename');
  } catch (e) {
    return String(e.message || e);
  } finally {
    try {
      fssync.unlinkSync(tmpJson);
    } catch (_) {}
  }
}

/** Same-folder rename via cmd `ren` in the parent directory (occasionally succeeds when PowerShell / Node do not). */
function renameSameDirViaCmdRen(fromRaw, toRaw) {
  if (process.platform !== 'win32') return 'Not Windows.';
  const from = path.resolve(normalizeRenameOperand(String(fromRaw || '')));
  const to = path.resolve(normalizeRenameOperand(String(toRaw || '')));
  if (!from || !to) return 'Missing path.';
  if (path.dirname(from).toLowerCase() !== path.dirname(to).toLowerCase()) return 'Paths must share the same parent folder.';
  const dir = path.dirname(from);
  const oldLeaf = path.basename(from);
  const newLeaf = path.basename(to);
  try {
    const comSpec = getCmdExe();
    const r = spawnSync(comSpec, ['/d', '/c', 'ren', oldLeaf, newLeaf], {
      cwd: dir,
      windowsHide: true,
      encoding: 'utf8',
    });
    if (r.status === 0) return null;
    const tail = [r.stderr, r.stdout].filter(Boolean).join(' ').trim();
    // #region agent log
    if (/syntax is incorrect|filename, directory name/i.test(tail)) {
      const __rn = (globalThis.__tagfoxDbgRenFail = (globalThis.__tagfoxDbgRenFail || 0) + 1);
      if (__rn <= 15) {
        fetch('http://127.0.0.1:7460/ingest/0dfbb0a0-7bdd-458e-8476-39dae77fc97d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0677d7' },
          body: JSON.stringify({
            sessionId: '0677d7',
            location: 'main.js:renameSameDirViaCmdRen',
            message: 'cmd ren stderr',
            data: {
              hypothesisId: 'H4',
              n: __rn,
              tail: String(tail).slice(0, 220),
              dir: String(dir).slice(0, 180),
              oldLeaf,
              newLeaf,
            },
            timestamp: Date.now(),
            runId: 'pre',
          }),
        }).catch(() => {});
      }
    }
    // #endregion
    return tail || 'cmd ren failed (exit ' + r.status + ').';
  } catch (e) {
    return String(e.message || e);
  }
}

function cutPathsForExplorerPaste(pathsIn) {
  if (process.platform !== 'win32') return 'Only available on Windows.';
  const list = (Array.isArray(pathsIn) ? pathsIn : [pathsIn])
    .map((p) => path.normalize(String(p || '').trim()))
    .filter(Boolean);
  if (!list.length) return 'No path.';
  const tmpJson = path.join(os.tmpdir(), `tagbrowser-cut-${process.pid}-${Date.now()}.json`);
  try {
    fssync.writeFileSync(tmpJson, JSON.stringify(list), 'utf8');
    const err = runPowershellScriptFileWithArg(PS1_SET_CLIP_CUT, tmpJson, 'Explorer cut: PowerShell failed');
    if (err) return err;
  } catch (e) {
    return String(e.message || e);
  } finally {
    try {
      fssync.unlinkSync(tmpJson);
    } catch (_) {}
  }
  return null;
}

/** Read CF_HDROP-style file list from clipboard (WinForms); writes UTF-8 JSON array to OutJson. */
const PS1_GET_CLIP_FILES = `param([Parameter(Mandatory)][string]$OutJson)
try {
  Add-Type -AssemblyName System.Windows.Forms
  $list = [System.Windows.Forms.Clipboard]::GetFileDropList()
  if ($null -eq $list -or $list.Count -lt 1) {
    [System.IO.File]::WriteAllText($OutJson, '[]')
    exit 0
  }
  $paths = New-Object System.Collections.ArrayList
  foreach ($item in $list) { [void]$paths.Add([string]$item) }
  $json = ($paths.ToArray() | ConvertTo-Json -Compress)
  [System.IO.File]::WriteAllText($OutJson, $json)
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;

/** Paths from Explorer clipboard (Windows only); empty if none. */
function readClipboardFilePathsWin() {
  const tmpJson = path.join(os.tmpdir(), `tagbrowser-clip-read-${process.pid}-${Date.now()}.json`);
  try {
    const syncErr = runPowershellScriptFileWithArg(PS1_GET_CLIP_FILES, tmpJson, 'read clipboard paths failed');
    if (syncErr) throw new Error(syncErr);
    const raw = fssync.readFileSync(tmpJson, 'utf8').replace(/^\uFEFF/, '').trim();
    let arr = JSON.parse(raw);
    if (!Array.isArray(arr)) arr = arr != null && arr !== '' ? [arr] : [];
    return arr.map((x) => path.normalize(String(x || '').trim())).filter(Boolean);
  } finally {
    try {
      fssync.unlinkSync(tmpJson);
    } catch (_) {}
  }
}

function normalizeSourcePathsList(sourcePaths) {
  return (Array.isArray(sourcePaths) ? sourcePaths : [])
    .map((p) => path.normalize(String(p || '').trim()))
    .filter(Boolean);
}

function wouldNestDestInsideSrc(srcResolved, destResolved) {
  const rel = path.relative(srcResolved, destResolved);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Shared dest folder checks for paste/move into scope. */
async function validateScopePasteDestination(destDirRaw, rootPrefix, err) {
  const destDir = normalizeRenameOperand(String(destDirRaw || ''));
  if (!destDir) return { ok: false, error: err.noDest };
  if (!isPathUnderRoot(destDir, rootPrefix)) {
    return { ok: false, error: err.destNotUnderRoot };
  }
  let stDest;
  try {
    stDest = await fs.stat(destDir);
  } catch {
    return { ok: false, error: err.destMissing };
  }
  if (!stDest.isDirectory()) return { ok: false, error: err.destNotDir };
  return { ok: true, destDir };
}

/**
 * Explorer-style non-clobber name: use baseName if free, else `stem (1).ext`, `stem (2).ext`, …
 * baseName must be a single segment (basename semantics).
 */
async function uniqueDestPathInDir(destDir, baseName) {
  const baseSeg = path.basename(String(baseName || ''));
  if (!baseSeg || baseSeg === '.' || baseSeg === '..') {
    return { ok: false, error: 'Invalid paste name.' };
  }
  const { name: stem, ext } = path.parse(baseSeg);
  let n = 0;
  while (true) {
    const label = n === 0 ? baseSeg : `${stem} (${n})${ext}`;
    const destResolved = path.resolve(path.join(destDir, label));
    try {
      await fs.stat(destResolved);
      n += 1;
      if (n > 10000) return { ok: false, error: 'Too many duplicate names.' };
    } catch (e) {
      if (e && e.code === 'ENOENT') return { ok: true, destResolved };
      return { ok: false, error: 'Destination check: ' + String(e.message || e) };
    }
  }
}

/** Copy files/folders from disk into destDir (recursive); honors rootPrefix like rename-path. */
async function copySourcesIntoScopeFolder(sourcePaths, destDirRaw, rootPrefix, replaceExisting = false) {
  const v = await validateScopePasteDestination(destDirRaw, rootPrefix, {
    noDest: 'No destination folder.',
    destNotUnderRoot: 'Destination must stay under the configured root folder.',
    destMissing: 'Current folder does not exist or is not reachable.',
    destNotDir: 'Current folder path is not a folder.',
  });
  if (!v.ok) return v;
  const destDir = v.destDir;

  const list = normalizeSourcePathsList(sourcePaths);
  if (!list.length) return { ok: false, error: 'Nothing to paste.' };

  for (const srcRaw of list) {
    const src = path.normalize(String(srcRaw || '').trim());
    try {
      await fs.stat(src);
    } catch {
      return { ok: false, error: 'Source missing: ' + src };
    }

    const base = path.basename(src);
    const srcResolved = path.resolve(src);

    let destResolved;
    if (replaceExisting) {
      destResolved = path.resolve(path.join(destDir, base));
    } else {
      const u = await uniqueDestPathInDir(destDir, base);
      if (!u.ok) return u;
      destResolved = u.destResolved;
    }

    if (destResolved.toLowerCase() === srcResolved.toLowerCase()) continue;

    if (wouldNestDestInsideSrc(srcResolved, destResolved)) {
      return { ok: false, error: 'Cannot paste a folder into itself or a subfolder of the selection.' };
    }

    if (!isPathUnderRoot(destResolved, rootPrefix)) {
      return { ok: false, error: 'Paste would place files outside the configured root folder.' };
    }

    try {
      await fs.cp(srcResolved, destResolved, { recursive: true, force: !!replaceExisting });
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }
  return { ok: true };
}

/** Move files/folders into destDir (rename); same scope / nesting rules as copySourcesIntoScopeFolder. */
async function moveSourcesIntoFolder(sourcePaths, destDirRaw, rootPrefix, replaceExisting = false) {
  const v = await validateScopePasteDestination(destDirRaw, rootPrefix, {
    noDest: 'No destination folder.',
    destNotUnderRoot: 'Destination must stay under the configured root folder.',
    destMissing: 'Destination folder does not exist or is not reachable.',
    destNotDir: 'Destination is not a folder.',
  });
  if (!v.ok) return v;
  const destDir = v.destDir;

  const list = normalizeSourcePathsList(sourcePaths);
  if (!list.length) return { ok: false, error: 'Nothing to move.' };

  for (const srcRaw of list) {
    const src = path.normalize(String(srcRaw || '').trim());
    try {
      await fs.stat(src);
    } catch {
      return { ok: false, error: 'Source missing: ' + src };
    }
    if (!isPathUnderRoot(src, rootPrefix) && !isPathUnderShelf(src)) {
      return { ok: false, error: 'Source must stay under the configured root folder.' };
    }

    const base = path.basename(src);
    const srcResolved = path.resolve(src);

    let destResolved;
    if (replaceExisting) {
      destResolved = path.resolve(path.join(destDir, base));
    } else {
      const u = await uniqueDestPathInDir(destDir, base);
      if (!u.ok) return u;
      destResolved = u.destResolved;
    }

    if (destResolved.toLowerCase() === srcResolved.toLowerCase()) continue;

    if (wouldNestDestInsideSrc(srcResolved, destResolved)) {
      return { ok: false, error: 'Cannot move a folder into itself or a subfolder of the selection.' };
    }

    if (!isPathUnderRoot(destResolved, rootPrefix)) {
      return { ok: false, error: 'Move would place items outside the configured root folder.' };
    }

    if (replaceExisting) {
      try {
        await fs.rm(destResolved, { recursive: true, force: true });
      } catch (e) {
        return { ok: false, error: 'Could not replace existing item: ' + String(e.message || e) };
      }
    }

    const r = await renameWithBusyRetry(srcResolved, destResolved);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Strip \\?\ / \\?\UNC\ so root compare matches ordinary paths from Everything. */
function stripWinLongPath(p) {
  const s = String(p);
  if (process.platform !== 'win32') return s;
  if (s.startsWith('\\\\?\\UNC\\')) return '\\\\' + s.slice('\\\\?\\UNC\\'.length);
  if (s.startsWith('\\\\?\\')) return s.slice(4);
  return s;
}

/**
 * Paths from Everything HTTP often use forward slashes. shell.openPath + Windows handler lookup
 * can show “Open with” if the path is not normalized like Explorer’s (backslashes).
 */
function normalizePathForShellOpen(p) {
  let s = String(p || '').trim();
  if (!s) return '';
  if (process.platform === 'win32') s = stripWinLongPath(s);
  return path.normalize(s);
}

function getCmdExe() {
  return process.env.ComSpec || (process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'cmd.exe') : 'cmd.exe');
}

/**
 * Windows: same as typing a path after `start` in cmd — often avoids spurious “Open with” vs shell.openPath.
 * Resolves with null if spawn ok; otherwise an error string (then caller can try shell.openPath).
 */
function openPathViaCmdStartWindows(absNormPath) {
  return new Promise((resolve) => {
    const comSpec = getCmdExe();
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      resolve(err);
    };
    const child = spawn(comSpec, ['/d', '/c', 'start', '', absNormPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (e) => finish(String(e.message || e)));
    child.unref();
    setImmediate(() => finish(null));
  });
}

/** REG_SZ / REG_EXPAND_SZ value from `reg query` stdout. */
function winRegQueryParseLastDataLine(stdout) {
  if (!stdout) return null;
  for (const line of String(stdout).split(/\r?\n/)) {
    const m = line.match(/\sREG_(?:EXPAND_)?SZ\s+(.+)$/);
    if (m) return m[1].trim();
  }
  return null;
}

/** valueName null/'' → `/ve`; else `/v valueName`. */
function winRegQuery(regKey, valueName) {
  try {
    const args =
      valueName == null || valueName === ''
        ? ['query', regKey, '/ve']
        : ['query', regKey, '/v', String(valueName)];
    const out = execFileSync('reg', args, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return winRegQueryParseLastDataLine(out);
  } catch {
    return null;
  }
}

/** Expand %ProgramFiles% etc. in REG_EXPAND_SZ command lines (partial). */
function winExpandEnvString(s) {
  return String(s).replace(/%([^%]+)%/g, (_, k) => (process.env[k] !== undefined ? process.env[k] : `%${k}%`));
}

/** Spawning these shows the “Once / Always” picker instead of the real app. */
function winIsAssociationPickerStubExe(exePath) {
  let s = String(exePath || '').trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  const base = path.basename(s).toLowerCase();
  return (
    base === 'openwith.exe' ||
    base === 'launchwinapp.exe' ||
    base === 'pickerhost.exe' ||
    base === 'immersivecontrolpanel.exe'
  );
}

/**
 * Same command string `assoc` + `ftype` would use — often matches Explorer better than a lone ProgId key.
 */
function winOpenCommandTemplateViaAssocFtype(extNoDot) {
  const dot = '.' + String(extNoDot || '').replace(/^\./, '').toLowerCase();
  try {
    const assocOut = execFileSync('cmd.exe', ['/d', '/c', 'assoc', dot], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const assocLine = String(assocOut)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().startsWith(dot.toLowerCase() + '='));
    if (!assocLine) return null;
    const eq = assocLine.indexOf('=');
    if (eq < 0) return null;
    const ftypeName = assocLine.slice(eq + 1).trim();
    if (!ftypeName) return null;
    const ftOut = execFileSync('cmd.exe', ['/d', '/c', 'ftype', ftypeName], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const prefix = ftypeName + '=';
    const ftLine = String(ftOut)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().startsWith(prefix.toLowerCase()));
    if (!ftLine) return null;
    const i = ftLine.indexOf('=');
    return i >= 0 ? ftLine.slice(i + 1).trim() : null;
  } catch {
    return null;
  }
}

/** Default handler ProgId: UserChoice wins on Win10+, else HKCR\.ext. */
function winProgIdForExtension(extNoDot) {
  const dot = '.' + String(extNoDot || '').replace(/^\./, '').toLowerCase();
  const fromUser =
    winRegQuery(
      `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${dot}\\UserChoice`,
      'ProgId'
    ) || null;
  if (fromUser) return fromUser;
  return winRegQuery(`HKCR\\${dot}`, null) || null;
}

function winOpenCommandTemplateForProgId(progId) {
  if (!progId) return null;
  const id = String(progId).replace(/\//g, '\\');
  return (
    winRegQuery(`HKCR\\${id}\\shell\\open\\command`, null) || winRegQuery(`HKCR\\${id}\\Shell\\Open\\Command`, null)
  );
}

/** Split remainder of command line respecting double quotes (after leading "exe" removed). */
function winSplitArgsRespectingQuotes(argLine) {
  const s = String(argLine || '').trim();
  if (!s) return [];
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      inQ = !inQ;
      cur += c;
    } else if (!inQ && /\s/.test(c)) {
      if (cur) {
        const t = cur.trim();
        out.push(/^"(.*)"$/.test(t) ? t.slice(1, -1) : t);
        cur = '';
      }
    } else cur += c;
  }
  if (cur.trim()) {
    const t = cur.trim();
    out.push(/^"(.*)"$/.test(t) ? t.slice(1, -1) : t);
  }
  return out;
}

/**
 * Run the same “open” command the shell would for this file type (from registry).
 * Avoids Electron/ShellExecute paths that trigger Win11 “Once / Always” for some Office types.
 */
function winExpandOpenCommandPlaceholders(tail, filePath) {
  // Wrap filePath in quotes so paths with spaces/parens survive arg splitting
  const quoted = '"' + filePath + '"';
  return String(tail || '')
    .replace(/"%1"/gi, quoted)
    .replace(/%1/gi, quoted)
    .replace(/"%[uU]"/g, quoted)
    .replace(/%[uU]/g, quoted)
    .replace(/"%[lL]"/g, quoted)
    .replace(/%[lL]/g, quoted)
    .replace(/%\*/g, '')
    .trim();
}

function winParseRegistryOpenCommand(templateRaw, filePath) {
  const template = winExpandEnvString(String(templateRaw || '').trim());
  if (!template) return null;
  const m = /^"([^"]+)"\s*(.*)$/s.exec(template);
  if (m) {
    const exe = m[1];
    let tail = winExpandOpenCommandPlaceholders(m[2] || '', filePath);
    if (!tail) return { exe, args: [filePath] };
    return { exe, args: winSplitArgsRespectingQuotes(tail) };
  }
  const sp = template.indexOf(' ');
  if (sp > 0) {
    const exe = template.slice(0, sp);
    let tail = winExpandOpenCommandPlaceholders(template.slice(sp + 1), filePath);
    if (!tail) return { exe, args: [filePath] };
    return { exe, args: winSplitArgsRespectingQuotes(tail) };
  }
  return { exe: template, args: [filePath] };
}

function openPathViaSpawnDetached(exe, args) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      resolve(err);
    };
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', (e) => finish(String(e.message || e)));
    child.unref();
    setImmediate(() => finish(null));
  });
}

/** Try parsed open command; null = spawn ok, string = try next template / method. */
async function openPathTryTemplateSpawn(tmpl, absNormPath) {
  if (!tmpl || !String(tmpl).trim()) return 'Empty template';
  const parsed = winParseRegistryOpenCommand(tmpl, absNormPath);
  if (!parsed || !parsed.exe) return 'Bad parse';
  if (winIsAssociationPickerStubExe(parsed.exe)) return 'Picker stub';
  return openPathViaSpawnDetached(parsed.exe, parsed.args);
}

/** ProgId for http/https from UrlAssociations (Settings → Default browser / “choose by link type”). */
function winProgIdForUrlScheme(schemeLower) {
  const s = String(schemeLower || '')
    .toLowerCase()
    .replace(/:$/, '')
    .replace(/[^a-z0-9+-]/g, '');
  if (!s) return null;
  return (
    winRegQuery(`HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${s}\\UserChoice`, 'ProgId') ||
    null
  );
}

/** Spawn the registered browser with this URL (avoids Electron routing https → Edge). */
async function openUrlViaRegisteredHandlerWindows(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return 'Not an http(s) URL';
  for (const sch of ['https', 'http']) {
    const pid = winProgIdForUrlScheme(sch);
    if (!pid) continue;
    const tmpl = winOpenCommandTemplateForProgId(pid);
    if (!tmpl) continue;
    const err = await openPathTryTemplateSpawn(tmpl, u);
    if (!err) return null;
  }
  return 'No UrlAssociations handler';
}

/**
 * Open http(s) in the user’s real default browser (Win: UrlAssociations → spawn, then `start`, then Electron shell).
 */
async function openUrlInSystemDefaultBrowser(url) {
  const u = String(url || '').trim();
  if (!u) throw new Error('Empty URL');
  if (process.platform === 'win32') {
    const regErr = await openUrlViaRegisteredHandlerWindows(u);
    if (!regErr) return;
    await new Promise((resolve, reject) => {
      const child = spawn(getCmdExe(), ['/d', '/c', 'start', '', u], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', (e) => reject(e));
      child.unref();
      setImmediate(() => resolve());
    });
    return;
  }
  await shell.openExternal(u);
}

/**
 * Registry open\command for this extension; skip stub handlers that only show the picker.
 * Per-extension UserChoice (Settings → default app → .pdf etc.) before assoc/ftype — assoc can lag (e.g. still Edge while UserChoice is Chrome).
 */
async function openPathViaRegistryOpenCommandWindows(absNormPath) {
  const ext = path.extname(absNormPath).slice(1).toLowerCase();
  if (!ext) return 'No extension';
  const seen = new Set();
  const templates = [];
  const progId = winProgIdForExtension(ext);
  const fromUserChoice = progId ? winOpenCommandTemplateForProgId(progId) : null;
  if (fromUserChoice) {
    templates.push(fromUserChoice);
    seen.add(fromUserChoice);
  }
  const fromAssoc = winOpenCommandTemplateViaAssocFtype(ext);
  if (fromAssoc && !seen.has(fromAssoc)) {
    templates.push(fromAssoc);
    seen.add(fromAssoc);
  }
  for (const tmpl of templates) {
    const err = await openPathTryTemplateSpawn(tmpl, absNormPath);
    if (!err) return null;
  }
  return 'No working open template';
}

/**
 * Last-resort association path that still runs outside Electron’s shell helpers.
 * (WindowsTerminal’s “open file” behavior; avoids shell.openExternal file:// picker on some setups.)
 */
function openPathViaPowershellInvokeItem(absNormPath) {
  return new Promise((resolve) => {
    const ps = windowsPowerShellExe();
    if (!fssync.existsSync(ps)) {
      resolve('No PowerShell');
      return;
    }
    const esc = (s) => String(s).replace(/'/g, "''");
    const script = `Invoke-Item -LiteralPath '${esc(absNormPath)}'`;
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      resolve(err);
    };
    const child = spawn(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (e) => finish(String(e.message || e)));
    child.unref();
    setImmediate(() => finish(null));
  });
}

/** Open file/folder with default handler. shell.openPath (ShellExecuteW) is the primary method. */
async function openPathWithFallback(fullPathRaw) {
  const p = normalizePathForShellOpen(fullPathRaw);
  if (!p) return 'Empty path.';

  // shell.openPath = ShellExecuteW "open" — the standard Windows/macOS/Linux way
  const shellErr = await shell.openPath(p);
  if (!shellErr) return null;

  // Fallbacks (Windows only) if ShellExecute failed
  if (process.platform === 'win32') {
    const ext = path.extname(p).slice(1).toLowerCase();
    if (ext) {
      const regErr = await openPathViaRegistryOpenCommandWindows(p);
      if (!regErr) return null;
      const psErr = await openPathViaPowershellInvokeItem(p);
      if (!psErr) return null;
    }
    const startErr = await openPathViaCmdStartWindows(p);
    return startErr || shellErr;
  }
  return shellErr;
}

/**
 * One physical path for scope checks: Explorer / cloud sync may use junctions or aliases so two
 * strings point at the same tree but path.relative would walk through "..".
 */
function canonicalPathForScopeCompare(absNormPath) {
  const s = String(absNormPath || '').trim();
  if (!s) return s;
  const tryNative = () =>
    typeof fssync.realpathSync.native === 'function'
      ? fssync.realpathSync.native(s)
      : fssync.realpathSync(s);
  try {
    return tryNative();
  } catch (_) {
    try {
      return fssync.realpathSync(s);
    } catch (_) {
      try {
        const dir = path.dirname(s);
        const base = path.basename(s);
        const rd =
          typeof fssync.realpathSync.native === 'function'
            ? fssync.realpathSync.native(dir)
            : fssync.realpathSync(dir);
        return path.join(rd, base);
      } catch (_) {
        return s;
      }
    }
  }
}

function trimAbsPathForCompare(p) {
  let x = path.normalize(String(p || ''));
  x = stripWinLongPath(x);
  while (x.length > 1 && x.endsWith(path.sep)) x = x.slice(0, -1);
  if (process.platform === 'win32' && /^[a-zA-Z]:$/i.test(x)) x = x + path.sep;
  return x;
}

/** True if fullPath is the root folder or a path inside it (handles long-path prefix + different drives). */
function isPathUnderRoot(fullPath, rootRaw) {
  const rootTrim = String(rootRaw || '').trim();
  if (!rootTrim) return true;

  let r = trimAbsPathForCompare(rootTrim);
  let f = trimAbsPathForCompare(String(fullPath || ''));
  if (!r) return true;

  r = trimAbsPathForCompare(canonicalPathForScopeCompare(r));
  f = trimAbsPathForCompare(canonicalPathForScopeCompare(f));

  if (f.toLowerCase() === r.toLowerCase()) return true;

  const rel = path.relative(r, f);
  if (!rel) return true;
  if (rel.startsWith('..')) return false;
  if (path.isAbsolute(rel)) return false;
  return true;
}

/** Staging folder for renderer “Shelf” (under userData). */
function getShelfDirResolved() {
  const d = path.normalize(path.join(app.getPath('userData'), 'TagBrowserShelf'));
  try {
    if (!fssync.existsSync(d)) fssync.mkdirSync(d, { recursive: true });
  } catch (_) {}
  return path.resolve(d);
}

/** Tag bar + active filter — stored under userData so it survives different app folders (file:// localStorage is path-scoped). */
function tagBrowserTagPrefsPath() {
  return path.join(app.getPath('userData'), 'tagBrowser-tag-prefs.json');
}

function writeTagBrowserTagPrefs(payload) {
  const p = tagBrowserTagPrefsPath();
  const dir = path.dirname(p);
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });
  fssync.writeFileSync(p, JSON.stringify(payload), 'utf8');
}

function isPathUnderShelf(absPathRaw) {
  try {
    const shelf = trimAbsPathForCompare(canonicalPathForScopeCompare(getShelfDirResolved()));
    const f = trimAbsPathForCompare(canonicalPathForScopeCompare(path.resolve(String(absPathRaw || '').trim())));
    if (!f || !shelf) return false;
    if (f.toLowerCase() === shelf.toLowerCase()) return true;
    const rel = path.relative(shelf, f);
    if (!rel || rel === '') return true;
    if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/** Build GET URL for Everything HTTP server (json + path/size/date + optional flags). */
function everythingSearchUrl(baseUrl, searchText, count, options) {
  const o = options || {};
  const u = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  u.searchParams.set('search', searchText);
  u.searchParams.set('json', '1');
  u.searchParams.set('path_column', '1');
  u.searchParams.set('size_column', '1');
  u.searchParams.set('date_modified_column', '1');
  u.searchParams.set('attributes_column', '1');
  u.searchParams.set('count', String(Math.min(Math.max(Number(count) || 100, 1), 50000)));
  u.searchParams.set('offset', String(Math.max(Number(o.offset) || 0, 0)));

  if (o.case) u.searchParams.set('i', '1'); // match case (voidtools key i)
  if (o.wholeword) u.searchParams.set('w', '1');
  if (o.pathSearch) u.searchParams.set('p', '1');
  if (o.regex) u.searchParams.set('r', '1');
  if (o.diacritics) u.searchParams.set('m', '1');

  const sort = o.sort || 'name';
  if (['name', 'path', 'date_modified', 'size'].includes(sort)) u.searchParams.set('sort', sort);
  u.searchParams.set('ascending', o.ascending === false || o.ascending === 0 ? '0' : '1');

  return u.toString();
}

/** Target webContents for View-menu actions (focused BrowserWindow). */
function focusedMenuWebContents(focusedWindow) {
  const w = focusedWindow || BrowserWindow.getFocusedWindow();
  if (!w || w.isDestroyed()) return null;
  return w.webContents;
}

/** Page zoom steps — shared by View menu (clicks) and attachPageZoomShortcuts (keyboard). */
function pageZoomReset(wc) {
  if (!wc || wc.isDestroyed()) return;
  wc.setZoomFactor(1);
}
function pageZoomIn(wc) {
  if (!wc || wc.isDestroyed()) return;
  const z = wc.getZoomFactor();
  wc.setZoomFactor(Math.min(3, Math.round(z * 1.1 * 100) / 100));
}
function pageZoomOut(wc) {
  if (!wc || wc.isDestroyed()) return;
  const z = wc.getZoomFactor();
  wc.setZoomFactor(Math.max(0.25, Math.round((z / 1.1) * 100) / 100));
}

/** Windows/Linux: without an app menu, Electron does not bind reload / hard-reload accelerators. */
function installApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const hardReload = (_item, focusedWindow) => {
    const w = focusedWindow || BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) w.webContents.reloadIgnoringCache();
  };
  // Show shortcuts in the menu; real key handling is attachPageZoomShortcuts (Windows/Linux:
  // registerAccelerator: false avoids double-zoom). macOS cannot disable registration, so no accelerators there.
  const zoomClick = (fn) => (_item, focusedWindow) => {
    const wc = focusedMenuWebContents(focusedWindow);
    if (wc) fn(wc);
  };
  const zoomInItem /** @type {Electron.MenuItemConstructorOptions[]} */ = isMac
    ? [{ label: 'Zoom In (⌘+)', click: zoomClick(pageZoomIn) }]
    : [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          registerAccelerator: false,
          click: zoomClick(pageZoomIn),
        },
      ];
  const zoomOutItem /** @type {Electron.MenuItemConstructorOptions[]} */ = isMac
    ? [{ label: 'Zoom Out (⌘−)', click: zoomClick(pageZoomOut) }]
    : [
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          registerAccelerator: false,
          click: zoomClick(pageZoomOut),
        },
      ];
  const actualSizeItem /** @type {Electron.MenuItemConstructorOptions[]} */ = isMac
    ? [{ label: 'Actual Size (⌘0)', click: zoomClick(pageZoomReset) }]
    : [
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          registerAccelerator: false,
          click: zoomClick(pageZoomReset),
        },
      ];
  const viewSubmenu /** @type {Electron.MenuItemConstructorOptions[]} */ = [
    { role: 'reload' },
    { role: 'forceReload' },
    { label: 'Hard reload', accelerator: 'CmdOrCtrl+F5', click: hardReload },
    // Same action; second accelerator (no extra row — hidden item still registers the shortcut).
    { label: 'Hard reload', accelerator: 'CmdOrCtrl+Shift+F5', visible: false, click: hardReload },
    { type: 'separator' },
    { role: 'toggleDevTools' },
    { type: 'separator' },
    ...zoomInItem,
    ...zoomOutItem,
    ...actualSizeItem,
  ];
  const template /** @type {Electron.MenuItemConstructorOptions[]} */ = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        { label: 'View', submenu: viewSubmenu },
      ]
    : [
        { label: 'File', submenu: [{ role: 'quit' }] },
        { label: 'View', submenu: viewSubmenu },
      ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Ctrl/Cmd +/-/0 on page zoom. Menu `zoomIn`/`zoomOut` accelerators often do not run when the
 * webContents has focus on Windows; `before-input-event` applies zoom in the main process.
 */
function attachPageZoomShortcuts(wc) {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = process.platform === 'darwin' ? input.meta : input.control;
    if (!mod || input.alt) return;

    const { code } = input;

    if (code === 'Digit0' || code === 'Numpad0') {
      if (input.shift) return;
      event.preventDefault();
      pageZoomReset(wc);
      return;
    }
    if (code === 'Minus' || code === 'NumpadSubtract') {
      event.preventDefault();
      pageZoomOut(wc);
      return;
    }
    if (code === 'Equal' || code === 'NumpadAdd') {
      event.preventDefault();
      pageZoomIn(wc);
      return;
    }
  });
}

/** Main browser window ref for global show/hide toggle (child windows excluded). */
let mainWindowRef = null;
/** Currently registered global shortcut string (Electron accelerator), or ''. */
let globalToggleRegistered = '';
/** Quick TODO floating panel (separate global shortcut). */
let quickTodoHotkeyRegistered = '';

const DEFAULT_GLOBAL_TOGGLE_ACCEL = 'Control+Space';
const DEFAULT_QUICK_TODO_ACCEL = 'Alt+Shift+N';

function globalTogglePrefsPath() {
  return path.join(app.getPath('userData'), 'tagBrowser-global-toggle.json');
}

function loadGlobalToggleAccelFromDisk() {
  try {
    const p = globalTogglePrefsPath();
    if (!fssync.existsSync(p)) return DEFAULT_GLOBAL_TOGGLE_ACCEL;
    const j = JSON.parse(fssync.readFileSync(p, 'utf8'));
    const a = j && typeof j.accelerator === 'string' ? j.accelerator.trim() : '';
    return a || DEFAULT_GLOBAL_TOGGLE_ACCEL;
  } catch {
    return DEFAULT_GLOBAL_TOGGLE_ACCEL;
  }
}

function saveGlobalToggleAccelToDisk(acc) {
  const p = globalTogglePrefsPath();
  const dir = path.dirname(p);
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });
  fssync.writeFileSync(p, JSON.stringify({ accelerator: acc }), 'utf8');
}

function quickTodoHotkeyPrefsPath() {
  return path.join(app.getPath('userData'), 'tagBrowser-quick-todo-hotkey.json');
}

function loadQuickTodoAccelFromDisk() {
  try {
    const p = quickTodoHotkeyPrefsPath();
    if (!fssync.existsSync(p)) return DEFAULT_QUICK_TODO_ACCEL;
    const j = JSON.parse(fssync.readFileSync(p, 'utf8'));
    const a = j && typeof j.accelerator === 'string' ? j.accelerator.trim() : '';
    return a || DEFAULT_QUICK_TODO_ACCEL;
  } catch {
    return DEFAULT_QUICK_TODO_ACCEL;
  }
}

function saveQuickTodoAccelToDisk(acc) {
  const p = quickTodoHotkeyPrefsPath();
  const dir = path.dirname(p);
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });
  fssync.writeFileSync(p, JSON.stringify({ accelerator: acc }), 'utf8');
}

function toggleMainWindowFromGlobalShortcut() {
  const w =
    mainWindowRef && !mainWindowRef.isDestroyed()
      ? mainWindowRef
      : BrowserWindow.getAllWindows().find((x) => x && !x.isDestroyed());
  if (!w || w.isDestroyed()) return;
  if (w.isVisible() && !w.isMinimized() && w.isFocused()) w.hide();
  else {
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }
}

/** Bring main window forward and open the renderer Quick TODO strip (global shortcut). */
function openQuickTodoFromGlobalShortcut() {
  const w =
    mainWindowRef && !mainWindowRef.isDestroyed()
      ? mainWindowRef
      : BrowserWindow.getAllWindows().find((x) => x && !x.isDestroyed());
  if (!w || w.isDestroyed()) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
  try {
    w.webContents.send('tagfox-open-quick-todo');
  } catch (_) {}
}

/** Register OS-wide shortcut; rolls back to previous if the new one cannot register. */
function registerGlobalToggleShortcut(accelRaw) {
  const accel = String(accelRaw || '').trim() || DEFAULT_GLOBAL_TOGGLE_ACCEL;
  if (quickTodoHotkeyRegistered && accel === quickTodoHotkeyRegistered) {
    return {
      ok: false,
      error: 'That shortcut is already used for Quick TODO.',
      accelerator: globalToggleRegistered || loadGlobalToggleAccelFromDisk(),
    };
  }
  const prev = globalToggleRegistered;
  if (prev) {
    try {
      globalShortcut.unregister(prev);
    } catch (_) {}
    globalToggleRegistered = '';
  }
  const ok = globalShortcut.register(accel, toggleMainWindowFromGlobalShortcut);
  if (!ok) {
    if (prev) {
      const back = globalShortcut.register(prev, toggleMainWindowFromGlobalShortcut);
      if (back) globalToggleRegistered = prev;
    }
    return {
      ok: false,
      error: 'Could not register shortcut (invalid or already in use by another app).',
      accelerator: prev || accel,
    };
  }
  globalToggleRegistered = accel;
  saveGlobalToggleAccelToDisk(accel);
  return { ok: true, accelerator: accel };
}

/** Second global shortcut: Quick TODO panel (independent from show/hide). */
function registerQuickTodoShortcut(accelRaw) {
  const accel = String(accelRaw || '').trim() || DEFAULT_QUICK_TODO_ACCEL;
  if (globalToggleRegistered && accel === globalToggleRegistered) {
    return {
      ok: false,
      error: 'That shortcut is already used for Toggle TagFox.',
      accelerator: quickTodoHotkeyRegistered || loadQuickTodoAccelFromDisk(),
    };
  }
  const prev = quickTodoHotkeyRegistered;
  if (prev) {
    try {
      globalShortcut.unregister(prev);
    } catch (_) {}
    quickTodoHotkeyRegistered = '';
  }
  const ok = globalShortcut.register(accel, openQuickTodoFromGlobalShortcut);
  if (!ok) {
    if (prev) {
      const back = globalShortcut.register(prev, openQuickTodoFromGlobalShortcut);
      if (back) quickTodoHotkeyRegistered = prev;
    }
    return {
      ok: false,
      error: 'Could not register shortcut (invalid or already in use by another app).',
      accelerator: prev || accel,
    };
  }
  quickTodoHotkeyRegistered = accel;
  saveQuickTodoAccelToDisk(accel);
  return { ok: true, accelerator: accel };
}

function createWindow() {
  // `maximized` is not a BrowserWindow option — use maximize() so we get OS chrome, not fullscreen.
  const win = new BrowserWindow({
    width: 1480,
    height: 820,
    show: false,
    // false: File / View stay visible (Alt-only bar hid the menu — looked like “no File menu”).
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindowRef = win;
  win.on('closed', () => {
    if (mainWindowRef === win) mainWindowRef = null;
  });
  attachPageZoomShortcuts(win.webContents);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    try {
      const u = new URL(openUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        void openUrlInSystemDefaultBrowser(openUrl).catch(() => {});
        return { action: 'deny' };
      }
    } catch {
      /* non-URL */
    }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const u = new URL(navigationUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        event.preventDefault();
        void openUrlInSystemDefaultBrowser(navigationUrl).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
}

/** Search scope Settings: folder picker + profile path — register after app ready (reliable with ipcMain.handle). */
function registerSearchScopeFolderIpc() {
  try {
    ipcMain.removeHandler('pick-scope-folder');
  } catch (_) {}
  try {
    ipcMain.removeHandler('user-home-dir');
  } catch (_) {}
  ipcMain.handle('pick-scope-folder', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const r = await dialog.showOpenDialog(win || undefined, {
        properties: ['openDirectory', 'dontAddToRecent'],
      });
      if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, path: '' };
      return { ok: true, path: r.filePaths[0] };
    } catch (e) {
      return { ok: false, path: '', error: String(e && e.message ? e.message : e) };
    }
  });
  ipcMain.handle('user-home-dir', () => {
    try {
      const p = os.homedir();
      if (!p || !String(p).trim()) return { ok: false, path: '', error: 'No home directory.' };
      return { ok: true, path: p };
    } catch (e) {
      return { ok: false, path: '', error: String(e && e.message ? e.message : e) };
    }
  });
}

app.whenReady().then(() => {
  installApplicationMenu();
  registerSearchScopeFolderIpc();
  const gt = registerGlobalToggleShortcut(loadGlobalToggleAccelFromDisk());
  if (!gt.ok) console.warn('[TagFox] Global toggle shortcut:', gt.error);
  const qt = registerQuickTodoShortcut(loadQuickTodoAccelFromDisk());
  if (!qt.ok) console.warn('[TagFox] Quick TODO shortcut:', qt.error);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
});

ipcMain.handle('global-toggle-get', () => ({
  accelerator: globalToggleRegistered || loadGlobalToggleAccelFromDisk(),
}));

ipcMain.handle('global-toggle-set', (_event, accel) => registerGlobalToggleShortcut(accel));

ipcMain.handle('quick-todo-hotkey-get', () => ({
  accelerator: quickTodoHotkeyRegistered || loadQuickTodoAccelFromDisk(),
}));

ipcMain.handle('quick-todo-hotkey-set', (_event, accel) => registerQuickTodoShortcut(accel));

ipcMain.on('tag-prefs-read-sync', (event) => {
  try {
    const p = tagBrowserTagPrefsPath();
    event.returnValue = fssync.existsSync(p) ? fssync.readFileSync(p, 'utf8') : '';
  } catch {
    event.returnValue = '';
  }
});

ipcMain.on('tag-prefs-write-sync', (event, payload) => {
  try {
    writeTagBrowserTagPrefs(payload);
    event.returnValue = true;
  } catch {
    event.returnValue = false;
  }
});

ipcMain.handle('tag-prefs-write', async (_e, payload) => {
  try {
    writeTagBrowserTagPrefs(payload);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('everything-search', async (_event, payload) => {
  const { baseUrl, searchText, httpUser, httpPassword, count, options } = payload;
  const url = everythingSearchUrl(baseUrl, searchText, count, options);
  const headers = {};
  const user = (httpUser || '').trim();
  const pass = (httpPassword || '').trim();
  if (user || pass) {
    const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${token}`;
  }
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    return { ok: false, error: String(e.message || e), rows: [] };
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, rows: [] };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      error: 'Response was not JSON — check base URL/port and that the Everything HTTP server is enabled.',
      rows: [],
    };
  }
  return { ok: true, rows: rowsFromEverythingJson(data) };
});

ipcMain.handle('open-path', async (_event, fullPath) => {
  return openPathWithFallback(fullPath);
});

ipcMain.handle('show-in-folder', async (_event, fullPath) => {
  shell.showItemInFolder(fullPath);
});

/** ─── Google Drive “.gdoc / .gsheet / .gslides” shortcuts → child window(s) (docs.google.com); each open gets its own window ─── */

/** Persist window frame in userData (Renderer localStorage is not TagFox’s for google.com). */
function googleWorkspaceBoundsPrefsPath() {
  return path.join(app.getPath('userData'), 'tagBrowser-google-workspace-bounds.json');
}

function rectIntersectsWorkArea(rect, wa) {
  const rx2 = rect.x + rect.width;
  const ry2 = rect.y + rect.height;
  const wx2 = wa.x + wa.width;
  const wy2 = wa.y + wa.height;
  return rect.x < wx2 && rx2 > wa.x && rect.y < wy2 && ry2 > wa.y;
}

function isGoogleWorkspaceBoundsUsable(rect) {
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return false;
  if (rect.width < 200 || rect.height < 200) return false;
  try {
    for (const d of screen.getAllDisplays()) {
      if (rectIntersectsWorkArea(rect, d.workArea)) return true;
    }
  } catch (_) {}
  return false;
}

function defaultGoogleWorkspaceWindowBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.round(wa.width * 0.9);
  const height = Math.round(wa.height * 0.9);
  const x = Math.round(wa.x + (wa.width - width) / 2);
  const y = Math.round(wa.y + (wa.height - height) / 2);
  return { x, y, width, height, maximized: false };
}

function loadGoogleWorkspaceBoundsFromDisk() {
  try {
    const p = googleWorkspaceBoundsPrefsPath();
    if (!fssync.existsSync(p)) return null;
    const j = JSON.parse(fssync.readFileSync(p, 'utf8'));
    const x = Number(j.x);
    const y = Number(j.y);
    const width = Number(j.width);
    const height = Number(j.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      maximized: !!j.maximized,
    };
  } catch (_) {
    return null;
  }
}

function saveGoogleWorkspaceBoundsToDisk(state) {
  const p = googleWorkspaceBoundsPrefsPath();
  const dir = path.dirname(p);
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });
  fssync.writeFileSync(
    p,
    JSON.stringify({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      maximized: !!state.maximized,
    }),
    'utf8'
  );
}

function snapshotGoogleWorkspaceWindowState(win) {
  if (!win || win.isDestroyed()) return null;
  const maximized = win.isMaximized();
  const b = maximized ? win.getNormalBounds() : win.getBounds();
  return {
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    maximized: !!maximized,
  };
}

/** Debounced save on move/resize; flush on close. */
function attachGoogleWorkspaceWindowBoundsPersistence(win) {
  let timer = null;
  const flush = () => {
    timer = null;
    try {
      const s = snapshotGoogleWorkspaceWindowState(win);
      if (s) saveGoogleWorkspaceBoundsToDisk(s);
    } catch (_) {}
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
  };
  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);
  win.on('close', () => {
    if (timer) clearTimeout(timer);
    flush();
  });
}

function targetUrlFromGoogleDriveShortcut(fullPath, rawText) {
  const text = String(rawText || '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!text) return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const u = typeof data.url === 'string' ? data.url.trim() : '';
  if (u && /^https?:\/\//i.test(u)) return u;
  const id = typeof data.doc_id === 'string' ? data.doc_id.trim() : '';
  if (!id) return null;
  const ext = path.extname(String(fullPath || '')).toLowerCase();
  if (ext === '.gsheet') return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  if (ext === '.gslides') return `https://docs.google.com/presentation/d/${id}/edit`;
  return `https://docs.google.com/document/d/${id}/edit`;
}

/**
 * Google Drive for Desktop: cloud file id is exposed as a synthetic stream `file.gdoc:user.drive.id`.
 * Often readable when the main stream throws EISDIR to Node (placeholder stub). Not on all mounts.
 */
function tryReadGoogleDriveVirtualFileIdWindowsSync(fullPathRaw, diag) {
  if (process.platform !== 'win32') return null;
  const norm = normalizePathForShellOpen(String(fullPathRaw || '')).trim();
  if (!norm) return null;
  const back = norm.replace(/\//g, '\\');
  const stream = ':user.drive.id';
  const candidates = [];
  candidates.push(`${back}${stream}`);
  try {
    const resolved = path.resolve(back);
    const longBase = toWinLongRenamePath(resolved);
    if (longBase !== resolved) candidates.push(`${longBase}${stream}`);
  } catch (_) {}
  const comspec = process.env.ComSpec || (process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'cmd.exe') : 'cmd.exe');
  const attempts = [];
  // #region agent log
  const __dvEnter = (globalThis.__tagfoxDbgDriveVirtEnter = (globalThis.__tagfoxDbgDriveVirtEnter || 0) + 1);
  if (__dvEnter <= 25) {
    fetch('http://127.0.0.1:7460/ingest/0dfbb0a0-7bdd-458e-8476-39dae77fc97d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0677d7' },
      body: JSON.stringify({
        sessionId: '0677d7',
        location: 'main.js:tryReadGoogleDriveVirtualFileIdWindowsSync:enter',
        message: 'virtual id probe',
        data: { hypothesisId: 'H1', n: __dvEnter, back, candidates },
        timestamp: Date.now(),
        runId: 'pre',
      }),
    }).catch(() => {});
  }
  // #endregion
  for (const adsPath of candidates) {
    for (const label of ['fs.readFileSync', 'cmd.type']) {
      try {
        let raw;
        if (label === 'fs.readFileSync') {
          raw = fssync.readFileSync(adsPath, 'utf8');
        } else {
          // #region agent log
          const __ct = (globalThis.__tagfoxDbgCmdType = (globalThis.__tagfoxDbgCmdType || 0) + 1);
          if (__ct <= 30) {
            fetch('http://127.0.0.1:7460/ingest/0dfbb0a0-7bdd-458e-8476-39dae77fc97d', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0677d7' },
              body: JSON.stringify({
                sessionId: '0677d7',
                location: 'main.js:tryReadGoogleDriveVirtualFileIdWindowsSync:cmdType',
                message: 'before execFileSync type',
                data: { hypothesisId: 'H1', n: __ct, adsPath },
                timestamp: Date.now(),
                runId: 'pre',
              }),
            }).catch(() => {});
          }
          // #endregion
          // Drop cmd stderr (invalid ADS / path) — default pipes can still surface "filename… syntax is incorrect" on the npm/electron parent console on Windows.
          raw = execFileSync(comspec, ['/d', '/s', '/c', 'type', adsPath], {
            encoding: 'utf8',
            windowsHide: true,
            maxBuffer: 4096,
            stdio: ['ignore', 'pipe', 'ignore'],
          });
        }
        const id = String(raw || '')
          .replace(/^\uFEFF/, '')
          .trim()
          .split(/\r?\n/)[0]
          .trim();
        if (!id || /^local/i.test(id)) {
          attempts.push({ label, adsPath, note: 'empty_or_local_placeholder' });
          continue;
        }
        if (id.length < 10 || id.length > 256 || !/^[A-Za-z0-9_-]+$/.test(id)) {
          attempts.push({ label, adsPath, note: 'id_shape' });
          continue;
        }
        if (diag) {
          diag.driveVirtualIdStream = { ok: true, via: label, adsPath, idLen: id.length };
        }
        return id;
      } catch (e) {
        const emsg = String(e.message || e);
        attempts.push({ label, adsPath, code: e.code || null, msg: emsg });
        // #region agent log
        if (/syntax is incorrect|filename, directory name/i.test(emsg)) {
          const __ce = (globalThis.__tagfoxDbgCmdTypeErr = (globalThis.__tagfoxDbgCmdTypeErr || 0) + 1);
          if (__ce <= 25) {
            fetch('http://127.0.0.1:7460/ingest/0dfbb0a0-7bdd-458e-8476-39dae77fc97d', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0677d7' },
              body: JSON.stringify({
                sessionId: '0677d7',
                location: 'main.js:tryReadGoogleDriveVirtualFileIdWindowsSync:catch',
                message: 'read virtual id failed',
                data: { hypothesisId: 'H1', label, adsPath, emsg: emsg.slice(0, 220) },
                timestamp: Date.now(),
                runId: 'pre',
              }),
            }).catch(() => {});
          }
        }
        // #endregion
      }
    }
  }
  if (diag) diag.driveVirtualIdStream = { ok: false, attempts };
  return null;
}

/** Node readFile EISDIR on `.gdoc` while stat says file: try .NET ReadAllText (Explorer-style) for normal + `\\?\` paths. */
const PS1_READ_UTF8_PATH_VARIANTS = `param([Parameter(Mandatory)][string]$JsonPath)
try {
  $j = (Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8) | ConvertFrom-Json
  $out = [string]$j.outFile
  $arr = $j.paths
  if ($null -eq $arr) { throw 'Missing paths' }
  if ($arr -isnot [System.Array]) { $arr = @($arr) }
  $enc = [System.Text.UTF8Encoding]::new($false)
  foreach ($p in $arr) {
    $lp = [string]$p
    if (-not $lp) { continue }
    try {
      $t = [System.IO.File]::ReadAllText($lp, $enc)
      [System.IO.File]::WriteAllText($out, $t, $enc)
      exit 0
    } catch { }
  }
  throw 'ReadAllText failed for all path variants'
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;

/** Drive placeholders: Copy-Item to local disk often hydrates when ReadAllText cannot open the virtual path. */
const PS1_COPY_PATH_VARIANTS = `param([Parameter(Mandatory)][string]$JsonPath)
try {
  $j = (Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8) | ConvertFrom-Json
  $dest = [string]$j.dest
  if (-not $dest) { throw 'No dest' }
  $arr = $j.paths
  if ($null -eq $arr) { throw 'Missing paths' }
  if ($arr -isnot [System.Array]) { $arr = @($arr) }
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
  foreach ($p in $arr) {
    $lp = [string]$p
    if (-not $lp) { continue }
    try {
      Copy-Item -LiteralPath $lp -Destination $dest -Force
      exit 0
    } catch { }
  }
  throw 'Copy-Item failed for all path variants'
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;

function readUtf8ViaDotnetFileReadWindows(absPathRaw, diag) {
  if (process.platform !== 'win32') return null;
  const norm = normalizePathForShellOpen(String(absPathRaw || '')).trim();
  if (!norm) return null;
  const absNorm = path.resolve(norm);
  const back = absNorm.replace(/\//g, '\\');
  const paths = [back];
  const longP = toWinLongRenamePath(absNorm);
  if (longP !== back) paths.push(longP);
  const tmpJson = path.join(os.tmpdir(), `tagbrowser-psread-${process.pid}-${Date.now()}.json`);
  const outFile = path.join(os.tmpdir(), `tagbrowser-psread-out-${process.pid}-${Date.now()}.txt`);
  try {
    fssync.writeFileSync(tmpJson, JSON.stringify({ paths, outFile }), 'utf8');
    const err = runPowershellScriptFileWithArg(
      PS1_READ_UTF8_PATH_VARIANTS,
      tmpJson,
      'PowerShell ReadAllText shortcut'
    );
    if (err) {
      if (diag) diag.psReadAllText = { ok: false, pathsTried: paths, error: err };
      return null;
    }
    const text = fssync.readFileSync(outFile, 'utf8');
    if (diag) {
      diag.psReadAllText = { ok: true, pathsTried: paths, utf8Bytes: Buffer.byteLength(text, 'utf8') };
    }
    return text;
  } catch (e) {
    if (diag) diag.psReadAllText = { ok: false, pathsTried: paths, error: String(e.message || e) };
    return null;
  } finally {
    try {
      fssync.unlinkSync(tmpJson);
    } catch (_) {}
    try {
      fssync.unlinkSync(outFile);
    } catch (_) {}
  }
}

/** Try copy shortcut to TEMP then read — hydrates some streamed Drive .gdoc paths Node cannot read in place. */
async function readUtf8ViaHydrateCopyToTempWindows(absPathRaw, diag) {
  if (process.platform !== 'win32') return null;
  const norm = normalizePathForShellOpen(String(absPathRaw || '')).trim();
  if (!norm) return null;
  const absNorm = path.resolve(norm);
  const ext = path.extname(absNorm) || '.gdoc';
  const tmp = path.join(os.tmpdir(), `tagfox-hydrate-${process.pid}-${Date.now()}${ext}`);
  const back = absNorm.replace(/\//g, '\\');
  const paths = [back];
  const longP = toWinLongRenamePath(absNorm);
  if (longP !== back) paths.push(longP);

  const h = { pathsTried: paths, nodeCopyFile: null, psCopyItem: null, readTemp: null };
  if (diag) diag.hydrateCopy = h;

  try {
    try {
      await fs.copyFile(absNorm, tmp);
      h.nodeCopyFile = { ok: true };
    } catch (e) {
      h.nodeCopyFile = { ok: false, code: e.code || null, message: String(e.message || e) };
      const tmpJson = path.join(os.tmpdir(), `tagfox-hydrate-${process.pid}-${Date.now()}.json`);
      try {
        fssync.writeFileSync(tmpJson, JSON.stringify({ paths, dest: tmp }), 'utf8');
        const err = runPowershellScriptFileWithArg(PS1_COPY_PATH_VARIANTS, tmpJson, 'PowerShell Copy-Item hydrate');
        if (err) {
          h.psCopyItem = { ok: false, error: err };
          return null;
        }
        h.psCopyItem = { ok: true };
      } finally {
        try {
          fssync.unlinkSync(tmpJson);
        } catch (_) {}
      }
    }

    let raw;
    try {
      raw = await fs.readFile(tmp, 'utf8');
      h.readTemp = { ok: true, utf8Bytes: Buffer.byteLength(raw, 'utf8') };
    } catch (e) {
      h.readTemp = { ok: false, code: e.code || null, message: String(e.message || e) };
      return null;
    }
    return raw;
  } finally {
    try {
      await fs.unlink(tmp);
    } catch (_) {}
  }
}

/** Serializable fs.Stats fields for shortcut diagnostics (streamed Drive / reparse quirks). */
function statToJson(st) {
  if (!st) return null;
  return {
    isFile: st.isFile(),
    isDirectory: st.isDirectory(),
    isSymbolicLink: typeof st.isSymbolicLink === 'function' ? st.isSymbolicLink() : false,
    size: st.size,
    mtimeMs: st.mtimeMs,
  };
}

/**
 * UTF-8 body of a Drive Workspace pointer: normal file, or folder-style shortcut (shared / .shortcut-targets-by-id).
 * Some mounts stat as file but readFile throws EISDIR — same recovery as explicit directory.
 * Always fills `diag` for IPC / console when shortcuts are not fully on disk (streamed).
 */
async function readGoogleWorkspaceShortcutText(fullPathRaw) {
  const hints = [
    'Streamed cloud files may have no real bytes until Explorer (or the sync client) hydrates them - Node can see a name but read fails or size stays 0.',
    'If this path is under `.shortcut-targets-by-id`, Drive often uses placeholders; try Available offline, open the file once in your browser, or mirror the shared drive.',
    'Row Open / context Open still runs shell.openPath when JSON cannot be read - Windows may open the live doc in your browser even though this app cannot load the in-app Google window.',
  ];
  const diag = {
    path: '',
    platform: process.platform,
    hints,
    lstat: null,
    stat: null,
    readFile: null,
    readdir: null,
    children: [],
    source: null,
    outcome: 'init',
  };

  const fullPath = normalizePathForShellOpen(fullPathRaw);
  diag.path = fullPath;
  // #region agent log
  const __gws = (globalThis.__tagfoxDbgGwsRead = (globalThis.__tagfoxDbgGwsRead || 0) + 1);
  if (__gws <= 20 && /\.gdoc$/i.test(fullPath)) {
    fetch('http://127.0.0.1:7460/ingest/0dfbb0a0-7bdd-458e-8476-39dae77fc97d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0677d7' },
      body: JSON.stringify({
        sessionId: '0677d7',
        location: 'main.js:readGoogleWorkspaceShortcutText',
        message: 'shortcut read enter',
        data: {
          hypothesisId: 'H3',
          n: __gws,
          pathSample: fullPath.length > 240 ? fullPath.slice(0, 240) + '…' : fullPath,
        },
        timestamp: Date.now(),
        runId: 'pre',
      }),
    }).catch(() => {});
  }
  // #endregion
  if (!fullPath) {
    diag.outcome = 'empty_path';
    return { ok: false, error: 'Empty path.', diag };
  }

  const searchU = googleDriveSearchUrlForPath(fullPath);
  if (searchU) diag.driveSearchUrl = searchU;
  const foldU = driveFolderUrlFromShortcutTargetsPath(fullPath);
  if (foldU) {
    diag.driveFolderId = foldU.driveFolderId;
    diag.driveFolderUrl = foldU.driveFolderUrl;
  }

  try {
    diag.lstat = statToJson(await fs.lstat(fullPath));
  } catch (e) {
    diag.lstat = { error: String(e.message || e), code: e.code || null };
  }

  let st;
  try {
    st = await fs.stat(fullPath);
    diag.stat = statToJson(st);
  } catch (e) {
    diag.stat = { error: String(e.message || e), code: e.code || null };
    diag.outcome = 'stat_failed';
    if (e && e.code === 'ENOENT') {
      console.warn('[TagFox google-shortcut]', diag.outcome, diag);
      return { ok: false, error: 'File not found.', code: 'ENOENT', diag };
    }
    console.warn('[TagFox google-shortcut]', diag.outcome, diag);
    return { ok: false, error: String(e.message || e), diag };
  }

  const maxChildBytes = 65536;
  const maxChildRows = 40;
  const maxNamesList = 60;

  async function tryParseChildFiles(dir) {
    let names;
    try {
      names = await fs.readdir(dir);
    } catch (e) {
      diag.readdir = {
        ok: false,
        code: e.code || null,
        message: String(e.message || e),
        names: [],
      };
      return null;
    }
    diag.readdir = {
      ok: true,
      code: null,
      message: null,
      nameCount: names.length,
      namesSample: names.filter(Boolean).slice(0, maxNamesList),
      namesTruncated: names.length > maxNamesList,
    };
    const kids = names
      .filter((n) => n && n !== '.' && n !== '..')
      .map((n) => path.join(dir, n))
      .sort((a, b) =>
        path.basename(a).localeCompare(path.basename(b), undefined, { sensitivity: 'base', numeric: true })
      );
    let row = 0;
    for (const child of kids) {
      if (row >= maxChildRows) {
        diag.children.push({ name: path.basename(child), skipped: true, reason: 'maxChildRows' });
        continue;
      }
      row++;
      const rec = { name: path.basename(child) };
      let cst;
      try {
        cst = await fs.stat(child);
        rec.stat = statToJson(cst);
      } catch (e) {
        rec.statError = String(e.message || e);
        rec.statCode = e.code || null;
        diag.children.push(rec);
        continue;
      }
      if (!cst.isFile() || cst.size > maxChildBytes) {
        rec.skipRead = !cst.isFile() ? 'not_file' : 'too_large';
        diag.children.push(rec);
        continue;
      }
      try {
        const raw = await fs.readFile(child, 'utf8');
        rec.readOk = true;
        rec.readLength = raw.length;
        if (targetUrlFromGoogleDriveShortcut(fullPath, raw)) {
          rec.parseMatched = true;
          diag.children.push(rec);
          return raw;
        }
        rec.parseMatched = false;
        rec.snippet = String(raw || '').replace(/\s+/g, ' ').slice(0, 120);
      } catch (e) {
        rec.readOk = false;
        rec.readCode = e.code || null;
        rec.readMessage = String(e.message || e);
      }
      diag.children.push(rec);
    }
    return null;
  }

  if (st.isDirectory()) {
    diag.outcome = 'shortcut_is_directory';
    const raw = await tryParseChildFiles(fullPath);
    if (!raw) {
      diag.outcome = 'dir_no_parseable_child';
      console.warn('[TagFox google-shortcut]', diag.outcome, diag);
      return { ok: false, error: 'Could not read Google link from shortcut folder.', diag };
    }
    diag.source = 'dirChildren';
    diag.outcome = 'ok_dirChildren';
    return { ok: true, raw, diag };
  }

  if (!st.isFile()) {
    diag.outcome = 'not_file_or_directory';
    console.warn('[TagFox google-shortcut]', diag.outcome, diag);
    return { ok: false, error: 'Not a file', diag };
  }
  if (st.size > maxChildBytes) {
    diag.outcome = 'file_too_large';
    console.warn('[TagFox google-shortcut]', diag.outcome, diag);
    return { ok: false, error: 'Shortcut file unexpectedly large.', diag };
  }

  const virtualId = tryReadGoogleDriveVirtualFileIdWindowsSync(fullPath, diag);
  if (virtualId) {
    const raw = JSON.stringify({ doc_id: virtualId });
    diag.source = 'driveVirtualIdStream';
    diag.outcome = 'ok_virtualIdStream';
    return { ok: true, raw, diag };
  }

  diag.readFile = { attempted: fullPath, expectedSize: st.size };
  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    diag.readFile.ok = true;
    diag.readFile.bytesRead = Buffer.byteLength(raw, 'utf8');
    diag.source = 'file';
    diag.outcome = 'ok_file';
    return { ok: true, raw, diag };
  } catch (e) {
    diag.readFile.ok = false;
    diag.readFile.code = e.code || null;
    diag.readFile.message = String(e.message || e);
    if (e && e.code === 'EISDIR') {
      diag.outcome = 'readfile_eisdir_try_ps';
      const psText = readUtf8ViaDotnetFileReadWindows(fullPath, diag);
      if (psText) {
        const urlPs = targetUrlFromGoogleDriveShortcut(fullPath, psText);
        if (urlPs) {
          diag.source = 'psReadAllText';
          diag.outcome = 'ok_psReadAllText';
          return { ok: true, raw: psText, diag };
        }
        diag.psParseNote = 'ReadAllText returned bytes but no doc_id/url in JSON.';
      }
      diag.outcome = 'readfile_eisdir_try_hydrate_copy';
      const hydrated = await readUtf8ViaHydrateCopyToTempWindows(fullPath, diag);
      if (hydrated) {
        const urlH = targetUrlFromGoogleDriveShortcut(fullPath, hydrated);
        if (urlH) {
          diag.source = 'hydrateCopy';
          diag.outcome = 'ok_hydrateCopy';
          return { ok: true, raw: hydrated, diag };
        }
        diag.hydrateParseNote = 'Temp file read OK but JSON had no doc_id/url.';
      }
      diag.outcome = 'readfile_eisdir_try_children';
      const raw = await tryParseChildFiles(fullPath);
      if (raw) {
        diag.source = 'dirChildren_after_eisdir';
        diag.outcome = 'ok_dirChildren_after_eisdir';
        return { ok: true, raw, diag };
      }
      diag.outcome = 'eisdir_no_child_parse';
    } else if (e && e.code === 'ENOENT') {
      diag.outcome = 'readfile_enoent';
      console.warn('[TagFox google-shortcut]', diag.outcome, diag);
      return { ok: false, error: 'File not found.', code: 'ENOENT', diag };
    } else {
      diag.outcome = 'readfile_failed';
    }
    console.warn('[TagFox google-shortcut]', diag.outcome, diag);
    return { ok: false, error: String(e.message || e), diag };
  }
}

function isAllowedGoogleWorkspaceUrl(u) {
  try {
    const { protocol, hostname } = new URL(String(u || '').trim());
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    const h = hostname.toLowerCase();
    return h === 'docs.google.com' || h === 'drive.google.com';
  } catch {
    return false;
  }
}

/** URLs the user may type or paste in the child-window address bar (sign-in lives on accounts.google.com). */
function isAllowedGoogleWorkspaceAddressBarUrl(u) {
  try {
    const { protocol, hostname } = new URL(String(u || '').trim());
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    const h = hostname.toLowerCase();
    return (
      h === 'docs.google.com' ||
      h === 'drive.google.com' ||
      h === 'accounts.google.com' ||
      h === 'myaccount.google.com'
    );
  } catch {
    return false;
  }
}

const GOOGLE_WORKSPACE_TOOLBAR_PX = 40;
/** Child doc windows can otherwise be resized to a needle-thin strip — hard to hit title bar / taskbar restore. */
const GOOGLE_WORKSPACE_WINDOW_MIN_W = 820;
const GOOGLE_WORKSPACE_WINDOW_MIN_H = 420;

/** Google’s mini strip is often closed shadow / not in inspectable DOM — simulate the “restore” hit with synthetic mouse. */
async function googleWorkspaceTryRestoreSatellite(wc) {
  if (!wc || wc.isDestroyed()) return;
  const clickDom = `(function () {
    function rects(el) {
      try {
        return el.getBoundingClientRect();
      } catch (_) {
        return { width: 0, height: 0, left: 0, top: 0, bottom: 0 };
      }
    }
    function tryRoot(root) {
      const ih = root.defaultView ? root.defaultView.innerHeight : window.innerHeight;
      const divs = root.querySelectorAll('div, nav, section');
      for (let i = 0; i < divs.length; i++) {
        const d = divs[i];
        const r = rects(d);
        if (!r.width || !r.height) continue;
        if (r.bottom < ih - 2 || r.top > ih - 110) continue;
        if (r.left > 380) continue;
        if (r.width > 760) continue;
        const parts = d.querySelectorAll('button, [role="button"], [tabindex="0"]');
        const clickables = [];
        for (let j = 0; j < parts.length; j++) {
          const b = parts[j];
          const br = rects(b);
          if (br.width > 2 && br.height > 2) clickables.push(b);
        }
        if (clickables.length >= 2) {
          clickables[1].click();
          return true;
        }
      }
      return false;
    }
    function walk(doc) {
      if (tryRoot(doc)) return true;
      const all = doc.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const n = all[i];
        if (n.shadowRoot && walk(n.shadowRoot)) return true;
      }
      return false;
    }
    return walk(document);
  })();`;

  try {
    if ((await wc.executeJavaScript(clickDom, true)) === true) return;
  } catch (_) {}

  let h = 600;
  try {
    const dim = await wc.executeJavaScript(`({ h: window.innerHeight })`);
    if (dim && Number(dim.h) > 80) h = dim.h;
  } catch (_) {}

  const xs = [36, 48, 56, 64, 72, 84, 96];
  const ys = [h - 12, h - 18, h - 24, h - 30];
  for (const y of ys) {
    for (const x of xs) {
      const xi = Math.round(x);
      const yi = Math.round(y);
      try {
        wc.sendInputEvent({ type: 'mouseMove', x: xi, y: yi });
        wc.sendInputEvent({ type: 'mouseDown', x: xi, y: yi, button: 'left', clickCount: 1 });
        wc.sendInputEvent({ type: 'mouseUp', x: xi, y: yi, button: 'left', clickCount: 1 });
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 35));
    }
  }
}

function layoutGoogleWorkspaceBrowserViews(win) {
  if (!win || win.isDestroyed()) return;
  const tb = win.gwsToolbarBV;
  const cv = win.gwsContentBV;
  if (!tb || !cv) return;
  const [w, h] = win.getContentSize();
  const th = GOOGLE_WORKSPACE_TOOLBAR_PX;
  const innerH = Math.max(0, h - th);
  try {
    cv.setBounds({ x: 0, y: th, width: w, height: innerH });
    tb.setBounds({ x: 0, y: 0, width: w, height: th });
  } catch (_) {}
}

function syncGoogleWorkspaceToolbarFromContent(win) {
  if (!win || win.isDestroyed()) return;
  const wc = win.gwsContentWc;
  const tb = win.gwsToolbarWc;
  if (!wc || !tb || wc.isDestroyed() || tb.isDestroyed()) return;
  const u = wc.getURL();
  if (u && !u.startsWith('about:')) tb.send('gws-toolbar-set-url', u);
  tb.send('gws-toolbar-nav-state', {
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
  });
}

function attachGoogleWorkspaceContentNavigationSync(win, contentWc) {
  const tick = () => syncGoogleWorkspaceToolbarFromContent(win);
  contentWc.on('did-navigate', tick);
  contentWc.on('did-navigate-in-page', tick);
  contentWc.on('did-finish-load', tick);
}

let googleWorkspaceToolbarIpcRegistered = false;
function registerGoogleWorkspaceToolbarIpcOnce() {
  if (googleWorkspaceToolbarIpcRegistered) return;
  googleWorkspaceToolbarIpcRegistered = true;
  ipcMain.on('gws-toolbar-go', (event, urlRaw) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w.isDestroyed() || !w.gwsContentWc || w.gwsContentWc.isDestroyed()) return;
    const wc = w.gwsContentWc;
    if (!wc || wc.isDestroyed()) return;
    const u = String(urlRaw || '').trim();
    if (!isAllowedGoogleWorkspaceAddressBarUrl(u)) return;
    void wc.loadURL(u);
  });
  ipcMain.on('gws-toolbar-back', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w.isDestroyed() || !w.gwsContentWc || w.gwsContentWc.isDestroyed()) return;
    const wc = w.gwsContentWc;
    if (!wc || wc.isDestroyed()) return;
    if (wc.canGoBack()) wc.goBack();
  });
  ipcMain.on('gws-toolbar-forward', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w.isDestroyed() || !w.gwsContentWc || w.gwsContentWc.isDestroyed()) return;
    const wc = w.gwsContentWc;
    if (!wc || wc.isDestroyed()) return;
    if (wc.canGoForward()) wc.goForward();
  });
  ipcMain.on('gws-toolbar-reload', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w.isDestroyed() || !w.gwsContentWc || w.gwsContentWc.isDestroyed()) return;
    const wc = w.gwsContentWc;
    if (!wc || wc.isDestroyed()) return;
    wc.reload();
  });
  ipcMain.on('gws-toolbar-restore-satellite', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w.isDestroyed() || !w.gwsContentWc || w.gwsContentWc.isDestroyed()) return;
    void googleWorkspaceTryRestoreSatellite(w.gwsContentWc);
  });
}

function mountGoogleWorkspaceBrowserViews(win, targetUrlArg, useBounds) {
  const url = String(targetUrlArg || '').trim();
  const contentBV = new BrowserView({
    webPreferences: {
      partition: 'persist:tagfox-google-workspace',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const toolbarBV = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'google-workspace-toolbar-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.addBrowserView(contentBV);
  win.addBrowserView(toolbarBV);
  win.gwsContentBV = contentBV;
  win.gwsToolbarBV = toolbarBV;
  win.gwsContentWc = contentBV.webContents;
  win.gwsToolbarWc = toolbarBV.webContents;

  win.on('resize', () => layoutGoogleWorkspaceBrowserViews(win));

  attachPageZoomShortcuts(contentBV.webContents);
  attachGoogleWorkspaceContentNavigationSync(win, contentBV.webContents);

  const showFramed = () => {
    if (!win || win.isDestroyed()) return;
    layoutGoogleWorkspaceBrowserViews(win);
    syncGoogleWorkspaceToolbarFromContent(win);
    if (useBounds && useBounds.maximized) win.maximize();
    win.show();
  };

  toolbarBV.webContents.once('did-finish-load', showFramed);
  layoutGoogleWorkspaceBrowserViews(win);
  void toolbarBV.webContents.loadFile(path.join(__dirname, 'google-workspace-toolbar.html'));
  void contentBV.webContents.loadURL(url);
}

function openGoogleWorkspaceEditorWindow(parentWin, targetUrl) {
  registerGoogleWorkspaceToolbarIpcOnce();
  const url = String(targetUrl || '').trim();
  if (!isAllowedGoogleWorkspaceUrl(url)) return { ok: false, error: 'Not a Google Docs/Drive URL.' };
  const saved = loadGoogleWorkspaceBoundsFromDisk();
  const fallback = defaultGoogleWorkspaceWindowBounds();
  const use =
    saved && isGoogleWorkspaceBoundsUsable({ x: saved.x, y: saved.y, width: saved.width, height: saved.height })
      ? saved
      : fallback;
  const initW = Math.max(GOOGLE_WORKSPACE_WINDOW_MIN_W, use.width);
  const initH = Math.max(GOOGLE_WORKSPACE_WINDOW_MIN_H, use.height);
  const win = new BrowserWindow({
    parent: parentWin || undefined,
    x: use.x,
    y: use.y,
    width: initW,
    height: initH,
    show: false,
    backgroundColor: '#f1f3f4',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachGoogleWorkspaceWindowBoundsPersistence(win);
  win.setMinimumSize(GOOGLE_WORKSPACE_WINDOW_MIN_W, GOOGLE_WORKSPACE_WINDOW_MIN_H);
  win.setMenuBarVisibility(false);
  mountGoogleWorkspaceBrowserViews(win, url, use);
  return { ok: true };
}

/**
 * shell.openPath, but Google shortcuts open in the in-app workspace window when the stub is readable.
 * When Node/.NET cannot read streamed placeholders (EISDIR etc.), still call openPathWithFallback — ShellExecute
 * often opens the live doc in the browser even though fs.readFile/copyFile fails.
 */
async function openPathOrGoogleWorkspaceShortcut(wc, fullPathRaw) {
  const p = normalizePathForShellOpen(fullPathRaw);
  if (!p) return 'Empty path.';
  const ext = path.extname(p).toLowerCase();
  if (!['.gdoc', '.gsheet', '.gslides'].includes(ext)) {
    return openPathWithFallback(fullPathRaw);
  }

  const r = await readGoogleWorkspaceShortcutText(fullPathRaw);
  const diag = r && r.diag;

  if (r.ok) {
    const url = targetUrlFromGoogleDriveShortcut(p, r.raw);
    if (url) {
      const parent = BrowserWindow.fromWebContents(wc);
      const winR = openGoogleWorkspaceEditorWindow(parent, url);
      if (winR.ok) return null;
      if (winR && winR.error) return winR.error;
    }
    console.warn('[TagFox google-shortcut] parsed body but no url', diag);
  } else if (r.code === 'ENOENT') {
    return 'File not found.';
  }

  console.warn(
    '[TagFox google-shortcut] using shell.openPath fallback (in-app window needs readable shortcut JSON).',
    diag && diag.outcome
  );
  const shellErr = await openPathWithFallback(fullPathRaw);
  if (!shellErr) return null;
  console.warn('[TagFox google-shortcut] shell.openPath fallback failed', shellErr, diag && diag.outcome);
  return '';
}

ipcMain.handle('google-workspace-shortcut-url', async (_event, { fullPath }) => {
  const fp = path.normalize(String(fullPath || ''));
  if (!fp) return { ok: false, error: 'Missing path', diag: null };
  const ext = path.extname(fp).toLowerCase();
  if (!['.gdoc', '.gsheet', '.gslides'].includes(ext)) {
    return { ok: false, error: 'Not a Google Workspace shortcut.', diag: null };
  }
  const body = await readGoogleWorkspaceShortcutText(fp);
  if (!body.ok) {
    if (body.code === 'ENOENT') return { ok: false, error: 'File not found.', diag: body.diag || null };
    return { ok: false, error: body.error || 'Could not read shortcut.', diag: body.diag || null };
  }
  const url = targetUrlFromGoogleDriveShortcut(fp, body.raw);
  if (!url) {
    console.warn('[TagFox google-shortcut] IPC: no url from JSON', body.diag);
    return { ok: false, error: 'Could not read Google link from shortcut.', diag: body.diag || null };
  }
  return { ok: true, url, diag: body.diag || null };
});

ipcMain.handle('open-google-workspace-window', async (event, { url }) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  return openGoogleWorkspaceEditorWindow(parent, url);
});

ipcMain.handle('open-url-default-browser', async (_event, { url }) => {
  try {
    await openUrlInSystemDefaultBrowser(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('resolve-shell-shortcut', async (_event, { fullPath }) => resolveShellShortcutLnkWin(fullPath));

/**
 * Shell item menu: standard Electron pattern (Menu + shell + clipboard in main).
 * Full Explorer.context menu would need native IContextMenu bindings — not in core Electron.
 */
ipcMain.handle('show-item-actions-menu', async (event, { filePath, x, y, scopeFolder }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const fp = path.normalize(String(filePath || '').trim());
  if (!fp) return { ok: false, error: 'No path' };
  const scopeAvail = Boolean(String(scopeFolder || '').trim());
  const par = path.dirname(fp);
  const fpPlain = stripWinLongPath(fp);
  let isDir = false;
  try {
    const st = await fs.stat(fp);
    isDir = st.isDirectory();
  } catch {
    /* path missing on disk — still offer copy/open actions */
  }
  const terminalCwd = isDir ? fp : par;
  const baseName = path.basename(fp);
  const pathFwdSlashes = fpPlain.replace(/\\/g, '/');
  const shortcutExt = path.extname(fp).toLowerCase();
  const isGoogleShortcutFile = !isDir && ['.gdoc', '.gsheet', '.gslides'].includes(shortcutExt);
  let fileUrl = '';
  try {
    fileUrl = pathToFileURL(fpPlain).href;
  } catch {
    fileUrl = '';
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    /** One tall menu: disabled rows = section titles (Electron has no native section headers). */
    /** @type {Electron.MenuItemConstructorOptions[]} */
    const template = [{ label: 'Clipboard', enabled: false }];
    if (process.platform === 'win32') {
      template.push(
        {
          label: 'Copy',
          click: () => {
            const err = copyPathsForExplorerPaste([fp]);
            if (err) {
              event.sender.send('shell-action-error', err);
              done({ ok: false, action: 'copyExplorer', error: err });
              return;
            }
            done({ ok: true, action: 'copyExplorer' });
          },
        },
        {
          label: 'Cut',
          click: () => {
            const err = cutPathsForExplorerPaste([fp]);
            if (err) {
              event.sender.send('shell-action-error', err);
              done({ ok: false, action: 'cutExplorer', error: err });
              return;
            }
            done({ ok: true, action: 'cutExplorer' });
          },
        },
        {
          /* Creates .lnk beside item, then Cut on that .lnk (Explorer move when pasted — no spare .lnk left behind). */
          label: 'Copy as shortcut',
          click: () => {
            const cr = createExplorerShortcutLnkWin(fp);
            if (!cr.ok) {
              event.sender.send('shell-action-error', cr.error);
              done({ ok: false, action: 'copyAsShortcut', error: cr.error });
              return;
            }
            const err = cutPathsForExplorerPaste([cr.lnkPath]);
            if (err) {
              event.sender.send('shell-action-error', err);
              done({ ok: false, action: 'copyAsShortcut', error: err });
              return;
            }
            event.sender.send('paths-mutated');
            done({ ok: true, action: 'copyAsShortcut' });
          },
        },
        {
          label: 'Put shortcut on shelf',
          click: () => {
            void (async () => {
              const cr = createExplorerShortcutLnkWin(fp);
              if (!cr.ok) {
                event.sender.send('shell-action-error', cr.error);
                done({ ok: false, action: 'shelfShortcut', error: cr.error });
                return;
              }
              const mv = await movePathsToShelf([cr.lnkPath]);
              if (!mv.ok) {
                event.sender.send('shell-action-error', mv.error);
                done({ ok: false, action: 'shelfShortcut', error: mv.error });
                return;
              }
              event.sender.send('paths-mutated');
              done({ ok: true, action: 'shelfShortcut' });
            })();
          },
        }
      );
    }
    template.push(
      { label: 'Copy full path', click: () => { clipboard.writeText(fp); done({ ok: true, action: 'copyPath' }); } },
      { label: 'Copy parent folder path', click: () => { clipboard.writeText(par); done({ ok: true, action: 'copyParent' }); } },
      { label: 'Copy name only', click: () => { clipboard.writeText(baseName); done({ ok: true, action: 'copyName' }); } },
      { label: 'Copy path with forward slashes', click: () => { clipboard.writeText(pathFwdSlashes); done({ ok: true, action: 'copyFwd' }); } },
    );
    if (fileUrl) {
      template.push({
        label: 'Copy file URL (file://…)',
        click: () => {
          clipboard.writeText(fileUrl);
          done({ ok: true, action: 'copyFileUrl' });
        },
      });
    }
    template.push(
      { type: 'separator' },
      { label: 'Open and explore', enabled: false },
      {
        label: isGoogleShortcutFile ? 'Open in app window' : 'Open',
        click: () => {
          if (!isDir && path.extname(fp).toLowerCase() === '.lnk') {
            done({ ok: true, action: 'followShellShortcut', filePath: fp });
            return;
          }
          void openPathOrGoogleWorkspaceShortcut(event.sender, fp).then((err) => {
            if (err) event.sender.send('shell-action-error', err);
            done({ ok: true, action: 'open' });
          });
        },
      },
      { label: 'Reveal in File Explorer', click: () => { shell.showItemInFolder(fp); done({ ok: true, action: 'reveal' }); } },
    );
    if (process.platform === 'win32') {
      template.push(
        {
          label: 'Create shortcut',
          click: () => {
            const cr = createExplorerShortcutLnkWin(fp);
            if (!cr.ok) {
              event.sender.send('shell-action-error', cr.error);
              done({ ok: false, action: 'createShortcut', error: cr.error });
              return;
            }
            event.sender.send('paths-mutated');
            done({ ok: true, action: 'createShortcut' });
          },
        },
        {
          label: 'Properties',
          click: () => {
            const err = openShellPropertiesWin(fp);
            if (err) {
              event.sender.send('shell-action-error', err);
              done({ ok: false, action: 'properties', error: err });
              return;
            }
            done({ ok: true, action: 'properties' });
          },
        }
      );
    }
    template.push(
      { type: 'separator' },
      { label: 'Search', enabled: false },
      {
        label: 'Google Drive for filename…',
        click: () => {
          done({ ok: true, action: 'driveSearch' });
          const u = googleDriveSearchUrlForPath(fp);
          if (!u) {
            event.sender.send('shell-action-error', 'Could not build Google Drive search URL.');
            return;
          }
          void openUrlInSystemDefaultBrowser(u).catch((e) => {
            event.sender.send('shell-action-error', String(e.message || e));
          });
        },
      },
      { type: 'separator' },
      { label: 'Edit', enabled: false },
      { label: 'Rename…', click: () => done({ ok: true, action: 'rename' }) },
    );
    if (process.platform === 'win32') {
      template.push(
        { type: 'separator' },
        { label: 'Windows', enabled: false },
        {
          label: 'Open in Windows Terminal',
          click: () => {
            done({ ok: true, action: 'wt' });
            const c = spawn('wt.exe', ['-d', terminalCwd], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
            });
            c.on('error', () => event.sender.send('shell-action-error', 'Windows Terminal (wt.exe) not available.'));
            c.unref();
          },
        },
      );
      if (!isDir) {
        template.push({
          label: 'Edit with Notepad',
          click: () => {
            done({ ok: true, action: 'notepad' });
            const c = spawn('notepad.exe', [fp], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
            });
            c.on('error', (e) => event.sender.send('shell-action-error', String(e.message || e)));
            c.unref();
          },
        });
      }
    }
    template.push(
      { type: 'separator' },
      { label: 'Folder', enabled: false },
      {
        label: 'New folder in current folder…',
        enabled: scopeAvail,
        click: () => {
          done({ ok: true, action: 'newFolderInScope' });
        },
      },
      { type: 'separator' },
      { label: 'Delete', enabled: false },
      {
        label: 'Move to Recycle Bin',
        click: () => {
          done({ ok: true, action: 'trash' });
          void shell.trashItem(fp).then(
            () => event.sender.send('paths-mutated'),
            (e) => event.sender.send('shell-action-error', String(e.message || e))
          );
        },
      },
    );

    const menu = Menu.buildFromTemplate(template);
    menu.popup({
      window: win || undefined,
      x: Math.round(Number(x) || 0),
      y: Math.round(Number(y) || 0),
      callback: () => done({ ok: true, dismissed: true }),
    });
  });
});

ipcMain.handle('copy-explorer-paste', async (_event, paths) => {
  const list = Array.isArray(paths) ? paths : paths ? [paths] : [];
  const err = copyPathsForExplorerPaste(list);
  return err ? { ok: false, error: err } : { ok: true };
});

ipcMain.handle('cut-explorer-paste', async (_event, paths) => {
  const list = Array.isArray(paths) ? paths : paths ? [paths] : [];
  const err = cutPathsForExplorerPaste(list);
  return err ? { ok: false, error: err } : { ok: true };
});

ipcMain.handle('paste-clipboard-into-folder', async (event, { destFolder, rootPrefix, replaceExisting }) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Clipboard file paste is only supported on Windows.' };
  let sources;
  try {
    sources = readClipboardFilePathsWin();
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
  if (!sources.length) return { ok: false, error: 'No files or folders in clipboard.' };
  const r = await copySourcesIntoScopeFolder(sources, destFolder, rootPrefix, !!replaceExisting);
  if (r.ok) event.sender.send('paths-mutated');
  return r;
});

ipcMain.handle('trash-paths', async (event, paths) => {
  const list = Array.isArray(paths) ? paths : [];
  const errs = [];
  for (const raw of list) {
    const fp = path.normalize(String(raw || '').trim());
    if (!fp) continue;
    try {
      await shell.trashItem(fp);
    } catch (e) {
      errs.push(fp + ': ' + String(e.message || e));
    }
  }
  if (errs.length) return { ok: false, error: errs.join('; ') };
  event.sender.send('paths-mutated');
  return { ok: true };
});

/** True if folder segment sorts “tilde-prefixed” for flyouts: ASCII ~, fullwidth ～ (common on Drive/sync). */
function folderNameStartsWithTildeLike(name) {
  const c = String(name || '').codePointAt(0);
  return c === 0x7e || c === 0xff5e;
}

/**
 * Match path-sorted table (path string order: ~ after letters). localeCompare puts ~ first; send ~ / ～ names last
 * (renderer pathUnderTildeSegment is ASCII ~ only; main listing still orders ～ last here for consistency).
 */
function compareChildFolderDisplayName(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const za = folderNameStartsWithTildeLike(sa) ? 1 : 0;
  const zb = folderNameStartsWithTildeLike(sb) ? 1 : 0;
  if (za !== zb) return za - zb;
  return sa.localeCompare(sb, undefined, { sensitivity: 'base', numeric: true });
}

/** Subfolders only (breadcrumb sibling picker). */
ipcMain.handle('list-child-folders', async (_event, { parentPath }) => {
  let p = path.normalize(String(parentPath || '').trim());
  if (!p) return { ok: false, error: 'No folder', folders: [] };
  if (/^[a-zA-Z]:$/i.test(p)) p += '\\';
  let entries;
  try {
    entries = await fs.readdir(p, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: String(e.message || e), folders: [] };
  }
  const folders = [];
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const name = d.name;
    if (name === '.' || name === '..') continue;
    /* Breadcrumb flyouts: hide dotfolders (.git, etc.); allow Drive shortcut-id folders (both naming variants). */
    const nlow = name.toLowerCase();
    if (name.startsWith('.') && nlow !== '.shortcut-targets-by-id' && nlow !== '.shortcuts-by-id') continue;
    folders.push({ name, fullPath: path.join(p, name) });
  }
  folders.sort((a, b) => compareChildFolderDisplayName(a.name, b.name));
  return { ok: true, folders };
});

/**
 * Windows breadcrumb roots: `existsSync('X:\\')` often lies for Google Drive / cloud letter mounts;
 * `readdirSync` + `\\\\?\\` still see them (same pattern as rename long-path helpers elsewhere in this file).
 */
function win32DriveRootIfReady(letter) {
  const L = String(letter || '').toUpperCase();
  if (!/^[A-Z]$/.test(L)) return null;
  const ordinary = `${L}:\\`;
  const longRoot = `\\\\?\\${ordinary}`;
  try {
    if (fssync.existsSync(ordinary) || fssync.existsSync(longRoot)) return ordinary;
  } catch (_) {}
  try {
    fssync.readdirSync(ordinary);
    return ordinary;
  } catch (_) {}
  try {
    fssync.readdirSync(longRoot);
    return ordinary;
  } catch (_) {}
  return null;
}

/** Drive letters / volume mount points for breadcrumb (Windows: ready drives; macOS: / + /Volumes/*; else /). */
function listDriveRootsForPlatform() {
  if (process.platform === 'win32') {
    const roots = [];
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      const fp = win32DriveRootIfReady(letter);
      if (fp) roots.push({ label: letter + ':', fullPath: fp });
    }
    return { platform: 'win32', roots };
  }
  if (process.platform === 'darwin') {
    const roots = [{ label: '/', fullPath: '/' }];
    const vol = '/Volumes';
    try {
      const names = fssync.readdirSync(vol);
      for (const name of names) {
        if (!name || name === '.' || name === '..') continue;
        const full = path.join(vol, name);
        try {
          if (fssync.statSync(full).isDirectory()) roots.push({ label: name, fullPath: full });
        } catch (_) {}
      }
    } catch (_) {}
    roots.sort((a, b) => {
      if (a.fullPath === '/') return -1;
      if (b.fullPath === '/') return 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });
    });
    return { platform: 'darwin', roots };
  }
  return { platform: process.platform || 'linux', roots: [{ label: '/', fullPath: '/' }] };
}

ipcMain.handle('list-drive-roots', async () => {
  try {
    const { platform, roots } = listDriveRootsForPlatform();
    return { ok: true, platform, roots };
  } catch (e) {
    return { ok: false, error: String(e.message || e), platform: process.platform, roots: [] };
  }
});

/** One path segment for a new folder name (no separators / Windows-forbidden chars). */
function sanitizeFolderNameSegment(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t === '.' || t === '..') return '';
  if (t.length > 120) t = t.slice(0, 120);
  return t;
}

ipcMain.handle('create-empty-folder', async (event, { parentFolder, nameSegment, rootPrefix }) => {
  const parent = normalizeRenameOperand(String(parentFolder || '').trim());
  if (!parent) return { ok: false, error: 'No parent folder.' };
  if (!isPathUnderRoot(parent, rootPrefix)) {
    return { ok: false, error: 'Parent must stay under the configured root folder.' };
  }
  let st;
  try {
    st = await fs.stat(parent);
  } catch {
    return { ok: false, error: 'Parent folder does not exist or is not reachable.' };
  }
  if (!st.isDirectory()) return { ok: false, error: 'Parent is not a folder.' };
  const base = sanitizeFolderNameSegment(nameSegment);
  if (!base) return { ok: false, error: 'Invalid or empty folder name after sanitizing.' };
  const dest = normalizeRenameOperand(path.join(parent, base));
  if (!isPathUnderRoot(dest, rootPrefix)) {
    return { ok: false, error: 'New folder would be outside the configured root folder.' };
  }
  try {
    await fs.mkdir(dest, { recursive: false });
  } catch (e) {
    if (e && e.code === 'EEXIST') return { ok: false, error: 'Something with that name already exists.' };
    return { ok: false, error: String(e.message || e) };
  }
  event.sender.send('paths-mutated');
  return { ok: true, path: dest };
});

/** Native Explorer drag: startDrag is synchronous on Windows (blocks until drop) — renderer uses sendSync; keep for Alt+drag only so normal HTML5 DnD still runs. */
/** Renderer lost keyboard to OS/chrome after some button clicks — pull focus back into the page. */
ipcMain.on('tagbrowser-focus-web-contents', (event) => {
  event.sender.focus();
});

/** 1×1 PNG — Windows startDrag with empty icon often fails; use on all platforms. */
const START_DRAG_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
);

/** Trailing \\ trimmed for HDROP; sendSync needs returnValue. (existsSync dropped — cloud placeholders / index lag.) */
ipcMain.on('start-drag-files', (event, paths) => {
  try {
    const raw = Array.isArray(paths) ? paths : [];
    const list = raw
      .map((p) => normalizeRenameOperand(String(p || '').trim()))
      .filter((s) => s && path.isAbsolute(s));
    if (!list.length) {
      console.warn('start-drag-files: no absolute paths', raw);
      return;
    }
    /* Single-file API is more reliable on some Windows targets; `files` for multi. */
    const payload =
      list.length === 1
        ? { file: list[0], icon: START_DRAG_ICON }
        : { files: list, icon: START_DRAG_ICON };
    event.sender.startDrag(payload);
  } catch (e) {
    console.error('startDrag', e);
  } finally {
    event.returnValue = null;
  }
});

/** No trailing sep (except drive root C:\) — trailing \\ on folders can confuse fs.rename on Windows. */
function normalizeRenameOperand(p) {
  let s = path.normalize(String(p || '').trim());
  if (!s) return s;
  if (/[\\/]$/.test(s)) {
    const trimmed = s.replace(/[/\\]+$/, '');
    if (/^[a-zA-Z]:$/.test(trimmed)) s = trimmed + '\\';
    else s = trimmed || s;
  }
  return s;
}

/** Windows extended-length paths for rename (helps Drive/OneDrive and long paths). */
function toWinLongRenamePath(absNorm) {
  const s = absNorm.replace(/\//g, '\\');
  if (s.startsWith('\\\\?\\')) return s;
  if (s.startsWith('\\\\')) return '\\\\?\\UNC\\' + s.slice(2);
  return '\\\\?\\' + s;
}

/** True when a quick retry may succeed (locks, cloud sync — Drive often uses EPERM, not only EBUSY). */
function isRenameRetryableError(e) {
  if (!e) return false;
  if (e.code === 'EBUSY') return true;
  if (process.platform === 'win32' && (e.code === 'EPERM' || e.code === 'EACCES')) return true;
  return /EBUSY|resource busy|locked|EPERM/i.test(String(e.message || e));
}

async function delay(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function renameAttemptWithBusyRetry(from, to) {
  const max = 5;
  let lastErr;
  for (let i = 0; i < max; i++) {
    try {
      await fs.rename(from, to);
      return { ok: true, err: null };
    } catch (e) {
      lastErr = e;
      if (isRenameRetryableError(e) && i < max - 1) {
        await delay(120 + i * 180);
        continue;
      }
      break;
    }
  }
  return { ok: false, err: lastErr };
}

/**
 * Google Drive / OneDrive expose a filter driver where Node's fs.rename sometimes reports ok but the old
 * leaf stays visible to Everything (duplicate rows). Prefer the same rename stack Explorer uses first.
 */
function preferShellRenameFirstForPath(absPathRaw) {
  if (process.platform !== 'win32') return false;
  const s = String(absPathRaw || '')
    .replace(/\//g, '\\')
    .toLowerCase();
  if (!s) return false;
  if (s.includes('my drive')) return true;
  if (s.includes('googledrive')) return true;
  if (s.includes('\\onedrive\\')) return true;
  return false;
}

/** fs.rename with busy retries; Windows adds PowerShell + cmd + `\\?\` fallbacks for cloud / read-only / gdoc shortcuts. */
async function renameWithBusyRetry(fromRaw, toRaw) {
  const fromN = normalizeRenameOperand(fromRaw);
  const toN = normalizeRenameOperand(toRaw);

  if (preferShellRenameFirstForPath(fromN)) {
    const psCloud = renameSameDirViaPowershell(fromN, toN);
    if (!psCloud) return { ok: true };
  }

  let r = await renameAttemptWithBusyRetry(fromN, toN);
  if (r.ok) return { ok: true };

  const code = r.err && r.err.code;
  let psTail = '';
  // Drive / placeholders: Node rename often EPERM — try PS (clear RO + Move), then cmd ren, then \\?\ fs.rename.
  if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY')) {
    const psErr = renameSameDirViaPowershell(fromN, toN);
    if (!psErr) return { ok: true };
    psTail = ' PowerShell: ' + psErr;
    const cmdErr = renameSameDirViaCmdRen(fromN, toN);
    if (!cmdErr) return { ok: true };
    psTail += ' | cmd ren: ' + cmdErr;
    const a = toWinLongRenamePath(path.resolve(fromN));
    const b = toWinLongRenamePath(path.resolve(toN));
    if (a !== fromN || b !== toN) {
      const rLong = await renameAttemptWithBusyRetry(a, b);
      if (rLong.ok) return { ok: true };
      psTail += ' | long-path fs.rename: ' + String((rLong.err && rLong.err.message) || rLong.err || 'failed');
    }
  }

  // ENOENT: `\\?\` can fix missing/not-found on MAX_PATH (skip if already tried above for EPERM).
  const tryLong = process.platform === 'win32' && code === 'ENOENT';
  if (tryLong) {
    const a = toWinLongRenamePath(path.resolve(fromN));
    const b = toWinLongRenamePath(path.resolve(toN));
    if (a !== fromN || b !== toN) {
      r = await renameAttemptWithBusyRetry(a, b);
      if (r.ok) return { ok: true };
    }
  }

  let msg = String(r.err.message || r.err) + psTail;
  if (isRenameRetryableError(r.err)) {
    msg +=
      ' If it keeps failing: close Explorer windows in that folder, terminals with cwd there, and IDE workspace roots on that path; cloud drives often lock folders briefly.';
  }
  if (r.err && (r.err.code === 'EPERM' || r.err.code === 'EACCES')) {
    msg +=
      ' EPERM on Google Drive / OneDrive often means a sync client, Explorer, or another app still has the path open—even if the tray app looks idle. Try closing File Explorer windows on that folder, terminals whose cwd is there, and any IDE window rooted on that path; wait a few seconds and retry.';
    msg +=
      ' If the file is a Google shortcut (.gdoc / .gsheet / .gslides), local renames can still be blocked without Drive’s shell integration—rename the document title in drive.google.com, or delete/recreate the shortcut after renaming online.';
  } else if (r.err && r.err.code === 'ENOENT') {
    msg +=
      ' If the item is in Google Drive / OneDrive, wait for sync or open the folder offline; then run Search again so paths match disk.';
  }
  return { ok: false, error: msg };
}

// Rename file or folder on disk; both paths must be under rootPrefix when that is set.
ipcMain.handle('rename-path', async (_event, { fromPath, toPath, rootPrefix }) => {
  const from = normalizeRenameOperand(String(fromPath || ''));
  const to = normalizeRenameOperand(String(toPath || ''));
  if (!from || !to) return { ok: false, error: 'Missing path' };
  if (!isPathUnderRoot(from, rootPrefix) || !isPathUnderRoot(to, rootPrefix)) {
    return { ok: false, error: 'Path must stay under the configured root folder.' };
  }
  return renameWithBusyRetry(from, to);
});

ipcMain.handle('move-paths-into-folder', async (event, { sourcePaths, destFolder, rootPrefix, replaceExisting }) => {
  const r = await moveSourcesIntoFolder(sourcePaths, destFolder, rootPrefix, !!replaceExisting);
  if (r.ok) event.sender.send('paths-mutated');
  return r;
});

ipcMain.handle('copy-paths-into-folder', async (event, { sourcePaths, destFolder, rootPrefix, replaceExisting }) => {
  const r = await copySourcesIntoScopeFolder(sourcePaths, destFolder, rootPrefix, !!replaceExisting);
  if (r.ok) event.sender.send('paths-mutated');
  return r;
});

/** Move files into staging shelf (userData); bypasses scope root — used for “shortcut on shelf”. */
async function movePathsToShelf(sourcePaths) {
  const shelf = getShelfDirResolved();
  const list = normalizeSourcePathsList(sourcePaths);
  if (!list.length) return { ok: false, error: 'Nothing to move.' };
  let st;
  try {
    st = await fs.stat(shelf);
  } catch {
    return { ok: false, error: 'Shelf folder missing.' };
  }
  if (!st.isDirectory()) return { ok: false, error: 'Shelf is not a folder.' };
  for (const srcRaw of list) {
    const src = path.resolve(String(srcRaw || '').trim());
    try {
      const stS = await fs.stat(src);
      if (stS.isDirectory()) return { ok: false, error: 'Use files only for shelf shortcuts.' };
    } catch {
      return { ok: false, error: 'Source missing: ' + src };
    }
    const u = await uniqueDestPathInDir(shelf, path.basename(src));
    if (!u.ok) return u;
    const dest = u.destResolved;
    try {
      await fs.rename(src, dest);
    } catch (e) {
      if (e && e.code === 'EXDEV') {
        try {
          await fs.copyFile(src, dest);
          await fs.unlink(src);
        } catch (e2) {
          return { ok: false, error: String(e2.message || e2) };
        }
      } else {
        const r = await renameWithBusyRetry(src, dest);
        if (!r.ok) return { ok: false, error: r.error || 'Move to shelf failed.' };
      }
    }
  }
  return { ok: true };
}

/** Split display name for Explorer-like order: `base.ext` before `base (1).ext` (plain localeCompare puts space before `.`). */
function parseShelfFilenameStemCopyExt(name) {
  const s = String(name || '');
  let ext = '';
  let base = s;
  const dot = s.lastIndexOf('.');
  if (dot > 0) {
    ext = s.slice(dot);
    base = s.slice(0, dot);
  }
  const m = /^(.*) \((\d+)\)$/.exec(base);
  if (!m) return { stem: base, copy: 0, ext };
  return { stem: m[1], copy: parseInt(m[2], 10) || 0, ext };
}

function compareShelfEntryNames(a, b) {
  const na = parseShelfFilenameStemCopyExt(a);
  const nb = parseShelfFilenameStemCopyExt(b);
  const c = na.stem.localeCompare(nb.stem, undefined, { sensitivity: 'base', numeric: true });
  if (c !== 0) return c;
  if (na.copy !== nb.copy) return na.copy - nb.copy;
  return na.ext.localeCompare(nb.ext, undefined, { sensitivity: 'base', numeric: true });
}

ipcMain.handle('shelf-state', async () => {
  const dir = getShelfDirResolved();
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const entries = ents
      .map((e) => ({
        name: e.name,
        fullPath: path.join(dir, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => compareShelfEntryNames(a.name, b.name));
    return { ok: true, path: dir, entries };
  } catch (e) {
    return { ok: false, error: String(e.message || e), path: dir, entries: [] };
  }
});

ipcMain.handle('clear-shelf', async (event) => {
  const dir = getShelfDirResolved();
  try {
    const names = await fs.readdir(dir);
    for (const n of names) {
      await fs.rm(path.join(dir, n), { recursive: true, force: true });
    }
    event.sender.send('paths-mutated');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

// Read/write readme and markdown: no root check — results can sit outside “Limit to folder” (e.g. parent: scope); renames stay guarded.
ipcMain.handle('read-text-file', async (_event, { fullPath }) => {
  const fp = path.normalize(String(fullPath || ''));
  if (!fp) return { ok: false, error: 'Missing path' };
  try {
    const text = await fs.readFile(fp, 'utf8');
    return { ok: true, text };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, code: 'ENOENT', error: String(e.message || e) };
    return { ok: false, error: String(e.message || e) };
  }
});

/** Binary read for PDF / Office previews in the renderer (base64). */
ipcMain.handle('read-file-buffer', async (_event, { fullPath }) => {
  const fp = path.normalize(String(fullPath || ''));
  if (!fp) return { ok: false, error: 'Missing path' };
  // Office / PDF previews load the whole file into memory (base64 → renderer); big spreadsheets need headroom.
  const maxBytes = 100 * 1024 * 1024;
  try {
    const st = await fs.stat(fp);
    if (st.isDirectory()) return { ok: false, error: 'Not a file' };
    if (st.size > maxBytes) return { ok: false, error: 'File too large for preview (max 100 MB).' };
    const buf = await fs.readFile(fp);
    return { ok: true, base64: buf.toString('base64') };
  } catch (e) {
    const code = e && e.code;
    // Google Drive / My Drive: stat can EPERM on some paths while readFile still works.
    if (code === 'EPERM' || code === 'EACCES') {
      try {
        const buf = await fs.readFile(fp);
        if (buf.length > maxBytes) return { ok: false, error: 'File too large for preview (max 100 MB).' };
        return { ok: true, base64: buf.toString('base64') };
      } catch (e2) {
        return { ok: false, error: String(e2.message || e2) };
      }
    }
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('write-text-file', async (_event, { fullPath, text }) => {
  const fp = path.normalize(String(fullPath || ''));
  if (!fp) return { ok: false, error: 'Missing path' };
  try {
    await fs.writeFile(fp, String(text ?? ''), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

/** Folder Viewer: fixed “description” basenames, in order (case-insensitive on disk). */
const FOLDER_VIEWER_DOC_NAMES = [
  'readme.md',
  'readme.txt',
  'claude.md',
  'agents.md',
  'about.md',
  'about.txt',
  'context.md',
  'context.txt',
  'index.md',
  'index.txt',
];

ipcMain.handle('resolve-folder-viewer-doc', async (_event, { folderPath }) => {
  const dir = path.normalize(String(folderPath || '').trim().replace(/[/\\]+$/, ''));
  if (!dir) return { ok: false, error: 'Missing folder', fullPath: null };
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: String(e.message || e), fullPath: null };
  }
  const files = [];
  for (const d of entries) {
    if (d.isFile()) files.push(d.name);
  }
  const lower = (n) => String(n).toLowerCase();
  const pickCi = (want) => {
    const w = lower(want);
    const hit = files.find((f) => lower(f) === w);
    return hit ? path.join(dir, hit) : null;
  };
  let fullPath = null;
  for (const name of FOLDER_VIEWER_DOC_NAMES) {
    fullPath = pickCi(name);
    if (fullPath) break;
  }
  return { ok: true, fullPath };
});
