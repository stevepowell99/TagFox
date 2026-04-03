// TagFox renderer UI logic (after vendor CDN loader + tags.js).
    const T = window.TagBrowserTags;
    /** Pretty filename for one path segment (strip bracket tags). */
    function segmentPretty(name) {
      return T.parseSegmentTags(name).pretty;
    }
    if (window.__tagBrowserCdnOk === false) throw new Error('CDN vendor load failed');
    const LS = {
      baseUrl: 'tagBrowserBaseUrl',
      rootFolder: 'tagBrowserRootFolder',
      maxResults: 'tagBrowserMaxResults',
      httpUser: 'tagBrowserHttpUser',
      optCase: 'tagBrowserOptCase',
      optWholeWord: 'tagBrowserOptWW',
      optPath: 'tagBrowserOptPath',
      optRegex: 'tagBrowserOptRegex',
      optDiacritics: 'tagBrowserOptDiac',
      sortBy: 'tagBrowserSortBy',
      optAsc: 'tagBrowserOptAsc',
      folderSearchRecursive: 'tagBrowserFolderRec',
      foldersOnly: 'tagBrowserFoldersOnly',
      filesOnly: 'tagBrowserFilesOnly',
      propsWidthPx: 'tagBrowserPropsW',
      tableCols: 'tagBrowserTableCols',
      favFolders: 'tagBrowserFavFolders',
      favSearches: 'tagBrowserFavSearches',
      scopeFolderHistory: 'tagBrowserScopeFolderHist',
      tagStore: 'tagBrowserTagStore',
      knownBracketTags: 'tagBrowserKnownBracketTags',
      activeTagFilter: 'tagBrowserActiveTag',
      tagFilterCombineOr: 'tagBrowserTagCombineOr',
      hideDotFolders: 'tagBrowserHideDotFolders',
      sortFoldersWithFiles: 'tagBrowserSortFoldersWithFiles',
      recencyFilter: 'tagBrowserRecencyFilter',
      searchDebug: 'tagBrowserSearchDebug',
      tableColVisible: 'tagBrowserTableColVisible',
      helpModalTab: 'tagBrowserHelpModalTab',
    };

    /** One-time copy when upgrading from the old app name (everythang* keys). */
    function migrateLocalStorageFromLegacy() {
      const pairs = [
        ['tagBrowserBaseUrl', 'everythangBaseUrl'],
        ['tagBrowserRootFolder', 'everythangRootFolder'],
        ['tagBrowserMaxResults', 'everythangMaxResults'],
        ['tagBrowserHttpUser', 'everythangHttpUser'],
        ['tagBrowserOptCase', 'everythangOptCase'],
        ['tagBrowserOptWW', 'everythangOptWW'],
        ['tagBrowserOptPath', 'everythangOptPath'],
        ['tagBrowserOptRegex', 'everythangOptRegex'],
        ['tagBrowserOptDiac', 'everythangOptDiac'],
        ['tagBrowserSortBy', 'everythangSortBy'],
        ['tagBrowserOptAsc', 'everythangOptAsc'],
        ['tagBrowserFolderRec', 'everythangFolderRec'],
        ['tagBrowserFoldersOnly', 'everythangFoldersOnly'],
        ['tagBrowserFilesOnly', 'everythangFilesOnly'],
        ['tagBrowserPropsW', 'everythangPropsW'],
        ['tagBrowserTableCols', 'everythangTableCols'],
        ['tagBrowserFavFolders', 'everythangFavFolders'],
        ['tagBrowserTagStore', 'everythangTagStore'],
        ['tagBrowserActiveTag', 'everythangActiveTag'],
        ['tagBrowserHideDotFolders', 'everythangHideDotFolders'],
      ];
      for (const [n, o] of pairs) {
        if (localStorage.getItem(n) !== null) continue;
        const v = localStorage.getItem(o);
        if (v !== null) {
          localStorage.setItem(n, v);
          localStorage.removeItem(o);
        }
      }
    }

    const TAG_STORE_MAX = 40;
    const KNOWN_BRACKET_TAGS_MAX = 5000;
    /** MRU subset (40) for search history / datalist order hint — not the tag bar source of truth. */
    let tagStoreOrder = [];
    /** Global `[(…)]` tag names: rescan + adds; not scope-local (LS + userData JSON). */
    let knownBracketTagsList = [];
    let tagPrefsDiskTimer = null;

    /** JSON snapshot for userData/tagBrowser-tag-prefs.json (stable; not tied to file:// path). */
    function tagPrefsSnapshotForDisk() {
      return {
        v: 1,
        savedAt: Date.now(),
        tagStore: tagStoreOrder.slice(0, TAG_STORE_MAX),
        knownBracketTags: knownBracketTagsList.slice(0, KNOWN_BRACKET_TAGS_MAX),
        activeFilter: [...activeTagKeys].sort(),
        tagCombineOr: !!tagFilterCombineOr,
      };
    }

    function scheduleTagPrefsDiskSync() {
      if (!window.tagBrowser || typeof window.tagBrowser.tagPrefsWrite !== 'function') return;
      if (tagPrefsDiskTimer) clearTimeout(tagPrefsDiskTimer);
      tagPrefsDiskTimer = setTimeout(() => {
        tagPrefsDiskTimer = null;
        void window.tagBrowser.tagPrefsWrite(tagPrefsSnapshotForDisk());
      }, 80);
    }

    /** After localStorage load: overlay tags from userData file if present (Electron); else seed file from LS. */
    function applyTagPrefsFromUserDataFile() {
      if (!window.tagBrowser || typeof window.tagBrowser.tagPrefsReadSync !== 'function') {
        searchDebugLog('tagPrefs.skip', { reason: 'no tagPrefsReadSync bridge' });
        return;
      }
      const raw = window.tagBrowser.tagPrefsReadSync();
      if (!raw || !String(raw).trim()) {
        searchDebugLog('tagPrefs.skip', { reason: 'empty or missing prefs JSON on disk' });
        scheduleTagPrefsDiskSync();
        return;
      }
      let snap;
      try {
        snap = JSON.parse(raw);
      } catch (e) {
        searchDebugLog('tagPrefs.skip', { reason: 'JSON.parse failed', err: String(e && e.message ? e.message : e) });
        return;
      }
      if (!snap || typeof snap !== 'object') {
        searchDebugLog('tagPrefs.skip', { reason: 'parsed snap not an object' });
        return;
      }
      searchDebugLog('tagPrefs.disk.parse', {
        hasTagStore: Array.isArray(snap.tagStore),
        tagStoreLen: Array.isArray(snap.tagStore) ? snap.tagStore.length : 0,
        knownKey: 'knownBracketTags' in snap,
        knownIsArray: Array.isArray(snap.knownBracketTags),
        knownLen: Array.isArray(snap.knownBracketTags) ? snap.knownBracketTags.length : null,
        skipKnownBecauseEmpty: Array.isArray(snap.knownBracketTags) && snap.knownBracketTags.length === 0,
        activeFilterLen: Array.isArray(snap.activeFilter) ? snap.activeFilter.length : 0,
      });
      if (Array.isArray(snap.tagStore)) {
        const next = [];
        const seen = new Set();
        for (const x of snap.tagStore) {
          if (!x || typeof x !== 'object') continue;
          let k = typeof x.key === 'string' && String(x.key).trim() ? String(x.key).trim().toLowerCase() : '';
          const d0 = String(x.display || x.key || '').trim();
          if (!k && d0) k = d0.toLowerCase();
          if (!k) continue;
          if (seen.has(k)) continue;
          seen.add(k);
          next.push({ key: k, display: d0 || k });
        }
        if (next.length > TAG_STORE_MAX) next.splice(TAG_STORE_MAX);
        tagStoreOrder = next;
        saveTagStore();
      }
      // Ignore [] — old snapshots wrote empty arrays and wiped localStorage-seeded lists; bar uses knownBracketTagsList only.
      if (Array.isArray(snap.knownBracketTags) && snap.knownBracketTags.length > 0) {
        const kn = [];
        const seen = new Set();
        for (const x of snap.knownBracketTags) {
          if (!x || typeof x !== 'object') continue;
          let k = typeof x.key === 'string' && String(x.key).trim() ? String(x.key).trim().toLowerCase() : '';
          const d0 = String(x.display || x.key || '').trim();
          if (!k && d0) k = d0.toLowerCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          kn.push({ key: k, display: d0 || k });
        }
        if (kn.length > KNOWN_BRACKET_TAGS_MAX) kn.splice(KNOWN_BRACKET_TAGS_MAX);
        knownBracketTagsList = kn;
        saveKnownBracketTags();
      }
      if (Array.isArray(snap.activeFilter)) {
        activeTagKeys = new Set(snap.activeFilter.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
        persistActiveTagFilter();
      }
      if (typeof snap.tagCombineOr === 'boolean') {
        tagFilterCombineOr = snap.tagCombineOr;
        localStorage.setItem(LS.tagFilterCombineOr, tagFilterCombineOr ? '1' : '0');
      }
      scheduleTagPrefsDiskSync();
      searchDebugLog('tagPrefs.apply.after', {
        knownBracketTagsListLen: knownBracketTagsList.length,
        tagStoreOrderLen: tagStoreOrder.length,
        activeTagKeys: activeTagKeys.size,
      });
    }

    let propsPanePx = 300;
    /** Percent weights for results table cols (sum 100). Col 0 must fit checkbox + recency blob without spilling into Name. */
    const COL_PERCENT_DEFAULT = [4, 38, 20, 6, 7, 11, 14];
    /** Saved default when col 0 was 2% — too narrow; one-time upgrade to COL_PERCENT_DEFAULT. */
    const COL_PERCENT_OLD_THIN_FIRST = [2, 40, 20, 6, 7, 11, 14];
    /** Shipped Apr 2026 — actions at 7% clipped the row buttons; upgrade once. */
    const COL_PERCENT_OLD_THIN_ACTIONS = [2, 44, 22, 6, 7, 12, 7];
    /** Pre–Apr 2026 default (thin Name / wide Actions); one-time upgrade to COL_PERCENT_DEFAULT. */
    const COL_PERCENT_OLD_NARROW_NAME = [2, 13, 38, 5, 7, 10, 25];
    /** Drag resize: boundary 5 = Modified | Actions — don’t shrink Actions below this (% of table). */
    const COL_RESIZE_MIN_ACTIONS_PCT = 11;
    /** Previous shipped 6-col default (wide merged grab+chk); upgrade to 7-col COL_PERCENT_DEFAULT once. */
    const COL_PERCENT_WIDE_CHK_DEFAULT = [5.5, 14, 42, 7, 9, 22.5];
    /** Old 7-col layout (grab+chk+…); merge grab+chk widths when migrating localStorage. */
    const COL_PERCENT_LEGACY_SHIPPED_7 = [2.5, 3, 17, 26, 8, 11, 32.5];
    let colPercent = COL_PERCENT_DEFAULT.slice();
    /** Column visibility: chk, name, path, type, size, modified, actions. */
    const COL_VISIBLE_DEFAULT = [true, true, true, true, true, true, true];
    const COL_VISIBLE_TOGGLE_INDEXES = [1, 2, 3, 4, 5, 6];
    let colVisible = COL_VISIBLE_DEFAULT.slice();

    /** Upgrade saved 6-wide visibility (pre–Type column) for favourites + localStorage. */
    function normalizeColVisibleFromSaved(arr) {
      if (!Array.isArray(arr)) return null;
      const v = arr.map((x) => !!x);
      if (v.length === 7) return v;
      if (v.length === 6) return [v[0], v[1], v[2], true, v[3], v[4], v[5]];
      return null;
    }

    let lastRows = [];
    /** HTML5 drag payload for moving rows onto folder rows in the results table. */
    const TAG_BROWSER_PATHS_DRAG_TYPE = 'application/x-tagbrowser-paths';
    /** startDrag path: OS sets no custom MIME on dragover; stash until dragend. Not used for normal HTML5 drags. */
    let tagBrowserActiveNativeDragPaths = null;
    /** One-shot: next row/Shelf-chip drag uses OS file drag (Explorer); normal drag stays HTML5 for in-app. */
    let tagBrowserNextOsFileDrag = false;

    function dataTransferHasTagBrowserPaths(dt) {
      try {
        return [...dt.types].includes(TAG_BROWSER_PATHS_DRAG_TYPE);
      } catch {
        return false;
      }
    }

    /** Custom MIME, active native row drag, or OS file drag (Explorer / uri-list / file items). */
    function dataTransferHasTagBrowserOrFiles(dt) {
      if (dataTransferHasTagBrowserPaths(dt)) return true;
      if (tagBrowserActiveNativeDragPaths && tagBrowserActiveNativeDragPaths.length) return true;
      try {
        const types = [...dt.types];
        if (types.includes('Files') || types.includes('text/uri-list')) return true;
        if (dt.items && dt.items.length) {
          for (let i = 0; i < dt.items.length; i++) {
            if (dt.items[i].kind === 'file') return true;
          }
        }
      } catch {
        /* ignore */
      }
      return false;
    }

    /** Payload is JSON array of paths (legacy) or future { paths: [...] }. */
    function parseTagBrowserPathsDragPayload(raw) {
      try {
        const v = JSON.parse(raw || 'null');
        if (Array.isArray(v)) return v;
        if (v && Array.isArray(v.paths)) return v.paths;
      } catch {
        /* ignore */
      }
      return [];
    }

    /** In-app drag only: custom MIME (no text/uri-list — targets often treat file: URLs as links / “package”). */
    function setDataTransferTagBrowserHtml5Paths(dt, paths) {
      const arr = Array.isArray(paths) ? paths : [];
      dt.setData(TAG_BROWSER_PATHS_DRAG_TYPE, JSON.stringify(arr));
      dt.effectAllowed = 'copyMove';
    }
    /** Last tag scan: Everything r=1 + `\\[\\(` so we only index `[(…)]` blocks, not every `[`. */
    let tagDiscoveryRows = [];
    /** Last non-empty scan — keeps tag pills when a later scan fails, returns empty, or races navigation. */
    let tagDiscoveryRowsLastGood = [];
    let sortColumn = 'name';
    let sortAsc = true;
    let searchDebounceTimer = null;
    const SEARCH_DEBUG_MAX = 3500;
    let searchDebugLines = [];
    let searchRunSeq = 0;
    /** Recent search UI state (query, scope, tag, toggles, sort) for Alt+← / Alt+→ and toolbar buttons. */
    const SEARCH_HIST_MAX = 50;
    const SEARCH_HIST_DEBOUNCE_MS = 450;
    let searchHist = [];
    let searchHistIdx = 0;
    let searchHistDebounceTimer = null;
    let searchHistNavigating = false;
    /** When empty-results hints restart (query / tag / recursive changed while still empty). */
    let pulseHintFingerprint = '';
    /** Heavy preview = big read / CPU (see isHeavyBinaryPreview). Light = folder readme, md, text, … */
    const PROPS_PREVIEW_DEBOUNCE_HEAVY_MS = 520;
    const PROPS_PREVIEW_DEBOUNCE_LIGHT_MS = 90;
    let propsPreviewDebounceTimer = null;

    const SORT_LABELS = { name: 'Name', path: 'Path', ext: 'Type', size: 'Size', date_modified: 'Modified' };

    /** @type {Set<string>} lowercase keys; tag bar filters with AND (click toggles each). */
    let activeTagKeys = new Set();
    /** Multiple tag filters: false = AND (default), true = OR (Everything regex + client filter). */
    let tagFilterCombineOr = false;
    /** Tag modal targets (length 1 = single-name edit, &gt;1 = union add/remove on each). */
    let modalTargetPaths = [];
    let modalTags = [];
    /** Multi-select checkboxes: path key lowercase → canonical path */
    const checkedPathsMap = new Map();
    let tagModalInst = null;
    let bulkRenameModalInst = null;
    /** Paths captured when bulk rename opens — preview and Apply use this list. */
    let bulkRenameTargetPaths = [];
    let tagRenameBusy = false;
    let renameItemBusy = false;

    let selectedRow = null;
    let selectedFullPath = null;
    /** Index in filteredRows() for Shift+↑/↓ range checkbox select; cleared on plain ↑/↓. */
    let resultsShiftRangeAnchorIdx = null;
    let activeReadmePath = null;
    let activeMdPath = null;
    /** RHS .md / .txt editor: path the textarea belongs to + debounced write */
    let mdAutosaveTimer = null;
    let mdAutosaveTargetPath = null;
    const MD_AUTOSAVE_MS = 450;

    function cancelMdFileAutosave() {
      if (mdAutosaveTimer) {
        clearTimeout(mdAutosaveTimer);
        mdAutosaveTimer = null;
      }
    }

    async function flushMdFileAutosave() {
      cancelMdFileAutosave();
      const p = mdAutosaveTargetPath;
      if (!p) return;
      const ed = document.getElementById('mdFileEditor');
      const text = ed.value;
      const r = await window.tagBrowser.writeTextFile({ fullPath: p, text });
      const status = document.getElementById('status');
      status.textContent = r.ok ? 'Saved.' : (r.error || 'Save failed');
    }

    function scheduleMdFileAutosave() {
      if (!mdAutosaveTargetPath) return;
      cancelMdFileAutosave();
      mdAutosaveTimer = setTimeout(() => {
        mdAutosaveTimer = null;
        void flushMdFileAutosave();
      }, MD_AUTOSAVE_MS);
    }
    let previewBlobUrls = [];
    /** Idle PDF iframe HTML (keep in sync with srcdoc on #pdfFrame). */
    const PDF_IFRAME_IDLE =
      "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body style='margin:0;background:#f8f9fa'></body></html>";

    /** Raster types for RHS image preview (SVG handled via readTextFile + blob). */
    const IMAGE_EXT_MIME = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
    };

    /** PDF / Office / binary images — long debounce so ↑/↓ doesn’t kick off huge work every row. */
    function isHeavyBinaryPreview(row, fp) {
      if (!row || !fp || rowIsFolder(row)) return false;
      const base = T.baseName(fp);
      const ext = /\.[^.]+$/.test(base) ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
      if (ext === 'pdf') return true;
      if (ext === 'docx' || ext === 'doc' || ext === 'xlsx' || ext === 'xls' || ext === 'pptx') return true;
      if (IMAGE_EXT_MIME[ext]) return true;
      return false;
    }

    function propsPreviewDebounceMsForSelection() {
      const fp = propsTargetPath();
      const row = propsTargetRowForDisplay();
      if (!fp || !row) return PROPS_PREVIEW_DEBOUNCE_HEAVY_MS;
      if (rowIsFolder(row)) return 0;
      if (isHeavyBinaryPreview(row, fp)) return PROPS_PREVIEW_DEBOUNCE_HEAVY_MS;
      return PROPS_PREVIEW_DEBOUNCE_LIGHT_MS;
    }

    /** Google Drive desktop shortcuts → Viewer opens linked URL in a child BrowserWindow. */
    const GOOGLE_SHORTCUT_EXT = new Set(['gdoc', 'gsheet', 'gslides']);

    /** File row: shell open, or Workspace child window for .gdoc / .gsheet / .gslides (same as Viewer button). */
    async function openFileDefaultOrGoogleWorkspace(fp) {
      const status = document.getElementById('status');
      const base = T.baseName(fp);
      const dot = base.lastIndexOf('.');
      const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
      if (GOOGLE_SHORTCUT_EXT.has(ext) && window.tagBrowser.googleWorkspaceShortcutUrl && window.tagBrowser.openGoogleWorkspaceWindow) {
        const rGw = await window.tagBrowser.googleWorkspaceShortcutUrl({ fullPath: fp });
        if (!rGw.ok) {
          if (status) status.textContent = rGw.error || 'Could not read Google shortcut';
          return;
        }
        const r = await window.tagBrowser.openGoogleWorkspaceWindow({ url: rGw.url });
        if (status && !r.ok) status.textContent = r.error || 'Open failed';
        return;
      }
      const err = await window.tagBrowser.openPath(fp);
      if (err && status) status.textContent = 'Open failed: ' + err;
    }

    /** Extensions shown as read-only text in the props panel (not .md / .txt — those use the editor). */
    const TEXT_PREVIEW_EXT = new Set([
      'json',
      'jsonl',
      'ndjson',
      'text',
      'log',
      'csv',
      'tsv',
      'xml',
      'xsl',
      'yml',
      'yaml',
      'toml',
      'ini',
      'cfg',
      'conf',
      'config',
      'env',
      'gitignore',
      'dockerignore',
      'editorconfig',
      'npmrc',
      'properties',
      'sql',
      'http',
      'css',
      'scss',
      'sass',
      'less',
      'html',
      'htm',
      'js',
      'mjs',
      'cjs',
      'jsx',
      'ts',
      'tsx',
      'vue',
      'py',
      'pyw',
      'rb',
      'php',
      'rs',
      'go',
      'swift',
      'kt',
      'kts',
      'java',
      'cs',
      'fs',
      'cpp',
      'cc',
      'cxx',
      'h',
      'hpp',
      'c',
      'sh',
      'bash',
      'zsh',
      'ps1',
      'bat',
      'cmd',
      'r',
      'lua',
      'graphql',
      'gql',
      'mdx',
      'dockerfile',
      'makefile',
      'cmake',
      'gradle',
      'plist',
      'vcf',
      'ics',
    ]);

    const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
    const TEXT_PREVIEW_MAX_CHARS = 450000;
    /** Excel HTML preview: max physical rows read from !ref (not “first N non-empty”; see comment at call site). */
    const EXCEL_PREVIEW_MAX_ROWS = 100;
    /** PPTX text preview: max slides parsed (large decks = many zip/XML reads). */
    const PPTX_PREVIEW_MAX_SLIDES = 50;

    function rowSizeBytes(row) {
      const n = Number(row && row.size);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }

    /** Safe string for inserting into preview HTML. */
    function escapeHtmlForPreview(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    /**
     * Cap HTML preview size (mammoth DOCX, etc.): prefer cutting after </p> to limit huge DOMs.
     * Uses same char budget as plain text preview (TEXT_PREVIEW_MAX_CHARS).
     */
    function truncateRichPreviewHtml(html, maxChars) {
      const s = String(html || '');
      if (s.length <= maxChars) return s;
      const head = s.slice(0, maxChars);
      const p = head.lastIndexOf('</p>');
      const body = p >= Math.floor(maxChars * 0.3) ? head.slice(0, p + 4) : head;
      return (
        body +
        '<p class="text-muted small mb-0 mt-2">Preview truncated — use <strong>Open</strong> for the full document.</p>'
      );
    }

    /**
     * PPTX: zip of OOXML — pull text runs (drawingml a:t) per slide. Visual layout not preserved.
     */
    async function pptxArrayBufferToPreviewHtml(arrayBuffer) {
      if (typeof JSZip === 'undefined' || !JSZip.loadAsync) {
        return '<p class="text-danger small">JSZip failed to load.</p>';
      }
      const zip = await JSZip.loadAsync(arrayBuffer);
      const slideEntries = [];
      zip.forEach((relPath, entry) => {
        if (entry.dir) return;
        const p = relPath.replace(/\\/g, '/');
        const m = /^ppt\/slides\/slide(\d+)\.xml$/i.exec(p);
        if (m) slideEntries.push({ n: parseInt(m[1], 10), path: relPath });
      });
      slideEntries.sort((a, b) => a.n - b.n);
      const totalSlides = slideEntries.length;
      const slideCap = PPTX_PREVIEW_MAX_SLIDES;
      const slidesToRead = slideCap > 0 && totalSlides > slideCap ? slideEntries.slice(0, slideCap) : slideEntries;
      const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
      const sections = [];
      for (const { n, path } of slidesToRead) {
        const f = zip.file(path);
        if (!f) continue;
        const xml = await f.async('string');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror')) continue;
        const runs = doc.getElementsByTagNameNS(NS_A, 't');
        const parts = [];
        for (let i = 0; i < runs.length; i++) {
          const t = runs[i].textContent;
          if (t) parts.push(t);
        }
        const text = parts.join('').replace(/\s+/g, ' ').trim();
        if (text) {
          sections.push(
            '<div class="mb-3 pptx-slide-block"><div class="fw-semibold text-muted small mb-1">Slide ' +
              n +
              '</div><p class="mb-0">' +
              escapeHtmlForPreview(text) +
              '</p></div>'
          );
        }
      }
      if (!sections.length) {
        return (
          '<p class="small text-muted mb-0">No slide text found (empty or image-heavy decks). Use <strong>Open</strong> for full view.</p>'
        );
      }
      let out = '<p class="small text-muted mb-2">Text per slide only — not a visual preview.</p>' + sections.join('');
      if (slideCap > 0 && totalSlides > slideCap) {
        out +=
          '<p class="text-muted small mb-0 mt-2">Preview: first ' +
          slideCap +
          ' slides only (' +
          totalSlides +
          ' slides).</p>';
      }
      return out;
    }

    /** Pretty-print .json when valid; otherwise raw (injected with textContent, not innerHTML). */
    function formatTextPreviewBody(ext, raw) {
      const t = String(raw ?? '');
      if (ext === 'json') {
        try {
          return JSON.stringify(JSON.parse(t), null, 2);
        } catch (_) {
          return t;
        }
      }
      return t;
    }

    function revokePreviewBlobs() {
      for (const u of previewBlobUrls) {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {}
      }
      previewBlobUrls = [];
      const pdfFrame = document.getElementById('pdfFrame');
      if (pdfFrame) {
        pdfFrame.removeAttribute('src');
        pdfFrame.srcdoc = PDF_IFRAME_IDLE;
      }
      const imgEl = document.getElementById('propImagePreview');
      if (imgEl) imgEl.removeAttribute('src');
    }

    function base64ToArrayBuffer(b64) {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8.buffer;
    }

    function base64ToBlobUrl(b64, mime) {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], { type: mime });
      const url = URL.createObjectURL(blob);
      previewBlobUrls.push(url);
      return url;
    }

    /** Stable hue 0–359 from tag identity (lowercase so “Foo” matches “foo”). */
    function tagHueFromKey(tagKeyOrDisplay) {
      const s = String(tagKeyOrDisplay || '').trim().toLowerCase();
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      return Math.abs(h) % 360;
    }

    /** Light fill for row pills, breadcrumb badges, modal chips (same hash as tag bar). */
    function tagColorCss(tagKeyOrDisplay) {
      const hue = tagHueFromKey(tagKeyOrDisplay);
      return 'hsl(' + hue + ', 42%, 86%)';
    }

    /** Tag bar pill colours (important beats Bootstrap .btn). Active filter = thicker border only (.tag-bar-pill-active). */
    function applyTagBarPillStyle(el, tagKey) {
      const hue = tagHueFromKey(tagKey);
      el.style.setProperty('background-color', 'hsl(' + hue + ', 42%, 86%)', 'important');
      el.style.setProperty('color', '#212529', 'important');
      el.style.setProperty('border-color', 'hsl(' + hue + ', 38%, 58%)', 'important');
    }

    /** Remove one tag chip from segment via rename (results / props; no modal). */
    async function removeTagFromPathOneItem(fullPath, tagDisplay) {
      if (tagRenameBusy) return;
      const fp = String(fullPath || '').trim();
      if (!fp) return;
      const low = String(tagDisplay || '').trim().toLowerCase();
      if (!low) return;
      const base = T.baseName(fp);
      const parsed = T.parseSegmentTags(base);
      const tags = parsed.tags.filter((x) => x.toLowerCase() !== low);
      if (tags.length === parsed.tags.length) return;
      const newBase = T.buildTaggedComponent(base, tags);
      const parent = T.parentDir(fp);
      const sep = fp.includes('/') ? '/' : '\\';
      const toPath = parent ? parent + sep + newBase : newBase;
      const fromN = fp.replace(/[/\\]+$/, '').toLowerCase();
      const toN = toPath.replace(/[/\\]+$/, '').toLowerCase();
      if (fromN === toN) return;
      tagRenameBusy = true;
      const status = document.getElementById('status');
      try {
        const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
        const res = await window.tagBrowser.renamePath({ fromPath: fp, toPath, rootPrefix });
        if (!res || !res.ok) {
          status.textContent = (res && res.error) || 'Rename failed';
          return;
        }
        if (selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN) {
          selectedFullPath = toPath;
          renderScopeBreadcrumb();
        }
        status.textContent = 'Removed tag.';
        await refreshAfterTagsSaved([{ from: fp, to: toPath }]);
      } finally {
        tagRenameBusy = false;
      }
    }

    /** Coloured pill + × to remove tag from this path (stops row click propagation). */
    function appendTagPillWithRemove(parent, tag, fullPath) {
      const pill = document.createElement('span');
      pill.className = 'badge d-inline-flex align-items-center gap-0';
      pill.style.backgroundColor = tagColorCss(tag);
      pill.style.color = '#212529';
      const lbl = document.createElement('span');
      lbl.textContent = tag;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'btn btn-sm tag-pill-x ms-1 border-0 align-baseline';
      x.style.background = 'transparent';
      x.style.color = '#212529';
      x.style.opacity = '0.8';
      x.textContent = '\u00D7';
      x.title = 'Remove tag from name';
      x.setAttribute('aria-label', 'Remove tag ' + tag);
      x.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void removeTagFromPathOneItem(fullPath, tag);
      });
      pill.appendChild(lbl);
      pill.appendChild(x);
      parent.appendChild(pill);
    }

    /** Windows path: ensure drive root is C:\ not C: */
    function normalizeFolderPathForEverything(p) {
      let s = String(p || '').trim().replace(/[/\\]+$/, '');
      if (/^[a-zA-Z]:$/i.test(s)) s += '\\';
      return s;
    }

    /** Set scope path only; query text stays as the in-scope filter. */
    function setSearchScopeFolder(folderAbsPath) {
      const folder = normalizeFolderPathForEverything(folderAbsPath);
      if (!folder) return;
      document.getElementById('rootFolder').value = folder;
    }

    function clearSearchScope() {
      document.getElementById('rootFolder').value = '';
      saveSettings();
      renderScopeBreadcrumb();
      scheduleSearch();
      commitSearchHistoryNow();
    }

    function applyPaneWidths() {
      document.getElementById('propsAside').style.width = propsPanePx + 'px';
    }

    function isPropsTheaterOn() {
      const a = document.getElementById('propsAside');
      return !!(a && a.classList.contains('props-theater'));
    }

    /** Large overlay for previews (Shift+Space). */
    function setPropsTheaterMode(on) {
      const aside = document.getElementById('propsAside');
      const backdrop = document.getElementById('propsTheaterBackdrop');
      const split = document.getElementById('splitProps');
      const btn = document.getElementById('btnPropsTheaterToggle');
      if (!aside || !backdrop || !split) return;
      const show = !!on;
      aside.classList.toggle('props-theater', show);
      backdrop.classList.toggle('d-none', !show);
      split.classList.toggle('d-none', show);
      if (btn) {
        btn.setAttribute('aria-expanded', show ? 'true' : 'false');
        btn.title = show ? 'Exit expanded view (Shift+Space or Esc)' : 'Near full screen (Shift+Space)';
        btn.setAttribute('aria-label', show ? 'Exit expanded viewer panel' : 'Expand viewer panel');
        btn.textContent = show ? '⤡' : '⤢';
      }
      if (!show) applyPaneWidths();
    }

    function togglePropsTheaterMode() {
      setPropsTheaterMode(!isPropsTheaterOn());
    }

    function loadPaneWidthsFromStorage() {
      const pw = parseInt(localStorage.getItem(LS.propsWidthPx) || '', 10);
      if (Number.isFinite(pw) && pw >= 200 && pw <= 1600) propsPanePx = pw;
      applyPaneWidths();
    }

    function persistPaneWidths() {
      localStorage.setItem(LS.propsWidthPx, String(propsPanePx));
    }

    function bindVerticalSplitters() {
      const MIN_P = 200;
      const MAX_P = 1600;
      document.getElementById('splitProps').addEventListener('mousedown', (e) => {
        e.preventDefault();
        // One layout pass per frame: raw mousemove + PDF/office preview caused massive main-thread work.
        document.body.classList.add('tagfox-props-split-drag');
        const startX = e.clientX;
        const startW = propsPanePx;
        let raf = 0;
        function flushPaneWidth() {
          raf = 0;
          applyPaneWidths();
        }
        function move(ev) {
          // Dragging the handle right widens the left (results) pane; inverted delta matches that motion.
          propsPanePx = Math.min(MAX_P, Math.max(MIN_P, startW - (ev.clientX - startX)));
          if (!raf) raf = requestAnimationFrame(flushPaneWidth);
        }
        function up() {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          if (raf) cancelAnimationFrame(raf);
          flushPaneWidth();
          document.body.classList.remove('tagfox-props-split-drag');
          persistPaneWidths();
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    }

    function loadColWidthsFromStorage() {
      try {
        const parsed = JSON.parse(localStorage.getItem(LS.tableCols) || 'null');
        if (Array.isArray(parsed)) {
          const raw = parsed.map((x) => Number(x));
          if (raw.every((n) => Number.isFinite(n) && n >= 2)) {
            if (raw.length === 7) {
              if (raw.every((n, i) => Math.abs(n - COL_PERCENT_LEGACY_SHIPPED_7[i]) < 0.06)) {
                colPercent = COL_PERCENT_DEFAULT.slice();
                localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
              } else if (raw.every((n, i) => Math.abs(n - COL_PERCENT_OLD_THIN_ACTIONS[i]) < 0.06)) {
                colPercent = COL_PERCENT_DEFAULT.slice();
                localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
              } else if (raw.every((n, i) => Math.abs(n - COL_PERCENT_OLD_NARROW_NAME[i]) < 0.06)) {
                colPercent = COL_PERCENT_DEFAULT.slice();
                localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
              } else if (raw.every((n, i) => Math.abs(n - COL_PERCENT_OLD_THIN_FIRST[i]) < 0.06)) {
                colPercent = COL_PERCENT_DEFAULT.slice();
                localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
              } else {
                const sum7 = raw.reduce((a, b) => a + b, 0);
                if (sum7 > 99 && sum7 < 101) {
                  colPercent = raw;
                  localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
                }
              }
            } else if (raw.length === 6) {
              if (raw.every((n, i) => Math.abs(n - COL_PERCENT_WIDE_CHK_DEFAULT[i]) < 0.06)) {
                colPercent = COL_PERCENT_DEFAULT.slice();
                localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
              } else {
                const sum = raw.reduce((a, b) => a + b, 0);
                if (sum > 99 && sum < 101) {
                  const take = Math.min(5.5, Math.max(3, raw[2] * 0.09));
                  const pathN = raw[2] - take;
                  if (pathN >= 8) {
                    colPercent = [raw[0], raw[1], pathN, take, raw[3], raw[4], raw[5]];
                  } else {
                    colPercent = COL_PERCENT_DEFAULT.slice();
                  }
                  localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    function loadColVisibilityFromStorage() {
      try {
        const parsed = JSON.parse(localStorage.getItem(LS.tableColVisible) || 'null');
        const norm = normalizeColVisibleFromSaved(parsed);
        if (norm && COL_VISIBLE_TOGGLE_INDEXES.some((i) => norm[i])) colVisible = norm;
      } catch (_) {}
      syncColumnVisibilityMenu();
      applyTableColumnVisibility();
    }

    function persistColVisibilityToStorage() {
      localStorage.setItem(LS.tableColVisible, JSON.stringify(colVisible));
    }

    /** Fold hidden column weight into Name (or Path if Name hidden) so visible % still sums to 100. */
    function effectiveColWeights() {
      const w = colPercent.slice();
      const foldInto =
        colVisible[1] !== false ? 1 : colVisible[2] !== false ? 2 : 0;
      for (let i = 0; i < 7; i++) {
        if (colVisible[i] !== false || i === foldInto) continue;
        w[foldInto] += w[i];
        w[i] = 0;
      }
      return w;
    }

    function applyTableColWidths() {
      const w = effectiveColWeights();
      let sumV = 0;
      for (let i = 0; i < 7; i++) {
        if (colVisible[i] !== false) sumV += w[i];
      }
      if (!(sumV > 0)) return;
      document.querySelectorAll('#resultsTable col').forEach((c, i) => {
        if (colVisible[i] === false) {
          c.style.width = '';
          return;
        }
        c.style.width = (w[i] / sumV) * 100 + '%';
      });
    }

    function syncColumnVisibilityMenu() {
      const menu = document.getElementById('statusColumnsMenu');
      if (!menu) return;
      menu.querySelectorAll('input[data-col-idx]').forEach((el) => {
        const idx = Number(el.getAttribute('data-col-idx'));
        if (!Number.isInteger(idx)) return;
        el.checked = colVisible[idx] !== false;
      });
    }

    function applyTableColumnVisibility() {
      const table = document.getElementById('resultsTable');
      if (!table) return;
      const cols = table.querySelectorAll('col');
      const ths = table.querySelectorAll('thead th');
      for (let i = 0; i < 7; i++) {
        const vis = colVisible[i] !== false;
        if (cols[i]) cols[i].style.display = vis ? '' : 'none';
        if (ths[i]) ths[i].style.display = vis ? '' : 'none';
      }
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const cells = tr.children;
        for (let i = 0; i < Math.min(7, cells.length); i++) {
          cells[i].style.display = colVisible[i] !== false ? '' : 'none';
        }
      });
      applyTableColWidths();
    }

    function startTableColResize(e, boundaryIdx) {
      e.preventDefault();
      const startX = e.clientX;
      const startP = colPercent.slice();
      const table = document.getElementById('resultsTable');
      function move(ev) {
        const tw = table.getBoundingClientRect().width;
        if (tw < 80) return;
        let d = ((ev.clientX - startX) / tw) * 100;
        let a = startP[boundaryIdx] + d;
        let b = startP[boundaryIdx + 1] - d;
        const minLeft = boundaryIdx === 0 ? 4 : 3;
        if (a < minLeft) {
          b -= minLeft - a;
          a = minLeft;
        }
        const minRight = boundaryIdx === 5 ? COL_RESIZE_MIN_ACTIONS_PCT : 3;
        if (b < minRight) {
          a -= minRight - b;
          b = minRight;
        }
        colPercent = startP.slice();
        colPercent[boundaryIdx] = a;
        colPercent[boundaryIdx + 1] = b;
        applyTableColWidths();
      }
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    }

    /**
     * Settings scope folder changed from UI: persist, breadcrumb, immediate Everything refresh.
     * Use for breadcrumb, favourites, folder row, row parent-scope (chevron), sibling-folder dropdown, etc.
     */
    async function applySearchScopeAndRefresh(folderAbsPath) {
      setSearchScopeFolder(folderAbsPath);
      const scopeNorm = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim());
      if (scopeNorm) rememberScopeFolderHistory(scopeNorm);
      saveSettings();
      renderScopeBreadcrumb();
      await runSearchNow();
      await runTagDiscoverySearchInner(false);
      commitSearchHistoryNow();
    }

    function scheduleSearch() {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchDebounceTimer = null;
        void runSearch();
      }, 300);
    }

    async function runSearchNow() {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      await runSearch();
    }

    /** Pending staggered Everything re-queries (index can lag behind disk). */
    let diskMutationRefreshTimeouts = [];

    function clearAndScheduleSearchRetries() {
      for (const id of diskMutationRefreshTimeouts) clearTimeout(id);
      diskMutationRefreshTimeouts = [];
      for (const ms of [450, 1100, 2600]) {
        diskMutationRefreshTimeouts.push(
          setTimeout(() => {
            void runSearchNow();
          }, ms)
        );
      }
    }

    /** After paste / move / trash: search now plus a few delayed retries so the table catches up. */
    async function refreshAfterDiskMutation() {
      await detachViewerEditorsIfOpenTargetsGone();
      void renderShelf();
      clearAndScheduleSearchRetries();
      void runSearchNow();
    }

    /** Re-fill tag-modal datalist + quick-add (≤12) from global known tags (not current search scope). */
    function refreshTagModalDatalist() {
      const dl = document.getElementById('tagModalExistingTags');
      const quick = document.getElementById('tagModalQuickTags');
      if (!dl || !quick) return;
      const seen = new Set();
      const labels = [];
      const addLabel = (disp) => {
        const d = String(disp || '').trim();
        if (!d) return;
        const k = d.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        labels.push(d);
      };
      for (const t of knownBracketTagsList) addLabel(t.display);
      labels.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      dl.innerHTML = '';
      for (const text of labels) {
        const opt = document.createElement('option');
        opt.value = text;
        dl.appendChild(opt);
      }
      quick.innerHTML = '';
      const quickMax = 12;
      for (const text of labels.slice(0, quickMax)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const low = text.toLowerCase();
        const onSingle = modalTargetPaths.length === 1;
        const already = onSingle && modalTags.some((t) => t.toLowerCase() === low);
        btn.className = already ? 'btn btn-sm btn-outline-secondary' : 'btn btn-sm btn-outline-primary';
        btn.textContent = text;
        btn.title = already ? 'Already on this item' : 'Add tag ' + text;
        btn.disabled = !!already;
        btn.addEventListener('click', () => void applyModalAddTag(text));
        quick.appendChild(btn);
      }
    }

    /** After tag rename / add / remove on disk: search now; optional pathRenames patches rows if Everything is still stale (bulk). */
    async function refreshAfterTagsSaved(pathRenames) {
      void renderShelf();
      clearAndScheduleSearchRetries();
      await runSearchNow();
      if (pathRenames && pathRenames.length) {
        patchResultRowsAfterRenames(pathRenames);
        sortLastRowsForDisplay(true);
        await syncSelectionAfterSearch();
        renderTagBar();
        renderTable();
        updateSelectAllCheckboxState();
      }
      refreshTagModalDatalist();
    }

    function updateSortHeaders() {
      document.querySelectorAll('#resultsTable thead th[data-sort]').forEach((th) => {
        const dk = th.dataset.sort;
        const label = SORT_LABELS[dk] || dk;
        const arrow = sortColumn === dk ? (sortAsc ? ' ▲' : ' ▼') : '';
        const span = th.querySelector('.sort-label');
        if (span) span.textContent = label + arrow;
      });
      const rt = document.getElementById('resultsTable');
      if (rt) rt.classList.toggle('results-sort-path', sortColumn === 'path');
    }

    /** Folder that scopes the search (Settings “Scope folder” field). */
    function currentScopeFolderPath() {
      const rootRaw = document.getElementById('rootFolder').value.trim();
      return rootRaw ? normalizeFolderPathForEverything(rootRaw) : '';
    }

    /** Path → segments for tree depth (Windows-style, normalized slashes). */
    function pathSegmentsForTree(fullPathRaw) {
      let s = String(fullPathRaw || '').trim().replace(/\//g, '\\');
      s = s.replace(/\\+$/, '');
      if (/^[a-zA-Z]:$/i.test(s)) s += '\\';
      return s.split('\\').filter(Boolean);
    }

    /** Path folder grouping is active only for recursive + path sort + mode includes folders. */
    function shouldShowPathFolderGrouping() {
      const recursive = !!document.getElementById('folderSearchRecursive')?.checked;
      return recursive && sortColumn === 'path' && fileFolderFilterMode() !== 'files';
    }

    /** Parent-dir segments for one result row (files and folders both use parent of full path). */
    function parentSegmentsForRow(row) {
      const fp = fullPathForRow(row);
      const parent = String(T.parentDir(fp) || '').trim().replace(/[/\\]+$/, '');
      return pathSegmentsForTree(parent);
    }

    /** Common prefix length for two arrays (case-insensitive). */
    function commonPrefixLen(a, b) {
      const aa = Array.isArray(a) ? a : [];
      const bb = Array.isArray(b) ? b : [];
      let i = 0;
      while (i < aa.length && i < bb.length && String(aa[i]).toLowerCase() === String(bb[i]).toLowerCase()) i++;
      return i;
    }

    /** Longest common prefix length over a list of segment arrays. */
    function segmentArraysCommonPrefixLen(arrs) {
      if (!Array.isArray(arrs) || arrs.length === 0) return 0;
      let n = arrs[0].length;
      for (let i = 1; i < arrs.length; i++) {
        n = Math.min(n, commonPrefixLen(arrs[0], arrs[i]));
        if (n === 0) break;
      }
      return n;
    }

    /** Expand visible rows with synthetic folder rows for path grouping (rows stay fully interactive). */
    function buildPathGroupedDisplayRows(rows) {
      const src = Array.isArray(rows) ? rows : [];
      if (!shouldShowPathFolderGrouping() || !src.length) return src;
      // Everything often returns real folder rows too — skip fake placeholders for those paths (no size/date → “--”).
      const realFolderKeys = new Set();
      for (const r of src) {
        if (rowIsFolder(r)) {
          const k = pathNormKey(fullPathForRow(r));
          if (k) realFolderKeys.add(k);
        }
      }
      const parentSegsList = src.map((r) => parentSegmentsForRow(r));
      const stripPrefixLen = segmentArraysCommonPrefixLen(parentSegsList);
      const sameParentFolder = parentSegsList.every((parts) => parts.length === stripPrefixLen);
      const out = [];
      let prevRelParent = [];
      for (let rowIdx = 0; rowIdx < src.length; rowIdx++) {
        const row = src[rowIdx];
        const absParts = parentSegsList[rowIdx];
        const relParts = absParts.slice(stripPrefixLen);
        if (sameParentFolder) {
          if (rowIdx === 0 && absParts.length) {
            const fullDir = absParts.join('\\');
            if (!realFolderKeys.has(pathNormKey(fullDir))) {
              const synthetic = syntheticFolderRow(fullDir);
              synthetic.__pathTreeDepthUi = 1;
              out.push(synthetic);
            }
          }
          row.__pathTreeDepthUi = 2;
        } else {
          const l = commonPrefixLen(prevRelParent, relParts);
          for (let j = l; j < relParts.length; j++) {
            const absCount = stripPrefixLen + j + 1;
            const fullDir = absParts.slice(0, absCount).join('\\');
            if (realFolderKeys.has(pathNormKey(fullDir))) continue;
            const synthetic = syntheticFolderRow(fullDir);
            synthetic.__pathTreeDepthUi = j + 1;
            out.push(synthetic);
          }
          row.__pathTreeDepthUi = relParts.length + 1;
        }
        out.push(row);
        prevRelParent = relParts;
      }
      return out;
    }

    /** Parent directory chain under scope (empty string = item sits in scope root). */
    function pathRelativeToScopeDir(dirAbs) {
      const scopeRaw = currentScopeFolderPath();
      if (!scopeRaw || !String(dirAbs || '').trim()) return String(dirAbs || '');
      let s = normalizeFolderPathForEverything(scopeRaw).replace(/[/\\]+$/, '');
      let d = String(dirAbs || '').replace(/[/\\]+$/, '');
      const sParts = s.split(/[/\\]/).filter((p) => p !== '');
      const dParts = d.split(/[/\\]/).filter((p) => p !== '');
      let k = 0;
      while (
        k < sParts.length &&
        k < dParts.length &&
        sParts[k].toLowerCase() === dParts[k].toLowerCase()
      ) {
        k++;
      }
      if (k < sParts.length) return d;
      const rest = dParts.slice(k);
      const sep = d.includes('/') ? '/' : '\\';
      return rest.join(sep);
    }

    /** Path column: full path when there is no scope; otherwise parent folder trail under scope only. */
    function pathColumnDisplayForRow(fp, isFolder) {
      const scope = currentScopeFolderPath();
      const parent = T.parentDir(fp);
      if (!scope) return isFolder ? parent : fp;
      const rel = pathRelativeToScopeDir(parent);
      return rel || '—';
    }

    /** Fill path cell: muted prefix + stronger final segment (ellipsis still via .path-ellip-start). */
    function fillPathCellBox(pathBox, displayStr) {
      pathBox.replaceChildren();
      const bdi = document.createElement('bdi');
      bdi.dir = 'ltr';
      const s = String(displayStr ?? '');
      if (!s || s === '—') {
        bdi.textContent = s || '—';
        pathBox.appendChild(bdi);
        return;
      }
      const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
      if (i < 0) {
        const tail = document.createElement('span');
        tail.className = 'path-col-tail';
        tail.textContent = s;
        bdi.appendChild(tail);
      } else {
        const head = document.createElement('span');
        head.textContent = s.slice(0, i + 1);
        const tail = document.createElement('span');
        tail.className = 'path-col-tail';
        tail.textContent = s.slice(i + 1);
        bdi.appendChild(head);
        bdi.appendChild(tail);
      }
      pathBox.appendChild(bdi);
    }

    function loadFavouriteFolders() {
      try {
        const raw = localStorage.getItem(LS.favFolders);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && String(x).trim()) : [];
      } catch {
        return [];
      }
    }

    function saveFavouriteFolders(paths) {
      localStorage.setItem(LS.favFolders, JSON.stringify(paths.slice(0, 30)));
    }

    const SCOPE_FOLDER_HISTORY_MAX = 30;

    function loadScopeFolderHistory() {
      try {
        const raw = localStorage.getItem(LS.scopeFolderHistory);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && String(x).trim()) : [];
      } catch {
        return [];
      }
    }

    function saveScopeFolderHistory(paths) {
      localStorage.setItem(LS.scopeFolderHistory, JSON.stringify(paths.slice(0, SCOPE_FOLDER_HISTORY_MAX)));
    }

    /** Push normalized scope to front of local recent list (dedupe, case-insensitive). */
    function rememberScopeFolderHistory(normalizedPath) {
      const p = normalizeFolderPathForEverything(String(normalizedPath || '').trim());
      if (!p) return;
      const low = p.toLowerCase();
      const rest = loadScopeFolderHistory().filter((x) => String(x).toLowerCase() !== low);
      saveScopeFolderHistory([p, ...rest]);
    }

    function renderScopeFolderHistoryMenu() {
      const ul = document.getElementById('scopeFolderHistoryMenu');
      if (!ul) return;
      ul.innerHTML = '';
      const paths = loadScopeFolderHistory();
      if (!paths.length) {
        const li = document.createElement('li');
        const sp = document.createElement('span');
        sp.className = 'dropdown-item-text text-muted small px-3 py-2';
        sp.textContent = 'No recent scope folders yet';
        li.appendChild(sp);
        ul.appendChild(li);
        return;
      }
      const histBtn = document.getElementById('btnScopeFolderHistory');
      for (const fp of paths) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dropdown-item small text-start';
        b.textContent = fp;
        b.title = fp;
        b.addEventListener('click', () => {
          if (histBtn) bootstrap.Dropdown.getOrCreateInstance(histBtn).hide();
          void applySearchScopeAndRefresh(fp);
        });
        li.appendChild(b);
        ul.appendChild(li);
      }
      refreshTagFoxChromeTooltips(ul);
    }

    function renderFavFoldersBar() {
      const el = document.getElementById('favFoldersBar');
      if (!el) return;
      el.innerHTML = '';
      const paths = loadFavouriteFolders();
      for (const fp of paths) {
        const row = document.createElement('span');
        row.className = 'd-inline-flex align-items-stretch';
        const grp = document.createElement('div');
        grp.className = 'btn-group btn-group-sm fav-folder-chip-group';
        const go = document.createElement('button');
        go.type = 'button';
        /* Amber folder icon + parseSegmentTags pretty + badges; pill colours from #favFoldersBar CSS. */
        go.className = 'btn btn-sm fav-folder-chip-go d-inline-flex align-items-center flex-wrap gap-1 text-start';
        const n = String(fp || '').replace(/[/\\]+$/, '');
        const base = T.baseName(n) || n;
        const parsed = T.parseSegmentTags(base);
        let pretty = parsed.pretty || base;
        const max = 26;
        if (pretty.length > max) pretty = pretty.slice(0, max - 1) + '…';
        const lead = document.createElement('span');
        lead.className = 'd-inline-flex align-items-center gap-1';
        lead.appendChild(folderIconEl());
        const nm = document.createElement('span');
        nm.textContent = pretty;
        lead.appendChild(nm);
        go.appendChild(lead);
        for (const tag of parsed.tags) {
          const b = document.createElement('span');
          b.className = 'badge';
          b.style.backgroundColor = tagColorCss(tag);
          b.style.color = '#212529';
          b.textContent = tag;
          go.appendChild(b);
        }
        go.title = fp + ' — click to set scope';
        go.addEventListener('click', () => void applySearchScopeAndRefresh(fp));
        const ddWrap = document.createElement('div');
        ddWrap.className = 'dropdown';
        const ddBtn = document.createElement('button');
        ddBtn.type = 'button';
        ddBtn.className = 'btn btn-sm dropdown-toggle fav-folder-chip-chevron tagfox-scope-chevron';
        ddBtn.setAttribute('data-bs-toggle', 'dropdown');
        ddBtn.setAttribute('aria-expanded', 'false');
        ddBtn.setAttribute('aria-label', 'Subfolders of this favourite');
        ddBtn.title = 'Browse subfolders (same nested flyouts as breadcrumb ▾)';
        ddBtn.innerHTML = '<span class="visually-hidden">Subfolders</span>' + breadcrumbDropdownChevronHtml();
        const menu = document.createElement('ul');
        const parentNorm = normalizeFolderPathForEverything(fp);
        const hl = breadcrumbHighlightChildPathNorm(parentNorm);
        bindSubfolderDropdownWithFlyouts(ddBtn, menu, ddWrap, parentNorm, hl || '', true);
        grp.appendChild(go);
        ddWrap.appendChild(ddBtn);
        ddWrap.appendChild(menu);
        grp.appendChild(ddWrap);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn btn-outline-secondary btn-sm px-1 ms-1';
        rm.setAttribute('aria-label', 'Remove');
        rm.textContent = '×';
        rm.title = 'Remove from favourites';
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = loadFavouriteFolders().filter((p) => p.toLowerCase() !== fp.toLowerCase());
          saveFavouriteFolders(next);
          renderFavFoldersBar();
        });
        row.appendChild(grp);
        row.appendChild(rm);
        el.appendChild(row);
      }
      refreshTagFoxChromeTooltips(el);
    }

    function loadFavouriteSearches() {
      try {
        const raw = localStorage.getItem(LS.favSearches);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : [];
      } catch {
        return [];
      }
    }

    function saveFavouriteSearches(entries) {
      localStorage.setItem(LS.favSearches, JSON.stringify(entries.slice(0, 30)));
    }

    /** Tooltip: full snapshot summary (same fields as search history). slotIdx 0–8 → Ctrl+1…9 in the shortcuts table. */
    function favouriteSearchTooltip(s, slotIdx) {
      const q = s.query != null ? String(s.query) : '';
      const sc = (s.rootFolder != null ? String(s.rootFolder) : '').trim();
      const tags = Array.isArray(s.activeTagKeys) ? [...s.activeTagKeys].filter(Boolean).sort() : [];
      const type =
        s.optFoldersOnly && s.optFilesOnly ? 'both'
        : s.optFoldersOnly ? 'folders only'
        : s.optFilesOnly ? 'files only'
        : 'both';
      const lines = [];
      if (slotIdx >= 0 && slotIdx < 9) {
        lines.push('Shortcut: Ctrl+' + (slotIdx + 1));
        lines.push('');
      }
      lines.push(
        'Click to restore this search.',
        '',
        'Query: ' + (q.trim() || '(empty)'),
        'Scope: ' + (sc || '(entire index)'),
      );
      if (tags.length) lines.push('Tags: ' + tags.join(', '));
      lines.push('Tag combine: ' + (s.tagFilterCombineOr ? 'OR' : 'AND'));
      lines.push('Recursive: ' + (s.recursive ? 'on' : 'off'));
      lines.push(
        'Match: case=' +
          !!s.optCase +
          ' path=' +
          !!s.optPath +
          ' whole=' +
          !!s.optWholeWord +
          ' regex=' +
          !!s.optRegex +
          ' diacritics=' +
          !!s.optDiacritics
      );
      lines.push('Types: ' + type);
      lines.push(
        'Recency: ' +
          (s.recencyFilter && s.recencyFilter !== 'all' ? String(s.recencyFilter) + ' (modified)' : 'all')
      );
      lines.push('Hide . / ~: ' + !!s.optHideDotFolders);
      lines.push('Sort folders with files (Settings): ' + (s.optSortFoldersWithFiles !== false));
      lines.push('Sort: ' + (s.sortColumn || 'name') + ' ' + (s.sortAsc !== false ? 'asc' : 'desc'));
      {
        const norm = normalizeColVisibleFromSaved(s.colVisible);
        if (norm) {
          const map = [
            ['Name', norm[1]],
            ['Path', norm[2]],
            ['Type', norm[3]],
            ['Size', norm[4]],
            ['Modified', norm[5]],
            ['Actions', norm[6]],
          ];
          lines.push(
            'Columns: ' +
              map
                .filter((x) => !!x[1])
                .map((x) => x[0])
                .join(', ')
          );
        }
      }
      lines.push('Advanced panel: ' + (s.advancedPanelOpen ? 'open' : 'closed'));
      return lines.join('\n');
    }

    function renderFavSearchesBar() {
      const el = document.getElementById('favSearchesBar');
      if (!el) return;
      el.innerHTML = '';
      const entries = loadFavouriteSearches();
      entries.forEach((s, idx) => {
        const row = document.createElement('span');
        row.className = 'd-inline-flex align-items-stretch';
        const grp = document.createElement('div');
        grp.className = 'btn-group btn-group-sm fav-search-chip-group';
        const n = idx + 1;
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'btn btn-sm fav-search-chip-go d-inline-flex align-items-center';
        go.textContent = String(n);
        const a11y =
          'Restore saved search ' +
          n +
          (idx < 9 ? ' (keyboard Ctrl+' + n + ')' : '') +
          '. Hover for query, scope, and filters.';
        go.setAttribute('aria-label', a11y);
        go.title = favouriteSearchTooltip(s, idx);
        go.addEventListener('click', () => void applyFavouriteSearchState(s));
        grp.appendChild(go);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn btn-outline-secondary btn-sm px-1 ms-1';
        rm.setAttribute('aria-label', 'Remove');
        rm.textContent = '×';
        rm.title = 'Remove saved search';
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = loadFavouriteSearches();
          if (idx >= 0 && idx < next.length) {
            next.splice(idx, 1);
            saveFavouriteSearches(next);
          }
          renderFavSearchesBar();
        });
        row.appendChild(grp);
        row.appendChild(rm);
        el.appendChild(row);
      });
      refreshTagFoxChromeTooltips(el);
    }

    /** Search box hint: last segment of scope (pretty title), or entire-index wording when scope empty. */
    function updateQueryPlaceholder() {
      const q = document.getElementById('query');
      if (!q) return;
      const scopeRaw = document.getElementById('rootFolder').value.trim();
      if (!scopeRaw) {
        q.placeholder = 'Search inside (entire index)';
        return;
      }
      const norm = normalizeFolderPathForEverything(scopeRaw).replace(/[/\\]+$/, '');
      const seg = T.baseName(norm);
      const pretty = (segmentPretty(seg) || seg || 'folder').trim();
      q.placeholder = 'Search inside ' + pretty;
    }

    /** Breadcrumb bar only depends on scope folder + Recursive — not on which result row is selected. */
    let renderedScopeBreadcrumbKey = null;
    function currentScopeBreadcrumbKey() {
      const raw = document.getElementById('rootFolder').value.trim();
      const rec = document.getElementById('folderSearchRecursive').checked;
      return raw + '\0' + (rec ? '1' : '0');
    }

    /** Avoid rebuilding breadcrumb when selection/table updates would destroy open ▾ + flyouts for nothing. */
    function renderScopeBreadcrumbIfScopeChanged() {
      if (currentScopeBreadcrumbKey() === renderedScopeBreadcrumbKey) return;
      renderScopeBreadcrumb();
    }

    /** Chevron-down icon for breadcrumb ▾ scope toggles. */
    function breadcrumbDropdownChevronHtml() {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>';
    }

    /**
     * Hover opens ▾ menus (click still works). No mouseleave-close: flyouts live on document.body; the pointer must
     * leave .dropdown to reach them. Other ▾ close on this menu’s mouseenter; their hidden.bs.dropdown clears flyouts.
     */
    function bindBreadcrumbDropdownHover(ddWrap, toggleEl) {
      ddWrap.addEventListener('mouseenter', () => {
        document
          .querySelectorAll('#breadcrumbBar [data-bs-toggle="dropdown"], #favFoldersBar [data-bs-toggle="dropdown"]')
          .forEach((btn) => {
            if (btn === toggleEl) return;
            const o = bootstrap.Dropdown.getInstance(btn);
            if (o) o.hide();
          });
        bootstrap.Dropdown.getOrCreateInstance(toggleEl).show();
      });
    }

    /**
     * Trailing-▾ pattern: list direct subfolders of parentPathRaw + chained ul.breadcrumb-folder-flyout (same IPC as breadcrumb).
     * highlightPathNorm: optional path segment hint along current scope. hoverOpen: hover-opens-menu on ddWrap (breadcrumb + favourites; fav wraps only ▾ + menu so Go isn’t hijacked).
     */
    function bindSubfolderDropdownWithFlyouts(ddBtn, menu, ddWrap, parentPathRaw, highlightPathNorm, hoverOpen) {
      const parentForList = normalizeFolderPathForEverything(parentPathRaw);
      menu.className = 'dropdown-menu dropdown-menu-start py-1 small shadow';
      menu.style.maxHeight = 'min(50vh, 280px)';
      menu.style.overflow = 'auto';
      menu.addEventListener('scroll', () => repositionBreadcrumbFlyoutChain());
      menu.addEventListener('mouseenter', cancelBreadcrumbFlyoutHideTimer);
      menu.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight') return;
        const t = e.target;
        if (!t.classList || !t.classList.contains('dropdown-item') || !menu.contains(t)) return;
        const li = t.closest('li');
        const path = li && li.dataset.breadcrumbFlyoutPath;
        if (!path) return;
        e.preventDefault();
        e.stopPropagation();
        cancelBreadcrumbFlyoutHideTimer();
        void (async () => {
          await openBreadcrumbSubfolderFlyoutForPath(path, li, ddBtn, 0);
          const fly0 = breadcrumbSubfolderFlyoutChain[0];
          const first = fly0 && fly0.querySelector('button.dropdown-item');
          if (first) first.focus();
        })();
      });
      ddBtn.addEventListener('click', (e) => e.stopPropagation());
      ddBtn.addEventListener('hide.bs.dropdown', (ev) => {
        if (focusInsideBreadcrumbFlyout()) ev.preventDefault();
      });
      ddBtn.addEventListener('hidden.bs.dropdown', () => hideBreadcrumbSubfolderFlyout());
      ddBtn.addEventListener('show.bs.dropdown', () => {
        menu.innerHTML =
          '<li><span class="dropdown-item-text text-muted">' +
          (window.tagBrowser.listChildFolders ? 'Loading…' : 'Not available') +
          '</span></li>';
        if (!window.tagBrowser.listChildFolders) return;
        void (async () => {
          const r = await window.tagBrowser.listChildFolders({ parentPath: parentForList });
          menu.innerHTML = '';
          if (!r || !r.ok) {
            const li0 = document.createElement('li');
            li0.innerHTML =
              '<span class="dropdown-item-text text-danger small">' +
              (r && r.error ? String(r.error) : 'Could not list folders') +
              '</span>';
            menu.appendChild(li0);
            return;
          }
          const folders = r.folders || [];
          if (!folders.length) {
            const li0 = document.createElement('li');
            li0.innerHTML = '<span class="dropdown-item-text text-muted">(no subfolders)</span>';
            menu.appendChild(li0);
            return;
          }
          const opts = { onMouseLeaveRow: scheduleHideBreadcrumbSubfolderFlyout };
          if (highlightPathNorm) opts.highlightPathNorm = highlightPathNorm;
          appendBreadcrumbFolderListItems(menu, folders, ddBtn, 0, opts);
        })();
      });
      if (hoverOpen && ddWrap) bindBreadcrumbDropdownHover(ddWrap, ddBtn);
    }

    // --- Trailing breadcrumb ▾: chained flyouts (hover + focus moves load; ArrowRight/ArrowLeft). ---
    const breadcrumbSubfolderFlyoutChain = [];
    let breadcrumbSubfolderFlyoutHideTimer = null;
    const BREADCRUMB_FLYOUT_MAX_DEPTH = 24;

    function cancelBreadcrumbFlyoutHideTimer() {
      if (breadcrumbSubfolderFlyoutHideTimer) {
        clearTimeout(breadcrumbSubfolderFlyoutHideTimer);
        breadcrumbSubfolderFlyoutHideTimer = null;
      }
    }

    function scheduleHideBreadcrumbSubfolderFlyout() {
      if (breadcrumbSubfolderFlyoutHideTimer) clearTimeout(breadcrumbSubfolderFlyoutHideTimer);
      breadcrumbSubfolderFlyoutHideTimer = setTimeout(() => hideBreadcrumbSubfolderFlyout(), 120);
    }

    /** Hide flyout panels with index > depth (keep 0..depth). depth -1 = hide all. */
    function closeBreadcrumbFlyoutsDeeperThan(depth) {
      for (let i = depth + 1; i < breadcrumbSubfolderFlyoutChain.length; i++) {
        const fly = breadcrumbSubfolderFlyoutChain[i];
        fly.classList.remove('is-open');
        fly.innerHTML = '';
        fly._anchorLi = null;
      }
    }

    function breadcrumbSubfolderFlyoutsAreOpen() {
      return breadcrumbSubfolderFlyoutChain.some((f) => f.classList.contains('is-open'));
    }

    /** Bootstrap closes the open ▾ when focus moves into a body-rooted flyout; cancel that hide. */
    function focusInsideBreadcrumbFlyout() {
      const a = document.activeElement;
      return !!(a && a.closest && a.closest('ul.breadcrumb-folder-flyout'));
    }

    function hideBreadcrumbSubfolderFlyout() {
      cancelBreadcrumbFlyoutHideTimer();
      for (const fly of breadcrumbSubfolderFlyoutChain) fly._loadGen = (fly._loadGen | 0) + 1;
      closeBreadcrumbFlyoutsDeeperThan(-1);
    }

    function ensureBreadcrumbFlyoutAtDepth(depth) {
      if (depth > BREADCRUMB_FLYOUT_MAX_DEPTH) return null;
      while (breadcrumbSubfolderFlyoutChain.length <= depth) {
        const d = breadcrumbSubfolderFlyoutChain.length;
        const ul = document.createElement('ul');
        if (d === 0) ul.id = 'breadcrumbSubfolderFlyout';
        ul.className = 'breadcrumb-folder-flyout small shadow';
        ul.dataset.breadcrumbFlyoutDepth = String(d);
        /* Above fav/breadcrumb toolbars; stay below .modal-backdrop (1100). */
        ul.style.zIndex = String(Math.min(1092 + d, 1099));
        ul.addEventListener('mouseenter', cancelBreadcrumbFlyoutHideTimer);
        ul.addEventListener('mouseleave', scheduleHideBreadcrumbSubfolderFlyout);
        ul.addEventListener('scroll', () => repositionBreadcrumbFlyoutChain());
        ul.addEventListener('keydown', (e) => onBreadcrumbFlyoutKeydown(e, ul, d));
        document.body.appendChild(ul);
        breadcrumbSubfolderFlyoutChain.push(ul);
      }
      return breadcrumbSubfolderFlyoutChain[depth];
    }

    function positionBreadcrumbFlyoutAtDepth(depth) {
      const fly = breadcrumbSubfolderFlyoutChain[depth];
      const li = fly && fly._anchorLi;
      if (!fly || !li || !fly.classList.contains('is-open')) return;
      const r = li.getBoundingClientRect();
      fly.style.left = r.right + 2 + 'px';
      fly.style.top = r.top + 'px';
      requestAnimationFrame(() => {
        if (!fly.classList.contains('is-open') || fly._anchorLi !== li) return;
        const fr = fly.getBoundingClientRect();
        let left = r.right + 2;
        let top = r.top;
        if (left + fr.width > window.innerWidth - 8) left = Math.max(8, r.left - fr.width - 2);
        if (top + fr.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - fr.height - 8);
        fly.style.left = left + 'px';
        fly.style.top = top + 'px';
      });
    }

    function repositionBreadcrumbFlyoutChain() {
      for (let d = 0; d < breadcrumbSubfolderFlyoutChain.length; d++) {
        const fly = breadcrumbSubfolderFlyoutChain[d];
        if (fly.classList.contains('is-open') && fly._anchorLi) positionBreadcrumbFlyoutAtDepth(d);
      }
    }

    function onBreadcrumbFlyoutKeydown(e, flyEl, depth) {
      const navT = e.target;
      if (
        (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
        navT.classList &&
        navT.classList.contains('dropdown-item') &&
        flyEl.contains(navT)
      ) {
        const buttons = [...flyEl.querySelectorAll('button.dropdown-item')];
        const idx = buttons.indexOf(navT);
        if (idx >= 0) {
          const dest = e.key === 'ArrowDown' ? buttons[idx + 1] : buttons[idx - 1];
          if (dest) {
            e.preventDefault();
            e.stopPropagation();
            dest.focus();
          }
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        const t = e.target;
        if (!t.classList || !t.classList.contains('dropdown-item') || !flyEl.contains(t)) return;
        const li = t.closest('li');
        const path = li && li.dataset.breadcrumbFlyoutPath;
        if (!path || !flyEl._subBtnToggle) return;
        e.preventDefault();
        e.stopPropagation();
        cancelBreadcrumbFlyoutHideTimer();
        void (async () => {
          await openBreadcrumbSubfolderFlyoutForPath(path, li, flyEl._subBtnToggle, depth + 1);
          const next = breadcrumbSubfolderFlyoutChain[depth + 1];
          const first = next && next.querySelector('button.dropdown-item');
          if (first) first.focus();
        })();
        return;
      }
      if (e.key !== 'ArrowLeft') return;
      const t = e.target;
      if (!t.classList || !t.classList.contains('dropdown-item') || !flyEl.contains(t)) return;
      const parentBtn =
        flyEl._anchorLi && flyEl._anchorLi.querySelector && flyEl._anchorLi.querySelector('button.dropdown-item');
      if (!parentBtn) return;
      e.preventDefault();
      e.stopPropagation();
      if (depth <= 0) {
        hideBreadcrumbSubfolderFlyout();
        parentBtn.focus();
        return;
      }
      closeBreadcrumbFlyoutsDeeperThan(depth - 1);
      parentBtn.focus();
    }

    /** Normalized (trim trail sep, lower) child of `parentPath` that continues toward current scope, or '' if none. */
    function breadcrumbHighlightChildPathNorm(parentPath) {
      const scopeRaw = document.getElementById('rootFolder').value.trim();
      if (!scopeRaw) return '';
      const scopeNorm = normalizeFolderPathForEverything(scopeRaw).replace(/[/\\]+$/, '').toLowerCase();
      const parentNorm = normalizeFolderPathForEverything(String(parentPath || '').trim()).replace(/[/\\]+$/, '').toLowerCase();
      if (!parentNorm || scopeNorm.length < parentNorm.length) return '';
      if (scopeNorm === parentNorm) return '';
      if (!scopeNorm.startsWith(parentNorm)) return '';
      if (scopeNorm.length > parentNorm.length) {
        const c = scopeNorm.charAt(parentNorm.length);
        if (c !== '/' && c !== '\\') return '';
      }
      const rest = scopeNorm.slice(parentNorm.length).replace(/^[\\/]+/, '');
      if (!rest) return '';
      const firstSeg = rest.split(/[/\\]/)[0];
      if (!firstSeg) return '';
      const base = normalizeFolderPathForEverything(parentPath).replace(/[/\\]+$/, '');
      const sep = base.includes('/') ? '/' : '\\';
      return normalizeFolderPathForEverything(base + sep + firstSeg).replace(/[/\\]+$/, '').toLowerCase();
    }

    /**
     * Shared folder rows for breadcrumb ▾ menus and nested flyouts (click = scope; hover = deeper flyout).
     * @param {HTMLElement} ulEl
     * @param {Array<{name:string,fullPath:string}>} folders
     * @param {HTMLElement} toggleBtn — Bootstrap dropdown toggle (hide on pick).
     * @param {number} openFlyoutAtDepth — arg to openBreadcrumbSubfolderFlyoutForPath (0 = from main dropdowns).
     * @param {{ highlightPathNorm?: string, onMouseLeaveRow?: () => void }} [opts]
     */
    function appendBreadcrumbFolderListItems(ulEl, folders, toggleBtn, openFlyoutAtDepth, opts) {
      const o = opts || {};
      for (const f of folders) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dropdown-item py-1';
        if (o.highlightPathNorm) {
          const fpNorm = f.fullPath.replace(/[/\\]+$/, '').toLowerCase();
          if (fpNorm === o.highlightPathNorm) li.classList.add('breadcrumb-folder-on-scope-path');
        }
        b.textContent = segmentPretty(f.name);
        b.title = f.fullPath;
        li.dataset.breadcrumbFlyoutPath = f.fullPath;
        b.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          hideBreadcrumbSubfolderFlyout();
          const inst = bootstrap.Dropdown.getInstance(toggleBtn);
          if (inst) inst.hide();
          await applySearchScopeAndRefresh(normalizeFolderPathForEverything(f.fullPath));
        });
        const onEnterRow = () => {
          cancelBreadcrumbFlyoutHideTimer();
          void openBreadcrumbSubfolderFlyoutForPath(f.fullPath, li, toggleBtn, openFlyoutAtDepth);
        };
        /* Same path as keyboard: focus the row button so Bootstrap :focus styling applies (avoid hover-only vs focus-only mismatch). */
        li.addEventListener('mouseenter', () => {
          if (document.activeElement !== b) b.focus({ preventScroll: true });
        });
        li.addEventListener('focusin', (ev) => {
          if (ev.target === b) onEnterRow();
        });
        if (o.onMouseLeaveRow) li.addEventListener('mouseleave', o.onMouseLeaveRow);
        li.appendChild(b);
        ulEl.appendChild(li);
      }
    }

    /** One level: folder rows + hover/focus opens deeper flyout; click applies scope. */
    function populateBreadcrumbSubfolderFlyoutAtDepth(flyEl, folders, subBtnToggle, depth, parentPath) {
      flyEl.innerHTML = '';
      flyEl._subBtnToggle = subBtnToggle;
      // Nested flyout: no per-row mouseleave (gap → timer); rely on ul mouseleave + outside pointer.
      const hl = breadcrumbHighlightChildPathNorm(parentPath);
      appendBreadcrumbFolderListItems(flyEl, folders, subBtnToggle, depth + 1, hl ? { highlightPathNorm: hl } : {});
      flyEl.classList.add('is-open');
      positionBreadcrumbFlyoutAtDepth(depth);
    }

    /** @returns {Promise<void>} */
    async function openBreadcrumbSubfolderFlyoutForPath(parentPath, anchorLi, subBtnToggle, depth) {
      if (depth > BREADCRUMB_FLYOUT_MAX_DEPTH) return;
      closeBreadcrumbFlyoutsDeeperThan(depth);
      const fly = ensureBreadcrumbFlyoutAtDepth(depth);
      if (!fly) return;
      fly._anchorLi = anchorLi;
      fly._subBtnToggle = subBtnToggle;
      fly._loadGen = (fly._loadGen | 0) + 1;
      const loadGen = fly._loadGen;
      fly.innerHTML =
        '<li><span class="dropdown-item-text text-muted">' +
        (window.tagBrowser.listChildFolders ? 'Loading…' : 'Not available') +
        '</span></li>';
      fly.classList.add('is-open');
      positionBreadcrumbFlyoutAtDepth(depth);
      if (!window.tagBrowser.listChildFolders) return;
      const r = await window.tagBrowser.listChildFolders({ parentPath });
      if (fly._loadGen !== loadGen || fly._anchorLi !== anchorLi) return;
      if (!subBtnToggle.isConnected) {
        hideBreadcrumbSubfolderFlyout();
        return;
      }
      if (subBtnToggle.getAttribute('aria-expanded') !== 'true') {
        hideBreadcrumbSubfolderFlyout();
        return;
      }
      fly.innerHTML = '';
      fly._subBtnToggle = subBtnToggle;
      if (!r || !r.ok) {
        const li0 = document.createElement('li');
        li0.innerHTML =
          '<span class="dropdown-item-text text-danger small">' +
          (r && r.error ? String(r.error) : 'Could not list folders') +
          '</span>';
        fly.appendChild(li0);
        positionBreadcrumbFlyoutAtDepth(depth);
        return;
      }
      const folders = r.folders || [];
      if (!folders.length) {
        const li0 = document.createElement('li');
        li0.innerHTML = '<span class="dropdown-item-text text-muted">(no subfolders)</span>';
        fly.appendChild(li0);
        positionBreadcrumbFlyoutAtDepth(depth);
        return;
      }
      populateBreadcrumbSubfolderFlyoutAtDepth(fly, folders, subBtnToggle, depth, parentPath);
    }

    /** Folder trail: segments set scope; ▾ opens sibling/subfolder menus (hover or click). */
    function renderScopeBreadcrumb() {
      hideBreadcrumbSubfolderFlyout();
      updateQueryPlaceholder();
      const el = document.getElementById('breadcrumbBar');
      el.innerHTML = '';
      const scopeRaw = document.getElementById('rootFolder').value.trim();
      const btnClear = document.getElementById('btnClearScope');
      if (!scopeRaw) {
        el.classList.add('d-none');
        el.classList.remove('d-flex');
        if (btnClear) btnClear.disabled = true;
        syncStatusBarParentScopeButton();
        renderedScopeBreadcrumbKey = currentScopeBreadcrumbKey();
        return;
      }
      if (btnClear) btnClear.disabled = false;
      el.classList.remove('d-none');
      el.classList.add('d-flex', 'align-items-center', 'flex-wrap', 'gap-0');
      const norm = normalizeFolderPathForEverything(scopeRaw).replace(/[/\\]+$/, '');
      const sep = norm.includes('/') ? '/' : '\\';
      const parts = norm.split(/[/\\]/).filter((p) => p !== '');
      let acc = '';
      parts.forEach((part, i) => {
        acc = i === 0 ? part : acc + sep + part;
        const wrap = document.createElement('span');
        wrap.className = 'd-inline-flex align-items-center flex-wrap';
        const parsed = T.parseSegmentTags(part);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-link btn-sm p-0 align-baseline';
        btn.textContent = parsed.pretty;
        const folderForSearch = normalizeFolderPathForEverything(acc);
        wrap.dataset.dropPath = folderForSearch; // internal drag-drop target (move into this folder)
        btn.title =
          'Scope: ' + folderForSearch + (document.getElementById('folderSearchRecursive').checked ? ' (recursive)' : ' (this folder only)');
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await applySearchScopeAndRefresh(folderForSearch);
        });
        wrap.appendChild(btn);
        for (const tag of parsed.tags) {
          const b = document.createElement('span');
          b.className = 'badge ms-1';
          b.style.backgroundColor = tagColorCss(tag);
          b.style.color = '#212529';
          b.textContent = tag;
          wrap.appendChild(b);
        }
        el.appendChild(wrap);
        if (i < parts.length - 1) {
          const parentForPeers = folderForSearch;
          let accNext = '';
          for (let j = 0; j <= i + 1; j++) {
            accNext = j === 0 ? parts[j] : accNext + sep + parts[j];
          }
          const targetChildNorm = normalizeFolderPathForEverything(accNext).replace(/[/\\]+$/, '').toLowerCase();

          const chevronWrap = document.createElement('span');
          chevronWrap.className = 'd-inline-flex align-items-center text-muted user-select-none breadcrumb-scope-dd ps-1';

          const ddWrap = document.createElement('div');
          ddWrap.className = 'dropdown d-inline-block';
          const ddBtn = document.createElement('button');
          ddBtn.type = 'button';
          ddBtn.className =
            'btn btn-link btn-sm text-secondary py-0 px-2 align-baseline breadcrumb-dd-toggle tagfox-scope-chevron';
          ddBtn.innerHTML = breadcrumbDropdownChevronHtml();
          ddBtn.title = 'Other folders in this location';
          ddBtn.setAttribute('aria-label', 'Other folders in this location');
          ddBtn.setAttribute('data-bs-toggle', 'dropdown');
          ddBtn.setAttribute('aria-expanded', 'false');
          const menu = document.createElement('ul');
          menu.className = 'dropdown-menu dropdown-menu-start py-1 small shadow';
          menu.style.maxHeight = 'min(50vh, 280px)';
          menu.style.overflow = 'auto';
          menu.addEventListener('scroll', () => repositionBreadcrumbFlyoutChain());
          menu.addEventListener('mouseenter', cancelBreadcrumbFlyoutHideTimer);
          /* Flyout open: row button focusin via appendBreadcrumbFolderListItems (mouseenter focuses button). */
          menu.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight') return;
            const t = e.target;
            if (!t.classList || !t.classList.contains('dropdown-item') || !menu.contains(t)) return;
            const li = t.closest('li');
            const path = li && li.dataset.breadcrumbFlyoutPath;
            if (!path) return;
            e.preventDefault();
            e.stopPropagation();
            cancelBreadcrumbFlyoutHideTimer();
            void (async () => {
              await openBreadcrumbSubfolderFlyoutForPath(path, li, ddBtn, 0);
              const fly0 = breadcrumbSubfolderFlyoutChain[0];
              const first = fly0 && fly0.querySelector('button.dropdown-item');
              if (first) first.focus();
            })();
          });

          ddBtn.addEventListener('click', (e) => e.stopPropagation());
          ddBtn.addEventListener('hide.bs.dropdown', (ev) => {
            if (focusInsideBreadcrumbFlyout()) ev.preventDefault();
          });
          ddBtn.addEventListener('hidden.bs.dropdown', () => hideBreadcrumbSubfolderFlyout());

          ddBtn.addEventListener('show.bs.dropdown', () => {
            menu.innerHTML =
              '<li><span class="dropdown-item-text text-muted">' +
              (window.tagBrowser.listChildFolders ? 'Loading…' : 'Not available') +
              '</span></li>';
            if (!window.tagBrowser.listChildFolders) return;
            void (async () => {
              const r = await window.tagBrowser.listChildFolders({ parentPath: parentForPeers });
              menu.innerHTML = '';
              if (!r || !r.ok) {
                const li0 = document.createElement('li');
                li0.innerHTML =
                  '<span class="dropdown-item-text text-danger small">' +
                  (r && r.error ? String(r.error) : 'Could not list folders') +
                  '</span>';
                menu.appendChild(li0);
                return;
              }
              const folders = r.folders || [];
              if (!folders.length) {
                const li0 = document.createElement('li');
                li0.innerHTML = '<span class="dropdown-item-text text-muted">(no subfolders)</span>';
                menu.appendChild(li0);
                return;
              }
              appendBreadcrumbFolderListItems(menu, folders, ddBtn, 0, {
                highlightPathNorm: targetChildNorm,
                onMouseLeaveRow: scheduleHideBreadcrumbSubfolderFlyout,
              });
            })();
          });

          ddWrap.appendChild(ddBtn);
          ddWrap.appendChild(menu);
          bindBreadcrumbDropdownHover(ddWrap, ddBtn);
          chevronWrap.appendChild(ddWrap);
          el.appendChild(chevronWrap);
        }
      });
      // ▾ after current folder: immediate subfolders (same API as between-segment picker).
      const scopeFolder = normalizeFolderPathForEverything(scopeRaw);
      const subWrap = document.createElement('span');
      subWrap.className = 'd-inline-flex align-items-center text-muted user-select-none breadcrumb-scope-dd ms-1';
      const subDd = document.createElement('div');
      subDd.className = 'dropdown d-inline-block';
      const subBtn = document.createElement('button');
      subBtn.type = 'button';
      subBtn.className =
        'btn btn-link btn-sm text-secondary py-0 px-2 align-baseline breadcrumb-dd-toggle tagfox-scope-chevron';
      subBtn.innerHTML = breadcrumbDropdownChevronHtml();
      subBtn.title = 'Subfolders of current scope';
      subBtn.setAttribute('aria-label', 'Subfolders of current scope');
      subBtn.setAttribute('data-bs-toggle', 'dropdown');
      subBtn.setAttribute('aria-expanded', 'false');
      const subMenu = document.createElement('ul');
      bindSubfolderDropdownWithFlyouts(subBtn, subMenu, subDd, scopeFolder, '', true);
      subDd.appendChild(subBtn);
      subDd.appendChild(subMenu);
      subWrap.appendChild(subDd);
      el.appendChild(subWrap);
      syncStatusBarParentScopeButton();
      renderedScopeBreadcrumbKey = currentScopeBreadcrumbKey();
      refreshTagFoxChromeTooltips(document.getElementById('breadcrumbBar'));
    }

    function mdPreviewHtml(md) {
      try {
        const src = md || '';
        if (typeof marked !== 'undefined' && marked.parse) return marked.parse(src, { async: false });
        if (typeof marked !== 'undefined' && marked.marked && marked.marked.parse) return marked.marked.parse(src);
      } catch (_) {
        return '<p class="text-danger small">Preview error.</p>';
      }
      return '<p class="text-muted">Preview unavailable.</p>';
    }

    function rootPrefixValue() {
      return document.getElementById('rootFolder').value.trim();
    }

    /** Safe single path segment for a new filename (no path separators). */
    function sanitizeFileTitleSegment(s) {
      let t = String(s || '').trim();
      t = t.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
      if (!t) return 'untitled';
      if (t.length > 120) t = t.slice(0, 120);
      return t;
    }

    /** User pattern with * and ? → RegExp source (* = any run, ? = one char; other regex chars escaped). */
    function wildcardPatternToRegExpSource(pattern) {
      let s = '';
      for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === '*') s += '.*';
        else if (c === '?') s += '.';
        else s += c.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
      }
      return s;
    }

    /** Longest contiguous substring that appears in every name (for bulk-rename prefill). */
    function longestCommonSubstringAmong(names) {
      const arr = (names || []).map((n) => String(n ?? ''));
      if (arr.length === 0) return '';
      if (arr.length === 1) return arr[0];
      let shortest = arr[0];
      for (const s of arr) if (s.length < shortest.length) shortest = s;
      for (let len = shortest.length; len >= 1; len--) {
        for (let i = 0; i + len <= shortest.length; i++) {
          const sub = shortest.slice(i, i + len);
          if (arr.every((s) => s.includes(sub))) return sub;
        }
      }
      return '';
    }

    /** Strip trailing extension (last `.` segment) for prefill only; keeps `[(tags)]` etc. in the stem. */
    function basenameStemIgnoringExtension(segment) {
      const s = String(segment ?? '');
      const d = s.lastIndexOf('.');
      if (d > 0 && d < s.length - 1) return s.slice(0, d);
      return s;
    }

    /** Same RegExp as Apply; null if find empty or invalid. */
    function bulkRenameRegexFromFind(findRaw) {
      const raw = String(findRaw ?? '');
      if (!raw.trim()) return null;
      const matchCase = document.getElementById('optCase') && document.getElementById('optCase').checked;
      try {
        return new RegExp(wildcardPatternToRegExpSource(raw), matchCase ? 'g' : 'gi');
      } catch (_) {
        return null;
      }
    }

    function joinFolderAndFileName(folderAbs, fileName) {
      const f = folderAbs.replace(/[/\\]+$/, '');
      const sep = f.includes('/') ? '/' : '\\';
      return f + sep + fileName;
    }

    /** Modal folder name — Electron does not show window.prompt reliably. */
    function promptNewFolderNameModal() {
      return new Promise((resolve) => {
        const modalEl = document.getElementById('newFolderModal');
        const input = document.getElementById('newFolderNameInput');
        const btnCreate = document.getElementById('newFolderModalCreate');
        if (!modalEl || !input || !btnCreate) {
          resolve(null);
          return;
        }
        // focus: false — avoid focusing the modal shell; we focus the input in shown (must register shown before show()).
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { focus: false });
        let settled = false;
        const cleanup = () => {
          btnCreate.removeEventListener('click', onCreate);
          input.removeEventListener('keydown', onKey);
          modalEl.removeEventListener('hidden.bs.modal', onHidden);
        };
        const finish = (val) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(val);
        };
        const onCreate = () => {
          finish(input.value);
          modal.hide();
        };
        const onHidden = () => finish(null);
        const onKey = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCreate();
          }
        };
        input.value = 'New folder';
        btnCreate.addEventListener('click', onCreate);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        input.addEventListener('keydown', onKey);
        modalEl.addEventListener(
          'shown.bs.modal',
          () => {
            requestAnimationFrame(() => {
              input.focus();
              input.select();
            });
          },
          { once: true }
        );
        modal.show();
      });
    }

    /** Full rename: new filename segment (tags/extension as now); Electron prompt unreliable. */
    function promptRenameItemModal(fullPath, initialBase) {
      return new Promise((resolve) => {
        const modalEl = document.getElementById('renameItemModal');
        const hint = document.getElementById('renameItemPathHint');
        const input = document.getElementById('renameItemNameInput');
        const btnApply = document.getElementById('renameItemModalApply');
        if (!modalEl || !hint || !input || !btnApply) {
          resolve(null);
          return;
        }
        hint.textContent = String(fullPath || '');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { focus: false });
        let settled = false;
        const cleanup = () => {
          btnApply.removeEventListener('click', onApply);
          input.removeEventListener('keydown', onKey);
          modalEl.removeEventListener('hidden.bs.modal', onHidden);
        };
        const finish = (val) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(val);
        };
        const onApply = () => {
          finish(input.value);
          modal.hide();
        };
        const onHidden = () => finish(null);
        const onKey = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onApply();
          }
        };
        input.value = String(initialBase || '');
        btnApply.addEventListener('click', onApply);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        input.addEventListener('keydown', onKey);
        modalEl.addEventListener(
          'shown.bs.modal',
          () => {
            requestAnimationFrame(() => {
              input.focus();
              input.select();
            });
          },
          { once: true }
        );
        modal.show();
      });
    }

    /** Rename selected row (optional path for ⋯ menu). Same folder only; respects rootPrefix in main. */
    async function renameItemInteractive(fpOpt) {
      const status = document.getElementById('status');
      const fp = String(fpOpt || selectedFullPath || '').trim();
      if (!fp) {
        status.textContent = 'Select a row to rename.';
        return;
      }
      if (renameItemBusy || tagRenameBusy) return;
      const base = T.baseName(fp);
      const raw = await promptRenameItemModal(fp, base);
      if (raw === null) return;
      const newBase = sanitizeFileTitleSegment(String(raw || '').trim());
      if (!newBase || newBase === base) return;
      const parent = T.parentDir(fp);
      const sep = fp.includes('/') ? '/' : '\\';
      const toPath = parent ? parent + sep + newBase : newBase;
      const fromN = fp.replace(/[/\\]+$/, '').toLowerCase();
      const toN = toPath.replace(/[/\\]+$/, '').toLowerCase();
      if (fromN === toN) return;
      renameItemBusy = true;
      try {
        const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
        const mdWas = mdAutosaveTargetPath && mdAutosaveTargetPath.replace(/[/\\]+$/, '').toLowerCase() === fromN;
        if (mdWas) await flushMdFileAutosave();
        const res = await window.tagBrowser.renamePath({ fromPath: fp, toPath, rootPrefix });
        if (!res || !res.ok) {
          status.textContent = (res && res.error) || 'Rename failed';
          return;
        }
        if (selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN) {
          selectedFullPath = toPath;
          renderScopeBreadcrumbIfScopeChanged();
        }
        if (mdWas) mdAutosaveTargetPath = toPath;
        status.textContent = 'Renamed.';
        void refreshAfterDiskMutation();
        refreshTagModalDatalist();
      } finally {
        renameItemBusy = false;
      }
    }

    const BULK_RENAME_PREVIEW_MAX = 200;

    /** Refresh preview table from Find/Replace + snapshot paths. */
    function updateBulkRenamePreview() {
      const tbody = document.getElementById('bulkRenamePreviewBody');
      const moreEl = document.getElementById('bulkRenamePreviewMore');
      const fb = document.getElementById('bulkRenameFeedback');
      const findEl = document.getElementById('bulkRenameFind');
      const replEl = document.getElementById('bulkRenameReplace');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (moreEl) {
        moreEl.classList.add('d-none');
        moreEl.textContent = '';
      }
      if (!bulkRenameTargetPaths.length) return;
      const findRaw = findEl ? String(findEl.value || '') : '';
      const replaceLit = replEl ? String(replEl.value || '') : '';
      if (fb) fb.textContent = '';
      if (!findRaw.trim()) {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td colspan="3" class="text-muted py-1 small">Enter a find pattern to see preview.</td>';
        tbody.appendChild(tr);
        return;
      }
      const re = bulkRenameRegexFromFind(findRaw);
      if (!re) {
        if (fb) fb.textContent = 'Invalid pattern.';
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td colspan="3" class="text-danger py-1 small">Invalid find pattern.</td>';
        tbody.appendChild(tr);
        return;
      }
      const rows = bulkRenameTargetPaths.map((fp) => T.baseName(fp));
      const shown = rows.slice(0, BULK_RENAME_PREVIEW_MAX);
      for (const base of shown) {
        const replaced = base.replace(re, () => replaceLit);
        const newBase = sanitizeFileTitleSegment(replaced);
        const unchanged = newBase === base;
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.className = 'py-1 text-break';
        td1.textContent = base;
        const td2 = document.createElement('td');
        td2.className = 'py-1 text-center text-muted';
        td2.textContent = '→';
        const td3 = document.createElement('td');
        td3.className = 'py-1 text-break' + (unchanged ? ' text-muted' : '');
        td3.textContent = unchanged ? '(no change)' : newBase;
        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tbody.appendChild(tr);
      }
      if (rows.length > BULK_RENAME_PREVIEW_MAX && moreEl) {
        moreEl.classList.remove('d-none');
        moreEl.textContent =
          'Showing first ' + BULK_RENAME_PREVIEW_MAX + ' of ' + rows.length + ' rows. Apply still affects all.';
      }
    }

    function openBulkRenameModal() {
      const paths = pathsForBulkRename();
      const status = document.getElementById('status');
      const hint = document.getElementById('bulkRenameTargetHint');
      const fb = document.getElementById('bulkRenameFeedback');
      const findEl = document.getElementById('bulkRenameFind');
      const replEl = document.getElementById('bulkRenameReplace');
      if (!hint || !document.getElementById('bulkRenameModal')) return;
      if (!paths.length) {
        if (status) status.textContent = 'Check rows or highlight one row to rename.';
        return;
      }
      bulkRenameTargetPaths = paths.slice();
      hint.textContent = paths.length + ' item(s) — name segment only';
      if (fb) fb.textContent = '';
      const basenames = bulkRenameTargetPaths.map((fp) => T.baseName(fp));
      const stems = basenames.map((b) => basenameStemIgnoringExtension(b));
      const common = longestCommonSubstringAmong(stems);
      if (findEl) findEl.value = common;
      if (replEl) replEl.value = common;
      updateBulkRenamePreview();
      if (!bulkRenameModalInst) {
        bulkRenameModalInst = new bootstrap.Modal(document.getElementById('bulkRenameModal'), { focus: false });
      }
      bulkRenameModalInst.show();
    }

    /** Wildcard find/replace on basename; same scope rules as single rename. */
    async function applyBulkRename() {
      const fb = document.getElementById('bulkRenameFeedback');
      const findEl = document.getElementById('bulkRenameFind');
      const replEl = document.getElementById('bulkRenameReplace');
      if (!findEl || !replEl) return;
      const findRaw = String(findEl.value || '');
      if (!findRaw.trim()) {
        if (fb) fb.textContent = 'Enter a find pattern.';
        return;
      }
      if (renameItemBusy || tagRenameBusy) return;
      const paths = bulkRenameTargetPaths.length ? bulkRenameTargetPaths : pathsForBulkRename();
      if (!paths.length) {
        if (fb) fb.textContent = 'Nothing selected.';
        return;
      }
      const replaceLit = String(replEl.value || '');
      const re = bulkRenameRegexFromFind(findRaw);
      if (!re) {
        if (fb) fb.textContent = 'Invalid pattern.';
        return;
      }
      const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
      const pathPairs = [];
      renameItemBusy = true;
      if (fb) fb.textContent = '';
      try {
        for (const fp of paths) {
          const base = T.baseName(fp);
          const replaced = base.replace(re, () => replaceLit);
          const newBase = sanitizeFileTitleSegment(replaced);
          if (newBase === base) continue;
          const parent = T.parentDir(fp);
          const sep = fp.includes('/') ? '/' : '\\';
          const toPath = parent ? parent + sep + newBase : newBase;
          const fromN = fp.replace(/[/\\]+$/, '').toLowerCase();
          const toN = toPath.replace(/[/\\]+$/, '').toLowerCase();
          if (fromN === toN) continue;
          const mdHere = mdAutosaveTargetPath && mdAutosaveTargetPath.replace(/[/\\]+$/, '').toLowerCase() === fromN;
          if (mdHere) await flushMdFileAutosave();
          const res = await window.tagBrowser.renamePath({ fromPath: fp, toPath, rootPrefix });
          if (!res || !res.ok) {
            if (fb) fb.textContent = (res && res.error) || 'Rename failed: ' + fp;
            return;
          }
          pathPairs.push({ from: fp, to: toPath });
          if (selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN) {
            selectedFullPath = toPath;
            renderScopeBreadcrumbIfScopeChanged();
          }
          if (mdHere) mdAutosaveTargetPath = toPath;
        }
        const st = document.getElementById('status');
        if (pathPairs.length) {
          if (st) st.textContent = 'Renamed ' + pathPairs.length + ' item(s).';
          if (bulkRenameModalInst) bulkRenameModalInst.hide();
          await refreshAfterTagsSaved(pathPairs);
        } else {
          if (fb) fb.textContent = 'No names matched the pattern.';
        }
      } finally {
        renameItemBusy = false;
      }
    }

    /** New folder under scope; raw name sanitized in main process. */
    async function createNewFolderInScopeInteractive() {
      const status = document.getElementById('status');
      const parent = currentScopeFolderPath();
      if (!parent) {
        status.textContent = 'Set a scope folder (Settings or breadcrumb) first.';
        return;
      }
      const raw = await promptNewFolderNameModal();
      if (raw === null) return;
      if (!window.tagBrowser.createEmptyFolder) {
        status.textContent = 'Create folder is not available.';
        return;
      }
      const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
      const r = await window.tagBrowser.createEmptyFolder({ parentFolder: parent, nameSegment: raw, rootPrefix });
      if (!r || !r.ok) status.textContent = (r && r.error) || 'Could not create folder';
      else {
        status.textContent = 'Created folder: ' + T.baseName(String(r.path || ''));
        void refreshAfterDiskMutation();
      }
    }

    async function createTodoMdInScope() {
      const status = document.getElementById('status');
      const folder = currentScopeFolderPath();
      if (!folder) {
        status.textContent = 'Set a scope folder (Settings or breadcrumb) first.';
        return;
      }
      const raw = document.getElementById('newMdTitleInput').value.trim();
      if (!raw) {
        status.textContent = 'Type a title.';
        return;
      }
      const safe = sanitizeFileTitleSegment(raw);
      const baseName = T.buildTaggedComponent(safe + '.md', ['TODO']);
      const fullPath = joinFolderAndFileName(folder, baseName);
      const probe = await window.tagBrowser.readTextFile({ fullPath });
      if (probe.ok) {
        status.textContent = 'File already exists: ' + baseName;
        return;
      }
      const body = '# ' + safe + '\n\n';
      const r = await window.tagBrowser.writeTextFile({ fullPath, text: body });
      if (!r.ok) {
        status.textContent = r.error || 'Could not create file';
        return;
      }
      document.getElementById('newMdTitleInput').value = '';
      status.textContent = 'Created ' + baseName;
      void runSearchNow();
    }

    function clearPropsUI() {
      if (propsPreviewDebounceTimer) {
        clearTimeout(propsPreviewDebounceTimer);
        propsPreviewDebounceTimer = null;
      }
      cancelMdFileAutosave();
      mdAutosaveTargetPath = null;
      revokePreviewBlobs();
      const pdfBlock = document.getElementById('pdfBlock');
      const officeBlock = document.getElementById('officeBlock');
      const imageBlock = document.getElementById('imageBlock');
      if (pdfBlock) pdfBlock.classList.add('d-none');
      if (officeBlock) officeBlock.classList.add('d-none');
      if (imageBlock) imageBlock.classList.add('d-none');
      const textFileBlock = document.getElementById('textFileBlock');
      if (textFileBlock) textFileBlock.classList.add('d-none');
      const gdocWorkspaceBlock = document.getElementById('gdocWorkspaceBlock');
      if (gdocWorkspaceBlock) gdocWorkspaceBlock.classList.add('d-none');
      document.getElementById('propsEmpty').classList.remove('d-none');
      document.getElementById('propsDetails').classList.add('d-none');
      activeReadmePath = null;
      activeMdPath = null;
      renderScopeBreadcrumbIfScopeChanged();
    }

    function findRowByFullPath(fp) {
      return lastRows.find((r) => fullPathForRow(r) === fp) || null;
    }

    /** Minimal row when scope folder isn’t in the current result set (e.g. parent: children only). */
    function syntheticFolderRow(folderAbsPath) {
      const fp = folderAbsPath.replace(/[/\\]+$/, '');
      const base = T.baseName(fp);
      const parent = T.parentDir(fp);
      return {
        type: 'folder',
        name: base,
        path: parent,
        size: '',
        date_modified: '',
      };
    }

    function propsPathKey(p) {
      return String(p || '').replace(/[/\\]+$/, '').toLowerCase();
    }

    /** Before Recycle: drop .md/.txt/readme editor binding to trashed paths so a later flushMdFileAutosave() cannot recreate the file. */
    function detachViewerEditorsForTrashedPaths(trashedPaths) {
      const ancestors = (trashedPaths || []).map((x) => propsPathKey(x)).filter(Boolean);
      if (!ancestors.length) return;
      function hitsOpenPath(openPath) {
        if (!openPath) return false;
        const k = propsPathKey(openPath);
        if (!k) return false;
        for (const a of ancestors) {
          if (k === a) return true;
          if (k.startsWith(a + '\\') || k.startsWith(a + '/')) return true;
        }
        return false;
      }
      if (hitsOpenPath(mdAutosaveTargetPath)) {
        cancelMdFileAutosave();
        mdAutosaveTargetPath = null;
        activeMdPath = null;
      }
      if (hitsOpenPath(activeReadmePath)) activeReadmePath = null;
    }

    /** After external delete (e.g. context menu): clear .md/.txt/readme targets if those files are gone (avoids flush recreating them). */
    async function detachViewerEditorsIfOpenTargetsGone() {
      if (mdAutosaveTargetPath) {
        const r = await window.tagBrowser.readTextFile({ fullPath: mdAutosaveTargetPath });
        if (!r.ok && r.code === 'ENOENT') {
          cancelMdFileAutosave();
          mdAutosaveTargetPath = null;
          activeMdPath = null;
        }
      }
      if (activeReadmePath) {
        const r = await window.tagBrowser.readTextFile({ fullPath: activeReadmePath });
        if (!r.ok && r.code === 'ENOENT') activeReadmePath = null;
      }
    }

    /** Viewer path: table selection if any, otherwise Settings scope folder. */
    function propsTargetPath() {
      if (selectedFullPath) return selectedFullPath;
      const scope = currentScopeFolderPath();
      return scope || null;
    }

    /** Row metadata for props: real hit when possible, else synthetic folder for scope-only view. */
    function propsTargetRowForDisplay() {
      const p = propsTargetPath();
      if (!p) return null;
      if (selectedFullPath) {
        if (selectedRow) return selectedRow;
        return findRowByFullPath(p);
      }
      const row = findRowByFullPath(p);
      if (row) return row;
      return syntheticFolderRow(p);
    }

    /** Drop stale async preview when user changes row or scope. */
    function propsViewStill(fp) {
      const cur = propsTargetPath();
      if (!fp || !cur) return false;
      return propsPathKey(fp) === propsPathKey(cur);
    }

    async function syncSelectionAfterSearch() {
      if (!selectedFullPath) {
        renderScopeBreadcrumbIfScopeChanged();
        await refreshPropsPanel();
        return;
      }
      let row = findRowByFullPath(selectedFullPath);
      if (!row) {
        const vis = listRowsForUi();
        row = vis.find((r) => fullPathForRow(r) === selectedFullPath) || null;
      }
      if (row) {
        selectedRow = row;
      } else {
        const scope = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim()).replace(/[/\\]+$/, '');
        const selNorm = selectedFullPath.replace(/[/\\]+$/, '');
        if (scope && selNorm.toLowerCase() === scope.toLowerCase()) {
          selectedRow = syntheticFolderRow(selectedFullPath);
          row = selectedRow;
        } else {
          selectedRow = null;
          selectedFullPath = null;
          await flushMdFileAutosave();
          renderScopeBreadcrumbIfScopeChanged();
          await refreshPropsPanel();
          return;
        }
      }
      renderScopeBreadcrumbIfScopeChanged();
      await refreshPropsPanel();
    }

    function cancelPropsPreviewSchedule() {
      if (propsPreviewDebounceTimer) {
        clearTimeout(propsPreviewDebounceTimer);
        propsPreviewDebounceTimer = null;
      }
    }

    function schedulePropsPreviewHeavy() {
      cancelPropsPreviewSchedule();
      const ms = propsPreviewDebounceMsForSelection();
      propsPreviewDebounceTimer = setTimeout(() => {
        propsPreviewDebounceTimer = null;
        void refreshPropsPanelHeavy();
      }, ms);
    }

    /** Metadata row only; clears prior preview blobs and shows “Loading preview…”. */
    function refreshPropsPanelQuick() {
      const empty = document.getElementById('propsEmpty');
      const details = document.getElementById('propsDetails');
      const readmeBlock = document.getElementById('readmeBlock');
      const mdFileBlock = document.getElementById('mdFileBlock');
      const pdfBlock = document.getElementById('pdfBlock');
      const officeBlock = document.getElementById('officeBlock');
      const imageBlock = document.getElementById('imageBlock');
      const textFileBlock = document.getElementById('textFileBlock');
      const gdocWorkspaceBlock = document.getElementById('gdocWorkspaceBlock');
      const propPh = document.getElementById('propPlaceholder');

      const propPath = propsTargetPath();
      const propRow = propsTargetRowForDisplay();
      if (!propPath || !propRow) {
        clearPropsUI();
        return;
      }

      revokePreviewBlobs();
      empty.classList.add('d-none');
      details.classList.remove('d-none');
      readmeBlock.classList.add('d-none');
      mdFileBlock.classList.add('d-none');
      if (gdocWorkspaceBlock) gdocWorkspaceBlock.classList.add('d-none');
      if (pdfBlock) pdfBlock.classList.add('d-none');
      if (officeBlock) officeBlock.classList.add('d-none');
      if (imageBlock) imageBlock.classList.add('d-none');
      if (textFileBlock) textFileBlock.classList.add('d-none');
      propPh.classList.remove('d-none');
      propPh.textContent = 'Loading preview…';

      const base = T.baseName(propPath);
      const parsedTitle = T.parseSegmentTags(base);
      document.getElementById('propDisplayName').textContent = parsedTitle.pretty;
      const tagBand = document.getElementById('propTitleTags');
      tagBand.innerHTML = '';
      for (const tag of parsedTitle.tags) appendTagPillWithRemove(tagBand, tag, propPath);

      document.getElementById('propFullPath').textContent = propPath;
      document.getElementById('propType').textContent = rowIsFolder(propRow) ? 'Folder' : 'File';
      document.getElementById('propSize').textContent = formatSize(propRow.size);
      document.getElementById('propModified').textContent = formatModified(
        propRow.date_modified ?? propRow.date_modified_unix
      );
    }

    /** Full preview load; drop results if selection moved (rapid ↑/↓). */
    async function refreshPropsPanelHeavy() {
      const targetFp = propsTargetPath();
      const targetRow = propsTargetRowForDisplay();
      const propPh = document.getElementById('propPlaceholder');
      const mdFileBlock = document.getElementById('mdFileBlock');
      const pdfBlock = document.getElementById('pdfBlock');
      const officeBlock = document.getElementById('officeBlock');
      const imageBlock = document.getElementById('imageBlock');
      const textFileBlock = document.getElementById('textFileBlock');
      const gdocWorkspaceBlock = document.getElementById('gdocWorkspaceBlock');

      if (!targetFp || !targetRow) return;

      await flushMdFileAutosave();
      if (!propsViewStill(targetFp)) return;

      const base = T.baseName(targetFp);
      const parsedTitle = T.parseSegmentTags(base);
      const ext = /\.[^.]+$/.test(base) ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
      const isMdOrTxt = !rowIsFolder(targetRow) && /\.(md|txt)$/i.test(base);

      propPh.classList.add('d-none');

      if (rowIsFolder(targetRow)) {
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        await loadReadmeForFolder(targetFp);
        return;
      }

      if (isMdOrTxt) {
        activeReadmePath = null;
        document.getElementById('btnCreateReadme').classList.add('d-none');
        mdFileBlock.classList.remove('d-none');
        const ed = document.getElementById('mdFileEditor');
        mdAutosaveTargetPath = null;
        const rTxt = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (rTxt.ok) {
          ed.value = rTxt.text;
          mdAutosaveTargetPath = targetFp;
        } else {
          ed.value = '/* read error: ' + (rTxt.error || '') + ' */';
        }
        activeMdPath = mdAutosaveTargetPath ? targetFp : null;
        document.getElementById('mdFilePreview').innerHTML = mdPreviewHtml(ed.value);
        return;
      }

      if (GOOGLE_SHORTCUT_EXT.has(ext) && window.tagBrowser.googleWorkspaceShortcutUrl) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        if (!gdocWorkspaceBlock) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'Google shortcut UI missing.';
          return;
        }
        gdocWorkspaceBlock.classList.remove('d-none');
        const titleEl = document.getElementById('gdocWorkspaceTitle');
        if (titleEl) {
          titleEl.textContent =
            ext === 'gsheet' ? 'Google Sheet' : ext === 'gslides' ? 'Google Slides' : 'Google Doc';
        }
        const urlEl = document.getElementById('gdocWorkspaceUrl');
        const btnGw = document.getElementById('btnOpenGoogleWorkspace');
        const rGw = await window.tagBrowser.googleWorkspaceShortcutUrl({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!urlEl || !btnGw) return;
        if (!rGw.ok) {
          urlEl.textContent = rGw.error || 'Could not read shortcut.';
          btnGw.classList.add('d-none');
          delete btnGw.dataset.url;
        } else {
          urlEl.textContent = rGw.url;
          btnGw.classList.remove('d-none');
          btnGw.dataset.url = rGw.url;
        }
        return;
      }

      if (ext === 'svg' && window.tagBrowser.readTextFile) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const rSvg = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (rSvg.ok) {
          imageBlock.classList.remove('d-none');
          const blob = new Blob([rSvg.text], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          previewBlobUrls.push(url);
          const imS = document.getElementById('propImagePreview');
          imS.alt = parsedTitle.pretty;
          imS.src = url;
        } else {
          propPh.classList.remove('d-none');
          propPh.textContent = 'SVG: ' + (rSvg.error || 'Could not load.');
        }
        return;
      }

      const rasterMime = IMAGE_EXT_MIME[ext];
      if (rasterMime && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const rImg = await window.tagBrowser.readFileBuffer({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (rImg.ok) {
          imageBlock.classList.remove('d-none');
          const im = document.getElementById('propImagePreview');
          im.alt = parsedTitle.pretty;
          im.src = base64ToBlobUrl(rImg.base64, rasterMime);
        } else {
          propPh.classList.remove('d-none');
          propPh.textContent = 'Image: ' + (rImg.error || 'Could not load.');
        }
        return;
      }

      if (ext === 'pdf' && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (r.ok) {
          pdfBlock.classList.remove('d-none');
          const pdfFrame = document.getElementById('pdfFrame');
          pdfFrame.removeAttribute('srcdoc');
          pdfFrame.src = base64ToBlobUrl(r.base64, 'application/pdf');
        } else {
          propPh.classList.remove('d-none');
          propPh.textContent = 'PDF: ' + (r.error || 'Could not load.');
        }
        return;
      }

      if ((ext === 'docx' || ext === 'doc') && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        document.getElementById('officeTitle').textContent = ext === 'docx' ? 'Word (DOCX)' : 'Word (DOC)';
        const prev = document.getElementById('officePreview');
        if (ext === 'doc') {
          prev.innerHTML = '<p class="text-muted mb-0">Preview not supported for .doc — use Open.</p>';
          return;
        }
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!r.ok) {
          propPh.classList.remove('d-none');
          propPh.textContent = String(r.error || 'Could not load.');
          officeBlock.classList.add('d-none');
          return;
        }
        const ab = base64ToArrayBuffer(r.base64);
        if (typeof mammoth === 'undefined' || !mammoth.convertToHtml) {
          prev.innerHTML = '<p class="text-danger small">Document preview library failed to load.</p>';
          return;
        }
        try {
          const result = await mammoth.convertToHtml({ arrayBuffer: ab });
          if (!propsViewStill(targetFp)) return;
          const raw = String(result.value || '').trim();
          prev.innerHTML = raw
            ? truncateRichPreviewHtml(raw, TEXT_PREVIEW_MAX_CHARS)
            : '<p class="text-muted">(empty)</p>';
        } catch (e) {
          if (!propsViewStill(targetFp)) return;
          prev.innerHTML = '<p class="text-danger small">' + String(e.message || e) + '</p>';
        }
        return;
      }

      if ((ext === 'xlsx' || ext === 'xls') && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        document.getElementById('officeTitle').textContent = 'Excel';
        const prev = document.getElementById('officePreview');
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!r.ok) {
          propPh.classList.remove('d-none');
          propPh.textContent = String(r.error || 'Could not load.');
          officeBlock.classList.add('d-none');
          return;
        }
        if (typeof XLSX === 'undefined' || !XLSX.read) {
          prev.innerHTML = '<p class="text-danger small">SheetJS failed to load.</p>';
          return;
        }
        try {
          const wb = XLSX.read(new Uint8Array(base64ToArrayBuffer(r.base64)), { type: 'array' });
          const sn = wb.SheetNames[0];
          if (!propsViewStill(targetFp)) return;
          const ws = wb.Sheets[sn];
          let tableHtml = '';
          let noteHtml = '';
          if (ws['!ref']) {
            const full = XLSX.utils.decode_range(ws['!ref']);
            const totalRows = full.e.r - full.s.r + 1;
            const endRow = Math.min(full.e.r, full.s.r + EXCEL_PREVIEW_MAX_ROWS - 1);
            const limitedRange = { s: full.s, e: { r: endRow, c: full.e.c } };
            // First N rows of used range only — “first N non-empty rows” would mean scanning far more of the grid (often the whole sheet).
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, range: limitedRange });
            tableHtml = XLSX.utils.sheet_to_html(XLSX.utils.aoa_to_sheet(rows));
            if (totalRows > EXCEL_PREVIEW_MAX_ROWS) {
              noteHtml =
                '<p class="text-muted small mb-0 mt-2">Preview: first ' +
                EXCEL_PREVIEW_MAX_ROWS +
                ' rows only (sheet used range: ' +
                totalRows +
                ' rows).</p>';
            }
          } else {
            tableHtml = XLSX.utils.sheet_to_html(ws);
          }
          prev.innerHTML = tableHtml + noteHtml;
        } catch (e) {
          if (!propsViewStill(targetFp)) return;
          prev.innerHTML = '<p class="text-danger small">' + String(e.message || e) + '</p>';
        }
        return;
      }

      if (ext === 'pptx' && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        document.getElementById('officeTitle').textContent = 'PowerPoint (PPTX)';
        const prev = document.getElementById('officePreview');
        prev.innerHTML = '<p class="text-muted small mb-0">Loading…</p>';
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!r.ok) {
          propPh.classList.remove('d-none');
          propPh.textContent = String(r.error || 'Could not load.');
          officeBlock.classList.add('d-none');
          return;
        }
        try {
          const html = await pptxArrayBufferToPreviewHtml(base64ToArrayBuffer(r.base64));
          if (!propsViewStill(targetFp)) return;
          prev.innerHTML = html;
        } catch (e) {
          if (!propsViewStill(targetFp)) return;
          prev.innerHTML = '<p class="text-danger small">' + escapeHtmlForPreview(String(e.message || e)) + '</p>';
        }
        return;
      }

      if (ext === 'ppt') {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        document.getElementById('officeTitle').textContent = 'PowerPoint';
        document.getElementById('officePreview').innerHTML =
          '<p class="text-muted mb-0">Preview not supported for .ppt — use <strong>Open</strong>.</p>';
        return;
      }

      if (TEXT_PREVIEW_EXT.has(ext) && window.tagBrowser.readTextFile && textFileBlock) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const sz = rowSizeBytes(targetRow);
        if (sz != null && sz > TEXT_PREVIEW_MAX_BYTES) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'Text preview: file too large (max ~2 MB). Use Open.';
          return;
        }
        const rTxt = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!rTxt.ok) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'Text: ' + (rTxt.error || 'Could not load.');
          return;
        }
        textFileBlock.classList.remove('d-none');
        document.getElementById('textPreviewTitle').textContent = ext === 'json' ? 'JSON' : 'Text preview';
        let body = formatTextPreviewBody(ext, rTxt.text);
        if (body.length > TEXT_PREVIEW_MAX_CHARS) {
          body = body.slice(0, TEXT_PREVIEW_MAX_CHARS) + '\n\n… [truncated for preview]';
        }
        document.getElementById('textPreviewPre').textContent = body;
        return;
      }

      activeReadmePath = null;
      activeMdPath = null;
      mdAutosaveTargetPath = null;
      propPh.classList.remove('d-none');
      propPh.textContent = 'No preview for this type — use Open.';
    }

    /** Immediate metadata + non-debounced heavy load (e.g. after search sync). */
    async function refreshPropsPanel() {
      cancelPropsPreviewSchedule();
      refreshPropsPanelQuick();
      await refreshPropsPanelHeavy();
    }

    /** Folder readme RHS: pale orange when non-empty; optional one-shot pulse after load. */
    function syncReadmePreviewChrome(opts) {
      const pulse = !!(opts && opts.pulse);
      const prev = document.getElementById('readmePreview');
      const ed = document.getElementById('readmeEditor');
      const filled = (ed.value || '').trim().length > 0;
      if (!pulse) prev.classList.remove('readme-preview--pulse');
      prev.classList.toggle('readme-preview--filled', filled);
      if (!pulse || !filled) return;
      prev.classList.remove('readme-preview--pulse');
      void prev.offsetWidth;
      prev.classList.add('readme-preview--pulse');
      prev.addEventListener('animationend', () => prev.classList.remove('readme-preview--pulse'), { once: true });
    }

    async function loadReadmeForFolder(folderPath) {
      const readmeBlock = document.getElementById('readmeBlock');
      const sep = folderPath.includes('/') ? '/' : '\\';
      const readmePath = folderPath.replace(/[/\\]+$/, '') + sep + 'readme.md';

      const btnCreate = document.getElementById('btnCreateReadme');
      const ed = document.getElementById('readmeEditor');
      const r = await window.tagBrowser.readTextFile({ fullPath: readmePath });
      if (!propsViewStill(folderPath)) return;

      readmeBlock.classList.remove('d-none');
      activeReadmePath = readmePath;

      if (r.ok) {
        btnCreate.classList.add('d-none');
        ed.value = r.text;
      } else if (r.code === 'ENOENT') {
        btnCreate.classList.remove('d-none');
        ed.value = '';
      } else {
        btnCreate.classList.add('d-none');
        ed.value = '/* read error: ' + (r.error || '') + ' */';
      }
      document.getElementById('readmePreview').innerHTML = mdPreviewHtml(ed.value);
      syncReadmePreviewChrome({ pulse: true });
    }

    function setSelection(row, fp) {
      selectedRow = row;
      selectedFullPath = fp;
      renderScopeBreadcrumbIfScopeChanged();
      syncResultsSelectionHighlight();
      refreshPropsPanelQuick();
      schedulePropsPreviewHeavy();
      focusResultsWrapAfterListSelection();
    }

    /** Selected row object when possible (works for synthetic rows not present in lastRows). */
    function selectedRowForActions() {
      if (!selectedFullPath) return null;
      if (selectedRow && fullPathForRow(selectedRow) === selectedFullPath) return selectedRow;
      return findRowByFullPath(selectedFullPath);
    }

    /** Everything: quoted path prefix + query (recursive / in-tree search). */
    function buildEverythingSearch(rootFolder, userQuery) {
      const q = (userQuery || '').trim();
      let root = (rootFolder || '').trim();
      if (!root) return q;
      root = root.replace(/[/\\]+$/, '') + '\\';
      const quoted = '"' + root.replace(/"/g, '') + '"';
      return q ? quoted + ' ' + q : quoted;
    }

    /** Combine scope + user query for API (non-recursive uses parent: internally; query box stays clean). */
    function composeScopedEverythingSearch(scopeRaw, userQuery, recursive) {
      const q = (userQuery || '').trim();
      const scope = (scopeRaw || '').trim();
      if (!scope) return q;
      const scopeNorm = normalizeFolderPathForEverything(scope).replace(/[/\\]+$/, '');
      if (recursive) return buildEverythingSearch(scopeNorm, q);
      const parentTok = 'parent:"' + scopeNorm.replace(/"/g, '') + '"';
      return q ? parentTok + ' ' + q : parentTok;
    }

    /** Full-index bracket scan after each main search (same query regardless of current folder). */
    function kickTagDiscoveryAfterSearch() {
      searchDebugLog('tagDiscovery.kick', {});
      void runTagDiscoverySearchInner(false);
    }

    /** pruneDeadRemembered: ghost cleanup on “Rescan all tags” only. */
    async function runTagDiscoverySearchInner(pruneDeadRemembered) {
      const statusEl = document.getElementById('status');
      const baseUrl = document.getElementById('baseUrl').value.trim() || 'http://127.0.0.1';
      const mr = Math.max(1, parseInt(document.getElementById('maxResults').value, 10) || 200);
      const countCap = Math.min(50000, Math.max(5000, mr));
      const httpUser = document.getElementById('httpUser').value;
      const httpPassword = document.getElementById('httpPassword').value;
      const ui = searchOptionsFromUI();
      // r=1: require `[(` so plain `[foobar]` noise is excluded; TagFox tags are `[(t1,t2)]`.
      const bracketDiscoveryQuery = '\\[\\(';
      searchDebugLog('tagDiscovery.request', {
        prune: pruneDeadRemembered,
        searchText: bracketDiscoveryQuery,
        countCap,
        baseUrl,
        hideDotFolders: !!document.getElementById('optHideDotFolders')?.checked,
        hasSearchBridge: !!(window.tagBrowser && typeof window.tagBrowser.search === 'function'),
        knownTagsBeforeScan: knownBracketTagsList.length,
      });
      const res = await window.tagBrowser.search({
        baseUrl,
        searchText: bracketDiscoveryQuery,
        count: String(countCap),
        httpUser,
        httpPassword,
        options: {
          case: ui.case,
          wholeword: false,
          pathSearch: true,
          regex: true,
          diacritics: ui.diacritics,
          sort: 'path',
          ascending: true,
        },
      });
      const rawRows = Array.isArray(res && res.rows) ? res.rows : [];
      searchDebugLog('tagDiscovery.response', {
        ok: !!(res && res.ok),
        rawRows: rawRows.length,
        err: res && res.ok ? '' : (res && res.error) || 'unknown',
        resKeys: res && typeof res === 'object' ? Object.keys(res).slice(0, 14) : [],
      });
      if (!res.ok) {
        if (statusEl) statusEl.textContent = 'Tag scan failed: ' + (res.error || 'unknown error');
        renderTagBar();
        return;
      }
      const discRows = rowsRespectingHideDotFolders(rawRows);
      searchDebugLog('tagDiscovery.rowsPipe', {
        rawLen: rawRows.length,
        afterHideDotLen: discRows.length,
        droppedByHideDot: rawRows.length - discRows.length,
        sampleRaw: rawRows.slice(0, 3).map(searchDebugTagRowDigest),
        sampleFiltered: discRows.slice(0, 3).map(searchDebugTagRowDigest),
      });
      tagDiscoveryRows = discRows;
      if (discRows.length) tagDiscoveryRowsLastGood = discRows;
      absorbKnownBracketTagsFromScanRows(discRows);
      searchDebugLog('tagDiscovery.afterAbsorb', { knownBracketTagsListLen: knownBracketTagsList.length });
      let fullScanActiveChanged = false;
      if (pruneDeadRemembered) {
        const countsFromDisc =
          discRows.length > 0 ? T.aggregateTagCountsFromRows(discRows, fullPathForRow) : new Map();
        searchDebugLog('tagDiscovery.prune', {
          countsFromDiscSize: countsFromDisc.size,
          keysSample: [...countsFromDisc.keys()].slice(0, 24),
        });
        let storeChanged = false;
        const nextStore = tagStoreOrder.filter((t) => {
          const hit = countsFromDisc.get(t.key);
          if (hit && hit.count > 0) return true;
          storeChanged = true;
          return false;
        });
        let knownChanged = false;
        const nextKnown = knownBracketTagsList.filter((t) => {
          const hit = countsFromDisc.get(t.key);
          if (hit && hit.count > 0) return true;
          knownChanged = true;
          return false;
        });
        if (knownChanged) {
          knownBracketTagsList = nextKnown;
          saveKnownBracketTags();
          scheduleTagPrefsDiskSync();
        }
        if (storeChanged) {
          tagStoreOrder = nextStore;
          saveTagStore();
          scheduleTagPrefsDiskSync();
        }
        for (const k of [...activeTagKeys]) {
          const hit = countsFromDisc.get(k);
          if (!hit || hit.count < 1) {
            activeTagKeys.delete(k);
            fullScanActiveChanged = true;
          }
        }
        if (fullScanActiveChanged) persistActiveTagFilter();
        if (statusEl) {
          const n = discRows.length;
          const extra =
            storeChanged || knownChanged || fullScanActiveChanged ? ' Dropped tags not in this scan.' : '';
          statusEl.textContent = 'Tag scan: ' + n + ' path(s) with [(…)] tag block (full index).' + extra;
        }
      }
      renderTagBar();
      if (pruneDeadRemembered && fullScanActiveChanged) renderTable();
    }

    /** pruneDeadRemembered true = “Rescan all tags”. false = awaitable (Hide . / ~). */
    async function runTagDiscoverySearch(pruneDeadRemembered) {
      await runTagDiscoverySearchInner(pruneDeadRemembered);
    }

    /** Escape tag text for one Everything regex:… clause (modifiers off; global Regex UI off). */
    function escapeEverythingRegexFragment(s) {
      return String(s || '').replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
    }

    /** One (?i)regex:… clause for `[(t1,t2)]` lists (same as rowHasTag / pathHasTag). */
    function tagKeyToEverythingBracketRegex(lowerKey) {
      const t = String(lowerKey || '').trim().toLowerCase();
      if (!t) return '';
      let inner = t.replace(/[|*?()<>]/g, '');
      if (!inner) inner = t.replace(/[^a-z0-9_-]/gi, '');
      if (!inner) return '';
      const esc = escapeEverythingRegexFragment(inner);
      return '(?i)\\[\\((?:[^,)]*,)*' + esc + '(?:,[^)]*)?\\)\\]';
    }

    /** Narrow Everything: AND (space) or OR (|) of regex: clauses per active tag (skipped when global Regex is on). */
    function appendActiveTagToEverythingQuery(searchText) {
      if (!activeTagKeys.size || document.getElementById('optRegex').checked) return searchText;
      let out = String(searchText || '').trim();
      const res = [...activeTagKeys]
        .sort()
        .map((k) => tagKeyToEverythingBracketRegex(k))
        .filter(Boolean);
      if (!res.length) return out;
      if (tagFilterCombineOr && res.length > 1) {
        // Everything: `|` is OR between terms; alternation inside one regex: does not replace that. Group so scope/query stays AND with (tag1 OR tag2).
        const parts = res.map((re) => 'regex:' + re);
        out = (out + ' < ' + parts.join(' | ') + ' >').trim();
      } else {
        for (const re of res) out = (out + ' regex:' + re).trim();
      }
      return out;
    }

    /** Google Drive for Desktop: real files live under this virtual segment — must not count as a “dot folder”. */
    function isGoogleDriveShortcutTargetsSegment(seg) {
      return String(seg || '').toLowerCase() === '.shortcut-targets-by-id';
    }

    /**
     * Hide . / ~: paths through .segment\, basenames .*, or any ~segment\ (Office ~$ locks, etc.).
     * Needs path matching — runSearch sets pathSearch true when this is appended. Skipped if global Regex is on (whole query is one pattern).
     */
    function appendHideDotFoldersToEverythingQuery(searchText) {
      if (!document.getElementById('optHideDotFolders').checked) return searchText;
      if (document.getElementById('optRegex').checked) return searchText;
      /* Exclude `.shortcut-targets-by-id` from the “bad dot segment” match (Drive on H:\ etc.). */
      const clause =
        ' !regex:(?:(?:\\\\|/)\\.(?!shortcut-targets-by-id(?:\\\\|/|$))[^\\\\/]+(?:\\\\|/)|(?:\\\\|/)\\.(?!shortcut-targets-by-id$)[^\\\\/]+$|(?:\\\\|/)~(?:[^\\\\/]+)?(?:(?:\\\\|/)|$))';
      return (String(searchText || '').trim() + clause).trim();
    }

    /** dm: cutoff in local time (Everything datemodified syntax). */
    function formatEverythingDmCutoffLocal(msSinceEpoch) {
      const d = new Date(msSinceEpoch);
      const pad2 = (n) => String(n).padStart(2, '0');
      return (
        d.getFullYear() +
        '-' +
        pad2(d.getMonth() + 1) +
        '-' +
        pad2(d.getDate()) +
        'T' +
        pad2(d.getHours()) +
        ':' +
        pad2(d.getMinutes()) +
        ':' +
        pad2(d.getSeconds())
      );
    }

    /**
     * Send recency to Everything as dm:>=… so max-results applies inside the time window (fixes path sort taking 200 “old” hits then client-filtering to a handful).
     * Global Regex on: skipped — whole query is one pattern; filteredRows still trims by mtime client-side.
     */
    function appendRecencyToEverythingQuery(searchText) {
      if (recencyFilterMode() === 'all') return searchText;
      if (document.getElementById('optRegex').checked) return searchText;
      const cut = recencyFilterCutoffMs();
      if (cut == null) return searchText;
      const clause = 'dm:>=' + formatEverythingDmCutoffLocal(cut);
      return (String(searchText || '').trim() + ' ' + clause).trim();
    }

    function formatSize(n) {
      if (n == null || n === '') return '—';
      const x = Number(n);
      if (!Number.isFinite(x)) return String(n);
      if (x < 1024) return x + ' B';
      if (x < 1024 * 1024) return (x / 1024).toFixed(1) + ' KB';
      if (x < 1024 * 1024 * 1024) return (x / (1024 * 1024)).toFixed(1) + ' MB';
      return (x / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function formatModified(v) {
      if (v == null || v === '') return '—';
      const n = Number(v);
      if (!Number.isFinite(n)) return String(v);
      if (n > 1e15) {
        const ms = n / 10000 - 11644473600000;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d.toLocaleString();
      }
      if (n > 1e12) {
        const d = new Date(n);
        if (!isNaN(d.getTime())) return d.toLocaleString();
      }
      const d2 = new Date(n * 1000);
      if (!isNaN(d2.getTime())) return d2.toLocaleString();
      return String(v);
    }

    /** Modified time as JS ms for sorting, filtering, row recency dot, and client recency filter (Everything FILETIME / ms / unix s). */
    function modifiedTimeMs(row) {
      if (!row) return null;
      const v = row.date_modified ?? row.date_modified_unix;
      if (v == null || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      if (n > 1e15) return n / 10000 - 11644473600000;
      if (n > 1e12) return n;
      return n * 1000;
    }

    const RECENCY_MS_DAY = 86400000;

    /** CSS class for the row blob: same buckets as 1d / 1w / 1m / 1y toolbar filter. */
    function recencyBlobClassForRow(row) {
      const ms = modifiedTimeMs(row);
      if (ms == null) return 'recency-blob recency-blob--unknown';
      const age = Date.now() - ms;
      if (age < 0) return 'recency-blob recency-blob--d1';
      if (age <= RECENCY_MS_DAY) return 'recency-blob recency-blob--d1';
      if (age <= 7 * RECENCY_MS_DAY) return 'recency-blob recency-blob--d7';
      if (age <= 30 * RECENCY_MS_DAY) return 'recency-blob recency-blob--d30';
      if (age <= 365 * RECENCY_MS_DAY) return 'recency-blob recency-blob--d365';
      return 'recency-blob recency-blob--old';
    }

    /** Cutoff timestamp for client-side recency filter, or null = no filter. */
    function recencyFilterCutoffMs() {
      const m = recencyFilterMode();
      if (m === 'all') return null;
      if (m === '1d') return Date.now() - RECENCY_MS_DAY;
      if (m === '1w') return Date.now() - 7 * RECENCY_MS_DAY;
      if (m === '1m') return Date.now() - 30 * RECENCY_MS_DAY;
      if (m === '1y') return Date.now() - 365 * RECENCY_MS_DAY;
      return null;
    }

    function pathNormKey(fp) {
      return String(fp || '').replace(/[/\\]+$/, '').toLowerCase();
    }

    /** Stable sort key for path column: one separator style + lower case (localeCompare numeric breaks badly on full paths). */
    function pathSortKey(row) {
      return pathNormKey(fullPathForRow(row)).replace(/\//g, '\\');
    }

    function toggleCheckPath(fp, on) {
      const k = pathNormKey(fp);
      if (!k) return;
      if (on) checkedPathsMap.set(k, fp);
      else checkedPathsMap.delete(k);
      updateBulkBar();
    }

    function isCheckedPath(fp) {
      return checkedPathsMap.has(pathNormKey(fp));
    }

    function getCheckedPathsArr() {
      return [...checkedPathsMap.values()];
    }

    /** Checked rows, else single highlighted row (same idea as bulk copy/delete). */
    function pathsForBulkRename() {
      const bulk = getCheckedPathsArr();
      if (bulk.length) return bulk;
      if (selectedFullPath) {
        const row = selectedRowForActions();
        if (row) return [fullPathForRow(row)];
      }
      return [];
    }

    /** Last path segment for Recycle Bin confirm (file or folder name). */
    function pathBasenameForConfirm(p) {
      const s = String(p || '').trim().replace(/[/\\]+$/, '');
      const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
      const tail = i < 0 ? s : s.slice(i + 1);
      return tail || s || '(?)';
    }

    /** Recycle confirm: title + bullet list (first maxShown names, then "and N more"). */
    function recycleBinConfirmMessage(paths, maxShown) {
      const list = Array.isArray(paths) ? paths : [];
      const n = list.length;
      if (!n) return 'Delete these items? (They will be moved to the Recycle Bin.)';
      const cap = Math.max(1, Number(maxShown) || 8);
      const head =
        n === 1
          ? 'Delete this item? (It will be moved to the Recycle Bin.)'
          : 'Delete ' + n + ' items? (They will be moved to the Recycle Bin.)';
      const lines = list.slice(0, cap).map((fp) => '• ' + pathBasenameForConfirm(fp));
      const more = n > cap ? '\n… and ' + (n - cap) + ' more' : '';
      return head + '\n\n' + lines.join('\n') + more;
    }

    /** Drag-out: all checked paths, or single row path. */
    function pathsForRowDrag(fp) {
      const checked = getCheckedPathsArr();
      if (checked.length) return checked;
      return [fp];
    }

    /** Copy/move into scope or Shelf: on name clash, offer replace (retries whole op with replaceExisting). */
    async function scopeCopyOrMoveWithConflictPrompt(mode, { sourcePaths, destFolder, rootPrefix }) {
      const base = { sourcePaths, destFolder, rootPrefix };
      const run = (replaceExisting) =>
        mode === 'copy'
          ? window.tagBrowser.copyPathsIntoFolder({ ...base, replaceExisting })
          : window.tagBrowser.movePathsIntoFolder({ ...base, replaceExisting });
      let r = await run(false);
      if (r.ok || r.code !== 'EEXIST') return r;
      const name = r.baseName ? String(r.baseName) : 'item';
      if (
        !confirm(
          'Replace existing "' +
            name +
            '" in the destination folder?\n\nOK overwrites that item and runs the operation again. Cancel aborts.'
        )
      ) {
        return { ok: false, error: 'Cancelled.' };
      }
      return run(true);
    }

    async function pasteClipboardIntoScopeWithConflictPrompt(destFolder, rootPrefix) {
      const run = (replaceExisting) =>
        window.tagBrowser.pasteClipboardIntoFolder({ destFolder, rootPrefix, replaceExisting });
      let r = await run(false);
      if (r.ok || r.code !== 'EEXIST') return r;
      const name = r.baseName ? String(r.baseName) : 'item';
      if (
        !confirm(
          'Replace existing "' +
            name +
            '" in the destination folder?\n\nOK overwrites that item and pastes again. Cancel aborts.'
        )
      ) {
        return { ok: false, error: 'Cancelled.' };
      }
      return run(true);
    }

    /** Internal drop: move (default) or copy with Shift — into dest folder. */
    async function applyInternalPathsDrop(destFolderRaw, paths, mode) {
      const destFolder = normalizeFolderPathForEverything(destFolderRaw);
      const status = document.getElementById('status');
      const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
      const destKey = pathNormKey(destFolder);
      const filtered = paths.filter((p) => pathNormKey(p) !== destKey);
      if (!filtered.length) return;

      if (mode === 'copy') {
        if (!window.tagBrowser.copyPathsIntoFolder) {
          status.textContent = 'Copy into folder is not available.';
          return;
        }
        const r = await scopeCopyOrMoveWithConflictPrompt('copy', {
          sourcePaths: filtered,
          destFolder,
          rootPrefix,
        });
        status.textContent = r.ok ? 'Copied into folder.' : (r.error || 'Copy failed');
        if (r.ok) {
          await renderShelf(); // Shelf chips must match disk after drop (drop event may end before this await).
          void refreshAfterDiskMutation();
        }
        return;
      }

      if (!window.tagBrowser.movePathsIntoFolder) {
        status.textContent = 'Move not available.';
        return;
      }
      const r = await scopeCopyOrMoveWithConflictPrompt('move', {
        sourcePaths: filtered,
        destFolder,
        rootPrefix,
      });
      status.textContent = r.ok ? 'Moved into folder.' : (r.error || 'Move failed');
      if (r.ok) {
        await renderShelf();
        void refreshAfterDiskMutation();
      }
    }

    /** One-time: results scroll area dragover/drop — row targets, else empty space below rows → current scope folder (Shelf chips). */
    function bindResultsTableDragDrop() {
      const wrap = document.getElementById('resultsWrap');
      const tbody = document.getElementById('tbody');
      if (!wrap || !tbody || wrap.dataset.dragDropBound === '1') return;
      wrap.dataset.dragDropBound = '1';

      function clearRowDragOver() {
        tbody.querySelectorAll('tr.results-drag-over').forEach((tr) => tr.classList.remove('results-drag-over'));
      }

      function clearScopeDropOver() {
        wrap.classList.remove('results-scope-drop-over');
      }

      wrap.addEventListener('dragover', (e) => {
        if (!dataTransferHasTagBrowserOrFiles(e.dataTransfer)) {
          clearRowDragOver();
          clearScopeDropOver();
          return;
        }
        const tr = e.target.closest('#resultsTable tbody tr');
        if (tr && tr.dataset.dropPath) {
          clearScopeDropOver();
          e.preventDefault();
          e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
          clearRowDragOver();
          tr.classList.add('results-drag-over');
          return;
        }
        clearRowDragOver();
        const scopeDest = currentScopeFolderPath();
        if (scopeDest) {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
          wrap.classList.add('results-scope-drop-over');
        } else {
          clearScopeDropOver();
        }
      });

      wrap.addEventListener('drop', async (e) => {
        clearRowDragOver();
        clearScopeDropOver();
        const paths = collectPathsForShelfDrop(e.dataTransfer);
        if (!paths.length) return;
        e.preventDefault();
        e.stopPropagation();
        const tr = e.target.closest('#resultsTable tbody tr');
        if (tr && tr.dataset.dropPath) {
          await applyInternalPathsDrop(tr.dataset.dropPath, paths, e.shiftKey ? 'copy' : 'move');
          return;
        }
        const scopeDest = currentScopeFolderPath();
        if (!scopeDest) {
          document.getElementById('status').textContent = 'Set a scope folder (Settings) to drop into the list.';
          return;
        }
        await applyInternalPathsDrop(scopeDest, paths, e.shiftKey ? 'copy' : 'move');
      });
    }

    /** Scope breadcrumb segments: drop to move into that folder. */
    function bindBreadcrumbBarDragDrop() {
      const bar = document.getElementById('breadcrumbBar');
      if (!bar || bar.dataset.dragDropBound === '1') return;
      bar.dataset.dragDropBound = '1';

      function clearCrumbDragOver() {
        bar.querySelectorAll('[data-drop-path].results-drag-over').forEach((n) => n.classList.remove('results-drag-over'));
      }

      bar.addEventListener('dragover', (e) => {
        if (!dataTransferHasTagBrowserOrFiles(e.dataTransfer)) {
          clearCrumbDragOver();
          return;
        }
        const node = e.target.closest('[data-drop-path]');
        if (!node || !bar.contains(node)) {
          clearCrumbDragOver();
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
        clearCrumbDragOver();
        node.classList.add('results-drag-over');
      });

      bar.addEventListener('drop', async (e) => {
        clearCrumbDragOver();
        const node = e.target.closest('[data-drop-path]');
        if (!node || !bar.contains(node)) return;
        const paths = collectPathsForShelfDrop(e.dataTransfer);
        if (!paths.length) return;
        e.preventDefault();
        e.stopPropagation();
        await applyInternalPathsDrop(node.dataset.dropPath, paths, e.shiftKey ? 'copy' : 'move');
      });
    }

    /** Internal row drag + Explorer file drops onto Shelf: move by default, Shift+copy (same as row/breadcrumb drops). */
    function collectPathsForShelfDrop(dt) {
      const out = [];
      if (dataTransferHasTagBrowserPaths(dt)) {
        out.push(...parseTagBrowserPathsDragPayload(dt.getData(TAG_BROWSER_PATHS_DRAG_TYPE)));
      }
      if (dt.files && dt.files.length) {
        for (let i = 0; i < dt.files.length; i++) {
          const fp = dt.files[i].path;
          if (fp) out.push(fp);
        }
      }
      if (!out.length && tagBrowserActiveNativeDragPaths && tagBrowserActiveNativeDragPaths.length) {
        out.push(...tagBrowserActiveNativeDragPaths);
      }
      const seen = new Set();
      const uniq = [];
      for (const p of out) {
        const n = String(p || '').trim();
        if (!n) continue;
        const k = pathNormKey(n);
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(n);
      }
      return uniq;
    }

    async function renderShelf() {
      const zone = document.getElementById('shelfDropZone');
      const chips = document.getElementById('shelfChips');
      const hint = document.getElementById('shelfEmptyHint');
      if (!zone || !chips || !hint || !window.tagBrowser.shelfState) return;
      const r = await window.tagBrowser.shelfState();
      const shelfDropHelp =
        'Drop here (move; Shift+copy). Drag rows for in-app. “OS drag” or Alt+drag → Explorer files.';
      zone.title = r.ok ? shelfDropHelp + ' Staging folder: ' + r.path : shelfDropHelp + ' ' + String(r.error || 'Shelf unavailable');
      chips.innerHTML = '';
      if (!r.ok || !r.entries.length) {
        hint.classList.remove('d-none');
        refreshTagFoxChromeTooltips(zone);
        return;
      }
      hint.classList.add('d-none');
      for (const ent of r.entries) {
        const chip = document.createElement('span');
        chip.className = 'badge bg-secondary shelf-chip align-middle';
        chip.textContent = ent.name;
        chip.title =
          ent.fullPath +
          (ent.isDirectory ? ' (folder)' : '') +
          ' — in-app drag; OS drag / Alt+drag → Explorer';
        chip.draggable = true;
        chip.addEventListener('dragstart', (e) => {
          const wantOs = e.altKey || tagBrowserNextOsFileDrag;
          if (window.tagBrowser.startDragFiles && wantOs) {
            tagBrowserNextOsFileDrag = false;
            e.preventDefault();
            tagBrowserActiveNativeDragPaths = [ent.fullPath];
            window.tagBrowser.startDragFiles([ent.fullPath]);
            return;
          }
          if (tagBrowserNextOsFileDrag) tagBrowserNextOsFileDrag = false;
          setDataTransferTagBrowserHtml5Paths(e.dataTransfer, [ent.fullPath]);
        });
        chips.appendChild(chip);
      }
      refreshTagFoxChromeTooltips(zone);
      refreshTagFoxChromeTooltips(chips);
    }

    function bindShelfDrop() {
      const aside = document.getElementById('appShelf');
      if (!aside || aside.dataset.shelfDropBound === '1') return;
      aside.dataset.shelfDropBound = '1';

      function shelfAllowsDt(dt) {
        return dataTransferHasTagBrowserOrFiles(dt);
      }

      aside.addEventListener('dragenter', (e) => {
        if (!shelfAllowsDt(e.dataTransfer)) return;
        e.preventDefault();
      });
      aside.addEventListener('dragover', (e) => {
        if (!shelfAllowsDt(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
        aside.classList.add('shelf-aside-drag-over');
      });
      aside.addEventListener('dragleave', (e) => {
        if (!aside.contains(e.relatedTarget)) aside.classList.remove('shelf-aside-drag-over');
      });
      aside.addEventListener('drop', (e) => {
        aside.classList.remove('shelf-aside-drag-over');
        const paths = collectPathsForShelfDrop(e.dataTransfer);
        if (!paths.length) return;
        e.preventDefault();
        e.stopPropagation();
        const copy = e.shiftKey;
        setTimeout(() => {
          void (async () => {
            const st = await window.tagBrowser.shelfState();
            if (!st.ok) {
              document.getElementById('status').textContent = st.error || 'Shelf unavailable';
              return;
            }
            const destKey = pathNormKey(st.path);
            const filtered = paths.filter((p) => pathNormKey(p) !== destKey);
            if (!filtered.length) return;

            const status = document.getElementById('status');
            let r;
            if (copy) {
              r = await scopeCopyOrMoveWithConflictPrompt('copy', {
                sourcePaths: filtered,
                destFolder: st.path,
                rootPrefix: '',
              });
            } else {
              if (!window.tagBrowser.movePathsIntoFolder) {
                status.textContent = 'Move not available.';
                return;
              }
              r = await scopeCopyOrMoveWithConflictPrompt('move', {
                sourcePaths: filtered,
                destFolder: st.path,
                rootPrefix: '',
              });
            }
            status.textContent = r.ok
              ? copy
                ? 'Copied to Shelf.'
                : 'Moved to Shelf.'
              : r.error || (copy ? 'Shelf copy failed' : 'Shelf move failed');
          })();
        }, 40);
      });
    }

    function pruneCheckedPaths() {
      const hideDot = document.getElementById('optHideDotFolders').checked;
      for (const k of [...checkedPathsMap.keys()]) {
        const fp = checkedPathsMap.get(k);
        const row = lastRows.find((r) => pathNormKey(fullPathForRow(r)) === k);
        if (!row) {
          checkedPathsMap.delete(k);
          continue;
        }
        if (hideDot && pathUnderDotFolder(fp)) checkedPathsMap.delete(k);
      }
      updateBulkBar();
    }

    function updateBulkBar() {
      const n = checkedPathsMap.size;
      const bar = document.getElementById('bulkBar');
      if (!bar) return;
      if (!n) {
        bar.classList.add('d-none');
        return;
      }
      bar.classList.remove('d-none');
      const lbl = document.getElementById('bulkBarLabel');
      if (lbl) lbl.textContent = n + ' selected';
    }

    function updateSelectAllCheckboxState() {
      const h = document.getElementById('chkSelectAllResults');
      if (!h) return;
      const vis = listRowsForUi();
      const n = vis.length;
      let c = 0;
      for (const row of vis) {
        if (isCheckedPath(fullPathForRow(row))) c++;
      }
      h.checked = n > 0 && c === n;
      h.indeterminate = c > 0 && c < n;
    }

    /** Check every row in the current visible list (same as header “select all”; respects tag / hide-.folder filters). */
    function selectAllVisibleResultRows() {
      resultsShiftRangeAnchorIdx = null;
      const vis = listRowsForUi();
      if (!vis.length) return;
      for (const row of vis) {
        toggleCheckPath(fullPathForRow(row), true);
      }
      updateSelectAllCheckboxState();
      syncResultsRowCheckboxStates();
      setSelection(vis[vis.length - 1], fullPathForRow(vis[vis.length - 1]));
    }

    /** Dedupe by path for merging main results + tag-discovery rows. */
    function mergeUniqueRowsByPath(a, b, getFp) {
      const seen = new Set();
      const out = [];
      for (const row of [...(a || []), ...(b || [])]) {
        const fp = String(getFp(row) || '').toLowerCase();
        if (!fp || seen.has(fp)) continue;
        seen.add(fp);
        out.push(row);
      }
      return out;
    }

    function fullPathForRow(row) {
      const name = (row.name || '').trim();
      let dir = (row.path || '').trim().replace(/[/\\]+$/, '');
      if (!name) return dir;
      if (!dir) return name;
      const sep = dir.includes('/') ? '/' : '\\';
      const endsWithFile =
        dir.length >= name.length &&
        dir.slice(-name.length).toLowerCase() === name.toLowerCase() &&
        (dir.length === name.length || dir[dir.length - name.length - 1] === sep || dir[dir.length - name.length - 1] === '\\');
      if (endsWithFile) return dir;
      return dir + sep + name;
    }

    /** Search-debug: one row’s path + basename tag-parse (Everything row shapes vary). */
    function searchDebugTagRowDigest(row) {
      if (!row) return null;
      const fp = fullPathForRow(row);
      const base = T.baseName(fp);
      const parsed = T.parseSegmentTags(base);
      return {
        name: row.name,
        path: row.path,
        fullPath: fp,
        base,
        parsedTags: parsed.tags,
        rowKeys: Object.keys(row).slice(0, 16),
      };
    }

    /** Everything index can lag after many renames; align lastRows / tagDiscoveryRows + check map with paths we just wrote. */
    function patchResultRowsAfterRenames(pairs) {
      if (!pairs || !pairs.length) return;
      for (const pair of pairs) {
        const fromRaw = String(pair.from || '').trim();
        const toRaw = String(pair.to || '').trim();
        if (!fromRaw || !toRaw) continue;
        const fromK = pathNormKey(fromRaw);
        if (pathNormKey(toRaw) === fromK) continue;
        const newName = T.baseName(toRaw);
        let par = T.parentDir(toRaw);
        if (par) par = par.replace(/[/\\]+$/, '');
        const patchOne = (row) => {
          if (pathNormKey(fullPathForRow(row)) !== fromK) return;
          row.name = newName;
          row.path = par;
        };
        for (const row of lastRows) patchOne(row);
        for (const row of tagDiscoveryRows) patchOne(row);
        for (const row of tagDiscoveryRowsLastGood) patchOne(row);
        if (checkedPathsMap.has(fromK)) {
          checkedPathsMap.delete(fromK);
          checkedPathsMap.set(pathNormKey(toRaw), toRaw);
        }
      }
    }

    /** Numeric modified time for client-side sort (same shapes as formatModified). */
    function rowModifiedSortKey(row) {
      const ms = modifiedTimeMs(row);
      return ms == null ? 0 : ms;
    }

    /** One comparator for all client-side re-ordering; tie-break by path so sort is deterministic. */
    function compareRowsBySort(a, b, col, asc) {
      const mul = asc ? 1 : -1;
      const pa = pathSortKey(a);
      const pb = pathSortKey(b);
      const byPath = () => {
        if (pa < pb) return -mul;
        if (pa > pb) return mul;
        return 0;
      };

      if (col === 'path') return byPath();
      if (col === 'name') {
        const na = String(a.name || '');
        const nb = String(b.name || '');
        const c = mul * na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
        return c || byPath();
      }
      if (col === 'size') {
        const sa = Number(a.size);
        const sb = Number(b.size);
        const va = Number.isFinite(sa) ? sa : 0;
        const vb = Number.isFinite(sb) ? sb : 0;
        if (va < vb) return -mul;
        if (va > vb) return mul;
        return byPath();
      }
      if (col === 'date_modified') {
        const da = rowModifiedSortKey(a);
        const db = rowModifiedSortKey(b);
        if (da < db) return -mul;
        if (da > db) return mul;
        return byPath();
      }
      if (col === 'ext') {
        const ea = rowExtSortKey(a);
        const eb = rowExtSortKey(b);
        const c = mul * ea.localeCompare(eb, undefined, { numeric: true, sensitivity: 'base' });
        return c || byPath();
      }
      return byPath();
    }

    function sortRowsForDisplay(rows, col, asc) {
      if (!Array.isArray(rows) || !rows.length) return;
      rows.sort((a, b) => compareRowsBySort(a, b, col, asc));
    }

    /**
     * Client-side re-ordering when needed:
     * - Path: plain string order on pathSortKey (same as sorting full paths as strings).
     * - Both + interleave: after folder: + file: merge, one sort then cap.
     * - force: server-direction fallback or post-merge.
     */
    function sortLastRowsForDisplay(force) {
      if (!lastRows.length) return;
      const mergedFolderFileLists =
        fileFolderFilterMode() === 'both' && document.getElementById('optSortFoldersWithFiles').checked;
      if (!force && !mergedFolderFileLists && sortColumn !== 'path' && sortColumn !== 'ext') return;
      const before = lastRows.length;
      sortRowsForDisplay(lastRows, sortColumn, sortAsc);
      searchDebugLog('sortLastRowsForDisplay', {
        force: !!force,
        mergedFolderFileLists,
        col: sortColumn,
        asc: sortAsc,
        count: before,
        first: lastRows.slice(0, 3).map((r) => fullPathForRow(r)),
        last: lastRows.slice(-3).map((r) => fullPathForRow(r)),
      });
    }

    function rowIsFolder(row) {
      const t = (row.type || '').toString().toLowerCase();
      return t === 'folder' || row.type === 2 || row.type === '2';
    }

    /** True if any path segment is .name or ~name (.git, .env, ~$temp); .. segments ignored. */
    function pathUnderDotFolder(fp) {
      const raw = String(fp || '').trim();
      if (!raw) return false;
      const parts = raw.replace(/\//g, '\\').split('\\').filter((p) => p !== '' && p !== '.');
      for (const seg of parts) {
        if (seg === '..') continue;
        if (isGoogleDriveShortcutTargetsSegment(seg)) continue;
        if (seg.startsWith('.') || seg.startsWith('~')) return true;
      }
      return false;
    }

    /** Hide . / ~ client-side (tag scan, global Regex+hide, or safety if server clause mismatches). */
    function rowsRespectingHideDotFolders(rows) {
      if (!document.getElementById('optHideDotFolders').checked) return rows;
      return rows.filter((r) => !pathUnderDotFolder(fullPathForRow(r)));
    }

    function loadTagStore() {
      try {
        const raw = localStorage.getItem(LS.tagStore);
        const a = raw ? JSON.parse(raw) : [];
        tagStoreOrder = Array.isArray(a)
          ? a
              .filter((x) => {
                if (!x || typeof x !== 'object') return false;
                if (typeof x.key === 'string' && String(x.key).trim()) return true;
                return !!String(x.display || '').trim();
              })
              .map((x) => {
                const hasKey = typeof x.key === 'string' && String(x.key).trim();
                let k = hasKey ? String(x.key).trim().toLowerCase() : '';
                const d = String(x.display || x.key || '').trim() || k;
                if (!k && d) k = d.toLowerCase();
                return { key: k, display: d || k };
              })
              .filter((x) => x.key)
          : [];
        if (tagStoreOrder.length > TAG_STORE_MAX) tagStoreOrder = tagStoreOrder.slice(0, TAG_STORE_MAX);
      } catch (_) {
        tagStoreOrder = [];
      }
    }

    function saveTagStore() {
      localStorage.setItem(LS.tagStore, JSON.stringify(tagStoreOrder.slice(0, TAG_STORE_MAX)));
    }

    function saveKnownBracketTags() {
      localStorage.setItem(
        LS.knownBracketTags,
        JSON.stringify(knownBracketTagsList.slice(0, KNOWN_BRACKET_TAGS_MAX))
      );
    }

    function loadKnownBracketTags() {
      try {
        const raw = localStorage.getItem(LS.knownBracketTags);
        const a = raw ? JSON.parse(raw) : [];
        knownBracketTagsList = Array.isArray(a)
          ? a
              .filter((x) => {
                if (!x || typeof x !== 'object') return false;
                if (typeof x.key === 'string' && String(x.key).trim()) return true;
                return !!String(x.display || '').trim();
              })
              .map((x) => {
                const hasKey = typeof x.key === 'string' && String(x.key).trim();
                let k = hasKey ? String(x.key).trim().toLowerCase() : '';
                const d = String(x.display || x.key || '').trim() || k;
                if (!k && d) k = d.toLowerCase();
                return { key: k, display: d || k };
              })
              .filter((x) => x.key)
          : [];
        if (knownBracketTagsList.length > KNOWN_BRACKET_TAGS_MAX) {
          knownBracketTagsList = knownBracketTagsList.slice(0, KNOWN_BRACKET_TAGS_MAX);
        }
      } catch (_) {
        knownBracketTagsList = [];
      }
      if (!knownBracketTagsList.length && tagStoreOrder.length) {
        knownBracketTagsList = tagStoreOrder.map((t) => ({ key: t.key, display: t.display }));
        saveKnownBracketTags();
      }
      searchDebugLog('tags.loadKnownFromLS', {
        knownLen: knownBracketTagsList.length,
        tagStoreLen: tagStoreOrder.length,
      });
    }

    /** Add tag to global list (creating a tag on disk or toggling filter). */
    function ensureKnownBracketTag(key, display) {
      const k = String(key || '').trim().toLowerCase();
      if (!k) return;
      const d = String(display || key).trim() || k;
      if (knownBracketTagsList.some((t) => t.key === k)) return;
      knownBracketTagsList.push({ key: k, display: d });
      if (knownBracketTagsList.length > KNOWN_BRACKET_TAGS_MAX) {
        knownBracketTagsList = knownBracketTagsList.slice(0, KNOWN_BRACKET_TAGS_MAX);
      }
      saveKnownBracketTags();
      scheduleTagPrefsDiskSync();
    }

    /** Append tag names from scan rows (full-index `\\[\\(` + r=1). */
    function absorbKnownBracketTagsFromScanRows(rows) {
      if (!rows || !rows.length) {
        searchDebugLog('tags.absorb.skip', { reason: 'no rows', knownLen: knownBracketTagsList.length });
        return;
      }
      const knownBefore = knownBracketTagsList.length;
      const tagModOk = !!(window.TagBrowserTags && T && typeof T.aggregateTagCountsFromRows === 'function');
      const m = tagModOk ? T.aggregateTagCountsFromRows(rows, fullPathForRow) : new Map();
      const have = new Set(knownBracketTagsList.map((t) => t.key));
      let added = 0;
      let changed = false;
      for (const [k, info] of m) {
        if (have.has(k)) continue;
        have.add(k);
        knownBracketTagsList.push({ key: k, display: info.display });
        added++;
        changed = true;
      }
      searchDebugLog('tags.absorb', {
        rowCount: rows.length,
        aggregateMapSize: m.size,
        aggregateKeysSample: [...m.keys()].slice(0, 30),
        tagModuleOk: tagModOk,
        newEntriesPushed: added,
        knownBefore,
        knownAfter: knownBracketTagsList.length,
        sampleRows: rows.slice(0, 4).map(searchDebugTagRowDigest),
      });
      if (rows.length && m.size === 0) {
        searchDebugLog('tags.absorb.emptyMap', {
          message:
            'Rows returned but aggregateTagCountsFromRows produced no tags — check fullPath/name vs bracket segment parsing.',
          digests: rows.slice(0, 10).map(searchDebugTagRowDigest),
        });
      }
      if (changed) {
        if (knownBracketTagsList.length > KNOWN_BRACKET_TAGS_MAX) {
          knownBracketTagsList = knownBracketTagsList.slice(0, KNOWN_BRACKET_TAGS_MAX);
        }
        saveKnownBracketTags();
        scheduleTagPrefsDiskSync();
      }
    }

    /** User chose this tag as filter — keep it in the bar across later searches. */
    function rememberTag(key, display) {
      const k = String(key || '').trim().toLowerCase();
      if (!k) return;
      const d = String(display || key).trim() || k;
      ensureKnownBracketTag(k, d);
      tagStoreOrder = tagStoreOrder.filter((t) => t.key !== k);
      tagStoreOrder.unshift({ key: k, display: d });
      if (tagStoreOrder.length > TAG_STORE_MAX) tagStoreOrder = tagStoreOrder.slice(0, TAG_STORE_MAX);
      saveTagStore();
      scheduleTagPrefsDiskSync();
    }

    function persistActiveTagFilter() {
      if (activeTagKeys.size) localStorage.setItem(LS.activeTagFilter, JSON.stringify([...activeTagKeys].sort()));
      else localStorage.removeItem(LS.activeTagFilter);
      scheduleTagPrefsDiskSync();
    }

    /** Restore tag filter from JSON array or legacy plain string. */
    function activeTagKeysFromStored(raw) {
      if (raw == null || !String(raw).trim()) return new Set();
      const s = String(raw).trim();
      if (s.startsWith('[')) {
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) {
            return new Set(parsed.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
          }
        } catch (_) {}
      }
      return new Set([s.toLowerCase()]);
    }

    /** Result-type filter radios: both | folders | files (legacy: two checkboxes in localStorage). */
    function fileFolderFilterMode() {
      if (document.getElementById('optFilterFolders').checked) return 'folders';
      if (document.getElementById('optFilterFiles').checked) return 'files';
      return 'both';
    }
    function setFileFolderFilterMode(mode) {
      const both = document.getElementById('optFilterBoth');
      const folders = document.getElementById('optFilterFolders');
      const files = document.getElementById('optFilterFiles');
      if (!both || !folders || !files) return;
      both.checked = mode === 'both';
      folders.checked = mode === 'folders';
      files.checked = mode === 'files';
    }

    function recencyFilterMode() {
      const el = document.querySelector('input[name="tagFoxRecencyFilter"]:checked');
      const v = el && el.value;
      return v && ['all', '1d', '1w', '1m', '1y'].includes(v) ? v : 'all';
    }

    function setRecencyFilterMode(mode) {
      const id =
        mode === '1d'
          ? 'optRecency1d'
          : mode === '1w'
            ? 'optRecency1w'
            : mode === '1m'
              ? 'optRecency1m'
              : mode === '1y'
                ? 'optRecency1y'
                : 'optRecencyAll';
      const r = document.getElementById(id);
      if (!r || r.name !== 'tagFoxRecencyFilter') return;
      r.checked = true;
    }

    function loadSettings() {
      migrateLocalStorageFromLegacy();
      loadTagStore();
      loadKnownBracketTags();
      document.getElementById('baseUrl').value =
        localStorage.getItem(LS.baseUrl) || 'http://127.0.0.1';
      document.getElementById('rootFolder').value = localStorage.getItem(LS.rootFolder) || '';
      document.getElementById('maxResults').value =
        localStorage.getItem(LS.maxResults) || '200';
      document.getElementById('httpUser').value = localStorage.getItem(LS.httpUser) || '';
      document.getElementById('optCase').checked = localStorage.getItem(LS.optCase) === '1';
      document.getElementById('optWholeWord').checked = localStorage.getItem(LS.optWholeWord) === '1';
      document.getElementById('optPath').checked = localStorage.getItem(LS.optPath) === '1';
      document.getElementById('optRegex').checked = localStorage.getItem(LS.optRegex) === '1';
      document.getElementById('optDiacritics').checked = localStorage.getItem(LS.optDiacritics) === '1';
      const legacyFolders = localStorage.getItem(LS.foldersOnly) === '1';
      const legacyFiles = localStorage.getItem(LS.filesOnly) === '1';
      let ffMode = 'both';
      if (legacyFolders) ffMode = 'folders';
      else if (legacyFiles) ffMode = 'files';
      setFileFolderFilterMode(ffMode);
      {
        const rf = localStorage.getItem(LS.recencyFilter);
        setRecencyFilterMode(['all', '1d', '1w', '1m', '1y'].includes(rf) ? rf : 'all');
      }
      sortColumn = localStorage.getItem(LS.sortBy) || 'name';
      if (!['name', 'path', 'date_modified', 'size', 'ext'].includes(sortColumn)) sortColumn = 'name';
      sortAsc = localStorage.getItem(LS.optAsc) !== '0';
      document.getElementById('folderSearchRecursive').checked =
        localStorage.getItem(LS.folderSearchRecursive) !== '0';
      document.getElementById('optHideDotFolders').checked = localStorage.getItem(LS.hideDotFolders) === '1';
      document.getElementById('optSortFoldersWithFiles').checked = localStorage.getItem(LS.sortFoldersWithFiles) !== '0';
      document.getElementById('optSearchDebug').checked = localStorage.getItem(LS.searchDebug) === '1';
      activeTagKeys = activeTagKeysFromStored(localStorage.getItem(LS.activeTagFilter));
      tagFilterCombineOr = localStorage.getItem(LS.tagFilterCombineOr) === '1';
      applyTagPrefsFromUserDataFile();
      for (const t of tagStoreOrder) ensureKnownBracketTag(t.key, t.display);
      searchDebugLog('tags.loadSettings.tail', {
        knownLen: knownBracketTagsList.length,
        tagStoreLen: tagStoreOrder.length,
      });
      searchDebugRender();
    }

    function saveSettings() {
      localStorage.setItem(LS.baseUrl, document.getElementById('baseUrl').value.trim());
      localStorage.setItem(LS.rootFolder, document.getElementById('rootFolder').value.trim());
      localStorage.setItem(LS.maxResults, document.getElementById('maxResults').value.trim());
      localStorage.setItem(LS.httpUser, document.getElementById('httpUser').value.trim());
      localStorage.setItem(LS.optCase, document.getElementById('optCase').checked ? '1' : '0');
      localStorage.setItem(LS.optWholeWord, document.getElementById('optWholeWord').checked ? '1' : '0');
      localStorage.setItem(LS.optPath, document.getElementById('optPath').checked ? '1' : '0');
      localStorage.setItem(LS.optRegex, document.getElementById('optRegex').checked ? '1' : '0');
      localStorage.setItem(LS.optDiacritics, document.getElementById('optDiacritics').checked ? '1' : '0');
      const ff = fileFolderFilterMode();
      localStorage.setItem(LS.foldersOnly, ff === 'folders' ? '1' : '0');
      localStorage.setItem(LS.filesOnly, ff === 'files' ? '1' : '0');
      localStorage.setItem(LS.recencyFilter, recencyFilterMode());
      localStorage.setItem(LS.sortBy, sortColumn);
      localStorage.setItem(LS.optAsc, sortAsc ? '1' : '0');
      localStorage.setItem(
        LS.folderSearchRecursive,
        document.getElementById('folderSearchRecursive').checked ? '1' : '0'
      );
      localStorage.setItem(LS.hideDotFolders, document.getElementById('optHideDotFolders').checked ? '1' : '0');
      localStorage.setItem(
        LS.sortFoldersWithFiles,
        document.getElementById('optSortFoldersWithFiles').checked ? '1' : '0'
      );
      localStorage.setItem(LS.searchDebug, document.getElementById('optSearchDebug').checked ? '1' : '0');
      localStorage.setItem(LS.tagFilterCombineOr, tagFilterCombineOr ? '1' : '0');
      persistActiveTagFilter();
    }

    function searchOptionsFromUI() {
      return {
        case: document.getElementById('optCase').checked,
        wholeword: document.getElementById('optWholeWord').checked,
        pathSearch: document.getElementById('optPath').checked,
        regex: document.getElementById('optRegex').checked,
        diacritics: document.getElementById('optDiacritics').checked,
        sort: sortColumn,
        ascending: sortAsc,
      };
    }

    function isSearchDebugOn() {
      return !!document.getElementById('optSearchDebug')?.checked;
    }

    function searchDebugStamp() {
      const d = new Date();
      const pad2 = (n) => String(n).padStart(2, '0');
      const pad3 = (n) => String(n).padStart(3, '0');
      return (
        d.getFullYear() +
        '-' +
        pad2(d.getMonth() + 1) +
        '-' +
        pad2(d.getDate()) +
        ' ' +
        pad2(d.getHours()) +
        ':' +
        pad2(d.getMinutes()) +
        ':' +
        pad2(d.getSeconds()) +
        '.' +
        pad3(d.getMilliseconds())
      );
    }

    function searchDebugRender() {
      const box = document.getElementById('searchDebugLog');
      if (!box) return;
      box.value = searchDebugLines.join('\n');
      box.scrollTop = box.scrollHeight;
    }

    function searchDebugClear() {
      searchDebugLines = [];
      searchDebugRender();
    }

    function searchDebugLog(eventName, payload) {
      if (!isSearchDebugOn()) return;
      let detail = '';
      try {
        detail = payload == null ? '' : ' ' + JSON.stringify(payload);
      } catch {
        detail = ' [unserializable payload]';
      }
      const line = `[${searchDebugStamp()}] ${eventName}${detail}`;
      searchDebugLines.push(line);
      if (searchDebugLines.length > SEARCH_DEBUG_MAX) {
        searchDebugLines = searchDebugLines.slice(searchDebugLines.length - SEARCH_DEBUG_MAX);
      }
      searchDebugRender();
      try {
        console.debug(line);
      } catch (_) {}
    }

    /** Keep request options aligned with UI; direction fallback is handled explicitly in runSearch when needed. */
    function everythingOptionsForRequest() {
      const o = searchOptionsFromUI();
      /* Everything HTTP has no extension sort; fetch by name then sort Type in the client. */
      if (o.sort === 'ext') return { ...o, sort: 'name' };
      return o;
    }

    function serializeSearchState() {
      const advPanel = document.getElementById('searchOptsAdvancedPanel');
      return {
        query: document.getElementById('query').value,
        rootFolder: document.getElementById('rootFolder').value,
        activeTagKeys: [...activeTagKeys].sort(),
        tagFilterCombineOr: !!tagFilterCombineOr,
        recursive: document.getElementById('folderSearchRecursive').checked,
        optCase: document.getElementById('optCase').checked,
        optWholeWord: document.getElementById('optWholeWord').checked,
        optPath: document.getElementById('optPath').checked,
        optRegex: document.getElementById('optRegex').checked,
        optDiacritics: document.getElementById('optDiacritics').checked,
        optFoldersOnly: fileFolderFilterMode() === 'folders',
        optFilesOnly: fileFolderFilterMode() === 'files',
        recencyFilter: recencyFilterMode(),
        optHideDotFolders: document.getElementById('optHideDotFolders').checked,
        optSortFoldersWithFiles: document.getElementById('optSortFoldersWithFiles').checked,
        sortColumn: sortColumn,
        sortAsc: sortAsc,
        colVisible: colVisible.slice(),
        advancedPanelOpen: !!(advPanel && !advPanel.hasAttribute('hidden')),
      };
    }

    function searchStatesEqual(a, b) {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    function updateSearchHistoryNavUI() {
      const back = document.getElementById('btnSearchHistBack');
      const fwd = document.getElementById('btnSearchHistFwd');
      if (!back || !fwd) return;
      back.disabled = searchHistIdx <= 0;
      fwd.disabled = searchHistIdx >= searchHist.length - 1;
    }

    function scheduleSearchHistoryCommit() {
      if (searchHistNavigating) return;
      if (searchHistDebounceTimer) clearTimeout(searchHistDebounceTimer);
      searchHistDebounceTimer = setTimeout(() => {
        searchHistDebounceTimer = null;
        commitSearchHistoryIfChanged();
      }, SEARCH_HIST_DEBOUNCE_MS);
    }

    /** Flush pending debounced commit and record now (scope / tag / sort / options — one step per action). */
    function commitSearchHistoryNow() {
      if (searchHistNavigating) return;
      if (searchHistDebounceTimer) {
        clearTimeout(searchHistDebounceTimer);
        searchHistDebounceTimer = null;
      }
      commitSearchHistoryIfChanged();
    }

    function commitSearchHistoryIfChanged() {
      if (searchHistNavigating) return;
      const s = serializeSearchState();
      const cur = searchHist[searchHistIdx];
      if (cur && searchStatesEqual(s, cur)) return;
      searchHist = searchHist.slice(0, searchHistIdx + 1);
      searchHist.push(s);
      if (searchHist.length > SEARCH_HIST_MAX) {
        const drop = searchHist.length - SEARCH_HIST_MAX;
        searchHist = searchHist.slice(drop);
        searchHistIdx = Math.max(0, searchHistIdx - drop);
      }
      searchHistIdx = searchHist.length - 1;
      updateSearchHistoryNavUI();
    }

    function applySearchState(s) {
      document.getElementById('query').value = s.query != null ? String(s.query) : '';
      document.getElementById('rootFolder').value = s.rootFolder != null ? String(s.rootFolder) : '';
      if (Array.isArray(s.activeTagKeys)) {
        activeTagKeys = new Set(s.activeTagKeys.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
      } else if (s.activeTagKey != null && String(s.activeTagKey).trim()) {
        activeTagKeys = new Set([String(s.activeTagKey).trim().toLowerCase()]);
      } else {
        activeTagKeys = new Set();
      }
      tagFilterCombineOr = !!s.tagFilterCombineOr;
      document.getElementById('folderSearchRecursive').checked = !!s.recursive;
      document.getElementById('optCase').checked = !!s.optCase;
      document.getElementById('optWholeWord').checked = !!s.optWholeWord;
      document.getElementById('optPath').checked = !!s.optPath;
      document.getElementById('optRegex').checked = !!s.optRegex;
      document.getElementById('optDiacritics').checked = !!s.optDiacritics;
      if (s.optFoldersOnly && s.optFilesOnly) setFileFolderFilterMode('both');
      else if (s.optFoldersOnly) setFileFolderFilterMode('folders');
      else if (s.optFilesOnly) setFileFolderFilterMode('files');
      else setFileFolderFilterMode('both');
      setRecencyFilterMode(
        s.recencyFilter && ['all', '1d', '1w', '1m', '1y'].includes(s.recencyFilter) ? s.recencyFilter : 'all'
      );
      document.getElementById('optHideDotFolders').checked = !!s.optHideDotFolders;
      document.getElementById('optSortFoldersWithFiles').checked = s.optSortFoldersWithFiles !== false;
      sortColumn =
        s.sortColumn && ['name', 'path', 'date_modified', 'size', 'ext'].includes(s.sortColumn) ? s.sortColumn : 'name';
      sortAsc = s.sortAsc !== false;
      {
        const norm = normalizeColVisibleFromSaved(s.colVisible);
        if (norm && COL_VISIBLE_TOGGLE_INDEXES.some((i) => norm[i])) colVisible = norm;
        else colVisible = COL_VISIBLE_DEFAULT.slice();
      }
      syncColumnVisibilityMenu();
      applyTableColumnVisibility();
      const panel = document.getElementById('searchOptsAdvancedPanel');
      const advBtn = document.getElementById('btnToggleSearchOptsAdvanced');
      if (panel && advBtn) {
        const open = !!s.advancedPanelOpen;
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        advBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        advBtn.classList.toggle('active', open);
      }
    }

    async function goSearchHistory(delta) {
      const next = searchHistIdx + delta;
      if (next < 0 || next >= searchHist.length) return;
      searchHistNavigating = true;
      try {
        searchHistIdx = next;
        applySearchState(searchHist[searchHistIdx]);
        persistActiveTagFilter();
        saveSettings();
        updateSortHeaders();
        renderScopeBreadcrumb();
        renderTagBar();
        await runSearchNow();
      } finally {
        searchHistNavigating = false;
        updateSearchHistoryNavUI();
      }
    }

    /** Apply one saved favourite search — same side effects as stepping history, but also append to search history when changed. */
    async function applyFavouriteSearchState(s) {
      if (searchHistNavigating) return;
      searchHistNavigating = true;
      try {
        applySearchState(s);
        updateQueryPlaceholder();
        persistActiveTagFilter();
        saveSettings();
        updateSortHeaders();
        renderScopeBreadcrumb();
        renderTagBar();
        await runSearchNow();
      } finally {
        searchHistNavigating = false;
        updateSearchHistoryNavUI();
      }
      commitSearchHistoryNow();
    }

    function seedSearchHistoryFromCurrent() {
      searchHist = [serializeSearchState()];
      searchHistIdx = 0;
      updateSearchHistoryNavUI();
    }

    /** Small folder glyph (Bootstrap-like), leading; never the word “folder”. */
    function folderIconEl() {
      const holder = document.createElement('span');
      holder.className = 'folder-type-icon';
      holder.setAttribute('aria-label', 'Folder');
      holder.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" focusable="false">' +
        '<path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.548 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/>' +
        '</svg>';
      return holder;
    }

    /** File-earmark outline + optional 2nd path (Bootstrap-style viewBox 0 0 16 16). */
    const FILE_ICON_PATHS = {
      base: [
        'M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3H4v12h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3z',
      ],
      text: [
        'M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3H4v12h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3z',
        'M5.5 6.5h5v1h-5v-1zm0 2h5v1h-5v-1zm0 2h3.5v1h-3.5v-1z',
      ],
      code: [
        'M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3H4v12h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3z',
        'M5.72 7.28a.75.75 0 0 1 0 1.06L4.06 10l1.66 1.66a.75.75 0 1 1-1.06 1.06l-2.2-2.2a.75.75 0 0 1 0-1.06l2.2-2.2a.75.75 0 0 1 1.06 0zm4.56 0a.75.75 0 0 1 1.06 0l2.2 2.2a.75.75 0 0 1 0 1.06l-2.2 2.2a.75.75 0 1 1-1.06-1.06L11.94 10l-1.66-1.66a.75.75 0 0 1 0-1.06z',
      ],
      media: [
        'M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3H4v12h8a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3z',
        'M6.55 6.65v3.4l3.1-1.75-3.1-1.65z',
      ],
    };

    function buildFileIconSpecMap() {
      const m = new Map();
      const add = (list, kind, color, label) => {
        for (const e of list) m.set(e, { kind, color, label });
      };
      add(['md', 'markdown', 'mdown'], 'text', '#0969da', 'Markdown');
      add(['txt', 'log'], 'text', '#6c757d', 'Text');
      add(['doc', 'docx', 'rtf', 'odt'], 'base', '#2b579a', 'Word');
      add(['xls', 'xlsx', 'csv', 'ods'], 'base', '#217346', 'Spreadsheet');
      add(['ppt', 'pptx', 'odp'], 'base', '#c43e1c', 'Slides');
      add(['pdf'], 'base', '#dc3545', 'PDF');
      add(['html', 'htm', 'css', 'js', 'ts', 'mjs', 'cjs', 'jsx', 'tsx', 'json', 'xml', 'vue', 'svelte'], 'code', '#6f42c1', 'Code');
      add(['yml', 'yaml', 'toml', 'ini', 'sql', 'py', 'r', 'cpp', 'h', 'hpp', 'c', 'cs', 'go', 'rs', 'java', 'php', 'rb', 'sh', 'ps1'], 'code', '#7952b3', 'Code');
      add(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'raw'], 'base', '#fd7e14', 'Image');
      add(['zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz'], 'base', '#a0522d', 'Archive');
      add(['mp3', 'ogg', 'wav', 'flac', 'aac', 'm4a'], 'media', '#d63384', 'Audio');
      add(['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv'], 'media', '#9d174d', 'Video');
      add(['exe', 'msi', 'dll', 'sys'], 'base', '#495057', 'Binary');
      return m;
    }
    const FILE_ICON_BY_EXT = buildFileIconSpecMap();

    function fileExtFromPretty(pretty) {
      const i = pretty.lastIndexOf('.');
      if (i <= 0) return '';
      return pretty.slice(i + 1).toLowerCase();
    }

    /** Type column label; folders always read as Folder (matches sort bucket). */
    function rowTypeLabel(row) {
      if (rowIsFolder(row)) return 'Folder';
      const fp = fullPathForRow(row);
      const ext = fileExtFromPretty(T.parseSegmentTags(T.baseName(fp)).pretty);
      return ext || '—';
    }

    function rowExtSortKey(row) {
      if (rowIsFolder(row)) return 'folder';
      const fp = fullPathForRow(row);
      const ext = fileExtFromPretty(T.parseSegmentTags(T.baseName(fp)).pretty);
      return (ext || '').toLowerCase();
    }

    function fileIconEl(ext) {
      const spec = FILE_ICON_BY_EXT.get(ext) || { kind: 'base', color: '#6c757d', label: ext ? '.' + ext : 'File' };
      const paths = FILE_ICON_PATHS[spec.kind] || FILE_ICON_PATHS.base;
      const holder = document.createElement('span');
      holder.className = 'file-type-icon';
      holder.style.color = spec.color;
      holder.setAttribute('aria-label', spec.label);
      let inner = '';
      for (const d of paths) {
        inner += '<path d="' + d + '"/>';
      }
      holder.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" focusable="false">' +
        inner +
        '</svg>';
      return holder;
    }

    function renderNameCell(row, preParsed) {
      const fp = fullPathForRow(row);
      const base = T.baseName(fp);
      const parsed = preParsed || T.parseSegmentTags(base);
      const wrap = document.createElement('div');
      wrap.className = 'name-badges d-flex flex-nowrap align-items-center gap-1 min-w-0';
      const lead = document.createElement('span');
      lead.className = 'name-badges-lead';
      if (rowIsFolder(row)) lead.appendChild(folderIconEl());
      else lead.appendChild(fileIconEl(fileExtFromPretty(parsed.pretty)));
      for (const tag of parsed.tags) appendTagPillWithRemove(lead, tag, fp);
      const title = document.createElement('span');
      title.className = 'name-badges-title text-truncate';
      title.textContent = parsed.pretty;
      lead.appendChild(title);
      wrap.appendChild(lead);
      return wrap;
    }

    function filteredRows() {
      let rows = rowsRespectingHideDotFolders(lastRows);
      if (activeTagKeys.size) {
        if (tagFilterCombineOr && activeTagKeys.size > 1) {
          rows = rows.filter((r) => {
            for (const k of activeTagKeys) {
              if (T.rowHasTag(r, k, fullPathForRow)) return true;
            }
            return false;
          });
        } else {
          rows = rows.filter((r) => {
            for (const k of activeTagKeys) {
              if (!T.rowHasTag(r, k, fullPathForRow)) return false;
            }
            return true;
          });
        }
      }
      const cut = recencyFilterCutoffMs();
      if (cut != null) {
        const recencyInEverything =
          recencyFilterMode() !== 'all' && !document.getElementById('optRegex').checked;
        if (!recencyInEverything) {
          rows = rows.filter((r) => {
            const ms = modifiedTimeMs(r);
            return ms != null && ms >= cut;
          });
        }
      }
      return rows;
    }

    /** Visible rows in the table UI (includes synthetic folder rows in path-group mode). */
    function listRowsForUi() {
      return buildPathGroupedDisplayRows(filteredRows());
    }

    function clearEmptyResultsPulseHintClasses() {
      const qWrap = document.getElementById('queryInputGroup');
      qWrap?.classList.remove('pulse-hint', 'pulse-hint--sparse');
      qWrap?.style.removeProperty('--empty-pulse-frac');
      document.getElementById('query')?.classList.remove('pulse-hint', 'pulse-hint--sparse');
      const recLbl = document.querySelector('label[for="folderSearchRecursive"]');
      recLbl?.classList.remove('pulse-hint', 'pulse-hint--sparse');
      recLbl?.style.removeProperty('--empty-pulse-frac');
      document.querySelectorAll('#tagBar button[data-tag-key]').forEach((b) => {
        b.classList.remove('pulse-hint', 'pulse-hint--sparse');
        b.style.removeProperty('--empty-pulse-frac');
      });
    }

    /** Restart 20s decay (--empty-pulse-frac scales 1–9 row hint; mode empty = zero-row full strength). */
    function restartPulseHint(el, want, mode, sparseFrac) {
      if (!el) return;
      el.classList.remove('pulse-hint', 'pulse-hint--sparse');
      el.style.removeProperty('--empty-pulse-frac');
      if (!want) return;
      if (mode === 'sparse') el.style.setProperty('--empty-pulse-frac', String(sparseFrac));
      void el.offsetWidth;
      el.classList.add('pulse-hint');
      if (mode === 'sparse') el.classList.add('pulse-hint--sparse');
    }

    /**
     * Visible rows 0: full pulse on filters (non-empty query / recursive off / active tags).
     * Visible 1–9: same targets, weaker pulse; strength (10−n)/10 → 0 at 10 rows.
     * opts.forceRestart: replay animation after search (row count may change with same fingerprint).
     */
    function updateEmptyResultsPulseHints(visibleRowCount, opts) {
      const forceRestart = !!(opts && opts.forceRestart);
      const n = Math.max(0, Number(visibleRowCount) || 0);
      const isEmpty = n === 0;
      const sparseFrac = !isEmpty && n < 10 ? (10 - n) / 10 : 0;
      const inBand = isEmpty || sparseFrac > 0;
      const mode = isEmpty ? 'empty' : 'sparse';

      const q = document.getElementById('query');
      const qWrap = document.getElementById('queryInputGroup');
      const rec = document.getElementById('folderSearchRecursive');
      const recLbl = document.querySelector('label[for="folderSearchRecursive"]');
      const qNonEmpty = !!(q && q.value && q.value.trim());
      const wantQ = inBand && qNonEmpty;
      const wantRec = inBand && rec && !rec.checked;
      const wantTag = inBand && activeTagKeys.size > 0;

      if (!inBand) {
        pulseHintFingerprint = '';
        clearEmptyResultsPulseHintClasses();
        return;
      }

      const tagFp = [...activeTagKeys].sort().join('\0');
      const fp =
        String(n) +
        '\0' +
        tagFp +
        '\0' +
        (q && q.value != null ? String(q.value).trim() : '') +
        '\0' +
        (rec && rec.checked ? '1' : '0') +
        '\0' +
        (tagFilterCombineOr ? 'or' : 'and');
      const fpChanged = forceRestart || fp !== pulseHintFingerprint;
      if (fpChanged) pulseHintFingerprint = fp;

      if (fpChanged) {
        restartPulseHint(qWrap, wantQ, mode, sparseFrac);
        restartPulseHint(recLbl, wantRec, mode, sparseFrac);
        document.querySelectorAll('#tagBar button.tag-bar-pill-active[data-tag-key]').forEach((btn) => {
          restartPulseHint(btn, wantTag && activeTagKeys.has(btn.dataset.tagKey), mode, sparseFrac);
        });
        return;
      }

      qWrap?.classList.toggle('pulse-hint', wantQ);
      qWrap?.classList.toggle('pulse-hint--sparse', wantQ && mode === 'sparse');
      if (wantQ && mode === 'sparse') qWrap?.style.setProperty('--empty-pulse-frac', String(sparseFrac));
      else if (!wantQ || mode === 'empty') qWrap?.style.removeProperty('--empty-pulse-frac');

      recLbl?.classList.toggle('pulse-hint', wantRec);
      recLbl?.classList.toggle('pulse-hint--sparse', wantRec && mode === 'sparse');
      if (wantRec && mode === 'sparse') recLbl?.style.setProperty('--empty-pulse-frac', String(sparseFrac));
      else if (!wantRec || mode === 'empty') recLbl?.style.removeProperty('--empty-pulse-frac');

      document.querySelectorAll('#tagBar button.tag-bar-pill-active[data-tag-key]').forEach((btn) => {
        const on = wantTag && activeTagKeys.has(btn.dataset.tagKey);
        btn.classList.toggle('pulse-hint', on);
        btn.classList.toggle('pulse-hint--sparse', on && mode === 'sparse');
        if (on && mode === 'sparse') btn.style.setProperty('--empty-pulse-frac', String(sparseFrac));
        else if (!on || mode === 'empty') btn.style.removeProperty('--empty-pulse-frac');
      });
    }

    /** After a successful Everything response: replay hint when visible row count is under 10. */
    function pulseEmptyResultHintsAfterSearchOk() {
      const n = listRowsForUi().length;
      if (n >= 10) return;
      updateEmptyResultsPulseHints(n, { forceRestart: true });
    }

    function renderTagBar() {
      const el = document.getElementById('tagBar');
      el.innerHTML = '';
      // Icon-only tag-bar controls (tooltips + aria-labels carry the text).
      const tagBarIconBtnClass =
        'btn btn-sm btn-outline-secondary d-inline-flex align-items-center justify-content-center p-0';
      const tagBarIconBtnSize = 'width:2rem;height:2rem';
      const svgRescan15 =
        '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">' +
        '<path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>' +
        '<path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.02 1.82a.25.25 0 0 1 0 .364L8.41 4.658A.25.25 0 0 1 8 4.466z"/>' +
        '</svg>';
      const svgClear15 =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">' +
        '<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>' +
        '</svg>';
      const appendRescanAllTags = () => {
        const rescan = document.createElement('button');
        rescan.type = 'button';
        rescan.className = tagBarIconBtnClass;
        rescan.style.cssText = tagBarIconBtnSize;
        rescan.innerHTML = svgRescan15;
        rescan.setAttribute('aria-label', 'Refresh search and rescan all tags');
        rescan.title =
          'Re-run the main Everything search, then a full-index [(…)] bracket-tag scan. Prunes remembered or active tag filters that do not appear in that scan. (Each ordinary search also refreshes tag discovery, without pruning.)';
        rescan.addEventListener('click', () => {
          void (async () => {
            rescan.disabled = true;
            try {
              await runSearchNow();
              await runTagDiscoverySearch(true);
              refreshTagModalDatalist();
            } finally {
              rescan.disabled = false;
            }
          })();
        });
        el.appendChild(rescan);
      };
      // Counts match the visible table (filteredRows), not merged tag-scan rows.
      const forTagCounting = rowsRespectingHideDotFolders(filteredRows());
      const counts = forTagCounting.length ? T.aggregateTagCountsFromRows(forTagCounting, fullPathForRow) : new Map();
      // Pill set = global knownBracketTagsList order; numbers = tag hits in this result list.
      const entries = [];
      const pillKeys = new Set();
      for (const t of knownBracketTagsList) {
        if (!t || !t.key) continue;
        pillKeys.add(t.key);
        const hit = counts.get(t.key);
        entries.push({ key: t.key, display: t.display, count: hit ? hit.count : 0 });
      }
      for (const ak of activeTagKeys) {
        if (pillKeys.has(ak)) continue;
        pillKeys.add(ak);
        const hit = counts.get(ak);
        entries.push({ key: ak, display: hit && hit.display ? hit.display : ak, count: hit ? hit.count : 0 });
      }
      searchDebugLog('tags.renderTagBar', {
        pillEntries: entries.length,
        knownListLen: knownBracketTagsList.length,
        tagStoreLen: tagStoreOrder.length,
        activeTagKeys: activeTagKeys.size,
        countsMapSize: counts.size,
        forTagCountingRows: forTagCounting.length,
        discRowsLen: tagDiscoveryRows.length,
        discLastGoodLen: tagDiscoveryRowsLastGood.length,
        lastRowsLen: lastRows.length,
        knownKeysSample: knownBracketTagsList.slice(0, 20).map((t) => t.key),
      });
      if (!entries.length) {
        const s = document.createElement('span');
        s.className = 'text-muted';
        s.textContent =
          'No bracket tags in your list yet. Add one from the tags dialog, toggle a filter, or use Rescan.';
        el.appendChild(s);
        appendRescanAllTags();
        updateEmptyResultsPulseHints(listRowsForUi().length);
        return;
      }
      function appendTagFilterCombineToggle(barEl) {
        const g = document.createElement('div');
        g.className = 'btn-group btn-group-sm';
        g.setAttribute('role', 'group');
        g.title =
          'Combine multiple tag filters: match ALL (AND) or ANY (OR). Used in the Everything query (when Regex is off) and in the result table filter.';
        const idA = 'tagFoxTagCombineAnd';
        const idO = 'tagFoxTagCombineOr';
        const rA = document.createElement('input');
        rA.type = 'radio';
        rA.className = 'btn-check';
        rA.name = 'tagFoxTagCombine';
        rA.id = idA;
        rA.autocomplete = 'off';
        rA.checked = !tagFilterCombineOr;
        const lA = document.createElement('label');
        lA.className = 'btn btn-outline-secondary btn-sm';
        lA.htmlFor = idA;
        lA.textContent = 'AND';
        const rO = document.createElement('input');
        rO.type = 'radio';
        rO.className = 'btn-check';
        rO.name = 'tagFoxTagCombine';
        rO.id = idO;
        rO.autocomplete = 'off';
        rO.checked = !!tagFilterCombineOr;
        const lO = document.createElement('label');
        lO.className = 'btn btn-outline-secondary btn-sm';
        lO.htmlFor = idO;
        lO.textContent = 'OR';
        const sync = () => {
          const next = !!rO.checked;
          if (next === tagFilterCombineOr) return;
          tagFilterCombineOr = next;
          saveSettings();
          void runSearchNow();
          commitSearchHistoryNow();
        };
        rA.addEventListener('change', sync);
        rO.addEventListener('change', sync);
        g.appendChild(rA);
        g.appendChild(lA);
        g.appendChild(rO);
        g.appendChild(lO);
        barEl.appendChild(g);
      }
      for (const info of entries) {
        const key = info.key;
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.tagKey = key;
        const on = activeTagKeys.has(key);
        b.className = 'btn btn-sm tag-bar-pill' + (on ? ' tag-bar-pill-active' : '');
        applyTagBarPillStyle(b, key);
        b.textContent = info.count > 0 ? info.display + ' (' + info.count + ')' : info.display;
        b.title =
          'Toggle [(…)] tag filter (multi-tag: ' +
          (tagFilterCombineOr ? 'OR = any selected tag' : 'AND = all selected tags') +
          '). Regex off: adds an Everything regex: clause; any tag on turns Recursive. ' +
          (info.count > 0
            ? 'Number = rows in the current result list with this tag (same cap as Max results).'
            : 'No rows with this tag in the current list—try Rescan or broaden search.');
        b.addEventListener('click', () => {
          void (async () => {
            if (activeTagKeys.has(key)) activeTagKeys.delete(key);
            else {
              rememberTag(key, info.display);
              activeTagKeys.add(key);
            }
            persistActiveTagFilter();

            let turnedRecursiveOn = false;
            if (activeTagKeys.size) {
              const rec = document.getElementById('folderSearchRecursive');
              if (!rec.checked) {
                rec.checked = true;
                turnedRecursiveOn = true;
                saveSettings();
                renderScopeBreadcrumb();
              }
            }

            await runSearchNow();
            commitSearchHistoryNow();

            if (activeTagKeys.size) {
              const st = document.getElementById('status');
              const extra = turnedRecursiveOn
                ? ' — Recursive was off; turned on to search the full scope tree for this tag.'
                : ' — Tag filter: searching recursively under scope.';
              st.textContent = (st.textContent || '') + extra;
            }
          })();
        });
        el.appendChild(b);
      }
      appendTagFilterCombineToggle(el);
      if (activeTagKeys.size) {
        const clearTags = document.createElement('button');
        clearTags.type = 'button';
        clearTags.className = tagBarIconBtnClass;
        clearTags.style.cssText = tagBarIconBtnSize;
        clearTags.innerHTML = svgClear15;
        clearTags.setAttribute('aria-label', 'Clear tag filters');
        clearTags.title = 'Turn off every active tag filter at once.';
        clearTags.addEventListener('click', () => {
          void (async () => {
            activeTagKeys.clear();
            persistActiveTagFilter();
            await runSearchNow();
            commitSearchHistoryNow();
            updateEmptyResultsPulseHints(listRowsForUi().length);
          })();
        });
        el.appendChild(clearTags);
      }
      appendRescanAllTags();
      updateEmptyResultsPulseHints(listRowsForUi().length);
      refreshTagFoxChromeTooltips(document.getElementById('tagBar'));
    }

    /** Hide every Bootstrap tooltip (optionally keep one trigger). Optional hard DOM purge removes every body tooltip node. */
    function tagfoxHideAllBootstrapTooltips(exceptTrigger, hardDomPurge = false) {
      if (!window.bootstrap || !bootstrap.Tooltip) return;
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
        if (exceptTrigger && el === exceptTrigger) return;
        const inst = bootstrap.Tooltip.getInstance(el);
        if (inst) inst.hide();
      });
      requestAnimationFrame(() => {
        document.querySelectorAll('body > .tooltip').forEach((tipEl) => {
          if (hardDomPurge || !tipEl.classList.contains('show')) tipEl.remove();
        });
      });
    }

    /** Move tooltip text off native title to prevent Chromium's sticky default tooltip bubble. */
    function normalizeTooltipTitleAttr(el) {
      const rawTitle = el.getAttribute('title');
      if (rawTitle && String(rawTitle).trim()) {
        el.setAttribute('data-bs-title', rawTitle);
        el.removeAttribute('title');
        return rawTitle;
      }
      return el.getAttribute('data-bs-title') || el.getAttribute('data-bs-original-title') || '';
    }

    /** One-time: solo tooltip, dismiss on outside click / scroll / blur / modal; peel stuck DOM. */
    function installTagFoxTooltipGuardsOnce() {
      if (installTagFoxTooltipGuardsOnce._ok) return;
      installTagFoxTooltipGuardsOnce._ok = true;
      document.body.addEventListener(
        'show.bs.tooltip',
        (e) => {
          tagfoxHideAllBootstrapTooltips(e.target, false);
        },
        true
      );
      document.body.addEventListener(
        'hidden.bs.tooltip',
        () => {
          requestAnimationFrame(() => {
            document.querySelectorAll('body > .tooltip:not(.show)').forEach((tipEl) => tipEl.remove());
          });
        },
        true
      );
      document.addEventListener(
        'pointerdown',
        (e) => {
          if (e.target.closest?.('[data-bs-toggle="tooltip"]')) return;
          if (e.target.closest?.('.tooltip')) return;
          tagfoxHideAllBootstrapTooltips(null, true);
        },
        true
      );
      document.addEventListener('scroll', () => tagfoxHideAllBootstrapTooltips(null, true), true);
      window.addEventListener('blur', () => tagfoxHideAllBootstrapTooltips(null, true));
      document.addEventListener('dragstart', () => tagfoxHideAllBootstrapTooltips(null, true), true);
    }

    /** Bootstrap tooltips for UI chrome; skips results grid and non-tooltip Bootstrap widgets. */
    function refreshTagFoxChromeTooltips(root) {
      if (!root || !window.bootstrap || !bootstrap.Tooltip) return;
      root.querySelectorAll('[title], [data-bs-title]').forEach((el) => {
        if (el.closest('#resultsTable')) return;
        const dbt = el.getAttribute('data-bs-toggle');
        if (dbt && dbt !== 'tooltip') return;
        const t = normalizeTooltipTitleAttr(el);
        if (!t || !String(t).trim()) return;
        if (el.tagName === 'TEXTAREA') return;
        try {
          const inst = bootstrap.Tooltip.getInstance(el);
          if (inst) inst.dispose();
          el.setAttribute('data-bs-toggle', 'tooltip');
          new bootstrap.Tooltip(el, {
            container: 'body',
            customClass: 'tagfox-ui-tooltip',
            trigger: 'hover',
            animation: false,
          });
        } catch (_) {}
      });
    }

    /** Bootstrap JS tooltip for one table cell (full plain-text; container body avoids clipping). */
    function bindCellTooltip(td, text) {
      td.setAttribute('data-bs-toggle', 'tooltip');
      td.setAttribute('data-bs-placement', 'top');
      td.setAttribute('data-bs-custom-class', 'results-cell-tooltip');
      td.setAttribute('data-bs-title', String(text ?? ''));
      td.removeAttribute('title');
    }

    /** Keyboard ↑/↓: move highlight only — avoids full renderTable() (O(n) per key). */
    function syncResultsSelectionHighlight() {
      const tbody = document.getElementById('tbody');
      if (!tbody) return;
      const want = selectedFullPath;
      for (const tr of tbody.querySelectorAll('tr')) {
        const p = tr.dataset.rowPath;
        tr.classList.toggle('table-active', !!(want && p === want));
      }
    }

    /** Shift+↑/↓ updates checkedPathsMap but not the row inputs; keep UI in sync without rebuilding the table. */
    function syncResultsRowCheckboxStates() {
      const tbody = document.getElementById('tbody');
      if (!tbody) return;
      for (const tr of tbody.querySelectorAll('tr')) {
        const p = tr.dataset.rowPath;
        if (!p) continue;
        const chk = tr.querySelector('input[type="checkbox"]');
        if (chk) chk.checked = isCheckedPath(p);
      }
    }

    function renderTable() {
      const tbody = document.getElementById('tbody');
      const status = document.getElementById('status');
      tbody.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
        const tip = bootstrap.Tooltip.getInstance(el);
        if (tip) tip.dispose();
      });
      tbody.innerHTML = '';
      pruneCheckedPaths();
      const rows = filteredRows();
      const rowsForDisplay = buildPathGroupedDisplayRows(rows);
      const suffix =
        activeTagKeys.size || recencyFilterMode() !== 'all' ? ' (filtered)' : '';
      const rawN = lastRows.length;
      // Hide . / ~ / tag filter shrink the list after Everything’s cap — show both so path ▲/▼ “missing rows” isn’t mistaken for truncation at 10.
      const visN = rowsForDisplay.length;
      if (!visN) status.textContent = 'No rows' + suffix;
      else if (visN === rawN) status.textContent = visN + ' row(s)' + suffix;
      else status.textContent = visN + ' / ' + rawN + ' row(s)' + suffix;
      const showPathFolderGrouping = shouldShowPathFolderGrouping();
      const showPathTreeGutter = document.getElementById('folderSearchRecursive').checked && sortColumn === 'path';
      for (const row of rowsForDisplay) {
        const fp = fullPathForRow(row);
        const tr = document.createElement('tr');
        if (rowIsFolder(row)) tr.classList.add('results-folder-row');

        const tdCb = document.createElement('td');
        tdCb.className = 'align-middle text-start results-td-cb';
        const cbWrap = document.createElement('div');
        cbWrap.className = 'results-row-cb-wrap';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'form-check-input m-0 results-cb';
        chk.autocomplete = 'off';
        chk.checked = isCheckedPath(fp);
        chk.title = 'Select for bulk Explorer copy, delete, Tags';
        chk.setAttribute('aria-label', 'Select row');
        chk.addEventListener('click', (e) => e.stopPropagation());
        chk.addEventListener('change', () => {
          resultsShiftRangeAnchorIdx = null;
          toggleCheckPath(fp, chk.checked);
          updateSelectAllCheckboxState();
          if (chk.checked) setSelection(row, fp);
          else renderTable();
        });
        cbWrap.appendChild(chk);
        const blob = document.createElement('span');
        blob.className = recencyBlobClassForRow(row);
        blob.title = 'Recency (modified time)';
        cbWrap.appendChild(blob);
        tdCb.appendChild(cbWrap);

        const baseName = T.baseName(fp);
        const parsedName = T.parseSegmentTags(baseName);
        const tdName = document.createElement('td');
        tdName.className = 'min-w-0';
        {
          const nameInner = renderNameCell(row, parsedName);
          if (showPathTreeGutter) {
            const dep = showPathFolderGrouping ? Number(row.__pathTreeDepthUi) || 1 : parentSegmentsForRow(row).length;
            if (dep > 1) {
              const outer = document.createElement('div');
              outer.className = 'd-flex align-items-center min-w-0';
              const gut = document.createElement('span');
              gut.className = 'path-tree-gutter flex-shrink-0';
              /* One │ per depth level — no trailing space so guides sit closer horizontally. */
              gut.textContent = '\u2502'.repeat(dep - 1);
              nameInner.classList.add('min-w-0');
              outer.appendChild(gut);
              outer.appendChild(nameInner);
              tdName.appendChild(outer);
            } else tdName.appendChild(nameInner);
          } else tdName.appendChild(nameInner);
        }
        const nameTip =
          parsedName.pretty +
          (parsedName.tags.length ? '\nTags: ' + parsedName.tags.join(', ') : '') +
          '\n—\n' +
          baseName;

        const tdPath = document.createElement('td');
        tdPath.className = 'col-path text-muted small';
        const pathBox = document.createElement('div');
        pathBox.className = 'path-ellip-start';
        fillPathCellBox(pathBox, pathColumnDisplayForRow(fp, rowIsFolder(row)));
        tdPath.appendChild(pathBox);

        const tdType = document.createElement('td');
        tdType.className = 'text-nowrap small';
        const typeStr = rowTypeLabel(row);
        tdType.textContent = typeStr;

        const tdSize = document.createElement('td');
        tdSize.className = 'text-end text-nowrap small';
        tdSize.textContent = formatSize(row.size);

        const tdDate = document.createElement('td');
        tdDate.className = 'text-nowrap small';
        tdDate.textContent = formatModified(row.date_modified ?? row.date_modified_unix);

        const tdAct = document.createElement('td');
        tdAct.className = 'text-nowrap';
        const parentForScope = normalizeFolderPathForEverything(T.parentDir(fp));
        const btnScopeParent = document.createElement('button');
        btnScopeParent.type = 'button';
        btnScopeParent.className =
          'btn btn-outline-secondary btn-sm me-1 d-inline-flex align-items-center justify-content-center p-0';
        btnScopeParent.style.width = '1.85rem';
        btnScopeParent.style.height = '1.85rem';
        btnScopeParent.title = 'Set scope to parent folder';
        btnScopeParent.setAttribute('aria-label', 'Set scope to parent folder');
        btnScopeParent.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/></svg>';
        btnScopeParent.disabled = !parentForScope;
        btnScopeParent.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!parentForScope) return;
          await applySearchScopeAndRefresh(parentForScope);
        });
        const btnOpen = document.createElement('button');
        btnOpen.type = 'button';
        btnOpen.className =
          'btn btn-outline-secondary btn-sm me-1 d-inline-flex align-items-center justify-content-center p-0';
        btnOpen.style.width = '1.85rem';
        btnOpen.style.height = '1.85rem';
        /* Files: shell open; folders: Explorer — box-arrow-up-right (same family as toolbar “open”). */
        const openTitle = rowIsFolder(row) ? 'Show in File Explorer' : 'Open with default app';
        btnOpen.title = openTitle;
        btnOpen.setAttribute('aria-label', openTitle);
        btnOpen.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5v-6.636a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 0-1z"/><path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/></svg>';
        btnOpen.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (rowIsFolder(row)) {
            await window.tagBrowser.showInFolder(fp);
            return;
          }
          await openFileDefaultOrGoogleWorkspace(fp);
        });
        const btnClip = document.createElement('button');
        btnClip.type = 'button';
        btnClip.className =
          'btn btn-outline-secondary btn-sm me-1 row-clip-btn d-inline-flex align-items-center justify-content-center p-0';
        btnClip.style.width = '1.85rem';
        btnClip.style.height = '1.85rem';
        btnClip.title = 'Copy for Explorer paste (Windows)';
        btnClip.setAttribute('aria-label', 'Copy for Explorer paste');
        btnClip.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>';
        btnClip.addEventListener('click', async (e) => {
          e.stopPropagation();
          const r = await window.tagBrowser.copyExplorerPaste([fp]);
          if (!r || !r.ok) status.textContent = (r && r.error) || 'Copy for Explorer failed';
        });
        const btnMore = document.createElement('button');
        btnMore.type = 'button';
        btnMore.className =
          'btn btn-outline-secondary btn-sm me-1 d-inline-flex align-items-center justify-content-center p-0';
        btnMore.style.width = '1.85rem';
        btnMore.style.height = '1.85rem';
        btnMore.title = 'More — copy path, open, Drive search, rename (F2), new folder in scope, delete…';
        btnMore.setAttribute('aria-label', 'More actions');
        btnMore.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3"/></svg>';
        btnMore.addEventListener('click', async (e) => {
          e.stopPropagation();
          const r = btnMore.getBoundingClientRect();
          const res = await window.tagBrowser.showItemActionsMenu({
            filePath: fp,
            scopeFolder: document.getElementById('rootFolder').value.trim(),
            x: Math.round(r.left),
            y: Math.round(r.bottom),
          });
          if (res && res.action === 'newFolderInScope') void createNewFolderInScopeInteractive();
          else if (res && res.action === 'rename') void renameItemInteractive(fp);
        });
        const btnTags = document.createElement('button');
        btnTags.type = 'button';
        btnTags.className =
          'btn btn-outline-primary btn-sm me-1 d-inline-flex align-items-center justify-content-center p-0';
        btnTags.style.width = '1.85rem';
        btnTags.style.height = '1.85rem';
        btnTags.title = 'Edit [(…)] tags in the name';
        btnTags.setAttribute('aria-label', 'Edit tags');
        /* Same tag SVG as tag toolbar lead (#tagBar row in index.html). */
        btnTags.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M2 2v13.5A1.5 1.5 0 0 0 3.5 17h9a1.5 1.5 0 0 0 1.5-1.5V9.294l-6.5-6.5A1.5 1.5 0 0 0 6.5 2H2zm7.5 1 5.5 5.5v7.793l-6.5-6.5V3.5z"/></svg>';
        btnTags.addEventListener('click', (e) => {
          e.stopPropagation();
          openTagModal(fp);
        });

        tdAct.appendChild(btnOpen);
        tdAct.appendChild(btnScopeParent);
        tdAct.appendChild(btnClip);
        tdAct.appendChild(btnTags);
        tdAct.appendChild(btnMore);

        const sizeStr = formatSize(row.size);
        const dateStr = formatModified(row.date_modified ?? row.date_modified_unix);
        bindCellTooltip(tdName, nameTip);
        bindCellTooltip(tdPath, fp);
        bindCellTooltip(tdType, typeStr);
        bindCellTooltip(tdSize, sizeStr);
        bindCellTooltip(tdDate, dateStr);
        bindCellTooltip(
          tdAct,
          'Open — file: default app; folder: show in Explorer\nParent folder — set scope to containing folder\nClipboard — Explorer paste (Windows)\nTags — tag editor\n⋯ — copy actions + Drive search, delete, …'
        );

        tr.appendChild(tdCb);
        tr.appendChild(tdName);
        tr.appendChild(tdPath);
        tr.appendChild(tdType);
        tr.appendChild(tdSize);
        tr.appendChild(tdDate);
        tr.appendChild(tdAct);

        tr.dataset.rowPath = fp;
        // Drop target: folder row → that folder; file row → parent folder
        {
          const dropDir = rowIsFolder(row)
            ? normalizeFolderPathForEverything(fp)
            : normalizeFolderPathForEverything(T.parentDir(fp));
          if (dropDir) tr.dataset.dropPath = dropDir;
        }
        tr.draggable = true;
        tr.addEventListener('dragstart', (e) => {
          if (e.target.closest('button, input, textarea, select')) {
            e.preventDefault();
            return;
          }
          const paths = pathsForRowDrag(fp);
          const wantOs = e.altKey || tagBrowserNextOsFileDrag;
          if (window.tagBrowser.startDragFiles && wantOs) {
            tagBrowserNextOsFileDrag = false;
            e.preventDefault();
            tagBrowserActiveNativeDragPaths = paths.slice();
            window.tagBrowser.startDragFiles(paths);
            return;
          }
          if (tagBrowserNextOsFileDrag) tagBrowserNextOsFileDrag = false;
          setDataTransferTagBrowserHtml5Paths(e.dataTransfer, paths);
        });
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (e.target.closest('input[type="checkbox"]')) return;
          // Folders: select only (rename, bulk, props) — do not change scope; Enter still scopes/opens like before.
          resultsShiftRangeAnchorIdx = null;
          setSelection(row, fp);
        });
        // File: dblclick → open (same as Enter). Folder: dblclick → scope/focus that folder (same as Enter).
        tr.addEventListener('dblclick', (e) => {
          if (e.target.closest('button')) return;
          if (e.target.closest('input[type="checkbox"]')) return;
          e.preventDefault();
          resultsShiftRangeAnchorIdx = null;
          setSelection(row, fp);
          void keyboardActivateSelection();
        });

        tbody.appendChild(tr);
      }
      tbody.querySelectorAll('td[data-bs-toggle="tooltip"]').forEach((td) => {
        new bootstrap.Tooltip(td, { container: 'body', trigger: 'hover', animation: false });
      });
      applyTableColumnVisibility();
      syncResultsSelectionHighlight();
      updateSelectAllCheckboxState();
      updateEmptyResultsPulseHints(rowsForDisplay.length);
    }

    function rebuildModalTagsUnion() {
      const u = new Map();
      for (const fp of modalTargetPaths) {
        for (const t of T.parseSegmentTags(T.baseName(fp)).tags) {
          const k = t.toLowerCase();
          if (!u.has(k)) u.set(k, t);
        }
      }
      modalTags = [...u.values()];
    }

    function updateTagModalPathLabel() {
      const el = document.getElementById('tagModalPath');
      if (!el) return;
      if (modalTargetPaths.length > 1) el.textContent = modalTargetPaths.length + ' items selected';
      else if (modalTargetPaths.length === 1) el.textContent = modalTargetPaths[0];
      else el.textContent = '';
    }

    function renderModalChips() {
      const wrap = document.getElementById('tagModalChips');
      wrap.innerHTML = '';
      modalTags.forEach((tag, idx) => {
        const span = document.createElement('span');
        span.className = 'badge align-middle me-1';
        span.style.backgroundColor = tagColorCss(tag);
        span.style.color = '#212529';
        span.appendChild(document.createTextNode(tag + ' '));
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'btn btn-sm btn-light py-0 px-1 align-baseline';
        x.textContent = '×';
        x.setAttribute('aria-label', 'Remove');
        x.addEventListener('click', async () => {
          if (tagRenameBusy) return;
          const removed = modalTags[idx];
          if (modalTargetPaths.length > 1) {
            const ok = await bulkRemoveTag(removed);
            if (!ok) return;
          } else {
            modalTags.splice(idx, 1);
            renderModalChips();
            const ok = await performTagRename('Updating tags…');
            if (!ok) {
              modalTags.splice(idx, 0, removed);
              renderModalChips();
            }
          }
        });
        span.appendChild(x);
        wrap.appendChild(span);
      });
    }

    function setTagApplyFeedback(msg) {
      const el = document.getElementById('tagModalFeedback');
      const status = document.getElementById('status');
      if (el) el.textContent = msg || '';
      if (status) status.textContent = msg || '';
    }

    function openTagModal(fp) {
      modalTargetPaths = [fp];
      document.getElementById('tagModalBulkHint').classList.add('d-none');
      setTagApplyFeedback('');
      updateTagModalPathLabel();
      const base = T.baseName(fp);
      modalTags = [...T.parseSegmentTags(base).tags];
      renderModalChips();
      refreshTagModalDatalist();
      if (!tagModalInst) {
        tagModalInst = new bootstrap.Modal(document.getElementById('tagModal'), { focus: false });
      }
      tagModalInst.show();
    }

    function openTagModalBulk(paths) {
      const uniq = [];
      const seen = new Set();
      for (const p of paths || []) {
        const k = pathNormKey(p);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        uniq.push(p);
      }
      if (!uniq.length) return;
      modalTargetPaths = uniq;
      document.getElementById('tagModalBulkHint').classList.remove('d-none');
      setTagApplyFeedback('');
      updateTagModalPathLabel();
      rebuildModalTagsUnion();
      renderModalChips();
      refreshTagModalDatalist();
      if (!tagModalInst) {
        tagModalInst = new bootstrap.Modal(document.getElementById('tagModal'), { focus: false });
      }
      tagModalInst.show();
    }

    async function bulkRemoveTag(tagToRemove) {
      if (tagRenameBusy) return false;
      const low = tagToRemove.toLowerCase();
      tagRenameBusy = true;
      document.getElementById('tagModal')?.classList.add('tag-renaming');
      setTagApplyFeedback('Updating ' + modalTargetPaths.length + ' item(s)…');
      try {
        const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
        const pathPairs = [];
        for (let i = 0; i < modalTargetPaths.length; i++) {
          let fp = modalTargetPaths[i];
          const base = T.baseName(fp);
          const tags = T.parseSegmentTags(base).tags.filter((x) => x.toLowerCase() !== low);
          const newBase = T.buildTaggedComponent(base, tags);
          const parent = T.parentDir(fp);
          const sep = fp.includes('/') ? '/' : '\\';
          const toPath = parent ? parent + sep + newBase : newBase;
          const fromN = fp.replace(/[/\\]+$/, '').toLowerCase();
          const toN = toPath.replace(/[/\\]+$/, '').toLowerCase();
          if (fromN === toN) continue;
          const res = await window.tagBrowser.renamePath({ fromPath: fp, toPath, rootPrefix });
          if (!res || !res.ok) {
            setTagApplyFeedback((res && res.error) || 'Rename failed on ' + fp);
            return false;
          }
          pathPairs.push({ from: fp, to: toPath });
          modalTargetPaths[i] = toPath;
          if (selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN) {
            selectedFullPath = toPath;
            renderScopeBreadcrumb();
          }
        }
        setTagApplyFeedback('Saved.');
        await refreshAfterTagsSaved(pathPairs);
        rebuildModalTagsUnion();
        renderModalChips();
        updateTagModalPathLabel();
        return true;
      } catch (e) {
        setTagApplyFeedback(String(e.message || e));
        return false;
      } finally {
        tagRenameBusy = false;
        document.getElementById('tagModal')?.classList.remove('tag-renaming');
        if (document.getElementById('tagModal')?.classList.contains('show')) {
          document.getElementById('tagModalInput')?.focus();
        }
      }
    }

    async function bulkAddTag(tag) {
      if (tagRenameBusy) return false;
      const low = tag.toLowerCase();
      tagRenameBusy = true;
      document.getElementById('tagModal')?.classList.add('tag-renaming');
      setTagApplyFeedback('Adding tag to ' + modalTargetPaths.length + ' item(s)…');
      let any = false;
      try {
        const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
        const pathPairs = [];
        for (let i = 0; i < modalTargetPaths.length; i++) {
          let fp = modalTargetPaths[i];
          const base = T.baseName(fp);
          const cur = T.parseSegmentTags(base).tags;
          if (cur.some((x) => x.toLowerCase() === low)) continue;
          any = true;
          const newBase = T.buildTaggedComponent(base, [...cur, tag]);
          const parent = T.parentDir(fp);
          const sep = fp.includes('/') ? '/' : '\\';
          const toPath = parent ? parent + sep + newBase : newBase;
          const res = await window.tagBrowser.renamePath({ fromPath: fp, toPath, rootPrefix });
          if (!res || !res.ok) {
            setTagApplyFeedback((res && res.error) || 'Rename failed on ' + fp);
            return false;
          }
          pathPairs.push({ from: fp, to: toPath });
          modalTargetPaths[i] = toPath;
          const fromN = fp.replace(/[/\\]+$/, '').toLowerCase();
          if (selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN) {
            selectedFullPath = toPath;
            renderScopeBreadcrumb();
          }
        }
        if (!any) setTagApplyFeedback('Tag already on all items.');
        else {
          setTagApplyFeedback('Saved.');
          rememberTag(low, tag);
          await refreshAfterTagsSaved(pathPairs);
          rebuildModalTagsUnion();
          renderModalChips();
          updateTagModalPathLabel();
        }
        return true;
      } catch (e) {
        setTagApplyFeedback(String(e.message || e));
        return false;
      } finally {
        tagRenameBusy = false;
        document.getElementById('tagModal')?.classList.remove('tag-renaming');
        if (document.getElementById('tagModal')?.classList.contains('show')) {
          document.getElementById('tagModalInput')?.focus();
        }
      }
    }

    /** Add one tag by display string (bulk vs single-item modal flows). */
    /** Quick-add / Enter can fire again before the prior rename finishes; wait instead of dropping the add. */
    async function waitForTagRenameIdle(maxMs) {
      const limit = Date.now() + (maxMs || 120000);
      while (tagRenameBusy) {
        if (Date.now() > limit) return false;
        await new Promise((r) => setTimeout(r, 25));
      }
      return true;
    }

    async function applyModalAddTag(v) {
      if (!(await waitForTagRenameIdle())) return;
      const raw = String(v || '').trim();
      if (!raw) return;
      const low = raw.toLowerCase();
      if (modalTargetPaths.length > 1) {
        if (modalTags.some((t) => t.toLowerCase() === low)) return;
        await bulkAddTag(raw);
        return;
      }
      if (modalTags.some((t) => t.toLowerCase() === low)) return;
      modalTags.push(raw);
      renderModalChips();
      const ok = await performTagRename('Adding tag…');
      if (!ok) {
        modalTags.pop();
        renderModalChips();
      } else {
        rememberTag(low, raw);
      }
    }

    async function addModalTagFromInput() {
      const inp = document.getElementById('tagModalInput');
      const v = inp.value.trim();
      if (!v) return;
      inp.value = '';
      await applyModalAddTag(v);
    }

    /** Single-item: rename basename to match modalTags; multi-item uses bulk Add/Remove only. */
    async function performTagRename(hint) {
      if (tagRenameBusy) return false;
      if (modalTargetPaths.length !== 1 || !String(modalTargetPaths[0] || '').trim()) {
        setTagApplyFeedback('Nothing to rename.');
        return false;
      }
      let modalPath = modalTargetPaths[0];
      if (!window.tagBrowser || typeof window.tagBrowser.renamePath !== 'function') {
        setTagApplyFeedback('renamePath missing — check preload / Electron bridge.');
        return false;
      }
      const parent = T.parentDir(modalPath);
      const base = T.baseName(modalPath);
      const newBase = T.buildTaggedComponent(base, modalTags);
      const sep = modalPath.includes('/') ? '/' : '\\';
      const toPath = parent ? parent + sep + newBase : newBase;
      const fromN = modalPath.replace(/[/\\]+$/, '').toLowerCase();
      const toN = toPath.replace(/[/\\]+$/, '').toLowerCase();
      if (fromN === toN) {
        setTagApplyFeedback('No change.');
        return true;
      }
      tagRenameBusy = true;
      document.getElementById('tagModal')?.classList.add('tag-renaming');
      setTagApplyFeedback(hint || 'Renaming…');
      try {
        const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
        const fromPath = modalPath;
        const res = await window.tagBrowser.renamePath({
          fromPath,
          toPath,
          rootPrefix,
        });
        if (!res || !res.ok) {
          setTagApplyFeedback((res && res.error) || 'Rename failed');
          return false;
        }
        const oldSel = selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN;
        modalTargetPaths[0] = toPath;
        updateTagModalPathLabel();
        if (oldSel) {
          selectedFullPath = toPath;
          renderScopeBreadcrumb();
        }
        setTagApplyFeedback('Saved.');
        await refreshAfterTagsSaved([{ from: fromPath, to: toPath }]);
        return true;
      } catch (e) {
        setTagApplyFeedback('Rename error: ' + String(e.message || e));
        return false;
      } finally {
        tagRenameBusy = false;
        document.getElementById('tagModal')?.classList.remove('tag-renaming');
        if (document.getElementById('tagModal')?.classList.contains('show')) {
          document.getElementById('tagModalInput')?.focus();
        }
      }
    }

    async function runSearch() {
      const runId = ++searchRunSeq;
      const status = document.getElementById('status');
      saveSettings();
      const baseUrl = document.getElementById('baseUrl').value.trim() || 'http://127.0.0.1';
      const rootFolder = document.getElementById('rootFolder').value.trim();
      const query = document.getElementById('query').value;
      const rec = document.getElementById('folderSearchRecursive').checked;
      let searchText = composeScopedEverythingSearch(rootFolder, query, rec);
      searchText = appendActiveTagToEverythingQuery(searchText);
      const ff = fileFolderFilterMode();
      if (ff === 'folders') {
        searchText = (searchText.trim() + ' folder:').trim();
      } else if (ff === 'files') {
        searchText = (searchText.trim() + ' file:').trim();
      }
      searchText = appendHideDotFoldersToEverythingQuery(searchText);
      searchText = appendRecencyToEverythingQuery(searchText);
      const count = document.getElementById('maxResults').value;
      const cap = Math.min(5000, Math.max(1, parseInt(String(count).trim(), 10) || 200));
      const httpUser = document.getElementById('httpUser').value;
      const httpPassword = document.getElementById('httpPassword').value;
      const baseSearchOpts = everythingOptionsForRequest();
      const hideDotServer =
        document.getElementById('optHideDotFolders').checked &&
        !document.getElementById('optRegex').checked;
      const options = hideDotServer ? { ...baseSearchOpts, pathSearch: true } : baseSearchOpts;
      const makeDoSearch = (opts) => {
        const payload = { baseUrl, count, httpUser, httpPassword, options: opts };
        return (st) => window.tagBrowser.search({ ...payload, searchText: st });
      };
      const doSearch = makeDoSearch(options);

      const directionCanMisbehave = (opts) =>
        (opts.sort === 'path' && opts.ascending === true) || (opts.sort === 'date_modified' && opts.ascending === false);
      const countLooksWrongForDirection = (rowsLen) =>
        cap > 40 && rowsLen >= 0 && rowsLen < Math.max(3, Math.floor(cap * 0.2));
      const pickRows = (res) => (res && Array.isArray(res.rows) ? res.rows : []);
      const shouldSwitchDirection = (baseRowsLen, altRowsLen) => altRowsLen >= Math.max(baseRowsLen + 5, baseRowsLen * 2);
      searchDebugLog('runSearch.start', {
        runId,
        sortColumn,
        sortAsc,
        ff,
        interleave: document.getElementById('optSortFoldersWithFiles').checked,
        cap,
        query,
        searchText,
        hideDotServer,
        options,
      });

      async function doSearchWithDirectionFallback(st) {
        const t0 = performance.now();
        searchDebugLog('search.request.base', { runId, searchText: st, options });
        const baseRes = await doSearch(st);
        const baseRows = pickRows(baseRes);
        searchDebugLog('search.response.base', {
          runId,
          searchText: st,
          ok: !!(baseRes && baseRes.ok),
          rows: baseRows.length,
          ms: Math.round(performance.now() - t0),
          err: baseRes && baseRes.ok ? '' : (baseRes && baseRes.error) || 'unknown',
        });
        if (!baseRes || !baseRes.ok) return { ok: false, error: (baseRes && baseRes.error) || 'Search failed', rows: [] };
        let rows = baseRows;
        let usedFallbackSort = false;
        if (directionCanMisbehave(options) && countLooksWrongForDirection(rows.length)) {
          const altOptions = { ...options, ascending: !options.ascending };
          const altDoSearch = makeDoSearch(altOptions);
          const t1 = performance.now();
          searchDebugLog('search.request.alt', { runId, searchText: st, altOptions });
          const altRes = await altDoSearch(st);
          if (altRes && altRes.ok) {
            const altRows = pickRows(altRes);
            searchDebugLog('search.response.alt', {
              runId,
              searchText: st,
              rows: altRows.length,
              ms: Math.round(performance.now() - t1),
            });
            if (shouldSwitchDirection(rows.length, altRows.length)) {
              rows = altRows;
              usedFallbackSort = true;
              searchDebugLog('search.fallback.useAlt', {
                runId,
                searchText: st,
                baseRows: baseRows.length,
                altRows: altRows.length,
              });
            }
          } else {
            searchDebugLog('search.response.altError', {
              runId,
              searchText: st,
              err: (altRes && altRes.error) || 'alt failed',
            });
          }
        }
        return { ok: true, rows, usedFallbackSort };
      }

      status.textContent = 'Searching…';

      // Both + interleave: folder:/file: so one pool isn’t “all folders first” from Everything; merge then string-sort paths and cap.
      const wantFolderFileSplit =
        ff === 'both' && document.getElementById('optSortFoldersWithFiles').checked;
      searchDebugLog('runSearch.branch', { runId, wantFolderFileSplit });

      let res;
      if (wantFolderFileSplit) {
        const base = searchText.trim();
        const rFo = await doSearchWithDirectionFallback((base + ' folder:').trim());
        const rFi = await doSearchWithDirectionFallback((base + ' file:').trim());
        searchDebugLog('runSearch.split.results', {
          runId,
          foldersOk: !!rFo.ok,
          filesOk: !!rFi.ok,
          folderRows: (rFo.rows || []).length,
          fileRows: (rFi.rows || []).length,
        });
        if (rFo.ok && rFi.ok) {
          lastRows = (rFo.rows || []).concat(rFi.rows || []);
          searchDebugLog('runSearch.split.concat', { runId, concatRows: lastRows.length });
          sortLastRowsForDisplay(true);
          if (lastRows.length > cap) lastRows = lastRows.slice(0, cap);
          searchDebugLog('runSearch.split.final', {
            runId,
            finalRows: lastRows.length,
            first: lastRows.slice(0, 3).map((r) => fullPathForRow(r)),
            last: lastRows.slice(-3).map((r) => fullPathForRow(r)),
          });
          status.textContent = lastRows.length ? lastRows.length + ' result(s)' : 'No results';
          await syncSelectionAfterSearch();
          renderTagBar();
          renderTable();
          pulseEmptyResultHintsAfterSearchOk();
          kickTagDiscoveryAfterSearch();
          return;
        }
        res = await doSearchWithDirectionFallback(base);
      } else {
        res = await doSearchWithDirectionFallback(searchText);
      }

      if (!res.ok) {
        lastRows = [];
        searchDebugLog('runSearch.error', { runId, err: res.error || 'Search failed' });
        status.textContent = res.error || 'Search failed';
        await syncSelectionAfterSearch();
        renderTagBar();
        renderTable();
        return;
      }
      lastRows = Array.isArray(res.rows) ? res.rows : [];
      sortLastRowsForDisplay(!!res.usedFallbackSort);
      searchDebugLog('runSearch.single.final', {
        runId,
        usedFallbackSort: !!res.usedFallbackSort,
        rows: lastRows.length,
        first: lastRows.slice(0, 3).map((r) => fullPathForRow(r)),
        last: lastRows.slice(-3).map((r) => fullPathForRow(r)),
      });
      status.textContent = lastRows.length ? lastRows.length + ' result(s)' : 'No results';
      await syncSelectionAfterSearch();
      renderTagBar();
      renderTable();
      pulseEmptyResultHintsAfterSearchOk();
      kickTagDiscoveryAfterSearch();
    }

    const resultsThead = document.getElementById('resultsTable').querySelector('thead');
    resultsThead.addEventListener('mousedown', (e) => {
      const h = e.target.closest('.th-resize');
      if (!h) return;
      e.preventDefault();
      e.stopPropagation();
      startTableColResize(e, +h.dataset.resizeIdx);
    });
    resultsThead.addEventListener('click', (e) => {
      if (e.target.closest('.th-resize')) return;
      if (e.target.closest('#chkSelectAllResults')) return;
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const key = th.dataset.sort;
      if (sortColumn === key) sortAsc = !sortAsc;
      else {
        sortColumn = key;
        // Size / Modified: first click = largest / newest first; Name & Path stay A→Z.
        sortAsc = key !== 'size' && key !== 'date_modified';
      }
      saveSettings();
      updateSortHeaders();
      commitSearchHistoryNow();
      void runSearchNow();
    });

    document.getElementById('query').addEventListener('input', () => {
      scheduleSearch();
      scheduleSearchHistoryCommit();
    });
    // Electron/Windows: sometimes the page keeps rendering but keyboard focus is stuck in window chrome.
    // Re-focus webContents first so mouse clicks on query always place caret in the box.
    document.getElementById('query').addEventListener('pointerdown', () => {
      pullWebContentsKeyboardFocus();
    });
    document.getElementById('query').addEventListener('focus', () => {
      pullWebContentsKeyboardFocus();
    });
    document.getElementById('query').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) void runSearchNow();
      // Leave the field and highlight first hit so ↑/↓/Enter work on the list next.
      if (e.key === 'ArrowDown' && listRowsForUi().length) {
        e.preventDefault();
        moveResultsSelectionToEdge(false);
        e.target.blur();
      }
    });

    document.getElementById('btnSaveFavouriteFolder').addEventListener('click', () => {
      const status = document.getElementById('status');
      const p = currentScopeFolderPath();
      if (!p) {
        status.textContent = 'No folder to save — set Scope folder in Settings, or click a folder row.';
        return;
      }
      const list = loadFavouriteFolders();
      if (list.some((x) => x.toLowerCase() === p.toLowerCase())) {
        status.textContent = 'Already in favourites.';
        return;
      }
      list.push(p);
      saveFavouriteFolders(list);
      renderFavFoldersBar();
      status.textContent = 'Favourite saved.';
    });

    document.getElementById('btnSaveFavouriteSearch').addEventListener('click', () => {
      const status = document.getElementById('status');
      const snap = serializeSearchState();
      const list = loadFavouriteSearches();
      if (list.some((x) => searchStatesEqual(x, snap))) {
        status.textContent = 'Already saved this search.';
        return;
      }
      list.push(snap);
      saveFavouriteSearches(list);
      renderFavSearchesBar();
      status.textContent = 'Search saved.';
    });

    document.getElementById('btnCreateTodoMd').addEventListener('click', () => void createTodoMdInScope());
    document.getElementById('newMdTitleInput').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      document.getElementById('btnCreateTodoMd').click();
    });

    document.querySelectorAll('input[name="tagFoxFileFolderFilter"]').forEach((el) => {
      el.addEventListener('change', () => {
        saveSettings();
        scheduleSearch();
        commitSearchHistoryNow();
      });
    });

    document.querySelectorAll('input[name="tagFoxRecencyFilter"]').forEach((el) => {
      el.addEventListener('change', () => {
        saveSettings();
        commitSearchHistoryNow();
        /* dm: is baked into the HTTP search — must re-run Everything or lastRows stays stale (renderTable alone is not enough). Regex: recency stays client-side on lastRows. */
        if (document.getElementById('optRegex').checked) {
          void syncSelectionAfterSearch();
          renderTable();
        } else {
          void runSearchNow();
        }
      });
    });
    ['folderSearchRecursive', 'optCase', 'optWholeWord', 'optPath', 'optRegex', 'optDiacritics'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        saveSettings();
        if (id === 'folderSearchRecursive') renderScopeBreadcrumb();
        if (id === 'optCase' && document.getElementById('bulkRenameModal')?.classList.contains('show')) {
          updateBulkRenamePreview();
        }
        scheduleSearch();
        commitSearchHistoryNow();
      });
    });

    // Client-side filter only — no Everything round-trip.
    document.getElementById('optHideDotFolders').addEventListener('change', () => {
      saveSettings();
      if (document.getElementById('optHideDotFolders').checked && selectedFullPath) {
        const row = selectedRowForActions();
        if (row && pathUnderDotFolder(selectedFullPath)) {
          selectedRow = null;
          selectedFullPath = null;
          void flushMdFileAutosave();
        }
      }
      void syncSelectionAfterSearch();
      renderTable();
      void runTagDiscoverySearch(false);
      commitSearchHistoryNow();
    });

    document.getElementById('btnToggleSearchOptsAdvanced').addEventListener('click', () => {
      const panel = document.getElementById('searchOptsAdvancedPanel');
      const btn = document.getElementById('btnToggleSearchOptsAdvanced');
      const open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('active', open);
    });

    ['baseUrl', 'maxResults'].forEach((id) => {
      document.getElementById(id).addEventListener('input', scheduleSearch);
    });
    document.getElementById('rootFolder').addEventListener('input', () => {
      renderScopeBreadcrumb();
      scheduleSearch();
      scheduleSearchHistoryCommit();
    });
    document.getElementById('btnStatusScopeParent').addEventListener('click', () => void goToParentScopeFolder());
    document.getElementById('statusColumnsMenu').addEventListener('change', (e) => {
      const t = e.target;
      if (!t || t.type !== 'checkbox') return;
      const idx = Number(t.getAttribute('data-col-idx'));
      if (!Number.isInteger(idx) || !COL_VISIBLE_TOGGLE_INDEXES.includes(idx)) return;
      const next = !!t.checked;
      if (!next) {
        const kept = COL_VISIBLE_TOGGLE_INDEXES.some((i) => i !== idx && colVisible[i] !== false);
        if (!kept) {
          t.checked = true;
          return;
        }
      }
      colVisible[idx] = next;
      persistColVisibilityToStorage();
      applyTableColumnVisibility();
    });
    document.getElementById('btnClearQuery').addEventListener('click', () => {
      document.getElementById('query').value = '';
      scheduleSearch();
      commitSearchHistoryNow();
    });
    document.getElementById('btnClearScope').addEventListener('click', () => clearSearchScope());
    document.getElementById('httpUser').addEventListener('input', scheduleSearch);
    document.getElementById('httpPassword').addEventListener('input', scheduleSearch);
    document.getElementById('optSortFoldersWithFiles').addEventListener('change', () => {
      saveSettings();
      commitSearchHistoryNow();
      void runSearchNow();
    });
    document.getElementById('optSearchDebug').addEventListener('change', () => {
      saveSettings();
      if (isSearchDebugOn()) searchDebugLog('debug.enabled', { on: true });
    });
    document.getElementById('btnClearSearchDebug').addEventListener('click', () => {
      searchDebugClear();
      searchDebugLog('debug.cleared', {});
    });
    document.getElementById('btnCopySearchDebug').addEventListener('click', async () => {
      const text = searchDebugLines.join('\n');
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const status = document.getElementById('status');
        if (status) status.textContent = 'Debug log copied.';
      } catch (_) {
        const status = document.getElementById('status');
        if (status) status.textContent = 'Could not copy debug log.';
      }
    });

    document.getElementById('chkSelectAllResults').addEventListener('change', (e) => {
      resultsShiftRangeAnchorIdx = null;
      const on = e.target.checked;
      const vis = listRowsForUi();
      for (const row of vis) {
        toggleCheckPath(fullPathForRow(row), on);
      }
      updateSelectAllCheckboxState();
      if (on && vis.length) {
        syncResultsRowCheckboxStates();
        setSelection(vis[vis.length - 1], fullPathForRow(vis[vis.length - 1]));
      } else renderTable();
    });
    document.getElementById('btnBulkClip').addEventListener('click', async () => {
      const status = document.getElementById('status');
      const p = getCheckedPathsArr();
      if (!p.length) return;
      const r = await window.tagBrowser.copyExplorerPaste(p);
      if (!r || !r.ok) status.textContent = (r && r.error) || 'Copy for Explorer failed';
    });
    document.getElementById('btnBulkTrash').addEventListener('click', async () => {
      const status = document.getElementById('status');
      const p = getCheckedPathsArr();
      if (!p.length) return;
      if (!confirm(recycleBinConfirmMessage(p))) return;
      detachViewerEditorsForTrashedPaths(p);
      const r = await window.tagBrowser.trashPaths(p);
      if (!r || !r.ok) status.textContent = (r && r.error) || 'Delete failed';
      else {
        checkedPathsMap.clear();
        updateBulkBar();
        void refreshAfterDiskMutation(); // + paths-mutated from main; retries help Everything catch up
      }
    });
    document.getElementById('btnBulkTags').addEventListener('click', () => {
      const p = getCheckedPathsArr();
      if (!p.length) return;
      openTagModalBulk(p);
    });
    document.getElementById('btnBulkClearSel').addEventListener('click', () => {
      checkedPathsMap.clear();
      updateBulkBar();
      renderTable();
    });

    document.getElementById('tagModal').addEventListener('shown.bs.modal', () => {
      refreshTagModalDatalist();
      requestAnimationFrame(() => document.getElementById('tagModalInput')?.focus());
    });
    document.getElementById('bulkRenameModal').addEventListener('shown.bs.modal', () => {
      requestAnimationFrame(() => {
        const rep = document.getElementById('bulkRenameReplace');
        if (rep) {
          rep.focus();
          rep.select();
        } else document.getElementById('bulkRenameFind')?.focus();
      });
    });
    document.getElementById('bulkRenameModal').addEventListener('hidden.bs.modal', () => {
      bulkRenameTargetPaths = [];
    });
    document.getElementById('bulkRenameApply').addEventListener('click', () => void applyBulkRename());
    document.getElementById('bulkRenameFind').addEventListener('input', () => updateBulkRenamePreview());
    document.getElementById('bulkRenameReplace').addEventListener('input', () => updateBulkRenamePreview());
    document.getElementById('bulkRenameFind').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('bulkRenameReplace')?.focus();
      }
    });
    document.getElementById('bulkRenameReplace').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void applyBulkRename();
      }
    });
    document.getElementById('tagModalAddBtn').addEventListener('click', () => void addModalTagFromInput());
    document.getElementById('tagModalInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void addModalTagFromInput();
      }
    });

    document.getElementById('readmeEditor').addEventListener('input', () => {
      document.getElementById('readmePreview').innerHTML = mdPreviewHtml(document.getElementById('readmeEditor').value);
      syncReadmePreviewChrome({ pulse: false });
    });
    document.getElementById('mdFileEditor').addEventListener('input', () => {
      document.getElementById('mdFilePreview').innerHTML = mdPreviewHtml(document.getElementById('mdFileEditor').value);
      scheduleMdFileAutosave();
    });
    document.getElementById('mdFileEditor').addEventListener('blur', () => void flushMdFileAutosave());

    document.getElementById('btnOpenGoogleWorkspace').addEventListener('click', async () => {
      const btn = document.getElementById('btnOpenGoogleWorkspace');
      const u = btn && btn.dataset && btn.dataset.url;
      const status = document.getElementById('status');
      if (!u || !window.tagBrowser.openGoogleWorkspaceWindow) return;
      const r = await window.tagBrowser.openGoogleWorkspaceWindow({ url: u });
      if (status) status.textContent = r.ok ? 'Opened in app window.' : (r.error || 'Open failed');
    });

    document.getElementById('btnSaveReadme').addEventListener('click', async () => {
      const status = document.getElementById('status');
      if (!activeReadmePath) return;
      const text = document.getElementById('readmeEditor').value;
      const r = await window.tagBrowser.writeTextFile({ fullPath: activeReadmePath, text });
      status.textContent = r.ok ? 'readme.md saved.' : (r.error || 'Save failed');
    });

    document.getElementById('btnCreateReadme').addEventListener('click', async () => {
      const status = document.getElementById('status');
      if (!selectedFullPath || !rowIsFolder(selectedRow)) return;
      const r = await window.tagBrowser.ensureReadme({ folderPath: selectedFullPath });
      if (!r.ok) {
        status.textContent = r.error || 'Could not create readme';
        return;
      }
      activeReadmePath = r.path;
      document.getElementById('btnCreateReadme').classList.add('d-none');
      document.getElementById('readmeEditor').value = '';
      document.getElementById('readmePreview').innerHTML = '';
      syncReadmePreviewChrome({ pulse: false });
      status.textContent = r.created ? 'readme.md created.' : 'readme.md ready.';
    });

    window.tagBrowser.setPathsMutatedHandler(() => void refreshAfterDiskMutation());
    window.tagBrowser.setShellActionErrorHandler((msg) => {
      document.getElementById('status').textContent = String(msg || 'Action failed');
    });

    /** Electron: webContents can stop receiving keys after button clicks until main focuses it again. */
    function pullWebContentsKeyboardFocus() {
      try {
        if (window.tagBrowser && typeof window.tagBrowser.focusWebContents === 'function') window.tagBrowser.focusWebContents();
      } catch (_) {}
    }

    /** Focus search input; select all text when true. Skips if a dialog is open. */
    function focusQueryBox(selectAll) {
      if (document.querySelector('.modal.show')) return;
      pullWebContentsKeyboardFocus();
      const q = document.getElementById('query');
      if (!q) return;
      q.focus();
      if (selectAll) q.select();
    }

    /** On load / window focus — query only. */
    function focusSearchBox() {
      focusQueryBox(false);
    }

    /** After programmatic list selection: move keyboard focus off stray buttons onto the results region. */
    function focusResultsWrapAfterListSelection() {
      if (document.querySelector('.modal.show')) return;
      pullWebContentsKeyboardFocus();
      const ae = document.activeElement;
      if (ae && ae.id === 'query') return;
      if (ae && isTypingTarget(ae)) return;
      document.getElementById('resultsWrap')?.focus({ preventScroll: true });
    }

    /** After toolbar/chrome control click: query if no rows, else results region (for ↑/↓ etc.). */
    function focusMainWorkingArea() {
      if (document.querySelector('.modal.show')) return;
      if (isTypingTarget(document.activeElement)) return;
      pullWebContentsKeyboardFocus();
      const rows = listRowsForUi();
      if (selectedFullPath && rows.length) document.getElementById('resultsWrap')?.focus({ preventScroll: true });
      else focusQueryBox(false);
    }

    /** True when focus is in a real text field (not checkbox/radio — those are never “typing” targets). */
    function isTypingTarget(el) {
      if (!el || el === document.body) return false;
      const t = (el.tagName || '').toUpperCase();
      if (t === 'TEXTAREA' || t === 'SELECT') return true;
      if (t === 'INPUT') {
        const ty = (el.type || '').toLowerCase();
        if (ty === 'checkbox' || ty === 'radio') return false;
        return true;
      }
      return !!el.isContentEditable;
    }

    /** App shortcuts run in #query too; still block in Settings / modals / multiline fields. (Ctrl+C/X/V keep isTypingTarget for native copy/paste in the box.) */
    function blockAppShortcutInTextField(el) {
      return isTypingTarget(el) && !(el && el.id === 'query');
    }

    /** Breadcrumb ▾ menus + fixed flyouts: skip global ↑/↓ table navigation (would re-render breadcrumb and kill focus). */
    function isBreadcrumbScopeFolderNavTarget(el) {
      if (!el || !el.closest) return false;
      if (el.closest('ul.breadcrumb-folder-flyout')) return true;
      if (el.closest('#breadcrumbBar .dropdown-menu')) return true;
      if (el.closest('#favFoldersBar .dropdown-menu')) return true;
      return false;
    }

    /** ↑/↓ starting row: active (highlighted) row if still listed, else bottom-most checked row — keeps arrows aligned with checkbox picks. */
    function navFocusIndexInFilteredRows(rows) {
      const normSel = selectedFullPath ? selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() : '';
      if (normSel) {
        const idx = rows.findIndex((r) => fullPathForRow(r).replace(/[/\\]+$/, '').toLowerCase() === normSel);
        if (idx >= 0) return idx;
      }
      let maxChk = -1;
      for (let i = 0; i < rows.length; i++) {
        if (isCheckedPath(fullPathForRow(rows[i]))) maxChk = i;
      }
      return maxChk;
    }

    function moveResultsSelection(delta) {
      resultsShiftRangeAnchorIdx = null;
      const rows = listRowsForUi();
      if (!rows.length) return;
      let idx = navFocusIndexInFilteredRows(rows);
      if (idx < 0) idx = delta > 0 ? 0 : rows.length - 1;
      else idx = Math.max(0, Math.min(rows.length - 1, idx + delta));
      const row = rows[idx];
      setSelection(row, fullPathForRow(row));
      requestAnimationFrame(() => {
        const tr = document.querySelector('#resultsTable tbody tr.table-active');
        if (tr) tr.scrollIntoView({ block: 'nearest' });
      });
    }

    /** Shift+↑/↓: check every visible row between anchor and new focus (inclusive). */
    function moveResultsSelectionWithShift(delta) {
      const rows = listRowsForUi();
      if (!rows.length) return;
      let curIdx = navFocusIndexInFilteredRows(rows);
      if (curIdx < 0) curIdx = delta > 0 ? 0 : rows.length - 1;
      if (
        resultsShiftRangeAnchorIdx == null ||
        resultsShiftRangeAnchorIdx < 0 ||
        resultsShiftRangeAnchorIdx >= rows.length
      ) {
        resultsShiftRangeAnchorIdx = curIdx;
      }
      const newIdx = Math.max(0, Math.min(rows.length - 1, curIdx + delta));
      const lo = Math.min(resultsShiftRangeAnchorIdx, newIdx);
      const hi = Math.max(resultsShiftRangeAnchorIdx, newIdx);
      for (let i = 0; i < rows.length; i++) {
        toggleCheckPath(fullPathForRow(rows[i]), i >= lo && i <= hi);
      }
      updateSelectAllCheckboxState();
      syncResultsRowCheckboxStates();
      const row = rows[newIdx];
      setSelection(row, fullPathForRow(row));
      requestAnimationFrame(() => {
        const tr = document.querySelector('#resultsTable tbody tr.table-active');
        if (tr) tr.scrollIntoView({ block: 'nearest' });
      });
    }

    /** Jump selection to first (false) or last (true) visible row. */
    function moveResultsSelectionToEdge(isEnd) {
      resultsShiftRangeAnchorIdx = null;
      const rows = listRowsForUi();
      if (!rows.length) return;
      const row = rows[isEnd ? rows.length - 1 : 0];
      setSelection(row, fullPathForRow(row));
      requestAnimationFrame(() => {
        const tr = document.querySelector('#resultsTable tbody tr.table-active');
        if (tr) tr.scrollIntoView({ block: 'nearest' });
      });
    }

    /* Type-ahead search: accumulates chars typed within 800ms, jumps to first matching row */
    let _typeAheadBuf = '';
    let _typeAheadTimer = null;
    function typeAheadJumpToRow(ch) {
      clearTimeout(_typeAheadTimer);
      _typeAheadBuf += ch.toLowerCase();
      _typeAheadTimer = setTimeout(() => { _typeAheadBuf = ''; }, 800);
      const rows = listRowsForUi();
      const match = rows.find(r => (r.name || '').toLowerCase().startsWith(_typeAheadBuf));
      if (match) {
        resultsShiftRangeAnchorIdx = null;
        setSelection(match, fullPathForRow(match));
        requestAnimationFrame(() => {
          const tr = document.querySelector('#resultsTable tbody tr.table-active');
          if (tr) tr.scrollIntoView({ block: 'nearest' });
        });
      }
    }

    /** True when scope has a parent path we can navigate to. */
    function canGoToParentScopeFolder() {
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return false;
      const norm = normalizeFolderPathForEverything(raw);
      const parRaw = T.parentDir(norm);
      const par = normalizeFolderPathForEverything(parRaw);
      if (!par) return false;
      return par.replace(/[/\\]+$/, '').toLowerCase() !== norm.replace(/[/\\]+$/, '').toLowerCase();
    }

    function syncStatusBarParentScopeButton() {
      const b = document.getElementById('btnStatusScopeParent');
      if (b) b.disabled = !canGoToParentScopeFolder();
    }

    /** Move scope folder to parent (toolbar scope / Settings field). */
    async function goToParentScopeFolder() {
      const status = document.getElementById('status');
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) {
        status.textContent = 'No scope folder set.';
        return;
      }
      const norm = normalizeFolderPathForEverything(raw);
      const parRaw = T.parentDir(norm);
      const par = normalizeFolderPathForEverything(parRaw);
      if (!par || par.replace(/[/\\]+$/, '').toLowerCase() === norm.replace(/[/\\]+$/, '').toLowerCase()) {
        status.textContent = 'Already at top of path.';
        return;
      }
      await applySearchScopeAndRefresh(par);
    }

    /** Enter: folder → scope; file → shell open, or Workspace window for .gdoc/.gsheet/.gslides. */
    async function keyboardActivateSelection() {
      if (!selectedFullPath) return;
      const row = selectedRowForActions();
      if (!row) return;
      const fp = fullPathForRow(row);
      const status = document.getElementById('status');
      if (rowIsFolder(row)) {
        const folderFp = normalizeFolderPathForEverything(fp);
        selectedRow = row;
        selectedFullPath = fp;
        await applySearchScopeAndRefresh(folderFp);
        return;
      }
      await openFileDefaultOrGoogleWorkspace(fp);
    }

    /** Ctrl+Enter / ← : scope to parent of selected row (row ▲). Uses selectedRow when the path isn’t in lastRows (synthetic scope row). */
    async function keyboardScopeParentOfSelection() {
      if (!selectedFullPath) return;
      const row = selectedRow || findRowByFullPath(selectedFullPath);
      const fp = row ? fullPathForRow(row) : selectedFullPath;
      const parentForScope = normalizeFolderPathForEverything(T.parentDir(fp));
      if (!parentForScope) return;
      await applySearchScopeAndRefresh(parentForScope);
    }

    /** t / Ctrl+T: tags for checked rows or current row. */
    function keyboardOpenTagsModal() {
      const bulk = getCheckedPathsArr();
      if (bulk.length > 1) openTagModalBulk(bulk);
      else if (bulk.length === 1) openTagModal(bulk[0]);
      else if (selectedFullPath) openTagModal(selectedFullPath);
    }

    function toggleKeyboardRowCheckbox() {
      if (!selectedFullPath) return;
      resultsShiftRangeAnchorIdx = null;
      const row = selectedRowForActions();
      if (!row) return;
      const fp = fullPathForRow(row);
      toggleCheckPath(fp, !isCheckedPath(fp));
      updateSelectAllCheckboxState();
      renderTable();
    }

    async function keyboardRecycleConfirm() {
      if (tagRenameBusy) return;
      const status = document.getElementById('status');
      let p = getCheckedPathsArr();
      if (!p.length && selectedFullPath) {
        const row = selectedRowForActions();
        if (row) p = [fullPathForRow(row)];
      }
      if (!p.length) return;
      if (!confirm(recycleBinConfirmMessage(p))) return;
      detachViewerEditorsForTrashedPaths(p);
      const r = await window.tagBrowser.trashPaths(p);
      if (!r || !r.ok) status.textContent = (r && r.error) || 'Delete failed';
      else {
        checkedPathsMap.clear();
        updateBulkBar();
        void refreshAfterDiskMutation();
      }
    }

    async function copyShortcutExplorerFiles() {
      const status = document.getElementById('status');
      let paths = getCheckedPathsArr();
      if (!paths.length && selectedFullPath) {
        const row = selectedRowForActions();
        if (row) paths = [fullPathForRow(row)];
      }
      if (!paths.length) return;
      const r = await window.tagBrowser.copyExplorerPaste(paths);
      if (!r || !r.ok) status.textContent = (r && r.error) || 'Copy for Explorer failed';
      else
        status.textContent =
          paths.length === 1
            ? 'Copied 1 item for Explorer paste (Ctrl+V in a folder).'
            : 'Copied ' + paths.length + ' items for Explorer paste.';
    }

    /** Ctrl+Shift+C / ⌘+Shift+C: plain-text full paths (same strings as ⋯ → Full path); multiple checked → newline-separated. */
    async function keyboardCopyFullPathsText() {
      const status = document.getElementById('status');
      let paths = getCheckedPathsArr();
      if (!paths.length && selectedFullPath) {
        const row = selectedRowForActions();
        if (row) paths = [fullPathForRow(row)];
      }
      if (!paths.length) return;
      const text = paths.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        status.textContent =
          paths.length === 1 ? 'Copied full path.' : 'Copied ' + paths.length + ' full paths.';
      } catch (_) {
        status.textContent = 'Could not copy paths.';
      }
    }

    async function cutShortcutExplorerFiles() {
      const status = document.getElementById('status');
      let paths = getCheckedPathsArr();
      if (!paths.length && selectedFullPath) {
        const row = selectedRowForActions();
        if (row) paths = [fullPathForRow(row)];
      }
      if (!paths.length) return;
      if (!window.tagBrowser.cutExplorerPaste) {
        status.textContent = 'Cut not available.';
        return;
      }
      const r = await window.tagBrowser.cutExplorerPaste(paths);
      if (!r || !r.ok) status.textContent = (r && r.error) || 'Cut for Explorer failed';
      else
        status.textContent =
          paths.length === 1
            ? 'Cut 1 item — paste in Explorer to move it.'
            : 'Cut ' + paths.length + ' items — paste in Explorer to move them.';
    }

    /** Ctrl+F: cycle Both → Files only → Folders only → Both. */
    function cycleFilesFoldersFilter() {
      const m = fileFolderFilterMode();
      if (m === 'both') setFileFolderFilterMode('files');
      else if (m === 'files') setFileFolderFilterMode('folders');
      else setFileFolderFilterMode('both');
      saveSettings();
      scheduleSearch();
      commitSearchHistoryNow();
    }

    async function pasteShortcutClipboardIntoScope() {
      const status = document.getElementById('status');
      const dest = currentScopeFolderPath();
      if (!dest) {
        status.textContent = 'Set a scope folder (Settings) to paste into.';
        return;
      }
      const rootPrefix = T.normalizeRootPrefix(document.getElementById('rootFolder').value);
      const r = await pasteClipboardIntoScopeWithConflictPrompt(dest, rootPrefix);
      if (!r || !r.ok) status.textContent = (r && r.error) || 'Paste failed';
      else void refreshAfterDiskMutation(); // + paths-mutated from main (defense in depth)
    }

    /* capture: true — run before focused <button> or other controls eat the key (Electron + Chromium). */
    window.addEventListener(
      'keydown',
      (e) => {
      if (e.defaultPrevented) return;

      if (e.key === 'Escape' && isPropsTheaterOn() && !document.querySelector('.modal.show')) {
        e.preventDefault();
        setPropsTheaterMode(false);
        return;
      }

      if (e.key === 'Escape' && !document.querySelector('.modal.show') && breadcrumbSubfolderFlyoutsAreOpen()) {
        e.preventDefault();
        hideBreadcrumbSubfolderFlyout();
        return;
      }

      const modC = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (modC && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault();
        focusQueryBox(true);
        return;
      }
      if (e.key === 'F1') {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const hm = document.getElementById('helpModal');
        if (hm) bootstrap.Modal.getOrCreateInstance(hm).show();
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        if (document.querySelector('.modal.show')) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        selectAllVisibleResultRows();
        return;
      }
      if (modC && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        if (document.querySelector('.modal.show')) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        void keyboardCopyFullPathsText();
        return;
      }
      if (modC && (e.key === 'c' || e.key === 'C')) {
        if (document.querySelector('.modal.show')) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        void copyShortcutExplorerFiles();
        return;
      }
      if (modC && (e.key === 'x' || e.key === 'X')) {
        if (document.querySelector('.modal.show')) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        void cutShortcutExplorerFiles();
        return;
      }
      if (modC && (e.key === 'v' || e.key === 'V')) {
        if (document.querySelector('.modal.show')) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        void pasteShortcutClipboardIntoScope();
        return;
      }
      if (modC && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void createNewFolderInScopeInteractive();
        return;
      }
      if (modC && e.key === 'ArrowUp') {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void goToParentScopeFolder();
        return;
      }
      if (modC && (e.key === 'r' || e.key === 'R')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void runSearchNow();
        return;
      }
      if (modC && (e.key === 'f' || e.key === 'F')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        // Key repeat would cycle Folders ↔ Files and skip the "both off" (files+folders) step.
        if (e.repeat) return;
        cycleFilesFoldersFilter();
        return;
      }
      if (modC && (e.key === 'l' || e.key === 'L')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const hb = document.getElementById('btnScopeFolderHistory');
        if (!hb) return;
        bootstrap.Dropdown.getOrCreateInstance(hb).show();
        return;
      }
      if (modC && (e.key === 't' || e.key === 'T')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        keyboardOpenTagsModal();
        return;
      }
      if (modC && (e.key === 'h' || e.key === 'H')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        openBulkRenameModal();
        return;
      }
      if (modC && e.key === 'Enter' && !e.shiftKey) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void keyboardScopeParentOfSelection();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowUp') {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void goToParentScopeFolder();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowLeft') {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void goSearchHistory(-1);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowRight') {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void goSearchHistory(1);
        return;
      }
      if (modC && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        const list = loadFavouriteSearches();
        const idx = e.key.charCodeAt(0) - 49;
        if (!list[idx]) return;
        e.preventDefault();
        void applyFavouriteSearchState(list[idx]);
        return;
      }

      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === ' ' || e.code === 'Space')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        togglePropsTheaterMode();
        return;
      }

      /* Plain / must run before the Ctrl/Meta/Alt bail-out: AltGr (many layouts) sets ctrl+alt and would block it. Ctrl+/ is handled above. */
      const isSlashFocusSearch =
        e.key === '/' || e.code === 'NumpadDivide' || (e.code === 'Slash' && !e.shiftKey);
      if (isSlashFocusSearch) {
        if (document.querySelector('.modal.show')) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        focusQueryBox(true);
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal.show')) return;

      if (e.key === 'F5') {
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void runSearchNow();
        return;
      }
      if (e.key === 'F2') {
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void renameItemInteractive();
        return;
      }

      if (isTypingTarget(e.target)) return;
      if (isBreadcrumbScopeFolderNavTarget(e.target)) {
        const kk = e.key;
        if (
          kk === 'ArrowDown' ||
          kk === 'ArrowUp' ||
          kk === 'Enter' ||
          kk === 'Home' ||
          kk === 'End' ||
          kk === 'Backspace' ||
          kk === ' ' ||
          e.code === 'Space'
        ) {
          return;
        }
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        void goToParentScopeFolder();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        void keyboardActivateSelection();
        return;
      }

      if ((e.key === ' ' || e.code === 'Space') && !e.shiftKey) {
        /* Let Bootstrap btn-check toggles + header “select all” use native Space. */
        const sp = e.target;
        if (sp && sp.matches && sp.matches('input.btn-check')) return;
        if (sp && sp.id === 'chkSelectAllResults') return;
        e.preventDefault();
        toggleKeyboardRowCheckbox();
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        moveResultsSelectionToEdge(false);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        moveResultsSelectionToEdge(true);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.shiftKey) moveResultsSelectionWithShift(1);
        else moveResultsSelection(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.shiftKey) moveResultsSelectionWithShift(-1);
        else moveResultsSelection(-1);
        return;
      }

      /* → on a folder row: scope into that folder; ← : parent of highlighted row (same as row ▲) */
      if (e.key === 'ArrowRight') {
        if (!selectedFullPath) return;
        const row = selectedRowForActions();
        if (row && rowIsFolder(row)) {
          e.preventDefault();
          void applySearchScopeAndRefresh(normalizeFolderPathForEverything(fullPathForRow(row)));
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (selectedFullPath) void keyboardScopeParentOfSelection();
        else void goToParentScopeFolder();
        return;
      }

      /* Type-ahead: printable single chars jump to first matching row by name */
      if (e.key.length === 1 && !e.shiftKey) {
        e.preventDefault();
        typeAheadJumpToRow(e.key);
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        void keyboardRecycleConfirm();
      }
    },
      true
    );

    /* Bootstrap 5.x: hide only tooltips on the dragged row/chip (global scan is slow and can upset DnD). */
    document.addEventListener(
      'dragstart',
      (e) => {
        const root =
          e.target.closest?.('#resultsTable tbody tr') || e.target.closest?.('.shelf-chip');
        if (!root) return;
        root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
          const tip = bootstrap.Tooltip.getInstance(el);
          if (tip) tip.hide();
        });
      },
      true
    );

    document.addEventListener(
      'dragend',
      () => {
        document.querySelectorAll('#resultsTable tbody tr.results-drag-over').forEach((tr) =>
          tr.classList.remove('results-drag-over')
        );
        document.getElementById('resultsWrap')?.classList.remove('results-scope-drop-over');
        document.querySelectorAll('#breadcrumbBar [data-drop-path].results-drag-over').forEach((n) =>
          n.classList.remove('results-drag-over')
        );
        document.getElementById('appShelf')?.classList.remove('shelf-aside-drag-over');
        /* Defer clearing native paths: sync clear on dragend ran before dragover/drop (capture listener) and blocked drops. */
        const pathsRef = tagBrowserActiveNativeDragPaths;
        setTimeout(() => {
          if (tagBrowserActiveNativeDragPaths === pathsRef) tagBrowserActiveNativeDragPaths = null;
        }, 400);
      },
      true
    );

    loadSettings();
    window.addEventListener('beforeunload', () => {
      if (tagPrefsDiskTimer) {
        clearTimeout(tagPrefsDiskTimer);
        tagPrefsDiskTimer = null;
      }
      if (window.tagBrowser && typeof window.tagBrowser.tagPrefsWriteSync === 'function') {
        try {
          window.tagBrowser.tagPrefsWriteSync(tagPrefsSnapshotForDisk());
        } catch (_) {}
      }
    });
    {
      const rf = document.getElementById('rootFolder').value.trim();
      if (rf) rememberScopeFolderHistory(normalizeFolderPathForEverything(rf));
    }
    seedSearchHistoryFromCurrent();
    document.getElementById('btnScopeFolderHistory').addEventListener('show.bs.dropdown', () => renderScopeFolderHistoryMenu());
    document.getElementById('btnSearchHistBack').addEventListener('click', () => void goSearchHistory(-1));
    document.getElementById('btnSearchHistFwd').addEventListener('click', () => void goSearchHistory(1));
    renderScopeBreadcrumb();
    bindResultsTableDragDrop();
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!breadcrumbSubfolderFlyoutsAreOpen()) return;
        const t = e.target;
        if (
          t &&
          t.closest &&
          (t.closest('ul.breadcrumb-folder-flyout') ||
            t.closest('#breadcrumbBar .dropdown-menu') ||
            t.closest('#favFoldersBar .dropdown-menu'))
        )
          return;
        hideBreadcrumbSubfolderFlyout();
      },
      true
    );

    /** After any control click, move DOM + OS focus back to query or results (skip while menu/dialog/flyout open). */
    function scheduleRestoreFocusAfterControlClick() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (document.querySelector('.modal.show')) return;
          if (document.querySelector('.dropdown-menu.show')) return;
          if (document.activeElement?.closest?.('ul.breadcrumb-folder-flyout.is-open')) return;
          if (isTypingTarget(document.activeElement)) return;
          focusMainWorkingArea();
        });
      });
    }
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('.modal')) return;
      if (t.closest('#propsAside')) return;
      if (t.closest('#mdFileEditor') || t.closest('#propsAside textarea')) return;
      if (t.closest('#query, label[for="query"]')) return;
      if (t.closest('#newMdTitleInput')) return;
      if (t.closest('#settingsPanel input, #settingsPanel textarea, #settingsPanel select')) return;
      if (!t.closest('button, [role="button"], input.btn-check, a.btn, label.btn')) return;
      scheduleRestoreFocusAfterControlClick();
    });
    const HELP_TAB_IDS = ['shortcuts', 'overview', 'getting-started'];
    function restoreHelpModalTab() {
      const raw = localStorage.getItem(LS.helpModalTab);
      const id = HELP_TAB_IDS.includes(raw) ? raw : 'shortcuts';
      const btn = document.getElementById('help-tab-' + id);
      if (btn) bootstrap.Tab.getOrCreateInstance(btn).show();
    }
    const helpModalTabs = document.getElementById('helpModalTabs');
    if (helpModalTabs) {
      helpModalTabs.addEventListener('shown.bs.tab', (ev) => {
        const t = ev.target && ev.target.getAttribute('data-help-tab');
        if (t && HELP_TAB_IDS.includes(t)) localStorage.setItem(LS.helpModalTab, t);
      });
    }
    // Any Bootstrap modal: clear breadcrumb ▾ + chained flyouts so nothing sits above the dimmer.
    document.querySelectorAll('.modal').forEach((modalEl) => {
      modalEl.addEventListener('show.bs.modal', () => {
        tagfoxHideAllBootstrapTooltips();
        hideBreadcrumbSubfolderFlyout();
        document
          .querySelectorAll('#breadcrumbBar [data-bs-toggle="dropdown"], #favFoldersBar [data-bs-toggle="dropdown"]')
          .forEach((btn) => {
            const inst = bootstrap.Dropdown.getInstance(btn);
            if (inst) inst.hide();
          });
        if (modalEl.id === 'helpModal') restoreHelpModalTab();
      });
    });
    installTagFoxTooltipGuardsOnce();
    bindBreadcrumbBarDragDrop();
    bindShelfDrop();
    document.getElementById('btnShelfOpen').addEventListener('click', async () => {
      const st = await window.tagBrowser.shelfState();
      if (st.ok) void window.tagBrowser.openPath(st.path);
      else document.getElementById('status').textContent = st.error || 'Shelf unavailable';
    });
    document.getElementById('btnShelfOsDrag').addEventListener('click', () => {
      tagBrowserNextOsFileDrag = true;
      document.getElementById('status').textContent =
        'Next row or Shelf-chip drag: OS files (Explorer). Drag without this stays in-app.';
    });
    document.getElementById('btnShelfClear').addEventListener('click', async () => {
      if (!confirm('Remove everything from Shelf?')) return;
      const r = await window.tagBrowser.clearShelf();
      document.getElementById('status').textContent = r.ok ? 'Shelf cleared.' : (r.error || 'Clear failed');
      // On success, main sends paths-mutated → refreshAfterDiskMutation (shelf strip + search retries).
    });
    loadPaneWidthsFromStorage();
    loadColWidthsFromStorage();
    loadColVisibilityFromStorage();
    bindVerticalSplitters();
    document.getElementById('propsTheaterBackdrop').addEventListener('click', () => setPropsTheaterMode(false));
    document.getElementById('btnPropsTheaterToggle').addEventListener('click', () => togglePropsTheaterMode());
    updateSortHeaders();
    renderFavFoldersBar();
    renderFavSearchesBar();
    renderTagBar();
    renderTable();
    scheduleSearch();
    void renderShelf().then(() => refreshTagFoxChromeTooltips(document.body));
    requestAnimationFrame(() => requestAnimationFrame(focusSearchBox));
    window.addEventListener('focus', () => requestAnimationFrame(focusSearchBox));
