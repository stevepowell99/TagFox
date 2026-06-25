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

// Dev: reload renderer / restart main when project files change (no manual npm start).
if (!app.isPackaged) {
  // Windows + OneDrive (and some editors): native fs.watch often never fires — chokidar must poll.
  if (process.platform === 'win32') process.env.CHOKIDAR_USEPOLLING = 'true';
  try {
    require('electron-reloader')(module);
  } catch (_) {}
}

const { spawn, spawnSync, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const http = require('http');
const fs = require('fs').promises;
const fssync = require('fs');
const os = require('os');
const path = require('path');

/* Main-process perf probe: append to a temp log we can read after a repro, to localize freezes the
   renderer sees only as a slow IPC reply. Best-effort; never throws into a hot path. */
const MAIN_PERF_LOG = path.join(os.tmpdir(), 'tagfox-mainperf.log');
function mainPerfLog(line) {
  try {
    fssync.appendFileSync(MAIN_PERF_LOG, new Date().toISOString() + ' ' + line + '\n');
  } catch (_) {}
}
const { drive: createDriveClient } = require('@googleapis/drive');
const { OAuth2Client } = require('google-auth-library');
const MsgReader = require('@kenjiuno/msgreader').default;

// Populates globalThis.TagBrowserTags (same xk/xp/xx tag rules as the renderer).
require(path.join(__dirname, 'tags.js'));
const TagBrowserTags = globalThis.TagBrowserTags;

// Flatten MsgReader fields → plain-text preview for the props panel.
function msgFileDataToPreviewText(data) {
  if (!data) return { ok: false, error: 'No data' };
  if (data.dataType === null || data.error) {
    return { ok: false, error: String(data.error || 'Unsupported file type') };
  }
  const lines = [];
  if (data.subject) lines.push('Subject: ' + String(data.subject));
  const fromParts = [data.senderName, data.senderEmail || data.senderSmtpAddress].filter(Boolean);
  if (fromParts.length) lines.push('From: ' + fromParts.join(' '));
  if (Array.isArray(data.recipients) && data.recipients.length) {
    const names = data.recipients
      .map((r) => (r && (r.name || r.email || r.smtpAddress)) || '')
      .filter(Boolean)
      .slice(0, 16);
    if (names.length) lines.push('To: ' + names.join(', '));
  }
  const dt = data.clientSubmitTime || data.messageDeliveryTime;
  if (dt) lines.push('Date: ' + String(dt));
  lines.push('');
  let body = '';
  if (data.body && String(data.body).trim()) {
    body = String(data.body);
  } else if (data.bodyHtml && String(data.bodyHtml).trim()) {
    body = String(data.bodyHtml)
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  } else if (data.preview) {
    body = String(data.preview);
  }
  if (!body) body = '(no body text in message)';
  return { ok: true, text: lines.join('\n') + body };
}

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

/** Office files that Google Drive can open/convert in-browser. */
function isGoogleWorkspaceOfficeFilePath(fullPath) {
  const ext = path.extname(String(fullPath || '')).toLowerCase();
  return ext === '.docx' || ext === '.xlsx' || ext === '.pptx';
}

/** Best-effort Drive file id from local path (Windows Drive-for-desktop). */
function googleDriveFileIdForLocalPath(fullPath) {
  if (process.platform !== 'win32') return null;
  return tryReadGoogleDriveVirtualFileIdWindowsSync(fullPath, null);
}

/** Extract Google Drive file id from common Docs/Drive URL shapes. */
function googleDriveFileIdFromUrl(u) {
  try {
    const url = new URL(String(u || '').trim());
    const p = url.pathname || '';
    let m = /^\/document\/d\/([^/]+)/i.exec(p);
    if (m && m[1]) return decodeURIComponent(String(m[1]).trim());
    m = /^\/spreadsheets\/d\/([^/]+)/i.exec(p);
    if (m && m[1]) return decodeURIComponent(String(m[1]).trim());
    m = /^\/presentation\/d\/([^/]+)/i.exec(p);
    if (m && m[1]) return decodeURIComponent(String(m[1]).trim());
    m = /^\/file\/d\/([^/]+)/i.exec(p);
    if (m && m[1]) return decodeURIComponent(String(m[1]).trim());
    const qId = url.searchParams.get('id');
    if (qId) return decodeURIComponent(String(qId).trim());
  } catch (_) {}
  return null;
}

/** Best-effort file-id resolver for a local row path. */
async function resolveGoogleDriveFileIdForPath(fullPath) {
  const id = googleDriveFileIdForLocalPath(fullPath);
  if (id) return id;
  const ext = path.extname(String(fullPath || '')).toLowerCase();
  if (!['.gdoc', '.gsheet', '.gslides'].includes(ext)) return null;
  const body = await readGoogleWorkspaceShortcutText(fullPath);
  if (!body || !body.ok) return null;
  const u = targetUrlFromGoogleDriveShortcut(fullPath, body.raw);
  return googleDriveFileIdFromUrl(u);
}

/** Infer a folder id by taking any child item with id and asking Drive for that item's parent. */
async function inferGoogleDriveFolderIdFromChildItems(folderPath, drive) {
  let names = [];
  try {
    names = await fs.readdir(folderPath);
  } catch (_) {
    names = [];
  }
  if (!names.length) return { ok: false, reason: 'folder-empty-or-unreadable' };
  let sawChildId = false;
  for (const name of names.slice(0, 80)) {
    const childPath = path.join(folderPath, name);
    const childId = await resolveGoogleDriveFileIdForPath(childPath);
    if (!childId) continue;
    sawChildId = true;
    try {
      const rr = await drive.files.get({
        fileId: childId,
        fields: 'id,parents',
        supportsAllDrives: true,
      });
      const parents = (rr && rr.data && rr.data.parents) || [];
      const parentId = Array.isArray(parents) && parents.length ? String(parents[0] || '').trim() : '';
      if (parentId) return { ok: true, folderId: parentId, reason: 'child-parent-lookup' };
    } catch (_) {}
  }
  if (!sawChildId) return { ok: false, reason: 'folder-no-child-id-streams' };
  return { ok: false, reason: 'folder-child-parent-missing' };
}

/** Escape a literal for Drive API `q` (names use single-quoted strings). */
function escapeDriveQueryNameLiteral(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Non-trashed Drive files whose name equals this row’s basename (exact match). */
async function driveFilesListExactBasename(drive, filePath) {
  const base = path.basename(String(filePath || ''));
  if (!base) return null;
  const q = `name = '${escapeDriveQueryNameLiteral(base)}' and trashed = false`;
  try {
    const res = await drive.files.list({
      q,
      pageSize: 25,
      fields: 'files(id,parents)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return (res && res.data && res.data.files) || [];
  } catch (_) {
    return null;
  }
}

/** Non-trashed Drive file with this basename INSIDE a specific parent folder (scopes away same-name files elsewhere). */
async function driveFileIdInFolderByName(drive, folderId, filePath) {
  const base = path.basename(String(filePath || ''));
  if (!base || !folderId) return null;
  const q = `name = '${escapeDriveQueryNameLiteral(base)}' and '${escapeDriveQueryNameLiteral(folderId)}' in parents and trashed = false`;
  try {
    const res = await drive.files.list({
      q,
      pageSize: 10,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = (res && res.data && res.data.files) || [];
    if (files.length === 1 && files[0] && files[0].id) return String(files[0].id).trim();
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Robust Drive file id for a local mirror path, the same escalation as Open in Google Workspace but
 * collision-safe: the local :user.drive.id stream, else hunt the PARENT folder id via a sibling that does
 * carry an id and look this file up scoped to that folder, else a unique exact-name match across the Drive.
 */
async function resolveGoogleDriveFileIdRobust(fullPath) {
  const direct = await resolveGoogleDriveFileIdForPath(fullPath); // ADS id, or shortcut JSON for .gdoc/.gsheet/.gslides
  if (direct) return { ok: true, fileId: direct, reason: 'ads-or-shortcut' };
  let drive;
  try {
    drive = await getGoogleDriveMetadataClientSingleAccount();
  } catch (e) {
    return { ok: false, reason: 'no-drive-api', error: String((e && e.message) || e || '') };
  }
  const parentDir = path.dirname(String(fullPath || ''));
  const folder = await inferGoogleDriveFolderIdFromChildItems(parentDir, drive);
  if (folder && folder.ok && folder.folderId) {
    const id = await driveFileIdInFolderByName(drive, folder.folderId, fullPath);
    if (id) return { ok: true, fileId: id, reason: 'parent-scoped-name' };
  }
  const byName = await tryResolveDriveFileIdViaDriveNameSearch(drive, fullPath);
  if (byName && byName.ok && byName.fileId) return { ok: true, fileId: byName.fileId, reason: byName.reason };
  if (byName && byName.ok === false && byName.reason === 'drive-name-ambiguous') {
    return { ok: false, reason: 'drive-name-ambiguous' };
  }
  return { ok: false, reason: 'unresolved' };
}

/**
 * When local :user.drive.id is missing, find the file in Drive by exact name and use its parent folder.
 * Only succeeds if exactly one non-trashed file matches (duplicate names → ambiguous).
 */
async function tryResolveSingleDriveFileViaDriveNameSearch(drive, filePath) {
  const files = await driveFilesListExactBasename(drive, filePath);
  if (files === null) return null;
  if (files.length === 0) return null;
  if (files.length > 1) return { ok: false, reason: 'drive-name-ambiguous' };
  return { ok: true, file: files[0], reason: 'drive-file-name-unique-match' };
}

async function tryResolveFolderIdViaDriveNameSearch(drive, filePath) {
  const resolved = await tryResolveSingleDriveFileViaDriveNameSearch(drive, filePath);
  if (resolved === null) return null;
  if (!resolved.ok) return resolved;
  const parents = resolved.file.parents || [];
  const parentId = Array.isArray(parents) && parents.length ? String(parents[0] || '').trim() : '';
  if (!parentId) return null;
  return { ok: true, folderId: parentId, reason: resolved.reason };
}

/** Same name search, but return the file id (for Open in Workspace when ADS has no id). */
async function tryResolveDriveFileIdViaDriveNameSearch(drive, filePath) {
  const resolved = await tryResolveSingleDriveFileViaDriveNameSearch(drive, filePath);
  if (resolved === null) return null;
  if (!resolved.ok) return resolved;
  const id = resolved.file && resolved.file.id ? String(resolved.file.id).trim() : '';
  if (!id) return null;
  return { ok: true, fileId: id, reason: resolved.reason };
}

/** Build Docs/Sheets/Slides editor URL from a Drive file id + local extension. */
function googleWorkspaceEditorUrlFromDriveId(fullPath, id) {
  if (!id) return null;
  const ext = path.extname(String(fullPath || '')).toLowerCase();
  if (ext === '.docx') return `https://docs.google.com/document/d/${encodeURIComponent(id)}/edit`;
  if (ext === '.xlsx') return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
  if (ext === '.pptx') return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/edit`;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

/** Prefer direct Docs/Sheets/Slides editor URLs for Office files already in Drive. */
function googleWorkspaceEditorUrlForOfficePath(fullPath) {
  const id = googleDriveFileIdForLocalPath(fullPath);
  return googleWorkspaceEditorUrlFromDriveId(fullPath, id);
}

/** Summarize :user.drive.id probe for status line + search-debug (paths truncated). */
function compactDriveVirtualStreamDiag(stream) {
  if (!stream) return { state: 'no_probe' };
  if (stream.ok) return { state: 'ok', idLen: stream.idLen, via: stream.via };
  const attempts = stream.attempts || [];
  let anyLocalPlaceholder = false;
  let anyEnoent = false;
  for (const a of attempts) {
    if (a && a.note === 'empty_or_local_placeholder') anyLocalPlaceholder = true;
    const m = String((a && a.msg) || '');
    if (/ENOENT|no such file|cannot find/i.test(m)) anyEnoent = true;
  }
  const slim = attempts.slice(0, 8).map((a) => {
    const o = { m: a.label };
    if (a.note) o.note = a.note;
    if (a.code) o.code = a.code;
    if (a.adsPath) {
      const s = String(a.adsPath);
      o.adsTail = s.length > 100 ? '…' + s.slice(-100) : s;
    }
    if (a.msg) o.err = String(a.msg).slice(0, 140);
    if (a.psErr) o.psErr = String(a.psErr).slice(0, 400);
    return o;
  });
  return { state: 'fail', anyLocalPlaceholder, anyEnoent, attempts: slim };
}

/** Short user-facing hint when Office→Workspace URL cannot be built from local streams only. */
function gwsOfficeNoDriveIdUserMessage(fileDiag, parentDiag) {
  const parts = [];
  if (fileDiag.anyLocalPlaceholder) {
    parts.push('file `:user.drive.id` empty or still `local…` (Drive not materialized)');
  } else if (fileDiag.anyEnoent) {
    parts.push('no `:user.drive.id` alternate stream on file');
  } else if (fileDiag.state === 'fail') {
    parts.push('file stream had no valid id');
  } else {
    parts.push('file has no usable Drive id from local metadata');
  }
  if (parentDiag.state === 'ok') {
    parts.push('parent folder has an id; this command still needs the file id');
  } else if (parentDiag.anyLocalPlaceholder) {
    parts.push('parent folder id also placeholder');
  } else if (parentDiag.state === 'fail') {
    parts.push('parent folder has no id stream either');
  }
  return `Could not resolve Google Drive file ID. ${parts.join(' — ')} Try Open, or make the file available offline in Drive for Desktop. With Search debug on, see gws.office.noDriveId for :user.drive.id details.`;
}

/** Read metadata (parents, list) + create Google Docs in folders the user can access. */
const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
];
let googleDriveMetadataClientPromise = null;

function googleOAuthClientConfigPath() {
  return path.join(__dirname, 'google-oauth-client.json');
}

function googleOAuthTokenPath() {
  return path.join(app.getPath('userData'), 'tagfox-google-oauth-token.json');
}

/**
 * Accept either:
 * 1) { clientId, clientSecret, redirectUri }
 * 2) Google installed-app JSON: { installed: { client_id, client_secret, redirect_uris: [] } }
 */
function readGoogleOAuthClientConfigSync() {
  const p = googleOAuthClientConfigPath();
  if (!fssync.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fssync.readFileSync(p, 'utf8'));
    if (raw && raw.clientId && raw.clientSecret && raw.redirectUri) {
      return {
        clientId: String(raw.clientId).trim(),
        clientSecret: String(raw.clientSecret).trim(),
        redirectUri: String(raw.redirectUri).trim(),
      };
    }
    const i = raw && raw.installed;
    if (i && i.client_id && i.client_secret && Array.isArray(i.redirect_uris) && i.redirect_uris.length) {
      return {
        clientId: String(i.client_id).trim(),
        clientSecret: String(i.client_secret).trim(),
        redirectUri: String(i.redirect_uris[0] || '').trim(),
      };
    }
  } catch (_) {}
  return null;
}

function readGoogleOAuthTokenSync() {
  const p = googleOAuthTokenPath();
  if (!fssync.existsSync(p)) return null;
  try {
    return JSON.parse(fssync.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeGoogleOAuthTokenSync(token) {
  const p = googleOAuthTokenPath();
  const dir = path.dirname(p);
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });
  fssync.writeFileSync(p, JSON.stringify(token || {}, null, 2), 'utf8');
}

async function runGoogleOAuthDesktopFlowAndPersistToken(oauth2, redirectUri) {
  const ru = new URL(redirectUri);
  if (ru.protocol !== 'http:' && ru.protocol !== 'https:') throw new Error('Google redirectUri must be http(s).');
  const expectedPath = ru.pathname || '/';
  const state = `tagfox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_DRIVE_SCOPES,
    state,
  });
  // OAuth URLs are long and include many query params; openExternal is more reliable here.
  await shell.openExternal(authUrl);
  const result = await new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(val);
    };
    const server = http.createServer((req, res) => {
      try {
        const urlObj = new URL(req.url || '/', redirectUri);
        if (urlObj.pathname !== expectedPath) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const gotState = urlObj.searchParams.get('state') || '';
        const code = urlObj.searchParams.get('code') || '';
        const err = urlObj.searchParams.get('error') || '';
        if (err) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<h3>TagFox Google auth cancelled.</h3>You can close this tab.');
          server.close(() => finish(new Error(`Google auth error: ${err}`)));
          return;
        }
        if (!code || gotState !== state) {
          res.statusCode = 400;
          res.end('Invalid auth callback');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<h3>TagFox Google auth complete.</h3>You can close this tab and return to TagFox.');
        server.close(() => finish(null, { code }));
      } catch (e) {
        try {
          res.statusCode = 500;
          res.end('Callback parse failed');
        } catch (_) {}
      }
    });
    const host = ru.hostname || '127.0.0.1';
    const port = Number(ru.port || (ru.protocol === 'https:' ? 443 : 80));
    server.listen(port, host, () => {});
    server.on('error', (e) => finish(new Error(`Google auth callback server failed: ${String(e.message || e)}`)));
    setTimeout(() => {
      try {
        server.close(() => finish(new Error('Google auth timed out.')));
      } catch (_) {
        finish(new Error('Google auth timed out.'));
      }
    }, 180000);
  });
  const tr = await oauth2.getToken(result.code);
  if (!tr || !tr.tokens) throw new Error('Google token exchange failed.');
  oauth2.setCredentials(tr.tokens);
  writeGoogleOAuthTokenSync(tr.tokens);
}

async function getGoogleDriveMetadataClientSingleAccount() {
  if (googleDriveMetadataClientPromise) return googleDriveMetadataClientPromise;
  googleDriveMetadataClientPromise = (async () => {
    const cfg = readGoogleOAuthClientConfigSync();
    if (!cfg) {
      throw new Error(
        'Missing google-oauth-client.json. Add OAuth desktop credentials (client_id/client_secret/redirect_uri) at app root.'
      );
    }
    const oauth2 = new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
    const tok = readGoogleOAuthTokenSync();
    if (tok) oauth2.setCredentials(tok);
    let drive = createDriveClient({ version: 'v3', auth: oauth2 });
    try {
      await drive.about.get({ fields: 'user(displayName,emailAddress)' });
      return drive;
    } catch (e) {
      const code = e && (e.code || (e.response && e.response.status));
      if (code && Number(code) !== 401) throw e;
    }
    await runGoogleOAuthDesktopFlowAndPersistToken(oauth2, cfg.redirectUri);
    drive = createDriveClient({ version: 'v3', auth: oauth2 });
    await drive.about.get({ fields: 'user(displayName,emailAddress)' });
    return drive;
  })();
  try {
    return await googleDriveMetadataClientPromise;
  } catch (e) {
    googleDriveMetadataClientPromise = null;
    throw e;
  }
}

/** Create an empty Google Doc in Drive folder via API (needs drive.file scope). */
async function createGoogleDocumentInFolderViaDriveApi(folderId) {
  const drive = await getGoogleDriveMetadataClientSingleAccount();
  const res = await drive.files.create({
    requestBody: {
      name: 'Untitled document',
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  const id = res && res.data && res.data.id ? String(res.data.id).trim() : '';
  if (!id) throw new Error('Drive API did not return a new document id.');
  return { id, url: `https://docs.google.com/document/d/${encodeURIComponent(id)}/edit` };
}

/** Resolve Drive folder id for "create here" from local path in single-account mode. */
async function resolveGoogleDriveFolderIdForCreateHere(targetPath, targetIsDir) {
  const fromShortcutPath = driveFolderUrlFromShortcutTargetsPath(targetPath);
  if (fromShortcutPath && fromShortcutPath.driveFolderId) {
    return { ok: true, folderId: fromShortcutPath.driveFolderId, reason: 'shortcut-targets-by-id' };
  }
  const targetId = await resolveGoogleDriveFileIdForPath(targetPath);
  // Folder rows often have no ADS id stream even when children do; infer via first child id.
  if (targetIsDir) {
    if (targetId) return { ok: true, folderId: targetId, reason: 'folder-local-id' };
    const drive = await getGoogleDriveMetadataClientSingleAccount();
    return inferGoogleDriveFolderIdFromChildItems(targetPath, drive);
  }
  if (!targetId) {
    const drive = await getGoogleDriveMetadataClientSingleAccount();
    const parentDir = path.dirname(String(targetPath || ''));
    const inferred = await inferGoogleDriveFolderIdFromChildItems(parentDir, drive);
    if (inferred && inferred.ok && inferred.folderId) return inferred;
    const byName = await tryResolveFolderIdViaDriveNameSearch(drive, targetPath);
    if (byName && byName.ok && byName.folderId) return byName;
    if (byName && byName.ok === false && byName.reason === 'drive-name-ambiguous') {
      return { ok: false, reason: 'drive-name-ambiguous' };
    }
    return { ok: false, reason: 'file-no-local-id-or-shortcut-id' };
  }
  const drive = await getGoogleDriveMetadataClientSingleAccount();
  const r = await drive.files.get({ fileId: targetId, fields: 'id,parents', supportsAllDrives: true });
  const parents = (r && r.data && r.data.parents) || [];
  const parentId = Array.isArray(parents) && parents.length ? String(parents[0] || '').trim() : '';
  if (!parentId) return { ok: false, reason: 'file-parent-missing' };
  return { ok: true, folderId: parentId, reason: 'file-parent-lookup' };
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
 * Write ps1Body to a temp script, run `-File script [args...]`, capture output, delete script.
 * Returns { ok, status, stdout, stderr, error }. error is null on success, else a message string
 * (spawn failure, or stderr/stdout on non-zero exit). The single home for the PowerShell spawn pattern.
 */
function runPowershellScriptFile(ps1Body, args = [], failMsgPrefix = 'PowerShell script failed') {
  const psExe = windowsPowerShellExe();
  const tmpPs1 = path.join(os.tmpdir(), `tagbrowser-ps-${process.pid}-${Date.now()}.ps1`);
  try {
    fssync.writeFileSync(tmpPs1, ps1Body, 'utf8');
    const r = spawnSync(psExe, ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmpPs1, ...args], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (r.error) return { ok: false, status: null, stdout: '', stderr: '', error: String(r.error.message || r.error) };
    const stdout = String(r.stdout || '');
    const stderr = String(r.stderr || '');
    const ok = r.status === 0;
    const error = ok ? null : [stderr, stdout].filter(Boolean).join(' ').trim() || `${failMsgPrefix} (exit ${r.status}).`;
    return { ok, status: r.status, stdout, stderr, error };
  } catch (e) {
    return { ok: false, status: null, stdout: '', stderr: '', error: String(e.message || e) };
  } finally {
    try {
      fssync.unlinkSync(tmpPs1);
    } catch (_) {}
  }
}

/** Run a one-arg PowerShell script for its success/failure only: null on success, else an error string. */
function runPowershellScriptFileWithArg(ps1Body, argForScript, failMsgPrefix) {
  return runPowershellScriptFile(ps1Body, [argForScript], failMsgPrefix).error;
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

/** Explorer "Properties" dialog (shell verb). */
function openShellPropertiesWin(targetPathRaw) {
  const targetPath = path.normalize(String(targetPathRaw || '').trim());
  const psExe = windowsPowerShellExe();
  const diag = {
    method: 'powershell-shell-application-invokeverb',
    verb: 'properties',
    targetPath,
    psExe,
  };
  if (process.platform !== 'win32') return { ok: false, error: 'Only available on Windows.', ...diag };
  if (!targetPath) return { ok: false, error: 'No path.', ...diag };
  const r = spawnSync(
    psExe,
    [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '$ErrorActionPreference="Stop"; $p=$env:TAGFOX_PROP; $dir=[System.IO.Path]::GetDirectoryName($p); $leaf=[System.IO.Path]::GetFileName($p); $sh=New-Object -ComObject Shell.Application; $ns=$sh.NameSpace($dir); if (-not $ns) { throw "Shell namespace failed." }; $item=$ns.ParseName($leaf); if (-not $item) { throw "Shell item not found." }; $item.InvokeVerb("Properties")',
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, TAGFOX_PROP: targetPath },
    }
  );
  const stdout = String(r.stdout || '').trim();
  const stderr = String(r.stderr || '').trim();
  diag.status = typeof r.status === 'number' ? r.status : null;
  diag.signal = r.signal || null;
  diag.stdout = stdout;
  diag.stderr = stderr;
  diag.spawnError = r.error ? String(r.error.message || r.error) : '';
  if (r.status !== 0) {
    const msg = [stderr, stdout, diag.spawnError].filter(Boolean).join(' ').trim();
    return { ok: false, error: msg || 'Properties failed.', ...diag };
  }
  return { ok: true, error: '', ...diag };
}

/** Extract a .zip to a sibling folder (`name`, `name (2)`, ...). Windows only. */
function extractZipToSiblingFolderWin(zipPathRaw) {
  if (process.platform !== 'win32') return { ok: false, error: 'Only available on Windows.' };
  const zipPath = path.normalize(String(zipPathRaw || '').trim());
  if (!zipPath) return { ok: false, error: 'No path.' };
  if (path.extname(zipPath).toLowerCase() !== '.zip') return { ok: false, error: 'Not a .zip file.' };
  let st;
  try {
    st = fssync.statSync(zipPath);
  } catch {
    return { ok: false, error: 'Path not found.' };
  }
  if (!st.isFile()) return { ok: false, error: 'Not a file.' };
  const parent = path.dirname(zipPath);
  const stem = path.basename(zipPath, '.zip');
  let destDir = path.join(parent, stem || 'Extracted');
  for (let n = 2; fssync.existsSync(destDir); n++) {
    destDir = path.join(parent, `${stem || 'Extracted'} (${n})`);
  }
  const ps1 = `param([Parameter(Mandatory)][string]$JsonPath)
try {
  $raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
  $j = $raw | ConvertFrom-Json
  $zipPath = [string]$j.zipPath
  $destDir = [string]$j.destDir
  if (-not $zipPath -or -not $destDir) { throw 'Missing zipPath or destDir' }
  if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) { throw 'ZIP not found' }
  if (Test-Path -LiteralPath $destDir) { throw 'Destination already exists' }
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  Expand-Archive -LiteralPath $zipPath -DestinationPath $destDir -ErrorAction Stop
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;
  const tmpJson = path.join(os.tmpdir(), `tagfox-unzip-${process.pid}-${Date.now()}.json`);
  try {
    fssync.writeFileSync(tmpJson, JSON.stringify({ zipPath, destDir }), 'utf8');
    const err = runPowershellScriptFileWithArg(ps1, tmpJson, 'ZIP extract failed');
    if (err) return { ok: false, error: err };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally {
    try {
      fssync.unlinkSync(tmpJson);
    } catch (_) {}
  }
  return { ok: true, destDir };
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

/** After moving/copying a folder, children paths no longer exist — drop descendants when a parent is also selected (same geometry as recycle). */
function collapseNestedSourcePathsForBulkOp(sourcePaths) {
  const listRaw = normalizeSourcePathsList(sourcePaths);
  const collapsed = collapseNestedTrashPaths(listRaw);
  return collapsed.length ? collapsed : listRaw;
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
 * baseName must be a single segment (basename semantics). takenKeys: lowercase resolved paths
 * already claimed by earlier items in the same batch (planned but not yet on disk).
 */
async function uniqueDestPathInDir(destDir, baseName, takenKeys = null) {
  const baseSeg = path.basename(String(baseName || ''));
  if (!baseSeg || baseSeg === '.' || baseSeg === '..') {
    return { ok: false, error: 'Invalid paste name.' };
  }
  const { name: stem, ext } = path.parse(baseSeg);
  let n = 0;
  while (true) {
    const label = n === 0 ? baseSeg : `${stem} (${n})${ext}`;
    const destResolved = path.resolve(path.join(destDir, label));
    if (!takenKeys || !takenKeys.has(destResolved.toLowerCase())) {
      try {
        await fs.stat(destResolved);
      } catch (e) {
        if (e && e.code === 'ENOENT') return { ok: true, destResolved };
        return { ok: false, error: 'Destination check: ' + String(e.message || e) };
      }
    }
    n += 1;
    if (n > 10000) return { ok: false, error: 'Too many duplicate names.' };
  }
}

/**
 * Copy files/folders from disk into destDir (recursive); honors rootPrefix like rename-path.
 * conflictMode 'unique' (clipboard paste: name clash → "stem (1).ext") or 'prompt' (drag: clash →
 * { code: 'EEXIST' } so the renderer can offer replace; sources already in destDir are skipped).
 * All planning happens before any disk write, so an EEXIST retry with replaceExisting re-runs cleanly.
 */
async function copySourcesIntoScopeFolder(sourcePaths, destDirRaw, rootPrefix, replaceExisting = false, conflictMode = 'unique') {
  const v = await validateScopePasteDestination(destDirRaw, rootPrefix, {
    noDest: 'No destination folder.',
    destNotUnderRoot: 'Destination must stay under the configured root folder.',
    destMissing: 'Current folder does not exist or is not reachable.',
    destNotDir: 'Current folder path is not a folder.',
  });
  if (!v.ok) return v;
  const destDir = v.destDir;
  const destDirResolved = path.resolve(destDir);

  const list = collapseNestedSourcePathsForBulkOp(sourcePaths);
  if (!list.length) return { ok: false, error: 'Nothing to paste.' };

  const ops = [];
  const plannedDestKeys = new Set();
  for (const srcRaw of list) {
    const src = path.normalize(String(srcRaw || '').trim());
    try {
      await fs.stat(src);
    } catch {
      return { ok: false, error: 'Source missing: ' + src };
    }

    const base = path.basename(src);
    const srcResolved = path.resolve(src);
    if (conflictMode === 'prompt' && path.dirname(srcResolved).toLowerCase() === destDirResolved.toLowerCase()) {
      continue; // dropped into the folder it is already in: no-op, not a " (1)" duplicate
    }

    let destResolved;
    if (replaceExisting) {
      destResolved = path.resolve(path.join(destDir, base));
    } else if (conflictMode === 'prompt') {
      destResolved = path.resolve(path.join(destDir, base));
      let exists = plannedDestKeys.has(destResolved.toLowerCase());
      if (!exists) {
        try {
          await fs.stat(destResolved);
          exists = true;
        } catch (_) {}
      }
      if (exists) {
        return { ok: false, code: 'EEXIST', baseName: base, error: '"' + base + '" already exists in the destination folder.' };
      }
    } else {
      const u = await uniqueDestPathInDir(destDir, base, plannedDestKeys);
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

    plannedDestKeys.add(destResolved.toLowerCase());
    ops.push({ srcResolved, destResolved });
  }

  if (!ops.length) return { ok: true, noop: true };

  // Execute: keep going on per-item failures so one bad file does not strand a half-finished batch.
  const errs = [];
  const copied = [];
  for (const op of ops) {
    try {
      await fs.cp(op.srcResolved, op.destResolved, { recursive: true, force: !!replaceExisting });
      copied.push(op.destResolved);
    } catch (e) {
      errs.push(path.basename(op.srcResolved) + ': ' + String(e.message || e));
    }
  }
  if (errs.length) return { ok: false, error: errs.join('; '), partial: copied.length > 0, copied };
  return { ok: true, copied };
}

/**
 * Clipboard screenshot / copied image → PNG in scope folder (`Clipboard image.png`, then `(1)`, …).
 * `image` must be a non-empty NativeImage from clipboard.readImage().
 */
async function saveClipboardImagePngToScopeFolder(destDirRaw, rootPrefix, image, replaceExisting = false) {
  const v = await validateScopePasteDestination(destDirRaw, rootPrefix, {
    noDest: 'No destination folder.',
    destNotUnderRoot: 'Destination must stay under the configured root folder.',
    destMissing: 'Current folder does not exist or is not reachable.',
    destNotDir: 'Current folder path is not a folder.',
  });
  if (!v.ok) return v;
  const destDir = v.destDir;

  const baseName = 'Clipboard image.png';
  let destResolved;
  if (replaceExisting) {
    destResolved = path.resolve(path.join(destDir, baseName));
  } else {
    const u = await uniqueDestPathInDir(destDir, baseName);
    if (!u.ok) return u;
    destResolved = u.destResolved;
  }

  if (!isPathUnderRoot(destResolved, rootPrefix)) {
    return { ok: false, error: 'Paste would place files outside the configured root folder.' };
  }

  try {
    await fs.writeFile(destResolved, image.toPNG());
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
  return { ok: true };
}

/**
 * Move files/folders into destDir (rename); same scope / nesting rules as copySourcesIntoScopeFolder.
 * Sources already in destDir are skipped (a same-folder move is a no-op, never a " (1)" rename);
 * a name clash returns { code: 'EEXIST' } before anything moves, so the replace retry re-runs cleanly.
 */
async function moveSourcesIntoFolder(sourcePaths, destDirRaw, rootPrefix, replaceExisting = false) {
  const v = await validateScopePasteDestination(destDirRaw, rootPrefix, {
    noDest: 'No destination folder.',
    destNotUnderRoot: 'Destination must stay under the configured root folder.',
    destMissing: 'Destination folder does not exist or is not reachable.',
    destNotDir: 'Destination is not a folder.',
  });
  if (!v.ok) return v;
  const destDir = v.destDir;
  const destDirResolved = path.resolve(destDir);

  const list = collapseNestedSourcePathsForBulkOp(sourcePaths);
  if (!list.length) return { ok: false, error: 'Nothing to move.' };

  const ops = [];
  const plannedDestKeys = new Set();
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
    if (path.dirname(srcResolved).toLowerCase() === destDirResolved.toLowerCase()) continue;

    const destResolved = path.resolve(path.join(destDir, base));
    if (!replaceExisting) {
      let exists = plannedDestKeys.has(destResolved.toLowerCase());
      if (!exists) {
        try {
          await fs.stat(destResolved);
          exists = true;
        } catch (_) {}
      }
      if (exists) {
        return { ok: false, code: 'EEXIST', baseName: base, error: '"' + base + '" already exists in the destination folder.' };
      }
    }

    if (wouldNestDestInsideSrc(srcResolved, destResolved)) {
      return { ok: false, error: 'Cannot move a folder into itself or a subfolder of the selection.' };
    }

    if (!isPathUnderRoot(destResolved, rootPrefix)) {
      return { ok: false, error: 'Move would place items outside the configured root folder.' };
    }

    plannedDestKeys.add(destResolved.toLowerCase());
    ops.push({ srcResolved, destResolved });
  }

  if (!ops.length) return { ok: true, noop: true };

  // Execute: keep going on per-item failures so one bad file does not strand a half-finished batch.
  const errs = [];
  const moved = [];
  for (const op of ops) {
    if (replaceExisting) {
      try {
        await fs.rm(op.destResolved, { recursive: true, force: true });
      } catch (e) {
        errs.push(path.basename(op.srcResolved) + ': could not replace existing item: ' + String(e.message || e));
        continue;
      }
    }
    const r = await renameWithBusyRetry(op.srcResolved, op.destResolved);
    if (r.ok) moved.push({ from: op.srcResolved, to: op.destResolved });
    else errs.push(path.basename(op.srcResolved) + ': ' + String(r.error || 'Move failed'));
  }
  if (errs.length) return { ok: false, error: errs.join('; '), partial: moved.length > 0, moved };
  return { ok: true, moved };
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

/** Trailing slashes off, for Recycle bulk ancestor checks (files unchanged). */
function trashPathComparable(p) {
  const n = normalizePathForShellOpen(p);
  return n ? n.replace(/[/\\]+$/, '') : '';
}

/** Recycle: Explorer-style path + drive resolve — Electron trashItem rejects POSIX/`\\?\` mixes as “Failed to parse path”. */
function normalizePathForRecycleBin(p) {
  const n = normalizePathForShellOpen(p);
  if (!n) return '';
  if (process.platform === 'win32' && /^[a-zA-Z]:/.test(n)) return path.resolve(n);
  return n;
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
    // Quote URL for cmd/start so '&' in query strings is not treated as a command separator.
    const uQuotedForCmd = `"${u.replace(/"/g, '""')}"`;
    await new Promise((resolve, reject) => {
      const child = spawn(getCmdExe(), ['/d', '/c', 'start', '', uQuotedForCmd], {
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

/** Open Terminal in the target folder via the shell, so app aliases resolve. */
function openTerminalAtPath(targetPathRaw) {
  const targetPath = path.normalize(String(targetPathRaw || '').trim());
  const comSpec = getCmdExe();
  const args = ['/d', '/c', 'start', '', 'wt', '-d', targetPath];
  if (!targetPath) {
    return Promise.resolve({
      ok: false,
      error: 'No path.',
      method: 'cmd-start-wt',
      targetPath,
      comSpec,
      args,
    });
  }
  return new Promise((resolve) => {
    const diag = {
      ok: true,
      error: '',
      method: 'cmd-start-wt',
      targetPath,
      comSpec,
      args,
    };
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        diag.ok = false;
        diag.error = String(err);
      }
      resolve(diag);
    };
    const child = spawn(comSpec, args, {
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

/** Delete-from-Shelf: logical path under staging dir only (no realpath — avoids false “not on Shelf” for junctions / reparse points). */
function isStrictChildOfShelfStagingDir(absPathRaw) {
  try {
    const shelf = path.resolve(getShelfDirResolved());
    const f = path.resolve(String(absPathRaw || '').trim());
    if (!f || !shelf) return false;
    if (f.toLowerCase() === shelf.toLowerCase()) return false;
    const rel = path.relative(shelf, f);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
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

/** Undici/fetch often sets message to "fetch failed"; real errno is on error.cause (and sometimes AggregateError.errors). */
function everythingHttpErrorChain(err) {
  const parts = [];
  const visit = (e, depth) => {
    if (!e || depth > 12) return;
    if (Array.isArray(e.errors) && e.errors.length) {
      parts.push({
        layer: e.name || 'AggregateError',
        message: String(e.message || '').slice(0, 400),
        nestedErrors: e.errors.length,
      });
      for (const sub of e.errors) visit(sub, depth + 1);
      if (e.cause) visit(e.cause, depth + 1);
      return;
    }
    parts.push({
      layer: e.name || 'Error',
      message: String(e.message || e).slice(0, 600),
      code: e.code,
      errno: e.errno,
      syscall: e.syscall,
      address: e.address,
      port: e.port,
    });
    if (e.cause) visit(e.cause, depth + 1);
  };
  visit(err, 0);
  return parts;
}

function everythingHttpTargetFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    return {
      href: u.href.length > 2500 ? u.href.slice(0, 2500) + '…' : u.href,
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? '443' : '80'),
      pathname: u.pathname,
    };
  } catch (e) {
    return { href: String(urlString).slice(0, 800), parseError: String(e.message || e) };
  }
}

function everythingSearchFailureFromFetch(baseUrlSetting, requestUrl, err) {
  const target = everythingHttpTargetFromUrl(requestUrl);
  const chain = everythingHttpErrorChain(err);
  const codes = [...new Set(chain.map((p) => p.code).filter(Boolean))];
  const msg = String(err.message || err);
  const errorLine =
    codes.length > 0
      ? `${msg} [${codes.join(', ')}] · ${target.hostname}:${target.port}`
      : `${msg} · ${target.hostname}:${target.port}`;
  return {
    ok: false,
    error: errorLine,
    rows: [],
    debug: {
      everythingHttp: 'fetch',
      settingsBaseUrl: String(baseUrlSetting || '').trim().slice(0, 500),
      requestUrl: target.href,
      target,
      chain,
      node: process.version,
      electron: process.versions && process.versions.electron,
      platform: process.platform,
    },
  };
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

/** Full app restart: relaunch Electron so main/preload/renderer/CSS/JS all reload. */
function restartAppWithUiFeedback(wc, source) {
  if (!wc || wc.isDestroyed()) return;
  sendSearchDebugLine(wc, 'appRestart.apply', {
    via: source,
    urlBefore: wc.getURL(),
    webContentsId: typeof wc.id === 'number' ? wc.id : undefined,
  });
  wc.send('tagfox-app-restart-imminent', {
    source: source === 'menu' ? 'menu' : 'shortcut',
  });
  setTimeout(() => {
    app.relaunch();
    app.quit();
  }, 350);
}

/** View menu: do not put F5 on “Reload” — on Windows the accelerator is registered and steals F5 from the page (TagFox uses F5 = refresh search). */
function installApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const reloadWindow = (_item, focusedWindow) => {
    const w = focusedWindow || BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) w.webContents.reload();
  };
  const restartApp = (_item, focusedWindow) => {
    const w = focusedWindow || BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) restartAppWithUiFeedback(w.webContents, 'menu');
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
    /* No F5 accelerator: Windows always registers it and the renderer never gets F5 (refresh search). Use menu click for full reload(). */
    { label: 'Reload', click: reloadWindow },
    /* No role:forceReload — Ctrl+F5 restarts the whole app instead. */
    { label: 'Restart TagFox', accelerator: 'CmdOrCtrl+F5', click: restartApp },
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
 * Ctrl/Cmd +/-/0 zoom; plain F5 = refresh search (Chromium default F5 reloads the page — must preventDefault + IPC);
 * Ctrl/Cmd+F5 = full app restart so main/preload/renderer all reload.
 */
function attachPageZoomShortcuts(wc) {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    /* Plain F5: default is full window reload — we want same as in-app “refresh results”. */
    if (input.code === 'F5') {
      const mod = process.platform === 'darwin' ? input.meta : input.control;
      if (!mod && !input.alt) {
        event.preventDefault();
        sendSearchDebugLine(wc, 'searchRefresh.f5', {
          step: 'main',
          shift: !!input.shift,
          url: wc.getURL(),
          webContentsId: typeof wc.id === 'number' ? wc.id : undefined,
        });
        if (!wc.isDestroyed()) wc.send('tagfox-plain-f5-refresh');
        return;
      }
    }

    /* Search-debug: Ctrl+F5 restart only. */
    if (
      input.code === 'F5' &&
      ((process.platform === 'darwin' ? input.meta : input.control) || input.alt)
    ) {
      sendSearchDebugLine(wc, 'appRestart.beforeInput', {
        control: !!input.control,
        meta: !!input.meta,
        alt: !!input.alt,
        key: input.key,
        code: input.code,
        isAutoRepeat: !!input.isAutoRepeat,
      });
    }

    const mod = process.platform === 'darwin' ? input.meta : input.control;

    if (!mod || input.alt) {
      if (input.code === 'F5' && input.alt) {
        sendSearchDebugLine(wc, 'appRestart.skip', { reason: 'altKeyBlocksRestartPath' });
      }
      return;
    }

    const { code } = input;

    /* Same issue as zoom: Ctrl+F5 should restart the whole app even when the page has focus. */
    if (code === 'F5') {
      event.preventDefault();
      restartAppWithUiFeedback(wc, 'shortcut');
      return;
    }

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

const DEFAULT_GLOBAL_TOGGLE_ACCEL = 'Control+Alt+Space';
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
    // Test runs (CDP) set TAGFOX_TEST_HIDDEN so the window never flashes onscreen; a hidden window still
    // renders and drives through the #tagfoxtest hook. Normal runs maximize and show as usual.
    if (process.env.TAGFOX_TEST_HIDDEN === '1') return;
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

/** Shelf staging IPC — registered before first window loads (same lifecycle as search-scope handlers). */
function registerShelfIpc() {
  try {
    ipcMain.removeHandler('shelf-state');
  } catch (_) {}
  try {
    ipcMain.removeHandler('clear-shelf');
  } catch (_) {}
  try {
    ipcMain.removeHandler('remove-shelf-paths');
  } catch (_) {}
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
    let names;
    try {
      names = await fs.readdir(dir);
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
    const errs = [];
    let anyOk = false;
    for (const n of names) {
      try {
        await rmShelfTreeOrThrow(path.join(dir, n));
        anyOk = true;
      } catch (e) {
        errs.push(n + ': ' + String(e.message || e));
      }
    }
    if (anyOk) event.sender.send('paths-mutated');
    // Empty dir ⇒ success even if Node reported EPERM after PS/async cleanup removed the tree.
    try {
      names = await fs.readdir(dir);
    } catch (_) {
      return errs.length ? { ok: false, error: errs.join('; ') } : { ok: true };
    }
    if (!names.length) return { ok: true };
    return errs.length ? { ok: false, error: errs.join('; ') } : { ok: true };
  });
  ipcMain.handle('remove-shelf-paths', async (event, paths) => {
    const list = Array.isArray(paths) ? paths : [];
    const errs = [];
    let anyOk = false;
    for (const raw of list) {
      const fp = path.resolve(String(raw || '').trim());
      if (!fp) continue;
      if (!isStrictChildOfShelfStagingDir(fp)) {
        errs.push(fp + ': not on Shelf');
        continue;
      }
      try {
        await rmShelfTreeOrThrow(fp);
        anyOk = true;
      } catch (e) {
        errs.push(fp + ': ' + String(e.message || e));
      }
    }
    if (anyOk) event.sender.send('paths-mutated');
    if (!list.length) return { ok: false, error: 'Nothing to remove' };
    const allGone = list.every((raw) => {
      const fp = path.resolve(String(raw || '').trim());
      if (!fp) return true;
      if (!isStrictChildOfShelfStagingDir(fp)) return false;
      return !fssync.existsSync(fp);
    });
    if (allGone) return { ok: true };
    return errs.length ? { ok: false, error: errs.join('; ') } : { ok: true };
  });
}

/** Nested aggregate: stop adding files after this (non–mission-critical cap). */
const GLOBAL_VIEWER_AGGREGATE_MAX_FILES = 50;

/** Viewer docs: shared basename order for both single folder-doc pick and nested aggregate. */
const VIEWER_DOC_BASENAMES_DEFAULT = [
  '-readme.md',
  '-readme.txt',
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

/** Nested folder-doc aggregate — register with app ready (matches scope/shelf IPC lifecycle). */
function registerGlobalViewerDocsIpc() {
  try {
    ipcMain.removeHandler('collect-global-viewer-docs');
  } catch (_) {}
  ipcMain.handle('collect-global-viewer-docs', async (_event, { folderPath, basenames }) => {
    const root = path.normalize(String(folderPath || '').trim().replace(/[/\\]+$/, ''));
    if (!root) return { ok: false, error: 'Missing folder', sections: [] };

    const rawNames = Array.isArray(basenames) ? basenames : [];
    const nameList =
      rawNames.length > 0
        ? [...new Set(rawNames.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))]
        : VIEWER_DOC_BASENAMES_DEFAULT.slice();
    const rankMap = new Map(nameList.map((n, i) => [n, i]));

    const sections = [];
    const visited = new Set();
    let truncated = false;

    async function walk(dir, depth, isRoot) {
      if (sections.length >= GLOBAL_VIEWER_AGGREGATE_MAX_FILES) return;
      const key = pathKeyForGlobalViewerWalk(dir);
      if (!key || visited.has(key)) return;
      visited.add(key);

      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (e) {
        if (isRoot) throw e;
        return;
      }

      const files = [];
      const dirs = [];
      for (const d of entries) {
        const name = d.name;
        if (d.isDirectory()) dirs.push(name);
        else if (d.isFile()) {
          const pretty =
            TagBrowserTags && typeof TagBrowserTags.parseSegmentTags === 'function'
              ? String(TagBrowserTags.parseSegmentTags(name).pretty || '').toLowerCase()
              : String(name).toLowerCase();
          let rank = rankMap.get(pretty);
          // Any readme-named .md/.txt counts too (tag-tolerant), ranked after explicit basenames.
          if (rank === undefined && /readme/.test(pretty) && /\.(md|txt)$/.test(pretty)) {
            rank = nameList.length;
          }
          if (rank !== undefined) files.push({ name, rank });
        }
      }
      files.sort((a, b) => a.rank - b.rank);
      dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

      for (const { name: fname } of files) {
        if (sections.length >= GLOBAL_VIEWER_AGGREGATE_MAX_FILES) {
          truncated = true;
          break;
        }
        const fullPath = path.join(dir, fname);
        const relPath = path.relative(root, fullPath).replace(/\//g, '\\');
        let text;
        try {
          text = await fs.readFile(fullPath, 'utf8');
        } catch (err) {
          text = '/* read error: ' + String(err.message || err) + ' */';
        }
        sections.push({ fullPath, relPath, depth, baseName: fname, text });
      }

      if (sections.length >= GLOBAL_VIEWER_AGGREGATE_MAX_FILES) {
        truncated = true;
        return;
      }
      for (const dname of dirs) {
        if (sections.length >= GLOBAL_VIEWER_AGGREGATE_MAX_FILES) {
          truncated = true;
          break;
        }
        await walk(path.join(dir, dname), depth + 1, false);
      }
    }

    try {
      await walk(root, 0, true);
    } catch (e) {
      return { ok: false, error: String(e.message || e), sections: [] };
    }
    return { ok: true, sections, truncated };
  });
}

/* Two instances share userData; the second cannot read localStorage (leveldb lock) and starts with
   blank settings (default base URL, no favourites). Focus the existing window instead. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

app.whenReady().then(() => {
  /* Event-loop lag sampler: if the main loop stalls (sync work or a saturated threadpool), the renderer
     only sees IPC replies arrive late. Log stalls so we can tell a slow handler from a blocked loop. */
  try {
    const LAG_TICK = 250;
    let lagLast = Date.now();
    setInterval(() => {
      const now = Date.now();
      const drift = now - lagLast - LAG_TICK;
      lagLast = now;
      if (drift > 300) mainPerfLog('eventloop-lag ' + drift + 'ms');
    }, LAG_TICK).unref();
  } catch (_) {}
  installApplicationMenu();
  registerSearchScopeFolderIpc();
  registerShelfIpc();
  registerGlobalViewerDocsIpc();
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
  const settingsBase = String(baseUrl || '').trim();
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
    return everythingSearchFailureFromFetch(settingsBase, url, e);
  }
  if (!res.ok) {
    let bodyPreview = '';
    try {
      bodyPreview = (await res.text()).slice(0, 600);
    } catch (te) {
      bodyPreview = String(te.message || te);
    }
    return {
      ok: false,
      error: `HTTP ${res.status} ${res.statusText || ''}`.trim(),
      rows: [],
      debug: {
        everythingHttp: 'httpStatus',
        settingsBaseUrl: settingsBase.slice(0, 500),
        requestUrl: everythingHttpTargetFromUrl(url).href,
        target: everythingHttpTargetFromUrl(url),
        status: res.status,
        statusText: res.statusText,
        bodyPreview,
      },
    };
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (pe) {
    return {
      ok: false,
      error:
        'Response was not JSON — check base URL/port and that the Everything HTTP server is enabled.',
      rows: [],
      debug: {
        everythingHttp: 'jsonParse',
        settingsBaseUrl: settingsBase.slice(0, 500),
        requestUrl: everythingHttpTargetFromUrl(url).href,
        target: everythingHttpTargetFromUrl(url),
        bodyPreview: text.slice(0, 800),
        parseError: String(pe.message || pe),
      },
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

ipcMain.handle('open-terminal-at', async (event, cwdPath) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Open in Terminal: Windows only.' };
  const diag = await openTerminalAtPath(cwdPath);
  sendSearchDebugLine(event.sender, 'shell.terminal', { source: 'rowButton', ...diag });
  return diag;
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
  /** If JSON is malformed, still recover a Google URL substring (Drive desktop sometimes writes odd bytes). */
  function urlFromRegex(s) {
    const m =
      /https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+(?:\/[^\s"'<>]*)?/i.exec(s);
    return m ? m[0].split(/[\s"'<>]/)[0] : null;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return urlFromRegex(text);
  }
  if (!data || typeof data !== 'object') return urlFromRegex(text);
  const u = typeof data.url === 'string' ? data.url.trim() : '';
  if (u && /^https?:\/\//i.test(u)) return u;
  const id =
    (typeof data.doc_id === 'string' && data.doc_id.trim()) ||
    (typeof data.docId === 'string' && data.docId.trim()) ||
    (typeof data.id === 'string' && /^[a-zA-Z0-9_-]{10,}$/.test(data.id.trim()) && data.id.trim()) ||
    '';
  if (!id) return urlFromRegex(text);
  const ext = path.extname(String(fullPath || '')).toLowerCase();
  if (ext === '.gsheet') return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  if (ext === '.gslides') return `https://docs.google.com/presentation/d/${id}/edit`;
  return `https://docs.google.com/document/d/${id}/edit`;
}

/**
 * PowerShell Get-Content on `path:user.drive.id`. Uses -EncodedCommand (UTF-16LE base64) so long paths with spaces
 * are not truncated or mis-parsed by the Win32 command line (unlike -Command with a huge inline script).
 */
function tryReadAdsStreamPowerShellGetContentEncoded(psExe, adsPath) {
  const lit = String(adsPath).replace(/'/g, "''");
  const script = `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
try {
  $v = Get-Content -LiteralPath '${lit}' -Raw
  [Console]::Out.Write(([string]$v).Trim())
  exit 0
} catch {
  [Console]::Error.Write(($_.Exception.Message))
  exit 1
}`.trim();
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return execFileSync(psExe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4096,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  const psExe =
    process.env.SystemRoot && fssync.existsSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
  const attempts = [];
  for (const adsPath of candidates) {
    // GDrive mirrored paths: Node/cmd often ENOENT on `file:user.drive.id` even when the stream exists; PS Get-Content usually works.
    const readers = [
      {
        label: 'fs.readFileSync',
        run: () => fssync.readFileSync(adsPath, 'utf8'),
      },
      {
        label: 'cmd.type',
        run: () =>
          execFileSync(comspec, ['/d', '/s', '/c', 'type', adsPath], {
            encoding: 'utf8',
            windowsHide: true,
            maxBuffer: 4096,
            stdio: ['ignore', 'pipe', 'ignore'],
          }),
      },
      {
        label: 'powershell.GetContent',
        run: () => tryReadAdsStreamPowerShellGetContentEncoded(psExe, adsPath),
      },
    ];
    for (const { label, run } of readers) {
      try {
        const raw = run();
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
        const row = { label, adsPath, code: e.code || null, msg: emsg };
        const se = e && e.stderr;
        if (se) row.psErr = Buffer.isBuffer(se) ? se.toString('utf8').trim() : String(se).trim();
        attempts.push(row);
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

  // Prefer real shortcut JSON (url / doc_id) over :user.drive.id — the ADS stream can disagree and breaks docs.google.com/…/d/<id>/edit.
  diag.readFile = { attempted: fullPath, expectedSize: st.size };
  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    diag.readFile.ok = true;
    diag.readFile.bytesRead = Buffer.byteLength(raw, 'utf8');
    if (targetUrlFromGoogleDriveShortcut(fullPath, raw)) {
      diag.source = 'file';
      diag.outcome = 'ok_file';
      return { ok: true, raw, diag };
    }
    diag.fileParseNote = 'read ok but JSON did not yield url/doc_id';
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
      console.warn('[TagFox google-shortcut]', diag.outcome, diag);
      return { ok: false, error: String(e.message || e), diag };
    }
  }

  const virtualId = tryReadGoogleDriveVirtualFileIdWindowsSync(fullPath, diag);
  if (virtualId) {
    const raw = JSON.stringify({ doc_id: virtualId });
    diag.source = 'driveVirtualIdStream';
    diag.outcome = 'ok_virtualIdStream';
    return { ok: true, raw, diag };
  }

  console.warn('[TagFox google-shortcut]', 'shortcut_unresolved_after_file_and_virtual', diag);
  return { ok: false, error: 'Could not read Google link from shortcut.', diag };
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

/** Read-only sign-of-life: proves OAuth token works with Drive API (does not open browser or run consent). */
ipcMain.handle('google-drive-api-ping', async () => {
  const cfg = readGoogleOAuthClientConfigSync();
  if (!cfg) return { ok: false, skipped: true, reason: 'no_config' };
  const tok = readGoogleOAuthTokenSync();
  if (!tok || (!tok.access_token && !tok.refresh_token)) {
    return { ok: false, error: 'No saved OAuth token yet.' };
  }
  try {
    const oauth2 = new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
    oauth2.setCredentials(tok);
    const drive = createDriveClient({ version: 'v3', auth: oauth2 });
    const about = await drive.about.get({ fields: 'user(displayName,emailAddress)' });
    let sampleFileName = '';
    try {
      const list = await drive.files.list({
        pageSize: 1,
        fields: 'files(name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const f = list.data.files && list.data.files[0];
      if (f && f.name) sampleFileName = String(f.name);
    } catch (_) {}
    const u = about.data && about.data.user;
    return {
      ok: true,
      email: (u && u.emailAddress) || '',
      displayName: (u && u.displayName) || '',
      sampleFileName,
    };
  } catch (e) {
    const body = e && e.response && e.response.data;
    const msg =
      (body && (body.error_description || body.error?.message || body.error)) ||
      String(e.message || e);
    return { ok: false, error: typeof msg === 'string' ? msg : String(msg) };
  }
});

ipcMain.handle('resolve-shell-shortcut', async (_event, { fullPath }) => resolveShellShortcutLnkWin(fullPath));

/** Human-readable path relative to the user home (forward slashes); a harmless URL breadcrumb ignored by targets. */
function sanitisedPathFromUserRoot(fullPath) {
  const fp = String(fullPath || '').trim();
  if (!fp) return '';
  let rel;
  try {
    rel = path.relative(os.homedir(), fp);
  } catch (_) {
    rel = '';
  }
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    rel = fp.replace(/^[A-Za-z]:[\\/]+/, ''); // outside home: just drop the drive letter
  }
  return rel.replace(/\\/g, '/');
}

/** Robust Drive file id for a local mirrored path (ADS, else parent-scoped/global name lookup); deep-links the row into gmist. */
ipcMain.handle('resolve-google-drive-file-id', async (_event, { fullPath } = {}) => {
  try {
    const r = await resolveGoogleDriveFileIdRobust(String(fullPath || ''));
    return {
      ok: !!(r && r.ok && r.fileId),
      fileId: (r && r.fileId) || null,
      reason: r && r.reason,
      error: r && r.error,
      relPath: sanitisedPathFromUserRoot(fullPath),
    };
  } catch (e) {
    return { ok: false, fileId: null, error: String(e.message || e) };
  }
});

/**
 * Windows shell Recent: newest .lnk files in %AppData%\...\Recent, resolved to their targets in one PS run.
 * pathType is the PowerShell Test-Path filter: 'Container' for folders, 'Leaf' for files. label is for
 * error messages. Returns { ok, error, items } where items is [{ path, mtimeMs }] deduped by lowercased path.
 */
async function scanWindowsRecentLnkTargets(pathType, label) {
  const recentDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Recent');
  let names;
  try {
    names = await fs.readdir(recentDir);
  } catch (e) {
    return { ok: false, error: String(e.message || e), items: [] };
  }
  const lnks = names.filter((n) => n.toLowerCase().endsWith('.lnk'));
  const withStat = await Promise.all(
    lnks.map(async (n) => {
      const full = path.join(recentDir, n);
      try {
        const st = await fs.stat(full);
        return { full, mtimeMs: st.mtimeMs };
      } catch {
        return null;
      }
    })
  );
  const valid = withStat.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 28);
  if (!valid.length) return { ok: true, error: null, items: [] };
  const jsonIn = path.join(os.tmpdir(), `tagfox-winrecent-${pathType}-${process.pid}-${Date.now()}.json`);
  const ps1Body = `param([Parameter(Mandatory)][string]$JsonPath)
$ErrorActionPreference = 'Stop'
$raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
$j = $raw | ConvertFrom-Json
$items = $j.items
if (-not $items) { Write-Output '[]'; exit 0 }
if ($items -isnot [System.Array]) { $items = @($items) }
$sh = New-Object -ComObject WScript.Shell
$out = @()
foreach ($it in $items) {
  $f = [string]$it.full
  $mt = [double]$it.mtimeMs
  if (-not $f -or -not (Test-Path -LiteralPath $f)) { continue }
  try {
    $s = $sh.CreateShortcut($f)
    $t = [string]$s.TargetPath
    if ([string]::IsNullOrWhiteSpace($t)) { continue }
    $t = $t.Trim()
    if (Test-Path -LiteralPath $t -PathType ${pathType}) {
      $out += @{ path = $t; mtimeMs = $mt }
    }
  } catch {}
}
if ($out.Count -lt 1) { Write-Output '[]' } else { $out | ConvertTo-Json -Compress -Depth 4 }
`;
  try {
    await fs.writeFile(jsonIn, JSON.stringify({ items: valid }), 'utf8');
    const r = runPowershellScriptFile(ps1Body, [jsonIn], `Recent ${label} script failed`);
    if (!r.ok) return { ok: false, error: r.error, items: [] };
    let arr;
    try {
      arr = JSON.parse(r.stdout.trim());
    } catch {
      return { ok: false, error: `Invalid JSON from recent ${label} script`, items: [] };
    }
    if (!Array.isArray(arr)) {
      if (arr && typeof arr === 'object' && arr.path != null) arr = [arr];
      else arr = [];
    }
    const items = [];
    const seen = new Set();
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const p = path.normalize(String(row.path || '').trim());
      if (!p) continue;
      const low = p.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      const mtimeMs = typeof row.mtimeMs === 'number' ? row.mtimeMs : 0;
      items.push({ path: p, mtimeMs });
    }
    return { ok: true, error: null, items };
  } catch (e) {
    return { ok: false, error: String(e.message || e), items: [] };
  } finally {
    try {
      fssync.unlinkSync(jsonIn);
    } catch (_) {}
  }
}

ipcMain.handle('windows-recent-folders', async () => {
  if (process.platform !== 'win32') return { ok: true, folders: [] };
  const r = await scanWindowsRecentLnkTargets('Container', 'folders');
  return { ok: r.ok, error: r.error, folders: r.items };
});

ipcMain.handle('windows-recent-files', async () => {
  if (process.platform !== 'win32') return { ok: true, files: [] };
  const r = await scanWindowsRecentLnkTargets('Leaf', 'files');
  return { ok: r.ok, error: r.error, files: r.items };
});

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
  const canOpenInGoogleWorkspace = !isDir && isGoogleWorkspaceOfficeFilePath(fp);
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
    const template = [{ label: '--- CLIPBOARD ---', enabled: false }];
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
      { label: 'Copy full path (quoted)', click: () => { clipboard.writeText('"' + fp + '"'); done({ ok: true, action: 'copyPathQuoted' }); } },
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
      { label: '--- OPEN AND EXPLORE ---', enabled: false },
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
      {
        label: 'Open in Google Workspace',
        enabled: canOpenInGoogleWorkspace,
        click: () => {
          void (async () => {
            const dFile = {};
            let id = tryReadGoogleDriveVirtualFileIdWindowsSync(fp, dFile);
            let u = googleWorkspaceEditorUrlFromDriveId(fp, id);
            // Local :user.drive.id is often missing outside .shortcut-targets-by-id; resolve file id via Drive API (OAuth account).
            if (!u) {
              try {
                const drive = await getGoogleDriveMetadataClientSingleAccount();
                const byName = await tryResolveDriveFileIdViaDriveNameSearch(drive, fp);
                if (byName && byName.ok && byName.fileId) {
                  u = googleWorkspaceEditorUrlFromDriveId(fp, byName.fileId);
                } else if (byName && byName.ok === false && byName.reason === 'drive-name-ambiguous') {
                  event.sender.send(
                    'shell-action-error',
                    'Open in Google Workspace: several Drive files share this name; rename one or open from drive.google.com.'
                  );
                  done({ ok: false, action: 'openGoogleWorkspace', error: 'drive-name-ambiguous' });
                  return;
                }
              } catch (e) {
                const msg = String((e && e.message) || e || '');
                if (!/Missing google-oauth-client\.json/i.test(msg)) {
                  event.sender.send('shell-action-error', msg);
                  done({ ok: false, action: 'openGoogleWorkspace', error: msg });
                  return;
                }
              }
            }
            if (!u) {
              const dPar = {};
              tryReadGoogleDriveVirtualFileIdWindowsSync(path.dirname(fp), dPar);
              const fileDiag = compactDriveVirtualStreamDiag(dFile.driveVirtualIdStream);
              const parentDiag = compactDriveVirtualStreamDiag(dPar.driveVirtualIdStream);
              sendSearchDebugLine(event.sender, 'gws.office.noDriveId', {
                path: fp,
                file: fileDiag,
                parent: parentDiag,
              });
              let hint = gwsOfficeNoDriveIdUserMessage(fileDiag, parentDiag);
              if (!readGoogleOAuthClientConfigSync()) {
                hint += ' Add google-oauth-client.json and sign in once to open by file name when local Drive id is missing.';
              }
              event.sender.send('shell-action-error', hint);
              done({ ok: false, action: 'openGoogleWorkspace', error: 'Could not resolve Drive file ID.' });
              return;
            }
            const parent = BrowserWindow.fromWebContents(event.sender);
            const r = openGoogleWorkspaceEditorWindow(parent, u);
            if (!r.ok) {
              event.sender.send('shell-action-error', r.error || 'Could not open Google Workspace window.');
              done({ ok: false, action: 'openGoogleWorkspace', error: r.error || 'Open failed' });
              return;
            }
            done({ ok: true, action: 'openGoogleWorkspace' });
          })().catch((e) => {
            event.sender.send('shell-action-error', String((e && e.message) || e || 'Open in Google Workspace failed.'));
            done({ ok: false, action: 'openGoogleWorkspace', error: String(e && e.message) });
          });
        },
      },
      {
        label: 'Create new Google Doc here',
        enabled: true,
        click: () => {
          void (async () => {
            // For files, resolve parent folder via file id (Drive API). For folders, resolve folder id directly.
            const rr = await resolveGoogleDriveFolderIdForCreateHere(fp, isDir);
            if (!rr || !rr.ok || !rr.folderId) {
              const reason = rr && rr.reason ? ` (${rr.reason})` : '';
              event.sender.send('shell-action-error', `Could not resolve Google Drive folder ID from this path${reason}.`);
              done({ ok: false, action: 'createGoogleDocHere', error: 'Could not resolve Drive folder ID.' });
              return;
            }
            let u;
            try {
              const created = await createGoogleDocumentInFolderViaDriveApi(rr.folderId);
              u = created.url;
            } catch (apiErr) {
              const code = apiErr && (apiErr.code || (apiErr.response && apiErr.response.status));
              const hint =
                Number(code) === 403 || Number(code) === 401
                  ? ' Re-consent: delete tagfox-google-oauth-token.json in app userData, add drive.file scope in Cloud Console OAuth consent, sign in again.'
                  : '';
              event.sender.send(
                'shell-action-error',
                String((apiErr && apiErr.message) || apiErr || 'Drive API create failed.') + hint
              );
              done({ ok: false, action: 'createGoogleDocHere', error: String(apiErr.message || apiErr) });
              return;
            }
            const parent = BrowserWindow.fromWebContents(event.sender);
            const winR = openGoogleWorkspaceEditorWindow(parent, u);
            if (!winR.ok) {
              event.sender.send('shell-action-error', winR.error || 'Could not open Google Workspace window.');
              done({ ok: false, action: 'createGoogleDocHere', error: winR.error || 'Open failed' });
              return;
            }
            done({ ok: true, action: 'createGoogleDocHere' });
          })().catch((e) => {
            const msg = String((e && e.message) || e || 'Create Google Doc failed.');
            event.sender.send('shell-action-error', msg);
            done({ ok: false, action: 'createGoogleDocHere', error: msg });
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
            const diag = openShellPropertiesWin(fp);
            sendSearchDebugLine(event.sender, 'shell.properties', {
              source: 'contextMenu',
              ...diag,
            });
            if (!diag.ok) {
              event.sender.send('shell-action-error', diag.error);
              done({ ok: false, action: 'properties', error: diag.error });
              return;
            }
            done({ ok: true, action: 'properties' });
          },
        }
      );
      if (!isDir && path.extname(fp).toLowerCase() === '.zip') {
        template.push({
          label: 'Extract ZIP here',
          click: () => {
            const xr = extractZipToSiblingFolderWin(fp);
            if (!xr.ok) {
              event.sender.send('shell-action-error', xr.error);
              done({ ok: false, action: 'extractZipHere', error: xr.error });
              return;
            }
            event.sender.send('paths-mutated');
            done({ ok: true, action: 'extractZipHere', destDir: xr.destDir });
          },
        });
      }
    }
    template.push(
      { type: 'separator' },
      { label: '--- SEARCH ---', enabled: false },
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
      { label: '--- EDIT ---', enabled: false },
      { label: 'Edit tags…', click: () => done({ ok: true, action: 'editTags' }) },
      { label: 'Set as current folder', enabled: isDir, click: () => done({ ok: true, action: 'setCurrentFolder' }) },
      { label: 'Rename…', click: () => done({ ok: true, action: 'rename' }) },
      { label: 'Bulk rename', click: () => done({ ok: true, action: 'bulkRename' }) },
    );
    if (process.platform === 'win32') {
      template.push(
        { type: 'separator' },
        { label: '--- TOOLS ---', enabled: false },
        {
          label: 'Open in Terminal',
          click: () => {
            done({ ok: true, action: 'wt' });
            sendSearchDebugLine(event.sender, 'shell.terminal', {
              source: 'contextMenu',
              phase: 'launch',
              method: 'cmd-start-wt',
              targetPath: terminalCwd,
            });
            void openTerminalAtPath(terminalCwd).then((diag) => {
              sendSearchDebugLine(event.sender, 'shell.terminal', {
                source: 'contextMenu',
                phase: 'result',
                ...diag,
              });
              if (!diag.ok) event.sender.send('shell-action-error', String(diag.error || 'Open in Terminal failed.'));
            });
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
      { label: '--- FOLDER ---', enabled: false },
      {
        label: 'New folder in current folder…',
        enabled: scopeAvail,
        click: () => {
          done({ ok: true, action: 'newFolderInScope' });
        },
      },
      { type: 'separator' },
      { label: '--- DELETE ---', enabled: false },
      {
        label: 'Move to Recycle Bin',
        click: () => {
          done({ ok: true, action: 'trash' });
          void recycleOnePathNormalized(fp).then((r) => {
            const norm = normalizePathForRecycleBin(fp);
            sendSearchDebugLine(event.sender, 'recycle.batch', {
              source: 'contextMenu',
              requested: 1,
              collapsedCount: 1,
              paths: norm ? [norm] : [],
              truncated: false,
              ok: r.ok,
              err: r.ok ? '' : String(r.error || ''),
            });
            if (r.ok) event.sender.send('paths-mutated', { paths: norm ? [norm] : [], trashed: true });
            else event.sender.send('shell-action-error', String(r.error || 'Recycle failed'));
          });
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

/** Plain UTF-16 text (renderer debug log, etc.) — avoids navigator.clipboard failures in Electron. */
ipcMain.handle('clipboard-write-text', (_event, text) => {
  try {
    clipboard.writeText(String(text ?? ''));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
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
  if (sources.length) {
    const r = await copySourcesIntoScopeFolder(sources, destFolder, rootPrefix, !!replaceExisting);
    if (r.ok || r.partial) event.sender.send('paths-mutated', { paths: sources, destFolder, copied: r.copied || [] });
    return r;
  }
  const clipImg = clipboard.readImage();
  if (!clipImg.isEmpty()) {
    const r = await saveClipboardImagePngToScopeFolder(destFolder, rootPrefix, clipImg, !!replaceExisting);
    if (r.ok) event.sender.send('paths-mutated', { paths: [destFolder] });
    return r;
  }
  return { ok: false, error: 'No files, folders, or image in clipboard.' };
});

/* ========== Recycle Bin: IPC trash-paths, nested-path collapse, Drive PS (VB FileIO) ========== */

/** JSON `{ "path": "C:\\\\full" }` — VB FileIO SendToRecycleBin via C# Add-Type (PS cannot bind DeleteDirectory overloads reliably). */
/*
 * Batch recycle: JSON file holds an array of absolute paths. One spawn handles all of them.
 * Loads Microsoft.VisualBasic from the GAC (`Add-Type -AssemblyName`, about 2ms) instead of compiling C# at
 * runtime (`Add-Type -Language CSharp`, about 365ms per call); the old per-path compile dominated delete time.
 * Emits one compact JSON object per line: { path, ok, err }.
 */
const PS1_RECYCLE_TO_BIN = `param([Parameter(Mandatory)][string]$JsonPath)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName Microsoft.VisualBasic
  $raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
  $paths = $raw | ConvertFrom-Json
  if ($paths -isnot [System.Array]) { $paths = @($paths) }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
foreach ($p in $paths) {
  $ps = [string]$p
  try {
    if (-not (Test-Path -LiteralPath $ps)) { throw 'Path not found' }
    $item = Get-Item -LiteralPath $ps -Force
    if ($item.PSIsContainer) {
      /* .NET Framework exposes (path, UIOption, RecycleOption, UICancelOption); enum strings coerce. */
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($ps, 'OnlyErrorDialogs', 'SendToRecycleBin', 'DoNothing')
    } else {
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($ps, 'OnlyErrorDialogs', 'SendToRecycleBin')
    }
    Write-Output (ConvertTo-Json -Compress ([ordered]@{ path = $ps; ok = $true; err = '' }))
  } catch {
    Write-Output (ConvertTo-Json -Compress ([ordered]@{ path = $ps; ok = $false; err = [string]$_.Exception.Message }))
  }
}
exit 0`;

/** JSON `{ "path": "C:\\\\full" }` — clear RO then Remove-Item (Node fs.rm often EPERM on Windows shelf trees). */
const PS1_REMOVE_ITEM_RECURSE = `param([Parameter(Mandatory)][string]$JsonPath)
try {
  $raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
  $j = $raw | ConvertFrom-Json
  $p = [string]$j.path
  if (-not $p) { throw 'Missing path' }
  if (-not (Test-Path -LiteralPath $p)) { exit 0 }
  $item = Get-Item -LiteralPath $p -Force
  if ($item.Attributes -band [System.IO.FileAttributes]::ReadOnly) {
    $item.Attributes = $item.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
  }
  if ($item.PSIsContainer) {
    Get-ChildItem -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.Attributes -band [System.IO.FileAttributes]::ReadOnly) {
        $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
      }
    }
  }
  Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;

/** Only for paths already vetted (Shelf delete). Returns null on success. */
function removeItemRecurseViaPowershell(absPathRaw) {
  if (process.platform !== 'win32') return 'Not Windows.';
  const fp = path.resolve(String(absPathRaw || '').trim());
  if (!fp) return 'Missing path.';
  const tmpJson = path.join(os.tmpdir(), `tagbrowser-rmrecurse-${process.pid}-${Date.now()}.json`);
  try {
    fssync.writeFileSync(tmpJson, JSON.stringify({ path: fp }), 'utf8');
    return runPowershellScriptFileWithArg(PS1_REMOVE_ITEM_RECURSE, tmpJson, 'Remove-Item');
  } catch (e) {
    return String(e.message || e);
  } finally {
    try {
      fssync.unlinkSync(tmpJson);
    } catch (_) {}
  }
}

/**
 * Recycle many paths in ONE PowerShell spawn. Returns an array of { path, ok, err } aligned to the input
 * (normalized). A spawn-level failure (no JSON line for a path) is reported as a per-path error.
 */
function trashPathsViaPowershellRecycle(absPathsRaw) {
  const norm = (Array.isArray(absPathsRaw) ? absPathsRaw : [absPathsRaw])
    .map((p) => normalizePathForRecycleBin(String(p || '')))
    .filter(Boolean);
  if (!norm.length) return [];
  if (process.platform !== 'win32') return norm.map((p) => ({ path: p, ok: false, err: 'Not Windows.' }));
  const tmpJson = path.join(os.tmpdir(), `tagbrowser-recycle-${process.pid}-${Date.now()}.json`);
  try {
    fssync.writeFileSync(tmpJson, JSON.stringify(norm), 'utf8');
    /* Per-path JSON lines arrive on stdout even on a non-zero exit (partial failure), so read stdout
       regardless of r.ok; r.error is only the spawn-level fallback when a path has no result line. */
    const r = runPowershellScriptFile(PS1_RECYCLE_TO_BIN, [tmpJson], 'Recycle');
    const byPath = new Map();
    for (const line of r.stdout.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const o = JSON.parse(t);
        const k = normalizePathForRecycleBin(String(o.path || ''));
        if (k) byPath.set(k.toLowerCase(), o);
      } catch (_) {}
    }
    const spawnErr = (r.stderr || r.error || '').trim();
    return norm.map((p) => {
      const o = byPath.get(p.toLowerCase());
      if (o) return { path: p, ok: !!o.ok, err: o.ok ? '' : String(o.err || 'Recycle failed') };
      return { path: p, ok: false, err: spawnErr || 'Recycle failed (no result).' };
    });
  } catch (e) {
    const msg = String(e.message || e);
    return norm.map((p) => ({ path: p, ok: false, err: msg }));
  } finally {
    try {
      fssync.unlinkSync(tmpJson);
    } catch (_) {}
  }
}

/**
 * True if `childPath` is strictly inside folder `maybeAncestor`.
 * Uses path.relative (same idea as wouldNestDestInsideSrc) — avoids startsWith edge cases with spaces/parens segments.
 */
function winPathIsStrictDescendantOf(maybeAncestor, childPath) {
  const a = String(normalizePathForRecycleBin(maybeAncestor) || '').replace(/[/\\]+$/, '');
  const c = String(normalizePathForRecycleBin(childPath) || '').replace(/[/\\]+$/, '');
  if (!a || !c || a.toLowerCase() === c.toLowerCase()) return false;
  try {
    const rel = path.relative(a, c);
    if (!rel) return false;
    if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/** One Recycle on a folder covers its subtree — drop selected children when a parent is also selected. */
function collapseNestedTrashPaths(rawList) {
  const list = [];
  const seen = new Set();
  for (const raw of rawList || []) {
    const n = normalizePathForRecycleBin(raw);
    if (!n) continue;
    const kl = trashPathComparable(n).toLowerCase();
    if (seen.has(kl)) continue;
    seen.add(kl);
    list.push(n);
  }
  if (list.length <= 1) return list.filter(Boolean);
  const out = list.filter((p) => {
    const pk = trashPathComparable(p);
    for (const q of list) {
      if (trashPathComparable(q) === pk) continue;
      if (winPathIsStrictDescendantOf(q, p)) return false;
    }
    return true;
  });
  return out;
}

/** Search-debug log in renderer (no-op there when debug off). */
function sendSearchDebugLine(sender, eventName, data) {
  try {
    if (!sender || (typeof sender.isDestroyed === 'function' && sender.isDestroyed())) return;
    sender.send('search-debug-line', { event: String(eventName || ''), data: data || {} });
  } catch (_) {}
}

/** Single-path recycle (context menu). Native first, batched PowerShell fallback; see recycleListBatched. */
async function recycleOnePathNormalized(fpNorm) {
  const fp = normalizePathForRecycleBin(fpNorm);
  if (!fp) return { ok: false, error: 'Missing path.' };
  const { trashedPaths, errs } = await recycleListBatched([fp]);
  return trashedPaths.length ? { ok: true } : { ok: false, error: errs[0] || 'Recycle failed' };
}

/**
 * Recycle a whole list, native fast path first. Every path tries shell.trashItem (about 100-300ms, no
 * spawn). This works on mirror-mode Google Drive / OneDrive too (their files are real local NTFS), so the
 * cloud heuristic that forced rename through PowerShell does not apply to recycle. Only paths native trash
 * rejects fall back to ONE batched PowerShell spawn. shell.trashItem only ever recycles or throws, never
 * hard-deletes, so trying it first carries no data-loss risk. Returns { trashedPaths, errs }.
 */
async function recycleListBatched(list) {
  const trashedPaths = [];
  const errs = [];
  const psQueue = [];
  for (const raw of list) {
    const fp = normalizePathForRecycleBin(raw);
    if (!fp) continue;
    try {
      await shell.trashItem(fp);
      trashedPaths.push(fp);
    } catch (_) {
      // Native recycle rejected this path (odd path form, mapped/network volume): batched shell fallback.
      if (process.platform === 'win32') psQueue.push(fp);
      else errs.push(fp + ': Recycle failed');
    }
  }
  if (psQueue.length) {
    for (const res of trashPathsViaPowershellRecycle(psQueue)) {
      if (res.ok) trashedPaths.push(res.path);
      else errs.push(res.path + ': ' + String(res.err || 'Recycle failed'));
    }
  }
  return { trashedPaths, errs };
}

ipcMain.handle('trash-paths', async (event, payload) => {
  let raw;
  let debugSource = 'trashPaths';
  if (Array.isArray(payload)) raw = payload;
  else if (payload && typeof payload === 'object' && Array.isArray(payload.paths)) {
    raw = payload.paths;
    if (payload.debugSource) debugSource = String(payload.debugSource);
  } else raw = [];
  const requested = raw.length;
  const list = collapseNestedTrashPaths(raw);
  // Deepest first: if a parent+child both slip through, recycling the child avoids a bogus path on the next call.
  list.sort((a, b) => trashPathComparable(b).length - trashPathComparable(a).length);
  const { trashedPaths, errs } = await recycleListBatched(list);
  const ok = errs.length === 0;
  const cap = 8;
  const requestedSample = raw
    .slice(0, cap)
    .map((x) => normalizePathForRecycleBin(String(x || '')))
    .filter(Boolean);
  const recycleLog = {
    source: debugSource,
    requested,
    requestedSample,
    requestedTruncated: raw.length > cap,
    collapsedCount: list.length,
    paths: list.slice(0, cap),
    truncated: list.length > cap,
    ok,
    err: ok ? '' : errs.join('; '),
  };
  /* Context menu uses sendSearchDebugLine only; bulk/delete use recycleLog on invoke return (send can miss the log). */
  if (trashedPaths.length) event.sender.send('paths-mutated', { paths: trashedPaths, trashed: true });
  if (errs.length) return { ok: false, error: errs.join('; '), recycleLog };
  return { ok: true, recycleLog };
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
  const t0 = Date.now();
  let p = path.normalize(String(parentPath || '').trim());
  if (!p) return { ok: false, error: 'No folder', folders: [] };
  if (/^[a-zA-Z]:$/i.test(p)) p += '\\';
  let entries;
  const tRd = Date.now();
  try {
    entries = await fs.readdir(p, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: String(e.message || e), folders: [] };
  }
  const readdirMs = Date.now() - tRd;
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
  const serverMs = Date.now() - t0;
  if (serverMs > 1000) mainPerfLog('list-child-folders ' + serverMs + 'ms readdir=' + readdirMs + 'ms ' + p);
  return { ok: true, folders, serverMs, readdirMs };
});

/** Direct local listing for cloud browse fallback (immediate children only). */
ipcMain.handle('list-folder-entries', async (_event, { parentPath }) => {
  let p = path.normalize(String(parentPath || '').trim());
  if (!p) return { ok: false, error: 'No folder', entries: [] };
  if (/^[a-zA-Z]:$/i.test(p)) p += '\\';
  let entries;
  try {
    entries = await fs.readdir(p, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: String(e.message || e), entries: [] };
  }
  const out = [];
  for (const d of entries) {
    const name = String((d && d.name) || '');
    if (!name || name === '.' || name === '..') continue;
    if (d.isDirectory()) out.push({ name, type: 'folder', path: p });
    else if (d.isFile()) out.push({ name, type: 'file', path: p });
  }
  return { ok: true, entries: out };
});

/** Debug-only folder snapshot: local filesystem view for one scope path. */
ipcMain.handle('debug-folder-snapshot', async (_event, { folderPath }) => {
  let p = path.normalize(String(folderPath || '').trim());
  if (!p) return { ok: false, error: 'No folder' };
  if (/^[a-zA-Z]:$/i.test(p)) p += '\\';
  const out = {
    ok: true,
    fullPath: p,
    exists: false,
    isDirectory: false,
    isShortcutTargetsPath: /\\\.(shortcut-targets-by-id|shortcuts-by-id)(\\|$)/i.test(p),
    isSharedDrivesPath: /^[a-zA-Z]:\\Shared drives(?:\\|$)/i.test(p),
    childCount: 0,
    folderCount: 0,
    fileCount: 0,
    otherCount: 0,
    foldersSample: [],
    filesSample: [],
    otherSample: [],
  };
  try {
    const st = await fs.stat(p);
    out.exists = true;
    out.isDirectory = !!st.isDirectory();
  } catch (e) {
    return { ...out, ok: false, error: String(e.message || e) };
  }
  let entries;
  try {
    entries = await fs.readdir(p, { withFileTypes: true });
  } catch (e) {
    return { ...out, ok: false, error: String(e.message || e) };
  }
  out.childCount = entries.length;
  for (const d of entries) {
    const name = String((d && d.name) || '');
    if (d.isDirectory()) {
      out.folderCount++;
      if (out.foldersSample.length < 12) out.foldersSample.push(name);
    } else if (d.isFile()) {
      out.fileCount++;
      if (out.filesSample.length < 12) out.filesSample.push(name);
    } else {
      out.otherCount++;
      if (out.otherSample.length < 12) out.otherSample.push(name);
    }
  }
  return out;
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
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.focus();
  event.sender.focus();
});

/*
 * Stronger focus restore for modal inputs. Electron 33 on Windows: when the window is already
 * foreground, win.focus()/webContents.focus() are no-ops, so OS keyboard focus can stay stuck off
 * the page and a freshly shown modal field looks focused but ignores keys. A blur+focus cycle forces
 * Windows to re-route the keyboard, the programmatic form of the alt-tab away-and-back that unsticks
 * it manually. Used only on modal show (a discrete action), never on the per-click pointerdown path.
 */
ipcMain.on('tagbrowser-force-web-contents-focus', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (process.platform === 'win32' && win.isFocused()) win.blur();
  win.focus();
  event.sender.focus();
});

/** Preload had no F5 refresh callback (should not happen after init). */
ipcMain.on('tagfox-plain-f5-missed', (event) => {
  sendSearchDebugLine(event.sender, 'searchRefresh.f5.missed', { reason: 'preloadHandlerMissing' });
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
    /* Same collapse as recycle: folder + inner file checked → HDROP with both breaks Explorer/Drive. */
    const collapsed = collapseNestedTrashPaths(list);
    const dragList = collapsed.length ? collapsed : list;
    /* Single-file API is more reliable on some Windows targets; `files` for multi. */
    const payload =
      dragList.length === 1
        ? { file: dragList[0], icon: START_DRAG_ICON }
        : { files: dragList, icon: START_DRAG_ICON };
    event.sender.startDrag(payload);
    /* startDrag is synchronous and routinely leaves Windows keyboard focus parked off the page when the drag
       ends with TagFox still foreground (drop inside the window, or cancel with Esc): text boxes then look
       focused but ignore keys until an alt-tab. Run the same blur+focus cycle the modal path uses to re-route
       the keyboard, but only when we are still the focused window, so an external drop into Explorer does not
       get focus yanked back to TagFox. */
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed() && process.platform === 'win32' && win.isFocused()) {
      win.blur();
      win.focus();
      event.sender.focus();
    }
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

/** Recursive delete for Shelf entries — fs.rm then Windows PS on any failure (Node often omits err.code on EPERM). */
async function rmShelfTreeOrThrow(absPath) {
  const target = path.resolve(String(absPath || '').trim());
  if (!target) throw new Error('Missing path');
  try {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  } catch (e) {
    if (process.platform !== 'win32') throw e;
    const psErr = removeItemRecurseViaPowershell(target);
    if (psErr) throw new Error(psErr);
  }
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
ipcMain.handle('rename-path', async (event, { fromPath, toPath, rootPrefix }) => {
  const from = normalizeRenameOperand(String(fromPath || ''));
  const to = normalizeRenameOperand(String(toPath || ''));
  if (!from || !to) return { ok: false, error: 'Missing path' };
  if (!isPathUnderRoot(from, rootPrefix) || !isPathUnderRoot(to, rootPrefix)) {
    return { ok: false, error: 'Path must stay under the configured root folder.' };
  }
  const r = await renameWithBusyRetry(from, to);
  if (r.ok) event.sender.send('paths-mutated', { paths: [from, to] });
  return r;
});

ipcMain.handle('move-paths-into-folder', async (event, { sourcePaths, destFolder, rootPrefix, replaceExisting }) => {
  const r = await moveSourcesIntoFolder(sourcePaths, destFolder, rootPrefix, !!replaceExisting);
  if ((r.ok && !r.noop) || r.partial)
    event.sender.send('paths-mutated', { paths: sourcePaths, destFolder, moved: r.moved || [] });
  return r;
});

ipcMain.handle('copy-paths-into-folder', async (event, { sourcePaths, destFolder, rootPrefix, replaceExisting }) => {
  const r = await copySourcesIntoScopeFolder(sourcePaths, destFolder, rootPrefix, !!replaceExisting, 'prompt');
  if ((r.ok && !r.noop) || r.partial)
    event.sender.send('paths-mutated', { paths: sourcePaths, destFolder, copied: r.copied || [] });
  return r;
});

/** Move files into staging shelf (userData); bypasses scope root — used for “shortcut on shelf”. */
async function movePathsToShelf(sourcePaths) {
  const shelf = getShelfDirResolved();
  const list = collapseNestedSourcePathsForBulkOp(sourcePaths);
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
ipcMain.handle('read-file-buffer', async (_event, { fullPath, maxBytes }) => {
  const fp = path.normalize(String(fullPath || ''));
  if (!fp) return { ok: false, error: 'Missing path' };
  // Office / PDF previews load the whole file into memory (base64 → renderer); callers pass a tighter cap where renderer-side parsing is the bottleneck.
  const hardMax = 100 * 1024 * 1024;
  const cap = Number.isFinite(maxBytes) && maxBytes > 0 ? Math.min(maxBytes, hardMax) : hardMax;
  const tooBig = { ok: false, error: 'File too large for preview (max ' + Math.round(cap / (1024 * 1024)) + ' MB). Use Open.' };
  try {
    const st = await fs.stat(fp);
    if (st.isDirectory()) return { ok: false, error: 'Not a file' };
    if (st.size > cap) return tooBig;
    const buf = await fs.readFile(fp);
    return { ok: true, base64: buf.toString('base64') };
  } catch (e) {
    const code = e && e.code;
    // Google Drive / My Drive: stat can EPERM on some paths while readFile still works.
    if (code === 'EPERM' || code === 'EACCES') {
      try {
        const buf = await fs.readFile(fp);
        if (buf.length > cap) return tooBig;
        return { ok: true, base64: buf.toString('base64') };
      } catch (e2) {
        return { ok: false, error: String(e2.message || e2) };
      }
    }
    return { ok: false, error: String(e.message || e) };
  }
});

/**
 * OS shell thumbnail (Explorer's provider): images, video, PDF, Office where a provider exists.
 * Serialised: concurrent createThumbnailFromPath calls fail on Windows with "Failed to get thumbnail
 * from local thumbnail cache reference", so a render-time burst would poison many files at once. One at
 * a time succeeds. Empty result (no provider) means the renderer keeps the file-type glyph.
 */
let thumbnailQueue = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function thumbnailOnce(fp, px) {
  const img = await nativeImage.createThumbnailFromPath(fp, { width: px, height: px });
  if (!img || img.isEmpty()) return { ok: false, error: 'No thumbnail' };
  return { ok: true, dataUrl: img.toDataURL() };
}
function makeThumbnail(fp, px) {
  const run = thumbnailQueue.then(async () => {
    // The Windows thumbnail cache fails intermittently ("local thumbnail cache reference") even for
    // single calls. Retry a few times so a transient miss does not get cached as a permanent no-thumbnail.
    let lastErr = 'No thumbnail';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await thumbnailOnce(fp, px);
        if (r.ok) return r;
        lastErr = r.error;
      } catch (e) {
        lastErr = String((e && e.message) || e);
      }
      await sleep(100);
    }
    return { ok: false, error: lastErr };
  });
  thumbnailQueue = run.then(() => {}, () => {});
  return run;
}
ipcMain.handle('get-thumbnail', async (_event, { fullPath, size }) => {
  const fp = path.normalize(String(fullPath || ''));
  if (!fp) return { ok: false, error: 'Missing path' };
  const px = Number.isFinite(size) && size > 0 ? Math.min(Math.round(size), 512) : 48;
  return makeThumbnail(fp, px);
});

/** Outlook .msg parse in main (npm msg reader); renderer shows plain text in the text preview panel. */
ipcMain.handle('read-msg-preview', async (_event, { fullPath }) => {
  const fp = path.normalize(String(fullPath || ''));
  if (!fp) return { ok: false, error: 'Missing path' };
  const maxBytes = 50 * 1024 * 1024;
  async function readBuf() {
    const buf = await fs.readFile(fp);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    const reader = new MsgReader(ab);
    const data = reader.getFileData();
    return msgFileDataToPreviewText(data);
  }
  try {
    const st = await fs.stat(fp);
    if (st.isDirectory()) return { ok: false, error: 'Not a file' };
    if (st.size > maxBytes) return { ok: false, error: 'File too large for preview (max 50 MB).' };
    return await readBuf();
  } catch (e) {
    const code = e && e.code;
    if (code === 'EPERM' || code === 'EACCES') {
      try {
        return await readBuf();
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

/** Clipboard image → PNG on disk (creates parent dirs). Renderer sends raw image bytes as base64. */
ipcMain.handle('write-image-file-png', async (_event, { fullPath, base64 }) => {
  const fp = path.normalize(String(fullPath || ''));
  if (!fp) return { ok: false, error: 'Missing path' };
  const maxB64 = 40 * 1024 * 1024;
  const b64 = String(base64 || '');
  if (b64.length > maxB64) return { ok: false, error: 'Image too large to paste.' };
  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return { ok: false, error: 'Empty image data.' };
    const image = nativeImage.createFromBuffer(buf);
    if (image.isEmpty()) return { ok: false, error: 'Could not read image from clipboard.' };
    const png = image.toPNG();
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, png);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

function pathKeyForGlobalViewerWalk(p) {
  return path.normalize(String(p || '')).replace(/[/\\]+$/, '').replace(/\//g, '\\').toLowerCase();
}

ipcMain.handle('resolve-folder-viewer-doc', async (_event, { folderPath, basenames }) => {
  const dir = path.normalize(String(folderPath || '').trim().replace(/[/\\]+$/, ''));
  if (!dir) return { ok: false, error: 'Missing folder', fullPath: null };
  const rawNames = Array.isArray(basenames) ? basenames : [];
  const nameList =
    rawNames.length > 0
      ? [...new Set(rawNames.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))]
      : VIEWER_DOC_BASENAMES_DEFAULT.slice();
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
  // Pretty = filename with TagFox tags stripped, so a tagged doc (e.g. "TreeAid readme xkTODO.md")
  // still matches "readme". This is how a folder gets tagged: tag its readme, not the folder.
  const pretty = (n) => {
    try {
      return String(TagBrowserTags.parseSegmentTags(n).pretty || n).toLowerCase();
    } catch (_) {
      return lower(n);
    }
  };
  // 1) Prefer any file whose pretty name contains "readme" (.md before .txt, then shorter name).
  const readmeFiles = files
    .filter((f) => /readme/.test(pretty(f)) && /\.(md|txt)$/.test(pretty(f)))
    .sort((a, b) => {
      const am = pretty(a).endsWith('.md') ? 0 : 1;
      const bm = pretty(b).endsWith('.md') ? 0 : 1;
      if (am !== bm) return am - bm;
      return pretty(a).length - pretty(b).length || (a < b ? -1 : 1);
    });
  let fullPath = readmeFiles.length ? path.join(dir, readmeFiles[0]) : null;
  // 2) Else fall back to the configured basenames, matched on the pretty (tag-stripped) name.
  if (!fullPath) {
    for (const name of nameList) {
      const w = lower(name);
      const hit = files.find((f) => pretty(f) === w);
      if (hit) {
        fullPath = path.join(dir, hit);
        break;
      }
    }
  }
  return { ok: true, fullPath };
});
