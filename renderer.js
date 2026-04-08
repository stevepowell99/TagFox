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
      optDiacritics: 'tagBrowserOptDiac',
      optHideSpecial: 'tagBrowserOptHideSpecial',
      optHideTilde: 'tagBrowserOptHideTilde',
      sortBy: 'tagBrowserSortBy',
      optAsc: 'tagBrowserOptAsc',
      treeView: 'tagBrowserTreeView',
      resultsViewMode: 'tagBrowserResultsViewMode',
      foldersOnly: 'tagBrowserFoldersOnly',
      filesOnly: 'tagBrowserFilesOnly',
      flatView: 'tagBrowserFlatView',
      showSubfolders: 'tagBrowserShowSubfolders',
      hideFiles: 'tagBrowserHideFiles',
      propsWidthPx: 'tagBrowserPropsW',
      tableCols: 'tagBrowserTableCols',
      favFolders: 'tagBrowserFavFolders',
      favSearches: 'tagBrowserFavSearches',
      scopeFolderHistory: 'tagBrowserScopeFolderHist',
      searchScopeCeilings: 'tagBrowserSearchScopeCeilings',
      searchScopeMax: 'tagBrowserSearchScopeMax',
      scopeRootsTipDismissed: 'tagBrowserScopeRootsTipDismissed',
      tagStore: 'tagBrowserTagStore',
      knownBracketTags: 'tagBrowserKnownBracketTags',
      activeTagFilter: 'tagBrowserActiveTag',
      tagFilterCombineOr: 'tagBrowserTagCombineOr',
      recencyFilter: 'tagBrowserRecencyFilter',
      searchDebug: 'tagBrowserSearchDebug',
      helpModalTab: 'tagBrowserHelpModalTab',
      autoRefreshSec: 'tagBrowserAutoRefreshSec',
      darkMode: 'tagBrowserDarkMode',
      treeFolding: 'tagBrowserTreeFolding',
      treeGroupHighlight: 'tagBrowserTreeGroupHL',
      collapsedFolders: 'tagBrowserCollapsedFolders',
      resultsLayout: 'tagBrowserResultsLayout',
      resultsContent: 'tagBrowserResultsContent',
      gdriveShortcutNames: 'tagBrowserGDriveShortcutNames',
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
        ['tagBrowserOptDiac', 'everythangOptDiac'],
        ['tagBrowserSortBy', 'everythangSortBy'],
        ['tagBrowserOptAsc', 'everythangOptAsc'],
        ['tagBrowserFoldersOnly', 'everythangFoldersOnly'],
        ['tagBrowserFilesOnly', 'everythangFilesOnly'],
        ['tagBrowserPropsW', 'everythangPropsW'],
        ['tagBrowserTableCols', 'everythangTableCols'],
        ['tagBrowserFavFolders', 'everythangFavFolders'],
        ['tagBrowserTagStore', 'everythangTagStore'],
        ['tagBrowserActiveTag', 'everythangActiveTag'],
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
    /** Percent weights: chk, name, path, size, modified, actions (sum 100). Type column removed — 6 cols. */
    const COL_PERCENT_DEFAULT = [4, 34, 22, 8, 14, 18];
    /** Drag resize: last boundary = Modified | Actions — don’t shrink Actions below this (% of table). */
    const COL_RESIZE_MIN_ACTIONS_PCT = 11;
    /** Table column index for Path (hidden in tree view). */
    const RESULTS_PATH_COL_IDX = 2;
    let colPercent = COL_PERCENT_DEFAULT.slice();

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
    /** Incremented at each runSearch start; in-flight HTTP from an older id must not touch UI (overlapping debounced runs). */
    let searchRunSeq = 0;
    /** True while runSearch() awaits Everything (auto-refresh skips ticks to avoid overlap). */
    let searchInFlight = false;
    /** True while loadMoreResults() is fetching the next Everything page. */
    let resultsLoadMoreBusy = false;
    /** Offset paging: replay same query with higher Everything offset (null = no further pages for current search). */
    let resultsPagingCtx = null;
    /** Smart view event kind for the current search: identity|refresh|manual|smart-narrow|smart-probe|null. */
    let smartEvent = null;
    /** Before a Smart probe-widen: saved {subs, content} to revert if cap exceeded. */
    let smartProbePrior = null;
    /** After Smart revert — blocks repeated expand probe until query/offset/hasMore state changes. */
    let smartRevertFP = null;
    /** Smart: last #rootFolder + scope max — detect navigation for probe-widen on plain browse. */
    let lastSmartBrowseScopeKey = null;
    let resultsScrollMoreTimer = null;
    let autoRefreshTimerId = null;
    /** Set only around timer-driven runSearch — avoid RHS viewer tear-down when results are just re-fetched. */
    let suppressViewerResyncForTimerSearch = false;
    /** Recent search UI state (query, scope, tag, toggles, sort) for Alt+← / Alt+→ and toolbar buttons. */
    const SEARCH_HIST_MAX = 50;
    const SEARCH_HIST_DEBOUNCE_MS = 450;
    let searchHist = [];
    let searchHistIdx = 0;
    let searchHistDebounceTimer = null;
    let searchHistNavigating = false;
    /** Favourites strip mid-drag: 'folder' | 'search' | null — HTML5 reorder only within the same bar. */
    let favListDragKind = null;
    /** When empty-results hints restart (query / tag / recursive changed while still empty). */
    let pulseHintFingerprint = '';
    /** Heavy preview = big read / CPU (see isHeavyBinaryPreview). Light = folder readme, md, text, … */
    const PROPS_PREVIEW_DEBOUNCE_HEAVY_MS = 520;
    const PROPS_PREVIEW_DEBOUNCE_LIGHT_MS = 90;
    let propsPreviewDebounceTimer = null;

    /** Lazy Everything counts for folder rows: recursive total under folder, exact 0–100 or >100 (N+1 fetch). */
    const FOLDER_CHILD_COUNT_MAX = 100;
    let folderChildCountRunSeq = 0;
    /** Key: folderChildCountCacheKey; value: { kind: 'exact', n } | { kind: 'over', cap }. */
    const folderChildCountCache = new Map();

    const SORT_LABELS = { name: 'Name', path: 'Path', size: 'Size', date_modified: 'Modified' };

    /* View: Tree | Smart | Flat; Subfolders; Content: folders | all | files. */
    function isFlatView() { return !!document.getElementById('optRvFlat')?.checked; }
    function isSmartView() { return !!document.getElementById('optRvSmart')?.checked; }
    function isShowSubfolders() { return !!document.getElementById('optRvSubsOn')?.checked; }
    /** @returns {'tree'|'smart'|'flat'} */
    function resultsLayoutFromUi() {
      if (isFlatView()) return 'flat';
      if (isSmartView()) return 'smart';
      return 'tree';
    }
    /** @returns {'all'|'folders'|'files'} */
    function resultsContentMode() {
      if (document.getElementById('optRvDirsOnly')?.checked) return 'folders';
      if (document.getElementById('optRvFilesOnly')?.checked) return 'files';
      return 'all';
    }
    function isFoldersOnly() { return resultsContentMode() === 'folders'; }
    function isFilesOnly() { return resultsContentMode() === 'files'; }
    function isAllContent() { return resultsContentMode() === 'all'; }

    /** Fingerprint for Smart revert gate (load more / query change clears stale revert lock). */
    function smartOutcomeFingerprint() {
      const ctx = resultsPagingCtx;
      return [
        document.getElementById('query')?.value ?? '',
        document.getElementById('rootFolder')?.value ?? '',
        document.getElementById('maxResults')?.value ?? '',
        ctx && ctx.mode === 'single' ? String(ctx.singleOffset) : '0',
        ctx && ctx.hasMore ? '1' : '0',
        isShowSubfolders() ? '1' : '0',
        resultsContentMode(),
        resultsLayoutFromUi(),
      ].join('\0');
    }

    /**
     * Smart “real search” vs plain empty browse: broad start + probe-widen only when query, tag filter, or recency window.
     * Advanced toggles alone (hide special, case, …) must not force full view / skip prefetch on browse — thousands of hits.
     */
    function smartSearchShouldStartBroad() {
      const q = (document.getElementById('query')?.value || '').trim();
      if (q) return true;
      if (activeTagKeys.size) return true;
      if (recencyFilterMode() !== 'all') return true;
      return false;
    }

    /** Stable key for “same browse scope” (folder + settings ceiling). */
    function smartBrowseScopeKeyFromInputs(rootFolderRaw) {
      const root = normalizeFolderPathForEverything(
        String(rootFolderRaw ?? document.getElementById('rootFolder')?.value ?? '').trim()
      );
      const max = getSearchScopeMaxFolderNorm() || '';
      return pathNormKey(root) + '\0' + pathNormKey(max);
    }

    /** Apply view + content radios only (no save/search). */
    function applyResultsViewRadiosToDom(layout, showSubs, content) {
      const t = layout === 'flat' ? 'flat' : layout === 'smart' ? 'smart' : 'tree';
      document.getElementById('optRvTree').checked = t === 'tree';
      document.getElementById('optRvSmart').checked = t === 'smart';
      document.getElementById('optRvFlat').checked = t === 'flat';
      document.getElementById('optRvSubsOn').checked = !!showSubs;
      document.getElementById('optRvSubsOff').checked = !showSubs;
      const c = content === 'folders' ? 'folders' : content === 'files' ? 'files' : 'all';
      document.getElementById('optRvDirsOnly').checked = c === 'folders';
      document.getElementById('optRvAll').checked = c === 'all';
      document.getElementById('optRvFilesOnly').checked = c === 'files';
    }

    /** Restore / migrate: layout tree|smart|flat, content all|folders|files; no save, no search. */
    function setResultsViewRadios(layout, showSubs, content) {
      applyResultsViewRadiosToDom(layout, showSubs, content);
      syncViewRadioActiveFromDom();
    }

    /** Advanced: drop dot/$/desktop.ini paths from the table only (~ has its own toggle). */
    function isHideSpecialPaths() {
      return !!document.getElementById('optHideSpecial')?.checked;
    }

    /** Advanced: drop paths with a ~ segment (client-side; table only). */
    function isHideTildePaths() {
      return !!document.getElementById('optHideTilde')?.checked;
    }

    /** Path column hidden + tree gutter when Tree or Smart (not Flat). */
    function isTreeViewOn() { return !isFlatView(); }

    /** Tree layout follows path order — keep Everything sort Path A→Z whenever tree is on (any entry path). */
    function applyNaturalSortWhenTreeViewOn() {
      if (!isTreeViewOn()) return;
      sortColumn = 'path';
      sortAsc = true;
      localStorage.setItem(LS.sortBy, sortColumn);
      localStorage.setItem(LS.optAsc, '1');
    }

    function isTreeFoldingOn() { return !!document.getElementById('optTreeFolding')?.checked; }
    /** +/- twisties only when this result set is complete (no Load more pending). */
    function isTreeFoldUiActive() {
      return isTreeFoldingOn() && isShowSubfolders() && !(resultsPagingCtx && resultsPagingCtx.hasMore);
    }
    function isTreeGroupHLOn() { return !!document.getElementById('optTreeGroupHL')?.checked; }

    /** @type {Set<string>} lowercase keys; tag bar filters with AND (click toggles each). */
    let activeTagKeys = new Set();
    /** Multiple tag filters: false = AND (default), true = OR (Everything regex + client filter). */
    let tagFilterCombineOr = false;
    /** Tag modal targets (length 1 = single-name edit, &gt;1 = union add/remove on each). */
    let modalTargetPaths = [];
    let modalTags = [];
    /** 'rename' = existing paths; 'newTodo' = Add TODO box only (no rename until create). */
    let tagModalMode = 'rename';
    /** Bracket tags for the next Add TODO .md (default TODO); edited via same #tagModal as renames. */
    let newTodoMdTags = ['TODO'];
    /** Multi-select checkboxes: path key lowercase → canonical path */
    const checkedPathsMap = new Map();
    /** Persisted set of folder paths the user has collapsed in tree view. */
    const collapsedFolderPaths = new Set();
    /** Invalidates in-flight j/k follow-up scroll when another sibling nav runs. */
    let siblingNavScrollToken = 0;
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
    /** After folder readme RHS is shown — same as `pathKeyLoose(folder)` so quick refresh does not hide readme / “Loading…”. */
    let lastReadmeFolderPathLoose = '';
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
      if (VIDEO_EXT_MIME[ext] || AUDIO_EXT_MIME[ext]) return true;
      if (ext === 'odt' || ext === 'ods' || ext === 'odp') return true;
      return false;
    }

    /** Video types Chromium can play natively. */
    const VIDEO_EXT_MIME = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogv: 'video/ogg',
      mov: 'video/quicktime',
    };

    /** Audio types Chromium can play natively. */
    const AUDIO_EXT_MIME = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      weba: 'audio/webm',
    };

    /** Convert local absolute path to file:// URL (avoids reading large media into memory). */
    function localPathToFileUrl(fp) {
      let u = String(fp || '').replace(/\\/g, '/');
      if (!/^\//.test(u)) u = '/' + u;
      return encodeURI('file://' + u).replace(/#/g, '%23');
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

    /** .lnk target: set scope to that folder, or to parent folder and select the file (Everything list). */
    async function navigateTagFoxToShortcutTarget(targetPathRaw, isDirectory) {
      const status = document.getElementById('status');
      let t = String(targetPathRaw || '').trim();
      if (!t) {
        if (status) status.textContent = 'Shortcut target is empty.';
        return;
      }
      t = t.replace(/\//g, '\\');
      if (isDirectory) {
        const folderFp = normalizeFolderPathForEverything(t);
        selectedRow = null;
        selectedFullPath = folderFp;
        await applySearchScopeAndRefresh(folderFp);
        return;
      }
      const parent = normalizeFolderPathForEverything(T.parentDir(t));
      if (!parent) {
        if (status) status.textContent = 'Could not resolve parent folder for shortcut target.';
        return;
      }
      selectedRow = null;
      selectedFullPath = t;
      await applySearchScopeAndRefresh(parent);
    }

    /** Resolve .lnk in main; navigate inside TagFox, else shell-open the shortcut. */
    async function followShellShortcutInTagFox(lnkFullPath) {
      const status = document.getElementById('status');
      if (!window.tagBrowser.resolveShellShortcut) {
        const err = await window.tagBrowser.openPath(lnkFullPath);
        if (err && status) status.textContent = 'Open failed: ' + err;
        return;
      }
      const r = await window.tagBrowser.resolveShellShortcut({ fullPath: lnkFullPath });
      if (!r || !r.ok) {
        if (status) status.textContent = (r && r.error) || 'Could not read shortcut.';
        const err = await window.tagBrowser.openPath(lnkFullPath);
        if (err && status) status.textContent = 'Open failed: ' + err;
        return;
      }
      await navigateTagFoxToShortcutTarget(r.targetPath, r.isDirectory);
    }

    /** File row: shell open, or Workspace child window for .gdoc / .gsheet / .gslides (same as Viewer button). */
    async function openFileDefaultOrGoogleWorkspace(fp) {
      const status = document.getElementById('status');
      const base = T.baseName(fp);
      const dot = base.lastIndexOf('.');
      const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
      if (ext === 'lnk') {
        await followShellShortcutInTagFox(fp);
        return;
      }
      if (GOOGLE_SHORTCUT_EXT.has(ext) && window.tagBrowser.googleWorkspaceShortcutUrl && window.tagBrowser.openGoogleWorkspaceWindow) {
        const rGw = await window.tagBrowser.googleWorkspaceShortcutUrl({ fullPath: fp });
        if (!rGw.ok) {
          if (rGw.code === 'ENOENT') {
            if (status) status.textContent = 'File not found.';
            return;
          }
          const shellErr = await window.tagBrowser.openPath(fp);
          if (status) {
            if (shellErr) status.textContent = 'Could not open file.';
            else status.textContent = '';
          }
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

    /** CSV → rows (RFC 4180-style: commas, quoted fields, "" → "). Newlines inside quotes supported. */
    function parseCsvRows(raw) {
      const text = String(raw ?? '').replace(/^\uFEFF/, '');
      if (!text.length) return [];
      const rows = [];
      let row = [];
      let field = '';
      let i = 0;
      let inQ = false;
      while (i < text.length) {
        const c = text[i];
        if (inQ) {
          if (c === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
              continue;
            }
            inQ = false;
            i++;
            continue;
          }
          field += c;
          i++;
          continue;
        }
        if (c === '"') {
          inQ = true;
          i++;
          continue;
        }
        if (c === ',') {
          row.push(field);
          field = '';
          i++;
          continue;
        }
        if (c === '\r') {
          i++;
          if (text[i] === '\n') i++;
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
          continue;
        }
        if (c === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
          i++;
          continue;
        }
        field += c;
        i++;
      }
      row.push(field);
      rows.push(row);
      return rows;
    }

    /** Bootstrap table for Viewer CSV preview (first row thead when 2+ rows). */
    function csvPreviewTableHtml(rows, maxRows) {
      if (!rows.length) return '<p class="text-muted mb-0">(empty)</p>';
      const cap = maxRows > 0 ? maxRows : rows.length;
      const capped = rows.length > cap ? rows.slice(0, cap) : rows;
      const total = rows.length;
      const nCols = Math.max.apply(
        null,
        capped.map((r) => r.length)
      );
      function pad(r) {
        const out = r.slice();
        while (out.length < nCols) out.push('');
        return out;
      }
      let html =
        '<div class="table-responsive"><table class="table table-sm table-bordered table-striped mb-0 align-middle">';
      if (capped.length === 1) {
        html += '<tbody><tr>';
        for (const cell of pad(capped[0])) html += '<td>' + escapeHtmlForPreview(cell) + '</td>';
        html += '</tr></tbody>';
      } else {
        html += '<thead class="table-light"><tr>';
        for (const cell of pad(capped[0])) html += '<th scope="col">' + escapeHtmlForPreview(cell) + '</th>';
        html += '</tr></thead><tbody>';
        for (let r = 1; r < capped.length; r++) {
          html += '<tr>';
          for (const cell of pad(capped[r])) html += '<td>' + escapeHtmlForPreview(cell) + '</td>';
          html += '</tr>';
        }
        html += '</tbody>';
      }
      html += '</table></div>';
      if (maxRows > 0 && total > maxRows) {
        html +=
          '<p class="text-muted small mb-0 mt-2">Preview: first ' +
          maxRows +
          ' rows only (' +
          total +
          ' rows).</p>';
      }
      return html;
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
      const vidEl = document.getElementById('propVideoPreview');
      if (vidEl) { vidEl.pause(); vidEl.removeAttribute('src'); vidEl.load(); }
      const audEl = document.getElementById('propAudioPreview');
      if (audEl) { audEl.pause(); audEl.removeAttribute('src'); audEl.load(); }
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

    /** Coloured pill + FA xmark to remove tag from this path (stops row click propagation). */
    function appendTagPillWithRemove(parent, tag, fullPath) {
      const pill = document.createElement('span');
      pill.className = 'badge d-inline-flex align-items-center gap-0';
      pill.style.backgroundColor = tagColorCss(tag);
      pill.style.color = '#212529';
      const lbl = document.createElement('span');
      lbl.textContent = tag;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'btn btn-sm tag-pill-x ms-1 border-0 align-baseline p-0 d-inline-flex align-items-center justify-content-center';
      x.style.background = 'transparent';
      x.style.color = '#212529';
      x.style.opacity = '0.8';
      x.innerHTML = '<i class="fa-solid fa-xmark" style="font-size:0.65rem;line-height:1" aria-hidden="true"></i>';
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

    /** Block obvious bad paths before IPC (OS-specific wildcards only when path looks Windows-style). */
    function scopePathClientSyntaxError(rawTrimmed) {
      const s = String(rawTrimmed || '').trim();
      if (!s) return '';
      if (/[\x00-\x1f]/.test(s)) return 'Path contains control characters.';
      if (/["<>|]/.test(s)) return 'Path contains invalid characters.';
      const looksWin = /^[a-zA-Z]:[\\/]/i.test(s) || s.startsWith('\\\\') || s.includes('\\');
      if (looksWin && /[*?]/.test(s)) return 'Wildcards are not allowed in a folder path.';
      return '';
    }

    /** Settings: one optional “universe” root for Everything + breadcrumb top; combined with current-folder (AND). */
    let searchScopeMaxFolder = '';

    function normalizeSearchScopeMaxPath(p) {
      return normalizeFolderPathForEverything(String(p || '').trim()).replace(/[/\\]+$/, '');
    }

    function getSearchScopeMaxFolderNorm() {
      return normalizeSearchScopeMaxPath(searchScopeMaxFolder);
    }

    /** True if absNorm is the ceiling or a subdirectory (same drive / mixed slashes tolerated). */
    function pathIsUnderOrEqualFolder(absNorm, ceilingNorm) {
      const a = pathNormKey(absNorm);
      const c = pathNormKey(ceilingNorm);
      if (!c) return true;
      if (!a) return false;
      if (a === c) return true;
      return a.startsWith(c + '\\') || a.startsWith(c + '/');
    }

    /** Clamp an absolute folder to stay at or under the scope max (returns normalized path). */
    function clampFolderPathToSearchMax(absPath) {
      const max = getSearchScopeMaxFolderNorm();
      const n = normalizeSearchScopeMaxPath(absPath);
      if (!max) return n;
      if (!n) return max;
      if (pathIsUnderOrEqualFolder(n, max)) return n;
      return max;
    }

    function clampRootFolderUnderSearchScopeMax() {
      const max = getSearchScopeMaxFolderNorm();
      if (!max) return;
      const inp = document.getElementById('rootFolder');
      if (!inp) return;
      const raw = inp.value.trim();
      if (!raw) return;
      const fixed = clampFolderPathToSearchMax(raw);
      if (pathNormKey(fixed) !== pathNormKey(raw)) inp.value = fixed;
    }

    /** @returns {string[]} 0 or 1 path for combineFolderScopeGroup (Everything ceiling). */
    function getSearchScopeCeilingFoldersNorms() {
      const m = getSearchScopeMaxFolderNorm();
      return m ? [m] : [];
    }

    function setSearchScopeMaxFolderFromString(s) {
      searchScopeMaxFolder = normalizeSearchScopeMaxPath(s);
    }

    /** Migrate legacy JSON array key → single string; then drop legacy. */
    function loadSearchScopeMaxFromStorage() {
      searchScopeMaxFolder = '';
      try {
        const single = localStorage.getItem(LS.searchScopeMax);
        if (single != null && String(single).trim()) {
          searchScopeMaxFolder = normalizeSearchScopeMaxPath(single);
          return;
        }
        const raw = localStorage.getItem(LS.searchScopeCeilings);
        if (!raw) return;
        const a = JSON.parse(raw);
        if (!Array.isArray(a) || !a.length) return;
        const first = normalizeSearchScopeMaxPath(a[0]);
        if (first) {
          searchScopeMaxFolder = first;
          localStorage.setItem(LS.searchScopeMax, first);
        }
        localStorage.removeItem(LS.searchScopeCeilings);
      } catch (_) {
        searchScopeMaxFolder = '';
      }
    }

    function persistSearchScopeMax() {
      const n = getSearchScopeMaxFolderNorm();
      if (!n) {
        localStorage.removeItem(LS.searchScopeMax);
        return;
      }
      localStorage.setItem(LS.searchScopeMax, n);
    }

    function syncSearchScopeRootsTipVisibility() {
      const el = document.getElementById('searchScopeRootsTip');
      if (!el) return;
      const dismissed = localStorage.getItem(LS.scopeRootsTipDismissed) === '1';
      const has = !!getSearchScopeMaxFolderNorm();
      el.classList.toggle('d-none', dismissed || has);
    }

    function renderSearchScopeMaxUi() {
      const box = document.getElementById('searchScopeMaxDisplay');
      if (!box) return;
      const n = getSearchScopeMaxFolderNorm();
      box.className =
        'small border rounded px-2 py-2 bg-body font-monospace text-break' + (n ? '' : ' text-muted');
      box.textContent = n || 'No scope folder — entire index (subject to current folder).';
    }

    /** Validate path via IPC; replace scope max; clamp breadcrumb + search. */
    async function setSearchScopeMaxFromPicker(rawPath) {
      const norm0 = normalizeSearchScopeMaxPath(rawPath);
      if (!norm0) return;
      const syn = scopePathClientSyntaxError(norm0);
      if (syn) {
        const st = document.getElementById('status');
        if (st) st.textContent = syn;
        return;
      }
      if (window.tagBrowser && typeof window.tagBrowser.listChildFolders === 'function') {
        const r = await window.tagBrowser.listChildFolders({ parentPath: norm0 });
        if (!r || !r.ok) {
          const st = document.getElementById('status');
          if (st)
            st.textContent =
              'Invalid folder: ' + (r && r.error ? String(r.error) : 'Not a folder or not reachable.');
          return;
        }
      }
      searchScopeMaxFolder = norm0;
      renderSearchScopeMaxUi();
      syncSearchScopeRootsTipVisibility();
      clampRootFolderUnderSearchScopeMax();
      saveSettings();
      renderScopeBreadcrumb();
      void runSearchNow();
      commitSearchHistoryNow();
    }

    function clearSearchScopeMaxSetting() {
      searchScopeMaxFolder = '';
      renderSearchScopeMaxUi();
      syncSearchScopeRootsTipVisibility();
      saveSettings();
      renderScopeBreadcrumb();
      void runSearchNow();
      commitSearchHistoryNow();
    }

    /** Set scope path only; query text stays as the in-scope filter. */
    function setSearchScopeFolder(folderAbsPath) {
      const folder = normalizeFolderPathForEverything(folderAbsPath);
      if (!folder) return;
      document.getElementById('rootFolder').value = folder;
    }

    function leaveScopePathEditChrome() {
      scopePathEditMode = false;
      scopePathEditCommitError = false;
      const inp = document.getElementById('scopePathEdit');
      if (inp) {
        inp.classList.remove('is-invalid');
        inp.removeAttribute('aria-invalid');
      }
      const btn = document.getElementById('btnEditScopePath');
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        btn.title = 'Edit current folder as path';
        btn.setAttribute('aria-label', 'Edit current folder path');
        btn.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
      }
      document.getElementById('scopePathEditWrap')?.classList.add('d-none');
    }

    function enterScopePathEditMode() {
      scopePathEditMode = true;
      hideBreadcrumbSubfolderFlyout();
      const shell = document.getElementById('breadcrumbShell');
      const bar = document.getElementById('breadcrumbBar');
      const wrap = document.getElementById('scopePathEditWrap');
      const btn = document.getElementById('btnEditScopePath');
      if (shell) {
        shell.classList.remove('d-none');
        shell.classList.add('d-flex');
      }
      if (bar) bar.classList.add('d-none');
      if (wrap) wrap.classList.remove('d-none');
      if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        btn.title = 'Save current folder path';
        btn.setAttribute('aria-label', 'Save current folder path');
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>';
      }
      const inp = document.getElementById('scopePathEdit');
      if (inp) {
        inp.value = document.getElementById('rootFolder').value;
        scopePathEditCommitError = false;
        syncScopePathEditValidationVisual();
        inp.focus();
        inp.select();
      }
    }

    function cancelScopePathEditMode() {
      leaveScopePathEditChrome();
      renderScopeBreadcrumb();
    }

    async function commitScopePathEditMode() {
      const raw = document.getElementById('scopePathEdit').value.trim();
      const status = document.getElementById('status');
      if (!raw) {
        leaveScopePathEditChrome();
        clearSearchScope();
        return;
      }
      const synErr = scopePathClientSyntaxError(raw);
      if (synErr) {
        if (status) status.textContent = synErr;
        scopePathEditCommitError = false;
        syncScopePathEditValidationVisual();
        return;
      }
      const norm = normalizeFolderPathForEverything(raw);
      if (window.tagBrowser && typeof window.tagBrowser.listChildFolders === 'function') {
        const r = await window.tagBrowser.listChildFolders({ parentPath: norm });
        if (!r || !r.ok) {
          if (status) {
            status.textContent =
              'Invalid folder path: ' + (r && r.error ? String(r.error) : 'Not a folder or not reachable.');
          }
          scopePathEditCommitError = true;
          syncScopePathEditValidationVisual();
          return;
        }
      }
      scopePathEditCommitError = false;
      leaveScopePathEditChrome();
      await applySearchScopeAndRefresh(norm);
    }

    function clearSearchScope() {
      leaveScopePathEditChrome();
      document.getElementById('rootFolder').value = '';
      saveSettings();
      renderScopeBreadcrumb();
      scheduleSearch();
      commitSearchHistoryNow();
    }

    /** Empty #query and refresh — same as the search-row ✕ (not current folder / scope). */
    function clearSearchQuery() {
      document.getElementById('query').value = '';
      syncQueryFilledChrome();
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
        btn.innerHTML = show
          ? '<i class="fa-solid fa-down-left-and-up-right-to-center" aria-hidden="true"></i>'
          : '<i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>';
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
        if (!Array.isArray(parsed)) return;
        const raw0 = parsed.map((x) => Number(x));
        if (!raw0.every((n) => Number.isFinite(n) && n >= 2)) return;
        let raw = raw0;
        if (raw.length === 7) {
          raw = [raw[0], raw[1], raw[2] + raw[3], raw[4], raw[5], raw[6]];
        }
        if (raw.length !== 6) {
          colPercent = COL_PERCENT_DEFAULT.slice();
          localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
          return;
        }
        const sum = raw.reduce((a, b) => a + b, 0);
        if (sum > 99 && sum < 101) {
          colPercent = raw;
          if (raw0.length === 7) localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
        } else {
          colPercent = COL_PERCENT_DEFAULT.slice();
          localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
        }
      } catch (_) {}
    }

    /** Fold Path weight into Name when tree view hides Path so bars still sum to 100. */
    function effectiveColWeights() {
      const w = colPercent.slice();
      if (isTreeViewOn() && w.length > RESULTS_PATH_COL_IDX) {
        const fold = w[RESULTS_PATH_COL_IDX] || 0;
        w[1] = (w[1] || 0) + fold;
        w[RESULTS_PATH_COL_IDX] = 0;
      }
      return w;
    }

    function applyTableColWidths() {
      const w = effectiveColWeights();
      let sumV = 0;
      for (let i = 0; i < w.length; i++) {
        if (w[i] > 0) sumV += w[i];
      }
      if (!(sumV > 0)) return;
      document.querySelectorAll('#resultsTable col').forEach((c, i) => {
        if (w[i] <= 0) {
          c.style.width = '';
          return;
        }
        c.style.width = (w[i] / sumV) * 100 + '%';
      });
    }

    /** Flat view: show Path column; tree view: hide Path col+header (grouping uses name gutter). */
    function applyResultsTablePathColumnVisibility() {
      const showPath = !isTreeViewOn();
      const table = document.getElementById('resultsTable');
      if (!table) return;
      const cols = table.querySelectorAll('col');
      const ths = table.querySelectorAll('thead th');
      const idx = RESULTS_PATH_COL_IDX;
      if (cols[idx]) cols[idx].style.display = showPath ? '' : 'none';
      if (ths[idx]) ths[idx].style.display = showPath ? '' : 'none';
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const cell = tr.children[idx];
        if (cell) cell.style.display = showPath ? '' : 'none';
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
        const minRight = boundaryIdx === 4 ? COL_RESIZE_MIN_ACTIONS_PCT : 3;
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
      leaveScopePathEditChrome();
      setSearchScopeFolder(clampFolderPathToSearchMax(folderAbsPath));
      const scopeNorm = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim());
      if (scopeNorm) rememberScopeFolderHistory(scopeNorm);
      saveSettings();
      renderScopeBreadcrumb();
      await runSearchNow();
      commitSearchHistoryNow();
      pulseSearchBoxAfterScopeFolderChange();
    }

    function scheduleSearch(eventKind = 'identity') {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchDebounceTimer = null;
        void runSearch(eventKind);
      }, 300);
    }

    /** Seconds from Settings; 0 = disabled. */
    function autoRefreshIntervalSeconds() {
      const el = document.getElementById('autoRefreshSec');
      if (!el) return 0;
      const n = parseInt(String(el.value || '0'), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function stopAutoRefreshTimer() {
      if (autoRefreshTimerId) {
        clearInterval(autoRefreshTimerId);
        autoRefreshTimerId = null;
      }
    }

    /** Start/stop interval from current #autoRefreshSec (call after load / change). */
    function syncAutoRefreshTimer() {
      stopAutoRefreshTimer();
      const sec = autoRefreshIntervalSeconds();
      if (!sec) return;
      autoRefreshTimerId = setInterval(() => void maybeAutoRefreshSearchTick(), sec * 1000);
    }

    /** Timer callback: same query as F5, but only when idle and safe. */
    async function maybeAutoRefreshSearchTick() {
      if (!autoRefreshIntervalSeconds()) {
        stopAutoRefreshTimer();
        return;
      }
      if (document.hidden) return;
      if (document.querySelector('.modal.show')) return;
      if (tagRenameBusy || renameItemBusy) return;
      if (searchInFlight) return;
      suppressViewerResyncForTimerSearch = true;
      try {
        await runSearchNow('refresh');
      } finally {
        suppressViewerResyncForTimerSearch = false;
      }
    }

    async function runSearchNow(eventKind = 'identity') {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      await runSearch(eventKind);
    }

    /** Pending staggered Everything re-queries (index can lag behind disk). */
    let diskMutationRefreshTimeouts = [];

    function clearAndScheduleSearchRetries() {
      for (const id of diskMutationRefreshTimeouts) clearTimeout(id);
      diskMutationRefreshTimeouts = [];
      for (const ms of [450, 1100, 2600]) {
        diskMutationRefreshTimeouts.push(
          setTimeout(() => {
            void runSearchNow('refresh');
          }, ms)
        );
      }
    }

    /** After paste / move / trash: search now plus a few delayed retries so the table catches up. */
    async function refreshAfterDiskMutation() {
      folderChildCountCache.clear();
      await detachViewerEditorsIfOpenTargetsGone();
      void renderShelf();
      clearAndScheduleSearchRetries();
      void runSearchNow('refresh');
    }

    function tagModalIsNewTodoDraft() {
      return tagModalMode === 'newTodo';
    }

    function syncTagModalHintsAndTitle() {
      const renameEl = document.getElementById('tagModalHintRename');
      const newTodoEl = document.getElementById('tagModalHintNewTodo');
      const lbl = document.getElementById('tagModalLabel');
      if (tagModalIsNewTodoDraft()) {
        if (lbl) lbl.textContent = 'Tags for new TODO file';
        renameEl?.classList.add('d-none');
        newTodoEl?.classList.remove('d-none');
      } else {
        if (lbl) lbl.textContent = 'Edit tags (rename)';
        renameEl?.classList.remove('d-none');
        newTodoEl?.classList.add('d-none');
      }
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
      const onSingle = modalTargetPaths.length === 1 || tagModalIsNewTodoDraft();
      for (const text of labels.slice(0, quickMax)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const low = text.toLowerCase();
        const already = onSingle && modalTags.some((t) => t.toLowerCase() === low);
        btn.className = already ? 'btn btn-sm btn-outline-secondary' : 'btn btn-sm btn-outline-primary';
        btn.textContent = text;
        btn.title = already
          ? tagModalIsNewTodoDraft()
            ? 'Already in this list'
            : 'Already on this item'
          : 'Add tag ' + text;
        btn.disabled = !!already;
        btn.addEventListener('click', () => void applyModalAddTag(text));
        quick.appendChild(btn);
      }
    }

    /** After tag rename / add / remove on disk: search now; optional pathRenames patches rows if Everything is still stale (bulk). */
    async function refreshAfterTagsSaved(pathRenames) {
      void renderShelf();
      clearAndScheduleSearchRetries();
      await runSearchNow('refresh');
      if (pathRenames && pathRenames.length) {
        patchResultRowsAfterRenames(pathRenames);
        pruneLastRowsRenamedSources(pathRenames);
        dedupeLastRowsByPathKey();
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

    /** Same rules as clicking a sort column: switching column sets default direction (size/modified = largest/newest first); same column again toggles. */
    function applySortColumnKey(key, statusNoteAfterSearch) {
      if (!['name', 'path', 'date_modified', 'size'].includes(key)) return;
      if (sortColumn === key) sortAsc = !sortAsc;
      else {
        sortColumn = key;
        // Size / Modified: first activation = largest / newest first; Name & Path = A→Z.
        sortAsc = key !== 'size' && key !== 'date_modified';
      }
      applyNaturalSortWhenTreeViewOn();
      saveSettings();
      updateSortHeaders();
      commitSearchHistoryNow();
      void (async () => {
        try {
          await runSearchNow();
        } finally {
          if (statusNoteAfterSearch) {
            const st = document.getElementById('status');
            if (st) {
              const cur = String(st.textContent || '').trim();
              st.textContent = cur ? cur + ' — ' + statusNoteAfterSearch : statusNoteAfterSearch;
            }
            pulseStatusBarBrief();
          }
        }
      })();
    }

    /** Status strip: brief primary glow (matches pulse-hint accent; one-shot). */
    function pulseStatusBarBrief() {
      const bar = document.getElementById('statusBar');
      if (!bar) return;
      bar.classList.remove('status-bar--pulse-hint');
      void bar.offsetWidth;
      bar.classList.add('status-bar--pulse-hint');
      bar.addEventListener(
        'animationend',
        () => bar.classList.remove('status-bar--pulse-hint'),
        { once: true }
      );
    }

    /** Tree + Size/Modified/Name (z/m/n or those headers): Flat on so sort sticks. */
    function flatViewOnIfTreeForColumnSort() {
      if (!isTreeViewOn()) return '';
      const el = document.getElementById('optRvFlat');
      if (el) { el.checked = true; }
      syncViewRadioActiveFromDom();
      applyResultsTablePathColumnVisibility();
      return 'Switched to Flat — column sort; Tree view uses path A→Z only.';
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

    /** Path folder grouping: synthetic ancestor folders when path-sorted non-flat + subfolders shown. */
    function shouldShowPathFolderGrouping() {
      if (!isTreeViewOn() || sortColumn !== 'path') return false;
      return isShowSubfolders();
    }

    /**
     * Tree + recency: folder mtime is often “touched” without meaningful content changes.
     * Drop real folder *hits* from the filtered set; path-grouping still injects synthetic folder rows
     * as ancestors of surviving files. Simple tree browse keeps folder rows.
     */
    function treeRecencyDropRealFolderHits() {
      return (
        !isFoldersOnly() &&
        isShowSubfolders() &&
        shouldShowPathFolderGrouping() &&
        recencyFilterMode() !== 'all'
      );
    }

    /** Parent-dir segments for one result row (files and folders both use parent of full path). */
    function parentSegmentsForRow(row) {
      const fp = fullPathForRow(row);
      const parent = String(T.parentDir(fp) || '').trim().replace(/[/\\]+$/, '');
      return pathSegmentsForTree(parent);
    }

    /** Scope folder (#rootFolder / breadcrumb) as segments — empty when searching whole index. */
    function scopeSegmentsForTree() {
      const scope = currentScopeFolderPath();
      return scope ? pathSegmentsForTree(scope) : [];
    }

    /**
     * Parent path segments shown in tree view: only below the current scope (last breadcrumb folder).
     * If a hit isn’t under scope, fall back to full parent segments (odd result / no scope).
     */
    function parentSegmentsUnderScope(row) {
      const full = parentSegmentsForRow(row);
      const sp = scopeSegmentsForTree();
      if (!sp.length) return full;
      if (commonPrefixLen(sp, full) !== sp.length) return full;
      return full.slice(sp.length);
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
      const scopeParts = scopeSegmentsForTree();
      const parentSegsList = src.map((r) => parentSegmentsUnderScope(r));
      const stripPrefixLen = segmentArraysCommonPrefixLen(parentSegsList);
      const out = [];
      // Shared parent prefix (stripPrefixLen) was only injected when row 0 had relParts empty; if path order
      // puts a deeper hit first, those ancestor folders never appeared — emit the chain once up front.
      if (stripPrefixLen > 0) {
        const u0 = parentSegsList[0];
        for (let k = 0; k < stripPrefixLen; k++) {
          const prefixSegs = scopeParts.concat(u0.slice(0, k + 1));
          const fullDir = prefixSegs.join('\\');
          if (realFolderKeys.has(pathNormKey(fullDir))) continue;
          const synthetic = syntheticFolderRow(fullDir);
          synthetic.__pathTreeDepthUi = k + 1;
          out.push(synthetic);
        }
      }
      let prevRelParent = [];
      for (let rowIdx = 0; rowIdx < src.length; rowIdx++) {
        const row = src[rowIdx];
        const under = parentSegsList[rowIdx];
        const relParts = under.slice(stripPrefixLen);
        const l = commonPrefixLen(prevRelParent, relParts);
        for (let j = l; j < relParts.length; j++) {
          const prefixSegs = scopeParts.concat(under.slice(0, stripPrefixLen + j + 1));
          const fullDir = prefixSegs.join('\\');
          if (realFolderKeys.has(pathNormKey(fullDir))) continue;
          const synthetic = syntheticFolderRow(fullDir);
          // Depth under scope: relParts = under.slice(stripPrefixLen), so j indexes the tail only.
          synthetic.__pathTreeDepthUi = stripPrefixLen + j + 1;
          out.push(synthetic);
        }
        // Always use full parent chain under scope — relParts.length is only the tail after stripPrefixLen (bug: child matched same depth as parent folder).
        row.__pathTreeDepthUi = under.length + 1;
        out.push(row);
        prevRelParent = relParts;
      }
      return out;
    }

    /** UI tree depth for path-sort gutter (grouping uses synthetic rows + __pathTreeDepthUi). */
    function pathTreeUiDepth(row, showPathFolderGrouping) {
      return showPathFolderGrouping ? Number(row.__pathTreeDepthUi) || 1 : parentSegmentsForRow(row).length;
    }

    /**
     * Box-drawing prefixes (├/└/─/│) for a depth column — list should be tree-ordered (path grouping on).
     * moreAtCol[c] mirrors archy: after a non-last sibling, column c gets │ for deeper rows.
     */
    function pathTreeGutterStringsForDepths(depths) {
      const n = depths.length;
      const out = new Array(n).fill('');
      const moreAtCol = [];
      for (let i = 0; i < n; i++) {
        const D = depths[i];
        if (D <= 1) {
          out[i] = '';
          while (moreAtCol.length > 0 && moreAtCol.length >= D) moreAtCol.pop();
          continue;
        }
        while (moreAtCol.length > D - 1) moreAtCol.pop();
        let s = '';
        for (let c = 0; c < D - 2; c++) {
          s += (moreAtCol[c] ? '\u2502' : ' ') + ' ';
        }
        let isLast = true;
        for (let j = i + 1; j < n; j++) {
          if (depths[j] < D) break;
          if (depths[j] === D) {
            isLast = false;
            break;
          }
        }
        /* ├/└ already include a short horizontal stub; extra ─ was widening the arm. */
        s += (isLast ? '\u2514' : '\u251c') + ' ';
        out[i] = s;
        while (moreAtCol.length < D - 1) moreAtCol.push(false);
        moreAtCol[D - 2] = !isLast;
      }
      return out;
    }

    /** Parent folder chain under scope (empty string = item sits in scope root). */
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

    /** Move item from fromIdx to gap gapIdx (0…length): insert before that slot; keeps keyboard order in sync. */
    function reorderFavListByGap(list, fromIdx, gapIdx) {
      const n = list.length;
      if (fromIdx < 0 || fromIdx >= n) return list.slice();
      if (!Number.isFinite(gapIdx) || gapIdx < 0 || gapIdx > n) return list.slice();
      const next = list.slice();
      const [item] = next.splice(fromIdx, 1);
      let ins = gapIdx;
      if (fromIdx < gapIdx) ins = gapIdx - 1;
      if (ins < 0 || ins > next.length) return list.slice();
      next.splice(ins, 0, item);
      return next;
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
        sp.textContent = 'No recent folders yet';
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
      if (!paths.length) {
        el.innerHTML = '<span class="text-muted small fst-italic px-2">Click <i class="fa-solid fa-floppy-disk"></i> to save the current folder</span>';
        return;
      }
      for (let idx = 0; idx < paths.length; idx++) {
        const fp = paths[idx];
        const row = document.createElement('span');
        row.className = 'd-inline-flex align-items-stretch tagfox-fav-chip-row';
        row.draggable = true;
        row.dataset.favIdx = String(idx);
        row.title = 'Drag to reorder. ' + (idx < 9 ? 'Ctrl+Shift+' + (idx + 1) + ' opens this folder.' : '');
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
        const slot = idx + 1;
        const shortcut = idx < 9 ? ' Shortcut: Ctrl+Shift+' + slot + ' (⌘+Shift+' + slot + ' on Mac).' : '';
        go.title = fp + ' — click to set as current folder.' + shortcut;
        go.setAttribute(
          'aria-label',
          'Open favourite folder ' +
            slot +
            (idx < 9 ? ' (keyboard Ctrl+Shift+' + slot + ')' : '') +
            '. ' +
            fp
        );
        go.addEventListener('click', () => void applySearchScopeAndRefresh(fp));
        const ddWrap = document.createElement('div');
        ddWrap.className = 'dropdown';
        const ddBtn = document.createElement('button');
        ddBtn.type = 'button';
        ddBtn.className = 'btn btn-sm dropdown-toggle fav-folder-chip-chevron tagfox-scope-chevron';
        ddBtn.setAttribute('data-bs-toggle', 'dropdown');
        ddBtn.setAttribute('data-fav-no-drag', '1');
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
        rm.className = 'btn btn-outline-secondary btn-sm px-1 ms-1 d-inline-flex align-items-center justify-content-center';
        rm.setAttribute('aria-label', 'Remove');
        rm.setAttribute('data-fav-no-drag', '1');
        rm.innerHTML = '<i class="fa-solid fa-xmark fa-sm" aria-hidden="true"></i>';
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

    /** Narrow flex slots between chips — injected while dragging; highlight = drop target (not the pills). */
    function createFavDropGapEl(gapIdx) {
      const s = document.createElement('span');
      s.className = 'tagfox-fav-drop-gap';
      s.dataset.favGapIdx = String(gapIdx);
      s.setAttribute('aria-hidden', 'true');
      return s;
    }

    function injectFavBarDropGaps(barEl) {
      if (!barEl || barEl.dataset.tagfoxGapsInjected === '1') return;
      const chips = [...barEl.querySelectorAll(':scope > .tagfox-fav-chip-row')];
      barEl.dataset.tagfoxGapsInjected = '1';
      barEl.classList.add('tagfox-fav-bar--dnd');
      if (!chips.length) return;
      barEl.insertBefore(createFavDropGapEl(0), chips[0]);
      for (let i = 0; i < chips.length; i++) {
        const chip = chips[i];
        const gap = createFavDropGapEl(i + 1);
        if (chip.nextSibling) barEl.insertBefore(gap, chip.nextSibling);
        else barEl.appendChild(gap);
      }
    }

    function clearFavBarDropGaps(barEl) {
      if (!barEl) return;
      barEl.querySelectorAll('.tagfox-fav-drop-gap').forEach((n) => n.remove());
      delete barEl.dataset.tagfoxGapsInjected;
      barEl.classList.remove('tagfox-fav-bar--dnd');
      barEl.querySelectorAll('.tagfox-fav-drop-gap--active').forEach((n) => n.classList.remove('tagfox-fav-drop-gap--active'));
    }

    function clearAllFavBarDropGaps() {
      clearFavBarDropGaps(document.getElementById('favFoldersBar'));
      clearFavBarDropGaps(document.getElementById('favSearchesBar'));
    }

    function setActiveFavDropGap(barEl, gapIdx) {
      if (!barEl) return;
      if (!Number.isFinite(gapIdx)) {
        barEl.querySelectorAll('.tagfox-fav-drop-gap--active').forEach((el) => el.classList.remove('tagfox-fav-drop-gap--active'));
        return;
      }
      barEl.querySelectorAll('.tagfox-fav-drop-gap').forEach((el) => {
        el.classList.toggle('tagfox-fav-drop-gap--active', +el.dataset.favGapIdx === gapIdx);
      });
    }

    /** Which gap is closest to the pointer (fallback when hovering a chip). */
    function nearestFavGapIndex(barEl, clientX, clientY) {
      const gaps = [...barEl.querySelectorAll('.tagfox-fav-drop-gap')];
      if (!gaps.length) return 0;
      let best = +gaps[0].dataset.favGapIdx || 0;
      let bestD = Infinity;
      for (const g of gaps) {
        const r = g.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const d = (clientX - cx) * (clientX - cx) + (clientY - cy) * (clientY - cy);
        if (d < bestD) {
          bestD = d;
          best = +g.dataset.favGapIdx;
        }
      }
      return best;
    }

    let favouriteBarsReorderBound = false;
    /** One-time: HTML5 drag-drop reorder on #favFoldersBar / #favSearchesBar (not subfolder ▾ / ✕). */
    function bindFavouriteBarsDragReorderOnce() {
      if (favouriteBarsReorderBound) return;
      favouriteBarsReorderBound = true;

      function wire(barEl, kind) {
        if (!barEl) return;
        const dndKey = kind === 'folder' ? 'tagfox-fav:folder' : 'tagfox-fav:search';

        barEl.addEventListener(
          'dragstart',
          (e) => {
            if (document.querySelector('.modal.show')) {
              e.preventDefault();
              return;
            }
            const row = e.target.closest('.tagfox-fav-chip-row');
            if (!row || !barEl.contains(row)) return;
            if (e.target.closest('[data-fav-no-drag="1"]')) {
              e.preventDefault();
              return;
            }
            const idx = +row.dataset.favIdx;
            if (!Number.isFinite(idx) || idx < 0) return;
            favListDragKind = kind;
            e.dataTransfer.setData('text/plain', dndKey + ':' + idx);
            e.dataTransfer.effectAllowed = 'move';
            row.classList.add('tagfox-fav-chip-row--dragging');
            clearAllFavBarDropGaps();
            injectFavBarDropGaps(barEl);
          },
          true
        );

        barEl.addEventListener('dragend', () => {
          favListDragKind = null;
          document.querySelectorAll('.tagfox-fav-chip-row--dragging').forEach((n) => n.classList.remove('tagfox-fav-chip-row--dragging'));
          clearAllFavBarDropGaps();
        });

        barEl.addEventListener('dragover', (e) => {
          if (favListDragKind !== kind) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (barEl.dataset.tagfoxGapsInjected !== '1') injectFavBarDropGaps(barEl);
          const gEl = e.target.closest('.tagfox-fav-drop-gap');
          const gapIdx = gEl && barEl.contains(gEl) ? +gEl.dataset.favGapIdx : nearestFavGapIndex(barEl, e.clientX, e.clientY);
          setActiveFavDropGap(barEl, gapIdx);
        });

        barEl.addEventListener('drop', (e) => {
          if (favListDragKind !== kind) return;
          e.preventDefault();
          const raw = e.dataTransfer.getData('text/plain');
          const re = kind === 'folder' ? /^tagfox-fav:folder:(\d+)$/ : /^tagfox-fav:search:(\d+)$/;
          const m = raw.match(re);
          if (!m) {
            clearAllFavBarDropGaps();
            return;
          }
          const fromIdx = +m[1];
          if (!Number.isFinite(fromIdx)) {
            clearAllFavBarDropGaps();
            return;
          }
          let gapIdx;
          const gHit = e.target.closest('.tagfox-fav-drop-gap');
          if (gHit && barEl.contains(gHit)) gapIdx = +gHit.dataset.favGapIdx;
          else gapIdx = nearestFavGapIndex(barEl, e.clientX, e.clientY);
          if (!Number.isFinite(gapIdx)) {
            clearAllFavBarDropGaps();
            return;
          }

          if (kind === 'folder') {
            const list = loadFavouriteFolders();
            if (fromIdx >= list.length) {
              clearAllFavBarDropGaps();
              return;
            }
            saveFavouriteFolders(reorderFavListByGap(list, fromIdx, gapIdx));
            renderFavFoldersBar();
          } else {
            const list = loadFavouriteSearches();
            if (fromIdx >= list.length) {
              clearAllFavBarDropGaps();
              return;
            }
            saveFavouriteSearches(reorderFavListByGap(list, fromIdx, gapIdx));
            renderFavSearchesBar();
          }
          clearAllFavBarDropGaps();
          const st = document.getElementById('status');
          if (st) st.textContent = kind === 'folder' ? 'Favourite folders reordered.' : 'Saved searches reordered.';
        });
      }

      wire(document.getElementById('favFoldersBar'), 'folder');
      wire(document.getElementById('favSearchesBar'), 'search');
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
      const ceilOne =
        s.searchScopeMax != null && String(s.searchScopeMax).trim()
          ? String(s.searchScopeMax).trim()
          : Array.isArray(s.searchScopeCeilings) && s.searchScopeCeilings.length
            ? String(s.searchScopeCeilings[0]).trim()
            : '';
      const tags = Array.isArray(s.activeTagKeys) ? [...s.activeTagKeys].filter(Boolean).sort() : [];
      const lines = [];
      if (slotIdx >= 0 && slotIdx < 9) {
        lines.push('Shortcut: Ctrl+' + (slotIdx + 1));
        lines.push('');
      }
      lines.push(
        'Click to restore this search. Drag chip on bar to reorder (Ctrl+1…9 follow left-to-right order).',
        '',
        'Query: ' + (q.trim() || '(empty)'),
        'Search scope folder (Settings): ' + (ceilOne || '(none)'),
        'Current folder: ' + (sc || '(entire index)'),
      );
      if (tags.length) lines.push('Tags: ' + tags.join(', '));
      lines.push('Tag combine: ' + (s.tagFilterCombineOr ? 'OR' : 'AND'));
      lines.push(
        'Layout: ' +
          (s.resultsLayout || (s.flatView ? 'flat' : s.smartView ? 'smart' : 'tree')) +
          ' | Subfolders: ' +
          (s.showSubfolders ? 'on' : 'off') +
          ' | Content: ' +
          (s.resultsContent || (s.hideFiles ? 'folders' : 'all')),
      );
      lines.push(
        'Match: case=' +
          !!s.optCase +
          ' path=' +
          !!s.optPath +
          ' whole=' +
          !!s.optWholeWord +
          ' diacritics=' +
          !!s.optDiacritics +
          ' hideSpecial=' +
          !!s.optHideSpecial
      );
      lines.push(
        'Recency: ' +
          (s.recencyFilter && s.recencyFilter !== 'all' ? String(s.recencyFilter) + ' (modified)' : 'all')
      );
      lines.push('Sort: ' + (s.sortColumn || 'name') + ' ' + (s.sortAsc !== false ? 'asc' : 'desc'));
      lines.push('Advanced panel: ' + (s.advancedPanelOpen ? 'open' : 'closed'));
      return lines.join('\n');
    }

    function renderFavSearchesBar() {
      const el = document.getElementById('favSearchesBar');
      if (!el) return;
      el.innerHTML = '';
      const entries = loadFavouriteSearches();
      if (!entries.length) {
        el.innerHTML = '<span class="text-muted small fst-italic px-2">Click <i class="fa-solid fa-floppy-disk"></i> to save the current search</span>';
        return;
      }
      entries.forEach((s, idx) => {
        const row = document.createElement('span');
        row.className = 'd-inline-flex align-items-stretch tagfox-fav-chip-row';
        row.draggable = true;
        row.dataset.favIdx = String(idx);
        row.title = 'Drag to reorder. ' + (idx < 9 ? 'Ctrl+' + (idx + 1) + ' restores this search.' : '');
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
          '. Hover for query, current folder, and filters.';
        go.setAttribute('aria-label', a11y);
        go.title = favouriteSearchTooltip(s, idx);
        go.addEventListener('click', () => void applyFavouriteSearchState(s));
        grp.appendChild(go);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn btn-outline-secondary btn-sm px-1 ms-1 d-inline-flex align-items-center justify-content-center';
        rm.setAttribute('aria-label', 'Remove');
        rm.setAttribute('data-fav-no-drag', '1');
        rm.innerHTML = '<i class="fa-solid fa-xmark fa-sm" aria-hidden="true"></i>';
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
      const max = getSearchScopeMaxFolderNorm();
      const scopeRaw = document.getElementById('rootFolder').value.trim();
      if (!scopeRaw && !max) {
        q.placeholder = 'Search inside (entire index)';
        return;
      }
      const norm = normalizeFolderPathForEverything(scopeRaw || max).replace(/[/\\]+$/, '');
      const seg = T.baseName(norm);
      const pretty = (segmentPretty(seg) || seg || 'folder').trim();
      q.placeholder = 'Search inside ' + pretty;
    }

    /** Breadcrumb bar only depends on scope folder — not on which result row is selected. */
    let renderedScopeBreadcrumbKey = null;
    /** Set by refreshDriveRootsPickerGate(): Windows = any ready drive letter; macOS/Linux = more than one volume root. */
    let driveRootsPickerShow = false;
    /** Pen toggle: text path field instead of segment breadcrumb. */
    let scopePathEditMode = false;
    /** Last save failed (e.g. folder missing); cleared on input — drives red styling with syntax errors. */
    let scopePathEditCommitError = false;

    /** Red border/text when path text is illegal or save failed (see scopePathClientSyntaxError). */
    function syncScopePathEditValidationVisual() {
      const inp = document.getElementById('scopePathEdit');
      if (!inp || !scopePathEditMode) return;
      const trimmed = inp.value.trim();
      if (!trimmed) {
        inp.classList.remove('is-invalid');
        inp.removeAttribute('aria-invalid');
        scopePathEditCommitError = false;
        return;
      }
      const bad = !!(scopePathClientSyntaxError(trimmed) || scopePathEditCommitError);
      inp.classList.toggle('is-invalid', bad);
      inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
    }

    async function refreshDriveRootsPickerGate() {
      if (!window.tagBrowser || typeof window.tagBrowser.listDriveRoots !== 'function') {
        driveRootsPickerShow = false;
        return;
      }
      try {
        const r = await window.tagBrowser.listDriveRoots();
        const plat = (r && r.platform) || '';
        const roots = Array.isArray(r.roots) ? r.roots : [];
        driveRootsPickerShow = plat === 'win32' ? roots.length > 0 : roots.length > 1;
      } catch {
        driveRootsPickerShow = false;
      }
      if (document.getElementById('rootFolder').value.trim()) renderScopeBreadcrumb();
    }

    function currentScopeBreadcrumbKey() {
      return getSearchScopeMaxFolderNorm() + '\n' + document.getElementById('rootFolder').value.trim();
    }

    /** Avoid rebuilding breadcrumb when selection/table updates would destroy open ▾ + flyouts for nothing. */
    function renderScopeBreadcrumbIfScopeChanged() {
      if (currentScopeBreadcrumbKey() === renderedScopeBreadcrumbKey) return;
      renderScopeBreadcrumb();
    }

    /** Chevron-down for breadcrumb ▾ scope toggles (Font Awesome). */
    function breadcrumbDropdownChevronHtml() {
      return '<i class="fa-solid fa-chevron-down fa-fw" aria-hidden="true"></i>';
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
      let scopeRaw = document.getElementById('rootFolder').value.trim();
      if (!scopeRaw) scopeRaw = getSearchScopeMaxFolderNorm() || '';
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

    /** This-folder-only breadcrumb flyout: folder rows + hover/focus opens deeper flyout; click applies scope. */
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

    /** Highlight drive/volume row when current scope path is under that root. */
    function scopeIsUnderDriveRoot(scopeNorm, pathSep, rootFullPath) {
      const r = normalizeFolderPathForEverything(rootFullPath).replace(/[/\\]+$/, '').toLowerCase();
      const s = normalizeFolderPathForEverything(scopeNorm).replace(/[/\\]+$/, '').toLowerCase();
      if (!r || !s) return false;
      if (s === r) return true;
      const slash = pathSep === '/' ? '/' : '\\';
      return s.startsWith(r + slash);
    }

    /** Leading breadcrumb control: OS-mounted roots from main (Windows A:–Z:, macOS / + /Volumes, etc.). */
    function prependDriveRootPicker(barEl, scopeNorm, pathSep) {
      if (!driveRootsPickerShow || !window.tagBrowser || typeof window.tagBrowser.listDriveRoots !== 'function') return;
      const ddWrap = document.createElement('div');
      ddWrap.className = 'dropdown d-inline-block me-1';
      const ddBtn = document.createElement('button');
      ddBtn.type = 'button';
      ddBtn.className =
        'btn btn-link btn-sm text-secondary py-0 px-1 align-baseline breadcrumb-dd-toggle d-inline-flex align-items-center gap-0';
      ddBtn.innerHTML =
        '<i class="fa-solid fa-folder fa-fw" aria-hidden="true"></i>' + breadcrumbDropdownChevronHtml();
      ddBtn.title = 'Drives and volumes';
      ddBtn.setAttribute('aria-label', 'Drives and volumes');
      ddBtn.setAttribute('data-bs-toggle', 'dropdown');
      ddBtn.setAttribute('aria-expanded', 'false');
      const menu = document.createElement('ul');
      menu.className = 'dropdown-menu dropdown-menu-start py-1 small shadow';
      menu.style.maxHeight = 'min(50vh, 280px)';
      menu.style.overflow = 'auto';
      menu.addEventListener('scroll', () => repositionBreadcrumbFlyoutChain());
      menu.addEventListener('mouseenter', cancelBreadcrumbFlyoutHideTimer);
      ddBtn.addEventListener('click', (e) => e.stopPropagation());
      ddBtn.addEventListener('hide.bs.dropdown', (ev) => {
        if (focusInsideBreadcrumbFlyout()) ev.preventDefault();
      });
      ddBtn.addEventListener('hidden.bs.dropdown', () => hideBreadcrumbSubfolderFlyout());
      ddBtn.addEventListener('show.bs.dropdown', () => {
        menu.innerHTML =
          '<li><span class="dropdown-item-text text-muted">' +
          (window.tagBrowser.listDriveRoots ? 'Loading…' : 'Not available') +
          '</span></li>';
        if (!window.tagBrowser.listDriveRoots) return;
        void (async () => {
          const r = await window.tagBrowser.listDriveRoots();
          menu.innerHTML = '';
          if (!r || !r.ok || !Array.isArray(r.roots) || !r.roots.length) {
            const li0 = document.createElement('li');
            li0.innerHTML =
              '<span class="dropdown-item-text text-danger small">' +
              (r && r.error ? String(r.error) : 'Could not list drives') +
              '</span>';
            menu.appendChild(li0);
            return;
          }
          for (const item of r.roots) {
            const fp = item && item.fullPath ? String(item.fullPath) : '';
            const lbl = item && item.label ? String(item.label) : fp;
            if (!fp) continue;
            const li = document.createElement('li');
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'dropdown-item small py-1';
            b.textContent = lbl;
            if (scopeIsUnderDriveRoot(scopeNorm, pathSep, fp)) b.classList.add('active');
            b.addEventListener('click', async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const inst = bootstrap.Dropdown.getInstance(ddBtn);
              if (inst) inst.hide();
              await applySearchScopeAndRefresh(normalizeFolderPathForEverything(fp));
            });
            li.appendChild(b);
            menu.appendChild(li);
          }
        })();
      });
      ddWrap.appendChild(ddBtn);
      ddWrap.appendChild(menu);
      bindBreadcrumbDropdownHover(ddWrap, ddBtn);
      barEl.appendChild(ddWrap);
    }

    /** Split normalized folder path into segments (C:, UNC, etc.). */
    function splitFolderPathSegments(normPath) {
      return normalizeFolderPathForEverything(String(normPath || '').trim())
        .replace(/[/\\]+$/, '')
        .split(/[/\\]/)
        .filter((p) => p !== '');
    }

    /** Folder trail: segments set scope; with Settings scope max, that folder is the first crumb (no drive picker). */
    function renderScopeBreadcrumb() {
      hideBreadcrumbSubfolderFlyout();
      updateQueryPlaceholder();
      if (scopePathEditMode) return;
      const el = document.getElementById('breadcrumbBar');
      const shell = document.getElementById('breadcrumbShell');
      const editWrap = document.getElementById('scopePathEditWrap');
      el.innerHTML = '';
      const maxNorm = getSearchScopeMaxFolderNorm();
      const scopeRaw = document.getElementById('rootFolder').value.trim();
      const btnClear = document.getElementById('btnClearScope');
      if (!maxNorm && !scopeRaw) {
        el.classList.add('d-none');
        el.classList.remove('d-flex', 'align-items-center', 'flex-wrap', 'gap-0');
        if (shell) {
          shell.classList.remove('d-flex');
          shell.classList.add('d-none');
        }
        if (editWrap) editWrap.classList.add('d-none');
        if (btnClear) btnClear.disabled = true;
        syncStatusBarParentScopeButton();
        renderedScopeBreadcrumbKey = currentScopeBreadcrumbKey();
        return;
      }
      if (btnClear) btnClear.disabled = !scopeRaw;
      if (shell) {
        shell.classList.remove('d-none');
        shell.classList.add('d-flex');
      }
      if (editWrap) editWrap.classList.add('d-none');
      el.classList.remove('d-none');
      el.classList.add('d-flex', 'align-items-center', 'flex-wrap', 'gap-0');

      const rfEl = document.getElementById('rootFolder');
      let norm = '';
      if (scopeRaw) {
        norm = normalizeFolderPathForEverything(scopeRaw).replace(/[/\\]+$/, '');
        if (maxNorm) {
          const clamped = clampFolderPathToSearchMax(norm);
          if (pathNormKey(clamped) !== pathNormKey(norm)) {
            rfEl.value = clamped;
            norm = clamped;
          }
        }
      } else {
        norm = maxNorm;
      }

      const sep = norm.includes('/') ? '/' : '\\';
      const parts = norm.split(/[/\\]/).filter((p) => p !== '');

      function appendSiblingChevron(iSeg, parentForPeers, partsArr) {
        let accNext = '';
        for (let j = 0; j <= iSeg + 1; j++) {
          accNext = j === 0 ? partsArr[j] : accNext + sep + partsArr[j];
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

      if (!maxNorm) {
        prependDriveRootPicker(el, norm, sep);
        let acc = '';
        parts.forEach((part, i) => {
          acc = i === 0 ? part : acc + sep + part;
          if (isGoogleDriveShortcutTargetsSegment(part)) return;
          const isGDriveShortcutId = i > 0 && isGoogleDriveShortcutTargetsSegment(parts[i - 1]);
          const wrap = document.createElement('span');
          wrap.className = 'd-inline-flex align-items-center flex-wrap';
          const parsed = T.parseSegmentTags(part);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'btn btn-link btn-sm p-0 align-baseline breadcrumb-folder-seg' +
            (i === parts.length - 1 ? ' breadcrumb-folder-seg-current' : '');
          if (isGDriveShortcutId) {
            btn.innerHTML = '<i class="fa-solid fa-link fa-xs" aria-hidden="true"></i>';
          } else {
            btn.textContent = parsed.pretty;
          }
          const folderForSearch = normalizeFolderPathForEverything(acc);
          wrap.dataset.dropPath = folderForSearch;
          btn.title = isGDriveShortcutId
            ? 'Google Drive shortcut: ' + folderForSearch
            : 'Current folder: ' + folderForSearch + ' (recursive under this folder)';
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
          if (i < parts.length - 1) appendSiblingChevron(i, folderForSearch, parts);
        });
      } else {
        const maxNormFull = normalizeFolderPathForEverything(maxNorm).replace(/[/\\]+$/, '');
        const maxParts = splitFolderPathSegments(maxNormFull);
        const wrapR = document.createElement('span');
        wrapR.className = 'd-inline-flex align-items-center flex-wrap';
        const btnR = document.createElement('button');
        btnR.type = 'button';
        const onlyRoot = parts.length <= maxParts.length;
        btnR.className =
          'btn btn-link btn-sm p-0 align-baseline breadcrumb-folder-seg' +
          (onlyRoot ? ' breadcrumb-folder-seg-current' : '');
        btnR.textContent = segmentPretty(T.baseName(maxNormFull)) || T.baseName(maxNormFull);
        btnR.title = 'Scope root: ' + maxNormFull;
        btnR.addEventListener('click', async (e) => {
          e.stopPropagation();
          await applySearchScopeAndRefresh(maxNormFull);
        });
        wrapR.dataset.dropPath = maxNormFull;
        wrapR.appendChild(btnR);
        el.appendChild(wrapR);
        if (!onlyRoot) {
          appendSiblingChevron(maxParts.length - 1, maxNormFull, parts);
        }
        let acc = maxNormFull;
        for (let i = maxParts.length; i < parts.length; i++) {
          const part = parts[i];
          acc = i === maxParts.length ? maxNormFull + sep + part : acc + sep + part;
          if (isGoogleDriveShortcutTargetsSegment(part)) continue;
          const isGDriveShortcutId = i > 0 && isGoogleDriveShortcutTargetsSegment(parts[i - 1]);
          const wrap = document.createElement('span');
          wrap.className = 'd-inline-flex align-items-center flex-wrap';
          const parsed = T.parseSegmentTags(part);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'btn btn-link btn-sm p-0 align-baseline breadcrumb-folder-seg' +
            (i === parts.length - 1 ? ' breadcrumb-folder-seg-current' : '');
          if (isGDriveShortcutId) {
            btn.innerHTML = '<i class="fa-solid fa-link fa-xs" aria-hidden="true"></i>';
          } else {
            btn.textContent = parsed.pretty;
          }
          const folderForSearch = normalizeFolderPathForEverything(acc);
          wrap.dataset.dropPath = folderForSearch;
          btn.title = isGDriveShortcutId
            ? 'Google Drive shortcut: ' + folderForSearch
            : 'Current folder: ' + folderForSearch + ' (recursive under this folder)';
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
          if (i < parts.length - 1) appendSiblingChevron(i, folderForSearch, parts);
        }
      }

      const scopeFolder = normalizeFolderPathForEverything(scopeRaw || maxNorm);
      const subWrap = document.createElement('span');
      subWrap.className = 'd-inline-flex align-items-center text-muted user-select-none breadcrumb-scope-dd ms-1';
      const subDd = document.createElement('div');
      subDd.className = 'dropdown d-inline-block';
      const subBtn = document.createElement('button');
      subBtn.type = 'button';
      subBtn.className =
        'btn btn-link btn-sm text-secondary py-0 px-2 align-baseline breadcrumb-dd-toggle tagfox-scope-chevron';
      subBtn.innerHTML = breadcrumbDropdownChevronHtml();
      subBtn.title = 'Subfolders of current folder';
      subBtn.setAttribute('aria-label', 'Subfolders of current folder');
      subBtn.setAttribute('data-bs-toggle', 'dropdown');
      subBtn.setAttribute('aria-expanded', 'false');
      const subMenu = document.createElement('ul');
      const trailHl = breadcrumbHighlightChildPathNorm(scopeFolder);
      bindSubfolderDropdownWithFlyouts(subBtn, subMenu, subDd, scopeFolder, trailHl || '', true);
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
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
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
            pullWebContentsKeyboardFocus();
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

    /**
     * New folder under scope. parentOverride: when set (e.g. folder row ⋯ / right‑click), create inside that folder;
     * otherwise use the current scope folder from Settings.
     */
    async function createNewFolderInScopeInteractive(parentOverride) {
      const status = document.getElementById('status');
      const parent =
        parentOverride != null && String(parentOverride).trim()
          ? normalizeFolderPathForEverything(String(parentOverride).trim())
          : currentScopeFolderPath();
      if (!parent) {
        status.textContent = 'Set the current folder (Settings or breadcrumb) first.';
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
        status.textContent = 'Set the current folder (Settings or breadcrumb) first.';
        return;
      }
      const raw = document.getElementById('newMdTitleInput').value.trim();
      if (!raw) {
        status.textContent = 'Type a title.';
        return;
      }
      const safe = sanitizeFileTitleSegment(raw);
      const baseName = T.buildTaggedComponent(safe + '.md', newTodoMdTags);
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
      void refreshAfterDiskMutation();
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
      const videoBlock = document.getElementById('videoBlock');
      const audioBlock = document.getElementById('audioBlock');
      if (pdfBlock) pdfBlock.classList.add('d-none');
      if (officeBlock) officeBlock.classList.add('d-none');
      if (imageBlock) imageBlock.classList.add('d-none');
      if (videoBlock) videoBlock.classList.add('d-none');
      if (audioBlock) audioBlock.classList.add('d-none');
      const textFileBlock = document.getElementById('textFileBlock');
      if (textFileBlock) textFileBlock.classList.add('d-none');
      const gdocWorkspaceBlock = document.getElementById('gdocWorkspaceBlock');
      if (gdocWorkspaceBlock) gdocWorkspaceBlock.classList.add('d-none');
      const gdocDriveLinks = document.getElementById('gdocWorkspaceDriveLinks');
      if (gdocDriveLinks) {
        gdocDriveLinks.classList.add('d-none');
        const bs = document.getElementById('btnGdocDriveSearch');
        const bf = document.getElementById('btnGdocDriveFolder');
        if (bs) bs.onclick = null;
        if (bf) bf.onclick = null;
      }
      document.getElementById('propsEmpty').classList.remove('d-none');
      document.getElementById('propsDetails').classList.add('d-none');
      activeReadmePath = null;
      lastReadmeFolderPathLoose = '';
      activeMdPath = null;
      resetViewerDocEditorChrome();
      renderScopeBreadcrumbIfScopeChanged();
    }

    /** Same logical path across `/` vs `\\` and case — matches Everything rows to the table selection on Windows. */
    function pathKeyLoose(fp) {
      return String(fp || '')
        .trim()
        .replace(/[/\\]+$/, '')
        .replace(/\//g, '\\')
        .toLowerCase();
    }

    function findRowByFullPath(fp) {
      const k = pathKeyLoose(fp);
      return lastRows.find((r) => pathKeyLoose(fullPathForRow(r)) === k) || null;
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

    /** Stable key for “did this hit’s metadata change?” — skip full viewer reload when only the results list refreshed (e.g. auto-refresh). */
    function viewerRefreshSignatureForRow(row, fp) {
      const p = pathKeyLoose(fp);
      if (!p) return '';
      if (!row || pathKeyLoose(fullPathForRow(row)) !== p) return p + '|!row';
      const ms = modifiedTimeMs(row);
      const sz = rowSizeBytes(row);
      const kind = rowIsFolder(row) ? 'd' : 'f';
      /* Second precision: sub-second jitter in FILETIME / HTTP should not force a full viewer tear-down. */
      const mt = ms == null ? '' : String(Math.floor(ms / 1000));
      const szs = sz == null ? '' : String(sz);
      return [p, kind, mt, szs].join('|');
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
      const pathForSig = selectedFullPath;
      const prevRow = selectedRow;
      let row = findRowByFullPath(selectedFullPath);
      if (!row) {
        const vis = listRowsForUi();
        const selK = pathKeyLoose(selectedFullPath);
        row = vis.find((r) => pathKeyLoose(fullPathForRow(r)) === selK) || null;
      }
      if (row) {
        const prevSig = viewerRefreshSignatureForRow(prevRow, pathForSig);
        const nextSig = viewerRefreshSignatureForRow(row, pathForSig);
        selectedRow = row;
        renderScopeBreadcrumbIfScopeChanged();
        const kSel = pathKeyLoose(pathForSig);
        const needFolderDocResync =
          rowIsFolder(row) && (!lastReadmeFolderPathLoose || kSel !== lastReadmeFolderPathLoose);
        if (prevSig === nextSig || suppressViewerResyncForTimerSearch) {
          if (needFolderDocResync) await refreshPropsPanel();
          else cancelPropsPreviewSchedule();
          return;
        }
        await refreshPropsPanel();
        return;
      }
      const scope = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim()).replace(/[/\\]+$/, '');
      const selNorm = selectedFullPath.replace(/[/\\]+$/, '');
      if (scope && selNorm.toLowerCase() === scope.toLowerCase()) {
        const syn = syntheticFolderRow(selectedFullPath);
        const prevSig = viewerRefreshSignatureForRow(prevRow, pathForSig);
        const nextSig = viewerRefreshSignatureForRow(syn, pathForSig);
        selectedRow = syn;
        renderScopeBreadcrumbIfScopeChanged();
        const kSel = pathKeyLoose(pathForSig);
        const needFolderDocResync =
          rowIsFolder(syn) && (!lastReadmeFolderPathLoose || kSel !== lastReadmeFolderPathLoose);
        if (prevSig === nextSig || suppressViewerResyncForTimerSearch) {
          if (needFolderDocResync) await refreshPropsPanel();
          else cancelPropsPreviewSchedule();
          return;
        }
        await refreshPropsPanel();
        return;
      }
      selectedRow = null;
      selectedFullPath = null;
      await flushMdFileAutosave();
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
      const videoBlock = document.getElementById('videoBlock');
      const audioBlock = document.getElementById('audioBlock');
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
      const isSameFolderReadme =
        rowIsFolder(propRow) &&
        lastReadmeFolderPathLoose &&
        pathKeyLoose(propPath) === lastReadmeFolderPathLoose &&
        !readmeBlock.classList.contains('d-none');
      if (!isSameFolderReadme) readmeBlock.classList.add('d-none');
      mdFileBlock.classList.add('d-none');
      if (gdocWorkspaceBlock) gdocWorkspaceBlock.classList.add('d-none');
      if (pdfBlock) pdfBlock.classList.add('d-none');
      if (officeBlock) officeBlock.classList.add('d-none');
      if (imageBlock) imageBlock.classList.add('d-none');
      if (videoBlock) videoBlock.classList.add('d-none');
      if (audioBlock) audioBlock.classList.add('d-none');
      if (textFileBlock) textFileBlock.classList.add('d-none');
      if (isSameFolderReadme) propPh.classList.add('d-none');
      else {
        propPh.classList.remove('d-none');
        propPh.textContent = 'Loading preview…';
      }

      const base = T.baseName(propPath);
      const parsedTitle = T.parseSegmentTags(base);
      document.getElementById('propDisplayName').textContent = parsedTitle.pretty;
      const tagBand = document.getElementById('propTitleTags');
      tagBand.innerHTML = '';
      for (const tag of parsedTitle.tags) appendTagPillWithRemove(tagBand, tag, propPath);

      const propFullPathEl = document.getElementById('propFullPath');
      propFullPathEl.textContent = collapseGDriveShortcutDisplay(propPath);
      propFullPathEl.title = propPath;
      document.getElementById('propType').textContent = rowIsFolder(propRow) ? 'Folder' : 'File';
      const propSizeEl = document.getElementById('propSize');
      propSizeEl.textContent = formatSize(propRow.size);
      applySizeHeatToElement(propSizeEl, propRow);
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
      const videoBlock = document.getElementById('videoBlock');
      const audioBlock = document.getElementById('audioBlock');
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
        mdFileBlock.classList.remove('d-none');
        const ed = document.getElementById('mdFileEditor');
        const mdWrap = document.getElementById('mdFileEditorWrap');
        /* Poll/search refresh changes mtime → full heavy run used to reset UI; keep editing session if same file + editor open. */
        const sameMdEditing =
          mdWrap &&
          !mdWrap.classList.contains('d-none') &&
          activeMdPath &&
          propsPathKey(activeMdPath) === propsPathKey(targetFp);
        if (sameMdEditing) {
          document.getElementById('mdFilePreview').innerHTML = mdPreviewHtml(ed.value);
          return;
        }
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
        resetViewerDocEditorChrome();
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
        const diagEl = document.getElementById('gdocWorkspaceDiag');
        const linksWrap = document.getElementById('gdocWorkspaceDriveLinks');
        const btnGdocSearch = document.getElementById('btnGdocDriveSearch');
        const btnGdocFolder = document.getElementById('btnGdocDriveFolder');
        const rGw = await window.tagBrowser.googleWorkspaceShortcutUrl({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!urlEl || !btnGw) return;
        if (!rGw.ok) {
          urlEl.textContent =
            rGw.code === 'ENOENT'
              ? 'File not found.'
              : 'Use Drive buttons below, or Open in the row menu. (In-app tab needs a readable shortcut file.)';
          btnGw.classList.add('d-none');
          delete btnGw.dataset.url;
          if (diagEl) {
            diagEl.textContent = '';
            diagEl.classList.add('d-none');
          }
          if (linksWrap && btnGdocSearch && btnGdocFolder && window.tagBrowser.openUrlDefaultBrowser) {
            const su = rGw.diag && rGw.diag.driveSearchUrl;
            const fu = rGw.diag && rGw.diag.driveFolderUrl;
            const any = !!(su || fu);
            linksWrap.classList.toggle('d-none', !any);
            btnGdocSearch.classList.toggle('d-none', !su);
            btnGdocFolder.classList.toggle('d-none', !fu);
            btnGdocSearch.onclick = su ? () => void window.tagBrowser.openUrlDefaultBrowser({ url: su }) : null;
            btnGdocFolder.onclick = fu ? () => void window.tagBrowser.openUrlDefaultBrowser({ url: fu }) : null;
          } else if (linksWrap) {
            linksWrap.classList.add('d-none');
          }
        } else {
          urlEl.textContent = rGw.url;
          btnGw.classList.remove('d-none');
          btnGw.dataset.url = rGw.url;
          if (diagEl) {
            diagEl.textContent = '';
            diagEl.classList.add('d-none');
          }
          if (linksWrap) {
            linksWrap.classList.add('d-none');
            if (btnGdocSearch) btnGdocSearch.onclick = null;
            if (btnGdocFolder) btnGdocFolder.onclick = null;
          }
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

      const videoMime = VIDEO_EXT_MIME[ext];
      if (videoMime) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        videoBlock.classList.remove('d-none');
        const vid = document.getElementById('propVideoPreview');
        vid.pause();
        vid.removeAttribute('src');
        vid.src = localPathToFileUrl(targetFp);
        vid.load();
        return;
      }

      const audioMime = AUDIO_EXT_MIME[ext];
      if (audioMime) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        audioBlock.classList.remove('d-none');
        const aud = document.getElementById('propAudioPreview');
        aud.pause();
        aud.removeAttribute('src');
        aud.src = localPathToFileUrl(targetFp);
        aud.load();
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

      if ((ext === 'docx' || ext === 'doc' || ext === 'odt') && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        const docLabel = ext === 'docx' ? 'Word (DOCX)' : ext === 'odt' ? 'Writer (ODT)' : 'Word (DOC)';
        document.getElementById('officeTitle').textContent = docLabel;
        const prev = document.getElementById('officePreview');
        if (ext === 'doc' || ext === 'odt') {
          prev.innerHTML = '<p class="text-muted mb-0">Preview not supported for .' + ext + ' — use Open.</p>';
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

      if ((ext === 'xlsx' || ext === 'xls' || ext === 'ods') && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        document.getElementById('officeTitle').textContent = ext === 'ods' ? 'Calc (ODS)' : 'Excel';
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

      if (ext === 'ppt' || ext === 'odp') {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        document.getElementById('officeTitle').textContent = ext === 'odp' ? 'Impress (ODP)' : 'PowerPoint';
        document.getElementById('officePreview').innerHTML =
          '<p class="text-muted mb-0">Preview not supported for .' + ext + ' — use <strong>Open</strong>.</p>';
        return;
      }

      if (ext === 'csv' && window.tagBrowser.readTextFile && officeBlock) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const sz = rowSizeBytes(targetRow);
        if (sz != null && sz > TEXT_PREVIEW_MAX_BYTES) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'CSV preview: file too large (max ~2 MB same as text). Use Open.';
          return;
        }
        const rCsv = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!rCsv.ok) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'CSV: ' + (rCsv.error || 'Could not load.');
          return;
        }
        officeBlock.classList.remove('d-none');
        document.getElementById('officeTitle').textContent = 'CSV';
        const prev = document.getElementById('officePreview');
        try {
          const rows = parseCsvRows(rCsv.text);
          prev.innerHTML = csvPreviewTableHtml(rows, EXCEL_PREVIEW_MAX_ROWS);
        } catch (e) {
          prev.innerHTML = '<p class="text-danger small">' + escapeHtmlForPreview(String(e.message || e)) + '</p>';
        }
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

    /** Folder doc + .md/.txt viewer: editor hidden until Edit or double-click preview (same chrome for both). */
    function resetViewerDocEditorChrome() {
      for (const which of ['readme', 'mdFile']) {
        const wrapId = which === 'readme' ? 'readmeEditorWrap' : 'mdFileEditorWrap';
        const btnId = which === 'readme' ? 'btnReadmeEdit' : 'btnMdFileEdit';
        document.getElementById(wrapId)?.classList.add('d-none');
        const b = document.getElementById(btnId);
        if (b) {
          b.textContent = 'Edit';
          b.setAttribute('aria-expanded', 'false');
        }
      }
    }

    function setViewerDocEditorOpen(which, open) {
      const wrapId = which === 'readme' ? 'readmeEditorWrap' : 'mdFileEditorWrap';
      const edId = which === 'readme' ? 'readmeEditor' : 'mdFileEditor';
      const prevId = which === 'readme' ? 'readmePreview' : 'mdFilePreview';
      const btnId = which === 'readme' ? 'btnReadmeEdit' : 'btnMdFileEdit';
      const wrap = document.getElementById(wrapId);
      const ed = document.getElementById(edId);
      const prev = document.getElementById(prevId);
      const btn = document.getElementById(btnId);
      if (!wrap || !ed || !prev) return;
      const show = !!open;
      if (!show && which === 'mdFile') void flushMdFileAutosave();
      wrap.classList.toggle('d-none', !show);
      if (btn) {
        btn.textContent = show ? 'Done' : 'Edit';
        btn.setAttribute('aria-expanded', show ? 'true' : 'false');
      }
      if (!show) {
        prev.innerHTML = mdPreviewHtml(ed.value);
        if (which === 'readme') syncReadmePreviewChrome({ pulse: false });
      }
      if (show) {
        requestAnimationFrame(() => {
          ed.focus();
          try {
            ed.setSelectionRange(ed.value.length, ed.value.length);
          } catch (_) {}
        });
      }
    }

    function toggleViewerDocEditor(which) {
      const wrapId = which === 'readme' ? 'readmeEditorWrap' : 'mdFileEditorWrap';
      const wrap = document.getElementById(wrapId);
      if (!wrap) return;
      const willOpen = wrap.classList.contains('d-none');
      setViewerDocEditorOpen(which, willOpen);
    }

    /** Folder row / current folder: first match among FOLDER_VIEWER_DOC_NAMES in main; else empty editor → Save creates readme.md. */
    async function loadReadmeForFolder(folderPath) {
      const readmeBlock = document.getElementById('readmeBlock');
      const sep = folderPath.includes('/') ? '/' : '\\';
      const readmeOnlyPath = folderPath.replace(/[/\\]+$/, '') + sep + 'readme.md';

      const ed = document.getElementById('readmeEditor');
      const titleEl = document.getElementById('readmeFolderDocTitle');
      const kTarget = pathKeyLoose(folderPath);
      /* New folder vs last loaded: clear immediately so scope/selection changes never keep the previous readme text. */
      if (lastReadmeFolderPathLoose && kTarget !== lastReadmeFolderPathLoose) {
        ed.value = '';
        document.getElementById('readmePreview').innerHTML = mdPreviewHtml('');
        syncReadmePreviewChrome({ pulse: false });
        if (titleEl) titleEl.textContent = 'Folder doc';
        activeReadmePath = null;
      }

      const pick = await window.tagBrowser.resolveFolderViewerDoc({ folderPath });
      if (!propsViewStill(folderPath)) return;

      readmeBlock.classList.remove('d-none');

      const readmeWrap = document.getElementById('readmeEditorWrap');
      const sameFolderDocEditing =
        readmeWrap &&
        !readmeWrap.classList.contains('d-none') &&
        lastReadmeFolderPathLoose &&
        kTarget === lastReadmeFolderPathLoose;
      if (sameFolderDocEditing) {
        document.getElementById('readmePreview').innerHTML = mdPreviewHtml(ed.value);
        syncReadmePreviewChrome({ pulse: false });
        return;
      }

      if (!pick.ok) {
        activeReadmePath = null;
        if (titleEl) titleEl.textContent = 'Folder doc';
        ed.value = '/* read error: ' + (pick.error || '') + ' */';
        document.getElementById('readmePreview').innerHTML = mdPreviewHtml(ed.value);
        syncReadmePreviewChrome({ pulse: true });
        lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
        resetViewerDocEditorChrome();
        return;
      }

      const docPath = pick.fullPath;
      if (!docPath) {
        activeReadmePath = readmeOnlyPath;
        if (titleEl) titleEl.textContent = 'readme.md (folder)';
        ed.value = '';
        document.getElementById('readmePreview').innerHTML = mdPreviewHtml(ed.value);
        syncReadmePreviewChrome({ pulse: true });
        lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
        resetViewerDocEditorChrome();
        return;
      }

      activeReadmePath = docPath;
      if (titleEl) titleEl.textContent = segmentPretty(T.baseName(docPath)) + ' (folder)';

      const r = await window.tagBrowser.readTextFile({ fullPath: docPath });
      if (!propsViewStill(folderPath)) return;

      if (r.ok) {
        ed.value = r.text;
      } else if (r.code === 'ENOENT') {
        ed.value = '';
      } else {
        ed.value = '/* read error: ' + (r.error || '') + ' */';
      }
      document.getElementById('readmePreview').innerHTML = mdPreviewHtml(ed.value);
      syncReadmePreviewChrome({ pulse: true });
      lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
      resetViewerDocEditorChrome();
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

    /**
     * When Match path is off, wrap free-text in nopath:<…> so terms don’t match parent segments unless intended.
     * If Match path is on, the HTTP layer searches paths; Everything’s nopath: skips that when already matching path.
     */
    function filenameOnlyUserQueryForScopedSearch(qRaw) {
      const raw = String(qRaw || '').trim();
      if (!raw) return raw;
      if (document.getElementById('optPath').checked) return raw;
      if (/^nopath:/i.test(raw)) return raw;
      if (/<|>/.test(raw)) return raw;
      return 'nopath:<' + raw + '>';
    }

    /** One normalized folder → Everything token: recursive quoted tree or non-recursive parent:. */
    function folderScopeEverythingToken(normPath, recursive) {
      const p = normalizeFolderPathForEverything(normPath).replace(/[/\\]+$/, '');
      if (!p) return '';
      if (recursive) {
        const root = p + '\\';
        return '"' + root.replace(/"/g, '') + '"';
      }
      return 'parent:"' + p.replace(/"/g, '') + '"';
    }

    /** OR-group for multiple roots; mirrors tag-bar `< a | b >` style. */
    function combineFolderScopeGroup(normPaths, recursive) {
      const norms = (normPaths || [])
        .map((x) => normalizeFolderPathForEverything(String(x || '').trim()).replace(/[/\\]+$/, ''))
        .filter(Boolean);
      if (!norms.length) return '';
      if (norms.length === 1) return folderScopeEverythingToken(norms[0], recursive);
      const inner = norms.map((p) => folderScopeEverythingToken(p, recursive)).filter(Boolean).join(' | ');
      return inner ? '< ' + inner + ' >' : '';
    }

    /**
     * Settings ceilings (OR) + current-folder breadcrumb (AND) + user query for Everything HTTP.
     * ceilingNorms: 0–1 folder from Settings scope max; breadcrumbRaw: #rootFolder.
     */
    function composeScopedEverythingSearch(ceilingNorms, breadcrumbRaw, userQuery, recursive) {
      const ceil = combineFolderScopeGroup(Array.isArray(ceilingNorms) ? ceilingNorms : [], recursive);
      const breadNorm = normalizeFolderPathForEverything(String(breadcrumbRaw || '').trim()).replace(/[/\\]+$/, '');
      const slice = breadNorm ? combineFolderScopeGroup([breadNorm], recursive) : '';
      const pathCombo = [ceil, slice].filter(Boolean).join(' ');
      const qRaw = (userQuery || '').trim();
      if (!pathCombo) return qRaw;
      const q = filenameOnlyUserQueryForScopedSearch(qRaw);
      return q ? pathCombo + ' ' + q : pathCombo;
    }

    /** All descendants under norm (quoted subtree, same as runSearch), intersect scope ceiling. Not parent: (immediate only). */
    function everythingSearchTextForFolderChildCount(normFolderRaw) {
      const norm = normalizeFolderPathForEverything(String(normFolderRaw || '').trim());
      if (!norm) return '';
      const ceil = combineFolderScopeGroup(getSearchScopeCeilingFoldersNorms(), true).trim();
      const treeTok = folderScopeEverythingToken(norm, true).trim();
      let t = [ceil, treeTok].filter(Boolean).join(' ').trim();
      if (isFoldersOnly()) t += ' folder:';
      else if (isFilesOnly()) t += ' file:';
      return t.trim();
    }

    function folderChildCountCacheKey(normFolderRaw) {
      const norm = normalizeFolderPathForEverything(String(normFolderRaw || '').trim());
      if (!norm) return '';
      return pathNormKey(norm) + '\0' + everythingSearchTextForFolderChildCount(norm);
    }

    /** Folder row: exact (n); capped (100+) — pill only when narrowed (Smart); full subs+all → plain muted text. */
    function syncFolderChildCountSpanDisplay(span, out) {
      if (!span) return;
      span.classList.remove('folder-child-count-over');
      span.removeAttribute('title');
      if (!out || !out.kind) {
        span.textContent = '';
        return;
      }
      if (out.kind === 'over') {
        const fullListUi = isShowSubfolders() && isAllContent();
        if (!fullListUi) span.classList.add('folder-child-count-over');
        span.textContent = '(' + String(out.cap) + '+)';
        span.title = 'More than ' + String(out.cap) + ' items under this folder (cap).';
        return;
      }
      span.textContent = '(' + String(out.n) + ')';
    }

    /** Everything: up to N+1 rows under folder subtree; exclude the folder row itself if returned; cache by path + query. */
    async function fetchFolderDescendantCountBounded(normFolderRaw) {
      const norm = normalizeFolderPathForEverything(String(normFolderRaw || '').trim());
      if (!norm || !window.tagBrowser || typeof window.tagBrowser.search !== 'function') return null;
      const ck = folderChildCountCacheKey(norm);
      if (ck && folderChildCountCache.has(ck)) return folderChildCountCache.get(ck);
      const searchText = everythingSearchTextForFolderChildCount(norm);
      if (!searchText) return null;
      const baseUrl = document.getElementById('baseUrl').value.trim() || 'http://127.0.0.1';
      const httpUser = document.getElementById('httpUser').value;
      const httpPassword = document.getElementById('httpPassword').value;
      const want = FOLDER_CHILD_COUNT_MAX + 1;
      const options = { ...everythingOptionsForRequest(), pathSearch: true, offset: 0 };
      const res = await window.tagBrowser.search({
        baseUrl,
        searchText,
        count: String(want),
        httpUser,
        httpPassword,
        options,
      });
      if (!res || !res.ok) return null;
      let rows = Array.isArray(res.rows) ? res.rows : [];
      const normKey = pathNormKey(norm);
      rows = rows.filter((r) => {
        const fp = fullPathForRow(r);
        if (!fp) return false;
        if (pathNormKey(fp) === normKey) return false;
        return pathIsUnderOrEqualFolder(normalizeFolderPathForEverything(fp), norm);
      });
      const n = rows.length;
      const out = n > FOLDER_CHILD_COUNT_MAX ? { kind: 'over', cap: FOLDER_CHILD_COUNT_MAX } : { kind: 'exact', n };
      if (ck) {
        if (folderChildCountCache.size > 400) folderChildCountCache.clear();
        folderChildCountCache.set(ck, out);
      }
      return out;
    }

    /** Visible folder rows only; async serial; bump folderChildCountRunSeq on each table rebuild. */
    function scheduleFolderChildCountsForVisibleResultsRows() {
      folderChildCountRunSeq++;
      const runId = folderChildCountRunSeq;
      const tbody = document.getElementById('tbody');
      if (!tbody) return;
      requestAnimationFrame(() => {
        if (runId !== folderChildCountRunSeq) return;
        const tasks = [];
        const seen = new Set();
        for (const tr of tbody.querySelectorAll('tr.results-folder-row')) {
          if (tr.classList.contains('results-tree-collapse-hidden')) continue;
          const fp = tr.dataset.rowPath;
          if (!fp) continue;
          const norm = normalizeFolderPathForEverything(fp);
          const k = pathNormKey(norm);
          if (seen.has(k)) continue;
          seen.add(k);
          const span = tr.querySelector('.folder-child-count');
          if (!span) continue;
          tasks.push({ tr, norm, span });
        }
        void (async () => {
          for (const { tr, norm, span } of tasks) {
            if (runId !== folderChildCountRunSeq) return;
            if (!document.body.contains(tr)) continue;
            const ck = folderChildCountCacheKey(norm);
            const cached = ck ? folderChildCountCache.get(ck) : null;
            if (cached) {
              syncFolderChildCountSpanDisplay(span, cached);
              continue;
            }
            span.classList.remove('folder-child-count-over');
            span.removeAttribute('title');
            span.textContent = '\u2026';
            const out = await fetchFolderDescendantCountBounded(norm);
            if (runId !== folderChildCountRunSeq) return;
            if (!document.body.contains(tr)) continue;
            syncFolderChildCountSpanDisplay(span, out);
          }
        })();
      });
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
      searchDebugLog('tagDiscovery.rowsPipe', {
        rawLen: rawRows.length,
        sampleRaw: rawRows.slice(0, 3).map(searchDebugTagRowDigest),
      });
      tagDiscoveryRows = rawRows;
      if (rawRows.length) tagDiscoveryRowsLastGood = rawRows;
      absorbKnownBracketTagsFromScanRows(rawRows);
      searchDebugLog('tagDiscovery.afterAbsorb', { knownBracketTagsListLen: knownBracketTagsList.length });
      let fullScanActiveChanged = false;
      if (pruneDeadRemembered) {
        const countsFromDisc =
          rawRows.length > 0 ? T.aggregateTagCountsFromRows(rawRows, fullPathForRow) : new Map();
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
          const n = rawRows.length;
          const extra =
            storeChanged || knownChanged || fullScanActiveChanged ? ' Dropped tags not in this scan.' : '';
          statusEl.textContent = 'Tag scan: ' + n + ' path(s) with [(…)] tag block (full index).' + extra;
        }
      }
      renderTagBar();
      if (pruneDeadRemembered && fullScanActiveChanged) renderTable();
    }

    /** pruneDeadRemembered true = “Rescan all tags”. false = awaitable. */
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
      return '(?i)\\[\\((?:[^,)]*,)*' + esc + '(?:,[^)]*)?\\)\\][^\\\\]*$';
    }

    /** Narrow Everything: AND (space) or OR (|) of regex: clauses per active tag. */
    function appendActiveTagToEverythingQuery(searchText) {
      if (!activeTagKeys.size) return searchText;
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

    /** Collapse .shortcut-targets-by-id\<ID> pair in a display path to … (keeps the real folder name that follows). */
    function collapseGDriveShortcutDisplay(str) {
      return String(str || '').replace(/([/\\])\.shortcut-targets-by-id[/\\][^/\\]+/gi, '$1\u2026');
    }

    /** Cache: GDrive shortcut ID full path → resolved child folder name (or null). Persisted in localStorage. */
    const gdriveShortcutNameCache = new Map();
    try {
      const raw = localStorage.getItem(LS.gdriveShortcutNames);
      console.log('[GDrive cache] hydrate from localStorage:', raw ? raw.slice(0, 200) : '(empty)');
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) gdriveShortcutNameCache.set(k, v);
    } catch (_) {}

    function persistGDriveShortcutNameCache() {
      try {
        const obj = {};
        for (const [k, v] of gdriveShortcutNameCache) if (typeof v === 'string') obj[k] = v;
        const json = JSON.stringify(obj);
        localStorage.setItem(LS.gdriveShortcutNames, json);
        console.log('[GDrive cache] persisted', Object.keys(obj).length, 'entries');
      } catch (e) { console.warn('[GDrive cache] persist failed:', e); }
    }

    /** True when a row's parent path ends with .shortcut-targets-by-id (i.e. row name is an opaque ID). */
    function isGDriveShortcutIdRow(row) {
      const segs = String(row.path || '').replace(/[/\\]+$/, '').split(/[/\\]/);
      return segs.length > 0 && isGoogleDriveShortcutTargetsSegment(segs[segs.length - 1]);
    }

    /** Resolve a GDrive shortcut ID folder to its single child name; caches result. Returns name or null. */
    async function resolveGDriveShortcutName(idFolderFullPath) {
      const key = idFolderFullPath.replace(/[/\\]+$/, '').toLowerCase();
      if (gdriveShortcutNameCache.has(key)) {
        const v = gdriveShortcutNameCache.get(key);
        if (typeof v === 'string' || v === null) return v;
        return v;
      }
      if (!window.tagBrowser || !window.tagBrowser.listChildFolders) return null;
      const p = window.tagBrowser.listChildFolders({ parentPath: idFolderFullPath }).then((r) => {
        const name = r && r.ok && r.folders && r.folders.length === 1 ? r.folders[0].name : null;
        gdriveShortcutNameCache.set(key, name);
        persistGDriveShortcutNameCache();
        return name;
      });
      gdriveShortcutNameCache.set(key, p);
      return p;
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
     */
    function appendRecencyToEverythingQuery(searchText) {
      if (recencyFilterMode() === 'all') return searchText;
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

    const SIZE_HEAT_GB = 1024 * 1024 * 1024;
    const SIZE_HEAT_MB100 = 100 * 1024 * 1024;
    const SIZE_HEAT_MB10 = 10 * 1024 * 1024;
    const SIZE_HEAT_MB1 = 1024 * 1024;
    const SIZE_HEAT_KB100 = 100 * 1024;

    const SIZE_HEAT_CLASSES = [
      'tagfox-size-heat-orange',
      'tagfox-size-heat-amber',
      'tagfox-size-heat-mb1',
      'tagfox-size-heat-kb100',
    ];

    /** Size column / props: accent by magnitude (Everything gives size for many folder rows too; synthetic tree folders stay —). */
    function applySizeHeatToElement(el, row) {
      if (!el) return;
      el.classList.remove('text-danger', 'fw-semibold', ...SIZE_HEAT_CLASSES);
      const n = rowSizeBytes(row);
      if (n == null) return;
      if (n >= SIZE_HEAT_GB) el.classList.add('text-danger', 'fw-semibold');
      else if (n >= SIZE_HEAT_MB100) el.classList.add('tagfox-size-heat-orange');
      else if (n >= SIZE_HEAT_MB10) el.classList.add('tagfox-size-heat-amber');
      else if (n >= SIZE_HEAT_MB1) el.classList.add('tagfox-size-heat-mb1');
      else if (n >= SIZE_HEAT_KB100) el.classList.add('tagfox-size-heat-kb100');
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

    const RECENCY_MS_HOUR = 3600000;
    const RECENCY_MS_DAY = 86400000;

    /** CSS class for the row blob: same buckets as 1h / 1d / 1w / 1m / 1y toolbar filter. */
    function recencyBlobClassForRow(row) {
      const ms = modifiedTimeMs(row);
      if (ms == null) return 'recency-blob recency-blob--unknown';
      const age = Date.now() - ms;
      if (age < 0) return 'recency-blob recency-blob--h1';
      if (age <= RECENCY_MS_HOUR) return 'recency-blob recency-blob--h1';
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
      if (m === '1h') return Date.now() - RECENCY_MS_HOUR;
      if (m === '1d') return Date.now() - RECENCY_MS_DAY;
      if (m === '1w') return Date.now() - 7 * RECENCY_MS_DAY;
      if (m === '1m') return Date.now() - 30 * RECENCY_MS_DAY;
      if (m === '1y') return Date.now() - 365 * RECENCY_MS_DAY;
      return null;
    }

    /** Same as pathKeyLoose — one normal form so Everything rows (often `/`) match IPC/rename paths (`\\`). */
    function pathNormKey(fp) {
      return pathKeyLoose(fp);
    }

    /** Natural full-path sort key: separator replaced with \x00 so children always follow their parent (e.g. abc\file < abc2). */
    function pathSortKey(row) {
      return pathNormKey(fullPathForRow(row)).replace(/[/\\]/g, '\x00');
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
          document.getElementById('status').textContent = 'Set the current folder (breadcrumb or path editor) to drop into the list.';
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

    /**
     * Rotated Shelf strip sizing.
     * rot.style.minWidth = parent height: pre-rot width fills screen vertical after -90deg.
     * aside.style.width  = br.width: post-rot width = pre-rot HEIGHT (content rows, thin).
     */
    function syncShelfAsideWidth() {
      const aside = document.getElementById('appShelf');
      const rot = aside?.querySelector?.('.app-shelf-rot');
      if (!aside || !rot) return;
      // Same geometry empty or with chips: pre-rot minWidth = column height so -90° strip fills the shelf; then aside width from AABB.
      rot.style.minWidth = '';
      const parent = aside.closest('.results-with-shelf') || aside.parentElement;
      const h = parent ? parent.clientHeight : 0;
      if (h > 48) rot.style.minWidth = h + 'px';
      const br = rot.getBoundingClientRect();
      aside.style.width = Math.max(48, Math.ceil(br.width)) + 'px';
    }

    function scheduleSyncShelfAsideWidth() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncShelfAsideWidth();
        });
      });
    }

    /** One Shelf chip: in-app paths drag, or hand / Alt+startDragFiles for Explorer (paths always an array). */
    function bindShelfChipDrag(chip, paths) {
      const list = Array.isArray(paths) ? paths.filter((p) => String(p || '').trim()) : [];
      chip.draggable = true;
      chip.addEventListener('dragstart', (e) => {
        if (!list.length) {
          e.preventDefault();
          return;
        }
        const wantOs = e.altKey || tagBrowserNextOsFileDrag;
        if (window.tagBrowser.startDragFiles && wantOs) {
          tagBrowserNextOsFileDrag = false;
          e.preventDefault();
          tagBrowserActiveNativeDragPaths = list.slice();
          window.tagBrowser.startDragFiles(list);
          return;
        }
        if (tagBrowserNextOsFileDrag) tagBrowserNextOsFileDrag = false;
        setDataTransferTagBrowserHtml5Paths(e.dataTransfer, list);
      });
    }

    async function renderShelf() {
      const zone = document.getElementById('shelfDropZone');
      const chips = document.getElementById('shelfChips');
      const hint = document.getElementById('shelfEmptyHint');
      if (!zone || !chips || !hint || !window.tagBrowser.shelfState) return;
      const r = await window.tagBrowser.shelfState();
      const shelfDropHelp =
        'Drop here (move; Shift+copy). Drag chips within TagFox, or use the hand button / Alt+drag to drag into Explorer.';
      zone.title = r.ok ? shelfDropHelp + ' Staging folder: ' + r.path : shelfDropHelp + ' ' + String(r.error || 'Shelf unavailable');
      chips.innerHTML = '';
      if (!r.ok || !r.entries.length) {
        hint.classList.remove('d-none');
        refreshTagFoxChromeTooltips(zone);
        scheduleSyncShelfAsideWidth();
        return;
      }
      hint.classList.add('d-none');
      const allPaths = r.entries.map((ent) => ent.fullPath);
      if (r.entries.length > 1) {
        const allChip = document.createElement('span');
        allChip.className = 'badge bg-primary shelf-chip shelf-chip-all align-middle';
        allChip.textContent = 'All';
        allChip.title =
          'All ' +
          r.entries.length +
          ' items on the Shelf — drag within TagFox; use hand button or Alt+drag to send to Explorer';
        bindShelfChipDrag(allChip, allPaths);
        chips.appendChild(allChip);
      }
      for (const ent of r.entries) {
        const chip = document.createElement('span');
        chip.className = 'badge bg-secondary shelf-chip align-middle';
        chip.textContent = ent.name;
        chip.title =
          ent.fullPath +
          (ent.isDirectory ? ' (folder)' : '') +
          ' — drag within TagFox; use hand button or Alt+drag to send to Explorer';
        bindShelfChipDrag(chip, [ent.fullPath]);
        chips.appendChild(chip);
      }
      refreshTagFoxChromeTooltips(zone);
      refreshTagFoxChromeTooltips(chips);
      scheduleSyncShelfAsideWidth();
    }

    function bindShelfDrop() {
      const aside = document.getElementById('appShelf');
      if (!aside || aside.dataset.shelfDropBound === '1') return;
      aside.dataset.shelfDropBound = '1';
      window.addEventListener('resize', syncShelfAsideWidth);

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
            if (r.ok) void refreshAfterDiskMutation();
          })();
        }, 40);
      });
    }

    function pruneCheckedPaths() {
      for (const k of [...checkedPathsMap.keys()]) {
        const row = lastRows.find((r) => pathNormKey(fullPathForRow(r)) === k);
        if (!row) checkedPathsMap.delete(k);
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

    /** Drop rows that still show a pre-rename path (stale index + slash mismatch); disk only has `to` after renamePath. */
    function pruneLastRowsRenamedSources(pairs) {
      if (!pairs || !pairs.length) return;
      const drop = new Set();
      for (const p of pairs) {
        const k = pathNormKey(String(p.from || '').trim());
        if (k) drop.add(k);
      }
      if (!drop.size) return;
      lastRows = lastRows.filter((r) => !drop.has(pathNormKey(fullPathForRow(r))));
    }

    /** Collapse duplicate rows same logical path (index lag / mixed slashes). */
    function dedupeLastRowsByPathKey() {
      const seen = new Set();
      const out = [];
      for (const row of lastRows) {
        const k = pathNormKey(fullPathForRow(row));
        if (!k) {
          out.push(row);
          continue;
        }
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(row);
      }
      lastRows = out;
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
      return byPath();
    }

    function sortRowsForDisplay(rows, col, asc) {
      if (!Array.isArray(rows) || !rows.length) return;
      rows.sort((a, b) => compareRowsBySort(a, b, col, asc));
    }

    /** Client-side re-sort: always when force; else path (full-path string order) only. */
    function sortLastRowsForDisplay(force) {
      if (!lastRows.length) return;
      if (!force && sortColumn !== 'path') return;
      const before = lastRows.length;
      sortRowsForDisplay(lastRows, sortColumn, sortAsc);
      searchDebugLog('sortLastRowsForDisplay', {
        force: !!force,
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

    /** Path segments for Hide special / Hide ~ checks (split + normalize slashes). */
    function pathSegmentsForLocalFilters(fp) {
      const raw = String(fp || '').trim();
      if (!raw) return [];
      return raw.replace(/\//g, '\\').split('\\').filter((p) => p !== '' && p !== '.');
    }

    /** True if any segment is desktop.ini, starts with . (not ..; .shortcut-targets-by-id kept) or $; .. ignored. No ~ (see pathUnderTildeSegment). */
    function pathUnderHideSpecialSegments(fp) {
      for (const seg of pathSegmentsForLocalFilters(fp)) {
        if (seg === '..') continue;
        if (isGoogleDriveShortcutTargetsSegment(seg)) continue;
        if (seg.toLowerCase() === 'desktop.ini') return true;
        if (seg.startsWith('.') || seg.startsWith('$')) return true;
      }
      return false;
    }

    /** True if any segment starts with ~ (e.g. profile junctions). */
    function pathUnderTildeSegment(fp) {
      for (const seg of pathSegmentsForLocalFilters(fp)) {
        if (seg === '..') continue;
        if (seg.startsWith('~')) return true;
      }
      return false;
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

    function recencyFilterMode() {
      const el = document.querySelector('input[name="tagFoxRecencyFilter"]:checked');
      const v = el && el.value;
      return v && ['all', '1h', '1d', '1w', '1m', '1y'].includes(v) ? v : 'all';
    }

    function setRecencyFilterMode(mode) {
      const id =
        {
          all: 'optRecencyAll',
          '1h': 'optRecency1h',
          '1d': 'optRecency1d',
          '1w': 'optRecency1w',
          '1m': 'optRecency1m',
          '1y': 'optRecency1y',
        }[mode] || 'optRecencyAll';
      const r = document.getElementById(id);
      if (!r || r.name !== 'tagFoxRecencyFilter') return;
      r.checked = true;
    }

    /** Settings → global shortcut capture: require modifiers (Electron globalShortcut). */
    let globalToggleRecording = false;

    /** Map a keydown on the hotkey field to an Electron accelerator string, or null if incomplete / invalid. */
    function acceleratorFromKeydown(ev) {
      if (!ev || ev.key === 'Escape') return null;
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(ev.key)) return null;
      const parts = [];
      if (ev.ctrlKey) parts.push('Control');
      if (ev.metaKey) parts.push('Command');
      if (ev.altKey) parts.push('Alt');
      if (ev.shiftKey) parts.push('Shift');
      if (!parts.length) return null;
      const code = ev.code || '';
      let keyPart = '';
      if (code === 'Space') keyPart = 'Space';
      else if (/^Key[A-Z]$/.test(code)) keyPart = code.slice(3);
      else if (/^Digit(\d)$/.test(code)) keyPart = code.slice(5);
      else if (/^F(1[0-9]|2[0-4]|[1-9])$/.test(code)) keyPart = code;
      else if (code === 'Enter' || code === 'NumpadEnter') keyPart = 'Return';
      else {
        const byCode = {
          Tab: 'Tab',
          Minus: '-',
          Equal: '=',
          BracketLeft: '[',
          BracketRight: ']',
          Backslash: '\\',
          Semicolon: ';',
          Quote: "'",
          Comma: ',',
          Period: '.',
          Slash: '/',
          Backquote: '`',
          IntlBackslash: '\\',
          ArrowUp: 'Up',
          ArrowDown: 'Down',
          ArrowLeft: 'Left',
          ArrowRight: 'Right',
        };
        keyPart = byCode[code] || '';
      }
      if (!keyPart) return null;
      parts.push(keyPart);
      return parts.join('+');
    }

    async function refreshGlobalToggleHotkeyFromMain() {
      const inp = document.getElementById('globalToggleHotkeyDisplay');
      if (!inp || !window.tagBrowser || typeof window.tagBrowser.globalToggleGet !== 'function') return;
      try {
        const r = await window.tagBrowser.globalToggleGet();
        if (r && r.accelerator) inp.value = r.accelerator;
      } catch (_) {}
    }

    function setGlobalToggleRecording(on) {
      globalToggleRecording = !!on;
      const inp = document.getElementById('globalToggleHotkeyDisplay');
      const btn = document.getElementById('btnRecordGlobalToggleHotkey');
      if (btn) {
        btn.textContent = on ? 'Cancel' : 'Record…';
        btn.classList.toggle('btn-danger', on);
        btn.classList.toggle('btn-outline-secondary', !on);
      }
      if (inp) {
        if (on) {
          inp.value = 'Press a key combination…';
          inp.classList.add('border-primary');
          requestAnimationFrame(() => inp.focus());
        } else inp.classList.remove('border-primary');
      }
      if (!on) void refreshGlobalToggleHotkeyFromMain();
    }

    function loadSettings() {
      migrateLocalStorageFromLegacy();
      loadTagStore();
      loadKnownBracketTags();
      document.getElementById('baseUrl').value =
        localStorage.getItem(LS.baseUrl) || 'http://127.0.0.1';
      document.getElementById('rootFolder').value = localStorage.getItem(LS.rootFolder) || '';
      loadSearchScopeMaxFromStorage();
      renderSearchScopeMaxUi();
      syncSearchScopeRootsTipVisibility();
      clampRootFolderUnderSearchScopeMax();
      document.getElementById('maxResults').value =
        localStorage.getItem(LS.maxResults) || '200';
      document.getElementById('httpUser').value = localStorage.getItem(LS.httpUser) || '';
      document.getElementById('optCase').checked = localStorage.getItem(LS.optCase) === '1';
      document.getElementById('optWholeWord').checked = localStorage.getItem(LS.optWholeWord) === '1';
      document.getElementById('optPath').checked = localStorage.getItem(LS.optPath) === '1';
      document.getElementById('optDiacritics').checked = localStorage.getItem(LS.optDiacritics) === '1';
      document.getElementById('optHideSpecial').checked = localStorage.getItem(LS.optHideSpecial) === '1';
      document.getElementById('optHideTilde').checked = localStorage.getItem(LS.optHideTilde) === '1';
      syncAdvancedBtnWarning();
      {
        const showSubs = localStorage.getItem(LS.showSubfolders) !== '0';
        let layout = localStorage.getItem(LS.resultsLayout);
        if (!['tree', 'smart', 'flat'].includes(layout)) {
          const hasFlatKey = localStorage.getItem(LS.flatView) !== null;
          if (hasFlatKey) {
            layout = localStorage.getItem(LS.flatView) === '1' ? 'flat' : 'smart';
          } else {
            let mode = localStorage.getItem(LS.resultsViewMode);
            if (!mode || !['flat', 'tree1', 'treeBrowse', 'treeFull'].includes(mode)) {
              const tv = localStorage.getItem(LS.treeView);
              mode = tv === '1' ? 'treeBrowse' : 'flat';
            }
            layout = mode === 'flat' ? 'flat' : 'smart';
          }
          localStorage.setItem(LS.resultsLayout, layout);
        }
        let content = localStorage.getItem(LS.resultsContent);
        if (!['all', 'folders', 'files'].includes(content)) {
          content = localStorage.getItem(LS.hideFiles) === '1' ? 'folders' : 'all';
          localStorage.setItem(LS.resultsContent, content);
        }
        setResultsViewRadios(layout, showSubs, content);
      }
      {
        const rf = localStorage.getItem(LS.recencyFilter);
        setRecencyFilterMode(['all', '1h', '1d', '1w', '1m', '1y'].includes(rf) ? rf : 'all');
      }
      sortColumn = localStorage.getItem(LS.sortBy) || 'name';
      if (sortColumn === 'ext') sortColumn = 'name';
      if (!['name', 'path', 'date_modified', 'size'].includes(sortColumn)) sortColumn = 'name';
      sortAsc = localStorage.getItem(LS.optAsc) !== '0';
      applyNaturalSortWhenTreeViewOn();
      document.getElementById('optTreeFolding').checked = localStorage.getItem(LS.treeFolding) !== '0';
      document.getElementById('optTreeGroupHL').checked = localStorage.getItem(LS.treeGroupHighlight) !== '0';
      document.getElementById('optSearchDebug').checked = localStorage.getItem(LS.searchDebug) === '1';
      {
        collapsedFolderPaths.clear();
        try {
          const arr = JSON.parse(localStorage.getItem(LS.collapsedFolders) || '[]');
          if (Array.isArray(arr)) for (const p of arr) collapsedFolderPaths.add(p);
        } catch (_) { /* ignore bad JSON */ }
      }
      activeTagKeys = activeTagKeysFromStored(localStorage.getItem(LS.activeTagFilter));
      tagFilterCombineOr = localStorage.getItem(LS.tagFilterCombineOr) === '1';
      applyTagPrefsFromUserDataFile();
      for (const t of tagStoreOrder) ensureKnownBracketTag(t.key, t.display);
      searchDebugLog('tags.loadSettings.tail', {
        knownLen: knownBracketTagsList.length,
        tagStoreLen: tagStoreOrder.length,
      });
      {
        const sel = document.getElementById('autoRefreshSec');
        if (sel) {
          const allowed = new Set(['0', '3', '5', '10', '30']);
          const v = localStorage.getItem(LS.autoRefreshSec);
          sel.value = allowed.has(String(v)) ? String(v) : '0';
        }
      }
      syncAutoRefreshTimer();
      searchDebugRender();
      void refreshGlobalToggleHotkeyFromMain();
    }

    function saveSettings() {
      localStorage.setItem(LS.baseUrl, document.getElementById('baseUrl').value.trim());
      localStorage.setItem(LS.rootFolder, document.getElementById('rootFolder').value.trim());
      localStorage.setItem(LS.maxResults, document.getElementById('maxResults').value.trim());
      {
        const sel = document.getElementById('autoRefreshSec');
        localStorage.setItem(LS.autoRefreshSec, sel ? String(sel.value || '0') : '0');
      }
      localStorage.setItem(LS.httpUser, document.getElementById('httpUser').value.trim());
      localStorage.setItem(LS.optCase, document.getElementById('optCase').checked ? '1' : '0');
      localStorage.setItem(LS.optWholeWord, document.getElementById('optWholeWord').checked ? '1' : '0');
      localStorage.setItem(LS.optPath, document.getElementById('optPath').checked ? '1' : '0');
      localStorage.setItem(LS.optDiacritics, document.getElementById('optDiacritics').checked ? '1' : '0');
      localStorage.setItem(LS.optHideSpecial, document.getElementById('optHideSpecial').checked ? '1' : '0');
      localStorage.setItem(LS.optHideTilde, document.getElementById('optHideTilde').checked ? '1' : '0');
      localStorage.setItem(LS.resultsLayout, resultsLayoutFromUi());
      localStorage.setItem(LS.resultsContent, resultsContentMode());
      localStorage.setItem(LS.flatView, isFlatView() ? '1' : '0');
      localStorage.setItem(LS.showSubfolders, isShowSubfolders() ? '1' : '0');
      localStorage.setItem(LS.hideFiles, isFoldersOnly() ? '1' : '0');
      localStorage.setItem(LS.treeView, isFlatView() ? '0' : '1');
      localStorage.setItem(LS.recencyFilter, recencyFilterMode());
      localStorage.setItem(LS.sortBy, sortColumn);
      localStorage.setItem(LS.optAsc, sortAsc ? '1' : '0');
      localStorage.setItem(LS.treeFolding, document.getElementById('optTreeFolding').checked ? '1' : '0');
      localStorage.setItem(LS.treeGroupHighlight, document.getElementById('optTreeGroupHL').checked ? '1' : '0');
      localStorage.setItem(LS.searchDebug, document.getElementById('optSearchDebug').checked ? '1' : '0');
      localStorage.setItem(LS.tagFilterCombineOr, tagFilterCombineOr ? '1' : '0');
      localStorage.setItem(LS.collapsedFolders, JSON.stringify([...collapsedFolderPaths]));
      persistActiveTagFilter();
      persistSearchScopeMax();
    }

    function searchOptionsFromUI() {
      return {
        case: document.getElementById('optCase').checked,
        wholeword: document.getElementById('optWholeWord').checked,
        pathSearch: document.getElementById('optPath').checked,
        regex: false,
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
      return searchOptionsFromUI();
    }

    function serializeSearchState() {
      const advPanel = document.getElementById('searchOptsAdvancedPanel');
      return {
        query: document.getElementById('query').value,
        rootFolder: document.getElementById('rootFolder').value,
        searchScopeMax: getSearchScopeMaxFolderNorm(),
        activeTagKeys: [...activeTagKeys].sort(),
        tagFilterCombineOr: !!tagFilterCombineOr,
        flatView: isFlatView(),
        smartView: isSmartView(),
        resultsLayout: resultsLayoutFromUi(),
        resultsContent: resultsContentMode(),
        showSubfolders: isShowSubfolders(),
        hideFiles: isFoldersOnly(),
        optCase: document.getElementById('optCase').checked,
        optWholeWord: document.getElementById('optWholeWord').checked,
        optPath: document.getElementById('optPath').checked,
        optDiacritics: document.getElementById('optDiacritics').checked,
        optHideSpecial: document.getElementById('optHideSpecial').checked,
        optHideTilde: document.getElementById('optHideTilde').checked,
        recencyFilter: recencyFilterMode(),
        sortColumn: sortColumn,
        sortAsc: sortAsc,
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
      syncQueryFilledChrome();
      document.getElementById('rootFolder').value = s.rootFolder != null ? String(s.rootFolder) : '';
      if (Object.prototype.hasOwnProperty.call(s, 'searchScopeMax')) {
        setSearchScopeMaxFolderFromString(s.searchScopeMax);
        renderSearchScopeMaxUi();
        syncSearchScopeRootsTipVisibility();
      } else if (Array.isArray(s.searchScopeCeilings) && s.searchScopeCeilings.length) {
        setSearchScopeMaxFolderFromString(s.searchScopeCeilings[0]);
        renderSearchScopeMaxUi();
        syncSearchScopeRootsTipVisibility();
      }
      clampRootFolderUnderSearchScopeMax();
      if (Array.isArray(s.activeTagKeys)) {
        activeTagKeys = new Set(s.activeTagKeys.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
      } else if (s.activeTagKey != null && String(s.activeTagKey).trim()) {
        activeTagKeys = new Set([String(s.activeTagKey).trim().toLowerCase()]);
      } else {
        activeTagKeys = new Set();
      }
      tagFilterCombineOr = !!s.tagFilterCombineOr;
      {
        if (s.resultsLayout && ['tree', 'smart', 'flat'].includes(s.resultsLayout)) {
          const rc =
            s.resultsContent && ['all', 'folders', 'files'].includes(s.resultsContent)
              ? s.resultsContent
              : s.hideFiles
                ? 'folders'
                : 'all';
          setResultsViewRadios(s.resultsLayout, s.showSubfolders !== false, rc);
        } else if (s.flatView !== undefined) {
          const layout = s.smartView ? 'smart' : s.flatView ? 'flat' : 'tree';
          const content = s.resultsContent && ['all', 'folders', 'files'].includes(s.resultsContent)
            ? s.resultsContent
            : s.hideFiles
              ? 'folders'
              : 'all';
          setResultsViewRadios(layout, s.showSubfolders !== false, content);
        } else if (s.resultsViewMode) {
          const m = s.resultsViewMode;
          const layout = m === 'flat' ? 'flat' : 'tree';
          const subs = m === 'flat' || m === 'treeFull';
          const content = m === 'treeBrowse' ? 'folders' : 'all';
          setResultsViewRadios(layout, subs, content);
        }
      }
      document.getElementById('optCase').checked = !!s.optCase;
      document.getElementById('optWholeWord').checked = !!s.optWholeWord;
      document.getElementById('optPath').checked = !!s.optPath;
      document.getElementById('optDiacritics').checked = !!s.optDiacritics;
      document.getElementById('optHideSpecial').checked = !!s.optHideSpecial;
      document.getElementById('optHideTilde').checked = !!s.optHideTilde;
      syncAdvancedBtnWarning();
      setRecencyFilterMode(
        s.recencyFilter && ['all', '1h', '1d', '1w', '1m', '1y'].includes(s.recencyFilter) ? s.recencyFilter : 'all'
      );
      let sc = s.sortColumn && String(s.sortColumn);
      if (sc === 'ext') sc = 'name';
      sortColumn = sc && ['name', 'path', 'date_modified', 'size'].includes(sc) ? sc : 'name';
      sortAsc = s.sortAsc !== false;
      applyNaturalSortWhenTreeViewOn();
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

    /** Folder glyph in Name column (Font Awesome). */
    function folderIconEl() {
      const holder = document.createElement('span');
      holder.className = 'folder-type-icon';
      holder.setAttribute('aria-label', 'Folder');
      holder.innerHTML = '<i class="fa-solid fa-folder fa-fw" aria-hidden="true"></i>';
      return holder;
    }

    /** FA class per file “kind” from extension map (plain file / lines / code / video). */
    const FILE_ICON_FA = {
      base: 'fa-file',
      text: 'fa-file-lines',
      code: 'fa-file-code',
      media: 'fa-file-video',
      pdf: 'fa-file-pdf',
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
      add(['pdf'], 'pdf', '#dc3545', 'PDF');
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

    function fileIconEl(ext) {
      const spec = FILE_ICON_BY_EXT.get(ext) || { kind: 'base', color: '#6c757d', label: ext ? '.' + ext : 'File' };
      const fa = FILE_ICON_FA[spec.kind] || FILE_ICON_FA.base;
      const iconWeight = spec.kind === 'pdf' ? 'fa-regular' : 'fa-solid';
      const holder = document.createElement('span');
      holder.className = 'file-type-icon';
      holder.style.color = spec.color;
      holder.setAttribute('aria-label', spec.label);
      holder.innerHTML = '<i class="' + iconWeight + ' ' + fa + ' fa-fw" aria-hidden="true"></i>';
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
      /* GDrive shortcut ID folder: show resolved child name (sync from cache, or async on first encounter). */
      if (rowIsFolder(row) && isGDriveShortcutIdRow(row)) {
        const cacheKey = fp.replace(/[/\\]+$/, '').toLowerCase();
        const cached = gdriveShortcutNameCache.get(cacheKey);
        console.log('[GDrive render]', { fp, cacheKey, cached: typeof cached === 'string' ? cached : '(miss)', cacheSize: gdriveShortcutNameCache.size });
        if (typeof cached === 'string') {
          title.textContent = '\u{1F517} ' + cached;
        } else {
          title.classList.add('text-muted');
          void resolveGDriveShortcutName(fp).then((name) => {
            if (!name) return;
            title.textContent = '\u{1F517} ' + name;
            title.classList.remove('text-muted');
          });
        }
      }
      lead.appendChild(title);
      wrap.appendChild(lead);
      /* Everything: lazy recursive descendant count on folder rows (scheduleFolderChildCountsForVisibleResultsRows). */
      if (rowIsFolder(row)) {
        const cc = document.createElement('span');
        cc.className = 'folder-child-count text-muted small flex-shrink-0 align-self-center';
        cc.textContent = '';
        wrap.appendChild(cc);
      }
      return wrap;
    }

    function filteredRows() {
      let rows = lastRows.slice();
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
        const recencyInEverything = recencyFilterMode() !== 'all';
        if (!recencyInEverything) {
          rows = rows.filter((r) => {
            if (treeRecencyDropRealFolderHits() && rowIsFolder(r)) return false;
            const ms = modifiedTimeMs(r);
            return ms != null && ms >= cut;
          });
        } else if (treeRecencyDropRealFolderHits()) {
          /* dm: already applied server-side — still strip folder rows so only file recency drives the tree. */
          rows = rows.filter((r) => !rowIsFolder(r));
        }
      }
      if (isHideSpecialPaths()) {
        rows = rows.filter((r) => !pathUnderHideSpecialSegments(fullPathForRow(r)));
      }
      if (isHideTildePaths()) {
        rows = rows.filter((r) => !pathUnderTildeSegment(fullPathForRow(r)));
      }
      return rows;
    }

    /** Visible rows in the table UI (includes synthetic folder rows in path-group mode). */
    function listRowsForUi() {
      return buildPathGroupedDisplayRows(filteredRows());
    }

    /** True when any Advanced toggle (case / path / whole-word / diacritics / hide special / hide ~) is checked. */
    function anyAdvancedSwitchOn() {
      return ['optCase', 'optWholeWord', 'optPath', 'optDiacritics', 'optHideSpecial', 'optHideTilde'].some(
        (id) => document.getElementById(id)?.checked
      );
    }

    /** Toggle warning color on the Advanced button when any switch is ON. */
    function syncAdvancedBtnWarning() {
      const btn = document.getElementById('btnToggleSearchOptsAdvanced');
      if (!btn) return;
      const on = anyAdvancedSwitchOn();
      btn.classList.toggle('btn-outline-secondary', !on);
      btn.classList.toggle('btn-outline-warning', on);
    }

    /** Pale indigo fill on #query when it has text (empty = default chrome). */
    function syncQueryFilledChrome() {
      const q = document.getElementById('query');
      if (!q) return;
      q.classList.toggle('tagfox-query-filled', !!String(q.value || '').trim());
    }

    /** Recency segmented control (search bar); target for zero-row pulse when a bucket other than All is active. */
    function recencyFilterGroupEl() {
      return document.querySelector('.tagfox-search-toolbar-row [aria-label="Recency"]');
    }

    /** View toggle labels for zero-row pulse hint. */
    function resultsViewPulseLabels() {
      return {
        showSubfolders: document.querySelector('label[for="optRvSubsOff"]'),
        foldersOnly: document.querySelector('label[for="optRvDirsOnly"]'),
        filesOnly: document.querySelector('label[for="optRvFilesOnly"]'),
      };
    }

    function clearEmptyResultsPulseHintClasses() {
      const qWrap = document.getElementById('queryInputGroup');
      qWrap?.classList.remove('pulse-hint', 'pulse-hint--sparse');
      qWrap?.style.removeProperty('--empty-pulse-frac');
      document.getElementById('query')?.classList.remove('pulse-hint', 'pulse-hint--sparse');
      const recencyGrp = recencyFilterGroupEl();
      recencyGrp?.classList.remove('pulse-hint', 'pulse-hint--sparse');
      recencyGrp?.style.removeProperty('--empty-pulse-frac');
      document.querySelectorAll('#tagBar button[data-tag-key]').forEach((b) => {
        b.classList.remove('pulse-hint', 'pulse-hint--sparse');
        b.style.removeProperty('--empty-pulse-frac');
      });
      const advBtn = document.getElementById('btnToggleSearchOptsAdvanced');
      advBtn?.classList.remove('pulse-hint', 'pulse-hint--sparse');
      advBtn?.style.removeProperty('--empty-pulse-frac');
      const rvLbl = resultsViewPulseLabels();
      [rvLbl.showSubfolders, rvLbl.foldersOnly, rvLbl.filesOnly].forEach((el) => {
        el?.classList.remove('pulse-hint', 'pulse-hint--sparse');
        el?.style.removeProperty('--empty-pulse-frac');
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
     * After scope folder navigation (breadcrumb, row, favourites, …), a non-empty search box still
     * filters the new listing — reuse the same #queryInputGroup pulse as sparse/empty hints (restartPulseHint).
     * Call only after the search + table refresh for this scope so updateEmptyResultsPulseHints (≥10 rows)
     * has already cleared classes; otherwise the pulse would be stripped immediately.
     */
    function pulseSearchBoxAfterScopeFolderChange() {
      const q = document.getElementById('query');
      const qWrap = document.getElementById('queryInputGroup');
      if (!q || !qWrap || !String(q.value || '').trim()) return;
      restartPulseHint(qWrap, true, 'empty', 0);
    }

    /**
     * Visible rows 0: full pulse on filters (non-empty query / active tags).
     * Visible 0 + recency ≠ All: also pulse the Recency control (client or Everything dm: filter may hide all rows).
     * Visible 0 + this-folder-only or subfolders-only layout: pulse that layout’s toolbar label (modes can hide all rows).
     * Visible 1–9: same targets, weaker pulse; strength (10−n)/10 → 0 at 10 rows (recency + layout labels not pulsed here).
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
      const recencyGrp = recencyFilterGroupEl();
      const recencyMode = recencyFilterMode();
      const advBtn = document.getElementById('btnToggleSearchOptsAdvanced');
      const qNonEmpty = !!(q && q.value && q.value.trim());
      const wantQ = inBand && qNonEmpty;
      const wantTag = inBand && activeTagKeys.size > 0;
      const wantRecency = isEmpty && recencyMode !== 'all';
      const wantAdv = inBand && anyAdvancedSwitchOn();
      const rvLbl = resultsViewPulseLabels();
      const wantRvFoldersOnly = isEmpty && isFoldersOnly();
      const wantRvFilesOnly = isEmpty && isFilesOnly();
      const wantRvShowSub = isEmpty && !isShowSubfolders();

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
        (isTreeViewOn() ? '1' : '0') +
        '\0' +
        (tagFilterCombineOr ? 'or' : 'and') +
        '\0' +
        recencyMode +
        '\0' +
        (isFlatView() ? 'F' : '') +
        (isSmartView() ? 'M' : '') +
        (isShowSubfolders() ? 'S' : '') +
        resultsContentMode()[0];
      const fpChanged = forceRestart || fp !== pulseHintFingerprint;
      if (fpChanged) pulseHintFingerprint = fp;

      if (fpChanged) {
        restartPulseHint(qWrap, wantQ, mode, sparseFrac);
        restartPulseHint(recencyGrp, wantRecency, mode, sparseFrac);
        restartPulseHint(advBtn, wantAdv, mode, sparseFrac);
        restartPulseHint(rvLbl.foldersOnly, wantRvFoldersOnly, mode, sparseFrac);
        restartPulseHint(rvLbl.filesOnly, wantRvFilesOnly, mode, sparseFrac);
        restartPulseHint(rvLbl.showSubfolders, wantRvShowSub, mode, sparseFrac);
        document.querySelectorAll('#tagBar button.tag-bar-pill-active[data-tag-key]').forEach((btn) => {
          restartPulseHint(btn, wantTag && activeTagKeys.has(btn.dataset.tagKey), mode, sparseFrac);
        });
        return;
      }

      qWrap?.classList.toggle('pulse-hint', wantQ);
      qWrap?.classList.toggle('pulse-hint--sparse', wantQ && mode === 'sparse');
      if (wantQ && mode === 'sparse') qWrap?.style.setProperty('--empty-pulse-frac', String(sparseFrac));
      else if (!wantQ || mode === 'empty') qWrap?.style.removeProperty('--empty-pulse-frac');

      recencyGrp?.classList.toggle('pulse-hint', wantRecency);
      recencyGrp?.classList.toggle('pulse-hint--sparse', wantRecency && mode === 'sparse');
      if (wantRecency && mode === 'sparse') recencyGrp?.style.setProperty('--empty-pulse-frac', String(sparseFrac));
      else if (!wantRecency || mode === 'empty') recencyGrp?.style.removeProperty('--empty-pulse-frac');

      advBtn?.classList.toggle('pulse-hint', wantAdv);
      advBtn?.classList.toggle('pulse-hint--sparse', wantAdv && mode === 'sparse');
      if (wantAdv && mode === 'sparse') advBtn?.style.setProperty('--empty-pulse-frac', String(sparseFrac));
      else if (!wantAdv || mode === 'empty') advBtn?.style.removeProperty('--empty-pulse-frac');

      const toggleRvPulse = (el, want) => {
        el?.classList.toggle('pulse-hint', want);
        el?.classList.toggle('pulse-hint--sparse', want && mode === 'sparse');
        if (want && mode === 'sparse') el?.style.setProperty('--empty-pulse-frac', String(sparseFrac));
        else if (!want || mode === 'empty') el?.style.removeProperty('--empty-pulse-frac');
      };
      toggleRvPulse(rvLbl.foldersOnly, wantRvFoldersOnly);
      toggleRvPulse(rvLbl.filesOnly, wantRvFilesOnly);
      toggleRvPulse(rvLbl.showSubfolders, wantRvShowSub);

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
      const faRescan15 = '<i class="fa-solid fa-arrows-rotate fa-fw" aria-hidden="true"></i>';
      const faClear15 = '<i class="fa-solid fa-xmark fa-fw" aria-hidden="true"></i>';
      const appendRescanAllTags = () => {
        const rescan = document.createElement('button');
        rescan.type = 'button';
        rescan.className = tagBarIconBtnClass;
        rescan.style.cssText = tagBarIconBtnSize;
        rescan.innerHTML = faRescan15;
        rescan.setAttribute('aria-label', 'Refresh search and rescan all tags');
        rescan.title =
          'Re-run the main Everything search, then a full-index [(…)] bracket-tag scan. Prunes remembered or active tag filters that do not appear in that scan. (Ordinary searches do not run this scan — use this when the tag bar is stale.)';
        rescan.addEventListener('click', () => {
          void (async () => {
            rescan.disabled = true;
            try {
              await runSearchNow('refresh');
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
      const forTagCounting = filteredRows();
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
          'Combine multiple tag filters: match ALL (AND) or ANY (OR). Used in the Everything query and in the result table filter.';
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
          '). Adds an Everything regex: clause for the tag. ' +
          (info.count > 0
            ? 'Number = rows in the current result list with this tag (after filters; grows when you load more pages).'
            : 'No rows with this tag in the current list—try Rescan or broaden search.');
        b.addEventListener('click', () => {
          void (async () => {
            if (activeTagKeys.has(key)) activeTagKeys.delete(key);
            else {
              rememberTag(key, info.display);
              activeTagKeys.add(key);
            }
            persistActiveTagFilter();

            await runSearchNow();
            commitSearchHistoryNow();
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
        clearTags.innerHTML = faClear15;
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

    /**
     * Path-sorted tree: cosmetic hide of nested rows under a collapsed folder.
     * Uses tr[data-tree-depth] and results-tree-collapsed on folder rows; toggles results-tree-collapse-hidden.
     * Also adds/removes a "N hidden" badge on each collapsed folder row.
     */
    function refreshResultsTreeCollapseHidden() {
      const tbody = document.getElementById('tbody');
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      if (!rows.length || rows[0].dataset.treeDepth === undefined) return;
      let collapseDepth = null;
      let collapsedFolderTr = null;
      let hiddenCount = 0;
      const badgeCounts = [];
      for (const tr of rows) {
        const d = Number(tr.dataset.treeDepth);
        if (collapseDepth !== null && d <= collapseDepth) {
          badgeCounts.push({ tr: collapsedFolderTr, count: hiddenCount });
          collapseDepth = null;
          collapsedFolderTr = null;
          hiddenCount = 0;
        }
        const hide = collapseDepth !== null && d > collapseDepth;
        tr.classList.toggle('results-tree-collapse-hidden', hide);
        if (hide) hiddenCount++;
        if (
          !hide &&
          tr.classList.contains('results-folder-row') &&
          tr.classList.contains('results-tree-collapsed')
        ) {
          collapseDepth = d;
          collapsedFolderTr = tr;
          hiddenCount = 0;
        }
      }
      if (collapsedFolderTr) badgeCounts.push({ tr: collapsedFolderTr, count: hiddenCount });
      // Update badges on all folder rows
      for (const tr of tbody.querySelectorAll('tr.results-folder-row')) {
        const existing = tr.querySelector('.tree-hidden-badge');
        if (existing) existing.remove();
      }
      for (const { tr, count } of badgeCounts) {
        if (count <= 0) continue;
        const badge = document.createElement('span');
        badge.className = 'badge bg-secondary ms-1 tree-hidden-badge';
        badge.textContent = count + ' hidden';
        const nameCell = tr.querySelector('td:nth-child(2)');
        if (nameCell) nameCell.appendChild(badge);
      }
    }

    /** Keyboard ↑/↓: move highlight only — avoids full renderTable() (O(n) per key). */
    function syncResultsSelectionHighlight() {
      const tbody = document.getElementById('tbody');
      if (!tbody) return;
      const want = selectedFullPath;
      const groupHL = isTreeGroupHLOn();

      /* 1. Clear previous highlights — only touches rows that had them */
      const prev = tbody.querySelector('tr.table-active');
      if (prev) prev.classList.remove('table-active');
      for (const tr of tbody.querySelectorAll('tr.table-active-child'))
        tr.classList.remove('table-active-child');
      for (const tr of tbody.querySelectorAll('tr.table-active-group-member'))
        tr.classList.remove('table-active-group-member', 'table-active-group-top', 'table-active-group-bottom');

      if (!want) return;

      /* 2. Find and activate the new row */
      let newActive = null;
      for (const tr of tbody.children) {
        if (tr.dataset.rowPath === want) { newActive = tr; break; }
      }
      if (!newActive) return;
      newActive.classList.add('table-active');

      if (!groupHL || !newActive.classList.contains('results-folder-row')) return;

      /* 3. Walk forward from the active folder to mark consecutive children */
      const cp = want.endsWith('\\') || want.endsWith('/') ? want : want + '\\';
      const group = [newActive];
      let sib = newActive.nextElementSibling;
      while (sib) {
        const p = sib.dataset.rowPath;
        if (!p || !p.startsWith(cp)) break;
        sib.classList.add('table-active-child');
        group.push(sib);
        sib = sib.nextElementSibling;
      }
      for (const tr of group) tr.classList.add('table-active-group-member');
      group[0].classList.add('table-active-group-top');
      group[group.length - 1].classList.add('table-active-group-bottom');
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

    /** ⋯ menu + right-click row: same IPC menu (viewport coords for Menu.popup). */
    async function openResultsRowItemActionsMenu(fp, clientX, clientY, row) {
      const res = await window.tagBrowser.showItemActionsMenu({
        filePath: fp,
        scopeFolder: document.getElementById('rootFolder').value.trim(),
        x: Math.round(clientX),
        y: Math.round(clientY),
      });
      if (res && res.action === 'followShellShortcut' && res.filePath) void followShellShortcutInTagFox(res.filePath);
      else if (res && res.action === 'newFolderInScope') {
        const parentForNew =
          row && rowIsFolder(row) ? normalizeFolderPathForEverything(fullPathForRow(row)) : null;
        void createNewFolderInScopeInteractive(parentForNew);
      } else if (res && res.action === 'rename') void renameItemInteractive(fp);
      else if (res && res.action === 'trash') void refreshAfterDiskMutation();
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
      const rawN = lastRows.length;
      /* Display rows: path-tree may inject ancestor folders not in lastRows (visN > rawN), or filters may hide rows (visN < rawN). */
      const visN = rowsForDisplay.length;
      const scopePath = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim());
      const flat = isFlatView(),
        smart = isSmartView(),
        sub = isShowSubfolders(),
        rcc = resultsContentMode();
      /** One readable sentence for layout + subfolders + content (status bar). */
      function viewModeStatusSentence() {
        const layout = flat ? 'Flat view' : smart ? 'Smart view' : 'Tree view';
        let s = layout;
        if (sub) s += ' with subfolders';
        else s += ', this folder only';
        if (rcc === 'folders') s += ', folders only';
        else if (rcc === 'files') s += ', files only';
        if (!sub && !scopePath) s += ' (set a current folder in Settings for a clearer listing)';
        return s;
      }
      const statusParts = [];
      if (!visN) statusParts.push('No rows');
      else if (visN === rawN) statusParts.push(String(visN) + ' row(s)');
      else if (visN < rawN)
        statusParts.push(String(visN) + ' of ' + String(rawN) + ' row(s) visible');
      else
        statusParts.push(String(visN) + ' row(s) · ' + String(rawN) + ' search result(s)');
      if (activeTagKeys.size || recencyFilterMode() !== 'all')
        statusParts.push('Some results are hidden by tag or recency filters');
      if (isHideSpecialPaths()) statusParts.push('Hiding special files/folders');
      if (isHideTildePaths()) statusParts.push('Hiding paths that contain a ~ segment');
      statusParts.push(viewModeStatusSentence());
      status.textContent = statusParts.join('. ') + '.';
      const showPathFolderGrouping = shouldShowPathFolderGrouping();
      const showPathTreeGutter = isTreeViewOn() && sortColumn === 'path' && isShowSubfolders();
      const pathTreeDepths = rowsForDisplay.map((r) => pathTreeUiDepth(r, showPathFolderGrouping));
      const pathTreeGutters = showPathTreeGutter ? pathTreeGutterStringsForDepths(pathTreeDepths) : null;
      const treeFoldUi = isTreeFoldUiActive();
      for (let rowIdx = 0; rowIdx < rowsForDisplay.length; rowIdx++) {
        const row = rowsForDisplay[rowIdx];
        const fp = fullPathForRow(row);
        const tr = document.createElement('tr');
        if (rowIsFolder(row)) tr.classList.add('results-folder-row');
        /* Dim “special” path segments when listed (client-side filters only). */
        if (pathUnderHideSpecialSegments(fp)) {
          tr.classList.add('tagfox-row-special-path');
          tr.title = 'Special path segment (. or $ or desktop.ini).';
        }
        if (pathUnderTildeSegment(fp)) {
          tr.classList.add('tagfox-row-tilde-path');
          const tildeTip = 'Path segment starts with ~.';
          tr.title = tr.title ? tr.title + ' ' + tildeTip : tildeTip;
        }

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
            const g = (pathTreeGutters && pathTreeGutters[rowIdx]) || '';
            const outer = document.createElement('div');
            outer.className = 'd-flex align-items-center min-w-0';
            if (rowIsFolder(row) && treeFoldUi) {
              const twisty = document.createElement('button');
              twisty.type = 'button';
              twisty.className =
                'btn btn-outline-secondary btn-sm results-tree-twisty flex-shrink-0 p-0 d-inline-flex align-items-center justify-content-center';
              twisty.textContent = '\u2212';
              twisty.title = 'Toggle folder contents visibility';
              twisty.setAttribute('aria-expanded', 'true');
              twisty.setAttribute('aria-label', 'Toggle showing contents under this folder');
              twisty.addEventListener('click', (e) => {
                e.stopPropagation();
                tr.classList.toggle('results-tree-collapsed');
                const collapsed = tr.classList.contains('results-tree-collapsed');
                if (collapsed) collapsedFolderPaths.add(fp); else collapsedFolderPaths.delete(fp);
                twisty.textContent = collapsed ? '+' : '\u2212';
                twisty.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                refreshResultsTreeCollapseHidden();
                scheduleFolderChildCountsForVisibleResultsRows();
                localStorage.setItem(LS.collapsedFolders, JSON.stringify([...collapsedFolderPaths]));
              });
              if (collapsedFolderPaths.has(fp)) {
                tr.classList.add('results-tree-collapsed');
                twisty.textContent = '+';
                twisty.setAttribute('aria-expanded', 'false');
              }
              outer.appendChild(twisty);
            } else {
              const sp = document.createElement('span');
              sp.className = 'results-tree-twisty-spacer flex-shrink-0';
              sp.setAttribute('aria-hidden', 'true');
              outer.appendChild(sp);
            }
            const gut = document.createElement('span');
            gut.className = 'path-tree-gutter flex-shrink-0';
            gut.textContent = g;
            nameInner.classList.add('min-w-0');
            outer.appendChild(gut);
            outer.appendChild(nameInner);
            tdName.appendChild(outer);
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
        fillPathCellBox(pathBox, collapseGDriveShortcutDisplay(pathColumnDisplayForRow(fp, rowIsFolder(row))));
        tdPath.title = fp;
        tdPath.appendChild(pathBox);

        const tdSize = document.createElement('td');
        tdSize.className = 'text-end text-nowrap small results-td-size';
        tdSize.textContent = formatSize(row.size);
        applySizeHeatToElement(tdSize, row);

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
        btnScopeParent.style.width = '1.5rem';
        btnScopeParent.style.height = '1.5rem';
        btnScopeParent.title = 'Set current folder to parent';
        btnScopeParent.setAttribute('aria-label', 'Set current folder to parent');
        btnScopeParent.innerHTML = '<i class="fa-solid fa-chevron-up fa-fw" aria-hidden="true"></i>';
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
        btnOpen.style.width = '1.5rem';
        btnOpen.style.height = '1.5rem';
        /* Files: shell open; folders: Explorer — box-arrow-up-right (same family as toolbar “open”). */
        const openTitle = rowIsFolder(row) ? 'Show in File Explorer' : 'Open with default app';
        btnOpen.title = openTitle;
        btnOpen.setAttribute('aria-label', openTitle);
        btnOpen.innerHTML = '<i class="fa-solid fa-up-right-from-square fa-fw" aria-hidden="true"></i>';
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
        btnClip.style.width = '1.5rem';
        btnClip.style.height = '1.5rem';
        btnClip.title = 'Copy (Windows Explorer paste)';
        btnClip.setAttribute('aria-label', 'Copy');
        btnClip.innerHTML = '<i class="fa-solid fa-clipboard fa-fw" aria-hidden="true"></i>';
        btnClip.addEventListener('click', async (e) => {
          e.stopPropagation();
          const r = await window.tagBrowser.copyExplorerPaste([fp]);
          if (!r || !r.ok) status.textContent = (r && r.error) || 'Copy for Explorer failed';
        });
        const btnMore = document.createElement('button');
        btnMore.type = 'button';
        btnMore.className =
          'btn btn-outline-secondary btn-sm me-1 d-inline-flex align-items-center justify-content-center p-0';
        btnMore.style.width = '1.5rem';
        btnMore.style.height = '1.5rem';
        btnMore.title =
          'More — full actions menu (or right-click the row). Copy/cut, paths, open, shortcut, Properties, …';
        btnMore.setAttribute('aria-label', 'More actions');
        btnMore.innerHTML = '<i class="fa-solid fa-ellipsis fa-fw" aria-hidden="true"></i>';
        btnMore.addEventListener('click', async (e) => {
          e.stopPropagation();
          const r = btnMore.getBoundingClientRect();
          await openResultsRowItemActionsMenu(fp, r.left, r.bottom, row);
        });
        const btnTags = document.createElement('button');
        btnTags.type = 'button';
        btnTags.className =
          'btn btn-outline-primary btn-sm me-1 d-inline-flex align-items-center justify-content-center p-0';
        btnTags.style.width = '1.5rem';
        btnTags.style.height = '1.5rem';
        btnTags.title = 'Edit [(…)] tags in the name';
        btnTags.setAttribute('aria-label', 'Edit tags');
        /* Same tag icon as tag toolbar lead (#tagBar row in index.html). */
        btnTags.innerHTML = '<i class="fa-solid fa-tags fa-fw" aria-hidden="true"></i>';
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
        bindCellTooltip(tdSize, sizeStr);
        bindCellTooltip(tdDate, dateStr);
        bindCellTooltip(
          tdAct,
          'Open — file: default app; folder: show in Explorer\nParent folder — set current folder to containing folder\nCopy — Windows Explorer paste\nTags — tag editor\n⋯ or right-click row — full menu (copy/cut, paths, shortcut, Properties, …)'
        );

        tr.appendChild(tdCb);
        tr.appendChild(tdName);
        tr.appendChild(tdPath);
        tr.appendChild(tdSize);
        tr.appendChild(tdDate);
        tr.appendChild(tdAct);

        tr.dataset.rowPath = fp;
        if (showPathTreeGutter) tr.dataset.treeDepth = String(pathTreeDepths[rowIdx]);
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
        tr.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          void openResultsRowItemActionsMenu(fp, e.clientX, e.clientY, row);
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
      applyResultsTablePathColumnVisibility();
      syncResultsSelectionHighlight();
      if (treeFoldUi) {
        refreshResultsTreeCollapseHidden();
        if (rowsForDisplay.length) {
          const liveFolders = new Set(
            Array.from(tbody.querySelectorAll('tr.results-folder-row'))
              .map(tr => tr.dataset.rowPath)
          );
          let pruned = false;
          for (const p of collapsedFolderPaths) {
            if (!liveFolders.has(p)) { collapsedFolderPaths.delete(p); pruned = true; }
          }
          if (pruned) localStorage.setItem(LS.collapsedFolders, JSON.stringify([...collapsedFolderPaths]));
        }
      }
      updateSelectAllCheckboxState();
      updateEmptyResultsPulseHints(rowsForDisplay.length);
      updateResultsLoadMoreUi();
      scheduleFolderChildCountsForVisibleResultsRows();
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
      if (tagModalIsNewTodoDraft()) {
        el.textContent = 'New file from Add TODO (tags only; no path yet)';
        return;
      }
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
        x.className = 'btn btn-sm btn-light py-0 px-1 align-baseline d-inline-flex align-items-center justify-content-center';
        x.innerHTML = '<i class="fa-solid fa-xmark" style="font-size:0.7rem;line-height:1" aria-hidden="true"></i>';
        x.setAttribute('aria-label', 'Remove');
        x.addEventListener('click', async () => {
          if (tagRenameBusy) return;
          const removed = modalTags[idx];
          if (tagModalIsNewTodoDraft()) {
            modalTags.splice(idx, 1);
            renderModalChips();
            refreshTagModalDatalist();
            return;
          }
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
      tagModalMode = 'rename';
      syncTagModalHintsAndTitle();
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

    function openTagModalNewTodoDraft() {
      tagModalMode = 'newTodo';
      syncTagModalHintsAndTitle();
      modalTargetPaths = [];
      document.getElementById('tagModalBulkHint').classList.add('d-none');
      setTagApplyFeedback('');
      modalTags = newTodoMdTags.slice();
      updateTagModalPathLabel();
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
      tagModalMode = 'rename';
      syncTagModalHintsAndTitle();
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
      if (tagModalIsNewTodoDraft()) {
        if (modalTags.some((t) => t.toLowerCase() === low)) return;
        modalTags.push(raw);
        renderModalChips();
        rememberTag(low, raw);
        refreshTagModalDatalist();
        return;
      }
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

    /** Strip offset so paging can re-apply a new offset per request. */
    function stripOffsetFromOpts(o) {
      if (!o || typeof o !== 'object') return {};
      const { offset: _ignored, ...rest } = o;
      return rest;
    }

    /** Append new Everything rows; skip paths already in list (stable order: existing first). */
    function mergeSearchRowsDedupe(existing, incoming) {
      const ex = Array.isArray(existing) ? existing : [];
      const inc = Array.isArray(incoming) ? incoming : [];
      if (!inc.length) return ex.slice();
      const seen = new Set(ex.map((r) => pathNormKey(fullPathForRow(r))));
      const out = ex.slice();
      for (const r of inc) {
        const k = pathNormKey(fullPathForRow(r));
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(r);
      }
      return out;
    }

    /** One Everything HTTP page (offset + count); may retry with flipped ascending for path / date_modified sorts. */
    async function everythingSearchWithDirectionFallback({
      runId,
      baseUrl,
      countStr,
      cap,
      httpUser,
      httpPassword,
      searchText,
      offset,
      seedOptions,
    }) {
      const pickRows = (res) => (res && Array.isArray(res.rows) ? res.rows : []);
      const directionCanMisbehave = (opts) =>
        (opts.sort === 'path' && opts.ascending === true) || (opts.sort === 'date_modified' && opts.ascending === false);
      const countLooksWrongForDirection = (rowsLen) =>
        cap > 40 && rowsLen >= 0 && rowsLen < Math.max(3, Math.floor(cap * 0.2));
      const shouldSwitchDirection = (baseRowsLen, altRowsLen) => altRowsLen >= Math.max(baseRowsLen + 5, baseRowsLen * 2);

      let options = { ...(seedOptions || {}), offset: Math.max(0, Number(offset) || 0) };
      const runOnce = (opts) =>
        window.tagBrowser.search({
          baseUrl,
          count: countStr,
          httpUser,
          httpPassword,
          options: opts,
          searchText,
        });
      const t0 = performance.now();
      searchDebugLog('search.request.base', { runId, searchText, options });
      const baseRes = await runOnce(options);
      if (runId !== searchRunSeq) return null;
      const baseRows = pickRows(baseRes);
      searchDebugLog('search.response.base', {
        runId,
        searchText,
        ok: !!(baseRes && baseRes.ok),
        rows: baseRows.length,
        ms: Math.round(performance.now() - t0),
        err: baseRes && baseRes.ok ? '' : (baseRes && baseRes.error) || 'unknown',
      });
      if (!baseRes || !baseRes.ok) {
        if (runId !== searchRunSeq) return null;
        return { ok: false, error: (baseRes && baseRes.error) || 'Search failed', rows: [], optionsUsed: options };
      }
      let rows = baseRows;
      let usedFallbackSort = false;
      if (directionCanMisbehave(options) && countLooksWrongForDirection(rows.length)) {
        const altOptions = { ...options, ascending: !options.ascending };
        const t1 = performance.now();
        searchDebugLog('search.request.alt', { runId, searchText, altOptions });
        const altRes = await runOnce(altOptions);
        if (runId !== searchRunSeq) return null;
        if (altRes && altRes.ok) {
          const altRows = pickRows(altRes);
          searchDebugLog('search.response.alt', {
            runId,
            searchText,
            rows: altRows.length,
            ms: Math.round(performance.now() - t1),
          });
          if (shouldSwitchDirection(rows.length, altRows.length)) {
            rows = altRows;
            usedFallbackSort = true;
            options = altOptions;
            searchDebugLog('search.fallback.useAlt', {
              runId,
              searchText,
              baseRows: baseRows.length,
              altRows: altRows.length,
            });
          }
        } else {
          searchDebugLog('search.response.altError', {
            runId,
            searchText,
            err: (altRes && altRes.error) || 'alt failed',
          });
        }
      }
      if (runId !== searchRunSeq) return null;
      return { ok: true, rows, usedFallbackSort, optionsUsed: options };
    }

    /** Show Load more when another Everything page may exist. */
    function updateResultsLoadMoreUi() {
      const wrap = document.getElementById('resultsLoadMoreWrap');
      const btn = document.getElementById('btnLoadMoreResults');
      const hint = document.getElementById('resultsLoadMoreHint');
      if (!wrap || !btn) return;
      const more = !!(
        resultsPagingCtx &&
        resultsPagingCtx.hasMore &&
        (lastRows.length || resultsPagingCtx.singleOffset > 0)
      );
      wrap.classList.toggle('d-none', !more);
      btn.disabled = resultsLoadMoreBusy;
      if (hint) {
        if (resultsLoadMoreBusy) hint.textContent = 'Loading…';
        else if (more) {
          let t = 'Scroll or click for the next page.';
          if (isHideSpecialPaths() || isHideTildePaths()) {
            t += ' Hide Special / Hide ~ is on, so scrolling may not work as expected.';
          }
          hint.textContent = t;
        }
        else hint.textContent = '';
      }
    }

    /** Same threshold as onResultsWrapScrollForPaging — viewport near end of list. */
    function resultsScrollNearBottom(px) {
      const el = document.getElementById('resultsScroll');
      if (!el) return false;
      const margin = Number(px) || 140;
      return el.scrollTop + el.clientHeight >= el.scrollHeight - margin;
    }

    /** Near bottom of #resultsScroll: fetch next page (debounced). */
    function onResultsWrapScrollForPaging() {
      const el = document.getElementById('resultsScroll');
      if (!el || !resultsPagingCtx || !resultsPagingCtx.hasMore) return;
      if (resultsLoadMoreBusy || searchInFlight) return;
      if (!resultsScrollNearBottom(140)) return;
      if (resultsScrollMoreTimer) return;
      resultsScrollMoreTimer = setTimeout(() => {
        resultsScrollMoreTimer = null;
        void loadMoreResults();
      }, 200);
    }

    /** Next Everything offset page; same query/sort as resultsPagingCtx. */
    async function loadMoreResults() {
      if (!resultsPagingCtx || !resultsPagingCtx.hasMore || resultsLoadMoreBusy) return;
      if (searchInFlight) {
        const hint = document.getElementById('resultsLoadMoreHint');
        if (hint) hint.textContent = 'Wait for the current search to finish, then try again.';
        return;
      }
      const ctx = resultsPagingCtx;
      const runId = searchRunSeq;
      const status = document.getElementById('status');
      resultsLoadMoreBusy = true;
      updateResultsLoadMoreUi();
      try {
        const res = await everythingSearchWithDirectionFallback({
          runId,
          baseUrl: ctx.baseUrl,
          countStr: String(ctx.pageSize),
          cap: ctx.pageSize,
          httpUser: ctx.httpUser,
          httpPassword: ctx.httpPassword,
          searchText: ctx.searchText,
          offset: ctx.singleOffset,
          seedOptions: ctx.seedOptions,
        });
        if (runId !== searchRunSeq) return;
        if (!res || !res.ok) {
          resultsPagingCtx = { ...ctx, hasMore: false };
          if (status) status.textContent = (res && res.error) || 'Load more failed';
          maybeShowEverythingHttpHelpBanner(res && res.error);
          renderTable();
          updateResultsLoadMoreUi();
          return;
        }
        hideEverythingHttpHelpBanner();
        let add = res.rows || [];
        const addRawLen = add.length;
        if (isFoldersOnly()) add = add.filter(rowIsFolder);
        else if (isFilesOnly()) add = add.filter((r) => !rowIsFolder(r));
        if (!addRawLen) {
          resultsPagingCtx = { ...ctx, hasMore: false };
        } else {
          lastRows = mergeSearchRowsDedupe(lastRows, add);
          sortLastRowsForDisplay(!!res.usedFallbackSort);
          const hasMore = addRawLen === ctx.pageSize;
          resultsPagingCtx = {
            ...ctx,
            singleOffset: ctx.singleOffset + addRawLen,
            seedOptions: stripOffsetFromOpts(res.optionsUsed),
            hasMore,
          };
        }
        await syncSelectionAfterSearch();
        renderTagBar();
        renderTable();
        updateResultsLoadMoreUi();
      } finally {
        resultsLoadMoreBusy = false;
        updateResultsLoadMoreUi();
      }
    }

    /** Map Everything bridge errors to a short hint class (only for setup / connectivity, not “no rows”). */
    function everythingHttpSetupHintKind(errMsg) {
      const s = String(errMsg || '');
      const sl = s.toLowerCase();
      if (/http\s+401\b/.test(s) || /http\s+403\b/.test(s)) return 'auth';
      if (/response was not json/i.test(s)) return 'json';
      if (/http\s+404\b/.test(s)) return 'http';
      if (/http\s+50[0-9]\b/.test(s)) return 'http';
      if (/econnrefused|etimedout|enotfound/i.test(s)) return 'net';
      if (sl.includes('failed to fetch')) return 'net';
      if (sl.includes('networkerror') || sl.includes('network request failed')) return 'net';
      if (/^fetch failed\b/i.test(sl)) return 'net';
      return null;
    }

    function hideEverythingHttpHelpBanner() {
      document.getElementById('everythingHttpHelpAlert')?.classList.add('d-none');
    }

    /** Offer Settings + Installation tab when search can’t talk to Everything HTTP. */
    function maybeShowEverythingHttpHelpBanner(errMsg) {
      const kind = everythingHttpSetupHintKind(errMsg);
      if (!kind) return;
      const wrap = document.getElementById('everythingHttpHelpAlert');
      const span = document.getElementById('everythingHttpHelpMsg');
      if (!wrap || !span) return;
      const detail = String(errMsg || '').trim();
      if (kind === 'auth') {
        span.textContent =
          'Everything HTTP auth failed. Use the same username/password as Tools → Options → HTTP Server. ' +
          (detail ? '(' + detail + ')' : '');
      } else if (kind === 'json') {
        span.textContent =
          'This URL did not return Everything JSON — wrong port, not the HTTP server, or a proxy. Check the base URL. ' +
          (detail ? '(' + detail + ')' : '');
      } else {
        span.textContent =
          'Cannot reach Everything HTTP — is Everything running, HTTP enabled (on 1.5a: HTTP plug-in installed), URL/port correct? ' +
          (detail ? '(' + detail + ')' : '');
      }
      wrap.classList.remove('d-none');
    }

    /**
     * Smart before-paint: if cap exceeded, either revert a probe or narrow the view, then re-search.
     * Returns true if a re-search was triggered (caller should return without painting).
     */
    async function smartBeforePaint(runId) {
      if (!isSmartView()) return false;
      if (runId !== searchRunSeq) return false;
      if (!resultsPagingCtx || resultsPagingCtx.mode !== 'single' || !resultsPagingCtx.hasMore) return false;
      const st = document.getElementById('status');

      /* Probe exceeded cap: revert to prior toggles and re-search as smart-narrow. */
      if (smartEvent === 'smart-probe' && smartProbePrior) {
        if (st) st.textContent = 'Smart view: full tree would exceed the cap — restored narrower scope.';
        applyResultsViewRadiosToDom('smart', smartProbePrior.subs, smartProbePrior.content);
        syncViewRadioActiveFromDom();
        saveSettings();
        const prior = smartProbePrior;
        smartProbePrior = null;
        await runSearchNow('smart-narrow');
        smartRevertFP = smartOutcomeFingerprint();
        return true;
      }

      /* Identity search exceeded cap: try narrowing (subs off, then files-only). */
      if (smartEvent === 'identity') {
        const rootFolder = document.getElementById('rootFolder').value.trim();
        if (isShowSubfolders()) {
          const droppingSubsOk = !lastRows.length || smartScopeHasDirectChildHit(lastRows, rootFolder);
          if (droppingSubsOk) {
            applyResultsViewRadiosToDom('smart', false, resultsContentMode());
            syncViewRadioActiveFromDom();
            saveSettings();
            if (st) st.textContent = 'Smart view: subfolders turned off — result set exceeded the cap.';
            await runSearchNow('smart-narrow');
            return true;
          }
        }
        if (!isFilesOnly() && !isFoldersOnly()) {
          applyResultsViewRadiosToDom('smart', isShowSubfolders(), 'files');
          syncViewRadioActiveFromDom();
          saveSettings();
          if (st) st.textContent = 'Smart view: switched to Files only — still exceeding the cap.';
          await runSearchNow('smart-narrow');
          return true;
        }
      }

      return false;
    }

    /**
     * Smart after-paint: if all results fit and view is narrowed, probe-widen to full tree.
     * If probe succeeded (smart-probe with !hasMore), show success status.
     */
    async function smartAfterPaint() {
      if (!isSmartView()) { smartEvent = null; smartProbePrior = null; smartRevertFP = null; return; }
      if (!resultsPagingCtx || resultsPagingCtx.mode !== 'single') return;

      if (smartRevertFP && smartOutcomeFingerprint() !== smartRevertFP) smartRevertFP = null;

      const st = document.getElementById('status');
      const hasMore = !!resultsPagingCtx.hasMore;

      /* Probe success: all results fit in full tree view. */
      if (smartEvent === 'smart-probe' && !hasMore) {
        smartProbePrior = null;
        smartRevertFP = null;
        if (st) st.textContent = 'Smart view: showing full tree (all results fit in this cap).';
        return;
      }

      /* manual / smart-narrow / refresh: no further auto-adjustment. */
      if (smartEvent === 'manual' || smartEvent === 'smart-narrow' || smartEvent === 'refresh') return;

      /* Still exceeding cap after all narrowing: terminal message. */
      if (hasMore) {
        smartRevertFP = null;
        if (isFilesOnly() && st)
          st.textContent = 'Smart view: still more results than the cap (Load more or raise Max results).';
        return;
      }

      /* All results fit but view is narrowed: probe-widen to full tree. */
      if (!isShowSubfolders() || !isAllContent()) {
        const scopeJustChanged = smartRevertFP == null;
        if (!smartSearchShouldStartBroad() && !scopeJustChanged) return;
        if (smartRevertFP && smartOutcomeFingerprint() === smartRevertFP) return;
        smartProbePrior = { subs: isShowSubfolders(), content: resultsContentMode() };
        applyResultsViewRadiosToDom('smart', true, 'all');
        syncViewRadioActiveFromDom();
        saveSettings();
        await runSearchNow('smart-probe');
      }
    }

    function smartScopeHasDirectChildHit(rows, rootFolderRaw) {
      const scope = normalizeFolderPathForEverything(String(rootFolderRaw || '').trim());
      if (!scope) return true;
      const sk = pathNormKey(scope);
      for (const r of rows) {
        const fp = fullPathForRow(r);
        if (!fp) continue;
        const par = normalizeFolderPathForEverything(T.parentDir(fp));
        if (pathNormKey(par) === sk) return true;
      }
      return false;
    }

    async function runSearch(eventKind = 'identity') {
      searchInFlight = true;
      const runId = ++searchRunSeq;
      if (!isSmartView()) {
        smartEvent = null;
        smartProbePrior = null;
        smartRevertFP = null;
      } else {
        smartEvent = eventKind;
      }
      resultsPagingCtx = null;
      try {
      cancelPropsPreviewSchedule();
      {
        const smart = isSmartView();
        const broadForSmart = smart && eventKind === 'identity' && smartSearchShouldStartBroad();
        const q = (document.getElementById('query')?.value || '').trim();
        const broadForNonSmart = !smart && (q || activeTagKeys.size);
        if (broadForSmart || broadForNonSmart) {
          applyResultsViewRadiosToDom(resultsLayoutFromUi(), true, 'all');
          syncViewRadioActiveFromDom();
        }
      }
      const status = document.getElementById('status');
      saveSettings();
      const baseUrl = document.getElementById('baseUrl').value.trim() || 'http://127.0.0.1';
      const ceilingNorms = getSearchScopeCeilingFoldersNorms();
      const rootFolder = document.getElementById('rootFolder').value.trim();
      /* Scope-change detection for Smart probe-widen on plain browse navigation. */
      if (isSmartView() && eventKind === 'identity') {
        const sk = smartBrowseScopeKeyFromInputs(rootFolder);
        const scopeChanged = lastSmartBrowseScopeKey != null && sk !== lastSmartBrowseScopeKey;
        lastSmartBrowseScopeKey = sk;
        if (scopeChanged) smartRevertFP = null;
      }
      const query = document.getElementById('query').value;
      const hasBread = !!normalizeFolderPathForEverything(rootFolder);
      const hasCeil = ceilingNorms.length > 0;
      const hasScope = hasBread || hasCeil;
      const showSub = isShowSubfolders();
      const fo = isFoldersOnly();
      const fileOnly = isFilesOnly();
      const recursive = showSub || !hasScope;
      let searchText = composeScopedEverythingSearch(ceilingNorms, rootFolder, query, recursive);
      searchText = appendActiveTagToEverythingQuery(searchText);
      if (fo) searchText = (String(searchText).trim() + ' folder:').trim();
      else if (fileOnly) searchText = (String(searchText).trim() + ' file: sort-mix:').trim();
      else searchText = (String(searchText).trim() + ' sort-mix:').trim();
      searchText = appendRecencyToEverythingQuery(searchText);
      const maxResultsRaw = document.getElementById('maxResults').value;
      const cap = Math.min(5000, Math.max(1, parseInt(String(maxResultsRaw).trim(), 10) || 200));
      const countStr = String(cap);
      const httpUser = document.getElementById('httpUser').value;
      const httpPassword = document.getElementById('httpPassword').value;
      const baseSearchOpts = everythingOptionsForRequest();
      /* Scope: force Match path whenever path filters are present so tokens limit the index. */
      const scopeNeedsPathSearch = hasCeil || !!normalizeFolderPathForEverything(rootFolder);
      const options = {
        ...baseSearchOpts,
        pathSearch: !!(baseSearchOpts.pathSearch || scopeNeedsPathSearch),
      };
      searchDebugLog('runSearch.start', {
        runId,
        flat: isFlatView(),
        smart: isSmartView(),
        showSubfolders: showSub,
        contentMode: resultsContentMode(),
        foldersOnly: fo,
        filesOnly: fileOnly,
        sortColumn,
        sortAsc,
        cap,
        query,
        searchText,
        options,
      });

      status.textContent = 'Searching…';

      searchDebugLog('runSearch.branch', {
        runId,
        flat: isFlatView(),
        smart: isSmartView(),
        showSubfolders: showSub,
        contentMode: resultsContentMode(),
      });

      const pageArgs = {
        runId,
        baseUrl,
        countStr,
        cap,
        httpUser,
        httpPassword,
      };

      const res = await everythingSearchWithDirectionFallback({
        ...pageArgs,
        searchText,
        offset: 0,
        seedOptions: options,
      });
      if (res == null) return;
      if (runId !== searchRunSeq) return;

      if (!res.ok) {
        lastRows = [];
        resultsPagingCtx = null;
        searchDebugLog('runSearch.error', { runId, err: res.error || 'Search failed' });
        status.textContent = res.error || 'Search failed';
        maybeShowEverythingHttpHelpBanner(res.error);
        await syncSelectionAfterSearch();
        renderTagBar();
        renderTable();
        return;
      }
      hideEverythingHttpHelpBanner();
      let got = Array.isArray(res.rows) ? res.rows : [];
      /* Everything offset is in raw API rows — never use client-filtered count (e.g. folders-only). */
      const rawPageLen = got.length;
      if (fo) got = got.filter(rowIsFolder);
      else if (fileOnly) got = got.filter((r) => !rowIsFolder(r));
      lastRows = got;
      sortLastRowsForDisplay(!!res.usedFallbackSort);
      searchDebugLog('runSearch.single.final', {
        runId,
        usedFallbackSort: !!res.usedFallbackSort,
        rows: lastRows.length,
        first: lastRows.slice(0, 3).map((r) => fullPathForRow(r)),
        last: lastRows.slice(-3).map((r) => fullPathForRow(r)),
      });
      resultsPagingCtx = {
        mode: 'single',
        pageSize: cap,
        singleOffset: rawPageLen,
        hasMore: rawPageLen === cap,
        baseUrl,
        httpUser,
        httpPassword,
        searchText,
        seedOptions: stripOffsetFromOpts(res.optionsUsed),
      };
      if (runId === searchRunSeq && (await smartBeforePaint(runId))) return;
      status.textContent = lastRows.length ? lastRows.length + ' result(s)' : 'No results';
      await syncSelectionAfterSearch();
      renderTagBar();
      renderTable();
      pulseEmptyResultHintsAfterSearchOk();
      if (runId === searchRunSeq) await smartAfterPaint();
      } finally {
        if (runId === searchRunSeq) searchInFlight = false;
      }
    }

    const resultsTableScrollEl = document.getElementById('resultsScroll');
    if (resultsTableScrollEl) resultsTableScrollEl.addEventListener('scroll', onResultsWrapScrollForPaging, { passive: true });
    document.getElementById('btnLoadMoreResults')?.addEventListener('click', () => void loadMoreResults());

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
      const sk = th.dataset.sort;
      const note =
        ['size', 'date_modified', 'name'].includes(String(sk || '')) ? flatViewOnIfTreeForColumnSort() : '';
      applySortColumnKey(sk, note || undefined);
    });

    document.getElementById('query').addEventListener('input', () => {
      syncQueryFilledChrome();
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
    /* capture: Alt+↑ = scope parent — before input defaults; window keydown defers #query to this so it always fires in the search box. */
    document.getElementById('query').addEventListener(
      'keydown',
      (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key !== 'ArrowUp' && e.code !== 'ArrowUp') return;
        if (document.querySelector('.modal.show')) return;
        e.preventDefault();
        void goToParentScopeFolder();
      },
      true
    );

    document.getElementById('btnSaveFavouriteFolder').addEventListener('click', () => {
      const status = document.getElementById('status');
      const p = currentScopeFolderPath();
      if (!p) {
        status.textContent = 'No folder to save — set the current folder in Settings, or click a folder row.';
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

    document.getElementById('btnNewTodoMdTags').addEventListener('click', () => openTagModalNewTodoDraft());
    document.getElementById('btnCreateTodoMd').addEventListener('click', () => void createTodoMdInScope());
    document.getElementById('newMdTitleInput').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      document.getElementById('btnCreateTodoMd').click();
    });

    document.querySelectorAll('input[name="tagFoxRecencyFilter"]').forEach((el) => {
      el.addEventListener('change', () => {
        saveSettings();
        commitSearchHistoryNow();
        /* dm: is baked into the HTTP search — must re-run Everything or lastRows stays stale. */
        void runSearchNow();
      });
    });
    ['optCase', 'optWholeWord', 'optPath', 'optDiacritics', 'optHideSpecial', 'optHideTilde'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        saveSettings();
        syncAdvancedBtnWarning();
        if (id === 'optCase' && document.getElementById('bulkRenameModal')?.classList.contains('show')) {
          updateBulkRenamePreview();
        }
        if (id === 'optHideSpecial' || id === 'optHideTilde') {
          renderTable();
          renderTagBar();
          updateEmptyResultsPulseHints(listRowsForUi().length, { forceRestart: true });
          updateSelectAllCheckboxState();
          syncResultsSelectionHighlight();
          updateResultsLoadMoreUi();
        } else {
          scheduleSearch();
        }
        commitSearchHistoryNow();
      });
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
    document.addEventListener('pointerdown', (e) => {
      const panel = document.getElementById('searchOptsAdvancedPanel');
      if (panel?.hasAttribute('hidden')) return;
      const wrap = document.querySelector('.tagfox-advanced-wrap');
      if (wrap && !wrap.contains(e.target)) {
        panel.setAttribute('hidden', '');
        const btn = document.getElementById('btnToggleSearchOptsAdvanced');
        btn?.setAttribute('aria-expanded', 'false');
        btn?.classList.remove('active');
      }
    });

    ['baseUrl', 'maxResults'].forEach((id) => {
      document.getElementById(id).addEventListener('input', scheduleSearch);
    });
    document.getElementById('btnEditScopePath')?.addEventListener('click', () => {
      if (scopePathEditMode) void commitScopePathEditMode();
      else enterScopePathEditMode();
    });
    document.getElementById('scopePathEdit')?.addEventListener('input', () => {
      scopePathEditCommitError = false;
      syncScopePathEditValidationVisual();
    });
    document.getElementById('scopePathEdit')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitScopePathEditMode();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelScopePathEditMode();
      }
    });
    document.getElementById('btnStatusScopeSiblingPrev')?.addEventListener('click', () => void goToSiblingScopeFolder(-1));
    document.getElementById('btnStatusScopeSiblingNext')?.addEventListener('click', () => void goToSiblingScopeFolder(1));
    document.getElementById('btnStatusScopeParent').addEventListener('click', () => void goToParentScopeFolder());
    /* Re-click active segment cycles (Tree→Smart→Flat; dirs→all→files); subs stay a 2-way pair. */
    const viewLayoutTrioIds = ['optRvTree', 'optRvSmart', 'optRvFlat'];
    const contentTrioIds = ['optRvDirsOnly', 'optRvAll', 'optRvFilesOnly'];
    const viewPairs = [['optRvSubsOn', 'optRvSubsOff']];
    const viewRadioActive = {};
    /** Mirror checked state for toggle-on-reclick (loadSettings, setResultsViewRadios, column-sort flat switch). */
    function syncViewRadioActiveFromDom() {
      for (const id of [...viewLayoutTrioIds, ...contentTrioIds]) {
        const el = document.getElementById(id);
        if (el) viewRadioActive[id] = !!el.checked;
      }
      for (const [x, y] of viewPairs) {
        const ex = document.getElementById(x);
        const ey = document.getElementById(y);
        if (ex) viewRadioActive[x] = !!ex.checked;
        if (ey) viewRadioActive[y] = !!ey.checked;
      }
    }
    function bindResultsViewRadiosChanged(isNonLayoutToggle) {
      applyNaturalSortWhenTreeViewOn();
      const kind = (isNonLayoutToggle && isSmartView()) ? 'manual' : 'identity';
      if (kind === 'manual') smartRevertFP = null;
      saveSettings();
      updateSortHeaders();
      applyResultsTablePathColumnVisibility();
      void runSearchNow(kind);
      commitSearchHistoryNow();
    }
    function wireViewTrioClickCycle(ids, isNonLayout) {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.addEventListener('click', () => {
          if (viewRadioActive[id]) {
            const idx = ids.indexOf(id);
            const nextId = ids[(idx + 1) % ids.length];
            const next = document.getElementById(nextId);
            if (next) {
              next.checked = true;
              syncViewRadioActiveFromDom();
              next.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else {
            syncViewRadioActiveFromDom();
          }
        });
        el.addEventListener('change', () => {
          syncViewRadioActiveFromDom();
          bindResultsViewRadiosChanged(isNonLayout);
        });
      }
    }
    wireViewTrioClickCycle(viewLayoutTrioIds, false);
    wireViewTrioClickCycle(contentTrioIds, true);
    for (const [a, b] of viewPairs) {
      for (const id of [a, b]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const other = id === a ? b : a;
        el.addEventListener('click', () => {
          if (viewRadioActive[id]) {
            document.getElementById(other).checked = true;
            viewRadioActive[other] = true;
            viewRadioActive[id] = false;
            document.getElementById(other).dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            syncViewRadioActiveFromDom();
          }
        });
        el.addEventListener('change', () => {
          syncViewRadioActiveFromDom();
          bindResultsViewRadiosChanged(true);
        });
      }
    }
    syncViewRadioActiveFromDom();
    document.getElementById('btnClearQuery').addEventListener('click', () => clearSearchQuery());
    document.getElementById('btnClearScope').addEventListener('click', () => clearSearchScope());
    document.getElementById('httpUser').addEventListener('input', scheduleSearch);
    document.getElementById('httpPassword').addEventListener('input', scheduleSearch);

    document.getElementById('globalToggleHotkeyDisplay')?.addEventListener('keydown', (ev) => {
      if (!globalToggleRecording) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === 'Escape') {
        setGlobalToggleRecording(false);
        return;
      }
      const acc = acceleratorFromKeydown(ev);
      if (!acc) return;
      void (async () => {
        if (!window.tagBrowser || typeof window.tagBrowser.globalToggleSet !== 'function') return;
        const r = await window.tagBrowser.globalToggleSet(acc);
        const st = document.getElementById('status');
        const hint = document.getElementById('globalToggleHotkeyHelp');
        if (r && r.ok) {
          if (st) st.textContent = 'Global toggle: ' + r.accelerator;
          if (hint)
            hint.textContent =
              'Saved ' +
              r.accelerator +
              '. Recording needs at least one modifier. Works while TagFox is hidden.';
        } else {
          if (st) st.textContent = (r && r.error) || 'Could not set global shortcut.';
          if (hint) hint.textContent = (r && r.error) || 'Registration failed — shortcut unchanged.';
        }
        setGlobalToggleRecording(false);
      })();
    });
    document.getElementById('btnRecordGlobalToggleHotkey')?.addEventListener('click', () => {
      if (globalToggleRecording) setGlobalToggleRecording(false);
      else setGlobalToggleRecording(true);
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
    document.getElementById('tagModal').addEventListener('hidden.bs.modal', () => {
      if (tagModalMode === 'newTodo') newTodoMdTags = modalTags.slice();
      tagModalMode = 'rename';
      syncTagModalHintsAndTitle();
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
    document.getElementById('btnReadmeEdit').addEventListener('click', () => toggleViewerDocEditor('readme'));
    document.getElementById('btnMdFileEdit').addEventListener('click', () => toggleViewerDocEditor('mdFile'));
    (function bindViewerDocPreviewActivators() {
      function bind(prevId, which) {
        const el = document.getElementById(prevId);
        if (!el) return;
        el.addEventListener('dblclick', () => setViewerDocEditorOpen(which, true));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setViewerDocEditorOpen(which, true);
          }
        });
      }
      bind('readmePreview', 'readme');
      bind('mdFilePreview', 'mdFile');
    })();

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
      const label = segmentPretty(T.baseName(activeReadmePath));
      status.textContent = r.ok ? label + ' saved.' : (r.error || 'Save failed');
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

    /** User highlighted text — let the browser handle Ctrl+C / Ctrl+X / Ctrl+Shift+C (don’t steal for Explorer paths). */
    function hasNonEmptyDomTextSelection() {
      try {
        const s = window.getSelection && window.getSelection();
        return !!(s && String(s.toString() || '').trim());
      } catch (_) {
        return false;
      }
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
      // Skip collapse-hidden rows
      const trs = document.querySelectorAll('#resultsTable tbody tr');
      const step = delta > 0 ? 1 : -1;
      while (idx >= 0 && idx < rows.length && trs[idx] && trs[idx].classList.contains('results-tree-collapse-hidden')) {
        idx += step;
      }
      if (idx < 0 || idx >= rows.length) return;
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

    /** True when tbody row i is hidden by tree collapse (display:none). */
    function isResultsTableRowCollapseHidden(idx) {
      const trs = document.querySelectorAll('#resultsTable tbody tr');
      const tr = trs[idx];
      return !!(tr && tr.classList.contains('results-tree-collapse-hidden'));
    }

    /** Scroll a result row to the top of #resultsScroll (below sticky thead if present). */
    function scrollResultsRowToTopOfList(tr) {
      const wrap = document.getElementById('resultsScroll');
      if (!wrap || !tr) return;
      const thead = document.querySelector('#resultsTable thead');
      const headH = thead ? thead.getBoundingClientRect().height : 0;
      const w = wrap.getBoundingClientRect();
      const r = tr.getBoundingClientRect();
      wrap.scrollTop += r.top - w.top - headH;
    }

    /** One step of j/k scroll-to-top; cancel if token !== siblingNavScrollToken. */
    function applySiblingNavScrollToTop(token) {
      if (token !== siblingNavScrollToken) return;
      const tr = document.querySelector('#resultsTable tbody tr.table-active');
      if (tr) scrollResultsRowToTopOfList(tr);
    }

    /** Run callback after layout/paint (large tbody: one rAF is often too soon). */
    function runAfterNextLayoutPaint(cb) {
      requestAnimationFrame(() => {
        requestAnimationFrame(cb);
      });
    }

    /**
     * j/k: scroll active row to top; if near bottom with more pages, wait for debounced load-more,
     * full idle (incl. resultsScrollMoreTimer), layout, then scroll again — second pass catches chained
     * load-more + late layout on big tables.
     */
    async function finishSiblingNavScrollAfterLoadMaybe(token) {
      applySiblingNavScrollToTop(token);
      if (token !== siblingNavScrollToken) return;
      if (!resultsScrollNearBottom(140) || !(resultsPagingCtx && resultsPagingCtx.hasMore)) return;

      const waitPagingIdle = async () => {
        await new Promise((r) => setTimeout(r, 240));
        if (token !== siblingNavScrollToken) return;
        while (
          (resultsLoadMoreBusy || searchInFlight || resultsScrollMoreTimer) &&
          token === siblingNavScrollToken
        ) {
          await new Promise((r) => setTimeout(r, 30));
        }
      };

      const scrollAfterLayout = () =>
        new Promise((resolve) => {
          if (token !== siblingNavScrollToken) return resolve();
          runAfterNextLayoutPaint(() => {
            applySiblingNavScrollToTop(token);
            resolve();
          });
        });

      for (let pass = 0; pass < 2 && token === siblingNavScrollToken; pass++) {
        await waitPagingIdle();
        if (token !== siblingNavScrollToken) return;
        await scrollAfterLayout();
        if (!resultsScrollNearBottom(140) || !(resultsPagingCtx && resultsPagingCtx.hasMore)) break;
      }
    }

    /** Folder row index whose normalized path equals pathNorm (empty = not found). */
    function indexOfFolderRowByPathNorm(rows, pathNorm) {
      return rows.findIndex((r) => rowIsFolder(r) && pathNormKey(fullPathForRow(r)) === pathNorm);
    }

    /** Next/prev visible folder row sharing the same parent directory (siblings). dir: +1 / -1. */
    function indexOfNextFolderSharingParent(rows, fromIdx, dir, parentNorm) {
      const step = dir > 0 ? 1 : -1;
      for (let i = fromIdx + step; i >= 0 && i < rows.length; i += step) {
        if (isResultsTableRowCollapseHidden(i)) continue;
        const r = rows[i];
        if (!rowIsFolder(r)) continue;
        if (pathNormKey(T.parentDir(fullPathForRow(r))) !== parentNorm) continue;
        return i;
      }
      return -1;
    }

    /**
     * j/k: next/prev sibling folder; at first/last sibling, walk up to the parent row and continue
     * at that level (next/prev “uncle” folder). Repeats until a move is found or the tree root is hit.
     */
    function moveResultsSiblingFolder(dir) {
      resultsShiftRangeAnchorIdx = null;
      const rows = listRowsForUi();
      let cur = rows.length ? navFocusIndexInFilteredRows(rows) : -1;
      const useScopeSiblings = cur < 0 || !rowIsFolder(rows[cur]);
      if (useScopeSiblings) {
        void goToSiblingScopeFolder(dir);
        return;
      }
      for (let depth = 0; depth < 64; depth++) {
        const parentNorm = pathNormKey(T.parentDir(fullPathForRow(rows[cur])));
        const next = indexOfNextFolderSharingParent(rows, cur, dir, parentNorm);
        if (next >= 0) {
          const row = rows[next];
          setSelection(row, fullPathForRow(row));
          const token = ++siblingNavScrollToken;
          requestAnimationFrame(() => void finishSiblingNavScrollAfterLoadMaybe(token));
          return;
        }
        if (!parentNorm) return;
        const pi = indexOfFolderRowByPathNorm(rows, parentNorm);
        if (pi < 0) return;
        cur = pi;
      }
    }

    /** Toggle between two radios in a pair + trigger the save/search cycle. */
    function toggleViewRadioPair(idA, idB) {
      const a = document.getElementById(idA);
      const b = document.getElementById(idB);
      if (!a || !b) return;
      const target = a.checked ? b : a;
      target.checked = true;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /** True when scope has a parent path we can navigate to. */
    function canGoToParentScopeFolder() {
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return false;
      const norm = normalizeFolderPathForEverything(raw);
      const parRaw = T.parentDir(norm);
      const par = normalizeFolderPathForEverything(parRaw);
      if (!par) return false;
      if (par.replace(/[/\\]+$/, '').toLowerCase() === norm.replace(/[/\\]+$/, '').toLowerCase()) return false;
      const maxN = getSearchScopeMaxFolderNorm();
      if (maxN && !pathIsUnderOrEqualFolder(par, maxN)) return false;
      return true;
    }

    function syncStatusBarParentScopeButton() {
      const canUp = canGoToParentScopeFolder();
      const b = document.getElementById('btnStatusScopeParent');
      if (b) b.disabled = !canUp;
      const prev = document.getElementById('btnStatusScopeSiblingPrev');
      const next = document.getElementById('btnStatusScopeSiblingNext');
      if (prev) prev.disabled = !canUp;
      if (next) next.disabled = !canUp;
    }

    /**
     * Immediate child folders of parentNorm via Everything (parent: + folder:), then client-sort like the results table.
     * Scope chevrons ← / → : sibling navigation.
     */
    async function fetchSortedSiblingFolderRowsUnderParent(parentNorm) {
      if (!window.tagBrowser || typeof window.tagBrowser.search !== 'function') return [];
      const par = normalizeFolderPathForEverything(String(parentNorm || '').trim());
      if (!par) return [];
      const baseUrl = document.getElementById('baseUrl').value.trim() || 'http://127.0.0.1';
      const maxResultsRaw = document.getElementById('maxResults').value;
      const cap = Math.min(5000, Math.max(1, parseInt(String(maxResultsRaw).trim(), 10) || 200));
      const httpUser = document.getElementById('httpUser').value;
      const httpPassword = document.getElementById('httpPassword').value;
      let searchText = composeScopedEverythingSearch(getSearchScopeCeilingFoldersNorms(), par, '', true).trim() + ' folder:';
      const baseSearchOpts = everythingOptionsForRequest();
      const options = { ...baseSearchOpts, pathSearch: true, offset: 0 };
      const res = await window.tagBrowser.search({
        baseUrl,
        count: String(cap),
        httpUser,
        httpPassword,
        options,
        searchText,
      });
      if (!res || !res.ok) return [];
      let rows = Array.isArray(res.rows) ? res.rows.slice() : [];
      rows = rows.filter(rowIsFolder);
      const parKey = pathNormKey(par);
      rows = rows.filter((r) => pathNormKey(normalizeFolderPathForEverything(T.parentDir(fullPathForRow(r)))) === parKey);
      sortRowsForDisplay(rows, sortColumn, sortAsc);
      return rows;
    }

    /** ← / → among sibling folders under the same parent (order = current table sort). */
    async function goToSiblingScopeFolder(delta) {
      const status = document.getElementById('status');
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) {
        if (status) status.textContent = 'No current folder set.';
        return;
      }
      const norm = normalizeFolderPathForEverything(raw);
      const parRaw = T.parentDir(norm);
      const par = normalizeFolderPathForEverything(parRaw);
      if (!par || pathNormKey(par) === pathNormKey(norm)) {
        if (status) status.textContent = 'No sibling folders at this level.';
        return;
      }
      const rows = await fetchSortedSiblingFolderRowsUnderParent(par);
      if (!rows.length) {
        if (status) status.textContent = 'Could not list folders in parent.';
        return;
      }
      const scopeKey = pathNormKey(norm);
      const idx = rows.findIndex((r) => pathNormKey(fullPathForRow(r)) === scopeKey);
      if (idx < 0) {
        if (status) status.textContent = 'Current folder not in parent listing.';
        return;
      }
      const j = idx + delta;
      if (j < 0 || j >= rows.length) {
        if (status)
          status.textContent = delta < 0 ? 'Already at first sibling folder.' : 'Already at last sibling folder.';
        return;
      }
      await applySearchScopeAndRefresh(normalizeFolderPathForEverything(fullPathForRow(rows[j])));
    }

    /** Move scope folder to parent (toolbar scope / Settings field). */
    async function goToParentScopeFolder() {
      const status = document.getElementById('status');
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) {
        status.textContent = 'No current folder set.';
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

    /** Ctrl+Enter: scope to parent of selected row (row ▲). Uses selectedRow when the path isn’t in lastRows (synthetic scope row). */
    async function keyboardScopeParentOfSelection() {
      if (!selectedFullPath) return;
      const row = selectedRow || findRowByFullPath(selectedFullPath);
      const fp = row ? fullPathForRow(row) : selectedFullPath;
      const parentForScope = normalizeFolderPathForEverything(T.parentDir(fp));
      if (!parentForScope) return;
      await applySearchScopeAndRefresh(parentForScope);
    }

    /**
     * ← on a results row: always moves the current folder.
     * - Item is a direct child of the current folder → parent of current folder (same idea as Backspace).
     * - Item lies deeper → scope to the first subfolder under the current folder on the path to the item.
     * - No current folder set → same as Ctrl+Enter (scope to parent of the row). No selection → parent of current folder only.
     */
    async function keyboardArrowLeftChangeScopeFromResults() {
      if (!selectedFullPath) {
        await goToParentScopeFolder();
        return;
      }
      const scopeNorm = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim()).replace(/[/\\]+$/, '');
      if (!scopeNorm) {
        await keyboardScopeParentOfSelection();
        return;
      }
      const row = selectedRow || findRowByFullPath(selectedFullPath);
      const fp = row ? fullPathForRow(row) : selectedFullPath;
      const par = normalizeFolderPathForEverything(T.parentDir(String(fp || '').trim()));
      const sk = pathNormKey(scopeNorm);
      const pk = pathNormKey(par);
      if (pk === sk) {
        await goToParentScopeFolder();
        return;
      }
      if (!pk.startsWith(sk + '\\')) {
        await keyboardScopeParentOfSelection();
        return;
      }
      const rel = pathRelativeToScopeDir(par);
      const firstSeg = String(rel || '')
        .split(/[/\\]/)
        .filter(Boolean)[0];
      if (!firstSeg) {
        await goToParentScopeFolder();
        return;
      }
      const sep = par.includes('/') && !par.includes('\\') ? '/' : '\\';
      const sub = normalizeFolderPathForEverything(scopeNorm + sep + firstSeg);
      await applySearchScopeAndRefresh(sub);
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

    async function pasteShortcutClipboardIntoScope() {
      const status = document.getElementById('status');
      const dest = currentScopeFolderPath();
      if (!dest) {
        status.textContent = 'Set the current folder (breadcrumb or path editor) to paste into.';
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

      /* Esc: non-empty query → clear query (from #query or non-text focus). Empty query + focus in #query → clear current folder (whole index). No modal / open dropdown. */
      if (
        e.key === 'Escape' &&
        !document.querySelector('.modal.show') &&
        !document.querySelector('.dropdown-menu.show')
      ) {
        const q = document.getElementById('query');
        if (q && String(q.value || '').trim()) {
          const t = e.target;
          if (!isTypingTarget(t) || t === q) {
            e.preventDefault();
            clearSearchQuery();
            return;
          }
        } else if (
          q &&
          e.target === q &&
          !String(q.value || '').trim() &&
          String(document.getElementById('rootFolder').value || '').trim()
        ) {
          e.preventDefault();
          clearSearchScope();
          return;
        }
      }

      const modC = (e.ctrlKey || e.metaKey) && !e.altKey;
      /* Clear current folder from any focus (steals Ctrl/Cmd+Backspace from “delete word” in fields when scope is set). */
      if (modC && !e.shiftKey && e.key === 'Backspace') {
        if (document.querySelector('.modal.show')) return;
        if (!String(document.getElementById('rootFolder').value || '').trim()) return;
        e.preventDefault();
        clearSearchScope();
        return;
      }
      if (modC && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault();
        focusQueryBox(true);
        return;
      }
      if (modC && !e.shiftKey && (e.key === ',' || e.code === 'Comma')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        document.getElementById('btnToggleSettings')?.click();
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
        if (hasNonEmptyDomTextSelection()) return;
        e.preventDefault();
        void keyboardCopyFullPathsText();
        return;
      }
      if (modC && (e.key === 'c' || e.key === 'C')) {
        if (document.querySelector('.modal.show')) return;
        if (isTypingTarget(e.target)) return;
        if (hasNonEmptyDomTextSelection()) return;
        e.preventDefault();
        void copyShortcutExplorerFiles();
        return;
      }
      if (modC && (e.key === 'x' || e.key === 'X')) {
        if (document.querySelector('.modal.show')) return;
        if (isTypingTarget(e.target)) return;
        if (hasNonEmptyDomTextSelection()) return;
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
        void runSearchNow('refresh');
        return;
      }
      if (modC && (e.key === 'f' || e.key === 'F')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        if (e.repeat) return;
        focusQueryBox(true);
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
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowUp' || e.code === 'ArrowUp')) {
        if (document.querySelector('.modal.show')) return;
        /* #query: dedicated capture listener handles (reliable while caret is in the search box). */
        if (e.target && e.target.id === 'query') return;
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
      /* Ctrl+Shift+1…9 / ⌘+Shift+1…9: favourite folder by bar order (1-based); Ctrl+Shift+N stays “new folder”. */
      if (modC && e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        const list = loadFavouriteFolders();
        const idx = Number(e.code.charAt(5)) - 1;
        if (!list[idx]) return;
        e.preventDefault();
        void applySearchScopeAndRefresh(list[idx]);
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
        const q = document.getElementById('query');
        if (e.target === q) { e.preventDefault(); q.blur(); return; }
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
        void runSearchNow('refresh');
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
      if (e.key === 'j') {
        e.preventDefault();
        moveResultsSiblingFolder(1);
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        moveResultsSiblingFolder(-1);
        return;
      }

      /* → on a folder row: scope into that folder; ← : current folder up or into first subfolder on path (see keyboardArrowLeftChangeScopeFromResults) */
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
        void keyboardArrowLeftChangeScopeFromResults();
        return;
      }

      /* +/- toggle tree expand/collapse — multi-select: all top-level folder twisties; single: selected row */
      if ((e.key === '+' || e.key === '-') && isTreeFoldUiActive()) {
        e.preventDefault();
        if (checkedPathsMap.size > 1) {
          const tbody = document.getElementById('tbody');
          if (!tbody) return;
          const folderTrs = Array.from(tbody.querySelectorAll('tr.results-folder-row'));
          if (!folderTrs.length) return;
          const minDepth = Math.min(...folderTrs.map(tr => Number(tr.dataset.treeDepth) || 1));
          for (const tr of folderTrs) {
            if (Number(tr.dataset.treeDepth) !== minDepth) continue;
            const twisty = tr.querySelector('.results-tree-twisty');
            if (twisty) twisty.click();
          }
          return;
        }
        if (!selectedFullPath) return;
        const row = selectedRowForActions();
        if (!row || !rowIsFolder(row)) return;
        const tr = document.querySelector('#resultsTable tbody tr.table-active');
        if (!tr) return;
        const twisty = tr.querySelector('.results-tree-twisty');
        if (twisty) twisty.click();
        return;
      }

      /* x: Smart view; l still cycles Tree → Smart → Flat. */
      if (e.key === 'x') {
        e.preventDefault();
        const t = document.getElementById('optRvSmart');
        if (t && !t.checked) {
          t.checked = true;
          syncViewRadioActiveFromDom();
          t.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      /* l / f / s: toggle View / Content / Subfolders radio pairs */
      if (e.key === 'l') {
        e.preventDefault();
        const vl = ['optRvTree', 'optRvSmart', 'optRvFlat'];
        const ci = vl.findIndex((id) => document.getElementById(id)?.checked);
        const nextId = vl[(ci >= 0 ? ci : 0) + 1 >= vl.length ? 0 : ci + 1];
        const t = document.getElementById(nextId);
        if (t) {
          t.checked = true;
          syncViewRadioActiveFromDom();
          t.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      if (e.key === 'f') {
        e.preventDefault();
        const cl = ['optRvDirsOnly', 'optRvAll', 'optRvFilesOnly'];
        const ci = cl.findIndex((id) => document.getElementById(id)?.checked);
        const nextId = cl[(ci >= 0 ? ci : 0) + 1 >= cl.length ? 0 : ci + 1];
        const t = document.getElementById(nextId);
        if (t) {
          t.checked = true;
          syncViewRadioActiveFromDom();
          t.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      if (e.key === 's') { e.preventDefault(); toggleViewRadioPair('optRvSubsOn', 'optRvSubsOff'); return; }
      /* z / m / n: sort by size / modified / name (in Tree, switches to Flat first — see status bar). */
      if (e.key === 'z') {
        e.preventDefault();
        const note = flatViewOnIfTreeForColumnSort();
        applySortColumnKey('size', note || undefined);
        return;
      }
      if (e.key === 'm') {
        e.preventDefault();
        const note = flatViewOnIfTreeForColumnSort();
        applySortColumnKey('date_modified', note || undefined);
        return;
      }
      if (e.key === 'n') {
        e.preventDefault();
        const note = flatViewOnIfTreeForColumnSort();
        applySortColumnKey('name', note || undefined);
        return;
      }
      if (e.key === 't') { e.preventDefault(); keyboardOpenTagsModal(); return; }
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

    /** Settings offcanvas: search scope limit buttons (delegation — reliable inside Bootstrap offcanvas). */
    function wireSearchScopeSettingsUiOnce() {
      const panel = document.getElementById('settingsPanel');
      if (!panel || panel.dataset.tagfoxSearchScopeUi === '1') return;
      panel.dataset.tagfoxSearchScopeUi = '1';
      panel.addEventListener('click', (e) => {
        const dismiss = e.target.closest('#btnDismissSearchScopeTip');
        if (dismiss) {
          e.preventDefault();
          localStorage.setItem(LS.scopeRootsTipDismissed, '1');
          syncSearchScopeRootsTipVisibility();
          return;
        }
        const clearMax = e.target.closest('#btnSearchScopeClearMax');
        if (clearMax) {
          e.preventDefault();
          clearSearchScopeMaxSetting();
          return;
        }
        const addFolder = e.target.closest('#btnSearchScopeAddFolder');
        const addProfile = e.target.closest('#btnSearchScopeAddProfile');
        const addCurrent = e.target.closest('#btnSearchScopeAddCurrent');
        if (!addFolder && !addProfile && !addCurrent) return;
        e.preventDefault();
        const st = document.getElementById('status');
        void (async () => {
          if (!window.tagBrowser) {
            if (st) st.textContent = 'Electron bridge missing — run TagFox with npm start (not a raw browser tab).';
            console.warn('[TagFox] window.tagBrowser missing');
            return;
          }
          if (addFolder) {
            if (typeof window.tagBrowser.pickScopeFolder !== 'function') {
              if (st)
                st.textContent =
                  'Folder picker not available — fully quit TagFox and start again so preload.js is reloaded.';
              console.warn('[TagFox] pickScopeFolder missing on tagBrowser');
              return;
            }
            try {
              const r = await window.tagBrowser.pickScopeFolder();
              if (r && r.ok && r.path) await setSearchScopeMaxFromPicker(r.path);
              else if (st) st.textContent = (r && r.error) || 'Folder picker cancelled.';
            } catch (err) {
              if (st) st.textContent = 'Folder picker failed: ' + (err && err.message ? err.message : String(err));
              console.warn('[TagFox] pickScopeFolder', err);
            }
            return;
          }
          if (addProfile) {
            if (typeof window.tagBrowser.userHomeDir !== 'function') {
              if (st) st.textContent = 'Profile folder not available — restart TagFox.';
              console.warn('[TagFox] userHomeDir missing on tagBrowser');
              return;
            }
            try {
              const r = await window.tagBrowser.userHomeDir();
              if (r && r.ok && r.path) await setSearchScopeMaxFromPicker(r.path);
              else if (st) st.textContent = (r && r.error) || 'Could not read profile folder.';
            } catch (err) {
              if (st) st.textContent = 'Profile folder failed: ' + (err && err.message ? err.message : String(err));
              console.warn('[TagFox] userHomeDir', err);
            }
            return;
          }
          if (addCurrent) {
            const p = currentScopeFolderPath() || getSearchScopeMaxFolderNorm();
            if (!p) {
              if (st) st.textContent = 'No folder — set the breadcrumb or scope first.';
              return;
            }
            await setSearchScopeMaxFromPicker(p);
          }
        })();
      });
    }

    const treeViewDefaultsFreshProfile = localStorage.getItem(LS.sortBy) === null;
    loadSettings();
    void refreshDriveRootsPickerGate();
    wireSearchScopeSettingsUiOnce();
    document.getElementById('autoRefreshSec')?.addEventListener('change', () => {
      saveSettings();
      syncAutoRefreshTimer();
    });

    window.addEventListener('beforeunload', () => {
      stopAutoRefreshTimer();
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
    const HELP_TAB_IDS = [
      'essentials',
      'motivation',
      'features',
      'search',
      'files-folders',
      'favourites',
      'shelf',
      'projects',
      'gotchas',
      'installation',
      'shortcuts',
    ];
    function restoreHelpModalTab() {
      const raw = localStorage.getItem(LS.helpModalTab);
      const id = HELP_TAB_IDS.includes(raw) ? raw : 'essentials';
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
    document.getElementById('btnEverythingHttpOpenSettings')?.addEventListener('click', () => {
      document.getElementById('btnToggleSettings')?.click();
    });
    document.getElementById('btnEverythingHttpSetupHelp')?.addEventListener('click', () => {
      try {
        localStorage.setItem(LS.helpModalTab, 'installation');
      } catch (_) {
        /* ignore */
      }
      const hm = document.getElementById('helpModal');
      if (hm) bootstrap.Modal.getOrCreateInstance(hm).show();
    });
    document.getElementById('btnEverythingHttpHelpDismiss')?.addEventListener('click', () => {
      hideEverythingHttpHelpBanner();
    });
    document.getElementById('btnShelfOpen').addEventListener('click', async () => {
      const st = await window.tagBrowser.shelfState();
      if (st.ok) void window.tagBrowser.openPath(st.path);
      else document.getElementById('status').textContent = st.error || 'Shelf unavailable';
    });
    document.getElementById('btnShelfOsDrag').addEventListener('click', () => {
      tagBrowserNextOsFileDrag = true;
      document.getElementById('status').textContent =
        'Next drag armed as a real file drag — drop into Explorer or another app. Without this, drags stay inside TagFox.';
    });
    document.getElementById('btnShelfClear').addEventListener('click', async () => {
      if (!confirm('Remove everything from Shelf?')) return;
      const r = await window.tagBrowser.clearShelf();
      document.getElementById('status').textContent = r.ok ? 'Shelf cleared.' : (r.error || 'Clear failed');
      // On success, main sends paths-mutated → refreshAfterDiskMutation (shelf strip + search retries).
    });
    loadPaneWidthsFromStorage();
    loadColWidthsFromStorage();
    if (treeViewDefaultsFreshProfile) {
      if (localStorage.getItem(LS.flatView) === null && localStorage.getItem(LS.resultsViewMode) === null) {
        setResultsViewRadios('smart', true, 'all');
        localStorage.setItem(LS.resultsLayout, 'smart');
        localStorage.setItem(LS.resultsContent, 'all');
        localStorage.setItem(LS.flatView, '0');
        localStorage.setItem(LS.showSubfolders, '1');
        localStorage.setItem(LS.hideFiles, '0');
        localStorage.setItem(LS.treeView, '1');
      }
      sortColumn = 'path';
      sortAsc = true;
      localStorage.setItem(LS.sortBy, sortColumn);
      localStorage.setItem(LS.optAsc, '1');
    }
    /* Dark / light mode: apply saved preference, wire toggle button */
    (function initDarkMode() {
      const html = document.documentElement;
      const saved = localStorage.getItem(LS.darkMode);
      if (saved === '1') html.setAttribute('data-bs-theme', 'dark');
      document.getElementById('btnToggleDarkMode')?.addEventListener('click', () => {
        const isDark = html.getAttribute('data-bs-theme') === 'dark';
        if (isDark) { html.removeAttribute('data-bs-theme'); localStorage.setItem(LS.darkMode, '0'); }
        else { html.setAttribute('data-bs-theme', 'dark'); localStorage.setItem(LS.darkMode, '1'); }
      });
    })();

    seedSearchHistoryFromCurrent();
    bindVerticalSplitters();
    document.getElementById('propsTheaterBackdrop').addEventListener('click', () => setPropsTheaterMode(false));
    document.getElementById('btnPropsTheaterToggle').addEventListener('click', () => togglePropsTheaterMode());
    updateSortHeaders();
    bindFavouriteBarsDragReorderOnce();
    renderFavFoldersBar();
    renderFavSearchesBar();
    renderTagBar();
    renderTable();
    scheduleSearch();
    void renderShelf().then(() => refreshTagFoxChromeTooltips(document.body));
    requestAnimationFrame(() => requestAnimationFrame(focusSearchBox));
    window.addEventListener('focus', () => requestAnimationFrame(focusSearchBox));
