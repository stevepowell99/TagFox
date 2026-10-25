// TagFox renderer UI logic (after vendor scripts + tags.js).
    const T = window.TagBrowserTags;
    /** Pretty filename for one path segment (strip bracket tags). */
    function segmentPretty(name) {
      return T.parseSegmentTags(name).pretty;
    }
    



    if (!(window.bootstrap && window.marked && window.mammoth && window.XLSX && window.JSZip && window.CodeMirror))
      throw new Error('Vendor scripts missing — run npm install (syncs vendor/ via postinstall).');
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
      foldersOnly: 'tagBrowserFoldersOnly',
      filesOnly: 'tagBrowserFilesOnly',
      showSubfolders: 'tagBrowserShowSubfolders',
      hideFiles: 'tagBrowserHideFiles',
      favFolders: 'tagBrowserFavFolders',
      folderFocusStats: 'tagBrowserFolderFocusStats',
      fileFocusStats: 'tagBrowserFileFocusStats',
      searchScopeCeilings: 'tagBrowserSearchScopeCeilings',
      searchScopeMax: 'tagBrowserSearchScopeMax',
      tagStore: 'tagBrowserTagStore',
      knownBracketTags: 'tagBrowserKnownBracketTags',
      activeTagFilter: 'tagBrowserActiveTag',
      excludedTagFilter: 'tagBrowserExcludedTag',
      tagFilterCombineOr: 'tagBrowserTagCombineOr',
      recencyFilter: 'tagBrowserRecencyFilter',
      searchDebug: 'tagBrowserSearchDebug',
      helpModalTab: 'tagBrowserHelpModalTab',
      autoRefreshSec: 'tagBrowserAutoRefreshSec',
      autoRefreshDefaultMoved: 'tagBrowserAutoRefreshDefaultMoved',
      optPathDefaultMoved: 'tagBrowserOptPathDefaultMoved',
      darkMode: 'tagBrowserDarkMode',
      pageZoom: 'tagBrowserPageZoom',
      folderGroupHighlight: 'tagBrowserTreeGroupHL',
      highlightMatchedNames: 'tagBrowserHighlightMatchedNames',
      resultThumbnails: 'tagBrowserResultThumbnails',
      hoverPreview: 'tagBrowserHoverPreview',
      resultsContent: 'tagBrowserResultsContent',
      gdriveShortcutNames: 'tagBrowserGDriveShortcutNames',
      quickTodoFolder: 'tagBrowserQuickTodoFolder',
      globalViewerBasenames: 'tagBrowserGlobalViewerBasenames',
      viewerDocSplitPct: 'tagBrowserViewerDocSplitPct',
      viewerDocSplitPctTheater: 'tagBrowserViewerDocSplitPctTheater',
      /* Runner layout: which layout the toggle key opens, and each layout's search state while the other is up. */
      runnerState: 'tagBrowserRunnerState',
      runnerClassicStash: 'tagBrowserRunnerClassicStash',
      runnerSort: 'tagBrowserRunnerSort',
      /* Saved searches, run as / commands and Alt+1…9. Classic's list under the same key, so its entries carry on. */
      favSearches: 'tagBrowserFavSearches',
      runnerHideTemp: 'tagBrowserRunnerHideTemp',
      runnerStarredOnly: 'tagBrowserRunnerStarredOnly',
      runnerThisFolderOnly: 'tagBrowserRunnerThisFolderOnly',
      runnerViewerOff: 'tagBrowserRunnerViewerOff',
      runnerViewerWidthPx: 'tagBrowserRunnerViewerW',
      runnerWordStarts: 'tagBrowserRunnerWordStarts',
      /* Set once Runner's old hide-~ default has been carried over to showing ~ paths ranked down. */
      runnerTildeShownMoved: 'tagBrowserRunnerTildeShownMoved',
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
    /** Global `xk/xp/xx` tag names: rescan + adds; not scope-local (LS + userData JSON). */
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
        excludedFilter: [...excludedTagKeys].sort(),
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
        const exc = Array.isArray(snap.excludedFilter) ? snap.excludedFilter.map((x) => String(x).trim().toLowerCase()) : [];
        excludedTagKeys = new Set(exc.filter((k) => activeTagKeys.has(k)));
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

    /** Runner's Viewer width once its divider has been dragged; null keeps it at a third of the window. */
    let runnerViewerPx = null;
    const PROPS_PANE_MIN_PX = 200;
    const PROPS_PANE_MAX_PX = 1600;
    /* The results pane keeps this much whatever the Viewer asks for, so a drag cannot crush it. */
    const RESULTS_PANE_MIN_PX = 320;
    let viewerDocSplitPct = 50;
    let viewerDocSplitPctTheater = 50;

    let lastRows = [];
    /** HTML5 drag payload for moving rows onto folder rows in the results table. */
    const TAG_BROWSER_PATHS_DRAG_TYPE = 'application/x-tagbrowser-paths';
    /** startDrag path: OS sets no custom MIME on dragover; stash until dragend. Not used for normal HTML5 drags. */
    let tagBrowserActiveNativeDragPaths = null;
    let tagBrowserActiveNativeDragPathsAt = 0;
    /** dragend is not guaranteed after a native startDrag (Esc, drop outside the window); age caps replay of old paths. */
    const NATIVE_DRAG_STASH_MAX_AGE_MS = 5 * 60 * 1000;
    function activeNativeDragPathsLive() {
      if (!tagBrowserActiveNativeDragPaths || !tagBrowserActiveNativeDragPaths.length) return null;
      if (Date.now() - tagBrowserActiveNativeDragPathsAt > NATIVE_DRAG_STASH_MAX_AGE_MS) {
        tagBrowserActiveNativeDragPaths = null;
        return null;
      }
      return tagBrowserActiveNativeDragPaths;
    }
    /** One-shot: next row/Shelf-chip drag uses OS file drag (Explorer); normal drag stays HTML5 for in-app. */
    let tagBrowserNextOsFileDrag = false;

    function dataTransferHasTagBrowserPaths(dt) {
      try {
        return [...dt.types].includes(TAG_BROWSER_PATHS_DRAG_TYPE);
      } catch {
        return false;
      }
    }

    /** File-shaped drag: Files/uri-list types, file items, or no types at all (native dragover may expose none). */
    function dataTransferLooksLikeOsFileDrag(dt) {
      try {
        const types = [...dt.types];
        if (!types.length) return true;
        if (types.includes('Files') || types.includes('text/uri-list')) return true;
        if (dt.items && dt.items.length) {
          for (let i = 0; i < dt.items.length; i++) {
            if (dt.items[i].kind === 'file') return true;
          }
        }
      } catch {
        return false;
      }
      return false;
    }

    /** Custom MIME, active native row drag, or OS file drag (Explorer / uri-list / file items). */
    function dataTransferHasTagBrowserOrFiles(dt) {
      if (dataTransferHasTagBrowserPaths(dt)) return true;
      /* Native stash counts only while the hovering drag is file-shaped, so a stale stash cannot hijack a text drag. */
      if (activeNativeDragPathsLive() && dataTransferLooksLikeOsFileDrag(dt)) return true;
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

    /** While dragging result rows (HTML5 paths): dimly outline breadcrumb/fav/Shelf/other rows. */
    function setInternalPathDragDropTargetHints(on) {
      document.body.classList.toggle('tagfox-internal-path-drag', !!on);
    }

    /** Drop hints + source row marker — dragend, and renderTable (tbody wipe can skip dragend; body class would stick). */
    function clearInternalPathDragDropTargetHints() {
      document.querySelectorAll('.tagfox-results-row--drag-source').forEach((n) => n.classList.remove('tagfox-results-row--drag-source'));
      document.body.classList.remove('tagfox-internal-path-drag');
    }
    let sortColumn = 'name';
    let sortAsc = true;
    let searchDebounceTimer = null;
    const SEARCH_DEBUG_MAX = 3500;
    let searchDebugLines = [];
    /** Saved before console is wrapped — searchDebugLog mirrors without recursion. */
    const nativeConsole = {
      log: console.log.bind(console),
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    /** Incremented at each runSearch start; in-flight HTTP from an older id must not touch UI (overlapping debounced runs). */
    let searchRunSeq = 0;
    /** The main query's text as sent to Everything, for the test hook. */
    let lastMainSearchText = '';
    /** Runner's extra queries as sent alongside it, for the test hook. */
    let lastRunnerExtraSearchTexts = [];
    /** True while runSearch() awaits Everything (auto-refresh skips ticks to avoid overlap). */
    let searchInFlight = false;
    /** True while loadMoreResults() is fetching the next Everything page. */
    let resultsLoadMoreBusy = false;
    /** Offset paging: replay same query with higher Everything offset (null = no further pages for current search). */
    let resultsPagingCtx = null;
    /** One search flow at a time: serializes runSearchNow. */
    let searchMutex = Promise.resolve();
    /* Runner: every top-level search request takes a number, and the search holding the mutex keeps its own,
       so one that a newer request has overtaken stops sending queries (runSearchNow, runnerSearchSuperseded). */
    let searchRequestSeq = 0;
    let activeSearchRequest = 0;
    /* Counted so a test can prove that an overtaken search sent nothing, rather than infer it from timings. */
    const runnerSearchCounters = { run: 0, stepAside: 0, extraSent: 0 };
    /** True while a runSearchNow flow holds the mutex; the test harness waits for it to clear. */
    let searchFlowRunning = false;
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
    const DID_YOU_KNOW_ROTATE_MS = 4 * 60 * 1000;
    /** Fade the tip out this long after it updates; the next rotation shows it again. */
    const DID_YOU_KNOW_FADE_MS = 60 * 1000;
    /** Tips + scores: did-you-know-tips.js → window.TagFoxDidYouKnowTips (empty array if load failed). */
    const DID_YOU_KNOW_TIPS = window.TagFoxDidYouKnowTips || Object.freeze([]);
    let didYouKnowBag = [];
    let didYouKnowLastTipKey = '';
    let didYouKnowTimerId = null;
    let didYouKnowFadeTimerId = null;
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

    /* View: Subfolders (on first); Content: all | folders | files. */
    function isShowSubfolders() { return !!document.getElementById('optRvSubsOn')?.checked; }
    /** @returns {'all'|'folders'|'files'} */
    function resultsContentMode() {
      if (document.getElementById('optRvDirsOnly')?.checked) return 'folders';
      if (document.getElementById('optRvFilesOnly')?.checked) return 'files';
      return 'all';
    }
    function isFoldersOnly() { return resultsContentMode() === 'folders'; }
    function isFilesOnly() { return resultsContentMode() === 'files'; }
    function isAllContent() { return resultsContentMode() === 'all'; }

    /** Apply the subfolders and content radios only (no save/search). */
    function applyResultsViewRadiosToDom(showSubs, content) {
      document.getElementById('optRvSubsOn').checked = !!showSubs;
      document.getElementById('optRvSubsOff').checked = !showSubs;
      const c = content === 'folders' ? 'folders' : content === 'files' ? 'files' : 'all';
      document.getElementById('optRvDirsOnly').checked = c === 'folders';
      document.getElementById('optRvAll').checked = c === 'all';
      document.getElementById('optRvFilesOnly').checked = c === 'files';
    }

    /** Restore: subfolders on or off, content all|folders|files; no save, no search. */
    function setResultsViewRadios(showSubs, content) {
      applyResultsViewRadiosToDom(showSubs, content);
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

    /** Settings: a selected folder is framed together with the rows under it that follow it. */
    function isFolderGroupHighlightOn() { return !!document.getElementById('optFolderGroupHighlight')?.checked; }

    /** Yellow markup for search terms in Name / Path cells (Settings → Search results). Default on. */
    function isHighlightMatchedNamesOn() {
      const el = document.getElementById('optHighlightMatchedNames');
      if (el) return !!el.checked;
      return localStorage.getItem(LS.highlightMatchedNames) !== '0';
    }

    /** @type {Set<string>} lowercase keys of the tag filters, combined with AND unless tagFilterCombineOr. */
    let activeTagKeys = new Set();
    /** @type {Set<string>} subset of activeTagKeys that are negated (not-B). */
    let excludedTagKeys = new Set();
    /** Multiple tag filters: false = AND (default), true = OR (Everything regex + client filter). */
    let tagFilterCombineOr = false;
    /** Tag modal targets (length 1 = single-name edit, &gt;1 = union add/remove on each). */
    let modalTargetPaths = [];
    let modalTags = [];
    /** 'rename' = existing paths; 'folderDocDraft' = the new folder doc's name (no rename until Save). */
    let tagModalMode = 'rename';
    /** Tags for the next TODO file (default TODO), set in the Quick TODO box. */
    let newTodoMdTags = ['TODO'];
    /** Bracket tags for the folder doc file name (stem + ext in UI); applied on Save in the readme editor. */
    let folderDocMdTags = [];
    /** The folder doc on screen exists on disk (syncFolderDocHeaderExists): its name is a label, not a field. */
    let folderDocFoundOnDisk = false;
    /** Default folder doc stem (no ext); `-` sorts before letters in typical name order. */
    const DEFAULT_FOLDER_DOC_STEM = '-readme';
    /** When set: viewer uses this path or FOLDER_DOC_OVERRIDE_NEW instead of resolveFolderViewerDoc’s first match. */
    const FOLDER_DOC_OVERRIDE_NEW = '__folderDocNew__';
    let folderDocViewerOverridePath = null;
    /** pathKeyLoose(doc path) last mirrored into stem/ext/tags — avoids refresh resetting a new filename. */
    let folderDocHeaderLastSyncedKey = '';
    /** Multi-select checkboxes: path key lowercase → canonical path */
    const checkedPathsMap = new Map();
    /** Invalidates in-flight j/k follow-up scroll when another sibling nav runs. */
    let siblingNavScrollToken = 0;
    let tagModalInst = null;
    let bulkRenameModalInst = null;
    /** Paths captured when bulk rename opens — preview and Apply use this list. */
    let bulkRenameTargetPaths = [];
    let tagRenameBusy = false;
    /** Recent from→to renames; reapplied after every runSearch/loadMore while Everything may still list the old path. */
    let tagRenamePendingPairs = null;
    let tagRenamePendingPairsClearTimer = null;
    let renameItemBusy = false;

    let selectedRow = null;
    let selectedFullPath = null;
    /** Index in listRowsForUi() for Shift+↑/↓ range checkbox select; cleared on plain ↑/↓. */
    let resultsShiftRangeAnchorIdx = null;
    /** Plain-click uncheck on a checked row is deferred so double-click (detail 2) can cancel it. */
    let resultsRowUncheckTimer = null;
    let resultsRowUncheckPendingFp = null;
    /** Coalesce scrollIntoView during rapid ↑/↓ — one rAF, latest .table-active row only. */
    let resultsActiveRowScrollRaf = null;
    let activeReadmePath = null;
    /** True after a successful read (or save) of activeReadmePath — ENOENT on that path is normal before first save; detach must not clear the binding then. */
    let readmeSaveTargetVerifiedOnDisk = false;
    /** After folder readme RHS is shown — same as `pathKeyLoose(folder)` so quick refresh does not hide readme / “Loading…”. */
    let lastReadmeFolderPathLoose = '';
    /** Session-only: nested doc aggregate from selected folder (or parent of a trigger file). */
    let globalNestedReadmeView = false;
    /** Third viewer-doc mode: thumbnail grid of the current folder's files (mutually exclusive with nested). */
    let folderThumbsView = false;
    let folderThumbsRenderedSig = '';
    let folderThumbsObserver = null;
    /** Newest loadFolderThumbnails run wins: a toggle and a search-completion refresh can overlap, and
        without this the slower (older) run finishes last and clobbers the grid with its stale result. */
    let folderThumbsRunSeq = 0;
    /** Click handler on #readmePreview for per-section Edit/Save/Cancel in nested mode. */
    let nestedReadmePreviewClickHandler = null;
    /** Shallow copies of section records for cancel/save sync (mutate .text on save). */
    let globalNestedCompositeSections = [];
    let activeMdPath = null;
    /** RHS .md / .txt editor: path the textarea belongs to + debounced write */
    let mdAutosaveTimer = null;
    let mdAutosaveTargetPath = null;
    /** Exactly what the mdFile buffer was loaded with, so a write can tell an edit from a stale buffer. */
    let mdAutosaveLoadedText = null;
    const MD_AUTOSAVE_MS = 450;
    const viewerMdEditors = { readme: null, mdFile: null };

    function moveViewerMdSelectedLines(cm, delta) {
      if (!cm || !window.CodeMirror || !delta) return;
      const doc = cm.getDoc();
      const Pos = window.CodeMirror.Pos;
      const selections = doc.listSelections();
      if (!selections.length) return;
      const blocks = [];
      for (const sel of selections) {
        const from = sel.from();
        const to = sel.to();
        let startLine = from.line;
        let endLine = to.line;
        if (!sel.empty() && to.ch === 0 && endLine > startLine) endLine -= 1;
        blocks.push({ startLine, endLine });
      }
      blocks.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
      const merged = [];
      for (const block of blocks) {
        const prev = merged[merged.length - 1];
        if (prev && block.startLine <= prev.endLine + 1) {
          prev.endLine = Math.max(prev.endLine, block.endLine);
        } else {
          merged.push({ startLine: block.startLine, endLine: block.endLine });
        }
      }
      if (delta < 0 && merged[0].startLine <= 0) return;
      if (delta > 0 && merged[merged.length - 1].endLine >= doc.lastLine()) return;
      const shiftPos = (pos) => {
        const line = Math.max(0, Math.min(doc.lastLine(), pos.line + delta));
        return Pos(line, Math.min(pos.ch, doc.getLine(line).length));
      };
      cm.operation(() => {
        const order = delta > 0 ? merged.slice().reverse() : merged;
        for (const block of order) {
          if (delta < 0) {
            const aboveLine = block.startLine - 1;
            const aboveText = doc.getLine(aboveLine);
            const blockText = doc.getRange(Pos(block.startLine, 0), Pos(block.endLine, doc.getLine(block.endLine).length));
            doc.replaceRange(
              blockText + '\n' + aboveText,
              Pos(aboveLine, 0),
              Pos(block.endLine, doc.getLine(block.endLine).length),
              '+moveLines'
            );
          } else {
            const belowLine = block.endLine + 1;
            const belowText = doc.getLine(belowLine);
            const blockText = doc.getRange(Pos(block.startLine, 0), Pos(block.endLine, doc.getLine(block.endLine).length));
            doc.replaceRange(
              belowText + '\n' + blockText,
              Pos(block.startLine, 0),
              Pos(belowLine, doc.getLine(belowLine).length),
              '+moveLines'
            );
          }
        }
        doc.setSelections(
          selections.map((sel) => ({
            anchor: shiftPos(sel.anchor),
            head: shiftPos(sel.head),
          }))
        );
      });
      cm.scrollIntoView(doc.getCursor(), 40);
    }

    function addNextMatchToViewerSelection(cm) {
      if (!cm || !window.CodeMirror) return;
      const doc = cm.getDoc();
      const primary = doc.listSelections()[doc.listSelections().length - 1];
      if (!primary) return;
      if (primary.empty()) {
        const word = cm.findWordAt(primary.head);
        const wordText = doc.getRange(word.anchor, word.head);
        if (!wordText) return;
        doc.setSelection(word.anchor, word.head);
        return;
      }
      const query = doc.getRange(primary.from(), primary.to());
      if (!query) return;
      const keyOf = (from, to) => `${from.line}:${from.ch}-${to.line}:${to.ch}`;
      const selectedKeys = new Set(
        doc.listSelections().map((sel) => keyOf(sel.from(), sel.to()))
      );
      const searchStarts = [primary.to(), { line: 0, ch: 0 }];
      for (const start of searchStarts) {
        const cursor = doc.getSearchCursor(query, start);
        while (cursor.findNext()) {
          const from = cursor.from();
          const to = cursor.to();
          const key = keyOf(from, to);
          if (selectedKeys.has(key)) continue;
          doc.addSelection(from, to);
          cm.scrollIntoView({ from, to }, 40);
          return;
        }
      }
    }

    /** Shared markdown editor config for the RHS viewer. */
    function createViewerMarkdownEditor(textarea) {
      if (!textarea || !window.CodeMirror) return null;
      const cm = window.CodeMirror.fromTextArea(textarea, {
        mode: 'markdown',
        lineNumbers: false,
        lineWrapping: true,
        indentUnit: 2,
        tabSize: 2,
        smartIndent: true,
        extraKeys: {
          Enter: 'newlineAndIndentContinueMarkdownList',
          Tab(cmInst) {
            if (cmInst.somethingSelected()) {
              cmInst.indentSelection('add');
              return;
            }
            cmInst.replaceSelection('  ', 'end', '+input');
          },
          'Shift-Tab'(cmInst) {
            cmInst.indentSelection('subtract');
          },
          'Ctrl-F': 'findPersistent',
          'Cmd-F': 'findPersistent',
          'Ctrl-G': 'findNext',
          'Cmd-G': 'findNext',
          'Shift-Ctrl-G': 'findPrev',
          'Shift-Cmd-G': 'findPrev',
          'Ctrl-H': 'replace',
          'Cmd-Alt-F': 'replace',
          'Alt-G': 'jumpToLine',
          'Alt-Up'(cmInst) {
            moveViewerMdSelectedLines(cmInst, -1);
          },
          'Alt-Down'(cmInst) {
            moveViewerMdSelectedLines(cmInst, 1);
          },
          'Ctrl-D'(cmInst) {
            addNextMatchToViewerSelection(cmInst);
          },
          'Cmd-D'(cmInst) {
            addNextMatchToViewerSelection(cmInst);
          },
        },
      });
      cm.getWrapperElement().classList.add('viewer-md-cm');
      cm.getInputField()?.setAttribute('spellcheck', 'false');
      cm.on('change', () => {
        textarea.value = cm.getValue();
      });
      textarea.value = cm.getValue();
      return cm;
    }

    function getViewerMdTextarea(which) {
      return document.getElementById(which === 'mdFile' ? 'mdFileEditor' : 'readmeEditor');
    }

    function getViewerMdEditor(which) {
      return viewerMdEditors[which] || null;
    }

    function ensureViewerMdEditor(which) {
      const existing = getViewerMdEditor(which);
      if (existing) return existing;
      const textarea = getViewerMdTextarea(which);
      const cm = createViewerMarkdownEditor(textarea);
      if (cm) viewerMdEditors[which] = cm;
      return cm;
    }

    function getViewerMdValue(which) {
      const cm = getViewerMdEditor(which);
      if (cm) return cm.getValue();
      return getViewerMdTextarea(which)?.value || '';
    }

    function setViewerMdValue(which, text) {
      const next = String(text ?? '');
      const textarea = getViewerMdTextarea(which);
      if (textarea) textarea.value = next;
      const cm = ensureViewerMdEditor(which);
      if (cm && cm.getValue() !== next) cm.setValue(next);
    }

    function focusViewerMdEditor(which, placeCaretAtEnd) {
      const cm = ensureViewerMdEditor(which);
      if (cm) {
        cm.focus();
        if (placeCaretAtEnd) {
          const doc = cm.getDoc();
          const line = doc.lastLine();
          const ch = doc.getLine(line).length;
          doc.setCursor({ line, ch });
          cm.scrollIntoView({ line, ch }, 40);
        }
        return;
      }
      const textarea = getViewerMdTextarea(which);
      if (!textarea) return;
      textarea.focus();
      if (placeCaretAtEnd) {
        try {
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        } catch (_) {}
      }
    }

    function replaceViewerMdSelection(which, text) {
      const insert = String(text ?? '');
      const cm = getViewerMdEditor(which);
      if (cm) {
        const doc = cm.getDoc();
        doc.replaceRange(insert, doc.getCursor('from'), doc.getCursor('to'), '+input');
        const cursor = doc.getCursor();
        cm.focus();
        cm.scrollIntoView(cursor, 40);
        return cm.getValue();
      }
      const textarea = getViewerMdTextarea(which);
      if (!textarea) return '';
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      textarea.value = value.slice(0, start) + insert + value.slice(end);
      const caret = start + insert.length;
      textarea.selectionStart = textarea.selectionEnd = caret;
      return textarea.value;
    }

    function initNestedMarkdownEditor(textarea) {
      if (!textarea || textarea._tagfoxCm) return textarea?._tagfoxCm || null;
      const cm = createViewerMarkdownEditor(textarea);
      if (!cm) return null;
      textarea._tagfoxCm = cm;
      return cm;
    }

    function getNestedMarkdownValue(textarea) {
      return textarea && textarea._tagfoxCm ? textarea._tagfoxCm.getValue() : textarea?.value || '';
    }

    function setNestedMarkdownValue(textarea, text) {
      const next = String(text ?? '');
      if (textarea) textarea.value = next;
      const cm = initNestedMarkdownEditor(textarea);
      if (cm && cm.getValue() !== next) cm.setValue(next);
    }

    function focusNestedMarkdownEditor(textarea) {
      const cm = initNestedMarkdownEditor(textarea);
      if (cm) {
        cm.focus();
        return;
      }
      textarea?.focus();
    }

    /** Default list shared by folder-doc pick and nested-doc aggregate (same order as main). */
    const DEFAULT_GLOBAL_VIEWER_BASENAMES_LIST = [
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
    const DEFAULT_GLOBAL_VIEWER_BASENAMES_STR = DEFAULT_GLOBAL_VIEWER_BASENAMES_LIST.join(', ');
    /** User list: comma/semicolon/newline; pretty names (readme xkt.md → readme.md); no path segments. */
    function normalizeGlobalViewerBasenamesList(raw) {
      const parts = String(raw ?? '')
        .split(/[,;\n]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s && !/[\\/]/.test(s));
      const uniq = [...new Set(parts)];
      return uniq.length ? uniq : DEFAULT_GLOBAL_VIEWER_BASENAMES_LIST.slice();
    }
    function getGlobalViewerBasenamesList() {
      const stored = localStorage.getItem(LS.globalViewerBasenames);
      return normalizeGlobalViewerBasenamesList(
        stored != null && String(stored).trim() ? stored : DEFAULT_GLOBAL_VIEWER_BASENAMES_STR
      );
    }
    function syncGlobalViewerBasenamesInputFromStorage() {
      const inp = document.getElementById('inpGlobalViewerBasenames');
      if (!inp) return;
      inp.value = getGlobalViewerBasenamesList().join(', ');
    }
    function isGlobalViewerMarkdownFilePath(fullPath) {
      const leaf = T.baseName(fullPath || '');
      const pretty = String(T.parseSegmentTags(leaf).pretty || '').toLowerCase();
      // Any readme-named .md/.txt is a folder doc (tag-tolerant), plus the configured basenames.
      if (/readme/.test(pretty) && /\.(md|txt)$/.test(pretty)) return true;
      return getGlobalViewerBasenamesList().includes(pretty);
    }
    /** Directory for folder-doc / nested aggregate: selected folder, or parent of a trigger .md file. */
    function readmeAggregateRootFolderFromSelection(fullPath, row) {
      if (!fullPath || !row) return null;
      if (rowIsFolder(row)) return String(fullPath).replace(/[/\\]+$/, '');
      if (isGlobalViewerMarkdownFilePath(fullPath)) {
        const par = T.parentDir(fullPath);
        return par ? String(par).replace(/[/\\]+$/, '') : null;
      }
      return null;
    }
    /** Matches lastReadmeFolderPathLoose across quick refresh (folder row, or trigger file + nested/thumbs toggle). */
    function readmeBlockQuickVisibleFolderKey(propPath, propRow) {
      if (!propPath || !propRow) return '';
      if (rowIsFolder(propRow)) return pathKeyLoose(propPath);
      if ((globalNestedReadmeView || folderThumbsView) && isGlobalViewerMarkdownFilePath(propPath)) {
        const par = T.parentDir(propPath);
        return par ? pathKeyLoose(par) : '';
      }
      return '';
    }

    function cancelMdFileAutosave() {
      if (mdAutosaveTimer) {
        clearTimeout(mdAutosaveTimer);
        mdAutosaveTimer = null;
      }
    }

    /** The mdFile write is armed by the editor being open, never by the preview. Selecting a file
        loads its text into the same buffer, so an armed-on-preview write saved that buffer back on
        the next blur and overwrote whatever had written the file since. */
    function mdFileEditorIsOpen() {
      const wrap = document.getElementById('mdFileEditorWrap');
      return !!wrap && !wrap.classList.contains('d-none');
    }

    async function flushMdFileAutosave() {
      cancelMdFileAutosave();
      const p = mdAutosaveTargetPath;
      if (!p) return;
      if (!mdFileEditorIsOpen()) return;
      const text = getViewerMdValue('mdFile');
      if (mdAutosaveLoadedText !== null && text === mdAutosaveLoadedText) return;
      /* Round-trip guard: the file may have moved on disk since this buffer was loaded, by another
         editor, an agent or a checkout. Writing then destroys that work with nothing on screen to
         say so, and the buffer is recoverable by reselecting the file, so refuse instead. */
      if (mdAutosaveLoadedText !== null) {
        const disk = await window.tagBrowser.readTextFile({ fullPath: p });
        if (disk.ok && disk.text !== mdAutosaveLoadedText) {
          setStatusMain('Not saved: ' + T.baseName(p) + ' has changed on disk. Reselect the file to reload it.');
          if (mdFileEditorIsOpen()) setViewerSaveState('refused');
          return;
        }
      }
      // TEMP DIAGNOSTIC (truncation hunt): compare editor value lengths vs what is written.
      try {
        const cm = getViewerMdEditor('mdFile');
        const ta = getViewerMdTextarea('mdFile');
        const probe = {
          path: p,
          writeLen: text.length,
          cmLen: cm ? cm.getValue().length : null,
          taLen: ta ? (ta.value || '').length : null,
          cmLines: cm ? cm.lineCount() : null,
        };
        nativeConsole.log('mdAutosave.probe', probe);
        searchDebugLog('mdAutosave.probe', probe);
      } catch (_) {}
      const r = await window.tagBrowser.writeTextFile({ fullPath: p, text });
      // TEMP DIAGNOSTIC: read back from disk and report the persisted length.
      try {
        const back = await window.tagBrowser.readTextFile({ fullPath: p });
        const rb = { path: p, ok: !!(r && r.ok), wrote: text.length, readBack: back && back.ok ? String(back.text).length : null };
        nativeConsole.log('mdAutosave.readback', rb);
        searchDebugLog('mdAutosave.readback', rb);
      } catch (_) {}
      if (r.ok) mdAutosaveLoadedText = text;
      setStatusMain(r.ok ? 'Saved.' : (r.error || 'Save failed'));
      if (mdFileEditorIsOpen()) setViewerSaveState(r.ok ? 'saved' : 'failed');
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
    /** Idle iframe HTML for #pdfFrame / #htmlPreviewFrame (never clear via iframe.src=''). */
    const PREVIEW_IFRAME_IDLE =
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
      if (ext === 'docx' || ext === 'doc' || ext === 'xlsx' || ext === 'xls' || ext === 'pptx' || ext === 'msg') return true;
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
      const status = document.getElementById('statusMain');
      let t = String(targetPathRaw || '').trim();
      if (!t) {
        if (status) setStatusMain('Shortcut target is empty.');
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
        if (status) setStatusMain('Could not resolve parent folder for shortcut target.');
        return;
      }
      selectedRow = null;
      selectedFullPath = t;
      await applySearchScopeAndRefresh(parent);
    }

    /** Resolve .lnk in main; navigate inside TagFox, else shell-open the shortcut. */
    async function followShellShortcutInTagFox(lnkFullPath) {
      const status = document.getElementById('statusMain');
      if (!window.tagBrowser.resolveShellShortcut) {
        const err = await window.tagBrowser.openPath(lnkFullPath);
        if (err && status) setStatusMain('Open failed: ' + err);
        return;
      }
      const r = await window.tagBrowser.resolveShellShortcut({ fullPath: lnkFullPath });
      if (!r || !r.ok) {
        if (status) setStatusMain((r && r.error) || 'Could not read shortcut.');
        const err = await window.tagBrowser.openPath(lnkFullPath);
        if (err && status) setStatusMain('Open failed: ' + err);
        return;
      }
      await navigateTagFoxToShortcutTarget(r.targetPath, r.isDirectory);
    }

    /** File row: markdown → local gmist, shell open otherwise, or a Workspace child window for .gdoc / .gsheet / .gslides (same as Viewer button). */
    async function openFileDefaultOrGoogleWorkspace(fp) {
      const status = document.getElementById('statusMain');
      const base = T.baseName(fp);
      const dot = base.lastIndexOf('.');
      const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
      if (ext === 'lnk') {
        await followShellShortcutInTagFox(fp);
        return;
      }
      /* Markdown opens in a local gmist by default (August 2026), starting it if it is not up, so the
         Open button, Enter and a double-click all land in the editor Steve actually edits markdown in.
         The row context menu's "Open with default app" is the way to reach Obsidian or an editor. */
      if (GMIST_EXT.has(ext)) {
        const r = machineHas('gmist') ? await openRowInLocalGmist(fp) : 'no-gmist-repo';
        if (r === 'no-gmist-repo') {
          /* No gmist checkout on this machine, so there is nothing to start and nothing to wait for.
             Open the file the way TagFox always did rather than failing on every markdown row. */
          const shellErr = await window.tagBrowser.openPath(fp);
          if (shellErr && status) setStatusMain('Open failed: ' + shellErr);
          else if (!shellErr) bumpFileFocusVisit(fp);
          return;
        }
        if (r) bumpFileFocusVisit(fp);
        return;
      }
      if (GOOGLE_SHORTCUT_EXT.has(ext) && window.tagBrowser.googleWorkspaceShortcutUrl && window.tagBrowser.openGoogleWorkspaceWindow) {
        const rGw = await window.tagBrowser.googleWorkspaceShortcutUrl({ fullPath: fp });
        if (!rGw.ok) {
          if (rGw.code === 'ENOENT') {
            if (status) setStatusMain('File not found.');
            return;
          }
          const shellErr = await window.tagBrowser.openPath(fp);
          if (status) {
            if (shellErr) setStatusMain('Could not open file.');
            else setStatusMain('');
          }
          if (!shellErr) bumpFileFocusVisit(fp);
          return;
        }
        const r = await window.tagBrowser.openGoogleWorkspaceWindow({ url: rGw.url, label: pathBasenameForConfirm(fp) });
        if (status && !r.ok) setStatusMain(r.error || 'Open failed');
        else bumpFileFocusVisit(fp);
        return;
      }
      const err = await window.tagBrowser.openPath(fp);
      if (err && status) setStatusMain('Open failed: ' + err);
      else if (!err) bumpFileFocusVisit(fp);
    }

    /* Open in gmist (the markdown web editor). Local gmist opens in a TagFox child window, the same framed
       BrowserView window Google Docs use, since local mode needs no sign-in. The deployed worker opens a Drive
       file by its Drive file id, which TagFox reads off the local mirror via the same resolver as Open in Google
       Workspace, and goes to the default browser, where Steve's gmist session lives. */
    const GMIST_BASE_URL = 'https://mist.broad-smoke-cc64.workers.dev';
    const GMIST_LOCAL_BASE_URL = 'http://localhost:5173';
    const GMIST_EXT = new Set(['md', 'qmd']);

    /* Whether a local gmist is up is main's call alone (startLocalGmist), and the renderer no
       longer keeps its own answer. It used to probe HEAD /go here first, which was a second,
       worse copy of the same judgement: an HTTP timeout, on a dev server measured answering
       anywhere between 1.3s and 11.3s, so it read "down" about a healthy gmist on most clicks and
       cost a couple of seconds doing it. Main reads the LISTENING ports instead, which is instant
       and stable, so the click can just ask it and act on the answer. A local gmist opens files by
       absolute PATH (any drive, no Drive lookup, no sign-in); the deployed worker needs the file to
       be in Drive. gmist owns the sidecar and its token; TagFox only picks which base URL to open. */

    /** True when the path is under a Google Drive mount (own My Drive mirror, or a shared shortcut target). */
    function pathUnderGoogleDrive(fp) {
      const s = String(fp || '');
      return /[\\/]My Drive [(]/i.test(s) || /\.shortcut-targets-by-id|\.shortcuts-by-id/i.test(s);
    }

    /** A markdown (.md/.qmd) file: the only rows gmist opens. */
    function isGmistMarkdown(fp) {
      const base = T.baseName(String(fp || ''));
      const dot = base.lastIndexOf('.');
      const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
      return GMIST_EXT.has(ext);
    }

    /* Steve chooses local vs online per click, so the row shows a button for each
       mode that applies (see the render block): local when a local gmist is up
       (opens ANY file by path), online when the file is under a Drive mount (the
       deployed worker needs a Drive id). They are separate actions, not a
       fallback chain. */
    /** true = a gmist window was opened (callers count the file as visited); 'no-gmist-repo' = no checkout on this machine, so the caller should open the file another way; false = tried and failed. */
    async function openRowInLocalGmist(fp) {
      if (!window.tagBrowser || typeof window.tagBrowser.openGmistWindow !== 'function') {
        setStatusMain('Open in gmist is not available.');
        return false;
      }
      /* Every click asks main, because a gmist that is already up costs one netstat to establish
         and the answer is then certain. Not running is the ordinary case rather than an error:
         main starts it and waits. */
      if (typeof window.tagBrowser.startLocalGmist !== 'function') {
        setStatusMain('Local gmist is not running. Start it with `npm run preview:local`, or use the online button.');
        return false;
      }
      /* Only say "starting" if the answer does not come back at once, or an already-running gmist
         flashes a cold-start warning it has no need of. */
      const slow = setTimeout(
        () => setStatusMain('Starting local gmist (npm run preview:local) — a cold start builds it, about two minutes…'),
        700
      );
      let started = null;
      try {
        started = await window.tagBrowser.startLocalGmist();
      } catch (e) {
        started = { up: false, error: String((e && e.message) || e) };
      }
      clearTimeout(slow);
      /* No checkout to start: the caller decides (the default-open path falls back to the shell,
         the pen says so), rather than every markdown row reporting a failure. */
      if (started && started.noRepo) {
        setStatusMain('No local gmist on this machine: ' + started.error);
        return 'no-gmist-repo';
      }
      if (!started || !started.up) {
        const why = (started && started.error) || 'unknown error';
        const log = started && started.logPath ? ' See ' + started.logPath + '.' : '';
        setStatusMain('Could not start local gmist: ' + why + log);
        return false;
      }
      const url = GMIST_LOCAL_BASE_URL + '/open?path=' + encodeURIComponent(fp);
      const opened = await window.tagBrowser.openGmistWindow({ url, label: pathBasenameForConfirm(fp) });
      if (opened && opened.ok === false) {
        setStatusMain(opened.error || 'Could not open a gmist window.');
        return false;
      }
      setStatusMain('Opening in local gmist…');
      return true;
    }

    /* Open in Obsidian: `obsidian://open?path=<absolute path>` opens a file in whichever registered vault
       holds it, and fails with "Vault not found" for anything else, so the row button and the context-menu
       entry are offered only for markdown inside a vault. Main reads the vault list from Obsidian's own
       config; it is fetched at startup and on every window focus, and the table repaints when it changes. */
    let obsidianVaultRootsLc = [];
    function normaliseWinPathLc(p) {
      return String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
    }
    async function refreshObsidianVaultRoots() {
      if (!window.tagBrowser || typeof window.tagBrowser.obsidianVaultRoots !== 'function') return;
      let r = null;
      try {
        r = await window.tagBrowser.obsidianVaultRoots();
      } catch (e) {
        r = { ok: false, error: String((e && e.message) || e) };
      }
      if (!r || !r.ok) {
        console.warn('[TagFox] Obsidian vault list:', (r && r.error) || 'no answer');
        return;
      }
      const next = (r.roots || []).map(normaliseWinPathLc).filter(Boolean);
      if (next.join('|') === obsidianVaultRootsLc.join('|')) return;
      obsidianVaultRootsLc = next;
      if (lastRows.length) renderTable();
    }
    /* What this machine has for the buttons that depend on it (main's machineFeatures: a gmist, JobCat's
       make_pdf.py, a Google OAuth client), fetched at startup and on every focus like the vault list. Until
       the first answer, everything counts as present, so no button goes missing on a slow start. */
    let machineFeaturesSeen = null;
    async function refreshMachineFeatures() {
      if (!window.tagBrowser || typeof window.tagBrowser.machineFeatures !== 'function') return;
      let r = null;
      try {
        r = await window.tagBrowser.machineFeatures();
      } catch (e) {
        console.warn('[TagFox] machine features:', String((e && e.message) || e));
        return;
      }
      if (!r || JSON.stringify(r) === JSON.stringify(machineFeaturesSeen)) return;
      machineFeaturesSeen = r;
      if (lastRows.length) renderTable();
    }
    function machineHas(feature) {
      return !machineFeaturesSeen || !!machineFeaturesSeen[feature];
    }
    /** A .md file inside a registered vault, outside the dot-folders (.obsidian, .trash) Obsidian does not index. */
    function pathInObsidianVault(fp) {
      if (!obsidianVaultRootsLc.length || !/\.md$/i.test(String(fp || ''))) return false;
      const s = normaliseWinPathLc(fp);
      return obsidianVaultRootsLc.some((root) => {
        if (!s.startsWith(root + '\\')) return false;
        return !s.slice(root.length + 1).split('\\').some((seg) => seg.startsWith('.'));
      });
    }
    async function openRowInObsidian(fp) {
      const url = 'obsidian://open?path=' + encodeURIComponent(fp);
      const r = await window.tagBrowser.openUrlDefaultBrowser({ url });
      if (r && r.ok === false) {
        setStatusMain('Open in Obsidian failed: ' + (r.error || 'unknown error'));
        return;
      }
      setStatusMain('Opening in Obsidian…');
      bumpFileFocusVisit(fp);
    }

    /* opts.share ('suggest' | 'edit') asks gmist to copy the room's share link to the clipboard once it
       has opened, so a collaborator link is one click from a row. TagFox cannot build that link itself:
       it holds no gmist credentials, and minting a room needs the browser's own session cookie, so the
       round trip happens in the browser and gmist does the copying (see gmist's ShareOnOpen). */
    /** Why a row's Drive file id was not found (resolveGoogleDriveFileIdRobust's answer), in words; `notFound`
        when Drive was asked and had no such file. */
    function driveIdFailureReason(r, notFound) {
      if (r && r.reason === 'drive-name-ambiguous') return 'several Drive files share this name; rename one or open it from drive.google.com.';
      if (r && r.reason === 'no-drive-api') {
        return machineHas('googleSignIn')
          ? 'Google Drive sign-in did not complete' + (r.error ? ' (' + r.error + ')' : '') + '.'
          : 'this file carries no Drive id, and this TagFox has no Google sign-in set up to look one up.';
      }
      return notFound;
    }

    async function openRowInOnlineGmist(fp, opts) {
      const share = opts && opts.share ? String(opts.share) : '';
      if (!window.tagBrowser || typeof window.tagBrowser.resolveGoogleDriveFileId !== 'function') {
        setStatusMain('Open in gmist online is not available.');
        return;
      }
      setStatusMain(share ? 'Getting a gmist share link…' : 'Opening in gmist online…');
      const r = await window.tagBrowser.resolveGoogleDriveFileId({ fullPath: fp });
      if (!r || !r.ok || !r.fileId) {
        const why = driveIdFailureReason(
          r,
          'could not find this file in Google Drive (only Drive files open online; a local gmist opens any file).'
        );
        setStatusMain('Open in gmist online: ' + why);
        return;
      }
      /* A harmless, readable breadcrumb the target ignores: the path from the user home, so the URL is legible. */
      const crumb = String(r.relPath || '').trim();
      const crumbSuffix = crumb ? '&p=' + crumb.split('/').map(encodeURIComponent).join('/') : '';
      const shareSuffix = share ? '&share=' + encodeURIComponent(share) : '';
      const url = GMIST_BASE_URL + '/open?file=' + encodeURIComponent(r.fileId) + crumbSuffix + shareSuffix;
      const opened = await window.tagBrowser.openUrlDefaultBrowser({ url });
      if (opened && opened.ok === false) setStatusMain(opened.error || 'Could not open browser for gmist.');
      else if (share) setStatusMain('gmist is copying the ' + share + ' link to your clipboard…');
      else setStatusMain('Opening in gmist online…');
    }

    /* Open in Google Workspace (edit online): Office and Google-native docs on Drive. The edit (pen) icon uses
       this for anything that isn't md/qmd (those go to gmist). Google-native shortcuts reuse the existing
       shortcut resolver; Office files resolve their Drive file id and open the matching Google editor window. */
    const WORKSPACE_DOC_EXT = new Set(['doc', 'docx', 'rtf', 'odt']);
    const WORKSPACE_SHEET_EXT = new Set(['xls', 'xlsx', 'ods', 'csv', 'tsv']);
    const WORKSPACE_SLIDES_EXT = new Set(['ppt', 'pptx', 'odp']);

    /** File types the pen icon can open in Google Workspace (Office files + Google-native shortcuts), on Drive. */
    function rowEligibleForWorkspaceEdit(fp) {
      const s = String(fp || '');
      const base = T.baseName(s);
      const dot = base.lastIndexOf('.');
      const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
      const known =
        GOOGLE_SHORTCUT_EXT.has(ext) ||
        WORKSPACE_DOC_EXT.has(ext) ||
        WORKSPACE_SHEET_EXT.has(ext) ||
        WORKSPACE_SLIDES_EXT.has(ext);
      return known && pathUnderGoogleDrive(s);
    }

    function googleEditorUrlForExt(ext, id) {
      if (WORKSPACE_DOC_EXT.has(ext)) return 'https://docs.google.com/document/d/' + id + '/edit';
      if (WORKSPACE_SHEET_EXT.has(ext)) return 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
      if (WORKSPACE_SLIDES_EXT.has(ext)) return 'https://docs.google.com/presentation/d/' + id + '/edit';
      return null;
    }

    async function openRowInGoogleWorkspace(fp) {
      const base = T.baseName(fp);
      const dot = base.lastIndexOf('.');
      const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
      // Google-native shortcut (.gdoc/.gsheet/.gslides): the existing path opens it in the Workspace window.
      if (GOOGLE_SHORTCUT_EXT.has(ext)) {
        await openFileDefaultOrGoogleWorkspace(fp);
        return;
      }
      // Office file on Drive: resolve its Drive id and open the matching Google editor in a Workspace window.
      if (
        !window.tagBrowser ||
        typeof window.tagBrowser.resolveGoogleDriveFileId !== 'function' ||
        !window.tagBrowser.openGoogleWorkspaceWindow
      ) {
        setStatusMain('Open in Google Workspace is not available.');
        return;
      }
      setStatusMain('Opening in Google Workspace…');
      const r = await window.tagBrowser.resolveGoogleDriveFileId({ fullPath: fp });
      if (!r || !r.ok || !r.fileId) {
        setStatusMain('Open in Google Workspace: ' + driveIdFailureReason(r, 'could not find this file in Google Drive.'));
        return;
      }
      const url = googleEditorUrlForExt(ext, r.fileId);
      if (!url) {
        setStatusMain('No Google editor for this file type.');
        return;
      }
      const opened = await window.tagBrowser.openGoogleWorkspaceWindow({ url, label: pathBasenameForConfirm(fp) });
      if (opened && opened.ok === false) setStatusMain(opened.error || 'Open in Google Workspace failed.');
      else setStatusMain('Opening in Google Workspace…');
    }

    /** Text files opened in the RHS viewer editor. Special rendered previews are deliberately bypassed here so these are editable. */
    const TEXT_EDIT_EXT = new Set([
      'md',
      'markdown',
      'mdx',
      'txt',
      'typ',
      'json',
      'jsonl',
      'ndjson',
      'text',
      'log',
      'tsv',
      'srt',
      'vtt',
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
      'gitattributes',
      'gitmodules',
      'dockerignore',
      'editorconfig',
      'npmrc',
      'prettierrc',
      'eslintrc',
      'stylelintrc',
      'babelrc',
      'properties',
      'sql',
      'http',
      'css',
      'scss',
      'sass',
      'less',
      'styl',
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
      'scala',
      'dart',
      'java',
      'cs',
      'fs',
      'fsx',
      'cpp',
      'cc',
      'cxx',
      'h',
      'hpp',
      'hh',
      'hxx',
      'ipp',
      'inl',
      'c',
      'm',
      'mm',
      'asm',
      's',
      'sh',
      'bash',
      'zsh',
      'fish',
      'awk',
      'sed',
      'ps1',
      'bat',
      'cmd',
      'reg',
      'r',
      'rprofile',
      'f',
      'for',
      'f90',
      'f95',
      'lua',
      'pl',
      'pm',
      'tcl',
      'jl',
      'nim',
      'zig',
      'd',
      'ex',
      'exs',
      'erl',
      'hrl',
      'clj',
      'cljs',
      'vb',
      'vbs',
      'ahk',
      'au3',
      'ml',
      'mli',
      'hs',
      'lhs',
      'elm',
      'sol',
      'proto',
      'prisma',
      'graphql',
      'gql',
      'qmd',
      'rmd',
      'rst',
      'adoc',
      'asciidoc',
      'org',
      'tex',
      'bib',
      'sty',
      'cls',
      'dockerfile',
      'makefile',
      'cmake',
      'gradle',
      'plist',
      'lock',
      'desktop',
      'service',
      'timer',
      'socket',
      'patch',
      'diff',
      'vcf',
      'ics',
    ]);

    const TEXT_EDIT_BASENAME = new Set([
      'dockerfile',
      'makefile',
      'cmakelists.txt',
      'jenkinsfile',
      'justfile',
      'rakefile',
      'gemfile',
      'podfile',
      'procfile',
      'vagrantfile',
      'license',
      'notice',
      'authors',
      'contributors',
      'changelog',
      'copying',
      'readme',
      'hosts',
    ]);

    const MARKDOWN_EDIT_EXT = new Set(['md', 'markdown', 'mdx', 'rmd', 'qmd']);
    /** Prose files with no markup language of their own: rendered as markdown too (plain text is valid markdown). */
    const PROSE_PREVIEW_EXT = new Set(['txt', 'text']);
    const PROSE_PREVIEW_BASENAME = new Set([
      'readme',
      'license',
      'notice',
      'authors',
      'contributors',
      'changelog',
      'copying',
    ]);

    function editableTextKindForBase(base) {
      const lower = String(base || '').toLowerCase();
      const i = lower.lastIndexOf('.');
      const ext = i >= 0 ? lower.slice(i + 1) : '';
      if (
        !TEXT_EDIT_EXT.has(ext) &&
        !TEXT_EDIT_BASENAME.has(lower) &&
        !/^(dockerfile|makefile)(\.|$)/.test(lower) &&
        !/^\.env(\.|$)/.test(lower)
      ) {
        return null;
      }
      const markdown =
        MARKDOWN_EDIT_EXT.has(ext) ||
        (!TEXT_EDIT_BASENAME.has(lower) && PROSE_PREVIEW_EXT.has(ext)) || // cmakelists.txt is a build file, not prose
        (!ext && PROSE_PREVIEW_BASENAME.has(lower));
      return { ext, markdown };
    }

    const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
    const TEXT_PREVIEW_MAX_CHARS = 450000;
    /** Excel HTML preview: max physical rows read from !ref (not “first N non-empty”; see comment at call site). */
    const EXCEL_PREVIEW_MAX_ROWS = 100;
    /** Excel HTML preview: max columns; wide sheets (e.g. survey exports) make table layout freeze the renderer. */
    const EXCEL_PREVIEW_MAX_COLS = 40;
    /** Spreadsheet preview byte cap: XLSX.read parses synchronously on the UI thread, so big workbooks freeze the window. */
    const SPREADSHEET_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;
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

    /** ODF package = zip; Writer body is office:body with text:p / text:h (rough text-only preview). */
    async function odtArrayBufferToPreviewHtml(arrayBuffer) {
      if (typeof JSZip === 'undefined' || !JSZip.loadAsync) {
        return '<p class="text-danger small">JSZip failed to load.</p>';
      }
      const zip = await JSZip.loadAsync(arrayBuffer);
      const f = zip.file('content.xml');
      if (!f) return '<p class="text-danger small">Invalid ODT (no content.xml).</p>';
      const xml = await f.async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) return '<p class="text-danger small">Could not parse content.xml.</p>';
      const OFFICE_NS = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
      const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
      const body = doc.getElementsByTagNameNS(OFFICE_NS, 'body')[0];
      if (!body) return '<p class="text-muted mb-0">No document body.</p>';
      const blocks = [];
      function visit(el) {
        if (el.namespaceURI === TEXT_NS && (el.localName === 'p' || el.localName === 'h')) {
          const t = el.textContent.replace(/\s+/g, ' ').trim();
          if (t) {
            blocks.push(
              el.localName === 'h'
                ? '<div class="fw-semibold mb-1">' + escapeHtmlForPreview(t) + '</div>'
                : '<p class="mb-1">' + escapeHtmlForPreview(t) + '</p>'
            );
          }
          return;
        }
        for (const c of el.children) visit(c);
      }
      visit(body);
      if (!blocks.length) {
        return '<p class="small text-muted mb-0">No paragraph text found. Use <strong>Open</strong> for full view.</p>';
      }
      const intro = '<p class="small text-muted mb-2">Simple text preview (no images or layout).</p>';
      return truncateRichPreviewHtml(intro + blocks.join(''), TEXT_PREVIEW_MAX_CHARS);
    }

    /** One ODS table row → string cells (direct children only; repeated cols + covered cells). */
    function odsRowToCells(rowEl, TABLE_NS, TEXT_NS, colCap) {
      const out = [];
      function cellText(cellEl) {
        const ps = cellEl.getElementsByTagNameNS(TEXT_NS, 'p');
        const parts = [];
        for (let i = 0; i < ps.length; i++) {
          const t = ps[i].textContent.replace(/\s+/g, ' ').trim();
          if (t) parts.push(t);
        }
        return parts.join(' ');
      }
      for (const ch of rowEl.children) {
        if (out.length >= colCap) break;
        if (ch.namespaceURI !== TABLE_NS) continue;
        if (ch.localName === 'covered-table-cell') {
          let ncr = parseInt(ch.getAttribute('table:number-columns-repeated') || '1', 10);
          if (!Number.isFinite(ncr) || ncr < 1) ncr = 1;
          const rep = Math.min(ncr, colCap - out.length);
          for (let i = 0; i < rep; i++) out.push('');
          continue;
        }
        if (ch.localName !== 'table-cell') continue;
        let ncr = parseInt(ch.getAttribute('table:number-columns-repeated') || '1', 10);
        if (!Number.isFinite(ncr) || ncr < 1) ncr = 1;
        const txt = cellText(ch);
        const rep = Math.min(ncr, colCap - out.length);
        for (let i = 0; i < rep; i++) out.push(txt);
      }
      return out;
    }

    /** First sheet in content.xml → row matrix for table preview (caps match Excel preview). */
    function odsContentXmlToRows(doc, rowCap, colCap) {
      const OFFICE_NS = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
      const TABLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
      const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
      const spreadsheet = doc.getElementsByTagNameNS(OFFICE_NS, 'spreadsheet')[0];
      if (!spreadsheet) return { rows: [], moreRows: false, tableCount: 0, errorMsg: 'No spreadsheet body found.' };
      const tables = spreadsheet.getElementsByTagNameNS(TABLE_NS, 'table');
      if (!tables.length) return { rows: [], moreRows: false, tableCount: 0, errorMsg: 'No tables found.' };
      const tableCount = tables.length;
      const firstTable = tables[0];
      const rowEls = [];
      for (const ch of firstTable.children) {
        if (ch.namespaceURI === TABLE_NS && ch.localName === 'table-row') rowEls.push(ch);
      }
      const rows = [];
      let moreRows = false;
      outer: for (let ri = 0; ri < rowEls.length; ri++) {
        const rowEl = rowEls[ri];
        let nrr = parseInt(rowEl.getAttribute('table:number-rows-repeated') || '1', 10);
        if (!Number.isFinite(nrr) || nrr < 1) nrr = 1;
        for (let rpt = 0; rpt < nrr; rpt++) {
          if (rows.length >= rowCap) {
            moreRows = !(ri === rowEls.length - 1 && rpt === nrr - 1);
            break outer;
          }
          rows.push(odsRowToCells(rowEl, TABLE_NS, TEXT_NS, colCap));
        }
      }
      return { rows, moreRows, tableCount, errorMsg: '' };
    }

    /** Calc ODS: zip + ODF table XML (first sheet; cell text only — not formulas/format). */
    async function odsArrayBufferToPreviewHtml(arrayBuffer) {
      if (typeof JSZip === 'undefined' || !JSZip.loadAsync) {
        return '<p class="text-danger small">JSZip failed to load.</p>';
      }
      const zip = await JSZip.loadAsync(arrayBuffer);
      const f = zip.file('content.xml');
      if (!f) return '<p class="text-danger small">Invalid ODS (no content.xml).</p>';
      const xml = await f.async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) return '<p class="text-danger small">Could not parse content.xml.</p>';
      const colCap = 64;
      const parsed = odsContentXmlToRows(doc, EXCEL_PREVIEW_MAX_ROWS, colCap);
      if (parsed.errorMsg) return '<p class="text-muted mb-0">' + escapeHtmlForPreview(parsed.errorMsg) + '</p>';
      let html = '<p class="small text-muted mb-2">First sheet only — cell text preview (not full layout).</p>';
      html += csvPreviewTableHtml(parsed.rows, EXCEL_PREVIEW_MAX_ROWS);
      if (parsed.moreRows) {
        html +=
          '<p class="text-muted small mb-0 mt-2">More rows in this sheet — use <strong>Open</strong> for the full grid.</p>';
      }
      if (parsed.tableCount > 1) {
        html +=
          '<p class="text-muted small mb-0 mt-2">Preview shows sheet 1 of ' + parsed.tableCount + '.</p>';
      }
      return html;
    }

    /** Impress ODP: content.xml draw:page order — text from text:p / text:h only (like PPTX). */
    async function odpArrayBufferToPreviewHtml(arrayBuffer) {
      if (typeof JSZip === 'undefined' || !JSZip.loadAsync) {
        return '<p class="text-danger small">JSZip failed to load.</p>';
      }
      const zip = await JSZip.loadAsync(arrayBuffer);
      const f = zip.file('content.xml');
      if (!f) return '<p class="text-danger small">Invalid ODP (no content.xml).</p>';
      const xml = await f.async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) return '<p class="text-danger small">Could not parse content.xml.</p>';
      const OFFICE_NS = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
      const DRAW_NS = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';
      const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
      const pres = doc.getElementsByTagNameNS(OFFICE_NS, 'presentation')[0];
      if (!pres) return '<p class="text-muted mb-0">No presentation body.</p>';
      const pageEls = [];
      for (const ch of pres.children) {
        if (ch.namespaceURI === DRAW_NS && ch.localName === 'page') pageEls.push(ch);
      }
      if (!pageEls.length) {
        return '<p class="small text-muted mb-0">No slides found. Use <strong>Open</strong> for full view.</p>';
      }
      const slideCap = PPTX_PREVIEW_MAX_SLIDES;
      const totalSlides = pageEls.length;
      const pagesToRead = slideCap > 0 && totalSlides > slideCap ? pageEls.slice(0, slideCap) : pageEls;
      const sections = [];
      for (let i = 0; i < pagesToRead.length; i++) {
        const pageEl = pagesToRead[i];
        const chunks = [];
        function visit(el) {
          if (el.namespaceURI === TEXT_NS && (el.localName === 'p' || el.localName === 'h')) {
            const t = el.textContent.replace(/\s+/g, ' ').trim();
            if (t) chunks.push(t);
            return;
          }
          for (const c of el.children) visit(c);
        }
        visit(pageEl);
        const text = chunks.join(' ').replace(/\s+/g, ' ').trim();
        if (text) {
          sections.push(
            '<div class="mb-3 pptx-slide-block"><div class="fw-semibold text-muted small mb-1">Slide ' +
              (i + 1) +
              '</div><p class="mb-0">' +
              escapeHtmlForPreview(text) +
              '</p></div>'
          );
        }
      }
      if (!sections.length) {
        return (
          '<p class="small text-muted mb-0">No slide text found (empty or image-heavy). Use <strong>Open</strong> for full view.</p>'
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
      return truncateRichPreviewHtml(out, TEXT_PREVIEW_MAX_CHARS);
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
        delete pdfFrame.dataset.pdfBlobUrl;
        pdfFrame.srcdoc = PREVIEW_IFRAME_IDLE;
      }
      const htmlPreviewFrame = document.getElementById('htmlPreviewFrame');
      if (htmlPreviewFrame) {
        htmlPreviewFrame.removeAttribute('src');
        htmlPreviewFrame.srcdoc = PREVIEW_IFRAME_IDLE;
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

    function arrayBufferToBase64(ab) {
      const u8 = new Uint8Array(ab);
      let bin = '';
      for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
      return btoa(bin);
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

    /*
     * Chromium's PDF plugin reads its view parameters from the URL fragment, and only at load, so
     * the fragment is re-applied (which reloads the frame) whenever the Viewer enters or leaves
     * near-full-screen. Expanded, the plugin is wide enough that it opens its thumbnail sidebar
     * uninvited and 100% leaves the text small, so expanded asks for 150% and no sidebar.
     * `toolbar=0` is the only thing that closes that sidebar: measured 1 September 2026 against the
     * Electron PDF viewer at 1728px, `pagemode=none` left the thumbnails exactly where they were.
     * It takes the plugin's own toolbar with it (page counter, zoom buttons, print, download), which
     * is the price of the sidebar going; Ctrl+wheel still zooms and the Viewer's header still carries Reload.
     * The side pane is a glance, so it drops the toolbar too and fits the page to the pane's width
     * (Steve, 25 October 2026): with the toolbar the page sat small under a dark bar, and at a third
     * of a wide window the sidebar could still open there.
     */
    const PDF_VIEW_PARAMS_THEATER = '#zoom=150&toolbar=0';
    const PDF_VIEW_PARAMS_PANE = '#toolbar=0&view=FitH';

    function pdfViewParams() {
      return isPropsTheaterOn() ? PDF_VIEW_PARAMS_THEATER : PDF_VIEW_PARAMS_PANE;
    }

    /** Point #pdfFrame at a freshly made blob URL, remembering it so a theater toggle can re-apply. */
    function setPdfFrameSrc(blobUrl) {
      const f = document.getElementById('pdfFrame');
      if (!f) return;
      f.dataset.pdfBlobUrl = blobUrl;
      f.removeAttribute('srcdoc');
      f.src = blobUrl + pdfViewParams();
    }

    function syncPdfViewParams() {
      const f = document.getElementById('pdfFrame');
      const blobUrl = f && f.dataset ? f.dataset.pdfBlobUrl : '';
      if (!f || !blobUrl) return;
      const want = blobUrl + pdfViewParams();
      if (f.src === want) return;
      f.src = want;
    }

    /** Stable hue 0–359 from tag identity (lowercase so “Foo” matches “foo”). */
    function tagHueFromKey(tagKeyOrDisplay) {
      const s = String(tagKeyOrDisplay || '').trim().toLowerCase();
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      return Math.abs(h) % 360;
    }

    /** Light fill for row pills, breadcrumb badges, modal chips. */
    function tagColorCss(tagKeyOrDisplay) {
      const hue = tagHueFromKey(tagKeyOrDisplay);
      return 'hsl(' + hue + ', 42%, 86%)';
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
      const status = document.getElementById('statusMain');
      try {
        const rootPrefix = rootPrefixValue();
        const res = await window.tagBrowser.renamePath({ fromPath: fp, toPath, rootPrefix });
        if (!res || !res.ok) {
          setStatusMain((res && res.error) || 'Rename failed');
          return;
        }
        if (selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN) {
          selectedFullPath = toPath;
          renderScopeBreadcrumb();
        }
        recordRenameUndo([{ from: fp, to: toPath }], 'remove tag');
        setStatusMain('Removed tag.');
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

    /** After normalizeFolderPathForEverything: true for drive root only (e.g. C:\). */
    function isWindowsDriveRootNorm(norm) {
      return /^[a-zA-Z]:\\$/i.test(normalizeFolderPathForEverything(norm));
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

    function renderSearchScopeMaxUi() {
      const box = document.getElementById('searchScopeMaxDisplay');
      const clearBtn = document.getElementById('btnSearchScopeClearMax');
      if (!box) return;
      const n = getSearchScopeMaxFolderNorm();
      box.className =
        'small border rounded px-2 py-2 bg-body font-monospace text-break' + (n ? '' : ' text-muted');
      box.textContent = n || 'No limit — Everything can search your whole index.';
      if (clearBtn) clearBtn.classList.toggle('d-none', !n);
    }

    /** Settings: persisted folder for global Quick TODO shortcut. */
    function renderQuickTodoFolderUi() {
      const box = document.getElementById('quickTodoFolderDisplay');
      const hid = document.getElementById('quickTodoFolder');
      if (!box || !hid) return;
      const n = normalizeFolderPathForEverything(String(hid.value || '').trim());
      hid.value = n;
      box.className =
        'small border rounded px-2 py-2 bg-body font-monospace text-break' + (n ? '' : ' text-muted');
      box.textContent = n || 'Not set — choose a folder before using Quick TODO.';
    }

    /** Settings: validate + persist Quick TODO destination folder (same checks as search scope max). */
    async function setQuickTodoFolderFromPicker(rawPath) {
      const norm0 = normalizeSearchScopeMaxPath(rawPath);
      if (!norm0) return;
      const syn = scopePathClientSyntaxError(norm0);
      if (syn) {
        setStatusMain(syn);
        return;
      }
      if (window.tagBrowser && typeof window.tagBrowser.listChildFolders === 'function') {
        const r = await window.tagBrowser.listChildFolders({ parentPath: norm0 });
        if (!r || !r.ok) {
          setStatusMain(
            'Invalid folder: ' + (r && r.error ? String(r.error) : 'Not a folder or not reachable.')
          );
          return;
        }
      }
      const hid = document.getElementById('quickTodoFolder');
      if (hid) hid.value = norm0;
      renderQuickTodoFolderUi();
      saveSettings();
    }

    function clearQuickTodoFolderSetting() {
      const hid = document.getElementById('quickTodoFolder');
      if (hid) hid.value = '';
      renderQuickTodoFolderUi();
      saveSettings();
    }

    /** Validate path via IPC; replace scope max; clamp breadcrumb + search. */
    async function setSearchScopeMaxFromPicker(rawPath) {
      const norm0 = normalizeSearchScopeMaxPath(rawPath);
      if (!norm0) return;
      const syn = scopePathClientSyntaxError(norm0);
      if (syn) {
        setStatusMain(syn);
        return;
      }
      if (window.tagBrowser && typeof window.tagBrowser.listChildFolders === 'function') {
        const r = await window.tagBrowser.listChildFolders({ parentPath: norm0 });
        if (!r || !r.ok) {
          setStatusMain(
            'Invalid folder: ' + (r && r.error ? String(r.error) : 'Not a folder or not reachable.')
          );
          return;
        }
      }
      searchScopeMaxFolder = norm0;
      renderSearchScopeMaxUi();
      clampRootFolderUnderSearchScopeMax();
      saveSettings();
      renderScopeBreadcrumb();
      void runSearchNow();
      commitSearchHistoryNow();
    }

    function clearSearchScopeMaxSetting() {
      searchScopeMaxFolder = '';
      renderSearchScopeMaxUi();
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

    function clearSearchScope() {
      document.getElementById('rootFolder').value = '';
      saveSettings();
      renderScopeBreadcrumb();
      scheduleSearch();
      commitSearchHistoryNow();
    }

    /** Clear current folder plus active tag/recency filters; keep query and view mode unchanged. */
    function clearSearchScopeAndTagRecencyFilters() {
      document.getElementById('rootFolder').value = '';
      activeTagKeys.clear();
      excludedTagKeys.clear();
      persistActiveTagFilter();
      setRecencyFilterMode('all');
      saveSettings();
      renderScopeBreadcrumb();
      scheduleSearch();
      commitSearchHistoryNow();
    }

    /** Empty #query and refresh — same as the search-row ✕ (not current folder / scope). */
    function clearSearchQuery() {
      document.getElementById('query').value = '';
      syncQueryGhostUi();
      scheduleSearch();
      commitSearchHistoryNow();
    }

    /** Empty #query without triggering its own search; use when another action will refresh immediately. */
    function clearSearchQueryInputOnly() {
      document.getElementById('query').value = '';
      syncQueryGhostUi();
    }

    /** Widest the Viewer may be right now: what is left of the results row after the results pane
     *  keeps its minimum. Clamping here (rather than only at drag time) means a narrowed window
     *  cannot leave a Viewer wider than the app, and widening it again restores the asked-for width. */
    function maxPropsPaneWidthPx() {
      const aside = document.getElementById('propsAside');
      const results = document.querySelector('.results-viewer-wrap');
      if (!aside || !results) return PROPS_PANE_MAX_PX;
      /* The two panes share whatever those two widths add up to, wherever the divider sits, so read
         them rather than the parent: the parent also holds the splitter. */
      const shared = results.getBoundingClientRect().width + aside.getBoundingClientRect().width;
      const room = Math.round(shared - RESULTS_PANE_MIN_PX);
      return Math.max(PROPS_PANE_MIN_PX, Math.min(PROPS_PANE_MAX_PX, room));
    }

    function clampPropsPaneWidthPx(px) {
      return Math.max(PROPS_PANE_MIN_PX, Math.min(maxPropsPaneWidthPx(), px));
    }

    function applyPaneWidths() {
      const aside = document.getElementById('propsAside');
      if (!aside) return;
      /* Runner's CSS holds the Viewer at a third until the divider is dragged; the class lets the inline width through. */
      const sized = runnerViewerPx != null;
      document.body.classList.toggle('tagfox-runner-viewer-sized', sized);
      aside.style.width = sized ? clampPropsPaneWidthPx(runnerViewerPx) + 'px' : '';
    }

    function applyViewerDocSplitSizes() {
      document.querySelectorAll('.viewer-doc-split').forEach((el) => {
        el.style.setProperty('--tagfox-viewer-doc-editor-pct', viewerDocSplitPct + '%');
        el.style.setProperty('--tagfox-viewer-doc-editor-pct-theater', viewerDocSplitPctTheater + '%');
      });
    }

    function loadViewerDocSplitFromStorage() {
      const normal = parseInt(localStorage.getItem(LS.viewerDocSplitPct) || '', 10);
      const theater = parseInt(localStorage.getItem(LS.viewerDocSplitPctTheater) || '', 10);
      if (Number.isFinite(normal) && normal >= 20 && normal <= 80) viewerDocSplitPct = normal;
      if (Number.isFinite(theater) && theater >= 20 && theater <= 80) viewerDocSplitPctTheater = theater;
      applyViewerDocSplitSizes();
    }

    function persistViewerDocSplitSizes() {
      localStorage.setItem(LS.viewerDocSplitPct, String(viewerDocSplitPct));
      localStorage.setItem(LS.viewerDocSplitPctTheater, String(viewerDocSplitPctTheater));
    }

    function syncViewerDocDividerOrientation() {
      const vertical = isPropsTheaterOn();
      document.querySelectorAll('.viewer-doc-split-divider').forEach((el) => {
        el.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
      });
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
      syncViewerDocDividerOrientation();
      syncPdfViewParams();
      syncPropsFootHint();
      if (btn) {
        btn.setAttribute('aria-expanded', show ? 'true' : 'false');
        btn.title = show ? 'Leave full screen (Shift+Space or Esc)' : 'Full screen (Shift+Space)';
        btn.setAttribute('aria-label', show ? 'Leave full screen' : 'Expand the Viewer');
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
      const rw = parseInt(localStorage.getItem(LS.runnerViewerWidthPx) || '', 10);
      runnerViewerPx = Number.isFinite(rw) && rw >= PROPS_PANE_MIN_PX && rw <= PROPS_PANE_MAX_PX ? rw : null;
      applyPaneWidths();
    }

    function persistPaneWidths() {
      if (runnerViewerPx == null) localStorage.removeItem(LS.runnerViewerWidthPx);
      else localStorage.setItem(LS.runnerViewerWidthPx, String(runnerViewerPx));
    }

    /**
     * A transparent layer over the whole window for the length of a splitter drag, removed by the
     * returned function. The Viewer holds iframes (the PDF preview runs in its own process), and a
     * drag that crosses one stops delivering moves to this document, so the divider freezes and then
     * jumps when the pointer comes back. The shield keeps every hit test here.
     */
    function addSplitDragShield(cursor) {
      /* Never stack shields: one left behind would swallow every click in the app, so a new drag
         clears any shield an earlier one failed to remove. */
      document.querySelectorAll('.tagfox-split-drag-shield').forEach((el) => el.remove());
      const shield = document.createElement('div');
      shield.className = 'tagfox-split-drag-shield';
      shield.style.cursor = cursor || 'col-resize';
      document.body.appendChild(shield);
      return () => {
        try {
          shield.remove();
        } catch (_) {}
      };
    }

    function bindVerticalSplitters() {
      const split = document.getElementById('splitProps');
      if (!split) return;
      window.addEventListener('resize', applyPaneWidths);
      split.addEventListener('pointerdown', (e) => {
        /* Left button only: any button used to start a drag that then ran until the next mouseup. */
        if (e.button !== 0) return;
        e.preventDefault();
        // One layout pass per frame: raw moves + PDF/office preview caused massive main-thread work.
        document.body.classList.add('tagfox-props-split-drag');
        split.classList.add('is-dragging');
        const removeShield = addSplitDragShield('col-resize');
        /* Capture as well as the shield: capture is what still delivers the moves and the release
           when the pointer leaves the window, which otherwise leaves the drag live and the divider
           following the pointer again the moment it comes back. */
        try {
          split.setPointerCapture(e.pointerId);
        } catch (_) {}
        const startX = e.clientX;
        /* The width on screen, not the stored one: Runner's third has no stored width until this drag. */
        const startW = Math.round(document.getElementById('propsAside').getBoundingClientRect().width);
        let moved = false;
        /* Measured once per drag: past this the panel stops growing, and counting past it would
           buy dead travel that has to be dragged back before the divider moves again. */
        const maxW = maxPropsPaneWidthPx();
        let raf = 0;
        function flushPaneWidth() {
          raf = 0;
          applyPaneWidths();
        }
        function move(ev) {
          // Dragging the handle right widens the left (results) pane; inverted delta matches that motion.
          const w = Math.min(maxW, Math.max(PROPS_PANE_MIN_PX, startW - (ev.clientX - startX)));
          runnerViewerPx = w;
          moved = true;
          if (!raf) raf = requestAnimationFrame(flushPaneWidth);
        }
        function up() {
          split.removeEventListener('pointermove', move);
          split.removeEventListener('pointerup', up);
          split.removeEventListener('pointercancel', up);
          split.removeEventListener('lostpointercapture', up);
          try {
            split.releasePointerCapture(e.pointerId);
          } catch (_) {}
          removeShield();
          if (raf) cancelAnimationFrame(raf);
          flushPaneWidth();
          split.classList.remove('is-dragging');
          document.body.classList.remove('tagfox-props-split-drag');
          if (moved) persistPaneWidths();
        }
        split.addEventListener('pointermove', move);
        split.addEventListener('pointerup', up);
        split.addEventListener('pointercancel', up);
        split.addEventListener('lostpointercapture', up);
      });
      /* Runner: a double-click puts the Viewer back to a third of the window. */
      split.addEventListener('dblclick', () => {
        if (!isRunnerMode()) return;
        runnerViewerPx = null;
        applyPaneWidths();
        persistPaneWidths();
      });
    }

    function bindViewerDocSplitters() {
      const MIN_PCT = 20;
      const MAX_PCT = 80;
      document.querySelectorAll('.viewer-doc-split-divider').forEach((divider) => {
        divider.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const split = divider.closest('.viewer-doc-split');
          if (!split) return;
          const theater = isPropsTheaterOn();
          const rect = split.getBoundingClientRect();
          const size = theater ? rect.width : rect.height;
          if (!Number.isFinite(size) || size <= 24) return;
          document.body.classList.add('tagfox-viewer-doc-split-drag');
          const removeShield = addSplitDragShield(theater ? 'col-resize' : 'row-resize');
          let raf = 0;
          function flushViewerDocSplit() {
            raf = 0;
            applyViewerDocSplitSizes();
          }
          function move(ev) {
            const raw = theater ? ((ev.clientX - rect.left) / size) * 100 : ((ev.clientY - rect.top) / size) * 100;
            const next = Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round(raw)));
            if (theater) viewerDocSplitPctTheater = next;
            else viewerDocSplitPct = next;
            if (!raf) raf = requestAnimationFrame(flushViewerDocSplit);
          }
          function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            removeShield();
            if (raf) cancelAnimationFrame(raf);
            flushViewerDocSplit();
            document.body.classList.remove('tagfox-viewer-doc-split-drag');
            persistViewerDocSplitSizes();
          }
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
        });
      });
    }

    /**
     * Settings scope folder changed from UI: persist, breadcrumb, immediate Everything refresh.
     * Use for breadcrumb, favourites, folder row, row parent-scope (chevron), sibling-folder dropdown, etc.
     */
    async function applySearchScopeAndRefresh(folderAbsPath) {
      setSearchScopeFolder(clampFolderPathToSearchMax(folderAbsPath));
      const scopeNorm = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim());
      if (scopeNorm) bumpFolderFocusVisit(scopeNorm);
      saveSettings();
      renderScopeBreadcrumb();
      await runSearchNow();
      commitSearchHistoryNow();
      pulseSearchBoxAfterScopeFolderChange();
    }

    /** The last hour's changes anywhere, reset in place to Runner's own defaults: no query, no scope folder,
     *  no tags, 1 hour recency. Reached only by the global Ctrl+Shift+Space (main.js RECENT_CHANGES_ACCEL),
     *  so it works while TagFox is hidden. */
    async function openRecentChanges() {
      document.getElementById('rootFolder').value = '';
      clearSearchQueryInputOnly();
      renderRunnerScopeChip();
      renderScopeBreadcrumb();
      runnerResetAllFilters({ recency: '1h' });
    }

    // -------------------------------------------------------------------------
    // Runner: a second layout of this same renderer (Settings, "Toggle key opens"). One large search
    // box, a flat ranked list and the Viewer on the right third. It reuses runSearch, renderTableImpl,
    // the Viewer and the favourites store; body.tagfox-runner does the layout in styles.css. Runner and
    // Classic each keep their own search state: switching saves the one being left and restores the
    // other, so Runner's flat list and sort order never leak into Classic.
    // -------------------------------------------------------------------------

    /** Every ranking weight is here. Everything does not score relevance, so the smart order is a
        client-side re-rank of what the queries return. */
    const RUNNER_RANK = Object.freeze({
      /* Rows per Everything request in Runner; the re-rank sees at most this many from the main query. */
      fetchCap: 300,
      /* All query words matched as the whole name stem. Words that match only the path score 0. */
      match: 50,
      /* A word found in the name scores `inside`, plus `wordStart` and `wordEnd` when it begins or ends at a
         word boundary (space, punctuation, a camelCase hump or a letter-digit change), plus `nameStart` at
         the start of the name. So a whole word scores 0.75, the start of a word 0.6, the end of one 0.55
         and the middle 0.4; `exact` is the whole name without its extension. */
      matchKind: Object.freeze({ exact: 1, inside: 0.4, wordStart: 0.2, wordEnd: 0.15, nameStart: 0.1, path: 0 }),
      /* Modified just now; decays with a time constant of recencyDays. Kept below a whole word's lead over an
         inside-word match (37.5 against 20), so an old file named for the word beats today's file that only
         contains it (Steve, October 2026; pinned by test/runner-layout.cjs). */
      recency: 15,
      recencyDays: 14,
      star: 35,
      /* Opened or visited in TagFox; saturates at useSaturates times. */
      use: 20,
      useSaturates: 20,
      lastUse: 10,
      lastUseDays: 30,
      /* In Windows' Recent list (opened lately in any app), decaying with windowsRecentDays from when. */
      windowsRecent: 15,
      windowsRecentDays: 7,
      /* Taken off anything under a folder of one of these names (AppData: caches, logs, app state;
         ProgramData: the same for every user, with 518 of Steve's 7,289 ProgramData items Windows crash
         reports named Report.wer, October 2026), unless the current folder is inside that folder or the
         query names it. A ranking penalty, not a filter: such rows still come up. */
      rankedDownFolders: Object.freeze(['appdata', 'programdata']),
      rankedDown: 45,
      /* Temp hits (AppData\Local\Temp) come from a query of their own, the newest this many, so they cannot
         crowd ordinary matches out of fetchCap; being under AppData, they take rankedDown. */
      tempFetch: 25,
      /* Taken off anything with a `~` segment in its path (Word's ~$ lock files, ~folders), which Runner lists
         rather than hides. Not taken when the whole name was typed (`keys.kdbx` in `~keys_and_ids`), when the
         query contains a ~, or inside a ~folder. Measured on Steve's keys.kdbx (test/runner-layout.cjs):
         without the whole-name exception an xk note that only mentions keys.kdbx ranks above it. */
      tilde: 45,
    });

    /** Runner draws this many ranked rows and more as you scroll or arrow down: the first layout of a
        results row costs about 1.6ms, so drawing a 575-row page took 0.9s (measured October 2026). */
    const RUNNER_RENDER_PAGE = 100;
    let runnerRenderLimit = RUNNER_RENDER_PAGE;
    /** Scope and query the render window was last reset for. */
    let runnerRenderKey = null;

    let runnerModeOn = false;
    /** 'smart' re-ranks; 'date' (newest first), 'name', 'size' (largest first) and 'size-asc' are plain sorts. */
    const RUNNER_SORTS = ['smart', 'date', 'name', 'size', 'size-asc'];
    let runnerSort = 'smart';
    /** Scope and query the selection was last reset for: a new list selects its top row. */
    let selectAfterSearchKey = null;
    /** The list key and row Runner's early paint of that list selected, until its merged list arrives. */
    let earlySelect = null;
    /** After Left, select the folder we came up from. */
    let runnerPendingSelectPath = null;
    /** Everything's match count for the last main query, to say when the re-rank saw only part of it. */
    let runnerTotalHits = null;

    function isRunnerMode() {
      return runnerModeOn;
    }

    function runnerDefaultSearchState() {
      return {
        query: '',
        rootFolder: '',
        activeTagKeys: [],
        excludedTagKeys: [],
        tagFilterCombineOr: false,
        resultsContent: 'all',
        showSubfolders: false,
        optCase: false,
        optWholeWord: false,
        optPath: true,
        optDiacritics: false,
        optHideSpecial: true,
        /* ~ paths are listed and ranked down (RUNNER_RANK.tilde), not hidden. */
        optHideTilde: false,
        recencyFilter: 'all',
        sortColumn: 'date_modified',
        sortAsc: false,
        advancedPanelOpen: false,
      };
    }

    /** The Settings scope ceiling is global, so neither layout's saved state may carry it back. */
    function searchStateWithoutCeiling(s) {
      const o = { ...(s || {}) };
      delete o.searchScopeMax;
      delete o.searchScopeCeilings;
      return o;
    }

    function runnerSortColumnFor(sort) {
      if (sort === 'name') return { col: 'name', asc: true };
      if (sort === 'size' || sort === 'size-asc') return { col: 'size', asc: sort === 'size-asc' };
      return { col: 'date_modified', asc: false };
    }

    /** Apply a layout to the live UI without searching. startup: the UI already holds this layout's state. */
    function applyRunnerModeSync(on, opts = {}) {
      on = !!on;
      if (on) {
        if (!opts.startup) {
          lsSetJson(LS.runnerClassicStash, serializeSearchState());
        }
        const savedSort = localStorage.getItem(LS.runnerSort);
        runnerSort = RUNNER_SORTS.includes(savedSort) ? savedSort : 'smart';
        const saved = lsGetJson(LS.runnerState, null);
        const st = searchStateWithoutCeiling({ ...runnerDefaultSearchState(), ...(saved || {}) });
        const sc = runnerSortColumnFor(runnerSort);
        st.sortColumn = sc.col;
        st.sortAsc = sc.asc;
        applySearchState(st);
        /* Runner hid ~ paths by default until October 2026; carry that saved hide over to showing them once.
           A hide chosen after this survives, because the marker is written either way. */
        if (localStorage.getItem(LS.runnerTildeShownMoved) !== '1') {
          localStorage.setItem(LS.runnerTildeShownMoved, '1');
          runnerSetOpt('optHideTilde', false);
          lsSetJson(LS.runnerState, serializeSearchState());
        }
      } else if (runnerModeOn) {
        lsSetJson(LS.runnerState, serializeSearchState());
        const stash = lsGetJson(LS.runnerClassicStash, null);
        if (stash) applySearchState(searchStateWithoutCeiling(stash));
      }
      runnerModeOn = on;
      selectAfterSearchKey = null;
      document.body.classList.toggle('tagfox-runner', on);
      placeStatusLineForLayout(on);
      closeRunnerCmdList(false);
      setRunnerOptsPanelOpen(false);
      renderRunnerScopeChip();
      renderRunnerFilterChips();
      applyRunnerViewerOff();
      applyPaneWidths();
      const split = document.getElementById('splitProps');
      if (split) split.title = on ? 'Drag to resize the Viewer; double-click for a third of the window' : 'Drag';
      scheduleSyncShelfAsideWidth();
      refreshRunnerWindowsRecent();
    }

    /** Moves an element into Runner's layout (into runnerParent, before runnerBefore or at the end), or back
        to where Classic's markup put it. */
    function placeForLayout(el, on, runnerParent, runnerBefore) {
      if (!el) return;
      if (!el._classicHome) el._classicHome = { parent: el.parentElement, next: el.nextElementSibling };
      if (on) {
        if (runnerParent) runnerParent.insertBefore(el, runnerBefore && runnerBefore.parentElement === runnerParent ? runnerBefore : null);
      } else {
        const { parent, next } = el._classicHome;
        parent.insertBefore(el, next && next.parentElement === parent ? next : null);
      }
    }

    /** Classic's header holds the Restart button and Runner has no header, so in Runner the button sits in
        the box, before the rank note. It shows only when TagFox's own code has changed since it started. */

    /** Runner has no status bar along the window's foot: its status line goes in the list's column, where
        CSS floats it over the list's foot just above the Shelf, and holds the rotating tip until a message
        comes. */
    function placeStatusLineForLayout(on) {
      const bar = document.getElementById('tagfoxNavbarStatus');
      const shelf = document.getElementById('appShelf');
      placeForLayout(bar, on, shelf && shelf.parentElement, shelf);
    }

    /** A typed file type: `.pdf` or `*.pdf`, or `-.tmp` to leave one out. */
    const RUNNER_TYPE_WORD = /^([-!]?)\*?\.([\p{L}\p{N}]{1,12})$/u;
    /** Extensions that also count without the dot (`pdf`, `-docx`), as Steve asked. Only document and media
        types that are rarely ordinary words: `map`, `log`, `key` and `old` stay words, or "causal map" would
        become a filter for .map files. */
    const RUNNER_BARE_TYPES = new Set(
      'pdf md qmd rmd txt rtf doc docx odt xls xlsx ods csv tsv ppt pptx odp gdoc gsheet gslides epub html htm json yaml yml xml ipynb py js ts ps1 sql png jpg jpeg gif svg webp heic mp3 m4a wav ogg flac mp4 mov webm mkv avi zip eml msg ics vcf bib tex'.split(' ')
    );

    /** A file-type token, typed with the dot or as a bare known extension: { not, ext }, else null. */
    function runnerTypeToken(t) {
      const m = RUNNER_TYPE_WORD.exec(t);
      if (m) return { not: !!m[1], ext: m[2].toLowerCase() };
      const b = /^([-!]?)([a-z0-9]{1,6})$/i.exec(t);
      if (b && RUNNER_BARE_TYPES.has(b[2].toLowerCase())) return { not: !!b[1], ext: b[2].toLowerCase() };
      return null;
    }

    /** A plain word Everything can be asked to find at a word start (no operators, wildcards or quotes). */
    const RUNNER_PLAIN_WORD = /^[\p{L}\p{N}][\p{L}\p{N}._'-]*$/u;
    /** `^word`, or every plain word when "Word starts only" is on: the word itself first, which keeps the
        regex to the names that already contain it (0.1-0.6s cold, against 5.5-6.3s for the regex alone on
        2.4 million items, October 2026), then the regex that wants a word boundary before it. `^` means
        nothing to Everything outside regex:, so the box can use it. */
    function runnerWordStartTerm(w) {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return w + ' regex:"(?:^|[^\\p{L}\\p{N}])' + esc + '"';
    }
    function runnerWordStartsOnly() {
      return localStorage.getItem(LS.runnerWordStarts) === '1';
    }

    /** Google-style exclusion: a leading -word becomes Everything's !word. Typed file types become one
        `ext:` filter (any of them) and one `!ext:` (none of them). `^word` matches at word starts only. */
    function runnerQueryForEverything(q) {
      const out = [];
      const types = [];
      const notTypes = [];
      const starts = runnerWordStartsOnly();
      for (const t of String(q || '').split(/\s+/).filter(Boolean)) {
        const ty = runnerTypeToken(t);
        if (ty) (ty.not ? notTypes : types).push(ty.ext);
        else if (t.startsWith('^') && RUNNER_PLAIN_WORD.test(t.slice(1))) out.push(runnerWordStartTerm(t.slice(1)));
        else if (starts && RUNNER_PLAIN_WORD.test(t)) out.push(runnerWordStartTerm(t));
        else out.push(t.replace(/^-(?=\S)/, '!'));
      }
      if (types.length) out.push('ext:' + types.join(';'));
      if (notTypes.length) out.push('!ext:' + notTypes.join(';'));
      return out.join(' ');
    }

    /** The file types a query asks for, from either the typed form (.pdf, pdf) or Everything's (ext:pdf;md). */
    function runnerQueryTypes(q) {
      const types = [];
      for (const t of String(q || '').split(/\s+/)) {
        const ty = runnerTypeToken(t);
        if (ty && !ty.not) types.push(ty.ext);
        const e = /^ext:(.+)$/i.exec(t);
        if (e) types.push(...e[1].toLowerCase().split(';').filter(Boolean));
      }
      return types;
    }

    /** Accents dropped, case kept. */
    function runnerFoldAccents(s) {
      return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    function runnerFoldText(s) {
      return runnerFoldAccents(s).toLowerCase();
    }

    /** Everything modifiers that wrap a text term (`wfn:budget`): the text still counts as a name word. */
    const RUNNER_TEXT_MODIFIERS =
      /^(?:(?:case|nocase|ww|wholeword|nowholeword|path|nopath|wfn|wholefilename|nowfn|file|folder|diacritics|nodiacritics|startwith|endwith):)+/i;

    /** Lower-cased, accent-free words of the query that must match the name or path. Excluded words, file
        types and Everything functions (`dm:today`, `size:>1mb`, `regex:`, `parent:`) are filters, not name
        words, so they are dropped; a text modifier (`wfn:`, `case:`) is dropped and its text kept. */
    function runnerQueryWords(q) {
      const kept = String(q || '')
        .split(/\s+/)
        .map((t) => t.replace(/^[<>]+|[<>]+$/g, '').replace(RUNNER_TEXT_MODIFIERS, ''))
        .filter((t) => t && !/^[-!]/.test(t) && !runnerTypeToken(t) && !/^[\p{L}_-]+:/u.test(t))
        .join(' ');
      return runnerFoldText(kept).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    }

    /** How well the words match the name, not the path: { quality 0..1, inName: words found in the name }. */
    /** nameFold keeps its case (camelCase humps are word boundaries); stemLc is lower case, no extension. */
    function runnerNameMatch(nameFold, stemLc, words) {
      if (!words.length) return { quality: 0, inName: 0 };
      const K = RUNNER_RANK.matchKind;
      if (stemLc === words.join(' ')) return { quality: K.exact, inName: words.length };
      const nameLc = nameFold.toLowerCase();
      /* The whole name typed, extension included (`keys.kdbx`). A leading separator survives the split as
         an empty word, so `~$report.docx` is not an exact match for `report.docx`. */
      if (nameLc.split(/[^\p{L}\p{N}]+/u).join(' ') === words.join(' ')) return { quality: K.exact, inName: words.length };
      const isAlnum = (c) => /[\p{L}\p{N}]/u.test(c);
      const isLetter = (c) => /\p{L}/u.test(c);
      /* A boundary between positions i-1 and i. */
      const boundary = (i) => {
        if (i <= 0 || i >= nameFold.length) return true;
        const a = nameFold[i - 1];
        const b = nameFold[i];
        if (!isAlnum(a) || !isAlnum(b)) return true;
        if (isLetter(a) !== isLetter(b)) return true;
        return a !== a.toUpperCase() && b !== b.toLowerCase();
      };
      let sum = 0;
      let inName = 0;
      for (const w of words) {
        let best = K.path;
        if (stemLc === w) best = K.exact;
        else {
          for (let at = nameLc.indexOf(w); at >= 0; at = nameLc.indexOf(w, at + 1)) {
            const q =
              K.inside +
              (boundary(at) ? K.wordStart : 0) +
              (boundary(at + w.length) ? K.wordEnd : 0) +
              (at === 0 ? K.nameStart : 0);
            if (q > best) best = q;
          }
        }
        if (best > K.path) inName++;
        sum += best;
      }
      return { quality: sum / words.length, inName };
    }

    function runnerUseStats() {
      const use = new Map();
      for (const st of [loadFileFocusStats(), loadFolderFocusStats()]) {
        for (const v of Object.values(st)) {
          const k = pathNormKey(v.path);
          const prev = use.get(k);
          use.set(k, {
            visits: (prev ? prev.visits : 0) + (v.visits || 0),
            lastTs: Math.max(prev ? prev.lastTs : 0, v.lastTs || 0),
          });
        }
      }
      return use;
    }

    /** The ranking boost for how often and how lately a path was opened or visited. */
    function runnerUseBoost(u, now) {
      if (!u) return 0;
      let s = RUNNER_RANK.use * Math.min(1, Math.log1p(u.visits) / Math.log1p(RUNNER_RANK.useSaturates));
      if (u.lastTs) s += RUNNER_RANK.lastUse * Math.exp(-Math.max(0, now - u.lastTs) / (RUNNER_RANK.lastUseDays * 864e5));
      return s;
    }

    const RUNNER_RANKED_DOWN = RUNNER_RANK.rankedDownFolders.map((name) => ({ name, re: new RegExp('[\\\\/]' + name + '[\\\\/]', 'i') }));

    /** Smart order: rows with more query words in the name come first, then by score. */
    function rankRowsForRunner(rows) {
      if (!Array.isArray(rows) || !rows.length) return;
      const qText = document.getElementById('query')?.value;
      const words = runnerQueryWords(qText);
      /* Only file types typed: nothing to match names against, so the newest of that type come first. */
      if (!words.length && runnerQueryTypes(runnerQueryForEverything(qText)).length) {
        rows.sort((a, b) => compareRowsBySort(a, b, 'date_modified', false));
        return;
      }
      const stars = new Set(loadFavouriteFolders().map((p) => pathNormKey(p)));
      const use = runnerUseStats();
      const now = Date.now();
      const day = 864e5;
      const scope = String(document.getElementById('rootFolder')?.value || '').trim();
      const rankedDown = RUNNER_RANKED_DOWN.filter((f) => !f.re.test(scope + '\\') && !words.some((w) => w.includes(f.name)));
      const tildePenalty = pathUnderTildeSegment(scope) || String(qText || '').includes('~') ? 0 : RUNNER_RANK.tilde;
      const scored = rows.map((r) => {
        const fp = fullPathForRow(r);
        const k = pathNormKey(fp);
        const nameFold = runnerFoldAccents(T.baseName(fp));
        const nameLc = nameFold.toLowerCase();
        const dot = rowIsFolder(r) ? -1 : nameLc.lastIndexOf('.');
        const stemLc = dot > 0 ? nameLc.slice(0, dot) : nameLc;
        const m = runnerNameMatch(nameFold, stemLc, words);
        let s = RUNNER_RANK.match * m.quality;
        const mt = modifiedTimeMs(r);
        if (mt) s += RUNNER_RANK.recency * Math.exp(-Math.max(0, now - mt) / (RUNNER_RANK.recencyDays * day));
        if (stars.has(k)) s += RUNNER_RANK.star;
        s += runnerUseBoost(use.get(k), now);
        const win = runnerWindowsRecent.get(k);
        if (win) s += RUNNER_RANK.windowsRecent * (win.at ? Math.exp(-Math.max(0, now - win.at) / (RUNNER_RANK.windowsRecentDays * day)) : 1);
        if (rankedDown.some((f) => f.re.test(fp))) s -= RUNNER_RANK.rankedDown;
        if (tildePenalty && m.quality < RUNNER_RANK.matchKind.exact && pathUnderTildeSegment(fp)) s -= tildePenalty;
        return { r, tier: m.inName, s };
      });
      scored.sort((a, b) => b.tier - a.tier || b.s - a.s || compareRowsBySort(a.r, b.r, 'date_modified', false));
      for (let i = 0; i < rows.length; i++) rows[i] = scored[i].r;
    }

    /** Starred and used paths under the current folder whose path could match the query. The words
        test is only a pre-filter, so it runs only on plain words; Everything applies the real query. */
    function runnerPinnedCandidatePaths(query, rootFolder, recursive) {
      const byKey = new Map();
      const add = (p) => {
        const n = normalizeFolderPathForEverything(String(p || '').trim());
        if (n) byKey.set(pathNormKey(n), n);
      };
      for (const p of loadFavouriteFolders()) add(p);
      for (const st of [loadFileFocusStats(), loadFolderFocusStats()]) for (const v of Object.values(st)) add(v.path);
      for (const w of runnerWindowsRecent.values()) add(w.path);
      const scope = normalizeFolderPathForEverything(String(rootFolder || '').trim()).replace(/[/\\]+$/, '');
      const scopeKey = scope ? pathNormKey(scope) : '';
      const types = runnerQueryTypes(query);
      const nameTerms = String(query || '')
        .split(/\s+/)
        .filter((t) => !/^!?ext:/i.test(t))
        .join(' ')
        .trim();
      const plain = /^[\p{L}\p{N}\s._!-]*$/u.test(nameTerms);
      const words = plain ? runnerQueryWords(nameTerms) : [];
      const pathOn = !!document.getElementById('optPath')?.checked;
      const out = [];
      for (const [k, p] of byKey) {
        if (scope) {
          if (k === scopeKey) continue;
          if (recursive) {
            if (!pathIsUnderOrEqualFolder(p, scope)) continue;
          } else if (pathNormKey(normalizeFolderPathForEverything(T.parentDir(p))) !== scopeKey) continue;
        }
        if (words.length) {
          const hay = runnerFoldText(pathOn ? p : T.baseName(p));
          if (!words.every((w) => hay.includes(w))) continue;
        }
        if (types.length) {
          const nm = T.baseName(p).toLowerCase();
          if (!types.some((e) => nm.endsWith('.' + e))) continue;
        }
        out.push(p);
      }
      return out;
    }

    /** Rows the main query's page may have missed: names matching the words (with Match path on, a
        common word matches thousands of paths and the page holds only the newest), every starred or
        used path that matches, and the newest Temp hits. Merged into the main rows; never paged. */
    /** Runner: a newer search has been asked for since the running one took the mutex. */
    function runnerSearchSuperseded() {
      return isRunnerMode() && activeSearchRequest !== searchRequestSeq;
    }

    async function runnerExtraRows({ runId, ceilingNorms, rootFolder, queryForEs, recursive, options, cap, after }) {
      const jobs = [];
      const sent = (lastRunnerExtraSearchTexts = []);
      const ask = (searchText, count) => {
        sent.push(searchText);
        jobs.push({ searchText, count });
      };
      const q = String(queryForEs || '').trim();
      const toks = q.split(/\s+/).filter(Boolean);
      /* File types stay outside the name-only group, so `budget ext:xlsx` asks for names with budget. */
      const positive = toks.filter((t) => !t.startsWith('!') && !/^ext:/i.test(t)).join(' ');
      const negative = toks.filter((t) => t.startsWith('!') || /^ext:/i.test(t)).join(' ');
      /* Name matches, so the main fetch's newest 300 (mostly path matches for a common word) cannot crowd
         them out. nopath:<...> also takes groups, | and regex: terms (checked against Everything 1.5a). */
      if (runnerSort === 'smart' && positive && options.pathSearch && !/^nopath:/i.test(q)) {
        ask(everythingSearchTextForUi(ceilingNorms, rootFolder, ('nopath:<' + positive + '> ' + negative).trim(), recursive), cap);
      }
      /* Names that are exactly the typed words, so an old `map.json` is not lost among 50,000 newer names
         that merely contain "map" (353 exact against 49,966; 0.07-0.11s cold, about 0 warm). */
      const plainToks = toks.filter((t) => !t.startsWith('!') && !/^ext:/i.test(t));
      if (runnerSort === 'smart' && plainToks.length && plainToks.every((t) => RUNNER_PLAIN_WORD.test(t))) {
        const stem = plainToks.join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        ask(
          everythingSearchTextForUi(
            ceilingNorms,
            rootFolder,
            ('nopath:<' + plainToks.join(' ') + ' regex:"^' + stem + '(\\.[^.\\\\]+)?$"> ' + negative).trim(),
            recursive
          ),
          cap
        );
      }
      const pins = runnerPinnedCandidatePaths(queryForEs, rootFolder, recursive);
      const base = everythingSearchTextForUi(ceilingNorms, rootFolder, queryForEs, recursive);
      if (pins.length) {
        /* The list goes first: Everything looks the paths up directly and tests the rest of the query on those
           alone, 3-10ms for 150 or 443 paths, against 0.5-1s with the list last (2.4 million items, October 2026). */
        const list = 'filelist:"' + pins.map((p) => String(p).replace(/"/g, '').replace(/[/\\]+$/, '')).join('|') + '"';
        ask(list + ' ' + base, pins.length);
      }
      /* Temp hits, which every other query leaves out; smart order only, where they rank down. */
      if (runnerSort === 'smart' && q && !runnerHideTempOn() && runnerLeavesOutTemp(rootFolder)) {
        const tempDir = await runnerUserTempDir();
        if (tempDir) ask(everythingSearchTextForUi(ceilingNorms, rootFolder, queryForEs, recursive, { tempDir }), RUNNER_RANK.tempFetch);
        else searchDebugLog('runner.extraRows.noTempDir', { runId });
      }
      if (!jobs.length) return [];
      /* Sent after the main query and one at a time, each only while this search is still the newest: costs
         nothing, since Everything runs them one at a time anyway, and an overtaken search then leaves at most
         one query in Everything's queue ahead of the newest keystroke's, instead of all of them. */
      const results = [];
      try {
        await Promise.resolve(after).catch(() => null);
        for (const j of jobs) {
          if (runId !== searchRunSeq || runnerSearchSuperseded()) return [];
          runnerSearchCounters.extraSent++;
          results.push(await everythingSearchOnce({ searchText: j.searchText, count: j.count, options: { ...options, offset: 0 } }));
        }
      } catch (err) {
        searchDebugLog('runner.extraRows.error', { runId, err: String((err && err.message) || err) });
        return [];
      }
      if (runId !== searchRunSeq || runnerSearchSuperseded()) return [];
      let out = [];
      let failed = 0;
      for (const r of results) {
        if (r && r.ok && Array.isArray(r.rows)) out = mergeSearchRowsDedupe(out, r.rows);
        else failed++;
      }
      searchDebugLog('runner.extraRows', { runId, jobs: jobs.length, pins: pins.length, rows: out.length, failed });
      return out;
    }

    /** A list's identity for selection and the render window: its scope and query. */
    function selectAfterSearchKeyFor(query, rootFolder) {
      return pathNormKey(normalizeFolderPathForEverything(String(rootFolder || '').trim())) + '\n' + String(query || '').trim();
    }

    function runnerListKey() {
      return selectAfterSearchKeyFor(document.getElementById('query')?.value, document.getElementById('rootFolder').value);
    }

    /** A new list (scope or query changed) starts with one window of rows drawn. */
    function runnerResetRenderWindowIfNewList() {
      const k = runnerListKey();
      if (k === runnerRenderKey) return;
      runnerRenderKey = k;
      runnerRenderLimit = RUNNER_RENDER_PAGE;
    }

    /** Rows drawn: everything in Classic, the window in Runner. */
    function renderedRowCount(total) {
      return isRunnerMode() ? Math.min(total, runnerRenderLimit) : total;
    }

    /** Draw more rows when the selection or the scroll reaches the end of the window. */
    function runnerGrowRenderWindow(toIdx) {
      if (!isRunnerMode()) return false;
      const total = listRowsForUi().length;
      if (runnerRenderLimit >= total || toIdx < runnerRenderLimit - 3) return false;
      runnerRenderLimit = Math.min(total, Math.max(runnerRenderLimit, toIdx + 1) + RUNNER_RENDER_PAGE);
      const sc = document.getElementById('resultsScroll');
      const top = sc ? sc.scrollTop : 0;
      renderTable();
      if (sc) sc.scrollTop = top;
      return true;
    }

    /** When the smart order ranked only part of the matches, say so in the box: "300 of 1.9M ranked", with
        the whole sentence as its tooltip. Runner has no standing status line, and a list that looks complete
        but is not must still say so. */
    function renderRunnerRankNote() {
      const el = document.getElementById('runnerRankNote');
      if (!el) return;
      const partial = isRunnerMode() && runnerSort === 'smart' && resultsPagingCtx && resultsPagingCtx.hasMore;
      el.classList.toggle('d-none', !partial);
      if (!partial) return;
      const seen = resultsPagingCtx.singleOffset;
      const known = typeof runnerTotalHits === 'number';
      const compact = known
        ? new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(runnerTotalHits)
        : '';
      el.textContent = known ? seen + ' of ' + compact + ' ranked' : seen + ' newest ranked';
      el.title =
        'Ranked the ' + seen + ' newest' + (known ? ' of ' + runnerTotalHits.toLocaleString() : '') +
        ' matches, plus name matches and every starred or used item that matches. Type more to narrow.';
    }

    /** After a search: a new list (scope or query changed) selects its top row, or the folder just left, so ↓, Tab
        and Enter start from it. Classic does so only for typed text, and never re-selects within the same list:
        a folder browsed with an empty box keeps its folder doc in the Viewer, and rows unchecked by hand stay
        unchecked through F5 and auto-refresh. `early` is Runner's paint of the main rows before the merged list
        (runSearch): it selects the same way but leaves the list unrecorded, so the merged list selects its own top
        row, unless the selection has been moved by hand in between. */
    function selectRowAfterSearch(query, rootFolder, { early = false } = {}) {
      const key = selectAfterSearchKeyFor(query, rootFolder);
      const rows = listRowsForUi();
      const classic = !isRunnerMode();
      const earlyPick = earlySelect && earlySelect.key === key ? earlySelect.path : null;
      earlySelect = null;
      /* Classic records no key for an empty list, so the same text finding rows on a later run still selects. */
      if (!rows.length) {
        if (!classic && !early) selectAfterSearchKey = key;
        return;
      }
      if (classic && (key === selectAfterSearchKey || !String(query || '').trim())) {
        selectAfterSearchKey = key;
        return;
      }
      const idxOf = (p) => {
        const k = pathNormKey(p);
        return rows.findIndex((r) => pathNormKey(fullPathForRow(r)) === k);
      };
      if (earlyPick && selectedFullPath && pathNormKey(selectedFullPath) !== pathNormKey(earlyPick) && idxOf(selectedFullPath) >= 0) {
        runnerPendingSelectPath = null;
        selectAfterSearchKey = key;
        return;
      }
      let idx = -1;
      if (runnerPendingSelectPath) {
        idx = idxOf(runnerPendingSelectPath);
        if (!early) runnerPendingSelectPath = null;
      }
      if (idx < 0) {
        if (key === selectAfterSearchKey && selectedFullPath && idxOf(selectedFullPath) >= 0) return;
        idx = 0;
      }
      if (early) earlySelect = { key, path: fullPathForRow(rows[idx]) };
      else selectAfterSearchKey = key;
      resultsExclusiveSelectRow(rows[idx], fullPathForRow(rows[idx]));
      if (idx === 0) {
        const sc = document.getElementById('resultsScroll');
        if (sc) sc.scrollTop = 0;
      } else scrollActiveResultsRowIntoViewNearest();
    }

    /** Navigate in Runner: the box is cleared, so a folder shows its own contents until you type. */
    async function runnerNavigate(go, selectAfterPath) {
      runnerPendingSelectPath = selectAfterPath || null;
      clearSearchQueryInputOnly();
      await go();
    }

    /** The box's text as an absolute path, if it is one: a drive path (C:\…, C:/…, a bare C:) or a UNC path,
        with surrounding quotes taken off, as Explorer's "Copy as path" adds them. Else ''. */
    function runnerPathInBox(text) {
      let s = String(text || '').trim();
      if (s.length > 1 && /^(["']).*\1$/.test(s)) s = s.slice(1, -1).trim();
      if (/^[a-z]:([\\/]|$)/i.test(s)) return s.replace(/\//g, '\\');
      if (/^\\\\[^\\/]+[\\/][^\\/]+/.test(s)) return s;
      return '';
    }

    /** Runner has no address bar, so a path in the box goes there: a folder is opened, a file's folder is
        opened with the file selected, and the box is emptied (or, when the folder lists too many rows to
        include the file, given the file's name). Anything that does not exist (main's
        `path-kinds` says so) is left in the box as an ordinary search, and so returns false. */
    async function runnerGoToPathInBox() {
      const q = document.getElementById('query');
      const p = runnerPathInBox(q.value);
      if (!p) return false;
      let kind = 'missing';
      try {
        const r = await window.tagBrowser.pathKinds([p]);
        kind = (r && r.kinds && r.kinds[p]) || 'missing';
      } catch (_) {}
      /* Typing on while main looked means the box no longer says this path. */
      if (kind === 'missing' || runnerPathInBox(q.value) !== p) return false;
      const folder = normalizeFolderPathForEverything(kind === 'folder' ? p : T.parentDir(p));
      await runnerNavigate(() => applySearchScopeAndRefresh(folder), kind === 'file' ? p : null);
      /* A folder lists only its newest rows (fetchCap), so an older file in a big one is looked for by name. */
      const k = pathNormKey(p);
      if (kind === 'file' && !listRowsForUi().some((r) => pathNormKey(fullPathForRow(r)) === k)) {
        runnerPendingSelectPath = p;
        q.value = T.baseName(p);
        syncQueryGhostUi();
        await runSearchNow();
      }
      return true;
    }

    /** Enter: a path in the box goes there; with an empty list inside a folder, the same text is searched for
        everywhere (never a path that does not exist, which no search would find); otherwise the selected row opens. */
    async function runnerEnter(c) {
      if (c.inBox && (await runnerGoToPathInBox())) return;
      const pathTyped = !!runnerPathInBox(document.getElementById('query').value);
      if (c.inBox && !pathTyped && (await runnerSearchEverywhereWhenEmpty())) return;
      await runnerActivateSelection('open');
    }

    function runnerEnterSelectedFolder() {
      const row = selectedFullPath ? selectedRowForActions() : null;
      if (!row || !rowIsFolder(row)) return false;
      const folder = normalizeFolderPathForEverything(fullPathForRow(row));
      void runnerNavigate(() => applySearchScopeAndRefresh(folder), null);
      return true;
    }

    /** Left: the current folder's parent, or with no current folder the folder holding the selected row. */
    function runnerGoUp() {
      const scope = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim());
      if (scope) {
        void runnerNavigate(() => goToParentScopeFolder(), scope);
        return;
      }
      if (selectedFullPath) void runnerNavigate(() => keyboardScopeParentOfSelection(), selectedFullPath);
    }

    /** Stars are the favourites list: Ctrl+Shift+1..9 opens them in order, and Starred only lists them. */
    function toggleStarPath(fpRaw) {
      const fp = normalizeFolderPathForEverything(String(fpRaw || '').trim());
      if (!fp) return;
      const k = pathNormKey(fp);
      const list = loadFavouriteFolders();
      const at = list.findIndex((p) => pathNormKey(p) === k);
      const name = T.baseName(fp) || fp;
      if (at >= 0) {
        list.splice(at, 1);
        saveFavouriteFolders(list);
        setStatusMain('Unstarred ' + name + '.');
      } else {
        if (list.length >= FAV_FOLDERS_MAX) {
          setStatusMain('Stars are full (' + FAV_FOLDERS_MAX + '). Unstar one first.');
          return;
        }
        list.push(fp);
        saveFavouriteFolders(list);
        if (!loadFavouriteFolders().some((p) => pathNormKey(p) === k)) {
          setStatusMain('The star for ' + name + ' was not saved.');
          return;
        }
        setStatusMain('Starred ' + name + '.');
      }
      renderTable();
    }

    function toggleStarForSelection() {
      if (selectedFullPath) toggleStarPath(selectedFullPath);
    }

    function setRunnerSort(sort) {
      if (!RUNNER_SORTS.includes(sort)) return;
      runnerSort = sort;
      localStorage.setItem(LS.runnerSort, sort);
      const sc = runnerSortColumnFor(sort);
      sortColumn = sc.col;
      sortAsc = sc.asc;
      selectAfterSearchKey = null;
      saveSettings();
      void runSearchNow('identity');
    }

    function runnerSetOpt(id, on) {
      const el = document.getElementById(id);
      if (el) el.checked = !!on;
    }

    function runnerToggleSystemFiles() {
      runnerSetOpt('optHideSpecial', !isHideSpecialPaths());
      saveSettings();
      void runSearchNow('identity');
    }

    function runnerToggleTilde() {
      runnerSetOpt('optHideTilde', !isHideTildePaths());
      saveSettings();
      void runSearchNow('identity');
    }

    /* Every Runner query leaves AppData\Local\Temp out, and Temp hits come from one query of their own
       (runnerExtraRows). Mixed in, Temp crowds real matches out of the rows that get ranked: for "causal map"
       on Steve's index, 259 of the 293 rows fetched were Temp (test runs and caches), and 18 of the top 30
       ordinary rows were lost (October 2026). The exclusion costs at most about 0.2s a search. Inside a Temp
       folder nothing is left out, or the folder would look empty. */
    const RUNNER_TEMP_EXCLUDE = '!path:\\appdata\\local\\temp\\';
    function runnerLeavesOutTemp(rootFolder) {
      return isRunnerMode() && !/[\\/]appdata[\\/]local[\\/]temp([\\/]|$)/i.test(String(rootFolder || ''));
    }

    function runnerHideTempOn() {
      return localStorage.getItem(LS.runnerHideTemp) === '1';
    }

    /** Starred only: Runner lists the stars themselves (under the current folder, if any), which is its
        star list (Steve, October 2026). */
    function runnerStarredOnlyOn() {
      return isRunnerMode() && localStorage.getItem(LS.runnerStarredOnly) === '1';
    }

    function runnerToggleStarredOnly() {
      if (runnerStarredOnlyOn()) localStorage.removeItem(LS.runnerStarredOnly);
      else localStorage.setItem(LS.runnerStarredOnly, '1');
      selectAfterSearchKey = null;
      void runSearchNow('identity');
    }

    /** This folder only: typing (or a tag, a deadline range, Starred only) searches the current folder's own
        contents rather than everything below it. No folder means the whole index either way. */
    function runnerThisFolderOnlyOn() {
      return isRunnerMode() && localStorage.getItem(LS.runnerThisFolderOnly) === '1';
    }

    function runnerToggleThisFolderOnly() {
      if (runnerThisFolderOnlyOn()) localStorage.removeItem(LS.runnerThisFolderOnly);
      else localStorage.setItem(LS.runnerThisFolderOnly, '1');
      selectAfterSearchKey = null;
      void runSearchNow('identity');
    }

    /** A deadline command: that range, or off when it is already the one set. */
    function runnerToggleDeadline(range) {
      setDeadlineRange(activeDeadlineRange === range ? '' : range);
    }

    /* Windows' own Recent list (what any app opened lately) boosts the ranking, as Steve asked, rather than
       being listed. Main resolves the newest 28 shortcuts and caches them for a minute; this keeps the last
       answer and asks again at most once a minute, on focus. */
    let runnerWindowsRecent = new Map();
    let runnerWindowsRecentAskedAt = 0;
    function refreshRunnerWindowsRecent() {
      const tb = window.tagBrowser;
      if (!isRunnerMode() || !tb || typeof tb.windowsRecentFiles !== 'function') return;
      if (Date.now() - runnerWindowsRecentAskedAt < 60e3) return;
      runnerWindowsRecentAskedAt = Date.now();
      void Promise.all([
        tb.windowsRecentFiles().catch(() => null),
        typeof tb.windowsRecentFolders === 'function' ? tb.windowsRecentFolders().catch(() => null) : null,
      ]).then(([files, folders]) => {
        const m = new Map();
        for (const it of [...((files && files.files) || []), ...((folders && folders.folders) || [])]) {
          if (it && it.path) m.set(pathNormKey(it.path), { path: String(it.path), at: Number(it.mtimeMs) || 0 });
        }
        runnerWindowsRecent = m;
      });
    }

    /* The Temp query names the user's own Temp folder: Everything answers a path prefix in about 0.06s,
       against 0.23s for path:\appdata\local\temp\ (cold, 2.4 million items, October 2026), and it waits
       behind the other queries, since Everything runs one at a time. Other accounts' Temp folders stay out. */
    let runnerUserTempDirPromise = null;
    function runnerUserTempDir() {
      if (!runnerUserTempDirPromise) {
        runnerUserTempDirPromise = Promise.resolve()
          .then(() => window.tagBrowser.userHomeDir())
          .then((r) => (r && r.ok && r.path ? String(r.path).replace(/[/\\]+$/, '') + '\\AppData\\Local\\Temp' : ''))
          .catch(() => '');
        void runnerUserTempDirPromise.then((d) => {
          if (!d) runnerUserTempDirPromise = null;
        });
      }
      return runnerUserTempDirPromise;
    }

    function runnerToggleWordStarts() {
      if (runnerWordStartsOnly()) localStorage.removeItem(LS.runnerWordStarts);
      else localStorage.setItem(LS.runnerWordStarts, '1');
      void runSearchNow('identity');
    }

    function runnerToggleTemp() {
      if (runnerHideTempOn()) localStorage.removeItem(LS.runnerHideTemp);
      else localStorage.setItem(LS.runnerHideTemp, '1');
      void runSearchNow('identity');
    }

    /** Ctrl+V in Runner's box: files or an image on the clipboard go into the current folder, as Classic's
        paste does; text goes into the box. With no current folder there is no target, and it says so. */
    async function runnerPaste() {
      const q = document.getElementById('query');
      let kind = null;
      try {
        kind = await window.tagBrowser.clipboardKind();
      } catch (_) {}
      if (kind && (kind.files > 0 || kind.image)) {
        if (!currentScopeFolderPath()) {
          setStatusMain('No current folder to paste into. Go into a folder first (Right on a folder row), then paste.');
          return;
        }
        await pasteShortcutClipboardIntoScope();
        return;
      }
      let text = kind && typeof kind.text === 'string' ? kind.text : '';
      if (!kind) {
        try {
          text = await navigator.clipboard.readText();
        } catch (_) {}
      }
      if (!text) return;
      q.setRangeText(text.replace(/[\r\n]+/g, ' '), q.selectionStart, q.selectionEnd, 'end');
      q.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    }

    /** The Viewer's "where": the folder the item is in, under its name. Click copies the item's full path. */
    function setRunnerViewerPath(fp) {
      const el = document.getElementById('runnerViewerPath');
      if (!el) return;
      const parent = fp ? String(T.parentDir(fp) || '').replace(/[/\\]+$/, '') : '';
      el.textContent = parent || fp || '';
      el.dataset.path = fp || '';
      el.title = fp ? fp + '\nClick to copy the full path' : '';
      el.classList.toggle('d-none', !fp);
      if (el.dataset.bound === '1') return;
      el.dataset.bound = '1';
      el.addEventListener('click', () => {
        const p = el.dataset.path;
        if (!p) return;
        void navigator.clipboard.writeText(p).then(
          () => setStatusMain('Copied ' + p),
          () => setStatusMain('Could not copy the path.')
        );
      });
    }

    function runnerSetContent(cm) {
      applyResultsViewRadiosToDom(isShowSubfolders(), cm);
      syncViewRadioActiveFromDom();
      saveSettings();
      void runSearchNow('identity');
    }

    function runnerToggleMatchPath() {
      runnerSetOpt('optPath', !document.getElementById('optPath')?.checked);
      saveSettings();
      void runSearchNow('identity');
    }

    function runnerSetRecency(mode) {
      setRecencyFilterMode(mode);
      void runSearchNow('identity');
    }

    /** A tag command: Classic's include (or exclude) toggle, then the search. */
    function runnerToggleTag(word, exclude) {
      (exclude ? toggleTagFilterExclude : toggleTagFilterInclude)(word.toLowerCase(), word);
      persistActiveTagFilter();
      saveSettings();
      void runSearchNow('identity');
    }

    /** Ctrl+T: Classic's tag editor, on the checked rows, else the selected one. */
    function runnerEditTags() {
      if (getCheckedPathsArr().length) keyboardOpenTagsModal();
      else if (selectedFullPath) openTagModal(selectedFullPath);
      else setStatusMain('Select a row first, then Ctrl+T edits its tags.');
    }

    /** /New TODO: the Quick TODO box, aimed at the current folder. */
    function runnerNewTodoHere() {
      const folder = currentScopeFolderPath();
      if (!folder) {
        setStatusMain('Go into a folder first (Right on a folder row), then /New TODO puts the file there.');
        return;
      }
      showQuickTodoPop(folder);
    }

    /** One table drives the options panel and the / list. */
    const RUNNER_COMMANDS = [
      { id: 'sort-smart', group: 'Sort', label: 'Sort: smart (name matches, recent, starred, used)', isOn: () => runnerSort === 'smart', run: () => setRunnerSort('smart') },
      { id: 'sort-date', group: 'Sort', label: 'Sort by date, newest first', isOn: () => runnerSort === 'date', run: () => setRunnerSort('date') },
      { id: 'sort-name', group: 'Sort', label: 'Sort by name', isOn: () => runnerSort === 'name', run: () => setRunnerSort('name') },
      { id: 'sort-size', group: 'Sort', label: 'Sort by size, largest first', isOn: () => runnerSort === 'size', run: () => setRunnerSort('size') },
      { id: 'sort-size-asc', group: 'Sort', label: 'Sort by size, smallest first', isOn: () => runnerSort === 'size-asc', run: () => setRunnerSort('size-asc') },
      { id: 'edit-tags', group: 'Tags', label: 'Edit tags of the selected or checked rows (Ctrl+T)', run: () => runnerEditTags() },
      /* One filter per vocabulary word; the options panel draws these as a row of small buttons. */
      ...Object.keys(T.TAG_VOCAB).map((word) => ({
        id: 'tag-' + word.toLowerCase(),
        group: 'Tags',
        tag: word,
        label: 'Tagged ' + word,
        isOn: () => activeTagKeys.has(word.toLowerCase()) && !excludedTagKeys.has(word.toLowerCase()),
        run: () => runnerToggleTag(word),
      })),
      /* And one exclude per word, for the / list (/not claude); in the panel it is a right-click on the word's button. */
      ...Object.keys(T.TAG_VOCAB).map((word) => ({
        id: 'not-' + word.toLowerCase(),
        group: 'Tags',
        notTag: word,
        label: 'Not tagged ' + word,
        isOn: () => excludedTagKeys.has(word.toLowerCase()),
        run: () => runnerToggleTag(word, true),
      })),
      /* Classic's deadline panel, as commands; each shows as a chip. */
      { id: 'due-overdue', group: 'Due', label: 'Overdue (deadline passed)', isOn: () => activeDeadlineRange === 'overdue', run: () => runnerToggleDeadline('overdue') },
      { id: 'due-today', group: 'Due', label: 'Due today', isOn: () => activeDeadlineRange === 'today', run: () => runnerToggleDeadline('today') },
      { id: 'due-thisweek', group: 'Due', label: 'Due this week', isOn: () => activeDeadlineRange === 'thisweek', run: () => runnerToggleDeadline('thisweek') },
      { id: 'due-nextweek', group: 'Due', label: 'Due next week', isOn: () => activeDeadlineRange === 'nextweek', run: () => runnerToggleDeadline('nextweek') },
      { id: 'hidden-until', group: 'Due', label: 'Show files hidden until a later date (xh-)', isOn: () => showHiddenUntil, run: () => setShowHiddenUntil(!showHiddenUntil) },
      { id: 'starred', group: 'Show', label: 'Show only starred items', isOn: () => runnerStarredOnlyOn(), run: () => runnerToggleStarredOnly() },
      { id: 'system', group: 'Show', label: 'Show system files (. $ desktop.ini)', isOn: () => !isHideSpecialPaths(), run: () => runnerToggleSystemFiles() },
      { id: 'tilde', group: 'Show', label: 'Hide ~ paths (lock files, ~folders; listed lower when shown)', isOn: () => isHideTildePaths(), run: () => runnerToggleTilde() },
      { id: 'temp', group: 'Show', label: 'Hide temp files (AppData\\Local\\Temp; listed lower when shown)', isOn: () => runnerHideTempOn(), run: () => runnerToggleTemp() },
      { id: 'folders', group: 'Show', label: 'Folders only', isOn: () => isFoldersOnly(), run: () => runnerSetContent(isFoldersOnly() ? 'all' : 'folders') },
      { id: 'files', group: 'Show', label: 'Files only', isOn: () => isFilesOnly(), run: () => runnerSetContent(isFilesOnly() ? 'all' : 'files') },
      { id: 'viewer', group: 'Show', label: 'The Viewer (Alt+P)', isOn: () => !runnerViewerOff(), run: () => runnerToggleViewer() },
      { id: 'this-folder', group: 'Match', label: 'Search this folder only (not its subfolders)', isOn: () => runnerThisFolderOnlyOn(), run: () => runnerToggleThisFolderOnly() },
      { id: 'path', group: 'Match', label: 'Match path (off: names only)', isOn: () => !!document.getElementById('optPath')?.checked, run: () => runnerToggleMatchPath() },
      { id: 'word', group: 'Match', label: 'Whole words only', isOn: () => runnerOptOn('optWholeWord'), run: () => toggleSearchOptCheckbox('optWholeWord') },
      { id: 'case', group: 'Match', label: 'Match case', isOn: () => runnerOptOn('optCase'), run: () => toggleSearchOptCheckbox('optCase') },
      { id: 'word-starts', group: 'Match', label: 'Word starts only (one word: type ^word)', isOn: () => runnerWordStartsOnly(), run: () => runnerToggleWordStarts() },
      { id: 'accents', group: 'Match', label: 'Accents must match', isOn: () => runnerOptOn('optDiacritics'), run: () => toggleSearchOptCheckbox('optDiacritics') },
      { id: 'recent-all', group: 'Modified', label: 'Modified: any time', isOn: () => recencyFilterMode() === 'all', run: () => runnerSetRecency('all') },
      { id: 'recent-1h', group: 'Modified', label: 'Modified in the last hour', isOn: () => recencyFilterMode() === '1h', run: () => runnerSetRecency('1h') },
      { id: 'recent-1d', group: 'Modified', label: 'Modified in the last day', isOn: () => recencyFilterMode() === '1d', run: () => runnerSetRecency('1d') },
      { id: 'recent-1w', group: 'Modified', label: 'Modified in the last week', isOn: () => recencyFilterMode() === '1w', run: () => runnerSetRecency('1w') },
      { id: 'new-todo', group: 'TagFox', label: 'New TODO in this folder', run: () => runnerNewTodoHere() },
      { id: 'refresh', group: 'TagFox', label: 'Refresh (F5)', run: () => void refreshResultsFromUi() },
      { id: 'dark', group: 'TagFox', label: 'Dark or light mode', run: () => toggleDarkMode() },
      { id: 'settings', group: 'TagFox', label: 'Settings', run: () => toggleSettingsPanel() },
      { id: 'help', group: 'TagFox', label: 'Help (F1)', run: () => bootstrap.Modal.getOrCreateInstance(document.getElementById('helpModal')).show() },
      { id: 'quit', group: 'TagFox', label: 'Quit TagFox (its shortcut stops working until TagFox starts again)', run: () => void window.tagBrowser?.quitTagFox?.() },
    ];

    function runnerOptOn(id) {
      return !!document.getElementById(id)?.checked;
    }

    /* Saved searches (LS.favSearches): the folder, the text and every filter, run from a / command or
       Alt+1…9. The list is the one Classic saved, so its entries carry on. Of a Classic entry Runner uses
       the folder, text, wanted and not-wanted tags, AND or OR, Folders or Files only, recency and the match
       and Show options; it leaves out the view (smart, tree or flat), Subfolders (Runner decides that from
       the box), the column sort, the Advanced panel and the search scope ceiling. A search saved in Runner
       also carries Runner's own filters (`runnerFilters`), and a Classic entry gets each one's default. */
    const SAVED_SEARCHES_MAX = 30;
    function loadSavedSearches() {
      const arr = lsGetJson(LS.favSearches, []);
      return Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : [];
    }
    function storeSavedSearches(list) {
      lsSetJson(LS.favSearches, list.slice(0, SAVED_SEARCHES_MAX));
    }

    /** The part of a saved entry (Classic's or Runner's) that Runner applies, in one spelling. */
    function savedSearchCore(s) {
      const d = runnerDefaultSearchState();
      const lower = (x) => String(x).trim().toLowerCase();
      const tags = Array.isArray(s.activeTagKeys) ? s.activeTagKeys : s.activeTagKey ? [s.activeTagKey] : [];
      const want = [...new Set(tags.map(lower).filter(Boolean))].sort();
      const not = [...new Set((Array.isArray(s.excludedTagKeys) ? s.excludedTagKeys : []).map(lower))].filter((k) => want.includes(k)).sort();
      const opt = (k) => (typeof s[k] === 'boolean' ? s[k] : d[k]);
      return {
        query: s.query != null ? String(s.query) : '',
        rootFolder: s.rootFolder != null ? String(s.rootFolder) : '',
        activeTagKeys: want,
        excludedTagKeys: not,
        tagFilterCombineOr: !!s.tagFilterCombineOr,
        resultsContent: ['all', 'folders', 'files'].includes(s.resultsContent) ? s.resultsContent : s.hideFiles ? 'folders' : 'all',
        optCase: opt('optCase'),
        optWholeWord: opt('optWholeWord'),
        optPath: opt('optPath'),
        optDiacritics: opt('optDiacritics'),
        optHideSpecial: opt('optHideSpecial'),
        optHideTilde: opt('optHideTilde'),
        recencyFilter: ['all', '1h', '1d', '1w', '1m', '1y'].includes(s.recencyFilter) ? s.recencyFilter : 'all',
      };
    }

    /** Runner's own filters as they are now, and as a saved entry has them (each default when it has none). */
    function runnerFiltersNow() {
      return {
        sort: runnerSort,
        thisFolderOnly: localStorage.getItem(LS.runnerThisFolderOnly) === '1',
        starredOnly: localStorage.getItem(LS.runnerStarredOnly) === '1',
        wordStarts: runnerWordStartsOnly(),
        hideTemp: runnerHideTempOn(),
        deadline: activeDeadlineRange || '',
        showHiddenUntil: !!showHiddenUntil,
      };
    }
    function savedSearchFilters(s) {
      const f = s && s.runnerFilters && typeof s.runnerFilters === 'object' ? s.runnerFilters : {};
      return {
        sort: RUNNER_SORTS.includes(f.sort) ? f.sort : 'smart',
        thisFolderOnly: !!f.thisFolderOnly,
        starredOnly: !!f.starredOnly,
        wordStarts: !!f.wordStarts,
        hideTemp: !!f.hideTemp,
        deadline: DEADLINE_RANGE_IDS.includes(f.deadline) ? f.deadline : '',
        showHiddenUntil: !!f.showHiddenUntil,
      };
    }

    /** One key per distinct search, so the same search saved from Classic and from Runner compares equal. */
    function savedSearchKey(s) {
      const core = savedSearchCore(s);
      core.query = core.query.trim();
      core.rootFolder = core.rootFolder.trim() ? pathNormKey(normalizeFolderPathForEverything(core.rootFolder.trim())) : '';
      return JSON.stringify({ core, filters: savedSearchFilters(s) });
    }
    function currentSearchAsSaved() {
      const s = serializeSearchState();
      /* While the / list is open the box holds "text /filter"; the search on screen is the stashed text. */
      if (runnerCmdListIsOpen()) s.query = runnerCmdStash;
      return { ...s, runnerFilters: runnerFiltersNow() };
    }
    function savedSearchIndexOfCurrent() {
      const key = savedSearchKey(currentSearchAsSaved());
      return loadSavedSearches().findIndex((s) => savedSearchKey(s) === key);
    }

    /** Named after the text, or after the folder when there is no text; tags and the folder say which one it is. */
    function savedSearchName(s) {
      if (s.name && String(s.name).trim()) return String(s.name).trim();
      const core = savedSearchCore(s);
      const folder = core.rootFolder.trim();
      return core.query.trim() || (folder ? T.baseName(folder.replace(/[\\/]+$/, '')) || folder : 'Everything');
    }
    function savedSearchDetail(s) {
      const core = savedSearchCore(s);
      const folder = core.rootFolder.trim();
      const parts = [];
      if (core.query.trim() && folder) parts.push('in ' + (T.baseName(folder.replace(/[\\/]+$/, '')) || folder));
      const word = (k) => (T.isDateTag(k) ? k : k.toUpperCase());
      const wanted = core.activeTagKeys.filter((k) => !core.excludedTagKeys.includes(k)).map(word);
      const notWanted = core.excludedTagKeys.map((k) => 'not ' + word(k));
      if (wanted.length || notWanted.length) parts.push((wanted.length ? 'tagged ' : '') + [...wanted, ...notWanted].join(core.tagFilterCombineOr ? ' or ' : ' and '));
      if (core.recencyFilter !== 'all') parts.push('last ' + (RUNNER_RECENCY_WORDS[core.recencyFilter] || core.recencyFilter));
      return parts.join(', ');
    }

    function saveOrForgetCurrentSearch() {
      const list = loadSavedSearches();
      const idx = savedSearchIndexOfCurrent();
      if (idx >= 0) {
        const [gone] = list.splice(idx, 1);
        storeSavedSearches(list);
        setStatusMain('Forgot the saved search “' + savedSearchName(gone) + '”.');
        return;
      }
      if (list.length >= SAVED_SEARCHES_MAX) {
        setStatusMain('There are already ' + SAVED_SEARCHES_MAX + ' saved searches; forget one first.');
        return;
      }
      const entry = currentSearchAsSaved();
      const keep = savedSearchCore(entry);
      const saved = { ...keep, runnerFilters: entry.runnerFilters };
      saved.name = savedSearchName(saved);
      list.push(saved);
      storeSavedSearches(list);
      const n = list.length;
      setStatusMain('Saved as “' + saved.name + '”' + (n <= 9 ? ', Alt+' + n + ' runs it' : '') + '. Type / and its name to find it.');
    }

    /** Run saved search n (1-based): its folder, text and filters, then one search; it goes into Back and Forward. */
    async function runSavedSearch(n) {
      const s = loadSavedSearches()[n - 1];
      if (!s) {
        setStatusMain(n <= 9 ? 'No saved search ' + n + '. / then “Save this search” saves one.' : 'No such saved search.');
        return;
      }
      const f = savedSearchFilters(s);
      const flag = (key, on) => (on ? localStorage.setItem(key, '1') : localStorage.removeItem(key));
      runnerSort = f.sort;
      localStorage.setItem(LS.runnerSort, f.sort);
      flag(LS.runnerThisFolderOnly, f.thisFolderOnly);
      flag(LS.runnerStarredOnly, f.starredOnly);
      flag(LS.runnerWordStarts, f.wordStarts);
      flag(LS.runnerHideTemp, f.hideTemp);
      activeDeadlineRange = f.deadline;
      persistDeadlineFilter();
      showHiddenUntil = f.showHiddenUntil;
      flag(LS_SHOW_HIDDEN, showHiddenUntil);
      const st = searchStateWithoutCeiling({ ...runnerDefaultSearchState(), ...savedSearchCore(s) });
      const sc = runnerSortColumnFor(runnerSort);
      st.sortColumn = sc.col;
      st.sortAsc = sc.asc;
      applySearchState(st);
      selectAfterSearchKey = null;
      updateQueryPlaceholder();
      persistActiveTagFilter();
      saveSettings();
      syncSortPathClass();
      renderScopeBreadcrumb();
      renderRunnerScopeChip();
      await runSearchNow();
      commitSearchHistoryNow();
      setStatusMain('Saved search “' + savedSearchName(s) + '”.');
    }

    /** The / list and the options panel: RUNNER_COMMANDS, then the saved searches. Built on each call, so the
        save command reads Forget while the search on screen is a saved one. */
    function runnerCommands() {
      const saved = loadSavedSearches();
      const current = savedSearchIndexOfCurrent();
      return [
        ...RUNNER_COMMANDS,
        {
          id: 'save-search',
          group: 'Saved searches',
          label: current >= 0 ? 'Forget this saved search' : 'Save this search (folder, text and filters)',
          run: () => saveOrForgetCurrentSearch(),
        },
        ...saved.map((s, i) => {
          const detail = savedSearchDetail(s);
          return {
            id: 'saved-search-' + (i + 1),
            group: 'Saved searches',
            label: 'Saved search: ' + savedSearchName(s) + (detail ? ' (' + detail + ')' : '') + (i < 9 ? ' · Alt+' + (i + 1) : ''),
            isOn: () => i === current,
            run: () => void runSavedSearch(i + 1),
          };
        }),
      ];
    }

    const RUNNER_RECENCY_WORDS = { '1h': 'hour', '1d': 'day', '1w': 'week', '1m': 'month', '1y': 'year' };

    /** Every setting that differs from Runner's default shows as a chip under the box, and its x puts the
        default back, so a filter switched on by a key or a / command never hides rows without saying so. */
    const RUNNER_FILTER_CHIPS = [
      /* narrows: false for a chip that cannot be why a list is empty (runnerEmptyNoteText). */
      {
        id: 'sort',
        icon: 'fa-arrow-down-wide-short',
        narrows: false,
        on: () => runnerSort !== 'smart',
        label: () =>
          ({ date: 'Sorted by date', name: 'Sorted by name', size: 'Largest first', 'size-asc': 'Smallest first' })[runnerSort],
        reset: () => setRunnerSort('smart'),
      },
      {
        id: 'recency',
        icon: 'fa-clock',
        on: () => recencyFilterMode() !== 'all',
        label: () => 'Modified in the last ' + (RUNNER_RECENCY_WORDS[recencyFilterMode()] || recencyFilterMode()),
        reset: () => runnerSetRecency('all'),
      },
      {
        id: 'content',
        icon: 'fa-filter',
        on: () => isFoldersOnly() || isFilesOnly(),
        label: () => (isFoldersOnly() ? 'Folders only' : 'Files only'),
        reset: () => runnerSetContent('all'),
      },
      {
        id: 'path',
        icon: 'fa-route',
        on: () => !runnerOptOn('optPath'),
        label: () => 'Names only, path not searched',
        reset: () => runnerToggleMatchPath(),
      },
      {
        id: 'system',
        icon: 'fa-eye',
        narrows: false,
        on: () => !isHideSpecialPaths(),
        label: () => 'Showing system files',
        reset: () => runnerToggleSystemFiles(),
      },
      {
        id: 'tilde',
        icon: 'fa-eye-slash',
        on: () => isHideTildePaths(),
        label: () => 'Hiding ~ paths',
        reset: () => runnerToggleTilde(),
      },
      {
        id: 'temp',
        icon: 'fa-eye-slash',
        on: () => runnerHideTempOn(),
        label: () => 'Hiding temp files',
        reset: () => runnerToggleTemp(),
      },
      { id: 'word', icon: 'fa-spell-check', on: () => runnerOptOn('optWholeWord'), label: () => 'Whole words only', reset: () => toggleSearchOptCheckbox('optWholeWord') },
      { id: 'case', icon: 'fa-font', on: () => runnerOptOn('optCase'), label: () => 'Match case', reset: () => toggleSearchOptCheckbox('optCase') },
      { id: 'word-starts', icon: 'fa-i-cursor', on: () => runnerWordStartsOnly(), label: () => 'Word starts only', reset: () => runnerToggleWordStarts() },
      { id: 'this-folder', icon: 'fa-folder', on: () => runnerThisFolderOnlyOn(), label: () => 'This folder only', reset: () => runnerToggleThisFolderOnly() },
      { id: 'accents', icon: 'fa-language', on: () => runnerOptOn('optDiacritics'), label: () => 'Accents must match', reset: () => toggleSearchOptCheckbox('optDiacritics') },
      {
        id: 'tags',
        icon: 'fa-tags',
        on: () => activeTagKeys.size > 0 || excludedTagKeys.size > 0,
        /* Wanted tags first, so it reads "Tagged TODO and not CLAUDE", or "Not tagged CLAUDE" alone. */
        label: () => {
          const word = (k) => (T.isDateTag(k) ? k : k.toUpperCase());
          const keys = [...activeTagKeys];
          const s = [
            ...keys.filter((k) => !excludedTagKeys.has(k)).map(word),
            ...keys.filter((k) => excludedTagKeys.has(k)).map((k) => 'not ' + word(k)),
          ].join(tagFilterCombineOr ? ' or ' : ' and ');
          return s.startsWith('not ') ? 'Not tagged ' + s.slice(4) : 'Tagged ' + s;
        },
        reset: () => {
          activeTagKeys.clear();
          excludedTagKeys.clear();
          persistActiveTagFilter();
          saveSettings();
          void runSearchNow('identity');
        },
      },
      {
        id: 'starred',
        icon: 'fa-star',
        on: () => runnerStarredOnlyOn(),
        label: () => 'Starred only',
        reset: () => runnerToggleStarredOnly(),
      },
      /* Set by the / due commands, and kept across layouts with Classic's deadline panel. */
      {
        id: 'deadline',
        icon: 'fa-calendar-day',
        on: () => deadlineFilterActive(),
        label: () => ({ overdue: 'Overdue', today: 'Due today', thisweek: 'Due this week', nextweek: 'Due next week' })[activeDeadlineRange],
        reset: () => setDeadlineRange(''),
      },
      {
        id: 'hidden-until',
        icon: 'fa-eye',
        narrows: false,
        on: () => showHiddenUntil,
        label: () => 'Showing files hidden until a later date',
        reset: () => setShowHiddenUntil(false),
      },
    ];

    function runnerActiveFilterChips() {
      return isRunnerMode() ? RUNNER_FILTER_CHIPS.filter((c) => c.on()) : [];
    }

    /** What an empty list was looking for: the folder, the text, every chip that narrowed it, and inside a
        folder that Enter searches everywhere instead (runnerEnter). */
    function runnerEmptyNoteText() {
      const q = document.getElementById('query').value.trim();
      const folder = currentScopeFolderPath();
      const name = folder ? T.baseName(folder) || folder : '';
      let head = 'Nothing matches';
      if (folder && q) head = 'Nothing ' + (runnerThisFolderOnlyOn() ? 'in ' : 'below ') + name + ' matches ‘' + q + '’';
      else if (folder) head = 'Nothing in ' + name;
      else if (q) head = 'Nothing matches ‘' + q + '’';
      const parts = [head];
      const chips = runnerActiveFilterChips().filter((c) => c.narrows !== false).map((c) => c.label());
      if (chips.length) parts.push((chips.length === 1 ? 'Filter on: ' : 'Filters on: ') + chips.join(', '));
      if (folder) parts.push('Enter: search everywhere');
      return parts.join(' · ');
    }

    /** An empty list says why, in one muted line where the rows would be. It shows only once the searches
        have settled, so it never flashes up while a word is typed or between a list's early paint and its
        merged list; rows arriving hide it at once. */
    let runnerEmptyNoteTimer = null;
    function renderRunnerEmptyNote() {
      const el = document.getElementById('runnerEmptyNote');
      if (!el) return;
      clearTimeout(runnerEmptyNoteTimer);
      if (!isRunnerMode() || listRowsForUi().length) {
        el.classList.add('d-none');
        return;
      }
      const show = () => {
        if (searchInFlight || searchDebounceTimer) {
          runnerEmptyNoteTimer = setTimeout(show, 150);
          return;
        }
        if (!isRunnerMode() || listRowsForUi().length) return;
        el.textContent = runnerEmptyNoteText();
        el.classList.remove('d-none');
      };
      show();
    }

    /** Enter in the box with an empty list inside a folder: search everywhere for the same text. */
    async function runnerSearchEverywhereWhenEmpty() {
      if (searchDebounceTimer) await runSearchNow();
      else if (searchInFlight) await searchMutex;
      if (listRowsForUi().length || !currentScopeFolderPath()) return false;
      clearSearchScope();
      return true;
    }

    function renderRunnerFilterChips() {
      const wrap = document.getElementById('runnerFilterChips');
      const btn = document.getElementById('btnRunnerOpts');
      if (!wrap) return;
      const chips = runnerActiveFilterChips();
      btn?.classList.toggle('tagfox-runner-opts-btn--changed', chips.length > 0);
      wrap.textContent = '';
      wrap.classList.toggle('d-none', !chips.length);
      for (const c of chips) {
        const chip = document.createElement('span');
        chip.className = 'tagfox-runner-filter-chip';
        chip.dataset.filterId = c.id;
        const ic = document.createElement('i');
        ic.className = 'fa-solid ' + c.icon;
        ic.setAttribute('aria-hidden', 'true');
        const lbl = document.createElement('span');
        lbl.textContent = c.label();
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'tagfox-runner-filter-chip-x';
        x.title = 'Back to the default';
        x.setAttribute('aria-label', 'Remove filter: ' + c.label());
        x.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          c.reset();
          focusQueryBox(false);
        });
        chip.append(ic, lbl, x);
        wrap.appendChild(chip);
      }
      if (chips.length > 1) {
        const all = document.createElement('button');
        all.type = 'button';
        all.className = 'tagfox-runner-filter-reset';
        all.textContent = 'Reset all';
        all.addEventListener('click', () => {
          runnerResetAllFilters();
          focusQueryBox(false);
        });
        wrap.appendChild(all);
      }
    }

    /** Every chip's default at once, with one search. `recency` is the window to leave set ('all' by default). */
    function runnerResetAllFilters({ recency = 'all' } = {}) {
      runnerSort = 'smart';
      localStorage.setItem(LS.runnerSort, 'smart');
      const sc = runnerSortColumnFor('smart');
      sortColumn = sc.col;
      sortAsc = sc.asc;
      selectAfterSearchKey = null;
      setRecencyFilterMode(recency);
      applyResultsViewRadiosToDom(isShowSubfolders(), 'all');
      syncViewRadioActiveFromDom();
      const d = runnerDefaultSearchState();
      for (const [id, key] of [
        ['optPath', 'optPath'],
        ['optHideSpecial', 'optHideSpecial'],
        ['optHideTilde', 'optHideTilde'],
        ['optWholeWord', 'optWholeWord'],
        ['optCase', 'optCase'],
        ['optDiacritics', 'optDiacritics'],
      ])
        runnerSetOpt(id, d[key]);
      localStorage.removeItem(LS.runnerHideTemp);
      localStorage.removeItem(LS.runnerWordStarts);
      localStorage.removeItem(LS.runnerStarredOnly);
      localStorage.removeItem(LS.runnerThisFolderOnly);
      activeTagKeys.clear();
      excludedTagKeys.clear();
      persistActiveTagFilter();
      activeDeadlineRange = '';
      persistDeadlineFilter();
      showHiddenUntil = false;
      localStorage.removeItem(LS_SHOW_HIDDEN);
      saveSettings();
      void runSearchNow('identity');
    }

    function runnerCmdButton(cmd, active) {
      const b = document.createElement('button');
      b.type = 'button';
      const on = cmd.isOn ? cmd.isOn() : false;
      b.className = 'tagfox-runner-cmd' + (active ? ' tagfox-runner-cmd--active' : '') + (on ? ' tagfox-runner-cmd--on' : '');
      b.dataset.cmdId = cmd.id;
      b.setAttribute('role', 'option');
      b.innerHTML =
        '<span class="tagfox-runner-cmd-state">' + (on ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : '') + '</span>';
      const lbl = document.createElement('span');
      lbl.textContent = cmd.label;
      b.appendChild(lbl);
      return b;
    }

    /** The options panel's items: every command but the excludes, which there are a right-click on the tag's button. */
    function runnerPanelCommands() {
      return runnerCommands().filter((cmd) => !cmd.notTag);
    }

    let runnerOptsPanelOpen = false;
    /** The keyboard's place in the options panel (an index into runnerPanelCommands()); -1 when opened by mouse. */
    let runnerOptsActive = -1;
    function setRunnerOptsPanelOpen(open, active) {
      runnerOptsPanelOpen = !!open;
      if (!runnerOptsPanelOpen) runnerOptsActive = -1;
      else if (active != null) runnerOptsActive = active;
      const panel = document.getElementById('runnerOptsPanel');
      const btn = document.getElementById('btnRunnerOpts');
      if (!panel || !btn) return;
      btn.setAttribute('aria-expanded', runnerOptsPanelOpen ? 'true' : 'false');
      if (!runnerOptsPanelOpen) {
        panel.setAttribute('hidden', '');
        return;
      }
      panel.textContent = '';
      let group = '';
      let tagRow = null;
      runnerPanelCommands().forEach((cmd, i) => {
        if (cmd.group !== group) {
          group = cmd.group;
          tagRow = null;
          const h = document.createElement('div');
          h.className = 'tagfox-runner-cmd-group';
          h.textContent = group;
          panel.appendChild(h);
        }
        const b = runnerCmdButton(cmd, i === runnerOptsActive);
        if (!cmd.tag) {
          panel.appendChild(b);
          return;
        }
        if (!tagRow) {
          tagRow = document.createElement('div');
          tagRow.className = 'tagfox-runner-cmd-tags';
          panel.appendChild(tagRow);
        }
        const not = excludedTagKeys.has(cmd.tag.toLowerCase());
        b.classList.add('tagfox-runner-cmd--tag');
        b.classList.toggle('tagfox-runner-cmd--not', not);
        b.lastChild.textContent = (not ? '¬' : '') + cmd.tag; // ¬ marks a not-tag filter
        b.title = cmd.label + '. Right-click: not tagged ' + cmd.tag + '. The same click again clears it.';
        tagRow.appendChild(b);
      });
      panel.removeAttribute('hidden');
      panel.querySelector('.tagfox-runner-cmd--active')?.scrollIntoView({ block: 'nearest' });
    }

    /** The / list: the box keeps its search text, then " /" and the filter; the search text alone comes
        back on close. The search does not re-run while the list is open. */
    let runnerCmdStash = null;
    let runnerCmdPrefix = '/';
    let runnerCmdActive = 0;
    let runnerCmdMatches = [];
    function runnerCmdListIsOpen() {
      return runnerCmdStash !== null;
    }
    function openRunnerCmdList(stash) {
      const q = document.getElementById('query');
      runnerCmdStash = String(stash || '');
      const term = runnerCmdStash.replace(/\s+$/, '');
      runnerCmdPrefix = term ? term + ' /' : '/';
      q.value = runnerCmdPrefix;
      q.setSelectionRange(q.value.length, q.value.length);
      syncQueryGhostUi();
      runnerCmdActive = 0;
      renderRunnerCmdList();
    }
    function closeRunnerCmdList(restore) {
      if (runnerCmdStash === null) return;
      const q = document.getElementById('query');
      if (restore && q) {
        q.value = runnerCmdStash;
        syncQueryGhostUi();
      }
      runnerCmdStash = null;
      document.getElementById('runnerCmdList')?.classList.add('d-none');
    }
    function renderRunnerCmdList() {
      const el = document.getElementById('runnerCmdList');
      const q = document.getElementById('query');
      if (!el || !q) return;
      const v = String(q.value || '');
      const filter = v.startsWith(runnerCmdPrefix) ? v.slice(runnerCmdPrefix.length).trim() : '';
      runnerCmdMatches = runnerCommands()
        .map((cmd, i) => ({ cmd, i, s: filter ? fuzzyPathScore(filter, cmd.label) : 0 }))
        .filter((m) => m.s !== null)
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((m) => m.cmd);
      if (runnerCmdActive >= runnerCmdMatches.length) runnerCmdActive = Math.max(0, runnerCmdMatches.length - 1);
      el.textContent = '';
      runnerCmdMatches.forEach((cmd, i) => {
        const b = runnerCmdButton(cmd, i === runnerCmdActive);
        b.dataset.idx = String(i);
        el.appendChild(b);
      });
      if (!runnerCmdMatches.length) {
        const none = document.createElement('div');
        none.className = 'px-3 py-1 text-muted small';
        none.textContent = 'No command matches.';
        el.appendChild(none);
      }
      el.classList.remove('d-none');
      el.querySelector('.tagfox-runner-cmd--active')?.scrollIntoView({ block: 'nearest' });
    }
    function runRunnerCommand(cmd) {
      closeRunnerCmdList(true);
      if (cmd && typeof cmd.run === 'function') cmd.run();
      if (runnerOptsPanelOpen) setRunnerOptsPanelOpen(true);
    }

    /** #query input while the list is open: filter it, and never search for the "/" text. */
    function runnerCmdOnInput() {
      if (!runnerCmdListIsOpen()) return false;
      const q = document.getElementById('query');
      if (!String(q.value || '').startsWith(runnerCmdPrefix)) {
        closeRunnerCmdList(true);
        return true;
      }
      runnerCmdActive = 0;
      renderRunnerCmdList();
      return true;
    }

    /** Rows a page key moves by: what fits in the list, less one so the last row stays in view. */
    function runnerPageRows() {
      const sc = document.getElementById('resultsScroll');
      const tr = document.querySelector('#resultsTable tbody tr');
      const h = (tr && tr.getBoundingClientRect().height) || 28;
      return Math.max(1, Math.floor((sc ? sc.clientHeight : 300) / h) - 1);
    }

    /** The rows Ctrl+1…9 open: the first nine on screen. */
    function runnerNumberedRows() {
      const sc = document.getElementById('resultsScroll');
      const trs = [...document.querySelectorAll('#resultsTable tbody tr[data-row-path]')];
      if (!sc || !trs.length) return [];
      const top = sc.getBoundingClientRect().top;
      const first = trs.findIndex((tr) => tr.getBoundingClientRect().bottom > top + 4);
      return first < 0 ? [] : trs.slice(first, first + 9);
    }

    /** Holding Ctrl on its own for a moment numbers those rows. */
    let runnerCtrlHintTimer = null;
    function runnerShowCtrlHints(on) {
      if (runnerCtrlHintTimer) clearTimeout(runnerCtrlHintTimer);
      runnerCtrlHintTimer = null;
      if (!on && !document.body.classList.contains('tagfox-runner-ctrl-hints')) return;
      document.querySelectorAll('#resultsTable tbody tr[data-runner-n]').forEach((tr) => tr.removeAttribute('data-runner-n'));
      document.body.classList.toggle('tagfox-runner-ctrl-hints', !!on);
      if (on) runnerNumberedRows().forEach((tr, i) => tr.setAttribute('data-runner-n', String(i + 1)));
    }

    /** Enter and its variants. A row on screen must belong to what is typed, or Enter straight after typing
        (inside the search's 300ms wait) opens a row from the previous search; so a stale list re-runs first. */
    async function runnerActivateSelection(how = 'open') {
      if (searchDebounceTimer) await runSearchNow();
      else if (runnerListKey() !== selectAfterSearchKey) {
        /* The list on screen may be a search's early paint: wait for that search's merged list, not another search. */
        if (searchInFlight) await searchMutex;
        if (runnerListKey() !== selectAfterSearchKey) await runSearchNow();
      }
      if (!selectedFullPath) return;
      const k = pathNormKey(selectedFullPath);
      if (!listRowsForUi().some((r) => pathNormKey(fullPathForRow(r)) === k)) return;
      if (how === 'reveal') {
        await window.tagBrowser.showInFolder(selectedFullPath);
        setStatusMain('Shown in File Explorer: ' + selectedFullPath);
        return;
      }
      if (how === 'folder') {
        await runnerNavigate(() => keyboardScopeParentOfSelection(), selectedFullPath);
        return;
      }
      if (how === 'properties') {
        const r = await window.tagBrowser.showProperties(selectedFullPath);
        if (r && !r.ok) setStatusMain('Properties: ' + (r.error || 'failed'));
        return;
      }
      await keyboardActivateSelection();
    }

    function runnerOpenNumberedRow(n) {
      const tr = runnerNumberedRows()[n - 1];
      if (!tr) return;
      const k = pathNormKey(tr.dataset.rowPath);
      const row = listRowsForUi().find((r) => pathNormKey(fullPathForRow(r)) === k);
      if (!row) return;
      resultsExclusiveSelectRow(row, fullPathForRow(row));
      void keyboardActivateSelection();
    }

    /** Esc, one step a press: the multi-selection, the text, the folder, then TagFox hides. Menus, dialogs,
        Settings and the full-screen Viewer close themselves first, so those are left to Classic's handler. */
    let runnerEscapeLastStep = '';
    function runnerEscape() {
      if (document.querySelector('.dropdown-menu.show, .offcanvas.show') || isPropsTheaterOn() || breadcrumbSubfolderFlyoutsAreOpen()) return false;
      const pop = document.getElementById('quickTodoPop');
      if (pop && !pop.classList.contains('d-none')) return false;
      if (checkedPathsMap.size > 1) {
        const row = selectedFullPath ? selectedRowForActions() : null;
        clearResultsCheckedSelection();
        if (row) resultsExclusiveSelectRow(row, fullPathForRow(row));
        runnerEscapeLastStep = 'checks';
        return true;
      }
      if (document.getElementById('query').value) {
        clearSearchQuery();
        runnerEscapeLastStep = 'text';
        return true;
      }
      if (document.getElementById('rootFolder').value.trim()) {
        clearSearchScope();
        runnerEscapeLastStep = 'folder';
        return true;
      }
      runnerEscapeLastStep = 'hide';
      void window.tagBrowser?.hideMainWindow?.();
      return true;
    }

    /** The Viewer on or off (Alt+P, Everything's own preview-pane key); remembered. */
    function runnerViewerOff() {
      return localStorage.getItem(LS.runnerViewerOff) === '1';
    }
    function applyRunnerViewerOff() {
      const off = runnerViewerOff();
      document.body.classList.toggle('tagfox-runner-viewer-off', isRunnerMode() && off);
      const btn = document.getElementById('btnRunnerViewer');
      if (!btn) return;
      btn.setAttribute('aria-pressed', off ? 'false' : 'true');
      btn.title = off ? 'Show the Viewer (Alt+P)' : 'Hide the Viewer (Alt+P)';
      btn.classList.toggle('tagfox-runner-opts-btn--changed', off);
    }
    function runnerToggleViewer() {
      if (runnerViewerOff()) localStorage.removeItem(LS.runnerViewerOff);
      else localStorage.setItem(LS.runnerViewerOff, '1');
      applyRunnerViewerOff();
      setStatusMain(runnerViewerOff() ? 'Viewer hidden (Alt+P shows it).' : 'Viewer shown.');
    }

    /** Alt+Home: no text, no folder, every filter at its default. */
    function runnerStartAgain() {
      clearSearchQueryInputOnly();
      document.getElementById('rootFolder').value = '';
      renderScopeBreadcrumb();
      renderRunnerScopeChip();
      runnerResetAllFilters();
    }

    /** Tab and Shift+Tab: between the box and the list, as in Everything. */
    function runnerSwitchBoxAndList(inBox) {
      if (!inBox) {
        focusQueryBox(false);
        return;
      }
      const wrap = document.getElementById('resultsWrap');
      if (!wrap || !enterResultsListKeepingSelection()) return;
      wrap.focus({ preventScroll: true });
    }

    /** Shift+F10 or the Menu key: the selected row's menu, at the row. */
    function runnerOpenRowMenu() {
      if (!selectedFullPath) return;
      const row = selectedRowForActions();
      const tr = document.querySelector('#resultsTable tbody tr.table-active');
      const r = tr ? tr.getBoundingClientRect() : { left: 40, bottom: 120 };
      void openResultsRowItemActionsMenu(selectedFullPath, r.left + 40, r.bottom, row);
    }

    /** Runner's keys, in the order the handler tries them. Help's key list is drawn from this table, so the
        two cannot drift apart. `when(c)` decides; `run(c)` acts, returning nothing to consume the key,
        'native' to leave it to the browser (and keep Classic out), or 'classic' to hand it to Classic's
        handler. An entry without `does` works but is not listed. */
    const RUNNER_KEYS = [
      /* Search */
      {
        group: 'Search',
        keys: ['/'],
        does: 'Commands: sort, filters, tags, match options, Settings. Type to filter them (/todo finds the TODO tag filter, /not todo leaves TODO out), ↑ ↓ or Tab to choose, Enter runs one, Esc closes the list',
        when: (c) => c.inBox && !c.mod && !c.alt && (c.key === '/' || c.code === 'NumpadDivide'),
        run: (c) => openRunnerCmdList(c.q.value),
      },
      { group: 'Search', keys: ['?'], does: 'This list of keys, with the search box empty', when: (c) => c.inBox && c.empty && c.key === '?', run: () => openRunnerKeysHelp() },
      {
        group: 'Search',
        keys: ['Alt+O'],
        does: 'Options: sort, filters, tags, match options. ↑ ↓ or Tab to choose, Enter switches one (right-click a tag: not tagged), Esc or Alt+O closes',
        when: (c) => c.alt && !c.mod && !c.shift && c.k === 'o',
        run: () => setRunnerOptsPanelOpen(!runnerOptsPanelOpen, 0),
      },
      {
        group: 'Search',
        keys: ['F3', 'Ctrl+F', 'Alt+D'],
        does: 'Back to the search box, with its text selected',
        when: (c) => (c.plain && c.key === 'F3') || c.ctrl('f') || (c.alt && !c.mod && !c.shift && c.k === 'd'),
        run: () => focusQueryBox(true),
      },
      { group: 'Search', keys: ['Ctrl+B'], does: 'Whole words only, on or off', when: (c) => c.ctrl('b'), run: () => toggleSearchOptCheckbox('optWholeWord') },
      { group: 'Search', keys: ['Ctrl+I'], does: 'Match case, on or off', when: (c) => c.ctrl('i'), run: () => toggleSearchOptCheckbox('optCase') },
      { group: 'Search', keys: ['Ctrl+U', 'Ctrl+P'], does: 'Match path, on or off (off: names only)', when: (c) => c.ctrl('u') || c.ctrl('p'), run: () => runnerToggleMatchPath() },
      { group: 'Search', keys: ['Ctrl+R'], does: 'Modified within the last hour, day, week, month, year or any time, in turn', when: (c) => c.ctrl('r'), run: () => 'classic' },
      { group: 'Search', keys: ['Ctrl+M'], does: 'Sort by date; again for the smart order', when: (c) => c.ctrl('m'), run: () => setRunnerSort(runnerSort === 'date' ? 'smart' : 'date') },
      { group: 'Search', keys: ['Ctrl+N'], does: 'Sort by name; again for the smart order', when: (c) => c.ctrl('n'), run: () => setRunnerSort(runnerSort === 'name' ? 'smart' : 'name') },
      { group: 'Search', keys: ['Alt+Home'], does: 'Start again: no text, no folder, every filter at its default', when: (c) => c.alt && !c.mod && c.key === 'Home', run: () => runnerStartAgain() },
      { group: 'Search', keys: ['Alt+←', 'Alt+→'], does: 'Back and forward through earlier searches', when: (c) => c.alt && !c.mod && (c.key === 'ArrowLeft' || c.key === 'ArrowRight'), run: () => 'classic' },
      { group: 'Search', keys: ['Alt+1…9'], does: 'Saved search 1 to 9: its folder, text and filters. / then “Save this search” saves the one on screen', when: (c) => c.alt && !c.mod && !c.shift && /^Digit[1-9]$/.test(c.code), run: (c) => void runSavedSearch(Number(c.code.slice(5))) },
      { group: 'Search', keys: ['F5'], does: 'Search again', when: (c) => c.plain && c.key === 'F5', run: () => 'classic' },

      /* Move */
      {
        group: 'Move and select',
        keys: ['↑', '↓'],
        does: 'Move the selection, from the search box or the list. From the search box they leave the caret at the end of the text, so typing adds to it',
        when: (c) => c.inBox && c.plain && !c.shift && (c.key === 'ArrowDown' || c.key === 'ArrowUp'),
        run: (c) => {
          if (c.textSel) c.q.setSelectionRange(c.q.value.length, c.q.value.length);
          moveResultsSelection(c.key === 'ArrowDown' ? 1 : -1);
        },
      },
      {
        group: 'Move and select',
        keys: ['Shift+↑', 'Shift+↓'],
        does: 'Check a run of rows; their checkboxes appear',
        when: (c) => c.inBox && c.plain && c.shift && (c.key === 'ArrowDown' || c.key === 'ArrowUp'),
        run: (c) => moveResultsSelectionWithShift(c.key === 'ArrowDown' ? 1 : -1),
      },
      {
        group: 'Move and select',
        keys: ['PgUp', 'PgDn'],
        does: 'Move a page; with Shift, check the rows on the way',
        when: (c) => c.plain && (c.key === 'PageDown' || c.key === 'PageUp'),
        run: (c) => {
          const d = (c.key === 'PageDown' ? 1 : -1) * runnerPageRows();
          if (c.shift) moveResultsSelectionWithShift(d);
          else moveResultsSelection(d);
        },
      },
      {
        group: 'Move and select',
        keys: ['Ctrl+Home', 'Ctrl+End', 'Home', 'End'],
        does: 'First or last row (Home and End alone: outside the search box)',
        when: (c) => (c.key === 'Home' || c.key === 'End') && ((c.mod && !c.alt && !c.shift) || (c.plain && !c.inBox)),
        run: (c) => moveResultsSelectionToEdge(c.key === 'End'),
      },
      {
        group: 'Move and select',
        keys: ['Ctrl+1…9'],
        does: 'Open one of the first nine rows on screen; hold Ctrl to see their numbers',
        when: (c) => c.mod && !c.alt && !c.shift && /^[1-9]$/.test(c.key),
        run: (c) => runnerOpenNumberedRow(Number(c.key)),
      },
      {
        group: 'Move and select',
        keys: ['Tab', 'Shift+Tab'],
        does: "Between the search box and the list. Tab in the list steps along the selected row's buttons: Enter or Space presses one, Esc goes back to the list",
        when: (c) => c.plain && c.key === 'Tab' && (c.inBox || c.inList),
        run: (c) => runnerSwitchBoxAndList(c.inBox),
      },
      { group: 'Move and select', keys: ['Space'], does: 'In the list: check or uncheck the selected row', when: (c) => c.inList && c.plain && !c.shift && c.key === ' ', run: () => 'classic' },
      { group: 'Move and select', keys: ['Ctrl+A'], does: 'In the search box, select its text; in the list, check every row', when: (c) => c.ctrl('a'), run: (c) => (c.inBox ? 'native' : 'classic') },
      {
        group: 'Move and select',
        keys: ['Esc'],
        does: 'One step back a press: a list or menu, the checked rows, the text, the folder, then TagFox hides',
        when: (c) => c.plain && !c.shift && c.key === 'Escape',
        run: () => (runnerEscape() ? undefined : 'classic'),
      },

      /* Folders */
      {
        group: 'Folders',
        keys: ['→'],
        does: 'Into the selected folder (from the search box: with the caret at the end)',
        when: (c) => c.plain && !c.shift && c.key === 'ArrowRight' && (c.inBox ? c.caretEnd : c.inList),
        run: (c) => {
          if (!c.held) runnerEnterSelectedFolder();
        },
      },
      {
        group: 'Folders',
        keys: ['←'],
        does: 'Up to the parent folder, with the one you left selected (from the search box: with the caret at the start)',
        when: (c) => c.plain && !c.shift && c.key === 'ArrowLeft' && (!c.inBox || c.caretStart),
        run: (c) => {
          if (!c.held) runnerGoUp();
        },
      },
      {
        group: 'Folders',
        keys: ['Backspace'],
        does: 'With the search box empty: leave the folder and search everywhere',
        when: (c) => c.inBox && c.plain && c.key === 'Backspace' && c.empty && !c.e.repeat && !!currentScopeFolderPath(),
        run: () => clearSearchScope(),
      },
      { group: 'Folders', keys: ['Shift+Enter'], does: 'Go to the folder holding the selected row, here in TagFox', when: (c) => c.plain && c.shift && c.key === 'Enter', run: () => void runnerActivateSelection('folder') },
      { group: 'Folders', keys: ['Ctrl+Shift+1…9'], does: 'Starred item 1 to 9', when: (c) => c.mod && c.shift && !c.alt && /^Digit[1-9]$/.test(c.code), run: () => 'classic' },

      /* Open and act */
      { group: 'Open and act', keys: ['Enter'], does: 'Open the selected row; a folder opens here. With a path typed in the search box, go there; with nothing listed inside a folder, search everywhere', when: (c) => c.plain && !c.shift && c.key === 'Enter' && (c.inBox || c.inList), run: (c) => void runnerEnter(c) },
      { group: 'Open and act', keys: ['Ctrl+Enter'], does: 'Open its folder in File Explorer, with it selected', when: (c) => c.mod && !c.alt && !c.shift && c.key === 'Enter', run: () => void runnerActivateSelection('reveal') },
      { group: 'Open and act', keys: ['Alt+Enter'], does: 'Properties', when: (c) => c.alt && !c.mod && !c.shift && c.key === 'Enter', run: () => void runnerActivateSelection('properties') },
      /* Another app's Open or Save dialog, while the toggle shortcut has raised TagFox from one. `first`: these
         are tried before every other entry, so they win over the plain Enter, Ctrl+Enter and Esc above and below. */
      { group: "Another app's Open or Save dialog", first: true, keys: ['Enter'], does: 'With a dialog waiting (the toggle shortcut was pressed from it): send it the selected row. In an Open dialog a file opens and a folder is shown; a Save dialog gets the folder and keeps its file name, and you press Save', when: (c) => !!fileDialogTarget && c.plain && !c.shift && c.key === 'Enter' && (c.inBox || c.inList), run: (c) => void runnerEnter(c) },
      { group: "Another app's Open or Save dialog", first: true, keys: ['Ctrl+Enter'], does: 'With a dialog waiting: send it the folder TagFox is showing', when: (c) => !!fileDialogTarget && c.mod && !c.alt && !c.shift && c.key === 'Enter', run: () => sendScopeFolderToFileDialog() },
      { group: "Another app's Open or Save dialog", first: true, keys: ['Esc'], does: 'With a dialog waiting: stop sending to it, so Enter opens rows again', when: (c) => !!fileDialogTarget && c.plain && !c.shift && c.key === 'Escape', run: () => cancelFileDialogTarget() },
      { group: 'Open and act', keys: ['Alt+P'], does: 'Show or hide the Viewer', when: (c) => c.alt && !c.mod && !c.shift && c.k === 'p', run: () => runnerToggleViewer() },
      { group: 'Open and act', keys: ['Shift+Space'], does: 'The Viewer full screen', when: (c) => c.plain && c.shift && c.key === ' ', run: () => 'classic' },
      { group: 'Open and act', keys: ['Shift+F10', 'Menu'], does: "The selected row's menu", when: (c) => (c.plain && c.shift && c.key === 'F10') || c.key === 'ContextMenu', run: () => runnerOpenRowMenu() },
      { group: 'Open and act', keys: ['Ctrl+D'], does: 'Star or unstar the selected row', when: (c) => c.ctrl('d'), run: () => toggleStarForSelection() },
      { group: 'Open and act', keys: ['Ctrl+T'], does: 'Tags: add or remove them on the checked rows, or on the selected row', when: (c) => c.ctrl('t'), run: () => runnerEditTags() },
      { group: 'Open and act', keys: ['F2'], does: 'Rename', when: (c) => c.plain && !c.shift && c.key === 'F2', run: () => 'classic' },
      {
        group: 'Open and act',
        keys: ['Del', 'Shift+Del'],
        does: 'Move the checked rows to the Recycle Bin (from the search box: with it empty). TagFox never deletes for good, so Shift+Del recycles too',
        when: (c) => c.plain && c.key === 'Delete' && (c.inList || (c.inBox && c.empty)),
        run: (c) => {
          if (!c.e.repeat) void keyboardRecycleConfirm();
        },
      },
      {
        group: 'Open and act',
        keys: ['Ctrl+C', 'Ctrl+X'],
        does: 'Copy or cut the selected files, to paste in Explorer (in the search box: with no text selected)',
        when: (c) => c.ctrl('c') || c.ctrl('x'),
        run: (c) => {
          if (c.textSel) return 'native';
          if (c.k === 'c') void copyShortcutExplorerFiles();
          else void cutShortcutExplorerFiles();
        },
      },
      {
        group: 'Open and act',
        keys: ['Ctrl+Shift+C'],
        does: 'Copy their full paths as text',
        when: (c) => c.mod && c.shift && !c.alt && c.k === 'c',
        run: (c) => (c.textSel ? 'native' : void keyboardCopyFullPathsText()),
      },
      {
        group: 'Open and act',
        keys: ['Ctrl+V'],
        does: 'Paste copied files or a screenshot into the folder; copied text goes into the search box',
        when: (c) => c.ctrl('v'),
        run: () => void runnerPaste(),
      },
      { group: 'Open and act', keys: ['Ctrl+Shift+N'], does: 'New folder here', when: (c) => c.mod && c.shift && !c.alt && c.k === 'n', run: () => 'classic' },
      { group: 'Open and act', keys: ['Ctrl+H'], does: 'Rename the checked rows with wildcards', when: (c) => c.ctrl('h'), run: () => 'classic' },

      /* TagFox */
      { group: 'TagFox', keys: ['F1'], does: 'Help', when: (c) => c.plain && c.key === 'F1', run: () => 'classic' },
      { group: 'TagFox', keys: ['Ctrl+,'], does: 'Settings', when: (c) => c.ctrl(','), run: () => 'classic' },

      /* A Classic key for a part Runner does not show, answered. */
      {
        when: (c) => c.ctrl('s'),
        run: () => setStatusMain('In Runner an empty search box shows the folder itself and typing searches everything below it.'),
      },
    ];

    /** One key event, described once for every `when`. */
    function runnerKeyCtx(e) {
      const q = document.getElementById('query');
      const inBox = e.target === q;
      const len = q.value.length;
      const mod = e.ctrlKey || e.metaKey;
      const k = String(e.key || '').toLowerCase();
      const wrap = document.getElementById('resultsWrap');
      return {
        e,
        q,
        inBox,
        inList: !!wrap && !inBox && (e.target === wrap || wrap.contains(e.target)),
        key: e.key,
        code: e.code,
        k,
        mod,
        alt: e.altKey,
        shift: e.shiftKey,
        plain: !mod && !e.altKey,
        ctrl: (ch) => mod && !e.altKey && !e.shiftKey && k === ch,
        empty: q.value === '',
        caretEnd: inBox && q.selectionStart === len && q.selectionEnd === len,
        caretStart: inBox && q.selectionStart === 0 && q.selectionEnd === 0,
        textSel: inBox && q.selectionStart !== q.selectionEnd,
        /* A held key that started in the text: its repeats must not run on into folder changes. */
        held: e.repeat && inBox && len > 0,
      };
    }

    /** Runner's keys, ahead of Classic's in the window keydown handler. True: handled, Classic must not act. */
    function runnerHandleKeydown(e) {
      if (e.key === 'Control') {
        if (!e.repeat && !runnerCtrlHintTimer) runnerCtrlHintTimer = setTimeout(() => runnerShowCtrlHints(true), 450);
        return false;
      }
      runnerShowCtrlHints(false);
      if (document.querySelector('.modal.show')) return false;
      const c = runnerKeyCtx(e);
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
        return true;
      };
      if (runnerCmdListIsOpen()) {
        const n = runnerCmdMatches.length;
        const step = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) ? 1 : e.key === 'ArrowUp' || e.key === 'Tab' ? -1 : 0;
        if (step && !c.mod && !c.alt) {
          if (n) runnerCmdActive = (runnerCmdActive + step + n) % n;
          renderRunnerCmdList();
          return consume();
        }
        if (e.key === 'Enter') {
          runRunnerCommand(runnerCmdMatches[runnerCmdActive]);
          return consume();
        }
        if (e.key === 'Escape') {
          closeRunnerCmdList(true);
          return consume();
        }
        if (c.inBox) return true;
      }
      /* The options panel, open: its items take ↑ ↓ Tab and Enter, as the / list's do. Enter runs an item
         only once one is chosen, so a panel opened by mouse leaves Enter opening the selected row. */
      if (runnerOptsPanelOpen) {
        const items = runnerPanelCommands();
        const n = items.length;
        const step = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) ? 1 : e.key === 'ArrowUp' || e.key === 'Tab' ? -1 : 0;
        if (step && n && !c.mod && !c.alt) {
          setRunnerOptsPanelOpen(true, runnerOptsActive < 0 ? (step > 0 ? 0 : n - 1) : (runnerOptsActive + step + n) % n);
          return consume();
        }
        if (e.key === 'Enter' && c.plain && !c.shift && runnerOptsActive >= 0) {
          runRunnerCommand(items[runnerOptsActive]);
          return consume();
        }
        if (e.key === 'Escape') {
          setRunnerOptsPanelOpen(false);
          return consume();
        }
      }
      /* Another text field (the Viewer's editor, Settings) or an open menu keeps its own keys. */
      if (!c.inBox && (isTypingTarget(e.target) || isInMarkdownEditSurface(e.target))) return false;
      if (isMenuKeyboardNavTarget(e.target)) return false;
      const entry = RUNNER_KEYS.find((x) => x.first && x.when(c)) || RUNNER_KEYS.find((x) => x.when(c));
      if (entry) {
        const r = entry.run(c);
        if (r === 'classic') return false;
        if (r === 'native') return true;
        return consume();
      }
      if (c.inBox || !c.plain) return false;
      /* Typing with the focus anywhere but a text field goes into the box. */
      if (e.key === '/') {
        focusQueryBox(false);
        openRunnerCmdList(c.q.value);
        return consume();
      }
      if (e.key === 'Backspace') {
        focusQueryBox(false);
        if (c.q.value) {
          c.q.value = c.q.value.slice(0, -1);
          c.q.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (!e.repeat && currentScopeFolderPath()) clearSearchScope();
        return consume();
      }
      if (e.key.length === 1 && e.key !== ' ') {
        focusQueryBox(false);
        c.q.setRangeText(e.key, c.q.value.length, c.q.value.length, 'end');
        c.q.dispatchEvent(new Event('input', { bubbles: true }));
        return consume();
      }
      return false;
    }

    /** Help's Keys tab (id `runner`): the keys, drawn from RUNNER_KEYS. */
    function renderRunnerKeysHelp() {
      const host = document.getElementById('runnerKeysTable');
      if (!host) return;
      const kbd = (combo) =>
        combo
          .split(/\+(?=.)/)
          .map((p) => '<kbd>' + escapeHtmlForPreview(p) + '</kbd>')
          .join('+');
      const groups = new Map();
      for (const x of RUNNER_KEYS) {
        if (!x.does) continue;
        if (!groups.has(x.group)) groups.set(x.group, []);
        groups.get(x.group).push(x);
      }
      let html = '';
      for (const [g, list] of groups) {
        html +=
          '<h5 class="help-md-section-title">' +
          escapeHtmlForPreview(g) +
          '</h5><div class="table-responsive"><table class="table table-sm table-striped mb-2"><thead><tr><th scope="col" style="width:32%">Key</th><th scope="col">Does</th></tr></thead><tbody>';
        for (const x of list) html += '<tr><td>' + x.keys.map(kbd).join(' / ') + '</td><td>' + escapeHtmlForPreview(x.does) + '</td></tr>';
        html += '</tbody></table></div>';
      }
      host.innerHTML = html;
    }

    /** `?` in an empty box: Help on its Keys tab (`runner`), at the keys. */
    function openRunnerKeysHelp() {
      const hm = document.getElementById('helpModal');
      if (!hm) return;
      helpTabOnNextOpen = 'runner';
      hm.addEventListener('shown.bs.modal', () => document.getElementById('runnerKeysTable')?.scrollIntoView({ block: 'start' }), { once: true });
      bootstrap.Modal.getOrCreateInstance(hm).show();
    }

    /** Current folder as a chip at the start of the box; its x searches everywhere again. Classic's folder
        buttons (#tagfoxScopeBarRowActions) are placed in it by renderScopeBreadcrumb and survive this rebuild. */
    function renderRunnerScopeChip() {
      const chip = document.getElementById('runnerScopeChip');
      if (!chip) return;
      const scope = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim());
      const acts = chip.querySelector('#tagfoxScopeBarRowActions');
      for (const n of [...chip.childNodes]) if (n !== acts) n.remove();
      chip.classList.toggle('d-none', !scope);
      if (!scope) return;
      chip.title = scope + '\nLeft arrow: parent folder';
      chip.insertBefore(folderIconEl(), acts);
      const nm = document.createElement('span');
      nm.className = 'text-truncate';
      nm.textContent = segmentPretty(T.baseName(scope.replace(/[/\\]+$/, ''))) || scope;
      chip.insertBefore(nm, acts);
      const x = document.createElement('i');
      x.className = 'fa-solid fa-xmark tagfox-runner-scope-chip-x';
      x.title = 'Search everywhere';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSearchScope();
        focusQueryBox(false);
      });
      chip.appendChild(x);
    }

    function bindRunnerChromeOnce() {
      const btn = document.getElementById('btnRunnerOpts');
      if (!btn || btn.dataset.runnerBound === '1') return;
      btn.dataset.runnerBound = '1';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setRunnerOptsPanelOpen(!runnerOptsPanelOpen);
      });
      document.getElementById('btnRunnerViewer')?.addEventListener('click', () => runnerToggleViewer());
      document.getElementById('runnerOptsPanel')?.addEventListener('click', (e) => {
        const b = e.target.closest('.tagfox-runner-cmd');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        runRunnerCommand(runnerCommands().find((c) => c.id === b.dataset.cmdId));
      });
      /* Right-click on a tag's button: not tagged. */
      document.getElementById('runnerOptsPanel')?.addEventListener('contextmenu', (e) => {
        const b = e.target.closest('.tagfox-runner-cmd--tag');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        runRunnerCommand(runnerCommands().find((c) => c.id === 'not-' + b.dataset.cmdId.slice('tag-'.length)));
      });
      /* mousedown, so the box keeps focus and the item runs before anything closes the list */
      document.getElementById('runnerCmdList')?.addEventListener('mousedown', (e) => {
        const b = e.target.closest('.tagfox-runner-cmd');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        runRunnerCommand(runnerCmdMatches[Number(b.dataset.idx)]);
        focusQueryBox(false);
      });
      document.addEventListener('pointerdown', (e) => {
        runnerShowCtrlHints(false);
        if (runnerOptsPanelOpen && !e.target.closest('#runnerOptsPanel, #btnRunnerOpts')) setRunnerOptsPanelOpen(false);
        if (runnerCmdListIsOpen() && !e.target.closest('#runnerCmdList, #query')) closeRunnerCmdList(true);
      });
      window.addEventListener('keyup', (e) => {
        if (e.key === 'Control') runnerShowCtrlHints(false);
      });
      window.addEventListener('blur', () => runnerShowCtrlHints(false));
      /* The breadcrumb's room changes with the window, the Viewer's width and the row being shown at all. */
      const crumbs = document.getElementById('breadcrumbBar');
      if (crumbs && typeof ResizeObserver === 'function') new ResizeObserver(() => fitRunnerBreadcrumb()).observe(crumbs);
      window.addEventListener('focus', () => refreshRunnerWindowsRecent());
    }

    function scheduleSearch(eventKind = 'identity') {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchDebounceTimer = null;
        void runSearchNow(eventKind);
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

    /* True only for the duration of an auto-refresh tick's search. It buys two things the explicit
       routes (F5, the Refresh command, a disk mutation) must not have: renderTable may skip a rebuild
       that would paint the same rows again, and a rebuild that does happen keeps the scroll position.
       An explicit refresh is a thing Steve asked for, so it always repaints and always reports. */
    let quietAutoRefreshRender = false;

    /* A repaint under the pointer moves the row being aimed at, so the click lands on the wrong file.
       Skip the tick and let the next one have it: a few seconds later is invisible, a row that jumps
       mid-click is not. */
    function autoRefreshTickWouldDisturb() {
      if (document.body.classList.contains('tagfox-internal-path-drag')) return true;
      if (runnerCmdListIsOpen()) return true;
      if (document.querySelector('.tagfox-split-drag-shield')) return true;
      /* Tab has walked into a row's buttons, and a repaint would drop the focus out of them. */
      if (document.querySelector('#tbody tr.results-row-actions-kbd')) return true;
      /* A refresh re-runs the search, which comes back with the first page, so a tick after load-more
         would throw away the pages Steve asked for. Someone who has paged down is reading a long list,
         which is where a repaint costs most anyway. F5 still refreshes and still collapses the list,
         unchanged, because that one he asked for. The test is against pageSize, not zero: singleOffset
         starts at the first page's own row count, so `> 0` is true of every non-empty search and would
         silently stop the timer altogether. */
      const paging = resultsPagingCtx;
      if (paging && paging.mode === 'single' && paging.singleOffset > paging.pageSize) return true;
      const scroll = document.getElementById('resultsScroll');
      try {
        if (scroll && scroll.matches(':hover')) return true;
      } catch (_) {}
      return false;
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
      /* A keystroke's search is about to run; a tick now would queue ahead of it in Everything for nothing. */
      if (searchInFlight || searchDebounceTimer) return;
      if (autoRefreshTickWouldDisturb()) return;
      suppressViewerResyncForTimerSearch = true;
      quietAutoRefreshRender = true;
      try {
        await runSearchNow('refresh');
      } finally {
        suppressViewerResyncForTimerSearch = false;
        quietAutoRefreshRender = false;
      }
    }

    /* Everything pages its index out while nothing queries it. Measured 11 August 2026, after the user
       instance had been up two weeks: first query 9874ms, then 12ms, 51ms, 45ms, 42ms. That one cold
       query is the whole of "TagFox is frozen after I wake it up" — a filter click calls runSearchNow(),
       which queues on searchMutex behind it and shows nothing, so the list sits stale for ten seconds.
       A trivial query every few minutes keeps the pages resident, which costs nothing once warm. */
    const EVERYTHING_KEEPALIVE_MS = 3 * 60 * 1000;
    let everythingKeepaliveTimerId = null;

    async function everythingKeepalivePing() {
      if (searchInFlight) return;
      try {
        await everythingSearchOnce({ searchText: 'tagfox-keepalive-no-match', count: 1 });
      } catch (_) {}
    }

    function startEverythingKeepalive() {
      if (everythingKeepaliveTimerId) return;
      everythingKeepaliveTimerId = setInterval(() => void everythingKeepalivePing(), EVERYTHING_KEEPALIVE_MS);
      void everythingKeepalivePing();
    }

    /* One search flow at a time, so two F5 or auto-refresh ticks cannot interleave: every call waits on
       searchMutex. F5, auto-refresh and disk mutation all search the one results pane, so there is no
       background flow against a second pane, which is where the old dual-pane races and bleed lived. */
    async function runSearchNow(eventKind = 'identity', opts) {
      const myRequest = ++searchRequestSeq;
      let releaseMutex = null;
      const prev = searchMutex;
      searchMutex = new Promise((r) => {
        releaseMutex = r;
      });
      await prev;
      /* Runner: a newer search was asked for while this one waited its turn, so this one has nothing left
         to show. Everything answers one query at a time, so running it anyway put its four or five queries
         ahead of the newest keystroke's, and on a slow day typing four letters ran three stale searches in
         full first. It waits for the newest instead, so a caller that awaits it still resumes once the list
         for the current box is on screen. An auto-refresh tick starts only when nothing is in flight, so it
         never overtakes a typed search. */
      if (isRunnerMode() && myRequest !== searchRequestSeq) {
        runnerSearchCounters.stepAside++;
        releaseMutex();
        let tail;
        do {
          tail = searchMutex;
          await tail;
        } while (tail !== searchMutex);
        return;
      }
      activeSearchRequest = myRequest;
      if (isRunnerMode()) runnerSearchCounters.run++;
      searchFlowRunning = true;
      try {
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = null;
        }
        await runSearch(eventKind, opts);
      } finally {
        searchFlowRunning = false;
        releaseMutex();
      }
    }

    /** Pending delayed Everything re-query (index can lag behind disk after file ops). */
    let diskMutationRefreshTimeouts = [];
    /** Skip duplicate refresh when renderer + paths-mutated both fire within a few ms (same drop). */
    let lastDiskMutationRefreshStart = 0;
    const DISK_MUTATION_REFRESH_COALESCE_MS = 120;

    function clearAndScheduleSearchRetries(payload, opts) {
      for (const id of diskMutationRefreshTimeouts) clearTimeout(id);
      diskMutationRefreshTimeouts = [];
      /* 350ms catches most index updates (new items at dest appear fast); 1200ms is the slow-index backstop.
         A pure delete needs neither: tombstones already hid the rows, so one quiet pass clears them once
         Everything catches up, instead of two extra full repaints the user reads as flicker. */
      const delays = opts && opts.quietSingle ? [1000] : [350, 1200];
      for (const delayMs of delays) {
        diskMutationRefreshTimeouts.push(
          setTimeout(() => {
            void runSearchNow('refresh');
          }, delayMs)
        );
      }
    }

    /* A delete only removes rows, and removeGonePathsFromUiNow() already tombstoned + repainted them. No
       new content can appear, so the immediate re-query is pure churn. Moves/pastes (destFolder, copied,
       moved) bring in new rows and still need the prompt refresh. */
    function isPureTombstoneMutation(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      const trashed = !!(p.trashed && Array.isArray(p.paths) && p.paths.length);
      const bringsNewContent = !!(p.destFolder || (Array.isArray(p.copied) && p.copied.length) || (Array.isArray(p.moved) && p.moved.length));
      return trashed && !bringsNewContent;
    }

    /** After paste / move / trash: refresh now, then one scoped catch-up for Everything index lag. */
    async function refreshAfterDiskMutation(payload) {
      const now = Date.now();
      if (now - lastDiskMutationRefreshStart < DISK_MUTATION_REFRESH_COALESCE_MS) return;
      lastDiskMutationRefreshStart = now;
      folderChildCountCache.clear();
      await detachViewerEditorsIfOpenTargetsGone();
      void renderShelf();
      if (isPureTombstoneMutation(payload)) {
        /* Rows are already gone from the UI. Skip the immediate re-render;
           schedule a single quiet reconcile to retire the tombstones once the index settles. */
        clearAndScheduleSearchRetries(payload, { quietSingle: true });
        return;
      }
      clearAndScheduleSearchRetries(payload);
      void runSearchNow('refresh');
    }

    function tagModalIsFolderDocDraft() {
      return tagModalMode === 'folderDocDraft';
    }

    /** Folder doc title: chips edit a local list only until the folder doc is saved. */
    function tagModalIsNameDraft() {
      return tagModalIsFolderDocDraft();
    }

    function syncTagModalHintsAndTitle() {
      const renameEl = document.getElementById('tagModalHintRename');
      const folderDocEl = document.getElementById('tagModalHintFolderDoc');
      const lbl = document.getElementById('tagModalLabel');
      const isRename = !tagModalIsNameDraft();
      renameEl?.classList.toggle('d-none', !isRename);
      folderDocEl?.classList.toggle('d-none', !tagModalIsFolderDocDraft());
      if (tagModalIsFolderDocDraft()) {
        if (lbl) lbl.textContent = 'Tags for folder doc file';
      } else {
        if (lbl) lbl.textContent = 'Edit tags (rename)';
      }
    }

    /** Known tag labels, de-duped case-insensitively and sorted for draft tag pickers. */
    function collectKnownTagLabels() {
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
      return labels;
    }

    /** Re-fill tag-modal datalist + quick-add (≤12) from global known tags (not current search scope). */
    function refreshTagModalDatalist() {
      const dl = document.getElementById('tagModalExistingTags');
      const quick = document.getElementById('tagModalQuickTags');
      if (!dl || !quick) return;
      const labels = collectKnownTagLabels();
      dl.innerHTML = '';
      for (const text of labels) {
        const opt = document.createElement('option');
        opt.value = text;
        dl.appendChild(opt);
      }
      quick.innerHTML = '';
      const quickMax = 12;
      const onSingle = modalTargetPaths.length === 1 || tagModalIsNameDraft();
      for (const text of labels.slice(0, quickMax)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const low = text.toLowerCase();
        const already = onSingle && modalTags.some((t) => t.toLowerCase() === low);
        btn.className = already ? 'btn btn-sm btn-outline-secondary' : 'btn btn-sm btn-outline-primary';
        btn.textContent = text;
        btn.title = already
          ? tagModalIsNameDraft()
            ? 'Already in this list'
            : 'Already on this item'
          : 'Add tag ' + text;
        btn.disabled = !!already;
        btn.addEventListener('click', () => void applyModalAddTag(text));
        quick.appendChild(btn);
      }
    }

    /** Quick TODO tags button reflects whether the inline panel is open. */
    function syncQuickTodoTagsToggleButton() {
      const btn = document.getElementById('btnQuickTodoPopTags');
      const panel = document.getElementById('quickTodoTagsPanel');
      if (!btn || !panel) return;
      const open = !panel.classList.contains('d-none');
      btn.classList.toggle('btn-primary', open);
      btn.classList.toggle('btn-outline-secondary', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    /** Quick TODO body button reflects whether the inline panel is open. */
    function syncQuickTodoBodyToggleButton() {
      const btn = document.getElementById('btnQuickTodoPopBody');
      const panel = document.getElementById('quickTodoBodyPanel');
      if (!btn || !panel) return;
      const open = !panel.classList.contains('d-none');
      btn.classList.toggle('btn-primary', open);
      btn.classList.toggle('btn-outline-secondary', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    /** Quick TODO: remove one draft tag from the next file name. */
    function removeQuickTodoTagAt(idx) {
      if (idx < 0 || idx >= newTodoMdTags.length) return;
      newTodoMdTags.splice(idx, 1);
      renderQuickTodoTagsPanel();
    }

    /** Quick TODO: add one draft tag for the next file name. */
    function addQuickTodoTag(value) {
      const raw = String(value || '').trim();
      if (!raw) return;
      const low = raw.toLowerCase();
      // One date of each family, same rule as the tag modal: a second deadline replaces the first,
      // and a hide-until sits alongside it rather than displacing it.
      const addedKind = T.dateKind ? T.dateKind(raw) : '';
      if (addedKind) {
        for (let i = newTodoMdTags.length - 1; i >= 0; i--) {
          if (T.dateKind(newTodoMdTags[i]) === addedKind) newTodoMdTags.splice(i, 1);
        }
      }
      if (newTodoMdTags.some((t) => t.toLowerCase() === low)) return;
      newTodoMdTags.push(raw);
      rememberTag(low, raw);
      renderQuickTodoTagsPanel();
    }

    /** Quick TODO: rebuild the inline tag editor inside the popup. */
    function renderQuickTodoTagsPanel() {
      const chips = document.getElementById('quickTodoTagsChips');
      const quick = document.getElementById('quickTodoTagsQuick');
      const dl = document.getElementById('quickTodoExistingTags');
      if (!chips || !quick || !dl) return;
      chips.innerHTML = '';
      if (!newTodoMdTags.length) {
        const empty = document.createElement('span');
        empty.className = 'text-muted';
        empty.textContent = 'No tags yet.';
        chips.appendChild(empty);
      } else {
        newTodoMdTags.forEach((tag, idx) => {
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
          x.addEventListener('click', () => removeQuickTodoTagAt(idx));
          span.appendChild(x);
          chips.appendChild(span);
        });
      }
      const labels = collectKnownTagLabels();
      dl.innerHTML = '';
      for (const text of labels) {
        const opt = document.createElement('option');
        opt.value = text;
        dl.appendChild(opt);
      }
      quick.innerHTML = '';
      for (const text of labels.slice(0, 12)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const low = text.toLowerCase();
        const already = newTodoMdTags.some((t) => t.toLowerCase() === low);
        btn.className = already ? 'btn btn-sm btn-outline-secondary' : 'btn btn-sm btn-outline-primary';
        btn.textContent = text;
        btn.disabled = already;
        btn.title = already ? 'Already in this list' : 'Add tag ' + text;
        btn.addEventListener('click', () => addQuickTodoTag(text));
        quick.appendChild(btn);
      }
      syncQuickTodoTagsToggleButton();
    }

    /** Quick TODO: close the inline tags panel. */
    function hideQuickTodoTagsPanel() {
      const panel = document.getElementById('quickTodoTagsPanel');
      if (!panel) return;
      panel.classList.add('d-none');
      syncQuickTodoTagsToggleButton();
    }

    /** Quick TODO: toggle the inline tags panel inside the popup. */
    function toggleQuickTodoTagsPanel(forceOpen) {
      const panel = document.getElementById('quickTodoTagsPanel');
      if (!panel) return;
      const open = typeof forceOpen === 'boolean' ? forceOpen : panel.classList.contains('d-none');
      panel.classList.toggle('d-none', !open);
      renderQuickTodoTagsPanel();
      if (open) requestAnimationFrame(() => document.getElementById('quickTodoTagInput')?.focus());
    }

    /** Quick TODO: close the inline body panel. */
    function hideQuickTodoBodyPanel() {
      const panel = document.getElementById('quickTodoBodyPanel');
      if (!panel) return;
      panel.classList.add('d-none');
      syncQuickTodoBodyToggleButton();
    }

    /** Quick TODO: toggle the inline body panel inside the popup. */
    function toggleQuickTodoBodyPanel(forceOpen) {
      const panel = document.getElementById('quickTodoBodyPanel');
      if (!panel) return;
      const open = typeof forceOpen === 'boolean' ? forceOpen : panel.classList.contains('d-none');
      panel.classList.toggle('d-none', !open);
      syncQuickTodoBodyToggleButton();
      if (open) requestAnimationFrame(() => document.getElementById('quickTodoBodyInput')?.focus());
    }

    /** After tag rename / add / remove on disk: search now; optional pathRenames patches rows if Everything is still stale (bulk). */
    async function refreshAfterTagsSaved(pathRenames) {
      void renderShelf();
      if (pathRenames && pathRenames.length) {
        tagRenamePendingPairs = pathRenames.slice();
        if (tagRenamePendingPairsClearTimer) clearTimeout(tagRenamePendingPairsClearTimer);
        tagRenamePendingPairsClearTimer = setTimeout(() => {
          tagRenamePendingPairs = null;
          tagRenamePendingPairsClearTimer = null;
        }, 8000);
      } else {
        tagRenamePendingPairs = null;
      }
      clearAndScheduleSearchRetries();
      await runSearchNow('refresh');
      refreshTagModalDatalist();
    }

    /** Folder rows take a tint while Path is the sort. */
    function syncSortPathClass() {
      const rt = document.getElementById('resultsTable');
      if (rt) rt.classList.toggle('results-sort-path', sortColumn === 'path');
    }

    /** Status strip: brief primary glow (matches pulse-hint accent; one-shot). */
    function pulseStatusBarBrief() {
      const bar = document.getElementById('tagfoxNavbarStatus');
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

    /** Escape plain text for safe HTML inside #statusMain segments. */
    function escStatusHtmlForStatus(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    function escStatusAttrForStatus(s) {
      return escStatusHtmlForStatus(s).replace(/"/g, '&quot;');
    }
    /** A tip segment: a string, { kbd } for a key, or { code } for text typed into the box. */
    function didYouKnowSegmentsPlain(segments) {
      return segments.map((seg) => (typeof seg === 'string' ? seg : seg.kbd || seg.code)).join('');
    }
    function didYouKnowSegmentsHtml(segments) {
      return segments
        .map((seg) =>
          typeof seg === 'string'
            ? escStatusHtmlForStatus(seg)
            : seg.kbd
              ? '<kbd class="tagfox-navbar-tip-kbd">' + escStatusHtmlForStatus(seg.kbd) + '</kbd>'
              : '<code class="tagfox-navbar-tip-code">' + escStatusHtmlForStatus(seg.code) + '</code>'
        )
        .join('');
    }
    function shuffleDidYouKnowBag() {
      didYouKnowBag = [];
      for (const entry of DID_YOU_KNOW_TIPS) {
        for (let i = 0; i < (entry.score || 1); i++) didYouKnowBag.push(entry.tip);
      }
      for (let i = didYouKnowBag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = didYouKnowBag[i];
        didYouKnowBag[i] = didYouKnowBag[j];
        didYouKnowBag[j] = tmp;
      }
      if (didYouKnowBag.length > 1 && JSON.stringify(didYouKnowBag[0]) === didYouKnowLastTipKey) {
        const tmp = didYouKnowBag[0];
        didYouKnowBag[0] = didYouKnowBag[1];
        didYouKnowBag[1] = tmp;
      }
    }
    function nextDidYouKnowTip() {
      if (!didYouKnowBag.length) shuffleDidYouKnowBag();
      const tip = didYouKnowBag.shift() || [];
      didYouKnowLastTipKey = JSON.stringify(tip);
      return tip;
    }
    function renderDidYouKnowTip(segments) {
      const mount = document.getElementById('navbarDidYouKnow');
      if (!mount) return;
      if (!segments || !segments.length) {
        mount.innerHTML = '';
        return;
      }
      const plain = didYouKnowSegmentsPlain(segments);
      const full = 'Did you know? ' + plain;
      mount.innerHTML =
        '<span class="tagfox-navbar-tip" title="' +
        escStatusAttrForStatus(full) +
        '" aria-label="' +
        escStatusAttrForStatus(full) +
        '">' +
        '<i class="fa-regular fa-lightbulb text-warning" aria-hidden="true"></i>' +
        '<span class="tagfox-navbar-tip-label">Did you know?</span>' +
        '<span class="tagfox-navbar-tip-text">' +
        didYouKnowSegmentsHtml(segments) +
        '</span>' +
        '</span>';
      refreshTagFoxChromeTooltips(mount);
    }
    function showNextDidYouKnowTip() {
      renderDidYouKnowTip(nextDidYouKnowTip());
      scheduleDidYouKnowFade();
    }
    /* Make the tip visible on update, then fade it out a minute later. */
    function scheduleDidYouKnowFade() {
      const mount = document.getElementById('navbarDidYouKnow');
      if (!mount) return;
      if (didYouKnowFadeTimerId) { clearTimeout(didYouKnowFadeTimerId); didYouKnowFadeTimerId = null; }
      mount.classList.remove('tagfox-navbar-dyk-faded');
      didYouKnowFadeTimerId = setTimeout(() => {
        mount.classList.add('tagfox-navbar-dyk-faded');
        didYouKnowFadeTimerId = null;
      }, DID_YOU_KNOW_FADE_MS);
    }
    function startDidYouKnowTips() {
      if (didYouKnowTimerId) clearInterval(didYouKnowTimerId);
      showNextDidYouKnowTip();
      didYouKnowTimerId = setInterval(() => showNextDidYouKnowTip(), DID_YOU_KNOW_ROTATE_MS);
    }

    /** Main status line. `progress`: routine progress
        ("Searching…") that Runner does not bring its hidden bar up for, and that never replaces a message
        the bar is still showing: an action's result starts a search, whose "Searching…" would otherwise
        be all the bar said for the result's five seconds. */
    function setStatusMain(text, { progress = false } = {}) {
      if (progress && isRunnerMode() && document.body.classList.contains('tagfox-runner-status-on')) return;
      const el = document.getElementById('statusMain');
      if (el) el.textContent = text == null ? '' : String(text);
      if (text && !progress) flashRunnerStatus();
    }

    /** Runner hides the status bar, so a message (an error, an action's result, the F5 report) brings it up
        over the bottom edge for a few seconds, and longer while the pointer is on it. */
    const RUNNER_STATUS_SHOW_MS = 5000;
    let runnerStatusTimer = null;
    function flashRunnerStatus() {
      if (!isRunnerMode()) return;
      document.body.classList.add('tagfox-runner-status-on');
      clearTimeout(runnerStatusTimer);
      const hide = () => {
        if (document.getElementById('tagfoxNavbarStatus')?.matches(':hover')) {
          runnerStatusTimer = setTimeout(hide, 1500);
          return;
        }
        document.body.classList.remove('tagfox-runner-status-on');
      };
      runnerStatusTimer = setTimeout(hide, RUNNER_STATUS_SHOW_MS);
    }

    /* ===== Single-level undo (Ctrl+Z): rename/tag-edit, move, copy/paste, new folder.
       One entry only: each new tracked action replaces it. Delete is not undone here — recycled items
       are recoverable from the Windows Recycle Bin (runUndo says so). ===== */
    let undoEntry = null; // { label, invert: async () => boolean }

    function setUndoEntry(entry) {
      undoEntry = entry;
    }

    /** Record an undo that reverses a batch of renames (to → from). rootPrefix captured as it was at action time. */
    function recordRenameUndo(pairs, label) {
      const valid = (pairs || []).filter((p) => p && p.from && p.to);
      if (!valid.length) return;
      const rootPrefix = rootPrefixValue();
      setUndoEntry({
        label,
        invert: async () => {
          let allOk = true;
          // Reverse order so a chain of collision-y renames unwinds cleanly.
          for (let i = valid.length - 1; i >= 0; i--) {
            const r = await window.tagBrowser.renamePath({ fromPath: valid[i].to, toPath: valid[i].from, rootPrefix });
            if (!r || !r.ok) allOk = false;
          }
          return allOk;
        },
      });
    }

    /** Record an undo that recycles freshly created items (copy/paste/new folder). */
    function recordCreatedPathsUndo(paths, label) {
      const list = (paths || []).map((p) => String(p || '')).filter(Boolean);
      if (!list.length) return;
      setUndoEntry({
        label,
        invert: async () => {
          const r = await window.tagBrowser.trashPaths(list, { debugSource: 'undo' });
          return !!(r && r.ok);
        },
      });
    }

    async function runUndo() {
      const e = undoEntry;
      if (!e) {
        setStatusMain('Nothing to undo. (Deleted items are in the Recycle Bin.)');
        return;
      }
      setUndoEntry(null); // consume; the undo itself is not re-undoable
      setStatusMain('Undoing ' + e.label + '…');
      try {
        const ok = await e.invert();
        setStatusMain(
          ok ? 'Undone: ' + e.label : 'Could not fully undo ' + e.label + ' (item moved or changed since?).'
        );
      } catch (err) {
        setStatusMain('Undo failed: ' + String((err && err.message) || err));
      }
    }

    /** Folder that scopes the search (Settings “Scope folder” field). */
    function currentScopeFolderPath() {
      const rootRaw = document.getElementById('rootFolder').value.trim();
      return rootRaw ? normalizeFolderPathForEverything(rootRaw) : '';
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
      /* Runner shows a file's name on its own, so the path is only ever the folder it is in. */
      if (!scope) return isFolder || isRunnerMode() ? parent : fp;
      const rel = pathRelativeToScopeDir(parent);
      return rel || '—';
    }

    /** Highlight #query in a cell: quoted = phrase (flexible \\s+ between tokens); else space = AND (each term anywhere), like Everything nopath. */
    function appendHighlightedTextInto(el, text, needleRaw) {
      const t = String(text ?? '');
      el.replaceChildren();
      let needle = String(needleRaw ?? '').trim();
      if (!needle || !t) {
        el.textContent = t;
        return;
      }
      let quotedPhrase = false;
      if (
        (needle.startsWith('"') && needle.endsWith('"') && needle.length >= 2) ||
        (needle.startsWith("'") && needle.endsWith("'") && needle.length >= 2)
      ) {
        quotedPhrase = true;
        needle = needle.slice(1, -1).trim();
      }
      if (!needle) {
        el.textContent = t;
        return;
      }
      const parts = needle.split(/\s+/).filter(Boolean);
      if (!parts.length) {
        el.textContent = t;
        return;
      }
      const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escaped = parts.map(esc);
      const matchCase = !!document.getElementById('optCase')?.checked;
      const wholeWord = !!document.getElementById('optWholeWord')?.checked;
      const wrapWw = (e) => (wholeWord ? '\\b' + e + '\\b' : e);
      const flags = matchCase ? 'g' : 'gi';

      function mergeIntervals(ranges) {
        ranges.sort((a, b) => a.start - b.start || b.end - a.end);
        const out = [];
        for (const r of ranges) {
          if (!out.length || r.start > out[out.length - 1].end) out.push({ start: r.start, end: r.end });
          else out[out.length - 1].end = Math.max(out[out.length - 1].end, r.end);
        }
        return out;
      }

      function appendFromMerged(merged) {
        let last = 0;
        for (const r of merged) {
          if (r.start > last) el.appendChild(document.createTextNode(t.slice(last, r.start)));
          const mk = document.createElement('mark');
          mk.className = 'tagfox-query-hit';
          mk.textContent = t.slice(r.start, r.end);
          el.appendChild(mk);
          last = r.end;
        }
        if (last < t.length) el.appendChild(document.createTextNode(t.slice(last)));
      }

      try {
        if (quotedPhrase && parts.length > 1) {
          const re = new RegExp(escaped.map(wrapWw).join('\\s+'), flags);
          const merged = [];
          let m;
          while ((m = re.exec(t)) !== null) {
            merged.push({ start: m.index, end: m.index + m[0].length });
            if (m[0].length === 0) re.lastIndex++;
          }
          appendFromMerged(mergeIntervals(merged));
          return;
        }
        if (parts.length === 1) {
          const re = new RegExp(wrapWw(escaped[0]), flags);
          const merged = [];
          let m;
          while ((m = re.exec(t)) !== null) {
            merged.push({ start: m.index, end: m.index + m[0].length });
            if (m[0].length === 0) re.lastIndex++;
          }
          appendFromMerged(mergeIntervals(merged));
          return;
        }
        /* Unquoted multi-token: AND — highlight every occurrence of each term. */
        const merged = [];
        for (const e of escaped) {
          const re = new RegExp(wrapWw(e), flags);
          let m;
          while ((m = re.exec(t)) !== null) {
            merged.push({ start: m.index, end: m.index + m[0].length });
            if (m[0].length === 0) re.lastIndex++;
          }
        }
        appendFromMerged(mergeIntervals(merged));
      } catch (_) {
        el.textContent = t;
      }
    }

    /** Fill path cell: muted prefix + stronger final segment (ellipsis still via .path-ellip-start). */
    function fillPathCellBox(pathBox, displayStr, queryNeedle) {
      pathBox.replaceChildren();
      const bdi = document.createElement('bdi');
      bdi.dir = 'ltr';
      const s = String(displayStr ?? '');
      const hit = queryNeedle ? String(queryNeedle) : null;
      const fillSpan = (span, part) => {
        if (!part) {
          span.textContent = '';
          return;
        }
        if (hit) appendHighlightedTextInto(span, part, hit);
        else span.textContent = part;
      };
      if (!s || s === '—') {
        const show = s || '—';
        if (hit) appendHighlightedTextInto(bdi, show, hit);
        else bdi.textContent = show;
        pathBox.appendChild(bdi);
        return;
      }
      const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
      if (i < 0) {
        const tail = document.createElement('span');
        tail.className = 'path-col-tail';
        fillSpan(tail, s);
        bdi.appendChild(tail);
      } else {
        const head = document.createElement('span');
        fillSpan(head, s.slice(0, i + 1));
        const tail = document.createElement('span');
        tail.className = 'path-col-tail';
        fillSpan(tail, s.slice(i + 1));
        bdi.appendChild(head);
        bdi.appendChild(tail);
      }
      pathBox.appendChild(bdi);
    }

    /** Parse a JSON value from localStorage; return fallback on missing or invalid. */
    function lsGetJson(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        const v = JSON.parse(raw);
        return v == null ? fallback : v;
      } catch {
        return fallback;
      }
    }

    /** Stringify and store a JSON value; swallow quota / serialize errors. */
    function lsSetJson(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {}
    }

    function loadFavouriteFolders() {
      const arr = lsGetJson(LS.favFolders, []);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && String(x).trim()) : [];
    }

    /** Favourites (Runner's stars are the same list) are capped here. */
    const FAV_FOLDERS_MAX = 30;
    function saveFavouriteFolders(paths) {
      lsSetJson(LS.favFolders, paths.slice(0, FAV_FOLDERS_MAX));
    }

    /** Per-path focus counts + last visit (normalized lowercased keys), which Runner's ranking reads. */
    function loadFocusStats(lsKey) {
      const o = lsGetJson(lsKey, {});
      if (!o || typeof o !== 'object') return {};
      const out = {};
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (!v || typeof v !== 'object') continue;
        const visits = typeof v.visits === 'number' && v.visits >= 0 ? v.visits : 0;
        const lastTs = typeof v.lastTs === 'number' ? v.lastTs : 0;
        const p0 = typeof v.path === 'string' && v.path.trim() ? v.path.trim() : k;
        const norm = normalizeFolderPathForEverything(p0);
        if (!norm) continue;
        out[norm.toLowerCase()] = { visits, lastTs, path: norm };
      }
      return out;
    }

    /** Per-folder focus counts + last visit. */
    function loadFolderFocusStats() {
      return loadFocusStats(LS.folderFocusStats);
    }

    function saveFolderFocusStats(o) {
      lsSetJson(LS.folderFocusStats, o);
    }

    /** Per-file open counts + last open. */
    function loadFileFocusStats() {
      return loadFocusStats(LS.fileFocusStats);
    }

    function saveFileFocusStats(o) {
      lsSetJson(LS.fileFocusStats, o);
    }

    function bumpFileFocusVisit(filePathRaw) {
      const norm = normalizeFolderPathForEverything(String(filePathRaw || '').trim());
      if (!norm) return;
      const o = loadFileFocusStats();
      const key = norm.toLowerCase();
      const prev = o[key] || { visits: 0, lastTs: 0, path: norm };
      o[key] = {
        path: norm,
        visits: (prev.visits || 0) + 1,
        lastTs: Date.now(),
      };
      const keys = Object.keys(o);
      if (keys.length > 280) {
        keys.sort((a, b) => (o[b].lastTs || 0) - (o[a].lastTs || 0));
        for (const k of keys.slice(250)) delete o[k];
      }
      saveFileFocusStats(o);
    }

    function bumpFolderFocusVisit(norm) {
      if (!norm) return;
      const o = loadFolderFocusStats();
      const key = norm.toLowerCase();
      const prev = o[key] || { visits: 0, lastTs: 0, path: norm };
      o[key] = {
        path: norm,
        visits: (prev.visits || 0) + 1,
        lastTs: Date.now(),
      };
      const keys = Object.keys(o);
      if (keys.length > 220) {
        keys.sort((a, b) => (o[b].lastTs || 0) - (o[a].lastTs || 0));
        for (const k of keys.slice(200)) delete o[k];
      }
      saveFolderFocusStats(o);
    }


    /**
     * Fuzzy score of query against a path or label, or null when some token is not a subsequence of it.
     * Fewer, longer pieces win by a wide margin: each extra piece costs FUZZY_PIECE_COST, more when it jumps a
     * folder boundary, and each character that continues a run earns more the longer the run already is. So
     * "tes" scores high on ...\test and far below zero on ...\TagFox-runner\scripts (t, e and s in three pieces).
     */
    const FUZZY_PIECE_COST = 25;
    const FUZZY_SEPARATOR_COST = 25;
    const FUZZY_RUN_BONUS = 4;
    function fuzzyPathScore(query, text) {
      const t = String(text || '').toLowerCase();
      const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!tokens.length) return 0;
      const lastSep = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'));
      const isSep = (c) => c === '\\' || c === '/';
      const isBoundary = (i) => i === 0 || /[\\/\s._-]/.test(t[i - 1]);
      const isWordEnd = (i) => i === t.length - 1 || /[\\/\s._-]/.test(t[i + 1]);
      let total = 0;
      for (const q of tokens) {
        // prev[i] / prevRun[i]: best score with the previous token char matched at text index i, and the length
        // of the contiguous run that match ends.
        let prev = null;
        let prevRun = null;
        for (let j = 0; j < q.length; j++) {
          const cur = new Array(t.length).fill(-Infinity);
          const curRun = new Array(t.length).fill(0);
          let maxAny = -Infinity; // best prev[k], k <= i-2: a new piece
          let maxSameSeg = -Infinity; // the same, with no folder separator between k and i
          for (let i = 0; i < t.length; i++) {
            if (prev && i >= 2) {
              maxAny = Math.max(maxAny, prev[i - 2]);
              maxSameSeg = Math.max(maxSameSeg, prev[i - 2]);
            }
            if (i >= 1 && isSep(t[i - 1])) maxSameSeg = -Infinity;
            if (t[i] !== q[j]) continue;
            /* A token that ends where a word ends earns what one starting a word does. */
            const endsWord = j === q.length - 1 && isWordEnd(i);
            const here = 1 + (i > lastSep ? 2 : 0) + (endsWord ? 3 : 0);
            if (j === 0) {
              cur[i] = here + (isBoundary(i) ? 3 : 0);
              curRun[i] = 1;
              continue;
            }
            const cont = i > 0 && prev[i - 1] > -Infinity ? prev[i - 1] + here + FUZZY_RUN_BONUS * prevRun[i - 1] : -Infinity;
            const jump = Math.max(maxSameSeg - FUZZY_PIECE_COST, maxAny - FUZZY_PIECE_COST - FUZZY_SEPARATOR_COST);
            const piece = jump > -Infinity ? jump + here + (isBoundary(i) ? 3 : 0) : -Infinity;
            if (cont === -Infinity && piece === -Infinity) continue;
            if (cont >= piece) {
              cur[i] = cont;
              curRun[i] = prevRun[i - 1] + 1;
            } else {
              cur[i] = piece;
              curRun[i] = 1;
            }
          }
          prev = cur;
          prevRun = curRun;
        }
        const best = Math.max(...prev);
        if (best === -Infinity) return null;
        total += best;
      }
      return total;
    }

    /** Open a favourite: a file opens, a folder becomes the current folder. Stars hold files as well as folders,
        so the disk says which. */
    async function openFavouritePath(p) {
      let kind = 'folder';
      try {
        const r = await window.tagBrowser.pathKinds([p]);
        kind = (r && r.kinds && r.kinds[p]) || kind;
      } catch (_) {}
      if (kind === 'file') await openFileDefaultOrGoogleWorkspace(p);
      else await applySearchScopeAndRefresh(p);
    }

    /** Search box hint: last segment of scope (pretty title), or entire-index wording when scope empty. */
    function updateQueryPlaceholder() {
      const q = document.getElementById('query');
      const ghost = document.getElementById('queryGhostHint');
      if (!q) return;
      const max = getSearchScopeMaxFolderNorm();
      const scopeRaw = document.getElementById('rootFolder').value.trim();
      q.placeholder = '';
      if (!scopeRaw && !max) {
        q.setAttribute('aria-label', 'Search inside entire index');
        if (ghost) {
          ghost.innerHTML =
            '<span class="text-muted">Search inside</span><span class="tagfox-query-ghost-folder">(entire index)</span>';
        }
      } else {
        const norm = normalizeFolderPathForEverything(scopeRaw || max).replace(/[/\\]+$/, '');
        const seg = T.baseName(norm);
        let pretty = (segmentPretty(seg) || seg || 'folder').trim();
        const gdPretty = prettyGDriveShortcutIdFolderBasename(norm, updateQueryPlaceholder);
        if (gdPretty) pretty = gdPretty;
        q.setAttribute('aria-label', 'Search inside ' + pretty);
        if (ghost) {
          ghost.innerHTML =
            '<span class="text-muted">Search inside</span><span class="tagfox-query-ghost-folder">' +
            escapeHtmlForPreview(pretty) +
            '</span>';
        }
      }
      syncQueryGhostUi();
    }

    /** Show layered hint only when #query is empty (placeholder text cannot mix styles). */
    function syncQueryGhostUi() {
      const q = document.getElementById('query');
      const ghost = document.getElementById('queryGhostHint');
      if (!q) return;
      const empty = !String(q.value || '').trim();
      q.classList.toggle('tagfox-query-empty', empty);
      ghost?.classList.toggle('d-none', !empty);
    }

    /** Breadcrumb bar only depends on scope folder — not on which result row is selected. */
    let renderedScopeBreadcrumbKey = null;

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

    /** Scope bars that can host folder-drop pills and subfolder ▾ toggles. */
    const SCOPE_FOLDER_DROP_BAR_IDS = ['breadcrumbBar'];
    /** Their ▾ toggles — derived from the same bar list to keep hover/drag logic in sync. */
    const SCOPE_FOLDER_SUBMENU_DD_TOGGLE_SEL = SCOPE_FOLDER_DROP_BAR_IDS.map((id) => `#${id} [data-bs-toggle="dropdown"]`).join(', ');

    /** Open one scope ▾ and close the others (Bootstrap). Used by hover and by dragover — DnD does not fire mouseenter. */
    function showScopeSubfolderDropdownToggle(toggleEl) {
      if (!toggleEl || toggleEl.getAttribute('data-bs-toggle') !== 'dropdown') return;
      perfTimeSync('dropdown.show', { dom: document.getElementById('tbody')?.childElementCount || 0 }, () => {
        document.querySelectorAll(SCOPE_FOLDER_SUBMENU_DD_TOGGLE_SEL).forEach((btn) => {
          if (btn === toggleEl) return;
          const o = bootstrap.Dropdown.getInstance(btn);
          if (o) o.hide();
        });
        bootstrap.Dropdown.getOrCreateInstance(toggleEl).show();
      });
    }

    /**
     * During HTML5 drag, e.target is often wrong (Electron); use elementFromPoint fallback.
     * @returns {{ barId: string, dd: Element, tgl: Element | null, hitSource: string } | null}
     */
    function resolveScopeDropdownFromDragEvent(e) {
      let el = e.target;
      if (el && el.nodeType === 3) el = el.parentElement;
      let dd = el && el.closest && el.closest('.dropdown');
      let hitSource = 'target.closest';
      if (!dd) {
        try {
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          dd = hit && hit.closest && hit.closest('.dropdown');
          hitSource = hit ? 'elementFromPoint' : 'elementFromPoint-null';
        } catch (err) {
          hitSource = 'elementFromPoint-error:' + String(err && err.message ? err.message : err);
        }
      }
      if (!dd) return null;
      for (const id of SCOPE_FOLDER_DROP_BAR_IDS) {
        const bar = document.getElementById(id);
        if (bar && bar.contains(dd)) {
          const tgl = dd.querySelector('[data-bs-toggle="dropdown"]');
          return { barId: id, dd, tgl, hitSource };
        }
      }
      return null;
    }

    let scopeFolderDropdownDragCaptureBound = false;
    /** document capture + hit-test: bar listeners often miss dragover target during row→breadcrumb drags. */
    function bindScopeFolderDropdownDragCaptureOnce() {
      if (scopeFolderDropdownDragCaptureBound) return;
      scopeFolderDropdownDragCaptureBound = true;
      let lastDdDebugAt = 0;
      document.addEventListener(
        'dragover',
        (e) => {
          if (!dataTransferHasTagBrowserOrFiles(e.dataTransfer)) return;
          const resolved = resolveScopeDropdownFromDragEvent(e);
          const now = Date.now();
          const debugOk = isSearchDebugOn() && now - lastDdDebugAt > 320;
          if (debugOk) lastDdDebugAt = now;
          let types = [];
          try {
            types = [...e.dataTransfer.types];
          } catch (_) {}
          if (!resolved || !resolved.tgl) {
            if (debugOk) {
              searchDebugLog('folderPathDrop.dd.capture', {
                phase: !resolved ? 'no-scope-dropdown' : 'dropdown-no-toggle',
                barId: resolved && resolved.barId,
                hitSource: resolved && resolved.hitSource,
                tag: e.target && e.target.tagName,
                types,
                hasTagFoxMime: dataTransferHasTagBrowserPaths(e.dataTransfer),
                nativePathStash: !!(tagBrowserActiveNativeDragPaths && tagBrowserActiveNativeDragPaths.length),
              });
            }
            return;
          }
          if (debugOk) {
            searchDebugLog('folderPathDrop.dd.capture', {
              phase: 'show',
              barId: resolved.barId,
              hitSource: resolved.hitSource,
              toggleId: resolved.tgl.id || '',
              ariaExpanded: resolved.tgl.getAttribute('aria-expanded'),
              types,
              hasTagFoxMime: dataTransferHasTagBrowserPaths(e.dataTransfer),
              nativePathStash: !!(tagBrowserActiveNativeDragPaths && tagBrowserActiveNativeDragPaths.length),
            });
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
          showScopeSubfolderDropdownToggle(resolved.tgl);
        },
        true
      );
    }

    /**
     * Hover opens ▾ menus (click still works). No mouseleave-close: flyouts live on document.body; the pointer must
     * leave .dropdown to reach them. Other ▾ close on this menu’s mouseenter; their hidden.bs.dropdown clears flyouts.
     */
    function bindBreadcrumbDropdownHover(ddWrap, toggleEl) {
      let openTimer = null;
      ddWrap.addEventListener('mouseenter', () => {
        if (openTimer) clearTimeout(openTimer);
        openTimer = setTimeout(() => {
          openTimer = null;
          showScopeSubfolderDropdownToggle(toggleEl);
        }, 150);
      });
      ddWrap.addEventListener('mouseleave', () => {
        if (openTimer) { clearTimeout(openTimer); openTimer = null; }
      });
    }

    /**
     * Trailing-▾ pattern: list direct subfolders of parentPathRaw + chained ul.breadcrumb-folder-flyout (same IPC as breadcrumb).
     * highlightPathNorm: optional path segment hint along current scope. hoverOpen: hover-opens-menu on ddWrap.
     */
    function bindSubfolderDropdownWithFlyouts(ddBtn, menu, ddWrap, parentPathRaw, highlightPathNorm, hoverOpen) {
      const parentForList = normalizeFolderPathForEverything(parentPathRaw);
      menu.className = 'dropdown-menu py-1 small shadow dropdown-menu-start';
      ddWrap.removeAttribute('data-bs-display');
      ddBtn.removeAttribute('data-bs-placement');
      menu.style.maxHeight = 'min(50vh, 280px)';
      menu.style.overflow = 'auto';
      menu.addEventListener('scroll', () => repositionBreadcrumbFlyoutChain());
      menu.addEventListener('mouseenter', cancelBreadcrumbFlyoutHideTimer);
      menu.addEventListener('keydown', (e) => {
        const t = e.target;
        const isItem = !!(t && t.classList && t.classList.contains('dropdown-item') && menu.contains(t));
        /* Own ArrowUp/Down so Bootstrap's dropdown nav can't cycle/drop focus off the ends and close the menu;
           clamp at first/last (focusin → scrollIntoView from appendBreadcrumbFolderListItems keeps it in view). */
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (!isItem) return;
          const items = [...menu.querySelectorAll('button.dropdown-item')];
          const idx = items.indexOf(t);
          if (idx < 0) return;
          e.preventDefault();
          e.stopPropagation();
          const dest = e.key === 'ArrowDown' ? items[idx + 1] : items[idx - 1];
          if (dest) dest.focus();
          return;
        }
        if (e.key !== 'ArrowRight') return;
        if (!isItem) return;
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
          const r = await perfTimeAsync('listChildFolders', { path: parentForList }, () =>
            window.tagBrowser.listChildFolders({ parentPath: parentForList })
          );
          if (r && isSearchDebugOn() && (r.serverMs > 200 || r.readdirMs > 200))
            searchDebugLog('listChildFolders.server', { serverMs: r.serverMs, readdirMs: r.readdirMs });
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
          const listOpts = { onMouseLeaveRow: scheduleHideBreadcrumbSubfolderFlyout };
          if (highlightPathNorm) listOpts.highlightPathNorm = highlightPathNorm;
          appendBreadcrumbFolderListItems(menu, folders, ddBtn, 0, listOpts);
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
          await goToBreadcrumbFolder(normalizeFolderPathForEverything(f.fullPath));
        });
        const onEnterRow = () => {
          cancelBreadcrumbFlyoutHideTimer();
          void openBreadcrumbSubfolderFlyoutForPath(f.fullPath, li, toggleBtn, openFlyoutAtDepth);
        };
        /* Hover: focus button for Bootstrap :focus styling AND open flyout directly.
           Don't rely on focusin alone — focus may already be on b (e.g., keyboard-focused row whose flyout
           was timed-out closed after the mouse strayed), in which case b.focus() is a no-op and focusin never fires. */
        li.addEventListener('mouseenter', () => {
          if (document.activeElement !== b) b.focus({ preventScroll: true });
          onEnterRow();
        });
        /* Keyboard nav: arrow keys move focus → focusin → open flyout. block:'nearest' keeps the
           focused row inside the capped, scrollable menu/flyout; no-op for mouse hover (row already visible). */
        li.addEventListener('focusin', (ev) => {
          if (ev.target !== b) return;
          b.scrollIntoView({ block: 'nearest' });
          onEnterRow();
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
      /* Idempotent: same row already opened at this depth → skip (avoids double-load when mouseenter focuses
         the button and synchronously triggers focusin, both calling this opener). */
      const existing = breadcrumbSubfolderFlyoutChain[depth];
      if (existing && existing.classList.contains('is-open') && existing._anchorLi === anchorLi) return;
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

    /** Split normalized folder path into segments (C:, UNC, etc.). */
    function splitFolderPathSegments(normPath) {
      return normalizeFolderPathForEverything(String(normPath || '').trim())
        .replace(/[/\\]+$/, '')
        .split(/[/\\]/)
        .filter((p) => p !== '');
    }

    /** Folder trail: segments set scope; with Settings scope max, that folder is the first crumb. */
    function renderScopeBreadcrumb() {
      renderRunnerScopeChip();
      hideBreadcrumbSubfolderFlyout();
      updateQueryPlaceholder();
      const el = document.getElementById('breadcrumbBar');
      const shell = document.getElementById('breadcrumbShell');
      const scopeBreadcrumbRow = document.querySelector('.scope-breadcrumb-row');
      const scopeRowActs = document.getElementById('tagfoxScopeBarRowActions');
      /* Detach before innerHTML — buttons live here after first render; clearing would destroy them. */
      if (scopeRowActs) scopeRowActs.remove();
      el.innerHTML = '';
      const maxNorm = getSearchScopeMaxFolderNorm();
      const scopeRaw = document.getElementById('rootFolder').value.trim();
      if (!maxNorm && !scopeRaw) {
        el.classList.add('d-none');
        el.classList.remove('d-flex', 'align-items-center', 'flex-wrap', 'gap-0');
        if (shell) {
          shell.classList.add('d-none');
          shell.classList.remove('d-flex');
        }
        /* Empty scope: park row actions after shell (same as static HTML; breadcrumb strip stays hidden). */
        if (scopeBreadcrumbRow && scopeRowActs) scopeBreadcrumbRow.appendChild(scopeRowActs);
        syncScopeBarButtons();
        renderedScopeBreadcrumbKey = currentScopeBreadcrumbKey();
        return;
      }
      if (shell) {
        shell.classList.remove('d-none');
        shell.classList.add('d-flex');
      }
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
      /* Last path segment + trailing ▾ “subfolders” share one split pill (.tagfox-breadcrumb-folder-chip). */
      let lastPathWrap = null;

      function appendSiblingChevron(parentEl, iSeg, parentForPeers, partsArr) {
        let accNext = '';
        for (let j = 0; j <= iSeg + 1; j++) {
          accNext = j === 0 ? partsArr[j] : accNext + sep + partsArr[j];
        }
        const targetChildNorm = normalizeFolderPathForEverything(accNext).replace(/[/\\]+$/, '').toLowerCase();

        const chevronWrap = document.createElement('span');
        chevronWrap.className = 'd-inline-flex align-items-center text-muted user-select-none breadcrumb-scope-dd';

        const ddWrap = document.createElement('div');
        ddWrap.className = 'dropdown';
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
        parentEl.appendChild(chevronWrap);
      }

      if (!maxNorm) {
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
          const folderForSearch = normalizeFolderPathForEverything(acc);
          if (isGDriveShortcutId) {
            btn.innerHTML = '<i class="fa-solid fa-link fa-xs" aria-hidden="true"></i>';
            btn.setAttribute('aria-label', 'Google Drive shortcut: ' + folderForSearch);
          } else if (i === parts.length - 1) {
            btn.classList.add('d-inline-flex', 'align-items-center', 'gap-1');
            btn.appendChild(folderIconEl());
            const lab = document.createElement('span');
            lab.textContent = parsed.pretty;
            btn.appendChild(lab);
          } else {
            btn.textContent = parsed.pretty;
          }
          wrap.dataset.dropPath = folderForSearch;
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await goToBreadcrumbFolder(folderForSearch);
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
          if (i < parts.length - 1) {
            const chip = document.createElement('span');
            chip.className = 'tagfox-breadcrumb-folder-chip d-inline-flex align-items-stretch';
            chip.appendChild(wrap);
            appendSiblingChevron(chip, i, folderForSearch, parts);
            el.appendChild(chip);
          } else {
            lastPathWrap = wrap;
          }
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
        if (onlyRoot) {
          /* Scope root is the current folder: match folder row lead (icon + label). */
          btnR.classList.add('d-inline-flex', 'align-items-center', 'gap-1');
          btnR.appendChild(folderIconEl());
          const labR = document.createElement('span');
          labR.textContent = segmentPretty(T.baseName(maxNormFull)) || T.baseName(maxNormFull);
          btnR.appendChild(labR);
        } else {
          btnR.textContent = segmentPretty(T.baseName(maxNormFull)) || T.baseName(maxNormFull);
        }
        btnR.addEventListener('click', async (e) => {
          e.stopPropagation();
          await goToBreadcrumbFolder(maxNormFull);
        });
        wrapR.dataset.dropPath = maxNormFull;
        wrapR.appendChild(btnR);
        if (!onlyRoot) {
          const chipR = document.createElement('span');
          chipR.className = 'tagfox-breadcrumb-folder-chip d-inline-flex align-items-stretch';
          chipR.appendChild(wrapR);
          appendSiblingChevron(chipR, maxParts.length - 1, maxNormFull, parts);
          el.appendChild(chipR);
        } else {
          lastPathWrap = wrapR;
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
          const folderForSearch = normalizeFolderPathForEverything(acc);
          if (isGDriveShortcutId) {
            btn.innerHTML = '<i class="fa-solid fa-link fa-xs" aria-hidden="true"></i>';
            btn.setAttribute('aria-label', 'Google Drive shortcut: ' + folderForSearch);
          } else if (i === parts.length - 1) {
            btn.classList.add('d-inline-flex', 'align-items-center', 'gap-1');
            btn.appendChild(folderIconEl());
            const lab = document.createElement('span');
            lab.textContent = parsed.pretty;
            btn.appendChild(lab);
          } else {
            btn.textContent = parsed.pretty;
          }
          wrap.dataset.dropPath = folderForSearch;
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await goToBreadcrumbFolder(folderForSearch);
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
          if (i < parts.length - 1) {
            const chip = document.createElement('span');
            chip.className = 'tagfox-breadcrumb-folder-chip d-inline-flex align-items-stretch';
            chip.appendChild(wrap);
            appendSiblingChevron(chip, i, folderForSearch, parts);
            el.appendChild(chip);
          } else {
            lastPathWrap = wrap;
          }
        }
      }

      const scopeFolder = normalizeFolderPathForEverything(scopeRaw || maxNorm);
      const subWrap = document.createElement('span');
      subWrap.className = 'd-inline-flex align-items-center text-muted user-select-none breadcrumb-scope-dd';
      const subDd = document.createElement('div');
      subDd.className = 'dropdown';
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
      if (lastPathWrap) {
        const lastChip = document.createElement('span');
        lastChip.className = 'tagfox-breadcrumb-folder-chip d-inline-flex align-items-stretch';
        lastChip.appendChild(lastPathWrap);
        lastChip.appendChild(subWrap); /* insertBefore needs subWrap already a child of lastChip */
        if (scopeRowActs) lastChip.insertBefore(scopeRowActs, subWrap);
        el.appendChild(lastChip);
      } else {
        el.appendChild(subWrap);
        if (scopeRowActs) el.insertBefore(scopeRowActs, subWrap);
      }
      /* Runner: the buttons go in the box's folder chip instead, before its x, shown while it is hovered. */
      const runnerChip = document.getElementById('runnerScopeChip');
      if (isRunnerMode() && scopeRowActs && runnerChip && !runnerChip.classList.contains('d-none')) {
        runnerChip.insertBefore(scopeRowActs, runnerChip.querySelector('.tagfox-runner-scope-chip-x'));
      }
      syncScopeBarButtons();
      renderedScopeBreadcrumbKey = currentScopeBreadcrumbKey();
      refreshTagFoxChromeTooltips(document.getElementById('breadcrumbBar'));
      fitRunnerBreadcrumb();
    }

    /** A breadcrumb pill: go to that folder. Runner goes the way its arrow keys do: the box is cleared, and the
        folder on the way back to where you were is selected. */
    async function goToBreadcrumbFolder(folder) {
      if (!isRunnerMode()) return applySearchScopeAndRefresh(folder);
      const from = currentScopeFolderPath();
      const k = pathNormKey(folder);
      let back = null;
      if (from && pathNormKey(from).startsWith(k + '\\')) {
        const next = from.replace(/[/\\]+$/, '').slice(folder.replace(/[/\\]+$/, '').length + 1).split(/[/\\]/)[0];
        if (next) back = folder.replace(/[/\\]+$/, '') + '\\' + next;
      }
      focusQueryBox(false);
      await runnerNavigate(() => applySearchScopeAndRefresh(folder), back);
    }

    /** Runner shows the breadcrumb as one small row of pills above the box. While the row overflows, its leading
        pills give way to "…" (the whole path in its tooltip); the current folder's pill always stays. Measured on
        the page, since the room depends on the window and the Viewer's width. */
    function fitRunnerBreadcrumb() {
      const bar = document.getElementById('breadcrumbBar');
      if (!bar || !isRunnerMode() || bar.classList.contains('d-none')) return;
      const pills = Array.from(bar.querySelectorAll(':scope > .tagfox-breadcrumb-folder-chip'));
      if (!pills.length) return;
      let more = bar.querySelector(':scope > .tagfox-runner-crumb-more');
      if (!more) {
        more = document.createElement('span');
        more.className = 'tagfox-runner-only tagfox-runner-crumb-more';
        more.textContent = '…';
        bar.insertBefore(more, pills[0]);
      }
      more.title = currentScopeFolderPath() || getSearchScopeMaxFolderNorm();
      for (const p of pills) p.classList.remove('tagfox-runner-crumb-hidden');
      bar.classList.remove('tagfox-runner-crumb-squeeze');
      more.classList.add('d-none');
      const over = () => bar.scrollWidth > bar.clientWidth + 1;
      if (!bar.clientWidth || !over()) return;
      more.classList.remove('d-none');
      for (let i = 0; i < pills.length - 1 && over(); i++) pills[i].classList.add('tagfox-runner-crumb-hidden');
      if (over()) bar.classList.add('tagfox-runner-crumb-squeeze');
    }

    /** Resolve relative `![](path)` targets against the .md file’s folder (preview loads as file:// index, not beside the .md). */
    function resolveRelativeImagePathFromMdFile(mdFileAbsPath, relUrl) {
      let dir = T.parentDir(String(mdFileAbsPath || '').replace(/\//g, '\\'));
      if (!dir) return null;
      const parts = String(relUrl || '')
        .trim()
        .replace(/\\/g, '/')
        .split('/')
        .filter((p) => p.length);
      for (const p of parts) {
        if (p === '..') {
          dir = T.parentDir(dir);
          if (!dir) return null;
        } else if (p !== '.') {
          dir = joinFolderAndFileName(dir, p);
        }
      }
      return dir;
    }

    function rewriteMarkdownRelativeImageUrlsForPreview(md, mdSourceAbsPath) {
      const base = String(mdSourceAbsPath || '').trim();
      if (!base) return md || '';
      return String(md || '').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, dest) => {
        const d = String(dest || '').trim();
        if (!d || /^(https?:|file:|data:|mailto:|#)/i.test(d)) return full;
        const abs = resolveRelativeImagePathFromMdFile(base, d);
        if (!abs) return full;
        return '![' + alt + '](' + localPathToFileUrl(abs) + ')';
      });
    }

    /** Optional `{ mdSourcePath }` so relative `![](.images/…)` resolve to real files in preview. */
    function mdPreviewHtml(md, opts) {
      try {
        let src = md || '';
        if (opts && opts.mdSourcePath) src = rewriteMarkdownRelativeImageUrlsForPreview(src, opts.mdSourcePath);
        if (typeof marked !== 'undefined' && marked.parse) return marked.parse(src, { async: false });
        if (typeof marked !== 'undefined' && marked.marked && marked.marked.parse) return marked.marked.parse(src);
      } catch (_) {
        return '<p class="text-danger small">Preview error.</p>';
      }
      return '<p class="text-muted">Preview unavailable.</p>';
    }

    /** Markdown sources get rendered; code/config stays literal beside the editor. */
    function editableTextPreviewHtml(text, fullPath) {
      const kind = editableTextKindForBase(T.baseName(fullPath || ''));
      if (kind && kind.markdown) return mdPreviewHtml(text, { mdSourcePath: fullPath });
      return (
        '<pre class="m-0 font-monospace small" style="white-space: pre-wrap; word-break: break-word">' +
        escapeHtmlForPreview(text) +
        '</pre>'
      );
    }

    /** Disk-mutation guard root: configured scope-max only (empty = no root restriction). */
    function rootPrefixValue() {
      return T.normalizeRootPrefix(getSearchScopeMaxFolderNorm());
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

    /** Strip trailing extension (last `.` segment) for prefill only; keeps `xk/xp/xx` tags etc. in the stem. */
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
          input.removeEventListener('pointerdown', onInputPtr);
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
        const onInputPtr = () => pullWebContentsKeyboardFocus();
        const pinModalTextFocus = () => pinModalFieldFocus(input, true);
        input.value = 'New folder';
        btnCreate.addEventListener('click', onCreate);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        input.addEventListener('keydown', onKey);
        input.addEventListener('pointerdown', onInputPtr);
        modalEl.addEventListener(
          'shown.bs.modal',
          () => {
            pinModalTextFocus();
            requestAnimationFrame(pinModalTextFocus);
          },
          { once: true }
        );
        modal.show();
      });
    }

    /** Modal folder picker for ambiguous paste targets. */
    function promptPasteTargetModal(destFolders, currentFolder) {
      return new Promise((resolve) => {
        const modalEl = document.getElementById('pasteTargetModal');
        const hint = document.getElementById('pasteTargetModalHint');
        const select = document.getElementById('pasteTargetSelect');
        const btnApply = document.getElementById('pasteTargetModalApply');
        if (!modalEl || !hint || !select || !btnApply) {
          resolve(null);
          return;
        }
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { focus: false });
        let settled = false;
        const cleanup = () => {
          btnApply.removeEventListener('click', onApply);
          select.removeEventListener('keydown', onKey);
          select.removeEventListener('dblclick', onDblClick);
          select.removeEventListener('pointerdown', onSelectPtr);
          modalEl.removeEventListener('hidden.bs.modal', onHidden);
        };
        const finish = (val) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(val);
        };
        const onApply = () => {
          finish(String(select.value || '').trim() || null);
          modal.hide();
        };
        const onHidden = () => finish(null);
        const onKey = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onApply();
          }
        };
        const onDblClick = () => onApply();
        const onSelectPtr = () => pullWebContentsKeyboardFocus();
        const pinModalFocus = () => pinModalFieldFocus(select, false);
        hint.textContent = 'Choose the destination folder for the clipboard items.';
        select.innerHTML = '';
        for (const folder of destFolders || []) {
          const opt = document.createElement('option');
          opt.value = folder;
          opt.textContent = pathNormKey(folder) === pathNormKey(currentFolder) ? folder + '  (current folder)' : folder;
          select.appendChild(opt);
        }
        if (select.options.length) select.selectedIndex = 0;
        btnApply.addEventListener('click', onApply);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        select.addEventListener('keydown', onKey);
        select.addEventListener('dblclick', onDblClick);
        select.addEventListener('pointerdown', onSelectPtr);
        modalEl.addEventListener(
          'shown.bs.modal',
          () => {
            pinModalFocus();
            requestAnimationFrame(pinModalFocus);
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
          input.removeEventListener('pointerdown', onInputPtr);
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
        const onInputPtr = () => pullWebContentsKeyboardFocus();
        const pinModalTextFocus = () => pinModalFieldFocus(input, true);
        input.value = String(initialBase || '');
        btnApply.addEventListener('click', onApply);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        input.addEventListener('keydown', onKey);
        input.addEventListener('pointerdown', onInputPtr);
        modalEl.addEventListener(
          'shown.bs.modal',
          () => {
            pinModalTextFocus();
            requestAnimationFrame(pinModalTextFocus);
          },
          { once: true }
        );
        modal.show();
      });
    }

    /** Rename selected row (optional path for ⋯ menu). Same folder only; respects rootPrefix in main. */
    async function renameItemInteractive(fpOpt) {
      const status = document.getElementById('statusMain');
      let fp = String(fpOpt || '').trim();
      if (!fp) {
        const chk = getCheckedPathsArr();
        if (chk.length > 1) {
          openBulkRenameModal();
          return;
        }
        if (chk.length === 1) fp = chk[0];
      }
      if (!fp) {
        setStatusMain('Check a row to rename.');
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
        const rootPrefix = rootPrefixValue();
        const mdWas = mdAutosaveTargetPath && mdAutosaveTargetPath.replace(/[/\\]+$/, '').toLowerCase() === fromN;
        if (mdWas) await flushMdFileAutosave();
        const res = await window.tagBrowser.renamePath({ fromPath: fp, toPath, rootPrefix });
        if (!res || !res.ok) {
          setStatusMain((res && res.error) || 'Rename failed');
          return;
        }
        if (selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN) {
          selectedFullPath = toPath;
          renderScopeBreadcrumbIfScopeChanged();
        }
        if (mdWas) mdAutosaveTargetPath = toPath;
        recordRenameUndo([{ from: fp, to: toPath }], 'rename');
        setStatusMain('Renamed.');
        void refreshAfterDiskMutation({ paths: [fp, toPath] });
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
      const paths = getCheckedPathsArr();
      const status = document.getElementById('statusMain');
      const hint = document.getElementById('bulkRenameTargetHint');
      const fb = document.getElementById('bulkRenameFeedback');
      const findEl = document.getElementById('bulkRenameFind');
      const replEl = document.getElementById('bulkRenameReplace');
      if (!hint || !document.getElementById('bulkRenameModal')) return;
      if (!paths.length) {
        if (status) setStatusMain('Check one or more rows to rename.');
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
      const paths = bulkRenameTargetPaths.length ? bulkRenameTargetPaths : getCheckedPathsArr();
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
      const rootPrefix = T.normalizeRootPrefix(getSearchScopeMaxFolderNorm() || document.getElementById('rootFolder').value);
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
        const st = document.getElementById('statusMain');
        if (pathPairs.length) {
          recordRenameUndo(pathPairs, 'bulk rename of ' + pathPairs.length + ' item(s)');
          if (st) setStatusMain('Renamed ' + pathPairs.length + ' item(s).');
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
      const status = document.getElementById('statusMain');
      let parent =
        parentOverride != null && String(parentOverride).trim()
          ? normalizeFolderPathForEverything(String(parentOverride).trim())
          : currentScopeFolderPath();
      if (!parent) {
        setStatusMain('Set the current folder (Settings or breadcrumb) first.');
        return;
      }
      if (!(parentOverride != null && String(parentOverride).trim())) {
        parent = await chooseTargetFolderFromCheckedRows(parent);
        if (!parent) {
          setStatusMain('Create folder cancelled.');
          return;
        }
      }
      const raw = await promptNewFolderNameModal();
      if (raw === null) return;
      if (!window.tagBrowser.createEmptyFolder) {
        setStatusMain('Create folder is not available.');
        return;
      }
      const rootPrefix = rootPrefixValue();
      const r = await window.tagBrowser.createEmptyFolder({ parentFolder: parent, nameSegment: raw, rootPrefix });
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Could not create folder');
      else {
        if (r.path) recordCreatedPathsUndo([r.path], 'new folder');
        setStatusMain('Created folder: ' + T.baseName(String(r.path || '')));
        void refreshAfterDiskMutation();
      }
    }

    /** Shared: new TODO .md under folderNorm using newTodoMdTags + optional empty-folder message. */
    async function createTodoMdAt(folderNorm, titleRaw, opts) {
      const status = document.getElementById('statusMain');
      const folder = normalizeFolderPathForEverything(String(folderNorm || '').trim());
      if (!folder) {
        setStatusMain((opts && opts.errNoFolder) || 'Set the current folder (Settings or breadcrumb) first.');
        return false;
      }
      const raw = String(titleRaw || '').trim();
      if (!raw) {
        setStatusMain('Type a title.');
        return false;
      }
      const safe = sanitizeFileTitleSegment(raw);
      const baseName = T.buildTaggedComponent(safe + '.md', newTodoMdTags);
      const fullPath = joinFolderAndFileName(folder, baseName);
      const probe = await window.tagBrowser.readTextFile({ fullPath });
      if (probe.ok) {
        setStatusMain('File already exists: ' + baseName);
        return false;
      }
      const extraBody = String((opts && opts.bodyText) || '');
      const body = extraBody.trim()
        ? '# ' + safe + '\n\n' + extraBody.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n'
        : '# ' + safe + '\n\n';
      const r = await window.tagBrowser.writeTextFile({ fullPath, text: body });
      if (!r.ok) {
        setStatusMain(r.error || 'Could not create file');
        return false;
      }
      setStatusMain('Created ' + baseName);
      if (!opts.skipRefreshAfterMutation) void refreshAfterDiskMutation();
      return fullPath;
    }

    /** Set while the Quick TODO box was opened for one folder (the Viewer's New TODO, /New TODO), not the
        Quick TODO folder from Settings that the global shortcut uses. */
    let quickTodoTargetFolder = '';

    function hideQuickTodoPop() {
      const el = document.getElementById('quickTodoPop');
      if (el) el.classList.add('d-none');
      quickTodoTargetFolder = '';
      hideQuickTodoTagsPanel();
      hideQuickTodoBodyPanel();
    }

    /** The Quick TODO box; with a folder, it creates the file there instead of in the Quick TODO folder. */
    function showQuickTodoPop(folder) {
      const el = document.getElementById('quickTodoPop');
      if (!el) return;
      quickTodoTargetFolder = String(folder || '').trim();
      const label = document.getElementById('quickTodoPopLabel');
      if (label) {
        label.textContent = quickTodoTargetFolder
          ? 'New TODO in ' + segmentPretty(T.baseName(quickTodoTargetFolder.replace(/[/\\]+$/, '')))
          : 'Quick TODO';
        label.title = quickTodoTargetFolder || 'Goes in the Quick TODO folder set in Settings';
      }
      el.classList.remove('d-none');
      hideQuickTodoTagsPanel();
      hideQuickTodoBodyPanel();
      renderQuickTodoTagsPanel();
      syncQuickTodoBodyToggleButton();
      pullWebContentsKeyboardFocus();
      requestAnimationFrame(() => {
        const inp = document.getElementById('quickTodoTitleInput');
        if (inp) {
          inp.focus();
          inp.select();
        }
      });
      const loadSw = document.getElementById('quickTodoLoadAfterCreate');
      if (loadSw) loadSw.checked = false;
    }

    async function createQuickTodoFromPop() {
      const hid = document.getElementById('quickTodoFolder');
      const folder = quickTodoTargetFolder || (hid ? hid.value.trim() : '');
      const ti = document.getElementById('quickTodoTitleInput');
      const bodyInp = document.getElementById('quickTodoBodyInput');
      const raw = ti ? ti.value : '';
      const bodyText = bodyInp ? bodyInp.value : '';
      const loadAfter = !!document.getElementById('quickTodoLoadAfterCreate')?.checked;
      const created = await createTodoMdAt(folder, raw, {
        bodyText,
        errNoFolder: 'Set Quick TODO folder in Settings first.',
        skipRefreshAfterMutation: loadAfter,
      });
      if (created) {
        if (ti) ti.value = '';
        if (bodyInp) bodyInp.value = '';
        hideQuickTodoPop();
        if (loadAfter) {
          await navigateTagFoxToShortcutTarget(created, false);
          void refreshAfterDiskMutation();
        }
      }
    }

    /** The Viewer's one message for loading, errors and kinds it cannot show. `withOpen` adds Open and
        Show in folder, for when the message is all there is to see. */
    function showPropsPlaceholder(text, opts) {
      const wrap = document.getElementById('propPlaceholderWrap');
      const p = document.getElementById('propPlaceholder');
      const acts = document.getElementById('propPlaceholderActions');
      const withOpen = !!(opts && opts.withOpen);
      if (p) p.textContent = String(text || '');
      acts?.classList.toggle('d-none', !withOpen);
      wrap?.classList.toggle('tagfox-viewer-placeholder--final', withOpen);
      wrap?.classList.remove('d-none');
    }
    function hidePropsPlaceholder() {
      document.getElementById('propPlaceholderWrap')?.classList.add('d-none');
      document.getElementById('propPlaceholderActions')?.classList.add('d-none');
    }

    /** Under the name: the size (files only) and the modified time, as the list shows them; the full time in the tooltip. */
    function setViewerMetaLine(row, fp) {
      const line = document.getElementById('propsMetaLine');
      const facts = document.getElementById('propsMetaFacts');
      if (!line || !facts) return;
      const bits = [];
      if (row && !rowIsFolder(row)) {
        const sp = runnerSizeParts(rowSizeBytes(row));
        if (sp) bits.push(sp.num + ' ' + sp.unit);
      }
      const ms = row ? modifiedTimeMs(row) : null;
      if (ms) bits.push('modified ' + formatModifiedShort(ms).replace(/^Yesterday$/, 'yesterday'));
      facts.textContent = bits.join(' · ');
      facts.title = ms ? 'Modified ' + formatModified(row.date_modified ?? row.date_modified_unix) : '';
      line.classList.toggle('d-none', !fp);
    }

    /** The foot line for whatever the Viewer is showing now, read from which block is visible. */
    function syncPropsFootHint() {
      const shown = (id) => {
        const el = document.getElementById(id);
        return !!(el && !el.classList.contains('d-none'));
      };
      if (!shown('propsDetails')) return setPropsFootHint('');
      const theater = isPropsTheaterOn();
      const big = theater ? 'Shift+Space or Esc closes the full screen view' : 'Shift+Space full screen';
      const parts = [];
      if (shown('mdFileBlock')) {
        parts.push(shown('mdFileEditorWrap') ? 'It saves as you type' : 'Double-click the text to edit');
      } else if (shown('readmeBlock')) {
        if (globalNestedReadmeView) parts.push('Each doc has its own Edit');
        else if (shown('readmeEditorWrap')) parts.push('Ctrl+Enter saves');
        else if (shown('readmeDocSplit')) parts.push('Double-click the text to edit');
      } else if (shown('pdfBlock')) {
        parts.push('Ctrl+wheel zooms');
      } else if (shown('htmlBlock')) {
        parts.push('Scripts and forms are off in this preview');
      } else if (shown('folderThumbsBlock')) {
        parts.push('Click a thumbnail to open it');
      } else if (!shown('imageBlock') && !shown('videoBlock') && !shown('officeBlock') && !shown('textFileBlock')) {
        return setPropsFootHint('');
      }
      parts.push(big);
      setPropsFootHint(parts.join(' · '));
    }

    /** One muted line at the foot of the Viewer: what can be done with what is shown. Empty hides it. */
    function setPropsFootHint(text) {
      const el = document.getElementById('propsFootHint');
      if (!el) return;
      el.textContent = String(text || '');
      el.classList.toggle('d-none', !text);
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
      const htmlBlock = document.getElementById('htmlBlock');
      const officeBlock = document.getElementById('officeBlock');
      const imageBlock = document.getElementById('imageBlock');
      const videoBlock = document.getElementById('videoBlock');
      const audioBlock = document.getElementById('audioBlock');
      if (pdfBlock) pdfBlock.classList.add('d-none');
      document.getElementById('btnPdfRefresh')?.classList.add('d-none');
      if (htmlBlock) htmlBlock.classList.add('d-none');
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
      document.getElementById('propsAside')?.classList.add('tagfox-viewer--empty');
      hidePropsPlaceholder();
      setPropsFootHint('');
      const dn = document.getElementById('propDisplayName');
      if (dn) dn.textContent = '';
      setRunnerViewerPath('');
      setViewerMetaLine(null, '');
      const tt = document.getElementById('propTitleTags');
      if (tt) { tt.innerHTML = ''; tt.classList.add('d-none'); tt.classList.remove('d-flex'); }
      const iconMount = document.getElementById('propTitleIconMount');
      if (iconMount) iconMount.innerHTML = '';
      const readmeStem = document.getElementById('readmeFolderDocStemInput');
      const readmeExt = document.getElementById('readmeFolderDocExt');
      if (readmeStem) readmeStem.value = DEFAULT_FOLDER_DOC_STEM;
      if (readmeExt) readmeExt.textContent = '.md';
      folderDocMdTags = [];
      syncFolderDocTagPillsDisplay();
      syncFolderDocHeaderExists(false);
      folderDocViewerOverridePath = null;
      folderDocHeaderLastSyncedKey = '';
      activeReadmePath = null;
      readmeSaveTargetVerifiedOnDisk = false;
      lastReadmeFolderPathLoose = '';
      globalNestedReadmeView = false;
      folderThumbsView = false;
      folderThumbsRenderedSig = '';
      document.getElementById('folderThumbsBlock')?.classList.add('d-none');
      document.getElementById('propsNestedReadmeToggleWrap')?.classList.add('d-none');
      activeMdPath = null;
      detachNestedReadmePreviewHandler();
      resetViewerDocEditorChrome();
      syncViewerCopyButton();
      syncReadmeNestedDocsUi();
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
        /**
         * path=parent, name=leaf (path-grouping ghost rows). Without this flag, fullPathForRow’s “name already in path”
         * shortcut treats e.g. parent …\subb + name subb as complete → wrong path …\subb instead of …\subb\subb (nested subb\subb\sub in logs).
         */
        __pathGroupingSynthetic: true,
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
      if (hitsOpenPath(activeReadmePath)) {
        activeReadmePath = null;
        readmeSaveTargetVerifiedOnDisk = false;
      }
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
        if (!r.ok && r.code === 'ENOENT' && readmeSaveTargetVerifiedOnDisk) {
          activeReadmePath = null;
          readmeSaveTargetVerifiedOnDisk = false;
        }
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
        const aggKey = readmeAggregateRootFolderFromSelection(pathForSig, row);
        const aggK = aggKey ? pathKeyLoose(aggKey) : '';
        const needFolderDocResync =
          (rowIsFolder(row) && (!lastReadmeFolderPathLoose || kSel !== lastReadmeFolderPathLoose)) ||
          ((globalNestedReadmeView || folderThumbsView) &&
            isGlobalViewerMarkdownFilePath(pathForSig) &&
            (!lastReadmeFolderPathLoose || aggK !== lastReadmeFolderPathLoose)) ||
          /* Thumbs grid mirrors the search filters, so any completed search re-queries it (sig check
             inside loadFolderThumbnails keeps the DOM/scroll when nothing actually changed). */
          (folderThumbsView && !!aggK);
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
        void refreshPropsPanelHeavy().then(syncPropsFootHint);
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

      const propPath = propsTargetPath();
      const propRow = propsTargetRowForDisplay();
      if (!propPath || !propRow) {
        clearPropsUI();
        return;
      }

      revokePreviewBlobs();
      empty.classList.add('d-none');
      details.classList.remove('d-none');
      document.getElementById('propsAside')?.classList.remove('tagfox-viewer--empty');
      const isFolder = rowIsFolder(propRow);
      const nestReadmeToggle = document.getElementById('propsNestedReadmeToggleWrap');
      const showNestReadmeToggle = isFolder || isGlobalViewerMarkdownFilePath(propPath);
      if (nestReadmeToggle) nestReadmeToggle.classList.toggle('d-none', !showNestReadmeToggle);
      if (showNestReadmeToggle) syncGlobalViewerBasenamesInputFromStorage();
      const kReadmeQuick = readmeBlockQuickVisibleFolderKey(propPath, propRow);
      const isSameFolderReadme =
        !!kReadmeQuick &&
        !!lastReadmeFolderPathLoose &&
        kReadmeQuick === lastReadmeFolderPathLoose &&
        !readmeBlock.classList.contains('d-none');
      if (!isSameFolderReadme) readmeBlock.classList.add('d-none');
      const thumbsBlockQuick = document.getElementById('folderThumbsBlock');
      const isSameFolderThumbs =
        folderThumbsView &&
        !!kReadmeQuick &&
        !!lastReadmeFolderPathLoose &&
        kReadmeQuick === lastReadmeFolderPathLoose &&
        !!thumbsBlockQuick &&
        !thumbsBlockQuick.classList.contains('d-none');
      if (!isSameFolderThumbs && thumbsBlockQuick) thumbsBlockQuick.classList.add('d-none');
      mdFileBlock.classList.add('d-none');
      if (gdocWorkspaceBlock) gdocWorkspaceBlock.classList.add('d-none');
      if (pdfBlock) pdfBlock.classList.add('d-none');
      document.getElementById('btnPdfRefresh')?.classList.add('d-none');
      const htmlBlockQuick = document.getElementById('htmlBlock');
      if (htmlBlockQuick) htmlBlockQuick.classList.add('d-none');
      if (officeBlock) officeBlock.classList.add('d-none');
      if (imageBlock) imageBlock.classList.add('d-none');
      if (videoBlock) videoBlock.classList.add('d-none');
      if (audioBlock) audioBlock.classList.add('d-none');
      if (textFileBlock) textFileBlock.classList.add('d-none');
      if (isSameFolderReadme || isSameFolderThumbs) hidePropsPlaceholder();
      else showPropsPlaceholder('Loading preview…');
      setPropsFootHint('');

      const base = T.baseName(propPath);
      const parsedTitle = T.parseSegmentTags(base);
      let displayName = parsedTitle.pretty;
      if (rowIsFolder(propRow)) {
        const gdPretty = prettyGDriveShortcutIdFolderBasename(propPath, () => {
          if (propsViewStill(propPath)) refreshPropsPanelQuick();
        });
        if (gdPretty) displayName = gdPretty;
      }
      document.getElementById('propDisplayName').textContent = displayName;
      setRunnerViewerPath(propPath);
      setViewerMetaLine(propRow, propPath);
      const tagBand = document.getElementById('propTitleTags');
      tagBand.innerHTML = '';
      for (const tag of parsedTitle.tags) appendTagPillWithRemove(tagBand, tag, propPath);
      const hasTitleTags = tagBand.children.length > 0; // collapse the band when there are no tags
      tagBand.classList.toggle('d-none', !hasTitleTags);
      tagBand.classList.toggle('d-flex', hasTitleTags);
      const iconMount = document.getElementById('propTitleIconMount');
      if (iconMount) {
        iconMount.innerHTML = '';
        if (isFolder) iconMount.appendChild(folderIconEl());
        else iconMount.appendChild(fileIconEl(fileExtFromPretty(parsedTitle.pretty)));
      }
      syncViewerCopyButton();
    }

    /** Full preview load; drop results if selection moved (rapid ↑/↓). */
    async function refreshPropsPanelHeavy() {
      const targetFp = propsTargetPath();
      const targetRow = propsTargetRowForDisplay();
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
      const editableTextKind = !rowIsFolder(targetRow) ? editableTextKindForBase(base) : null;

      hidePropsPlaceholder();

      if (rowIsFolder(targetRow)) {
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        await loadReadmeForFolder(targetFp, targetFp);
        return;
      }

      if (isGlobalViewerMarkdownFilePath(targetFp) && (globalNestedReadmeView || folderThumbsView)) {
        const par = T.parentDir(targetFp);
        if (!par) {
          activeReadmePath = null;
          activeMdPath = null;
          mdAutosaveTargetPath = null;
          showPropsPlaceholder('This doc has no parent folder.');
          return;
        }
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        mdFileBlock.classList.add('d-none');
        await loadReadmeForFolder(String(par).replace(/[/\\]+$/, ''), targetFp);
        return;
      }

      if (editableTextKind) {
        activeReadmePath = null;
        mdFileBlock.classList.remove('d-none');
        const mdWrap = document.getElementById('mdFileEditorWrap');
        /* Poll/search refresh changes mtime → full heavy run used to reset UI; keep editing session if same file + editor open. */
        const sameMdEditing =
          mdWrap &&
          !mdWrap.classList.contains('d-none') &&
          activeMdPath &&
          propsPathKey(activeMdPath) === propsPathKey(targetFp);
        if (sameMdEditing) {
          document.getElementById('mdFilePreview').innerHTML = editableTextPreviewHtml(
            getViewerMdValue('mdFile'),
            mdAutosaveTargetPath || activeMdPath
          );
          syncViewerCopyButton();
          return;
        }
        mdAutosaveTargetPath = null;
        mdAutosaveLoadedText = null;
        const rTxt = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (rTxt.ok) {
          setViewerMdValue('mdFile', rTxt.text);
          mdAutosaveTargetPath = targetFp;
          mdAutosaveLoadedText = rTxt.text;
        } else {
          setViewerMdValue('mdFile', '/* read error: ' + (rTxt.error || '') + ' */');
        }
        activeMdPath = mdAutosaveTargetPath ? targetFp : null;
        document.getElementById('mdFilePreview').innerHTML = editableTextPreviewHtml(
          getViewerMdValue('mdFile'),
          mdAutosaveTargetPath
        );
        resetViewerDocEditorChrome();
        syncViewerCopyButton();
        return;
      }

      if (GOOGLE_SHORTCUT_EXT.has(ext) && window.tagBrowser.googleWorkspaceShortcutUrl) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        if (!gdocWorkspaceBlock) {
          showPropsPlaceholder('Google shortcut UI missing.');
          return;
        }
        gdocWorkspaceBlock.classList.remove('d-none');
        const kindName = ext === 'gsheet' ? 'Google Sheet' : ext === 'gslides' ? 'Google Slides deck' : 'Google Doc';
        const icon = document.getElementById('gdocWorkspaceIcon');
        if (icon) icon.className = 'fa-solid ' + (ext === 'gsheet' ? 'fa-table' : ext === 'gslides' ? 'fa-display' : 'fa-file-lines');
        const urlEl = document.getElementById('gdocWorkspaceUrl');
        const btnGw = document.getElementById('btnOpenGoogleWorkspace');
        const btnBrowser = document.getElementById('btnGdocOpenBrowser');
        const linksWrap = document.getElementById('gdocWorkspaceDriveLinks');
        const btnGdocSearch = document.getElementById('btnGdocDriveSearch');
        const btnGdocFolder = document.getElementById('btnGdocDriveFolder');
        urlEl.textContent = 'A shortcut to a ' + kindName + '.';
        urlEl.title = '';
        const rGw = await window.tagBrowser.googleWorkspaceShortcutUrl({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!urlEl || !btnGw) return;
        if (!rGw.ok) {
          urlEl.textContent =
            rGw.code === 'ENOENT'
              ? 'This shortcut file is not on disk any more.'
              : 'TagFox could not read where this shortcut points, so it cannot open the ' + kindName + ' here. Look for it in Drive instead.';
          btnGw.classList.add('d-none');
          delete btnGw.dataset.url;
          btnBrowser?.classList.add('d-none');
          if (btnBrowser) delete btnBrowser.dataset.url;
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
          urlEl.textContent = 'A shortcut to a ' + kindName + '. It opens in a TagFox window, where you sign in to Google once.';
          urlEl.title = rGw.url;
          btnGw.classList.remove('d-none');
          btnGw.dataset.url = rGw.url;
          if (btnBrowser) {
            btnBrowser.classList.toggle('d-none', !window.tagBrowser.openUrlDefaultBrowser);
            btnBrowser.dataset.url = rGw.url;
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
          showPropsPlaceholder('Could not show this picture. ' + (rSvg.error || ''), { withOpen: true });
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
          showPropsPlaceholder('Could not show this picture. ' + (rImg.error || ''), { withOpen: true });
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

      if ((ext === 'html' || ext === 'htm') && window.tagBrowser.readTextFile) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const htmlBlock = document.getElementById('htmlBlock');
        const htmlPreviewFrame = document.getElementById('htmlPreviewFrame');
        const sz = rowSizeBytes(targetRow);
        if (sz != null && sz > TEXT_PREVIEW_MAX_BYTES) {
          showPropsPlaceholder('Too large to preview here (over 2 MB).', { withOpen: true });
          return;
        }
        const rHtml = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!htmlBlock || !htmlPreviewFrame) {
          showPropsPlaceholder('HTML preview UI missing.');
          return;
        }
        if (!rHtml.ok) {
          showPropsPlaceholder('Could not show this page. ' + (rHtml.error || ''), { withOpen: true });
          return;
        }
        htmlBlock.classList.remove('d-none');
        let doc = String(rHtml.text ?? '');
        if (doc.length > TEXT_PREVIEW_MAX_CHARS) {
          doc = doc.slice(0, TEXT_PREVIEW_MAX_CHARS) + '\n<!-- … preview truncated -->';
        }
        htmlPreviewFrame.removeAttribute('src');
        htmlPreviewFrame.srcdoc = doc;
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
          document.getElementById('btnPdfRefresh')?.classList.remove('d-none');
          setPdfFrameSrc(base64ToBlobUrl(r.base64, 'application/pdf'));
        } else {
          showPropsPlaceholder('Could not show this PDF. ' + (r.error || ''), { withOpen: true });
        }
        return;
      }

      if ((ext === 'docx' || ext === 'doc' || ext === 'odt') && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        if (ext === 'doc') {
          showPropsPlaceholder('TagFox shows .docx but not the older .doc. Open it in Word.', { withOpen: true });
          return;
        }
        officeBlock.classList.remove('d-none');
        const prev = document.getElementById('officePreview');
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!r.ok) {
          showPropsPlaceholder('Could not show this file. ' + (r.error || ''), { withOpen: true });
          officeBlock.classList.add('d-none');
          return;
        }
        const ab = base64ToArrayBuffer(r.base64);
        if (ext === 'odt') {
          try {
            const html = await odtArrayBufferToPreviewHtml(ab);
            if (!propsViewStill(targetFp)) return;
            prev.innerHTML = html;
          } catch (e) {
            if (!propsViewStill(targetFp)) return;
            prev.innerHTML = '<p class="text-danger small">' + escapeHtmlForPreview(String(e.message || e)) + '</p>';
          }
          return;
        }
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
        const prev = document.getElementById('officePreview');
        prev.innerHTML = '<p class="text-muted small mb-0">Loading…</p>';
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp, maxBytes: SPREADSHEET_PREVIEW_MAX_BYTES });
        if (!propsViewStill(targetFp)) return;
        if (!r.ok) {
          showPropsPlaceholder('Could not show this file. ' + (r.error || ''), { withOpen: true });
          officeBlock.classList.add('d-none');
          return;
        }
        if (ext === 'ods') {
          try {
            const html = await odsArrayBufferToPreviewHtml(base64ToArrayBuffer(r.base64));
            if (!propsViewStill(targetFp)) return;
            prev.innerHTML = html;
          } catch (e) {
            if (!propsViewStill(targetFp)) return;
            prev.innerHTML = '<p class="text-danger small">' + escapeHtmlForPreview(String(e.message || e)) + '</p>';
          }
          return;
        }
        if (typeof XLSX === 'undefined' || !XLSX.read) {
          prev.innerHTML = '<p class="text-danger small">SheetJS failed to load.</p>';
          return;
        }
        try {
          // Let the Loading… text paint before the synchronous parse.
          await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
          if (!propsViewStill(targetFp)) return;
          // Parse only the first sheet and first N rows; a full parse of a large workbook freezes the UI thread.
          const wb = XLSX.read(new Uint8Array(base64ToArrayBuffer(r.base64)), {
            type: 'array',
            sheets: 0,
            sheetRows: EXCEL_PREVIEW_MAX_ROWS,
          });
          const sn = wb.SheetNames[0];
          if (!propsViewStill(targetFp)) return;
          const ws = wb.Sheets[sn];
          let tableHtml = '';
          let noteHtml = '';
          if (ws['!ref']) {
            const full = XLSX.utils.decode_range(ws['!ref']);
            // sheetRows truncates !ref; the untruncated range survives in !fullref.
            const fullAll = ws['!fullref'] ? XLSX.utils.decode_range(ws['!fullref']) : full;
            const totalRows = fullAll.e.r - fullAll.s.r + 1;
            const totalCols = full.e.c - full.s.c + 1;
            const endRow = Math.min(full.e.r, full.s.r + EXCEL_PREVIEW_MAX_ROWS - 1);
            const endCol = Math.min(full.e.c, full.s.c + EXCEL_PREVIEW_MAX_COLS - 1);
            const limitedRange = { s: full.s, e: { r: endRow, c: endCol } };
            // First N rows of used range only — “first N non-empty rows” would mean scanning far more of the grid (often the whole sheet).
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, range: limitedRange });
            tableHtml = XLSX.utils.sheet_to_html(XLSX.utils.aoa_to_sheet(rows));
            // Files with no dimension record give no !fullref, so a sheet that fills the row cap counts as truncated.
            const rowsCapped = totalRows > EXCEL_PREVIEW_MAX_ROWS || (!ws['!fullref'] && totalRows >= EXCEL_PREVIEW_MAX_ROWS);
            const colsCapped = totalCols > EXCEL_PREVIEW_MAX_COLS;
            if (rowsCapped || colsCapped) {
              const bits = [];
              if (rowsCapped) bits.push('first ' + EXCEL_PREVIEW_MAX_ROWS + ' rows');
              if (colsCapped) bits.push('first ' + EXCEL_PREVIEW_MAX_COLS + ' of ' + totalCols + ' columns');
              noteHtml = '<p class="text-muted small mb-0 mt-2">Preview: ' + bits.join(', ') + '.</p>';
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
        const prev = document.getElementById('officePreview');
        prev.innerHTML = '<p class="text-muted small mb-0">Loading…</p>';
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!r.ok) {
          showPropsPlaceholder('Could not show this file. ' + (r.error || ''), { withOpen: true });
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
        showPropsPlaceholder('TagFox shows .pptx but not the older .ppt. Open it in PowerPoint.', { withOpen: true });
        return;
      }

      if (ext === 'odp' && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        const prev = document.getElementById('officePreview');
        prev.innerHTML = '<p class="text-muted small mb-0">Loading…</p>';
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!r.ok) {
          showPropsPlaceholder('Could not show this file. ' + (r.error || ''), { withOpen: true });
          officeBlock.classList.add('d-none');
          return;
        }
        try {
          const html = await odpArrayBufferToPreviewHtml(base64ToArrayBuffer(r.base64));
          if (!propsViewStill(targetFp)) return;
          prev.innerHTML = html;
        } catch (e) {
          if (!propsViewStill(targetFp)) return;
          prev.innerHTML = '<p class="text-danger small">' + escapeHtmlForPreview(String(e.message || e)) + '</p>';
        }
        return;
      }

      if (ext === 'msg' && window.tagBrowser.readMsgPreview && textFileBlock) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const sz = rowSizeBytes(targetRow);
        if (sz != null && sz > 50 * 1024 * 1024) {
          showPropsPlaceholder('Too large to preview here (over 50 MB).', { withOpen: true });
          return;
        }
        const rMsg = await window.tagBrowser.readMsgPreview({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!rMsg.ok) {
          showPropsPlaceholder('Could not show this email. ' + (rMsg.error || ''), { withOpen: true });
          return;
        }
        textFileBlock.classList.remove('d-none');
        let body = String(rMsg.text ?? '');
        if (body.length > TEXT_PREVIEW_MAX_CHARS) {
          body = body.slice(0, TEXT_PREVIEW_MAX_CHARS) + '\n\n… [truncated for preview]';
        }
        document.getElementById('textPreviewPre').textContent = body;
        syncViewerCopyButton();
        return;
      }

      if (ext === 'csv' && window.tagBrowser.readTextFile && officeBlock) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const sz = rowSizeBytes(targetRow);
        if (sz != null && sz > TEXT_PREVIEW_MAX_BYTES) {
          showPropsPlaceholder('Too large to preview here (over 2 MB).', { withOpen: true });
          return;
        }
        const rCsv = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!rCsv.ok) {
          showPropsPlaceholder('Could not show this file. ' + (rCsv.error || ''), { withOpen: true });
          return;
        }
        officeBlock.classList.remove('d-none');
        const prev = document.getElementById('officePreview');
        try {
          const rows = parseCsvRows(rCsv.text);
          prev.innerHTML = csvPreviewTableHtml(rows, EXCEL_PREVIEW_MAX_ROWS);
        } catch (e) {
          prev.innerHTML = '<p class="text-danger small">' + escapeHtmlForPreview(String(e.message || e)) + '</p>';
        }
        return;
      }

      activeReadmePath = null;
      activeMdPath = null;
      mdAutosaveTargetPath = null;
      showPropsPlaceholder(
        'TagFox cannot show ' + (ext ? '.' + ext + ' files' : 'this kind of file') + '. Open it in the program Windows uses for it.',
        { withOpen: true }
      );
    }

    /** Immediate metadata + non-debounced heavy load (e.g. after search sync). */
    async function refreshPropsPanel() {
      cancelPropsPreviewSchedule();
      refreshPropsPanelQuick();
      await refreshPropsPanelHeavy();
      syncPropsFootHint();
    }

    /** Viewer header copy: reuse the visible text source for readme, md/txt, and plain text previews. */
    function currentViewerCopyText() {
      const readmeBlock = document.getElementById('readmeBlock');
      const mdFileBlock = document.getElementById('mdFileBlock');
      const textFileBlock = document.getElementById('textFileBlock');
      if (readmeBlock && !readmeBlock.classList.contains('d-none')) {
        if (globalNestedReadmeView) return (document.getElementById('readmePreview')?.textContent || '').trim();
        return getViewerMdValue('readme').trim();
      }
      if (mdFileBlock && !mdFileBlock.classList.contains('d-none')) {
        return getViewerMdValue('mdFile').trim();
      }
      if (textFileBlock && !textFileBlock.classList.contains('d-none')) {
        return (document.getElementById('textPreviewPre')?.textContent || '').trim();
      }
      return '';
    }

    /** Header refresh + edit buttons follow the text-file block (same header-only pattern as btnPdfRefresh). */
    function syncMdFileViewerButtons() {
      const block = document.getElementById('mdFileBlock');
      const details = document.getElementById('propsDetails');
      const visible =
        !!(block && !block.classList.contains('d-none')) &&
        !!(details && !details.classList.contains('d-none'));
      const refreshBtn = document.getElementById('btnMdFileRefresh');
      const editBtn = document.getElementById('btnMdFileEdit');
      if (refreshBtn) {
        refreshBtn.classList.toggle('d-none', !visible);
        refreshBtn.disabled = !visible || !propsTargetPath();
      }
      if (editBtn) editBtn.classList.toggle('d-none', !visible);
    }

    function syncViewerCopyButton() {
      const btn = document.getElementById('btnPropsCopyText');
      const text = currentViewerCopyText();
      if (btn) {
        btn.classList.toggle('d-none', !text);
        btn.disabled = !text;
      }
      syncMdFileViewerButtons();
    }

    async function refreshMdFileViewerFromDisk() {
      const targetPath = propsTargetPath();
      if (!targetPath) return;
      await flushMdFileAutosave();
      activeMdPath = null;
      mdAutosaveTargetPath = null;
      await refreshPropsPanel();
      setStatusMain('Refreshed file text.');
    }

    async function refreshPdfViewerFromDisk() {
      const targetPath = propsTargetPath();
      if (!targetPath) return;
      await refreshPropsPanel();
      setStatusMain('Refreshed PDF output.');
    }

    /** Folder readme RHS: pale orange when non-empty; optional one-shot pulse after load. */
    function syncReadmePreviewChrome(opts) {
      const pulse = !!(opts && opts.pulse);
      const prev = document.getElementById('readmePreview');
      let filled;
      if (opts && Object.prototype.hasOwnProperty.call(opts, 'filled')) {
        filled = !!opts.filled;
      } else if (globalNestedReadmeView) {
        const root = prev && prev.querySelector('.global-readme-root');
        if (root) {
          filled = Array.from(root.querySelectorAll('.global-readme-section-body')).some((el) =>
            (el.textContent || '').trim()
          );
        } else {
          filled = false;
        }
      } else {
        filled = getViewerMdValue('readme').trim().length > 0;
      }
      if (!pulse) prev.classList.remove('readme-preview--pulse');
      prev.classList.toggle('readme-preview--filled', filled);
      syncFolderDocChrome();
      syncViewerCopyButton();
      if (!pulse || !filled) return;
      prev.classList.remove('readme-preview--pulse');
      void prev.offsetWidth;
      prev.classList.add('readme-preview--pulse');
      prev.addEventListener('animationend', () => prev.classList.remove('readme-preview--pulse'), { once: true });
    }

    /** The Edit pill of the folder doc or the text file. Open, the folder doc's becomes Save (it writes only
        then) beside Cancel; the text file's becomes Done, since it saves as you type. */
    function setViewerEditButton(which, open) {
      const b = document.getElementById(which === 'readme' ? 'btnReadmeEdit' : 'btnMdFileEdit');
      if (!b) return;
      const on = !!open;
      b.setAttribute('aria-expanded', on ? 'true' : 'false');
      let icon = 'fa-pen';
      let label = 'Edit';
      if (which === 'readme') {
        if (on) {
          icon = 'fa-floppy-disk';
          label = 'Save';
        }
        b.title = on ? 'Save the folder doc and close the editor (Ctrl+Enter)' : 'Edit the folder doc (or double-click its text)';
        document.getElementById('btnReadmeCancel')?.classList.toggle('d-none', !on);
      } else {
        if (on) {
          icon = 'fa-check';
          label = 'Done';
        }
        b.title = on ? 'Close the editor (it saves as you type)' : 'Edit the file (or double-click its text)';
        if (!on) setViewerSaveState('');
      }
      b.classList.toggle('tagfox-viewer-pill--solid', on);
      b.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i><span>' + label + '</span>';
    }

    /** Beside Done while a text file is being edited: what the last autosave did, from its own result. */
    function setViewerSaveState(kind) {
      const el = document.getElementById('propsSaveState');
      if (!el) return;
      const text = { saved: 'Saved', failed: 'Not saved', refused: 'Not saved: changed on disk' }[kind] || '';
      el.textContent = text;
      el.classList.toggle('d-none', !text);
      el.classList.toggle('tagfox-viewer-save-state--bad', kind === 'failed' || kind === 'refused');
    }

    /** Folder doc + text-file viewer: editor hidden until Edit or double-click preview (same chrome for both). */
    function resetViewerDocEditorChrome() {
      for (const which of ['readme', 'mdFile']) {
        const wrapId = which === 'readme' ? 'readmeEditorWrap' : 'mdFileEditorWrap';
        const dividerId = which === 'readme' ? 'readmeEditorDivider' : 'mdFileEditorDivider';
        document.getElementById(wrapId)?.classList.add('d-none');
        document.getElementById(dividerId)?.classList.add('d-none');
        setViewerEditButton(which, false);
      }
      syncFolderDocChrome();
      refreshTagFoxChromeTooltips(document.getElementById('propsChromeStack') || document.body);
    }

    function setViewerDocEditorOpen(which, open) {
      const wrapId = which === 'readme' ? 'readmeEditorWrap' : 'mdFileEditorWrap';
      const dividerId = which === 'readme' ? 'readmeEditorDivider' : 'mdFileEditorDivider';
      const prevId = which === 'readme' ? 'readmePreview' : 'mdFilePreview';
      const wrap = document.getElementById(wrapId);
      const divider = document.getElementById(dividerId);
      const prev = document.getElementById(prevId);
      if (!wrap || !prev) return;
      const show = !!open;
      if (show && which === 'readme' && globalNestedReadmeView) return;
      if (!show && which === 'mdFile') void flushMdFileAutosave();
      wrap.classList.toggle('d-none', !show);
      if (divider) divider.classList.toggle('d-none', !show);
      if (show) ensureViewerMdEditor(which);
      setViewerEditButton(which, show);
      if (which === 'readme') syncFolderDocChrome();
      syncPropsFootHint();
      refreshTagFoxChromeTooltips(document.getElementById('propsChromeStack') || document.body);
      if (!show) {
        if (!(which === 'readme' && globalNestedReadmeView)) {
          const p = which === 'readme' ? activeReadmePath : mdAutosaveTargetPath;
          prev.innerHTML =
            which === 'mdFile'
              ? editableTextPreviewHtml(getViewerMdValue(which), p)
              : mdPreviewHtml(getViewerMdValue(which), p ? { mdSourcePath: p } : undefined);
        }
        if (which === 'readme') syncReadmePreviewChrome({ pulse: false });
      }
      if (show) {
        requestAnimationFrame(() => {
          focusViewerMdEditor(which, true);
        });
      }
    }

    /** Opening the mdFile editor re-reads the file first. The buffer was filled when the file was
        previewed, which may have been hours ago, so typing into it without this is how an edit gets
        made against a version that no longer exists and then refused by the guard in the flush. */
    async function openMdFileEditorFresh() {
      if (mdFileEditorIsOpen()) {
        setViewerDocEditorOpen('mdFile', true);
        return;
      }
      const p = mdAutosaveTargetPath;
      if (p) {
        const disk = await window.tagBrowser.readTextFile({ fullPath: p });
        if (disk.ok && disk.text !== mdAutosaveLoadedText) {
          setViewerMdValue('mdFile', disk.text);
          mdAutosaveLoadedText = disk.text;
          const prev = document.getElementById('mdFilePreview');
          if (prev) prev.innerHTML = editableTextPreviewHtml(disk.text, p);
        }
      }
      setViewerDocEditorOpen('mdFile', true);
    }

    /** Folder doc: single control — Save writes to disk, closes editor, refreshes search. */
    async function closeReadmeEditorWithSave() {
      const status = document.getElementById('statusMain');
      if (!activeReadmePath) {
        if (status) setStatusMain('Folder doc not ready — select the folder again.');
        setViewerDocEditorOpen('readme', false);
        return;
      }
      const parent = T.parentDir(activeReadmePath);
      if (!parent) {
        if (status) setStatusMain('Folder doc path invalid.');
        return;
      }
      const targetPath = folderDocTargetPathFromUi(parent);
      const kFrom = pathKeyLoose(activeReadmePath);
      const kTo = pathKeyLoose(targetPath);
      let writePath = activeReadmePath;
      if (kFrom !== kTo) {
        const probeTo = await window.tagBrowser.readTextFile({ fullPath: targetPath });
        if (probeTo.ok) {
          if (status) setStatusMain('A file already exists: ' + T.baseName(targetPath));
          return;
        }
        /* New path only: keeps the previous folder doc file on disk (no rename). */
        writePath = targetPath;
      }
      const text = getViewerMdValue('readme');
      const r = await window.tagBrowser.writeTextFile({ fullPath: writePath, text });
      const label = segmentPretty(T.baseName(writePath));
      if (!r.ok) {
        if (status) setStatusMain(r.error || 'Save failed');
        return;
      }
      activeReadmePath = writePath;
      folderDocViewerOverridePath = writePath;
      readmeSaveTargetVerifiedOnDisk = true;
      syncFolderDocHeaderExists(true);
      if (status) setStatusMain(label + ' saved.');
      setViewerDocEditorOpen('readme', false);
      folderChildCountCache.clear();
      clearAndScheduleSearchRetries();
      void runSearchNow('refresh');
    }

    /** Folder doc cancel: discard in-editor changes and reload the current folder doc. */
    async function cancelReadmeEditor() {
      const folderPath = propsTargetPath();
      const row = propsTargetRowForDisplay();
      if (!folderPath || !row || !rowIsFolder(row)) {
        setViewerDocEditorOpen('readme', false);
        return;
      }
      folderDocViewerOverridePath = null;
      folderDocHeaderLastSyncedKey = '';
      activeReadmePath = null;
      readmeSaveTargetVerifiedOnDisk = false;
      await loadReadmeForFolder(String(folderPath).replace(/[/\\]+$/, ''), folderPath);
    }

    function toggleViewerDocEditor(which) {
      const wrapId = which === 'readme' ? 'readmeEditorWrap' : 'mdFileEditorWrap';
      const wrap = document.getElementById(wrapId);
      if (!wrap) return;
      const willOpen = wrap.classList.contains('d-none');
      if (which === 'readme' && !willOpen) {
        void closeReadmeEditorWithSave();
        return;
      }
      if (which === 'mdFile' && willOpen) {
        void openMdFileEditorFresh();
        return;
      }
      setViewerDocEditorOpen(which, willOpen);
    }

    /** Build folder doc path from Viewer stem / ext / folderDocMdTags (same rules as Add TODO basename). */
    function folderDocTargetPathFromUi(parentFolderNorm) {
      const stemInp = document.getElementById('readmeFolderDocStemInput');
      const extEl = document.getElementById('readmeFolderDocExt');
      const stem = sanitizeFileTitleSegment(stemInp ? stemInp.value : DEFAULT_FOLDER_DOC_STEM);
      let ext = String((extEl && extEl.textContent) || '.md').trim();
      if (!ext.startsWith('.')) ext = '.' + ext;
      const base = T.buildTaggedComponent(stem + ext, folderDocMdTags);
      return joinFolderAndFileName(parentFolderNorm, base);
    }

    /** Stem/tags now point at a different path than the file we loaded → empty draft (replaces old New/Default controls). */
    function folderDocOnFilenameUiChanged() {
      if (globalNestedReadmeView) return;
      const folderPath = propsTargetPath();
      const row = propsTargetRowForDisplay();
      if (!folderPath || !row || !rowIsFolder(row)) return;
      const norm = String(folderPath).replace(/[/\\]+$/, '');
      const uiPath = folderDocTargetPathFromUi(norm);
      const uiK = pathKeyLoose(uiPath);
      if (folderDocViewerOverridePath === FOLDER_DOC_OVERRIDE_NEW) return;
      const loadedK = pathKeyLoose(activeReadmePath || '');
      if (loadedK && uiK === loadedK) return;
      folderDocViewerOverridePath = FOLDER_DOC_OVERRIDE_NEW;
      folderDocHeaderLastSyncedKey = '';
      setViewerMdValue('readme', '');
      const prev = document.getElementById('readmePreview');
      if (prev) prev.innerHTML = mdPreviewHtml('');
      syncReadmePreviewChrome({ pulse: true });
      activeReadmePath = uiPath;
      readmeSaveTargetVerifiedOnDisk = false;
      resetViewerDocEditorChrome();
    }

    /** Read-only pills under folder doc filename (same colours as results tags; edit via tags button). */
    function syncFolderDocTagPillsDisplay() {
      const wrap = document.getElementById('readmeFolderDocTagPills');
      if (!wrap) return;
      wrap.innerHTML = '';
      for (const t of folderDocMdTags) {
        const b = document.createElement('span');
        b.className = 'badge rounded-pill';
        b.style.backgroundColor = tagColorCss(t);
        b.style.color = '#212529';
        b.textContent = t;
        wrap.appendChild(b);
      }
    }

    /** Doc found on disk → read-only name label; no doc yet → editable stem + tags (Save creates it). */
    function syncFolderDocHeaderExists(existsOnDisk) {
      const found = !!existsOnDisk;
      folderDocFoundOnDisk = found;
      const stemInp = document.getElementById('readmeFolderDocStemInput');
      const extEl = document.getElementById('readmeFolderDocExt');
      const nameEl = document.getElementById('readmeFolderDocNameLabel');
      if (nameEl) {
        const name =
          ((stemInp && stemInp.value) || DEFAULT_FOLDER_DOC_STEM) + ((extEl && extEl.textContent) || '.md');
        nameEl.textContent = name;
        nameEl.title = name;
        nameEl.classList.toggle('d-none', !found);
      }
      document.getElementById('readmeFolderDocNameField')?.classList.toggle('d-none', found);
      syncFolderDocChrome();
    }

    /** Which of the folder doc's two faces shows. No doc and nothing typed, with the editor shut: the empty
        state, holding the name field and Write it. Otherwise the bar (the doc's name, or the name field while a
        new one is written) over the editor and preview. The nested view has neither: each section has its own. */
    function syncFolderDocChrome() {
      const bar = document.getElementById('readmeFolderDocControlsWrap');
      const empty = document.getElementById('readmeEmptyState');
      const split = document.getElementById('readmeDocSplit');
      const field = document.getElementById('readmeFolderDocNameField');
      if (!bar || !empty || !split || !field) return;
      const editorOpen = !document.getElementById('readmeEditorWrap')?.classList.contains('d-none');
      const hasText = !!getViewerMdValue('readme').trim();
      const showEmpty = !globalNestedReadmeView && !folderDocFoundOnDisk && !editorOpen && !hasText;
      empty.classList.toggle('d-none', !showEmpty);
      bar.classList.toggle('d-none', globalNestedReadmeView || showEmpty);
      split.classList.toggle('d-none', showEmpty);
      const slot = document.getElementById(showEmpty ? 'readmeEmptyNameSlot' : 'readmeFolderDocNameSlot');
      if (slot && field.parentElement !== slot) slot.prepend(field);
      const names = document.getElementById('readmeEmptyNames');
      if (names && showEmpty) names.textContent = getGlobalViewerBasenamesList().join(', ');
      syncPropsFootHint();
    }

    /** Sync stem input, extension label, and folderDocMdTags from a resolved doc path (or defaults when null). */
    function syncFolderDocTitleControlsFromPath(docPath) {
      const stemInp = document.getElementById('readmeFolderDocStemInput');
      const extEl = document.getElementById('readmeFolderDocExt');
      if (!stemInp || !extEl) return;
      if (!docPath) {
        stemInp.value = DEFAULT_FOLDER_DOC_STEM;
        extEl.textContent = '.md';
        folderDocMdTags = [];
        syncFolderDocTagPillsDisplay();
        return;
      }
      const base = T.baseName(docPath);
      const parsed = T.parseSegmentTags(base);
      const pretty = String(parsed.pretty || '');
      const dot = pretty.lastIndexOf('.');
      if (dot > 0) {
        stemInp.value = pretty.slice(0, dot);
        extEl.textContent = pretty.slice(dot);
      } else {
        stemInp.value = pretty || DEFAULT_FOLDER_DOC_STEM;
        extEl.textContent = '.md';
      }
      folderDocMdTags = parsed.tags.slice();
      syncFolderDocTagPillsDisplay();
    }

    function detachNestedReadmePreviewHandler() {
      const prevEl = document.getElementById('readmePreview');
      if (prevEl && nestedReadmePreviewClickHandler) {
        prevEl.removeEventListener('click', nestedReadmePreviewClickHandler);
        nestedReadmePreviewClickHandler = null;
      }
      globalNestedCompositeSections = [];
    }

    /** Hide single-doc chrome; aggregated mode uses per-section Edit instead of folder doc editor. */
    function syncReadmeNestedDocsUi() {
      const docKind = document.getElementById('optViewerDocKindDoc');
      const nested = document.getElementById('optViewerDocNested');
      const thumbs = document.getElementById('optViewerDocThumbs');
      const prev = document.getElementById('readmePreview');
      if (docKind) docKind.checked = !folderThumbsView;
      if (thumbs) thumbs.checked = folderThumbsView;
      if (nested) nested.checked = globalNestedReadmeView;
      const docLabel = document.querySelector('label[for="optViewerDocKindDoc"]');
      if (docLabel && docLabel.lastChild) docLabel.lastChild.textContent = globalNestedReadmeView ? 'Folder docs' : 'Folder doc';
      syncFolderDocChrome();
      if (!prev) return;
      if (globalNestedReadmeView) {
        prev.removeAttribute('title');
        prev.setAttribute('tabindex', '-1');
        prev.setAttribute('role', 'region');
        prev.setAttribute('aria-label', 'Nested folder docs — Edit saves each file to disk');
      } else {
        prev.setAttribute('title', 'Double-click to edit');
        prev.setAttribute('tabindex', '0');
        prev.setAttribute('role', 'button');
        prev.removeAttribute('aria-label');
      }
    }

    /** Combined preview under folderPath; each section Edit → Save writes that file’s path. */
    async function loadGlobalNestedReadmeComposite(folderPath, viewAnchorPath) {
      const viewAnchor = viewAnchorPath != null && viewAnchorPath !== '' ? viewAnchorPath : folderPath;
      const prev = document.getElementById('readmePreview');
      resetViewerDocEditorChrome();
      activeReadmePath = null;
      readmeSaveTargetVerifiedOnDisk = false;

      const rootNorm = String(folderPath || '').replace(/[/\\]+$/, '');
      const r = await window.tagBrowser.collectGlobalViewerDocs({
        folderPath: rootNorm,
        basenames: getGlobalViewerBasenamesList(),
      });
      if (!propsViewStill(viewAnchor)) return;

      if (!r.ok) {
        setViewerMdValue('readme', '');
        if (prev) {
          prev.innerHTML =
            '<p class="text-danger small">' + escapeHtmlForPreview(String(r.error || 'Load failed')) + '</p>';
        }
        syncReadmePreviewChrome({ pulse: true, filled: false });
        lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
        return;
      }
      const sections = Array.isArray(r.sections) ? r.sections : [];
      if (sections.length === 0) {
        setViewerMdValue('readme', '');
        if (prev) {
          prev.innerHTML =
            '<p class="text-muted small mb-0">No nested doc files under this folder (check Settings → Viewer docs name list).</p>';
        }
        syncReadmePreviewChrome({ pulse: false, filled: false });
        lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
        return;
      }
      globalNestedCompositeSections = sections.map((s) => ({
        fullPath: s.fullPath,
        relPath: s.relPath,
        depth: s.depth,
        baseName: s.baseName,
        text: s.text,
      }));
      let primaryRootIdx = -1;
      for (let i = 0; i < sections.length; i++) {
        if ((sections[i].depth ?? 0) === 0) {
          primaryRootIdx = i;
          break;
        }
      }
      let html = '<div class="global-readme-root">';
      if (r.truncated) {
        html +=
          '<p class="small text-warning mb-2 pb-2 border-bottom">' +
          'First 50 matching files only — tree may continue beyond.</p>';
      }
      for (const s of sections) {
        const d = s.depth != null ? s.depth : 0;
        const head = escapeHtmlForPreview(String(s.relPath || s.baseName || ''));
        const encPath = encodeURIComponent(String(s.fullPath || ''));
        html +=
          '<section class="global-readme-section" data-doc-path="' +
          encPath +
          '" style="--gr-depth:' +
          d +
          '"><header class="global-readme-section-head d-flex align-items-start justify-content-between gap-2 flex-wrap" title="Expand/collapse section">' +
          '<span class="min-w-0 text-break">' +
          head +
          '</span>' +
          '<div class="d-inline-flex align-items-center gap-1 flex-shrink-0">' +
          '<button type="button" class="btn btn-sm btn-outline-secondary nested-doc-toggle d-inline-flex align-items-center justify-content-center px-2" aria-expanded="true" title="Collapse">' +
          '<i class="fa-solid fa-chevron-down fa-fw" aria-hidden="true"></i>' +
          '<span class="visually-hidden">Toggle section</span>' +
          '</button>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary nested-doc-edit">Edit</button>' +
          '<button type="button" class="btn btn-sm btn-primary nested-doc-save d-none">Save</button>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary nested-doc-cancel d-none" title="Discard changes">Esc</button>' +
          '</div>' +
          '</header>' +
          '<div class="nested-doc-view global-readme-section-body">' +
          mdPreviewHtml(s.text, { mdSourcePath: s.fullPath }) +
          '</div>' +
          '<div class="nested-doc-editor d-none mt-1">' +
          '<textarea class="form-control form-control-sm font-monospace nested-doc-ta" rows="10" spellcheck="false"></textarea>' +
          '</div>' +
          '</section>';
      }
      html += '</div>';
      if (prev) prev.innerHTML = html;
      setViewerMdValue('readme', '');
      if (prev) {
        function setNestedDocHeaderEditMode(sec, editing) {
          if (!sec) return;
          const on = !!editing;
          const editB = sec.querySelector('button.nested-doc-edit');
          const saveB = sec.querySelector('button.nested-doc-save');
          const escB = sec.querySelector('button.nested-doc-cancel');
          if (editB) editB.classList.toggle('d-none', on);
          if (saveB) saveB.classList.toggle('d-none', !on);
          if (escB) escB.classList.toggle('d-none', !on);
        }
        function setNestedSectionCollapsed(sec, collapsed) {
          if (!sec) return;
          const isCollapsed = !!collapsed;
          const view = sec.querySelector('.nested-doc-view');
          const editor = sec.querySelector('.nested-doc-editor');
          const toggleBtn = sec.querySelector('button.nested-doc-toggle');
          const icon = toggleBtn && toggleBtn.querySelector('i');
          if (isCollapsed) setNestedDocHeaderEditMode(sec, false);
          sec.classList.toggle('global-readme-section--collapsed', isCollapsed);
          if (view) view.classList.toggle('d-none', isCollapsed);
          if (editor) editor.classList.add('d-none');
          if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            toggleBtn.setAttribute('title', isCollapsed ? 'Expand' : 'Collapse');
          }
          if (icon) {
            icon.classList.toggle('fa-chevron-right', isCollapsed);
            icon.classList.toggle('fa-chevron-down', !isCollapsed);
          }
        }
        prev.querySelectorAll('section.global-readme-section').forEach((sec, idx) => {
          const expand = primaryRootIdx >= 0 && idx === primaryRootIdx;
          setNestedSectionCollapsed(sec, !expand);
        });
        nestedReadmePreviewClickHandler = function (ev) {
          const t = ev.target;
          if (!t || !t.closest) return;
          const sec = t.closest('section.global-readme-section');
          if (!sec) return;
          const enc = sec.getAttribute('data-doc-path');
          if (!enc) return;
          let fullPath;
          try {
            fullPath = decodeURIComponent(enc);
          } catch (_) {
            return;
          }
          const viewEl = sec.querySelector('.nested-doc-view');
          const editorEl = sec.querySelector('.nested-doc-editor');
          const ta = sec.querySelector('textarea.nested-doc-ta');

          if (t.closest('button.nested-doc-edit')) {
            ev.preventDefault();
            if (!propsViewStill(viewAnchor)) return;
            setNestedSectionCollapsed(sec, false);
            prev.querySelectorAll('.nested-doc-editor').forEach((edw) => {
              edw.classList.add('d-none');
              const psec = edw.closest('section');
              const v = psec && psec.querySelector('.nested-doc-view');
              if (v) v.classList.remove('d-none');
              if (psec) setNestedDocHeaderEditMode(psec, false);
            });
            const rec = globalNestedCompositeSections.find(
              (x) => propsPathKey(x.fullPath) === propsPathKey(fullPath)
            );
            if (ta && rec) setNestedMarkdownValue(ta, rec.text);
            if (viewEl && editorEl && ta) {
              viewEl.classList.add('d-none');
              editorEl.classList.remove('d-none');
              focusNestedMarkdownEditor(ta);
            }
            setNestedDocHeaderEditMode(sec, true);
            return;
          }
          if (t.closest('button.nested-doc-save')) {
            ev.preventDefault();
            void (async () => {
              if (!propsViewStill(viewAnchor)) return;
              const text = getNestedMarkdownValue(ta);
              const rWr = await window.tagBrowser.writeTextFile({ fullPath, text });
              const st = document.getElementById('statusMain');
              if (!rWr.ok) {
                if (st) setStatusMain(rWr.error || 'Save failed');
                return;
              }
              if (st) setStatusMain('Saved: ' + segmentPretty(T.baseName(fullPath)));
              const rec = globalNestedCompositeSections.find(
                (x) => propsPathKey(x.fullPath) === propsPathKey(fullPath)
              );
              if (rec) rec.text = text;
              if (viewEl) viewEl.innerHTML = mdPreviewHtml(text, { mdSourcePath: fullPath });
              if (viewEl && editorEl) {
                editorEl.classList.add('d-none');
                viewEl.classList.remove('d-none');
              }
              setNestedDocHeaderEditMode(sec, false);
              syncReadmePreviewChrome({ pulse: false });
              folderChildCountCache.clear();
              // Nested doc save: one refresh only — retries stack 3 extra full searches and hammer huge parent scopes.
              void runSearchNow('refresh');
            })();
            return;
          }
          if (t.closest('button.nested-doc-cancel')) {
            ev.preventDefault();
            const rec = globalNestedCompositeSections.find(
              (x) => propsPathKey(x.fullPath) === propsPathKey(fullPath)
            );
            if (ta && rec) setNestedMarkdownValue(ta, rec.text);
            if (viewEl && editorEl) {
              editorEl.classList.add('d-none');
              viewEl.classList.remove('d-none');
            }
            setNestedDocHeaderEditMode(sec, false);
            return;
          }
          if (t.closest('button.nested-doc-toggle')) {
            ev.preventDefault();
            const isCollapsed = sec.classList.contains('global-readme-section--collapsed');
            setNestedSectionCollapsed(sec, !isCollapsed);
            return;
          }
          if (t.closest('header.global-readme-section-head') && !t.closest('button')) {
            ev.preventDefault();
            const isCollapsed = sec.classList.contains('global-readme-section--collapsed');
            setNestedSectionCollapsed(sec, !isCollapsed);
            return;
          }
        };
        prev.addEventListener('click', nestedReadmePreviewClickHandler);
      }
      const filled = sections.some((s) => String(s.text || '').trim().length > 0);
      syncReadmePreviewChrome({ pulse: true, filled });
      lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
    }

    /* Guard for thumbnails: one bounded Everything query per render, so a huge tree cannot grind the viewer
       (the note above the grid says when the cap was hit — no silent truncation). */
    const FOLDER_THUMBS_MAX = 400;
    /** At or below this many tiles, fetch all thumbnails at once instead of lazily on scroll. */
    const FOLDER_THUMBS_EAGER_MAX = 60;
    const FOLDER_THUMB_REQ_PX = 256;

    function thumbExtOf(name) {
      const n = String(name || '');
      return /\.[^.]+$/.test(n) ? n.slice(n.lastIndexOf('.') + 1).toLowerCase() : '';
    }

    /** Thumbs grid query: the current search filters (text, tags, recency, deadline) scoped to the viewer
        folder; depth from the viewer toggle (ceiling stays recursive); server-side ext filter for thumb types. */
    function everythingSearchTextForFolderThumbs(normFolder, recursive) {
      const ceil = combineFolderScopeGroup(getSearchScopeCeilingFoldersNorms(), true);
      const slice = combineFolderScopeGroup([normFolder], recursive);
      const qRaw = (document.getElementById('query')?.value || '').trim();
      const q = qRaw ? filenameOnlyUserQueryForScopedSearch(qRaw) : '';
      let t = [ceil, slice, q].filter(Boolean).join(' ');
      t = appendTagFiltersToEverythingQuery(t);
      t = (String(t).trim() + ' ext:' + [...THUMBNAIL_EXT].join(';')).trim();
      t = appendRecencyToEverythingQuery(t);
      return t;
    }

    /** Thumbnails mode: grid of shell thumbnails for the viewer folder, mirroring the search filters and sort
        (reuses the row-thumbnail cache/queue). Nested groups by folder with a section header that scopes TagFox. */
    async function loadFolderThumbnails(folderPath, viewAnchorPath) {
      const viewAnchor = viewAnchorPath != null && viewAnchorPath !== '' ? viewAnchorPath : folderPath;
      const block = document.getElementById('folderThumbsBlock');
      const grid = document.getElementById('folderThumbsGrid');
      const emptyEl = document.getElementById('folderThumbsEmpty');
      const noteEl = document.getElementById('folderThumbsNote');
      if (!block || !grid) return;
      const runId = ++folderThumbsRunSeq;
      const norm = String(folderPath).replace(/[/\\]+$/, '');
      const nested = globalNestedReadmeView;
      const searchText = everythingSearchTextForFolderThumbs(norm, nested);
      const res = await everythingSearchOnce({
        searchText,
        count: FOLDER_THUMBS_MAX + 1,
        options: { ...everythingOptionsForRequest(), pathSearch: true, offset: 0 },
      });
      if (runId !== folderThumbsRunSeq) return; /* a newer run started while this query was out */
      if (!propsViewStill(viewAnchor)) return;
      let rows = res && res.ok && Array.isArray(res.rows) ? res.rows.slice() : [];
      rows = rows.filter((r) => !rowIsFolder(r) && THUMBNAIL_EXT.has(thumbExtOf(String(r.name || ''))));
      /* Same client-side narrowing as the results table: exact deadline range, Hide special / Hide ~. */
      if (deadlineFilterActive()) {
        const b = deadlineRangeBounds();
        rows = rows.filter((r) => rowDeadlineDates(r).some((d) => deadlineDateInActiveRange(d, b)));
      }
      rows = applyAdvancedPathHides(rows);
      const over = rows.length > FOLDER_THUMBS_MAX;
      rows = rows.slice(0, FOLDER_THUMBS_MAX);
      let files;
      if (nested) {
        /* Group by folder; folders in first-seen (current sort) order, root files hoisted first. */
        const rootK = pathKeyLoose(norm);
        const groups = new Map();
        for (const r of rows) {
          const folder = String(T.parentDir(fullPathForRow(r)) || '').replace(/[/\\]+$/, '');
          if (!groups.has(folder)) groups.set(folder, []);
          groups.get(folder).push({ folder, name: String(r.name || '') });
        }
        const entries = [...groups.entries()];
        entries.sort((a, b) => (pathKeyLoose(a[0]) === rootK ? -1 : 0) - (pathKeyLoose(b[0]) === rootK ? -1 : 0));
        files = [];
        for (const [, arr] of entries) files.push(...arr);
      } else {
        files = rows.map((r) => ({ folder: norm, name: String(r.name || '') }));
      }
      const note = over ? 'Showing the first ' + FOLDER_THUMBS_MAX + ' matches — more exist.' : '';
      lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
      block.classList.remove('d-none');
      syncPropsFootHint();
      const sig =
        pathKeyLoose(norm) + '|' + (nested ? 'n' : 'f') + '|' + searchText + '|' +
        files.map((f) => f.folder + '\\' + f.name).join('\n');
      /* Auto-refresh with unchanged query + file list: keep the rendered grid (and its scroll position). */
      if (sig === folderThumbsRenderedSig && grid.childElementCount) return;
      folderThumbsRenderedSig = sig;
      if (folderThumbsObserver) {
        folderThumbsObserver.disconnect();
        folderThumbsObserver = null;
      }
      grid.innerHTML = '';
      if (emptyEl) emptyEl.classList.toggle('d-none', files.length > 0);
      if (noteEl) {
        noteEl.classList.toggle('d-none', !note);
        noteEl.textContent = note;
      }
      if (!files.length) return;
      const relLabel = (folder) => {
        const rel = String(folder).slice(norm.length).replace(/^[/\\]+/, '');
        if (!rel) return '';
        return rel.split(/[/\\]+/).map(segmentPretty).join('\\');
      };
      const frag = document.createDocumentFragment();
      const tiles = [];
      let prevFolder = norm;
      for (const f of files) {
        if (nested && pathKeyLoose(f.folder) !== pathKeyLoose(prevFolder)) {
          prevFolder = f.folder;
          const sec = document.createElement('div');
          sec.className = 'folder-thumbs-sec small fw-semibold text-muted text-truncate';
          sec.textContent = relLabel(f.folder) || segmentPretty(T.baseName(f.folder));
          sec.setAttribute('role', 'button');
          sec.tabIndex = 0;
          sec.title = 'Focus TagFox on this folder';
          const fldr = f.folder;
          sec.addEventListener('click', () => void applySearchScopeAndRefresh(fldr));
          sec.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              void applySearchScopeAndRefresh(fldr);
            }
          });
          frag.appendChild(sec);
        }
        const fp = joinFolderAndFileName(f.folder, f.name);
        const ext = thumbExtOf(f.name);
        const fig = document.createElement('figure');
        fig.className = 'folder-thumb';
        fig.setAttribute('role', 'button');
        fig.tabIndex = 0;
        fig.title = 'Open ' + (nested && relLabel(f.folder) ? relLabel(f.folder) + '\\' : '') + f.name;
        const box = document.createElement('div');
        box.className = 'folder-thumb-imgwrap';
        box.appendChild(fileIconEl(ext)); /* glyph stays if the shell has no thumbnail */
        const cap = document.createElement('figcaption');
        cap.className = 'small text-truncate text-muted';
        cap.textContent = segmentPretty(f.name);
        fig.appendChild(box);
        fig.appendChild(cap);
        const open = () => void window.tagBrowser.openPath(fp);
        fig.addEventListener('click', open);
        fig.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        });
        frag.appendChild(fig);
        tiles.push({ box, fp });
      }
      grid.appendChild(frag);
      const paint = async (t) => {
        if (isStreamedDrivePathForThumb(t.fp)) return; /* same guard as row thumbs: no hydrating downloads */
        const key = thumbKey(t.fp, '', FOLDER_THUMB_REQ_PX);
        const dataUrl = await fetchThumbnail(t.fp, key, FOLDER_THUMB_REQ_PX);
        if (!dataUrl || !t.box.isConnected) return;
        const img = document.createElement('img');
        img.alt = '';
        img.src = dataUrl;
        t.box.innerHTML = '';
        t.box.appendChild(img);
      };
      /* Small folders: paint everything up front. Lazy-loading 20 tiles only bought a grid of glyph
         placeholders that filled in as you scrolled, which reads as "some thumbnails are missing". */
      if (tiles.length <= FOLDER_THUMBS_EAGER_MAX || typeof IntersectionObserver !== 'function') {
        for (const t of tiles) void paint(t);
        return;
      }
      const byBox = new Map(tiles.map((t) => [t.box, t]));
      folderThumbsObserver = new IntersectionObserver(
        (entries, obs) => {
          for (const ent of entries) {
            if (!ent.isIntersecting) continue;
            obs.unobserve(ent.target);
            const t = byBox.get(ent.target);
            if (t) void paint(t);
          }
        },
        /* Root is the viewer scroller; preload ~2 screens ahead so scrolling lands on painted tiles. */
        { root: document.getElementById('propsScroll') || null, rootMargin: '1200px' }
      );
      for (const t of tiles) folderThumbsObserver.observe(t.box);
    }

    /** Folder row / current folder: first match from shared Viewer docs basename list; else empty editor → Save creates default stem + .md. */
    async function loadReadmeForFolder(folderPath, viewAnchorPath) {
      detachNestedReadmePreviewHandler();
      const viewAnchor = viewAnchorPath != null && viewAnchorPath !== '' ? viewAnchorPath : folderPath;
      const readmeBlock = document.getElementById('readmeBlock');
      const sep = folderPath.includes('/') ? '/' : '\\';
      const readmeOnlyPath = folderPath.replace(/[/\\]+$/, '') + sep + DEFAULT_FOLDER_DOC_STEM + '.md';

      const kTarget = pathKeyLoose(folderPath);
      /* New folder vs last loaded: clear immediately so scope/selection changes never keep the previous readme text. */
      if (lastReadmeFolderPathLoose && kTarget !== lastReadmeFolderPathLoose) {
        setViewerMdValue('readme', '');
        document.getElementById('readmePreview').innerHTML = mdPreviewHtml('');
        syncReadmePreviewChrome({ pulse: false });
        syncFolderDocTitleControlsFromPath(null);
        syncFolderDocHeaderExists(false);
        folderDocViewerOverridePath = null;
        folderDocHeaderLastSyncedKey = '';
        activeReadmePath = null;
        readmeSaveTargetVerifiedOnDisk = false;
      }

      if (folderThumbsView) {
        readmeBlock.classList.add('d-none');
        syncReadmeNestedDocsUi();
        await loadFolderThumbnails(folderPath, viewAnchor);
        return;
      }
      document.getElementById('folderThumbsBlock')?.classList.add('d-none');
      readmeBlock.classList.remove('d-none');
      syncReadmeNestedDocsUi();
      if (globalNestedReadmeView) {
        if (!propsViewStill(viewAnchor)) return;
        await loadGlobalNestedReadmeComposite(folderPath, viewAnchor);
        return;
      }

      const pick = await window.tagBrowser.resolveFolderViewerDoc({
        folderPath,
        basenames: getGlobalViewerBasenamesList(),
      });
      if (!propsViewStill(viewAnchor)) return;

      const readmeWrap = document.getElementById('readmeEditorWrap');
      const sameFolderDocEditing =
        readmeWrap &&
        !readmeWrap.classList.contains('d-none') &&
        lastReadmeFolderPathLoose &&
        kTarget === lastReadmeFolderPathLoose;
      if (sameFolderDocEditing) {
        document.getElementById('readmePreview').innerHTML = mdPreviewHtml(getViewerMdValue('readme'), {
          mdSourcePath: activeReadmePath,
        });
        syncReadmePreviewChrome({ pulse: false });
        return;
      }

      const folderNormForUi = folderPath.replace(/[/\\]+$/, '');
      let docPath = pick.ok ? pick.fullPath : null;
      if (folderDocViewerOverridePath === FOLDER_DOC_OVERRIDE_NEW) {
        docPath = folderDocTargetPathFromUi(folderNormForUi);
      } else if (folderDocViewerOverridePath) {
        const parO = pathKeyLoose(T.parentDir(folderDocViewerOverridePath));
        const parF = pathKeyLoose(folderPath);
        if (parO === parF) docPath = folderDocViewerOverridePath;
      }

      if (!pick.ok && !docPath) {
        activeReadmePath = null;
        readmeSaveTargetVerifiedOnDisk = false;
        syncFolderDocTitleControlsFromPath(null);
        syncFolderDocHeaderExists(false);
        folderDocHeaderLastSyncedKey = '';
        setViewerMdValue('readme', '/* read error: ' + (pick.error || '') + ' */');
        document.getElementById('readmePreview').innerHTML = mdPreviewHtml(getViewerMdValue('readme'));
        syncReadmePreviewChrome({ pulse: true });
        lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
        resetViewerDocEditorChrome();
        return;
      }

      if (!docPath) {
        activeReadmePath = readmeOnlyPath;
        readmeSaveTargetVerifiedOnDisk = false;
        {
          const ndk = pathKeyLoose(readmeOnlyPath);
          if (ndk !== folderDocHeaderLastSyncedKey) {
            syncFolderDocTitleControlsFromPath(null);
            folderDocHeaderLastSyncedKey = ndk;
          }
        }
        syncFolderDocHeaderExists(false);
        setViewerMdValue('readme', '');
        document.getElementById('readmePreview').innerHTML = mdPreviewHtml(getViewerMdValue('readme'), { mdSourcePath: readmeOnlyPath });
        syncReadmePreviewChrome({ pulse: true });
        lastReadmeFolderPathLoose = pathKeyLoose(folderPath);
        resetViewerDocEditorChrome();
        return;
      }

      activeReadmePath = docPath;
      {
        const dk = pathKeyLoose(docPath);
        if (dk !== folderDocHeaderLastSyncedKey) {
          if (folderDocViewerOverridePath !== FOLDER_DOC_OVERRIDE_NEW) {
            syncFolderDocTitleControlsFromPath(docPath);
          }
          folderDocHeaderLastSyncedKey = dk;
        }
      }

      const r = await window.tagBrowser.readTextFile({ fullPath: docPath });
      if (!propsViewStill(viewAnchor)) return;

      readmeSaveTargetVerifiedOnDisk = !!r.ok;
      syncFolderDocHeaderExists(!!r.ok);
      if (r.ok) {
        setViewerMdValue('readme', r.text);
      } else if (r.code === 'ENOENT') {
        setViewerMdValue('readme', '');
      } else {
        setViewerMdValue('readme', '/* read error: ' + (r.error || '') + ' */');
      }
      document.getElementById('readmePreview').innerHTML = mdPreviewHtml(getViewerMdValue('readme'), { mdSourcePath: docPath });
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

    /** OR-group for multiple roots, in the `< a | b >` grouping the tag filters use. */
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

    /** Folder row: exact (n); capped (100+) — pill only when narrowed; full subs+all → plain muted text. */
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
      const want = FOLDER_CHILD_COUNT_MAX + 1;
      const res = await everythingSearchOnce({
        searchText,
        count: want,
        options: { ...everythingOptionsForRequest(), pathSearch: true, offset: 0 },
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

    /** Escape tag text for one Everything regex:… clause (modifiers off; global Regex UI off). */
    function escapeEverythingRegexFragment(s) {
      return String(s || '').replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
    }

    /** Everything checks an item's terms left to right and stops at the first that fails, so each tag regex
        follows the tag as plain text, which every match contains and which keeps the regex off almost every
        item: on 2.4 million items `xkTODO` took 5.6s as a regex alone and 17ms behind the text, with the same
        rows (October 2026). `noww:noregex:` keeps the text literal whatever Match whole word and Regex say. */
    function everythingTagTextTerm(literal) {
      return 'noww:noregex:' + literal;
    }

    /** One tag's Everything terms, matching the `xk<tag>` token as rowHasTag / pathHasTag do: `text` is the
        token as plain text and `regex` the token as a whole word in the leaf name. */
    function tagKeyToEverythingTerms(lowerKey) {
      const t = String(lowerKey || '').trim().toLowerCase();
      if (!t) return null;
      let inner = t.replace(/[|*?()<>]/g, '');
      if (!inner) inner = t.replace(/[^a-z0-9_-]/gi, '');
      if (!inner) return null;
      // Match the exact on-disk casing: lowercase family prefix + uppercase body. Tag bodies are
      // always uppercase, so this matches whether or not Match Case is on, without relying on an
      // inline (?i) flag (which Everything's regex does not always honour).
      const token = T.prefixForTag(inner) + inner.toUpperCase();
      // Use \s, never a literal space: a real space inside an inline `regex:` term makes Everything
      // split it into two terms, which silently breaks the filter. Boundary before the family prefix,
      // then the tag as a whole token anchored to the leaf segment (boundary then non-backslash to
      // end, or end) so a tagged parent folder does not match.
      const regex = '[\\s\\\\]' + escapeEverythingRegexFragment(token) + '(?:[\\s.][^\\\\]*)?$';
      return { text: everythingTagTextTerm(token), regex };
    }

    /** Narrow Everything by the tag filters: AND (space) or OR (|) of the active tags' terms, then the deadline
     *  filter's. Only positive (include) tags narrow the server query; negation is applied by the client filter.
     *  In OR mode a negative term matches rows that merely LACK a tag, so Everything cannot pre-narrow safely —
     *  send no tag clause and let the client filter do it all. In AND mode, narrowing by the positives is always
     *  a correct superset. The deadline filter narrows to files carrying any xd- deadline; the exact range is
     *  applied client-side. */
    function appendTagFiltersToEverythingQuery(searchText) {
      let out = String(searchText || '').trim();
      const anyNegative = [...activeTagKeys].some((k) => excludedTagKeys.has(k));
      const terms =
        tagFilterCombineOr && anyNegative
          ? []
          : [...activeTagKeys]
              .filter((k) => !excludedTagKeys.has(k))
              .sort()
              .map((k) => tagKeyToEverythingTerms(k))
              .filter(Boolean);
      if (tagFilterCombineOr && terms.length > 1) {
        // Everything: `|` is OR between terms; alternation inside one regex: does not replace that. Group so
        // scope/query stays AND with (tag1 OR tag2); the text group passes every row the regex group does.
        out += ' <' + terms.map((x) => x.text).join('|') + '> < ' + terms.map((x) => 'regex:' + x.regex).join(' | ') + ' >';
      } else {
        for (const x of terms) out += ' ' + x.text + ' regex:' + x.regex;
      }
      if (deadlineFilterActive()) out += ' ' + everythingTagTextTerm('xd-') + ' regex:[\\s\\\\]xd-';
      return out.trim();
    }

    /** Google Drive for Desktop: real files live under this virtual segment — must not count as a “dot folder”. */
    function isGoogleDriveShortcutTargetsSegment(seg) {
      const s = String(seg || '').toLowerCase();
      return s === '.shortcut-targets-by-id' || s === '.shortcuts-by-id';
    }

    /** Collapse .shortcut*-by-id\<ID> pair in a display path to … (keeps the real folder name that follows). */
    function collapseGDriveShortcutDisplay(str) {
      return String(str || '')
        .replace(/([/\\])\.shortcut-targets-by-id[/\\][^/\\]+/gi, '$1\u2026')
        .replace(/([/\\])\.shortcuts-by-id[/\\][^/\\]+/gi, '$1\u2026');
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

    /** True when a row's parent path ends with Drive’s shortcut-id segment (i.e. row name is an opaque ID). */
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

    /**
     * Folder path whose parent segment is Drive shortcut-by-id: basename is opaque ID; real name is the single child.
     * Returns pretty title from cache, or null while loading (async resolve + onRefresh).
     */
    function prettyGDriveShortcutIdFolderBasename(fullPath, onRefresh) {
      const norm = String(fullPath || '').replace(/[/\\]+$/, '');
      const segs = norm.split(/[/\\]/).filter(Boolean);
      if (segs.length < 2 || !isGoogleDriveShortcutTargetsSegment(segs[segs.length - 2])) return null;
      const key = norm.toLowerCase();
      if (gdriveShortcutNameCache.has(key)) {
        const v = gdriveShortcutNameCache.get(key);
        if (typeof v === 'string' && v) return segmentPretty(v) || v;
        if (v && typeof v.then === 'function') void v.then(() => onRefresh && onRefresh());
        return null;
      }
      void resolveGDriveShortcutName(norm).then(() => onRefresh && onRefresh());
      return null;
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
     * Recency means a file's own modified time, so folders are excluded (file:) unless Folders only is on:
     * Windows bumps a folder's modified time when a child is created, deleted or renamed, never when one is edited,
     * so a folder hit in a recency window reports creation, not modification.
     */
    function appendRecencyToEverythingQuery(searchText) {
      if (recencyFilterMode() === 'all') return searchText;
      const cut = recencyFilterCutoffMs();
      if (cut == null) return searchText;
      const clause = 'dm:>=' + formatEverythingDmCutoffLocal(cut) + (isFoldersOnly() ? '' : ' file:');
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

    /** Runner's size: at most three figures and the unit ("14 MB", "1.4 MB", "335 KB"), or null. */
    function runnerSizeParts(n) {
      if (n == null) return null;
      if (n < 1024) return { num: String(n), unit: 'B' };
      const units = ['KB', 'MB', 'GB', 'TB'];
      let v = n / 1024;
      let i = 0;
      while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
      }
      let num = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
      /* 1023.7 KB rounds to 1024: carry it into the next unit. */
      if (num >= 1024 && i < units.length - 1) {
        num = 1;
        i++;
      }
      return { num: String(num), unit: units[i] };
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

    /** Size column: accent by magnitude (Everything gives size for many folder rows too; synthetic folder rows stay —). */
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

    /** Runner's modified column: the time today, then Yesterday, a weekday, a day and month, and the year
        when it is not this one. Absolute rather than "5 min ago", which would go stale on a list that
        auto-refresh leaves alone while nothing changes. */
    function formatModifiedShort(ms) {
      if (!ms) return '—';
      const d = new Date(ms);
      const now = new Date();
      const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const days = Math.round((dayStart(now) - dayStart(d)) / 864e5);
      if (days <= 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      if (days === 1) return 'Yesterday';
      if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
      const opts = { day: 'numeric', month: 'short' };
      if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
      return d.toLocaleDateString('en-GB', opts);
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

    /** Local wall-clock hh:mm:ss for status lines: the stamp that shows a refresh really just ran. */
    function clockTimeHms() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    /** ", unchanged" / ", +3 new, -1 gone" against the row keys held before an explicit refresh. */
    function refreshRowChangeSuffix(prevKeys) {
      if (!prevKeys) return '';
      const now = new Set(lastRows.map((r) => pathNormKey(fullPathForRow(r))).filter(Boolean));
      let added = 0;
      for (const k of now) if (!prevKeys.has(k)) added++;
      let gone = 0;
      for (const k of prevKeys) if (!now.has(k)) gone++;
      if (!added && !gone) return ', unchanged';
      const parts = [];
      if (added) parts.push('+' + added + ' new');
      if (gone) parts.push('-' + gone + ' gone');
      return ', ' + parts.join(', ');
    }

    /* What the table is actually showing, so a tick that changed nothing can be told from one that
       did. Modified time and size are in the key as well as the path: a file edited in place keeps
       its row but changes two of its columns, and that is a change the list should show. */
    let lastRenderedTableSig = '';

    function resultsTableRenderSignature() {
      const rows = listRowsForUi();
      const parts = [rows.length + '/' + lastRows.length];
      for (const r of rows) {
        parts.push(pathNormKey(fullPathForRow(r)) + '*' + modifiedTimeMs(r) + '*' + (r && r.size != null ? r.size : ''));
      }
      /* | and * cannot occur in a Windows path, so neither separator can be part of a key. */
      return parts.join('|');
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

    /** Checked row by path in the current table render. */
    function findCheckedRowByPath(fp) {
      const key = pathNormKey(fp);
      if (!key) return null;
      return lastRows.find((row) => pathNormKey(fullPathForRow(row)) === key) || null;
    }

    /** Current folder plus checked subfolders / file-parent subfolders for ambiguous paste. */
    function getPasteTargetOptionsForCheckedRows(currentFolderRaw) {
      const currentFolder = normalizeFolderPathForEverything(String(currentFolderRaw || '').trim()).replace(/[/\\]+$/, '');
      const currentKey = pathNormKey(currentFolder);
      const seen = new Set();
      const folders = [];
      let hasCheckedSubfolder = false;
      let hasCheckedFileInCurrentFolder = false;
      const addFolder = (folderRaw) => {
        const folder = normalizeFolderPathForEverything(String(folderRaw || '').trim()).replace(/[/\\]+$/, '');
        if (!folder) return;
        if (currentFolder && !pathIsUnderOrEqualFolder(folder, currentFolder)) return;
        const key = pathNormKey(folder);
        if (!key || seen.has(key)) return;
        seen.add(key);
        folders.push(folder);
      };
      addFolder(currentFolder);
      for (const fp of getCheckedPathsArr()) {
        const row = findCheckedRowByPath(fp);
        if (row && rowIsFolder(row)) {
          const folder = normalizeFolderPathForEverything(fp).replace(/[/\\]+$/, '');
          if (pathNormKey(folder) !== currentKey) hasCheckedSubfolder = true;
          addFolder(folder);
          continue;
        }
        const parent = normalizeFolderPathForEverything(T.parentDir(fp)).replace(/[/\\]+$/, '');
        if (!parent) continue;
        if (pathNormKey(parent) === currentKey) hasCheckedFileInCurrentFolder = true;
        else addFolder(parent);
      }
      return { folders, hasCheckedSubfolder, hasCheckedFileInCurrentFolder };
    }

    /** Use current folder unless checked rows make the destination ambiguous. */
    async function chooseTargetFolderFromCheckedRows(currentFolder) {
      const info = getPasteTargetOptionsForCheckedRows(currentFolder);
      if (!info.hasCheckedSubfolder && info.hasCheckedFileInCurrentFolder) return currentFolder;
      if (info.folders.length <= 1) return currentFolder;
      return promptPasteTargetModal(info.folders, currentFolder);
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

    /** Delete-confirm escape: once "don't ask again this session" is chosen, deletes skip the modal until restart. */
    let skipDeleteConfirmThisSession = false;
    let recycleConfirmOpen = false;

    /** Recycle confirm modal with a "don't ask again this session" option. Resolves true to proceed, false to cancel. */
    function confirmRecycle(paths) {
      if (skipDeleteConfirmThisSession) return Promise.resolve(true);
      if (recycleConfirmOpen) return Promise.resolve(false); // a confirm is already showing; ignore re-entry (e.g. Del pressed twice)
      return new Promise((resolve) => {
        const modalEl = document.getElementById('recycleConfirmModal');
        if (!modalEl || !window.bootstrap) {
          resolve(confirm(recycleBinConfirmMessage(paths)));
          return;
        }
        document.getElementById('recycleConfirmMsg').textContent = recycleBinConfirmMessage(paths);
        const btnOk = document.getElementById('btnRecycleConfirmOk');
        const btnAlways = document.getElementById('btnRecycleConfirmAlways');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        recycleConfirmOpen = true;
        let decided = false;
        const cleanup = () => {
          recycleConfirmOpen = false;
          btnOk.removeEventListener('click', onOk);
          btnAlways.removeEventListener('click', onAlways);
          modalEl.removeEventListener('hidden.bs.modal', onHidden);
        };
        const finish = (val, always) => {
          if (decided) return;
          decided = true;
          if (always) skipDeleteConfirmThisSession = true;
          cleanup();
          resolve(val);
          modal.hide();
        };
        const onOk = () => finish(true, false);
        const onAlways = () => finish(true, true);
        const onHidden = () => {
          if (decided) return;
          decided = true;
          cleanup();
          resolve(false);
        };
        btnOk.addEventListener('click', onOk);
        btnAlways.addEventListener('click', onAlways);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        modal.show();
        requestAnimationFrame(() => btnOk.focus());
      });
    }

    /** Status waiter while Recycle Bin operation runs. */
    function setDeletingStatus(count) {
      const n = Math.max(1, Number(count) || 1);
      setStatusMain(n === 1 ? 'Deleting 1 item...' : 'Deleting ' + n + ' items...');
    }

    /** One `trashPaths` IPC + paired search-debug lines (begin / batch | ipcReturn | invokeThrow). */
    async function trashPathsInvokeWithSearchDebug(paths, source) {
      const p = Array.isArray(paths) ? paths : [];
      const cap = 12;
      searchDebugLog('recycle.begin', {
        source,
        count: p.length,
        paths: p.slice(0, cap),
        truncated: p.length > cap,
      });
      try {
        const r = await window.tagBrowser.trashPaths(p, { debugSource: source });
        if (r && r.recycleLog) searchDebugLog('recycle.batch', r.recycleLog);
        else
          searchDebugLog('recycle.ipcReturn', {
            source,
            ok: !!(r && r.ok),
            err: (r && r.error) || '',
            keys: r && typeof r === 'object' ? Object.keys(r) : [],
          });
        return { r, threw: false };
      } catch (e) {
        searchDebugLog('recycle.invokeThrow', { source, err: String(e && e.message ? e.message : e) });
        return { r: null, threw: true };
      }
    }

    /** Drag-out: the checked set when the grabbed row is part of it, else just that row (Explorer-style). */
    function pathsForRowDrag(fp) {
      const checked = getCheckedPathsArr();
      const k = pathNormKey(fp);
      if (checked.length && checked.some((p) => pathNormKey(p) === k)) return checked;
      return [fp];
    }

    /** Copy/move into scope or Shelf: on name clash, offer replace (retries whole op with replaceExisting). */
    /** Record undo for a completed copy (recycle the copies) or move (rename each item back to its source). */
    function recordCopyOrMoveUndo(mode, r) {
      if (!r || !(r.ok || r.partial)) return;
      if (mode === 'copy') recordCreatedPathsUndo(r.copied || [], 'copy of ' + (r.copied || []).length + ' item(s)');
      else recordRenameUndo(r.moved || [], 'move of ' + (r.moved || []).length + ' item(s)');
    }

    async function scopeCopyOrMoveWithConflictPrompt(mode, { sourcePaths, destFolder, rootPrefix }) {
      const base = { sourcePaths, destFolder, rootPrefix };
      const run = (replaceExisting) =>
        mode === 'copy'
          ? window.tagBrowser.copyPathsIntoFolder({ ...base, replaceExisting })
          : window.tagBrowser.movePathsIntoFolder({ ...base, replaceExisting });
      let r = await run(false);
      if (r.ok || r.code !== 'EEXIST') {
        recordCopyOrMoveUndo(mode, r);
        return r;
      }
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
      {
        const r2 = await run(true);
        recordCopyOrMoveUndo(mode, r2);
        return r2;
      }
    }

    async function pasteClipboardIntoScopeWithConflictPrompt(destFolder, rootPrefix) {
      const run = (replaceExisting) =>
        window.tagBrowser.pasteClipboardIntoFolder({ destFolder, rootPrefix, replaceExisting });
      let r = await run(false);
      if (r.ok || r.code !== 'EEXIST') {
        if (r.ok || r.partial) recordCreatedPathsUndo(r.copied || [], 'paste of ' + (r.copied || []).length + ' item(s)');
        return r;
      }
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
      {
        const r2 = await run(true);
        if (r2 && (r2.ok || r2.partial))
          recordCreatedPathsUndo(r2.copied || [], 'paste of ' + (r2.copied || []).length + ' item(s)');
        return r2;
      }
    }

    /** Internal drop: move (default) or copy with Shift — into dest folder. Returns true on success. */
    async function applyInternalPathsDrop(destFolderRaw, paths, mode) {
      const destFolder = normalizeFolderPathForEverything(destFolderRaw);
      const status = document.getElementById('statusMain');
      const rootPrefix = rootPrefixValue();
      const destKey = pathNormKey(destFolder);
      const filtered = paths.filter((p) => pathNormKey(p) !== destKey);
      if (!filtered.length) return false;

      if (mode === 'copy') {
        if (!window.tagBrowser.copyPathsIntoFolder) {
          setStatusMain('Copy into folder is not available.');
          return false;
        }
        setBusyStatusHint(
          filtered.length === 1 ? 'Copying 1 item into folder...' : 'Copying ' + filtered.length + ' items into folder...'
        );
        const r = await scopeCopyOrMoveWithConflictPrompt('copy', {
          sourcePaths: filtered,
          destFolder,
          rootPrefix,
        });
        if (r.ok && r.noop) {
          setStatusMain('Already in that folder.');
          return false;
        }
        setStatusMain(r.ok ? 'Copied into folder.' : (r.error || 'Copy failed'));
        if (r.ok) {
          await renderShelf(); // Shelf chips must match disk after drop (drop event may end before this await).
          void refreshAfterDiskMutation({ paths: filtered, destFolder });
          return true;
        }
        return false;
      }

      if (!window.tagBrowser.movePathsIntoFolder) {
        setStatusMain('Move not available.');
        return false;
      }
      const r = await scopeCopyOrMoveWithConflictPrompt('move', {
        sourcePaths: filtered,
        destFolder,
        rootPrefix,
      });
      if (r.ok && r.noop) {
        setStatusMain('Already in that folder.');
        return false;
      }
      setStatusMain(r.ok ? 'Moved into folder.' : (r.error || 'Move failed'));
      if (r.ok) {
        await renderShelf();
        void refreshAfterDiskMutation({ paths: filtered, destFolder });
        return true;
      }
      return false;
    }

    /** One-shot acknowledgement on a folder pill after successful drop. */
    function pulseFolderDropTarget(el) {
      if (!el || !el.classList) return;
      el.classList.remove('folder-drop-success');
      void el.offsetWidth; // restart one-shot animation for repeated drops on the same pill
      el.classList.add('folder-drop-success');
      setTimeout(() => {
        if (el.isConnected) el.classList.remove('folder-drop-success');
      }, 900);
    }

    /** One-time: results scroll area dragover/drop — row targets, else empty space below rows → current scope folder (Shelf chips). */
    function bindResultsTableDragDrop() {
      const wraps = Array.from(document.querySelectorAll('.results-pane'));
      for (const wrap of wraps) {
        if (!wrap || wrap.dataset.dragDropBound === '1') continue;
        wrap.dataset.dragDropBound = '1';

        function clearRowDragOver() {
          wrap.querySelectorAll('tr.results-drag-over').forEach((tr) => tr.classList.remove('results-drag-over'));
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
          const tr = e.target.closest('tr[data-drop-path]');
          if (tr && wrap.contains(tr) && tr.dataset.dropPath) {
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
          const tr = e.target.closest('tr[data-drop-path]');
          if (tr && wrap.contains(tr) && tr.dataset.dropPath) {
            await applyInternalPathsDrop(tr.dataset.dropPath, paths, e.shiftKey ? 'copy' : 'move');
            return;
          }
          const scopeDest = currentScopeFolderPath();
          if (!scopeDest) {
            setStatusMain(
              isRunnerMode()
                ? 'Drop onto a folder row, or go into a folder first (→ on its row) to drop into the list.'
                : 'Set the current folder (breadcrumb or path editor) to drop into the list.'
            );
            return;
          }
          await applyInternalPathsDrop(scopeDest, paths, e.shiftKey ? 'copy' : 'move');
        });
      }
    }

    /** Breadcrumb: drop rows/Shelf/files on a folder segment to move (Shift = copy) into that folder. */
    let folderPathDropTargetBarsBound = false;
    function bindFolderPathDropTargetBarsOnce() {
      if (folderPathDropTargetBarsBound) return;
      folderPathDropTargetBarsBound = true;
      const bar = document.getElementById('breadcrumbBar');
      if (!bar || bar.dataset.folderPathDropBound === '1') return;
      bar.dataset.folderPathDropBound = '1';

      function clearBarPathDragOver() {
        bar.querySelectorAll('[data-drop-path].results-drag-over').forEach((n) => n.classList.remove('results-drag-over'));
      }

      bar.addEventListener('dragover', (e) => {
        if (!dataTransferHasTagBrowserOrFiles(e.dataTransfer)) {
          clearBarPathDragOver();
          return;
        }
        const node = e.target.closest('[data-drop-path]');
        if (!node || !bar.contains(node)) {
          clearBarPathDragOver();
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
        clearBarPathDragOver();
        node.classList.add('results-drag-over');
      });

      bar.addEventListener('drop', async (e) => {
        clearBarPathDragOver();
        const node = e.target.closest('[data-drop-path]');
        if (!node || !bar.contains(node)) return;
        const paths = collectPathsForShelfDrop(e.dataTransfer);
        if (!paths.length) return;
        e.preventDefault();
        e.stopPropagation();
        const ok = await applyInternalPathsDrop(node.dataset.dropPath, paths, e.shiftKey ? 'copy' : 'move');
        if (ok) pulseFolderDropTarget(node);
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
      if (!out.length) {
        const stash = activeNativeDragPathsLive();
        if (stash && dataTransferLooksLikeOsFileDrag(dt)) {
          out.push(...stash);
          tagBrowserActiveNativeDragPaths = null; // consumed: one drop per drag, never replay on a later drop
        }
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
      // Pre-rot minWidth ≈ column height so ±90° strip spans the shelf; match results column height (no vertical inset — aligns with results card / table).
      rot.style.minWidth = '';
      /* Runner's strip lies flat under the list and sizes itself. */
      if (isRunnerMode()) {
        aside.style.width = '';
        return;
      }
      const parent = aside.closest('.results-with-shelf') || aside.parentElement;
      const h = parent ? parent.clientHeight : 0;
      if (h > 48) rot.style.minWidth = Math.max(48, h) + 'px';
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
          tagBrowserActiveNativeDragPathsAt = Date.now();
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
      const clearAllBtn = document.getElementById('btnShelfClear');
      if (!zone || !chips || !hint || !window.tagBrowser.shelfState) return;
      const r = await window.tagBrowser.shelfState();
      const shelfDropHelp =
        'The shelf is temporary storage, like a clipboard. Drag files or folders onto it and off it into any folder: a drag moves them, and holding Shift copies. To drag things outside TagFox, use Alt+drag, or press the hand button first.';
      zone.title = r.ok ? shelfDropHelp + ' Staging folder: ' + r.path : shelfDropHelp + ' ' + String(r.error || 'Shelf unavailable');
      chips.innerHTML = '';
      if (!r.ok || !r.entries.length) {
        hint.classList.remove('d-none');
        if (clearAllBtn) clearAllBtn.classList.add('d-none');
        refreshTagFoxChromeTooltips(zone);
        scheduleSyncShelfAsideWidth();
        return;
      }
      hint.classList.add('d-none');
      if (clearAllBtn) clearAllBtn.classList.toggle('d-none', r.entries.length < 2);
      const allPaths = r.entries.map((ent) => ent.fullPath);
      // Label before pills (empty state uses #shelfEmptyHint instead).
      const shelfLbl = document.createElement('span');
      shelfLbl.className = 'text-muted fw-semibold align-middle me-3';
      shelfLbl.textContent = 'Shelf';
      chips.appendChild(shelfLbl);
      if (r.entries.length > 1) {
        const allChip = document.createElement('span');
        allChip.className = 'badge bg-primary shelf-chip shelf-chip-all align-middle';
        allChip.textContent = 'All';
        allChip.title =
          'All ' +
          r.entries.length +
          ' items on the Shelf — drag within TagFox; use OS drag button or Alt+drag to send to Explorer';
        bindShelfChipDrag(allChip, allPaths);
        chips.appendChild(allChip);
      }
      for (const ent of r.entries) {
        const row = document.createElement('span');
        row.className = 'd-inline-flex align-items-center gap-0 shelf-chip-with-remove';
        const chip = document.createElement('span');
        chip.className = 'badge bg-secondary shelf-chip align-middle';
        if (ent.isDirectory) {
          const ic = document.createElement('i');
          ic.className = 'fa-solid fa-folder tagfox-runner-only me-1';
          ic.setAttribute('aria-hidden', 'true');
          chip.appendChild(ic);
        }
        chip.appendChild(document.createTextNode(ent.name));
        chip.title =
          ent.fullPath +
          (ent.isDirectory ? ' (folder)' : '') +
          ' — drag within TagFox; use OS drag button or Alt+drag to send to Explorer';
        bindShelfChipDrag(chip, [ent.fullPath]);
        row.appendChild(chip);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className =
          'btn btn-sm btn-outline-secondary flex-shrink-0 d-inline-flex align-items-center justify-content-center p-0 shelf-chip-remove';
        rm.style.width = '1.25rem';
        rm.style.height = '1.25rem';
        rm.title = 'Send this item to the Recycle Bin';
        rm.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        rm.addEventListener(
          'mousedown',
          (ev) => {
            ev.stopPropagation();
          },
          true
        );
        rm.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const rmFn = window.tagBrowser && window.tagBrowser.removeShelfPaths;
          if (!rmFn) {
            setStatusMain('Fully quit TagFox and start again so Shelf remove is available.');
            return;
          }
          void (async () => {
            const res = await rmFn([ent.fullPath]);
            if (!res.ok) setStatusMain(res.error || 'Remove from Shelf failed');
          })();
        });
        row.appendChild(rm);
        chips.appendChild(row);
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
              setStatusMain(st.error || 'Shelf unavailable');
              return;
            }
            const destKey = pathNormKey(st.path);
            const filtered = paths.filter((p) => pathNormKey(p) !== destKey);
            if (!filtered.length) return;

            let r;
            if (copy) {
              setBusyStatusHint(
                filtered.length === 1 ? 'Copying 1 item to Shelf...' : 'Copying ' + filtered.length + ' items to Shelf...'
              );
              r = await scopeCopyOrMoveWithConflictPrompt('copy', {
                sourcePaths: filtered,
                destFolder: st.path,
                rootPrefix: '',
              });
            } else {
              if (!window.tagBrowser.movePathsIntoFolder) {
                setStatusMain('Move not available.');
                return;
              }
              r = await scopeCopyOrMoveWithConflictPrompt('move', {
                sourcePaths: filtered,
                destFolder: st.path,
                rootPrefix: '',
              });
            }
            setStatusMain(
              r.ok
                ? r.noop
                  ? 'Already on the Shelf.'
                  : copy
                    ? 'Copied to Shelf.'
                    : 'Moved to Shelf.'
                : r.error || (copy ? 'Shelf copy failed' : 'Shelf move failed')
            );
            if (r.ok && !r.noop) void refreshAfterDiskMutation({ paths: filtered, destFolder: st.path });
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

    /** Two or more checked rows: the bulk bar sits docked at the bottom of the results pane. One checked
        row needs none, since its own row buttons act on it. */
    function updateBulkBar() {
      const n = checkedPathsMap.size;
      const bar = document.getElementById('bulkBar');
      if (!bar) return;
      const lbl = document.getElementById('bulkBarLabel');
      if (lbl) lbl.textContent = n + ' selected:';
      const show = n >= 2;
      bar.classList.toggle('d-none', !show);
      bar.setAttribute('aria-hidden', show ? 'false' : 'true');
      /* Runner hides the checkbox column until a multi-selection starts; this brings it back. */
      document.body.classList.toggle('tagfox-multi-checked', show);
    }

    /** Uncheck all result rows (bulk bar “Clear selection”). */
    function clearResultsCheckedSelection() {
      clearResultsRowUncheckPending();
      if (!checkedPathsMap.size) return;
      checkedPathsMap.clear();
      updateBulkBar();
      renderTable();
    }

    function clearResultsRowUncheckPending() {
      if (!resultsRowUncheckTimer) return;
      clearTimeout(resultsRowUncheckTimer);
      resultsRowUncheckTimer = null;
      resultsRowUncheckPendingFp = null;
    }

    /** Plain click / Home / End / single-step ↑↓: one checked row; checks stay aligned with focus (Explorer-style). */
    function resultsExclusiveSelectRow(row, fp) {
      clearResultsRowUncheckPending();
      resultsShiftRangeAnchorIdx = null;
      checkedPathsMap.clear();
      toggleCheckPath(fp, true);
      setSelection(row, fp);
      syncResultsRowCheckboxStates();
    }

    /** No list row selected (all checkboxes cleared): clear highlight + props to scope fallback. */
    function clearResultsRowSelection() {
      selectedRow = null;
      selectedFullPath = null;
      renderScopeBreadcrumbIfScopeChanged();
      syncResultsSelectionHighlight();
      refreshPropsPanelQuick();
      schedulePropsPreviewHeavy();
      focusResultsWrapAfterListSelection();
    }

    /** Plain click on a row that is already checked: uncheck it; focus next checked row or clear selection. */
    function resultsPlainClickUncheckRow(fp) {
      toggleCheckPath(fp, false);
      resultsShiftRangeAnchorIdx = null;
      syncResultsRowCheckboxStates();
      for (const r of listRowsForUi()) {
        const p = fullPathForRow(r);
        if (isCheckedPath(p)) {
          setSelection(r, p);
          return;
        }
      }
      clearResultsRowSelection();
    }

    /** Check every row in the current visible list (respects tag / hide-.folder filters). */
    function selectAllVisibleResultRows() {
      resultsShiftRangeAnchorIdx = null;
      const vis = listRowsForUi();
      if (!vis.length) return;
      for (const row of vis) {
        toggleCheckPath(fullPathForRow(row), true);
      }
      syncResultsRowCheckboxStates();
      setSelection(vis[vis.length - 1], fullPathForRow(vis[vis.length - 1]));
    }


    function fullPathForRow(row) {
      const name = (row.name || '').trim();
      let dir = (row.path || '').trim().replace(/[/\\]+$/, '');
      if (!name) return dir;
      if (!dir) return name;
      const sep = dir.includes('/') ? '/' : '\\';
      /* Synthetic grouping: always join; never treat parent tail === name as “full path already in path”. */
      if (row.__pathGroupingSynthetic) return dir + sep + name;
      const endsWithFile =
        dir.length >= name.length &&
        dir.slice(-name.length).toLowerCase() === name.toLowerCase() &&
        (dir.length === name.length || dir[dir.length - name.length - 1] === sep || dir[dir.length - name.length - 1] === '\\');
      if (endsWithFile) return dir;
      return dir + sep + name;
    }

    function searchDebugPathLooksLikeShortcutTargets(fullPath) {
      return /[\\/]\.(shortcut-targets-by-id|shortcuts-by-id)([\\/]|$)/i.test(String(fullPath || '').trim());
    }

    function isGoogleDriveSharedDrivesPath(fullPath) {
      const s = normalizeFolderPathForEverything(String(fullPath || '').trim()).replace(/\//g, '\\');
      return /^[a-zA-Z]:\\shared drives(?:\\|$)/i.test(s);
    }

    function isGoogleDriveCloudBrowseFallbackPath(fullPath) {
      if (searchDebugPathLooksLikeShortcutTargets(fullPath)) return true;
      if (isGoogleDriveSharedDrivesPath(fullPath)) return true;
      // Bare Filestream root (G:\, H:\): Everything's NTFS index misses the virtual "Shared drives" entry.
      const s = String(fullPath || '').trim().replace(/\//g, '\\').replace(/\\+$/, '');
      if (/^[a-zA-Z]:$/.test(s) && googleDriveDebugRootLetter(s + '\\')) return true;
      return false;
    }

    function googleDriveDebugRootLetter(fullPath) {
      const s = normalizeFolderPathForEverything(String(fullPath || '').trim());
      const m = /^([a-zA-Z]):\\/.exec(s);
      if (!m) return '';
      const L = String(m[1] || '').toUpperCase();
      return L === 'G' || L === 'H' ? L : '';
    }

    async function maybeBuildLocalCloudBrowseFallbackRows({ runId, rootFolder, query, recursive }) {
      const normRoot = normalizeFolderPathForEverything(String(rootFolder || '').trim());
      const plainBrowseOnly = !String(query || '').trim() && activeTagKeys.size === 0 && recencyFilterMode() === 'all';
      if (!normRoot || !plainBrowseOnly) return null;
      /* Google Drive virtual entries (shared drives owned by others, un-hydrated shortcuts) are invisible to
         Everything's NTFS index — fs.readdir via the Cloud Files API sees them all. Always prefer the local
         listing for these paths in plain browse, even when Everything returned a partial set. */
      if (!isGoogleDriveCloudBrowseFallbackPath(normRoot)) return null;
      if (!window.tagBrowser || typeof window.tagBrowser.listFolderEntries !== 'function') {
        searchDebugLog('runSearch.localFolderFallback.skip', { runId, reason: 'noBridge', rootFolder: normRoot });
        return null;
      }
      let res;
      try {
        res = await window.tagBrowser.listFolderEntries({ parentPath: normRoot });
      } catch (e) {
        if (runId !== searchRunSeq) return null;
        searchDebugLog('runSearch.localFolderFallback.throw', {
          runId,
          rootFolder: normRoot,
          err: String(e && e.message ? e.message : e),
        });
        return null;
      }
      if (runId !== searchRunSeq) return null;
      if (!res || !res.ok) {
        searchDebugLog('runSearch.localFolderFallback.error', {
          runId,
          rootFolder: normRoot,
          err: (res && res.error) || 'local listing failed',
        });
        return null;
      }
      const rows = Array.isArray(res.entries) ? res.entries : [];
      searchDebugLog(rows.length ? 'runSearch.localFolderFallback.use' : 'runSearch.localFolderFallback.empty', {
        runId,
        rootFolder: normRoot,
        recursiveRequested: !!recursive,
        immediateOnly: true,
        kind: isGoogleDriveSharedDrivesPath(normRoot) ? 'shared-drives' : 'shortcut-targets',
        rows: rows.length,
        first: rows.slice(0, 5).map((r) => fullPathForRow(r)),
      });
      return rows;
    }

    function searchDebugQuotedTreeToken(normPath, withTrailingSlash) {
      const p = normalizeFolderPathForEverything(String(normPath || '').trim()).replace(/[/\\]+$/, '');
      if (!p) return '';
      return '"' + p.replace(/"/g, '') + (withTrailingSlash ? '\\' : '') + '"';
    }

    function searchDebugModeSuffix(foldersOnly, fileOnly) {
      if (foldersOnly) return ' folder:';
      if (fileOnly) return ' file: sort-mix:';
      return ' sort-mix:';
    }

    async function runSearchDebugScopeProbe({
      runId,
      baseUrl,
      httpUser,
      httpPassword,
      rootFolder,
      query,
      recursive,
      foldersOnly,
      filesOnly,
      currentSearchText,
      currentOptions,
      currentRowsLen,
      resultSource,
    }) {
      if (!isSearchDebugOn()) return;
      const normRoot = normalizeFolderPathForEverything(String(rootFolder || '').trim());
      const gdRootLetter = googleDriveDebugRootLetter(normRoot);
      if (!normRoot) return;
      const shortcutPath = searchDebugPathLooksLikeShortcutTargets(normRoot);
      if (!shortcutPath && currentRowsLen > 0) return;
      const plainBrowseOnly = !String(query || '').trim() && activeTagKeys.size === 0 && recencyFilterMode() === 'all';
      searchDebugLog('scope.debug.begin', {
        runId,
        normRoot,
        shortcutPath,
        recursive,
        foldersOnly: !!foldersOnly,
        filesOnly: !!filesOnly,
        currentRows: currentRowsLen,
        resultSource: String(resultSource || 'everything'),
        googleDriveRootLetter: gdRootLetter || undefined,
        query: String(query || ''),
        plainBrowseOnly,
        currentSearchText,
        currentOptions,
      });
      if (window.tagBrowser && typeof window.tagBrowser.debugFolderSnapshot === 'function') {
        try {
          const snap = await window.tagBrowser.debugFolderSnapshot({ folderPath: normRoot });
          if (runId !== searchRunSeq) return;
          searchDebugLog('scope.debug.folderSnapshot', snap);
        } catch (e) {
          if (runId !== searchRunSeq) return;
          searchDebugLog('scope.debug.folderSnapshotError', { err: String(e && e.message ? e.message : e) });
        }
      } else {
        searchDebugLog('scope.debug.folderSnapshotSkip', { reason: 'noBridge' });
      }
      if (!plainBrowseOnly) {
        searchDebugLog('scope.debug.httpProbeSkip', { runId, reason: 'queryTagsOrRecencyActive' });
        return;
      }
      const suffix = searchDebugModeSuffix(foldersOnly, filesOnly);
      const cleanRoot = normalizeFolderPathForEverything(normRoot).replace(/[/\\]+$/, '');
      const safeRoot = cleanRoot.replace(/"/g, '');
      const variants = [
        {
          label: 'treeQuotedTrailingSlash_p1',
          searchText: (searchDebugQuotedTreeToken(cleanRoot, true) + suffix).trim(),
          options: { ...currentOptions, pathSearch: true, offset: 0 },
        },
        {
          label: 'treeQuotedNoTrailingSlash_p1',
          searchText: (searchDebugQuotedTreeToken(cleanRoot, false) + suffix).trim(),
          options: { ...currentOptions, pathSearch: true, offset: 0 },
        },
        {
          label: 'treeQuotedNoTrailingSlash_p0',
          searchText: (searchDebugQuotedTreeToken(cleanRoot, false) + suffix).trim(),
          options: { ...currentOptions, pathSearch: false, offset: 0 },
        },
        {
          label: 'parentImmediate_p1',
          searchText: ('parent:"' + safeRoot + '"' + suffix).trim(),
          options: { ...currentOptions, pathSearch: true, offset: 0 },
        },
      ];
      for (const variant of variants) {
        let res;
        try {
          res = await window.tagBrowser.search({
            baseUrl,
            searchText: variant.searchText,
            count: '20',
            httpUser,
            httpPassword,
            options: variant.options,
          });
        } catch (e) {
          if (runId !== searchRunSeq) return;
          searchDebugLog('scope.debug.httpProbeThrow', {
            runId,
            label: variant.label,
            err: String(e && e.message ? e.message : e),
          });
          continue;
        }
        if (runId !== searchRunSeq) return;
        const rows = Array.isArray(res && res.rows) ? res.rows : [];
        searchDebugLog('scope.debug.httpProbe', {
          runId,
          label: variant.label,
          searchText: variant.searchText,
          pathSearch: !!variant.options.pathSearch,
          ok: !!(res && res.ok),
          rows: rows.length,
          first: rows.slice(0, 3).map((r) => fullPathForRow(r)),
          err: res && res.ok ? '' : (res && res.error) || 'unknown',
          ...(res && res.debug ? { debug: res.debug } : {}),
        });
      }
    }

    /** Everything index can lag after many renames; align lastRows + check map with paths we just wrote. */
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

    /** After tag renames, scheduled search retries replace lastRows without this — stale index shows old+new until pruned. */
    function applyTagRenamePendingToLastRows() {
      const pairs = tagRenamePendingPairs;
      if (!pairs || !pairs.length) return;
      patchResultRowsAfterRenames(pairs);
      pruneLastRowsRenamedSources(pairs);
      dedupeLastRowsByPathKey();
      sortLastRowsForDisplay(true);
    }

    /** Paths just moved away or recycled: hide their rows at once and stop a lagging Everything index resurrecting them. */
    const goneTombstoneKeys = new Map();
    const GONE_TOMBSTONE_TTL_MS = 15000;
    function registerGoneTombstones(paths) {
      const until = Date.now() + GONE_TOMBSTONE_TTL_MS;
      for (const p of Array.isArray(paths) ? paths : []) {
        const k = pathNormKey(p);
        if (!k) continue;
        goneTombstoneKeys.set(k, until);
        checkedPathsMap.delete(k);
      }
    }

    /** A path recreated at a tombstoned location (moved back, re-copied) must show again at once. */
    function clearGoneTombstones(paths) {
      for (const p of Array.isArray(paths) ? paths : []) {
        const k = pathNormKey(p);
        if (k) goneTombstoneKeys.delete(k);
      }
    }

    /** Drop tombstoned rows (and children of tombstoned folders) from lastRows; expired tombstones fall away here. */
    function applyGoneTombstonesToLastRows() {
      if (!goneTombstoneKeys.size) return;
      const now = Date.now();
      for (const [k, until] of goneTombstoneKeys) {
        if (until <= now) goneTombstoneKeys.delete(k);
      }
      if (!goneTombstoneKeys.size) return;
      lastRows = lastRows.filter((row) => {
        const k = pathNormKey(fullPathForRow(row));
        if (!k) return true;
        if (goneTombstoneKeys.has(k)) return false;
        for (const g of goneTombstoneKeys.keys()) {
          if (k.length > g.length && k.startsWith(g + '\\')) return false;
        }
        return true;
      });
    }

    /** Instant repaint after move/delete; the scheduled search refreshes then confirm against the index. */
    function removeGonePathsFromUiNow(paths) {
      if (!paths || !paths.length) return;
      registerGoneTombstones(paths);
      renderTable();
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
      /* Runner merges extra queries into the page, so it always sorts here, and its smart order re-ranks. */
      if (isRunnerMode()) {
        if (runnerSort === 'smart') rankRowsForRunner(lastRows);
        else sortRowsForDisplay(lastRows, sortColumn, sortAsc);
        return;
      }
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
              .filter((x) => !(T && T.isDateTag && T.isDateTag(x.key))) // drop any deadline saved by older builds
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
      if (T && T.isDateTag && T.isDateTag(k)) return; // deadlines have their own filter
      const d = String(display || key).trim() || k;
      if (knownBracketTagsList.some((t) => t.key === k)) return;
      knownBracketTagsList.push({ key: k, display: d });
      if (knownBracketTagsList.length > KNOWN_BRACKET_TAGS_MAX) {
        knownBracketTagsList = knownBracketTagsList.slice(0, KNOWN_BRACKET_TAGS_MAX);
      }
      saveKnownBracketTags();
      scheduleTagPrefsDiskSync();
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
      if (excludedTagKeys.size) localStorage.setItem(LS.excludedTagFilter, JSON.stringify([...excludedTagKeys].sort()));
      else localStorage.removeItem(LS.excludedTagFilter);
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

    /** Muted red tray on the recency control when a bucket other than All is selected. */
    function syncRecencyFilterActiveHighlight() {
      const wrap = document.querySelector('.tagfox-recency-filter-wrap');
      if (!wrap) return;
      wrap.classList.toggle('tagfox-recency-filter-wrap--active', recencyFilterMode() !== 'all');
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
      syncRecencyFilterActiveHighlight();
    }

    /** Keyboard quick toggle: recent hour window vs no recency filter. */
    function toggleRecencyAllVsHour() {
      const next = recencyFilterMode() === '1h' ? 'all' : '1h';
      setRecencyFilterMode(next);
      const nextEl = document.querySelector(`input[name="tagFoxRecencyFilter"][value="${next}"]`);
      nextEl?.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /** Settings → global shortcut capture: require modifiers (Electron globalShortcut). */
    let globalToggleRecording = false;
    let quickTodoHotkeyRecording = false;

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

    async function refreshQuickTodoHotkeyFromMain() {
      const inp = document.getElementById('quickTodoHotkeyDisplay');
      if (!inp || !window.tagBrowser || typeof window.tagBrowser.quickTodoHotkeyGet !== 'function') return;
      try {
        const r = await window.tagBrowser.quickTodoHotkeyGet();
        if (r && r.accelerator) inp.value = r.accelerator;
      } catch (_) {}
    }

    function setGlobalToggleRecording(on) {
      globalToggleRecording = !!on;
      if (on) setQuickTodoHotkeyRecording(false);
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

    function setQuickTodoHotkeyRecording(on) {
      quickTodoHotkeyRecording = !!on;
      if (on) setGlobalToggleRecording(false);
      const inp = document.getElementById('quickTodoHotkeyDisplay');
      const btn = document.getElementById('btnRecordQuickTodoHotkey');
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
      if (!on) void refreshQuickTodoHotkeyFromMain();
    }

    /* saveSettings is a no-op until loadSettings completes: a partial load (exception mid-way, e.g. a
       live-reload against a half-edited DOM) leaves later checkboxes at their unchecked defaults, and
       persisting those would silently overwrite the user's stored settings with defaults. That is how
       Hover preview turned itself off in July 2026. */
    let settingsLoadCompleted = false;

    function loadSettings() {
      migrateLocalStorageFromLegacy();
      loadTagStore();
      loadKnownBracketTags();
      document.getElementById('baseUrl').value =
        localStorage.getItem(LS.baseUrl) || 'http://127.0.0.1';
      document.getElementById('rootFolder').value = localStorage.getItem(LS.rootFolder) || '';
      {
        const qf = document.getElementById('quickTodoFolder');
        if (qf) qf.value = localStorage.getItem(LS.quickTodoFolder) || '';
      }
      loadSearchScopeMaxFromStorage();
      renderSearchScopeMaxUi();
      clampRootFolderUnderSearchScopeMax();
      document.getElementById('maxResults').value =
        localStorage.getItem(LS.maxResults) || '60';
      document.getElementById('httpUser').value = localStorage.getItem(LS.httpUser) || '';
      document.getElementById('optCase').checked = localStorage.getItem(LS.optCase) === '1';
      document.getElementById('optWholeWord').checked = localStorage.getItem(LS.optWholeWord) === '1';
      if (localStorage.getItem(LS.optPathDefaultMoved) !== '1') { localStorage.setItem(LS.optPathDefaultMoved, '1'); localStorage.setItem(LS.optPath, '1'); }
      document.getElementById('optPath').checked = localStorage.getItem(LS.optPath) !== '0';
      document.getElementById('optDiacritics').checked = localStorage.getItem(LS.optDiacritics) === '1';
      document.getElementById('optHideSpecial').checked = localStorage.getItem(LS.optHideSpecial) === '1';
      document.getElementById('optHideTilde').checked = localStorage.getItem(LS.optHideTilde) === '1';
      {
        const showSubs = localStorage.getItem(LS.showSubfolders) !== '0';
        let content = localStorage.getItem(LS.resultsContent);
        if (!['all', 'folders', 'files'].includes(content)) {
          content = localStorage.getItem(LS.hideFiles) === '1' ? 'folders' : 'all';
          localStorage.setItem(LS.resultsContent, content);
        }
        setResultsViewRadios(showSubs, content);
      }
      /* Recency is a "right now" filter: always launch at All rather than restoring a persisted time window.
         A stale 1h/1d would otherwise silently cap every search after a restart (looks like search is broken). */
      setRecencyFilterMode('all');
      restoreDeadlineFilter();
      restoreHideUntilFilter();
      sortColumn = localStorage.getItem(LS.sortBy) || 'name';
      if (sortColumn === 'ext') sortColumn = 'name';
      if (!['name', 'path', 'date_modified', 'size'].includes(sortColumn)) sortColumn = 'name';
      sortAsc = localStorage.getItem(LS.optAsc) !== '0';
      document.getElementById('optFolderGroupHighlight').checked = localStorage.getItem(LS.folderGroupHighlight) !== '0';
      {
        const hm = document.getElementById('optHighlightMatchedNames');
        if (hm) hm.checked = localStorage.getItem(LS.highlightMatchedNames) !== '0';
        const th = document.getElementById('optResultThumbnails');
        if (th) th.checked = localStorage.getItem(LS.resultThumbnails) === '1';
        const hp = document.getElementById('optHoverPreview');
        if (hp) hp.checked = localStorage.getItem(LS.hoverPreview) === '1';
      }
      /* Default on; only stays off when user saved off ('0'). */
      document.getElementById('optSearchDebug').checked = localStorage.getItem(LS.searchDebug) !== '0';
      activeTagKeys = activeTagKeysFromStored(localStorage.getItem(LS.activeTagFilter));
      // Excluded ⊆ active (drop any stale exclusion whose tag is no longer an active filter).
      excludedTagKeys = new Set([...activeTagKeysFromStored(localStorage.getItem(LS.excludedTagFilter))].filter((k) => activeTagKeys.has(k)));
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
          let v = localStorage.getItem(LS.autoRefreshSec);
          /* Auto-refresh defaulted to Off because every tick rebuilt the table whether or not anything
             had changed. A tick now repaints only on a real change, so on is the useful default, and
             this carries an existing Off over once. An Off chosen after the move survives, because the
             marker is written on the first load either way. */
          if (localStorage.getItem(LS.autoRefreshDefaultMoved) !== '1') {
            localStorage.setItem(LS.autoRefreshDefaultMoved, '1');
            if (!allowed.has(String(v)) || String(v) === '0') v = '5';
          }
          sel.value = allowed.has(String(v)) ? String(v) : '5';
        }
      }
      syncGlobalViewerBasenamesInputFromStorage();
      syncAutoRefreshTimer();
      searchDebugRender();
      void refreshGlobalToggleHotkeyFromMain();
      void refreshQuickTodoHotkeyFromMain();
      renderQuickTodoFolderUi();
      syncAdvancedSearchIconFilledState();
      settingsLoadCompleted = true;
    }

    function saveSettings() {
      if (!settingsLoadCompleted) return;
      /* Runner's own search state is applied at every start in Runner, so it is kept current here: written
         only on leaving Runner, a change made in Runner (system files, whole words) was gone after a restart. */
      if (runnerModeOn) lsSetJson(LS.runnerState, serializeSearchState());
      localStorage.setItem(LS.baseUrl, document.getElementById('baseUrl').value.trim());
      localStorage.setItem(LS.rootFolder, document.getElementById('rootFolder').value.trim());
      {
        const qf = document.getElementById('quickTodoFolder');
        if (qf) localStorage.setItem(LS.quickTodoFolder, qf.value.trim());
      }
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
      localStorage.setItem(LS.resultsContent, resultsContentMode());
      localStorage.setItem(LS.showSubfolders, isShowSubfolders() ? '1' : '0');
      localStorage.setItem(LS.hideFiles, isFoldersOnly() ? '1' : '0');
      /* Recency intentionally not persisted (see loadSettings): it always launches at All. */
      localStorage.setItem(LS.sortBy, sortColumn);
      localStorage.setItem(LS.optAsc, sortAsc ? '1' : '0');
      localStorage.setItem(LS.folderGroupHighlight, document.getElementById('optFolderGroupHighlight').checked ? '1' : '0');
      {
        const hm = document.getElementById('optHighlightMatchedNames');
        if (hm) localStorage.setItem(LS.highlightMatchedNames, hm.checked ? '1' : '0');
        const th = document.getElementById('optResultThumbnails');
        if (th) localStorage.setItem(LS.resultThumbnails, th.checked ? '1' : '0');
        const hp = document.getElementById('optHoverPreview');
        if (hp) localStorage.setItem(LS.hoverPreview, hp.checked ? '1' : '0');
      }
      localStorage.setItem(LS.searchDebug, document.getElementById('optSearchDebug').checked ? '1' : '0');
      localStorage.setItem(LS.tagFilterCombineOr, tagFilterCombineOr ? '1' : '0');
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

    /** One textarea write per frame: a search appends dozens of lines, and rewriting the whole log for
        each one cost about 0.6s per search (profiled October 2026). */
    let searchDebugRenderQueued = false;
    function searchDebugRender() {
      if (searchDebugRenderQueued) return;
      searchDebugRenderQueued = true;
      requestAnimationFrame(() => {
        searchDebugRenderQueued = false;
        const box = document.getElementById('searchDebugLog');
        if (!box) return;
        box.value = searchDebugLines.join('\n');
        box.scrollTop = box.scrollHeight;
      });
    }

    function searchDebugClear() {
      searchDebugLines = [];
      searchDebugRender();
    }

    /** Append one line and trim buffer (shared by searchDebugLog + console mirror). */
    function searchDebugAppend(line) {
      searchDebugLines.push(line);
      if (searchDebugLines.length > SEARCH_DEBUG_MAX) {
        searchDebugLines = searchDebugLines.slice(searchDebugLines.length - SEARCH_DEBUG_MAX);
      }
      searchDebugRender();
    }

    /** System clipboard as plain text — prefer main process (Electron). */
    async function copyPlainTextToClipboard(text) {
      if (window.tagBrowser && typeof window.tagBrowser.clipboardWriteText === 'function') {
        const r = await window.tagBrowser.clipboardWriteText(text);
        if (r && r.ok) return true;
      }
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        return false;
      }
    }

    /** Brief status hint for longer copy/paste work so large transfers do not look stuck. */
    function setBusyStatusHint(text) {
      setStatusMain(text);
      pulseStatusBarBrief();
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
      searchDebugAppend(line);
      try {
        nativeConsole.debug(line);
      } catch (_) {}
    }

    /* ---- Perf probes: only log to the search-debug buffer, only when something runs slow. ---- */
    const PERF_SLOW_MS = 120;
    /** Await fn; log perf.slow {label, ms, ...meta} if it ran past the threshold. Returns fn's value. */
    async function perfTimeAsync(label, meta, fn) {
      const t0 = performance.now();
      try {
        return await fn();
      } finally {
        const ms = Math.round(performance.now() - t0);
        if (ms >= PERF_SLOW_MS) searchDebugLog('perf.slow', { label, ms, ...(meta || {}) });
      }
    }
    /** Run a synchronous block (e.g. a render); same slow-logging contract. Returns fn's value. */
    function perfTimeSync(label, meta, fn) {
      const t0 = performance.now();
      try {
        return fn();
      } finally {
        const ms = Math.round(performance.now() - t0);
        if (ms >= PERF_SLOW_MS) searchDebugLog('perf.slow', { label, ms, ...(meta || {}) });
      }
    }
    /** One long-task observer (jank: a big sort, a full table re-render): the debug buffer gets every one,
        the perf log only those long enough to be felt, so a slow raise can be read without debug on. */
    function installLongTaskMonitor() {
      if (typeof PerformanceObserver !== 'function') return;
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const ms = Math.round(e.duration);
            if (ms >= PERF_SLOW_MS) searchDebugLog('perf.longtask', { ms });
            if (ms >= 500) {
              try {
                window.tagBrowser?.perfLog?.('longtask ' + ms + 'ms');
              } catch (_) {}
            }
          }
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch (_) {}
    }

    /* The symptom Steve reports is renderer-side ("the search box will not take a keystroke for
       seconds"), and main cannot see it, so the renderer reports its own jank into the same perf log:
       event-loop lag, long tasks, when the page went hidden, and how long a keystroke took to paint.
       Thresholds are set so an ordinary session writes nothing. */
    function installRendererPerfProbe() {
      const log = (line) => {
        try {
          window.tagBrowser?.perfLog?.(line);
        } catch (_) {}
      };
      let last = performance.now();
      setInterval(() => {
        const now = performance.now();
        const drift = Math.round(now - last - 250);
        last = now;
        /* A hidden window is throttled by design, so only visible-time lag is signal. */
        if (drift > 750 && !document.hidden) log('lag ' + drift + 'ms foc=' + (document.hasFocus() ? 1 : 0));
      }, 250);
      /* Long tasks come from installLongTaskMonitor, which owns the one observer. */
      /* Two lines per hide/show cycle, and the raise line is only readable against them. */
      document.addEventListener('visibilitychange', () =>
        log('vis=' + document.visibilityState + ' foc=' + (document.hasFocus() ? 1 : 0))
      );
      const q = document.getElementById('query');
      if (q) {
        q.addEventListener('keydown', (e) => {
          const t0 = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const ms = Math.round(performance.now() - t0);
              if (ms >= 250) log('key ' + JSON.stringify(e.key) + ' to-paint=' + ms + 'ms');
            })
          );
        });
      }
    }

    function searchDebugFormatConsoleArgs(args) {
      const parts = [];
      for (let i = 0; i < args.length; i++) {
        const x = args[i];
        if (x === undefined) {
          parts.push('undefined');
          continue;
        }
        if (x === null) {
          parts.push('null');
          continue;
        }
        const typ = typeof x;
        if (typ === 'string') {
          parts.push(x);
          continue;
        }
        if (typ === 'number' || typ === 'boolean' || typ === 'bigint') {
          parts.push(String(x));
          continue;
        }
        try {
          parts.push(JSON.stringify(x));
        } catch {
          parts.push(Object.prototype.toString.call(x));
        }
      }
      return parts.join(' ');
    }

    /** Copy browser console into the search debug textarea when “Log search details” is on (Copy log btn). */
    function installSearchDebugConsoleMirror() {
      const mirror = (level, args) => {
        if (!isSearchDebugOn()) return;
        searchDebugAppend(
          '[' + searchDebugStamp() + '] console.' + level + ' ' + searchDebugFormatConsoleArgs(args)
        );
      };
      console.log = (...args) => {
        nativeConsole.log(...args);
        mirror('log', args);
      };
      console.debug = (...args) => {
        nativeConsole.debug(...args);
        mirror('debug', args);
      };
      console.info = (...args) => {
        nativeConsole.info(...args);
        mirror('info', args);
      };
      console.warn = (...args) => {
        nativeConsole.warn(...args);
        mirror('warn', args);
      };
      console.error = (...args) => {
        nativeConsole.error(...args);
        mirror('error', args);
      };
    }

    installSearchDebugConsoleMirror();

    /** Search-debug only: DOM + Bootstrap overlay flags for “keyboard dead until alt-tab” / focus bugs. */
    function searchDebugFocusSnapshot(reason, extra) {
      if (!isSearchDebugOn()) return;
      const ae = document.activeElement;
      const summarizeEl = (el) => {
        if (!el) return { tag: 'null' };
        if (el === document.body) return { tag: 'BODY' };
        const tag = (el.tagName || '').toUpperCase();
        const o = { tag, id: el.id || '', typ: (el.type && String(el.type)) || '' };
        const cn = el.className && typeof el.className === 'string' ? el.className : '';
        if (cn) o.cls = cn.split(/\s+/).slice(0, 5).join(' ');
        if (el.isContentEditable) o.ce = true;
        return o;
      };
      const q = document.getElementById('query');
      const payload = {
        reason: String(reason || ''),
        docHasFocus: document.hasFocus(),
        vis: document.visibilityState,
        ae: summarizeEl(ae),
        query: q ? { focus: ae === q, dis: !!q.disabled, ro: !!q.readOnly } : { miss: true },
        ui: {
          modal: !!document.querySelector('.modal.show'),
          offcanvas: !!document.querySelector('.offcanvas.show'),
          dropdown: !!document.querySelector('.dropdown-menu.show'),
          theater: !!document.getElementById('propsAside')?.classList.contains('props-theater'),
          thBd: !document.getElementById('propsTheaterBackdrop')?.classList.contains('d-none'),
        },
      };
      if (extra && typeof extra === 'object') {
        for (const k of Object.keys(extra)) payload[k] = extra[k];
      }
      searchDebugLog('ui.focus', payload);
    }

    /** Limit pullWebContents lines when Search debug is on (query pointerdown would flood). */
    let searchDebugPullWcLastMs = 0;

    /** Keep request options aligned with UI; direction fallback is handled explicitly in runSearch when needed. */
    function everythingOptionsForRequest() {
      return searchOptionsFromUI();
    }

    /** Everything HTTP connection from the Settings fields (baseUrl falls back to localhost; creds untrimmed). */
    function readEverythingConnection() {
      return {
        baseUrl: document.getElementById('baseUrl').value.trim() || 'http://127.0.0.1',
        httpUser: document.getElementById('httpUser').value,
        httpPassword: document.getElementById('httpPassword').value,
      };
    }

    /** Max results clamped to [1, 5000] (the per-page request cap; default 60). */
    function parseMaxResultsCap() {
      return Math.min(5000, Math.max(1, parseInt(String(document.getElementById('maxResults').value).trim(), 10) || 60));
    }

    /** One-shot Everything search using the current Settings connection. opts: { searchText, count, options }. */
    async function everythingSearchOnce({ searchText, count, options }) {
      if (!window.tagBrowser || typeof window.tagBrowser.search !== 'function') return null;
      const { baseUrl, httpUser, httpPassword } = readEverythingConnection();
      return window.tagBrowser.search({ baseUrl, searchText, count: String(count), httpUser, httpPassword, options });
    }

    function serializeSearchState() {
      const advPanel = document.getElementById('searchOptsAdvancedPanel');
      return {
        query: document.getElementById('query').value,
        rootFolder: document.getElementById('rootFolder').value,
        searchScopeMax: getSearchScopeMaxFolderNorm(),
        activeTagKeys: [...activeTagKeys].sort(),
        excludedTagKeys: [...excludedTagKeys].sort(),
        tagFilterCombineOr: !!tagFilterCombineOr,
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
      /* The two layouts share one history; the mark says whose view and filters an entry carries. */
      const s = { ...serializeSearchState(), runner: isRunnerMode() };
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
    }

    function applySearchState(s) {
      document.getElementById('query').value = s.query != null ? String(s.query) : '';
      syncQueryGhostUi();
      document.getElementById('rootFolder').value = s.rootFolder != null ? String(s.rootFolder) : '';
      if (Object.prototype.hasOwnProperty.call(s, 'searchScopeMax')) {
        setSearchScopeMaxFolderFromString(s.searchScopeMax);
        renderSearchScopeMaxUi();
      } else if (Array.isArray(s.searchScopeCeilings) && s.searchScopeCeilings.length) {
        setSearchScopeMaxFolderFromString(s.searchScopeCeilings[0]);
        renderSearchScopeMaxUi();
      }
      clampRootFolderUnderSearchScopeMax();
      if (Array.isArray(s.activeTagKeys)) {
        activeTagKeys = new Set(s.activeTagKeys.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
      } else if (s.activeTagKey != null && String(s.activeTagKey).trim()) {
        activeTagKeys = new Set([String(s.activeTagKey).trim().toLowerCase()]);
      } else {
        activeTagKeys = new Set();
      }
      const excArr = Array.isArray(s.excludedTagKeys) ? s.excludedTagKeys.map((x) => String(x).trim().toLowerCase()) : [];
      excludedTagKeys = new Set(excArr.filter((k) => activeTagKeys.has(k)));
      tagFilterCombineOr = !!s.tagFilterCombineOr;
      {
        const rc =
          s.resultsContent && ['all', 'folders', 'files'].includes(s.resultsContent)
            ? s.resultsContent
            : s.hideFiles
              ? 'folders'
              : 'all';
        setResultsViewRadios(s.showSubfolders !== false, rc);
      }
      document.getElementById('optCase').checked = !!s.optCase;
      document.getElementById('optWholeWord').checked = !!s.optWholeWord;
      document.getElementById('optPath').checked = !!s.optPath;
      document.getElementById('optDiacritics').checked = !!s.optDiacritics;
      document.getElementById('optHideSpecial').checked = !!s.optHideSpecial;
      document.getElementById('optHideTilde').checked = !!s.optHideTilde;
      setRecencyFilterMode(
        s.recencyFilter && ['all', '1h', '1d', '1w', '1m', '1y'].includes(s.recencyFilter) ? s.recencyFilter : 'all'
      );
      let sc = s.sortColumn && String(s.sortColumn);
      if (sc === 'ext') sc = 'name';
      sortColumn = sc && ['name', 'path', 'date_modified', 'size'].includes(sc) ? sc : 'name';
      sortAsc = s.sortAsc !== false;
      const panel = document.getElementById('searchOptsAdvancedPanel');
      const advBtn = document.getElementById('btnToggleSearchOptsAdvanced');
      if (panel && advBtn) {
        const open = !!s.advancedPanelOpen;
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        advBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        syncAdvancedSearchIconFilledState();
      }
    }

    async function goSearchHistory(delta) {
      const next = searchHistIdx + delta;
      if (next < 0 || next >= searchHist.length) return;
      searchHistNavigating = true;
      try {
        searchHistIdx = next;
        const entry = searchHist[searchHistIdx];
        /* Each layout keeps its own view and filters, so a step to an entry made in the other layout
           brings back only its text and folder. */
        applySearchState(!!entry.runner === isRunnerMode() ? entry : { ...serializeSearchState(), query: entry.query, rootFolder: entry.rootFolder });
        persistActiveTagFilter();
        saveSettings();
        syncSortPathClass();
        renderScopeBreadcrumb();
        await runSearchNow();
      } finally {
        searchHistNavigating = false;
      }
    }

    function seedSearchHistoryFromCurrent() {
      searchHist = [{ ...serializeSearchState(), runner: isRunnerMode() }];
      searchHistIdx = 0;
    }

    /** Folder glyph in Name column (Font Awesome). */
    function folderIconEl() {
      const holder = document.createElement('span');
      holder.className = 'folder-type-icon';
      holder.setAttribute('aria-label', 'Folder');
      holder.innerHTML = '<i class="fa-solid fa-folder fa-fw" aria-hidden="true"></i>';
      return holder;
    }

    /** FA class per file “kind” from extension map (plain file / lines / code / office / video). */
    const FILE_ICON_FA = {
      base: 'fa-file',
      text: 'fa-file-lines', // .md / .txt — lines icon, not Office-style glyphs
      word: 'fa-file-word',
      sheet: 'fa-file-excel',
      slides: 'fa-file-powerpoint',
      code: 'fa-file-code',
      media: 'fa-file-video',
      pdf: 'fa-file-pdf',
    };

    function buildFileIconSpecMap() {
      const m = new Map();
      const add = (list, kind, color, label) => {
        for (const e of list) m.set(e, { kind, color, label });
      };
      /* Teal, not blue: a blue lines glyph on a blue tile read as Word's icon at row size. */
      add(['md', 'markdown', 'mdown'], 'text', '#0f8b8d', 'Markdown');
      add(['txt', 'log'], 'text', '#6c757d', 'Text');
      add(['doc', 'docx', 'rtf', 'odt'], 'word', '#2b579a', 'Word');
      add(['msg'], 'text', '#0078d4', 'Outlook');
      add(['xls', 'xlsx', 'csv', 'ods'], 'sheet', '#217346', 'Spreadsheet');
      add(['ppt', 'pptx', 'odp'], 'slides', '#c43e1c', 'Slides');
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

    /** Result-row thumbnails (Settings, Search results). Default off: each visible row costs one OS thumbnail read. */
    function isResultThumbnailsOn() {
      const el = document.getElementById('optResultThumbnails');
      if (el) return !!el.checked;
      return localStorage.getItem(LS.resultThumbnails) === '1';
    }

    /** Extensions where Explorer's shell thumbnail is more useful than the file-type glyph. Others keep the glyph. */
    const THUMBNAIL_EXT = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'heif', 'svg',
      'psd', 'ai', 'raw', 'cr2', 'nef', 'arw', 'dng',
      'mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'm4v',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
    ]);
    /** Inline row glyph size (square); CSS scales the icon box down. Larger size below for the hover preview. */
    const THUMBNAIL_REQ_PX = 64;
    const HOVER_PREVIEW_REQ_PX = 320;
    const HOVER_PREVIEW_DELAY_MS = 320;
    /** Cap so a long browsing session does not retain unbounded data URLs. Entry: a data-URL string on
        success, or { failedAt } for a miss. Misses are NOT cached for ever: the Windows thumbnail cache
        fails intermittently (see makeThumbnail's retry loop in main.js), and a permanently cached null
        left that file showing a bare glyph in the grid and no hover popup until restart. */
    const THUMBNAIL_CACHE_MAX = 2000;
    const THUMBNAIL_NEGATIVE_TTL_MS = 30000;
    const thumbnailCache = new Map();
    /** In-flight dedup: a tile scrolling in while its hover fetch runs must not fire a second shell call. */
    const thumbnailInFlight = new Map();

    /** Cache key folds in mtime (busts on edit) and px (inline 64 and hover 320 are separate entries). */
    function thumbKey(fp, mtime, px) {
      return fp + '|' + (mtime || '') + '|' + px;
    }
    function thumbCacheKey(fp, row, px) {
      return thumbKey(fp, modifiedTimeMs(row), px);
    }
    function thumbCacheSet(key, val) {
      if (thumbnailCache.size >= THUMBNAIL_CACHE_MAX) {
        const first = thumbnailCache.keys().next().value;
        if (first !== undefined) thumbnailCache.delete(first);
      }
      thumbnailCache.set(key, val);
    }
    /** Cached data URL, or undefined when we should ask the shell (never tried, or a stale miss). */
    function thumbCacheGet(key) {
      const v = thumbnailCache.get(key);
      if (typeof v === 'string') return v;
      if (v && Date.now() - v.failedAt < THUMBNAIL_NEGATIVE_TTL_MS) return null; /* recent miss: keep the glyph */
      return undefined;
    }
    /** One shell call per (path, mtime, px); a miss is retried after THUMBNAIL_NEGATIVE_TTL_MS. */
    async function fetchThumbnail(fp, key, px) {
      const cached = thumbCacheGet(key);
      if (cached !== undefined) return cached;
      const running = thumbnailInFlight.get(key);
      if (running) return running;
      const job = (async () => {
        let dataUrl = null;
        try {
          const r = await perfTimeAsync('getThumbnail', { path: fp, px }, () =>
            window.tagBrowser.getThumbnail({ fullPath: fp, size: px })
          );
          if (r && r.ok && r.dataUrl) dataUrl = r.dataUrl;
        } catch (_e) { /* keep glyph */ }
        thumbCacheSet(key, dataUrl || { failedAt: Date.now() });
        thumbnailInFlight.delete(key);
        return dataUrl;
      })();
      thumbnailInFlight.set(key, job);
      return job;
    }
    function applyThumbnail(holder, dataUrl) {
      if (!dataUrl) return; /* keep the file-type glyph */
      holder.innerHTML = '<img class="file-type-thumb" alt="" aria-hidden="true">';
      holder.firstChild.src = dataUrl;
      holder.classList.add('file-type-icon-has-thumb');
    }
    async function loadThumbnail(holder) {
      const fp = holder.dataset.thumbPath;
      const key = holder.dataset.thumbKey;
      if (!fp || !key) return;
      const dataUrl = await fetchThumbnail(fp, key, THUMBNAIL_REQ_PX);
      /* Holder may have been replaced by a re-render; only paint if it still maps to this key. */
      if (holder.isConnected && holder.dataset.thumbKey === key) applyThumbnail(holder, dataUrl);
    }

    /** Streamed Google Drive content (shared drives / shortcut targets) — a shell thumbnail forces a slow
        hydrating download (seconds each) and saturates the serialised queue, so keep the file-type glyph. */
    function isStreamedDrivePathForThumb(fp) {
      const s = String(fp || '');
      return /\\\.shortcut-targets-by-id\\/i.test(s) || /\\Shared drives\\/i.test(s);
    }
    /* Inline thumbnails load lazily: a search can surface hundreds of rows, but the serialised main-process
       queue and slow PDF/Office/streamed providers must only ever work on the handful actually on screen.
       Reset on every renderTable so detached holders are released (the observer holds strong refs). */
    let thumbIntersectionObserver = null;
    function ensureThumbObserver() {
      if (thumbIntersectionObserver || typeof IntersectionObserver !== 'function') return thumbIntersectionObserver;
      thumbIntersectionObserver = new IntersectionObserver(
        (entries, obs) => {
          for (const ent of entries) {
            if (!ent.isIntersecting) continue;
            obs.unobserve(ent.target);
            void loadThumbnail(ent.target);
          }
        },
        { rootMargin: '800px' } /* preload well ahead: a row scrolled to must already have its thumb */
      );
      return thumbIntersectionObserver;
    }
    function resetThumbObserver() {
      if (thumbIntersectionObserver) thumbIntersectionObserver.disconnect();
    }
    /** Swap a file-row glyph for its OS thumbnail; cached hits paint immediately, misses load lazily on scroll-in. */
    function maybeAttachThumbnail(holder, fp, ext, row) {
      if (!isResultThumbnailsOn()) return;
      if (!THUMBNAIL_EXT.has(ext)) return;
      if (!window.tagBrowser || !window.tagBrowser.getThumbnail) return;
      if (isStreamedDrivePathForThumb(fp)) return;
      const key = thumbCacheKey(fp, row, THUMBNAIL_REQ_PX);
      holder.dataset.thumbPath = fp;
      holder.dataset.thumbKey = key;
      const cached = thumbCacheGet(key);
      if (cached !== undefined) {
        applyThumbnail(holder, cached);
        return;
      }
      const obs = ensureThumbObserver();
      if (obs) obs.observe(holder);
      else void loadThumbnail(holder); /* no IntersectionObserver: fall back to eager load */
    }

    /* ---- Hover preview: a larger floating thumbnail while the pointer rests on an eligible row's icon. ----
       Only the icon tile at the left of the row opens it, so moving down the list by name never does.
       It closes on anything that is not that tile: another element under the pointer, a key, a scroll,
       leaving the window, and a repaint of the table. A repaint matters most, because the row under a
       resting pointer is replaced without any mouseout, which is what left previews stuck over the list. */
    function isHoverPreviewOn() {
      const el = document.getElementById('optHoverPreview');
      if (el) return !!el.checked;
      return localStorage.getItem(LS.hoverPreview) === '1';
    }
    let hoverPreviewEl = null;
    let hoverPreviewTimer = null;
    let hoverPreviewActiveKey = null;
    /** The icon tile the preview belongs to; a preview whose tile has left the page is never shown. */
    let hoverPreviewAnchor = null;
    function ensureHoverPreviewEl() {
      if (hoverPreviewEl) return hoverPreviewEl;
      const d = document.createElement('div');
      d.className = 'tagfox-hover-preview d-none';
      d.setAttribute('aria-hidden', 'true');
      d.innerHTML = '<img alt="">';
      document.body.appendChild(d);
      hoverPreviewEl = d;
      return d;
    }
    function hideHoverPreview() {
      if (hoverPreviewTimer) {
        clearTimeout(hoverPreviewTimer);
        hoverPreviewTimer = null;
      }
      hoverPreviewActiveKey = null;
      hoverPreviewAnchor = null;
      if (hoverPreviewEl) {
        hoverPreviewEl.classList.add('d-none');
        const img = hoverPreviewEl.firstChild;
        if (img) img.removeAttribute('src');
      }
    }
    /** Anchor near the entry cursor position, flipping/clamping so the popup stays on screen and, crucially,
     *  never covers the hovered row's action buttons (the .results-td-actions cell revealed on hover). */
    function positionHoverPreview(el, x, y) {
      const margin = 16;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      el.classList.remove('d-none');
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // Right boundary the preview must not cross: default the viewport edge, but pull it left of the hovered
      // row's action buttons so the preview can never obscure them.
      let maxRight = vw - 8;
      const actCell = document.querySelector('#resultsTable tbody tr:hover td.results-td-actions');
      if (actCell) {
        const r = actCell.getBoundingClientRect();
        if (r.width > 0) maxRight = Math.min(maxRight, r.left - 12);
      }
      let left = x + margin; // prefer right of the cursor
      if (left + w > maxRight) left = x - margin - w; // no room → flip to the left of the cursor
      if (left + w > maxRight) left = maxRight - w; // still overlapping the buttons → pin right edge just left of them
      if (left < 8) left = 8;
      let top = y - h / 2;
      if (top < 8) top = 8;
      if (top + h > vh - 8) top = vh - 8 - h;
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }
    async function showHoverPreviewFor(fp, key, x, y, anchor) {
      const dataUrl = await fetchThumbnail(fp, key, HOVER_PREVIEW_REQ_PX);
      const current = () => hoverPreviewActiveKey === key && hoverPreviewAnchor === anchor && anchor.isConnected;
      if (!current() || !dataUrl) return;
      const el = ensureHoverPreviewEl();
      const img = el.firstChild;
      const place = () => {
        if (current()) positionHoverPreview(el, x, y);
      };
      img.onload = place;
      img.src = dataUrl;
      place();
    }
    function onResultRowHoverOver(e) {
      if (!isHoverPreviewOn()) return;
      const tile = e.target.closest && e.target.closest('.file-type-icon');
      const tr = tile && tile.closest('tr[data-thumb-path]');
      const fp = tr && tr.dataset.thumbPath;
      if (!fp) {
        if (hoverPreviewActiveKey) hideHoverPreview();
        return;
      }
      const key = thumbKey(fp, tr.dataset.thumbMtime, HOVER_PREVIEW_REQ_PX);
      if (hoverPreviewActiveKey === key && hoverPreviewAnchor === tile) return; /* still on the same icon */
      hideHoverPreview();
      hoverPreviewActiveKey = key;
      hoverPreviewAnchor = tile;
      const x = e.clientX;
      const y = e.clientY;
      hoverPreviewTimer = setTimeout(() => void showHoverPreviewFor(fp, key, x, y, tile), HOVER_PREVIEW_DELAY_MS);
    }
    /** Leaving the window sends a mouseout with nowhere to go and no mouseover after it. */
    function onResultRowHoverOut(e) {
      if (hoverPreviewActiveKey && !e.relatedTarget) hideHoverPreview();
    }

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

    function renderNameCell(row, preParsed, queryNeedle) {
      const fp = fullPathForRow(row);
      const base = T.baseName(fp);
      const parsed = preParsed || T.parseSegmentTags(base);
      const hit = queryNeedle ? String(queryNeedle) : null;
      const wrap = document.createElement('div');
      wrap.className = 'name-badges d-flex flex-nowrap align-items-center gap-1 min-w-0';
      const lead = document.createElement('span');
      lead.className = 'name-badges-lead';
      if (rowIsFolder(row)) lead.appendChild(folderIconEl());
      else {
        const ext = fileExtFromPretty(parsed.pretty);
        const iconHolder = fileIconEl(ext);
        maybeAttachThumbnail(iconHolder, fp, ext, row);
        lead.appendChild(iconHolder);
      }
      const blob = document.createElement('span');
      blob.className = recencyBlobClassForRow(row);
      blob.title = 'Recency (modified time)';
      lead.appendChild(blob);
      for (const tag of parsed.tags) appendTagPillWithRemove(lead, tag, fp);
      const title = document.createElement('span');
      title.className = 'name-badges-title text-truncate';
      function setTitleText(str) {
        if (hit) appendHighlightedTextInto(title, str, hit);
        else title.textContent = str;
      }
      setTitleText(parsed.pretty);
      /* GDrive shortcut ID folder: show resolved child name (sync from cache, or async on first encounter). */
      if (rowIsFolder(row) && isGDriveShortcutIdRow(row)) {
        const cacheKey = fp.replace(/[/\\]+$/, '').toLowerCase();
        const cached = gdriveShortcutNameCache.get(cacheKey);
        console.log('[GDrive render]', { fp, cacheKey, cached: typeof cached === 'string' ? cached : '(miss)', cacheSize: gdriveShortcutNameCache.size });
        if (typeof cached === 'string') {
          setTitleText('\u{1F517} ' + cached);
        } else {
          title.classList.add('text-muted');
          void resolveGDriveShortcutName(fp).then((name) => {
            if (!name) return;
            setTitleText('\u{1F517} ' + name);
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

    /* ---- Deadline (xd-) range filter -------------------------------------------------------- */
    /** Active deadline range (single, radio): overdue|today|thisweek|nextweek; '' = no filter. */
    let activeDeadlineRange = '';
    const LS_DEADLINE_FILTER = 'tagfox-deadline-filter';
    const DEADLINE_RANGE_IDS = ['overdue', 'today', 'thisweek', 'nextweek'];

    function isoLocalDate(d) {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    }
    /** Today plus this/next week bounds (Monday-start, UK), as comparable ISO strings. */
    function deadlineRangeBounds() {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const dow = (now.getDay() + 6) % 7; // 0 = Monday
      const add = (base, n) => {
        const x = new Date(base);
        x.setDate(x.getDate() + n);
        return x;
      };
      const thisMon = add(now, -dow);
      return {
        today: isoLocalDate(now),
        thisWeekEnd: isoLocalDate(add(thisMon, 6)),
        nextWeekStart: isoLocalDate(add(thisMon, 7)),
        nextWeekEnd: isoLocalDate(add(thisMon, 13)),
      };
    }
    /** ISO date strings compare lexically == chronologically. */
    function deadlineDateInActiveRange(dateStr, b) {
      const r = activeDeadlineRange;
      if (r === 'overdue') return dateStr < b.today;
      if (r === 'today') return dateStr === b.today;
      if (r === 'thisweek') return dateStr >= b.today && dateStr <= b.thisWeekEnd;
      if (r === 'nextweek') return dateStr >= b.nextWeekStart && dateStr <= b.nextWeekEnd;
      return false;
    }
    /** Dates of one family ('deadline' | 'hide') on a row, as YYYY-MM-DD, from leaf name and row.name. */
    function rowDatesOfKind(r, kind) {
      const seen = new Set();
      const collect = (name) => {
        for (const t of T.parseSegmentTags(String(name || '')).tags) {
          if (T.dateKind(t) === kind) seen.add(T.dateBody(t));
        }
      };
      collect(T.baseName(fullPathForRow(r) || ''));
      collect(r && r.name);
      return [...seen];
    }
    function rowDeadlineDates(r) {
      return rowDatesOfKind(r, 'deadline');
    }
    function deadlineFilterActive() {
      return !!activeDeadlineRange;
    }

    /* ---- Hide-until (xh-) filter --------------------------------------------------------------
     * A hide-until date answers "from when", where a deadline answers "by when". A file tagged
     * `xh-2026-09-01` is a real task that simply should not be in front of Steve before that date,
     * so it is dropped from results until then. ON by default, because a hide you have to remember
     * to switch on hides nothing. The reveal toggle is one click, and a revealed hidden row is
     * marked, so "where did that go" always has an answer.
     *
     * Deliberately partial: this only holds inside TagFox. Everything, grep and Drive search cannot
     * parse the token and will still return the file. That is the price of keeping the filename as
     * the whole state, and it is the right way round, since a raw search is a deliberate act of
     * looking for something.
     */
    let showHiddenUntil = false;
    const LS_SHOW_HIDDEN = 'tagfox-show-hidden-until';
    function rowHideUntilDates(r) {
      return rowDatesOfKind(r, 'hide');
    }
    /** Is this row hidden right now, i.e. carrying a hide-until date still in the future? */
    function rowIsHiddenUntilFuture(r, todayIso) {
      const today = todayIso || isoLocalDate(new Date());
      return rowHideUntilDates(r).some((d) => d > today);
    }
    function applyHideUntilFilter(rowsIn) {
      const rows = Array.isArray(rowsIn) ? rowsIn : [];
      if (showHiddenUntil) return rows;
      const today = isoLocalDate(new Date());
      return rows.filter((r) => !rowIsHiddenUntilFuture(r, today));
    }
    function restoreHideUntilFilter() {
      showHiddenUntil = localStorage.getItem(LS_SHOW_HIDDEN) === '1';
    }
    function setShowHiddenUntil(on) {
      showHiddenUntil = !!on;
      if (showHiddenUntil) localStorage.setItem(LS_SHOW_HIDDEN, '1');
      else localStorage.removeItem(LS_SHOW_HIDDEN);
      void runSearchNow();
    }
    function persistDeadlineFilter() {
      localStorage.setItem(LS_DEADLINE_FILTER, activeDeadlineRange);
    }
    function restoreDeadlineFilter() {
      const v = localStorage.getItem(LS_DEADLINE_FILTER) || '';
      activeDeadlineRange = DEADLINE_RANGE_IDS.includes(v) ? v : '';
    }
    /** Set the active deadline range ('' clears) and re-run the search. */
    function setDeadlineRange(range) {
      activeDeadlineRange = DEADLINE_RANGE_IDS.includes(range) ? range : '';
      persistDeadlineFilter();
      commitSearchHistoryNow();
      void runSearchNow();
    }

    /** Tag pills only (no recency / no Hide special / ~); base row set for “did recency remove anything?”. */
    function filteredRowsAfterTagsOnly() {
      let rows = lastRows.slice();
      if (activeTagKeys.size) {
        // Each term is "has tag" (include) or "lacks tag" (exclude, in excludedTagKeys), combined by AND / OR.
        const terms = [...activeTagKeys].map((k) => ({ k, neg: excludedTagKeys.has(k) }));
        const satisfies = (r, t) => {
          const has = T.rowHasTag(r, t.k, fullPathForRow);
          return t.neg ? !has : has;
        };
        if (tagFilterCombineOr && terms.length > 1) {
          rows = rows.filter((r) => terms.some((t) => satisfies(r, t)));
        } else {
          rows = rows.filter((r) => terms.every((t) => satisfies(r, t)));
        }
      }
      return rows;
    }

    /** Same pipeline as listRowsForUi but before Hide special / Hide ~ (for status hints). */
    function filteredRowsBeforeAdvancedPathHides() {
      let rows = filteredRowsAfterTagsOnly();
      if (deadlineFilterActive()) {
        const b = deadlineRangeBounds();
        rows = rows.filter((r) => rowDeadlineDates(r).some((d) => deadlineDateInActiveRange(d, b)));
      }
      return rows;
    }

    /** Advanced path hides at node level, plus the
     *  hide-until drop, which belongs in the same pass: both answer "should this be on screen". */
    function applyAdvancedPathHides(rowsIn) {
      let rows = Array.isArray(rowsIn) ? rowsIn : [];
      if (isHideSpecialPaths()) {
        rows = rows.filter((r) => !pathUnderHideSpecialSegments(fullPathForRow(r)));
      }
      if (isHideTildePaths()) {
        rows = rows.filter((r) => !pathUnderTildeSegment(fullPathForRow(r)));
      }
      return applyHideUntilFilter(rows);
    }

    /** The rows the list shows: lastRows after the tag, recency and path filters. */
    function listRowsForUi() {
      return applyAdvancedPathHides(filteredRowsBeforeAdvancedPathHides());
    }

    /** True when a popover-only toggle (case / whole-word / diacritics) is checked. Path + hide are exposed icons with their own active state. */
    function anyAdvancedSwitchOn() {
      return ['optCase', 'optWholeWord', 'optDiacritics'].some(
        (id) => document.getElementById(id)?.checked
      );
    }

    /** Filled chip on Advanced (eye) when popover open and/or any advanced checkbox is on. */
    function syncAdvancedSearchIconFilledState() {
      const btn = document.getElementById('btnToggleSearchOptsAdvanced');
      const panel = document.getElementById('searchOptsAdvancedPanel');
      if (!btn || !panel) return;
      const open = !panel.hasAttribute('hidden');
      btn.classList.toggle('tagfox-advanced-filled', open || anyAdvancedSwitchOn());
    }

    function clearEmptyResultsPulseHintClasses() {
      const qWrap = document.getElementById('queryInputGroup');
      qWrap?.classList.remove('pulse-hint', 'pulse-hint--sparse');
      qWrap?.style.removeProperty('--empty-pulse-frac');
      document.getElementById('query')?.classList.remove('pulse-hint', 'pulse-hint--sparse');
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
     * Text in the box and fewer than ten rows on screen: the search box pulses, at full strength for none
     * and weaker as the count rises ((10−n)/10, gone at 10 rows).
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
      const recencyMode = recencyFilterMode();
      const wantQ = inBand && !!(q && q.value && q.value.trim());

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
        (tagFilterCombineOr ? 'or' : 'and') +
        '\0' +
        recencyMode +
        '\0' +
        (isShowSubfolders() ? 'S' : '') +
        resultsContentMode()[0];
      const fpChanged = forceRestart || fp !== pulseHintFingerprint;
      if (fpChanged) {
        pulseHintFingerprint = fp;
        restartPulseHint(qWrap, wantQ, mode, sparseFrac);
        return;
      }

      qWrap?.classList.toggle('pulse-hint', wantQ);
      qWrap?.classList.toggle('pulse-hint--sparse', wantQ && mode === 'sparse');
      if (wantQ && mode === 'sparse') qWrap?.style.setProperty('--empty-pulse-frac', String(sparseFrac));
      else if (!wantQ || mode === 'empty') qWrap?.style.removeProperty('--empty-pulse-frac');
    }

    /** After a successful Everything response: replay hint when visible row count is under 10. */
    function pulseEmptyResultHintsAfterSearchOk() {
      const n = listRowsForUi().length;
      if (n >= 10) return;
      updateEmptyResultsPulseHints(n, { forceRestart: true });
    }

    /** A tag filter's include state: off or excluded → include; include → off. Runner's tag commands change
        the filter through these two, then search. */
    function toggleTagFilterInclude(key, display) {
      if (activeTagKeys.has(key) && !excludedTagKeys.has(key)) {
        activeTagKeys.delete(key);
      } else {
        rememberTag(key, display);
        activeTagKeys.add(key);
        excludedTagKeys.delete(key);
      }
    }

    /** Exclude (not-tag): off or included → exclude; exclude → off. */
    function toggleTagFilterExclude(key, display) {
      if (excludedTagKeys.has(key)) {
        activeTagKeys.delete(key);
        excludedTagKeys.delete(key);
      } else {
        rememberTag(key, display);
        activeTagKeys.add(key);
        excludedTagKeys.add(key);
      }
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
      document.addEventListener(
        'pointermove',
        (e) => {
          if (!document.querySelector('body > .tooltip.show')) return;
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

    /** Bootstrap tooltips for UI chrome; skips results grid unless opts.allowInResultsTable. */
    function refreshTagFoxChromeTooltips(root, opts) {
      if (!root || !window.bootstrap || !bootstrap.Tooltip) return;
      const allowInResults = !!(opts && opts.allowInResultsTable);
      root.querySelectorAll('[title], [data-bs-title]').forEach((el) => {
        if (!allowInResults && el.closest('#resultsTable')) return;
        const dbt = el.getAttribute('data-bs-toggle');
        if (dbt && dbt !== 'tooltip') return;
        const t = normalizeTooltipTitleAttr(el);
        if (!t || !String(t).trim()) return;
        if (el.tagName === 'TEXTAREA') return;
        makeChromeTooltip(el);
      });
    }

    function makeChromeTooltip(el) {
      try {
        const inst = bootstrap.Tooltip.getInstance(el);
        if (inst) inst.dispose();
        el.setAttribute('data-bs-toggle', 'tooltip');
        new bootstrap.Tooltip(el, {
          container: 'body',
          customClass: 'tagfox-ui-tooltip',
          trigger: 'hover',
          animation: false,
          /* Show only on dwell: sweeping the pointer across chip lists must not build a popper per chip. */
          delay: { show: 300, hide: 0 },
        });
      } catch (_) {}
    }

    /** Results rows build their tooltips on first hover, not on every render: an instance for every
        cell and row button cost about 0.9s per 300 rows (profiled October 2026). The new instance has
        missed the mouseover that created it, so the event is replayed on the element. */
    function bindResultsLazyTooltipsOnce() {
      const tbody = document.getElementById('tbody');
      if (!tbody || tbody.dataset.lazyTipsBound === '1') return;
      tbody.dataset.lazyTipsBound = '1';
      tbody.addEventListener('mouseover', (e) => {
        if (!window.bootstrap || !bootstrap.Tooltip || !e.isTrusted) return;
        const el = e.target.closest && e.target.closest('td[data-bs-toggle="tooltip"], .results-td-actions-inner [title]');
        if (!el || !tbody.contains(el) || bootstrap.Tooltip.getInstance(el)) return;
        if (el.tagName === 'TD') new bootstrap.Tooltip(el, { container: 'body', trigger: 'hover', animation: false });
        else {
          const t = normalizeTooltipTitleAttr(el);
          if (!t || !String(t).trim()) return;
          makeChromeTooltip(el);
        }
        el.dispatchEvent(
          new MouseEvent('mouseover', { bubbles: true, relatedTarget: e.relatedTarget, clientX: e.clientX, clientY: e.clientY })
        );
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
      const groupHL = isFolderGroupHighlightOn();

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
    /**
     * Print one markdown row to a sibling PDF through JobCat's make_pdf.py (main process).
     * The run takes seconds, so the status line says it started and then says what it wrote: a PDF
     * appearing silently in a folder nobody is looking at is not a result the user can see.
     */
    async function printRowToPdf(fp, profile, opts) {
      setStatusMain('Making PDF from ' + T.baseName(fp) + '…');
      let res;
      try {
        res = await window.tagBrowser.makePdfFromMarkdown({
          filePath: fp,
          profile,
          overwrite: Boolean(opts && opts.overwrite),
        });
      } catch (e) {
        setStatusMain('Print to PDF failed: ' + String((e && e.message) || e));
        return;
      }
      if (res && res.exists && !(opts && opts.overwrite)) {
        /* Never replace a PDF we did not write: a downloaded report.pdf can sit beside report.md. */
        if (!confirm(T.baseName(res.outputPath) + ' already exists. Overwrite it?')) {
          setStatusMain('Print to PDF cancelled, ' + T.baseName(res.outputPath) + ' kept.');
          return;
        }
        await printRowToPdf(fp, profile, { overwrite: true });
        return;
      }
      if (!res || !res.ok) {
        setStatusMain('Print to PDF failed: ' + ((res && res.error) || 'unknown error'));
        return;
      }
      setStatusMain('PDF written: ' + T.baseName(res.outputPath));
      void refreshAfterDiskMutation({ paths: [res.outputPath] });
    }

    /** Pick a PDF profile (plain / Causal Map / Steve) at the given point, then print. */
    async function pickProfileAndPrintRowToPdf(fp, clientX, clientY) {
      const pick = await window.tagBrowser.showPrintPdfMenu({
        x: Math.round(clientX),
        y: Math.round(clientY),
      });
      if (!pick || !pick.profile) return;
      await printRowToPdf(fp, pick.profile);
    }
    async function openResultsRowItemActionsMenu(fp, clientX, clientY, row) {
      const res = await window.tagBrowser.showItemActionsMenu({
        filePath: fp,
        scopeFolder: document.getElementById('rootFolder').value.trim(),
        inObsidianVault: pathInObsidianVault(fp),
        underGoogleDrive: pathUnderGoogleDrive(fp),
        x: Math.round(clientX),
        y: Math.round(clientY),
      });
      if (res && res.action === 'followShellShortcut' && res.filePath) void followShellShortcutInTagFox(res.filePath);
      else if (res && res.action === 'newFolderInScope') {
        const parentForNew =
          row && rowIsFolder(row) ? normalizeFolderPathForEverything(fullPathForRow(row)) : null;
        void createNewFolderInScopeInteractive(parentForNew);
      } else if (res && res.action === 'editTags') openTagModal(fp);
      else if (res && res.action === 'setCurrentFolder') {
        const target =
          row && rowIsFolder(row) ? normalizeFolderPathForEverything(fullPathForRow(row)) : null;
        if (target) await applySearchScopeAndRefresh(target);
      } else if (res && res.action === 'printPdf') void printRowToPdf(fp, res.profile);
      else if (res && res.action === 'gmistShareLink') void openRowInOnlineGmist(fp, { share: res.share });
      else if (res && res.action === 'openInObsidian') void openRowInObsidian(fp);
      else if (res && res.action === 'rename') void renameItemInteractive(fp);
      else if (res && res.action === 'bulkRename') openBulkRenameModal();
      else if (res && res.action === 'duplicate' && res.destPath)
        setStatusMain('Duplicated as ' + T.baseName(res.destPath));
      else if (res && res.action === 'trash') void refreshAfterDiskMutation({ paths: fp ? [fp] : [], trashed: true });
    }

    function renderTable() {
      const t0 = performance.now();
      /* A quiet tick that does repaint (the rows really did change) must not also throw the reader
         back to the top of a long list. */
      const keepScrollEl = quietAutoRefreshRender ? document.getElementById('resultsScroll') : null;
      const keepScrollTop = keepScrollEl ? keepScrollEl.scrollTop : 0;
      try {
        renderTableImpl();
      } finally {
        if (keepScrollEl && keepScrollTop && keepScrollEl.scrollTop !== keepScrollTop) {
          keepScrollEl.scrollTop = keepScrollTop;
        }
        const ms = Math.round(performance.now() - t0);
        const dom = document.getElementById('tbody')?.childElementCount || 0;
        if (ms >= PERF_SLOW_MS) searchDebugLog('perf.slow', { label: 'render.table', ms, rows: lastRows.length, dom });
      }
    }
    function renderTableImpl() {
      const tbody = document.getElementById('tbody');
      tbody.querySelectorAll('[data-bs-toggle="tooltip"], .results-td-actions-inner [title], .results-td-actions-inner [data-bs-original-title]').forEach((el) => {
        const tip = bootstrap.Tooltip.getInstance(el);
        if (tip) tip.dispose();
      });
      /* Both settle state and neither touches the tbody, so they run before the guard below and the
         signature is taken against what the table would show. */
      applyGoneTombstonesToLastRows();
      pruneCheckedPaths();
      /* An auto-refresh tick that came back with the same rows must not rebuild the table. The rebuild
         is what made the timer intrusive: it drops the scroll position, disposes and remakes every
         tooltip, and moves the row under the pointer. Same guard as the folder-thumbs grid, and it
         fires only for a timer tick, never for F5 or the Refresh command. */
      if (quietAutoRefreshRender) {
        const sig = resultsTableRenderSignature();
        if (sig === lastRenderedTableSig && tbody.childElementCount) return;
      }
      clearInternalPathDragDropTargetHints();
      resetThumbObserver();
      hideHoverPreview(); /* its row is about to go, with no mouseout to say so */
      tbody.innerHTML = '';
      const rowsForDisplay = listRowsForUi();
      renderRunnerFilterChips();
      renderRunnerRankNote();
      /* Highlight #query in name/path when enabled (Settings). */
      const qTrim = (document.getElementById('query')?.value || '').trim();
      const queryNeedle = isHighlightMatchedNamesOn() && qTrim ? qTrim : null;
      const starKeys = isRunnerMode() ? new Set(loadFavouriteFolders().map((p) => pathNormKey(p))) : null;
      const renderN = renderedRowCount(rowsForDisplay.length);
      for (let rowIdx = 0; rowIdx < renderN; rowIdx++) {
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
        chk.title = 'Multi-select: plain row click checks one; Ctrl/Shift for more; bulk actions use checked rows only.';
        chk.setAttribute('aria-label', 'Select row');
        chk.addEventListener('click', (e) => e.stopPropagation());
        chk.addEventListener('change', () => {
          resultsShiftRangeAnchorIdx = null;
          toggleCheckPath(fp, chk.checked);
          if (chk.checked) setSelection(row, fp);
          else renderTable();
        });
        cbWrap.appendChild(chk);
        tdCb.appendChild(cbWrap);

        const baseName = T.baseName(fp);
        const parsedName = T.parseSegmentTags(baseName);
        /* Mark eligible file rows for the hover preview (delegated listener reads these; set regardless of toggle so it works without a re-render). */
        if (!rowIsFolder(row) && THUMBNAIL_EXT.has(fileExtFromPretty(parsedName.pretty))) {
          tr.dataset.thumbPath = fp;
          tr.dataset.thumbMtime = String(modifiedTimeMs(row) || '');
        }
        const tdName = document.createElement('td');
        tdName.className = 'min-w-0';
        tdName.appendChild(renderNameCell(row, parsedName, queryNeedle));
        const nameTipLines = [parsedName.pretty];
        if (parsedName.tags.length) {
          nameTipLines.push(
            (parsedName.tags.length === 1 ? 'Tag: ' : 'Tags: ') + parsedName.tags.join(', ')
          );
        }
        if (parsedName.pretty !== baseName) {
          nameTipLines.push('—', baseName);
        }
        const nameTip = nameTipLines.join('\n');

        const tdPath = document.createElement('td');
        tdPath.className = 'col-path text-muted small';
        const pathBox = document.createElement('div');
        pathBox.className = 'path-ellip-start';
        const pathShown = collapseGDriveShortcutDisplay(pathColumnDisplayForRow(fp, rowIsFolder(row)));
        if (pathShown === '—') tdPath.classList.add('col-path--here');
        fillPathCellBox(pathBox, pathShown, queryNeedle);
        tdPath.appendChild(pathBox);

        const tdSize = document.createElement('td');
        tdSize.className = 'text-end text-nowrap small results-td-size';
        if (isRunnerMode()) {
          /* Blank where the size is unknown, rather than a column of dashes. */
          const sp = runnerSizeParts(rowSizeBytes(row));
          if (sp) {
            tdSize.classList.add('tagfox-runner-size--' + (sp.unit === 'TB' ? 'gb' : sp.unit.toLowerCase()));
            tdSize.textContent = sp.num;
            const unit = document.createElement('span');
            unit.className = 'tagfox-runner-size-unit';
            unit.textContent = sp.unit;
            tdSize.appendChild(unit);
          }
        } else tdSize.textContent = formatSize(row.size);
        applySizeHeatToElement(tdSize, row);

        const tdDate = document.createElement('td');
        tdDate.className = 'text-nowrap small';
        tdDate.textContent = isRunnerMode()
          ? formatModifiedShort(modifiedTimeMs(row))
          : formatModified(row.date_modified ?? row.date_modified_unix);

        const tdAct = document.createElement('td');
        /* Toolbar: flex on inner div only — flex on <td> drew white row seams under the icon strip. */
        tdAct.className = 'text-nowrap results-td-actions';
        const tdActInner = document.createElement('div');
        tdActInner.className = 'results-td-actions-inner';
        const parentForScope = normalizeFolderPathForEverything(T.parentDir(fp));
        const btnScopeParent = document.createElement('button');
        btnScopeParent.type = 'button';
        btnScopeParent.className =
          'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
        btnScopeParent.title = 'Parent folder (Ctrl+↑)';
        btnScopeParent.setAttribute('aria-label', 'Open parent folder');
        btnScopeParent.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
        btnScopeParent.disabled = !parentForScope;
        btnScopeParent.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!parentForScope) return;
          await applySearchScopeAndRefresh(parentForScope);
        });
        const btnOpen = document.createElement('button');
        btnOpen.type = 'button';
        btnOpen.className =
          'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
        /* Files: shell open; folders: Explorer — box-arrow-up-right (same family as toolbar “open”). */
        const openTitle = rowIsFolder(row) ? 'Show in File Explorer' : 'Open with default app';
        btnOpen.title = openTitle;
        btnOpen.setAttribute('aria-label', openTitle);
        btnOpen.innerHTML = '<i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i>';
        btnOpen.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (rowIsFolder(row)) {
            await window.tagBrowser.showInFolder(fp);
            return;
          }
          await openFileDefaultOrGoogleWorkspace(fp);
        });
        /* Edit online (pen): markdown → gmist, with a button per applicable mode
           so Steve picks local vs online per click (local pen = this machine,
           cloud = deployed worker). Other Drive docs (Office / Google-native) →
           Google Workspace, the single pen as before. */
        const gmistBtns = [];
        const rowMarkdown = !rowIsFolder(row) && isGmistMarkdown(fp);
        if (rowMarkdown) {
          const mkPen = (iconClass, title, aria, handler) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className =
              'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
            b.title = title;
            b.setAttribute('aria-label', aria);
            b.innerHTML = `<i class="fa-solid ${iconClass}" aria-hidden="true"></i>`;
            b.addEventListener('click', async (e) => { e.stopPropagation(); await handler(fp); });
            return b;
          };
          /* Local: any markdown, on any machine that has a gmist, running or not. A stopped gmist used to
             remove the button, which reads as the feature having gone; the click starts it instead. */
          if (machineHas('gmist')) {
            gmistBtns.push(mkPen('fa-pen-to-square', 'Open in local gmist (a TagFox window; starts npm run preview:local if it is not up)', 'Open in local gmist', openRowInLocalGmist));
          }
          // Online: the deployed worker, only for a file under a Drive mount.
          if (pathUnderGoogleDrive(fp)) {
            gmistBtns.push(mkPen('fa-cloud', 'Open in gmist online (deployed, needs the file in Google Drive)', 'Open in gmist online', openRowInOnlineGmist));
          }
          if (pathInObsidianVault(fp)) {
            gmistBtns.push(mkPen('fa-gem', 'Open in Obsidian (its vault holds this file)', 'Open in Obsidian', openRowInObsidian));
          }
          /* Print to PDF: any markdown, on Drive or not, where JobCat's make_pdf.py is found. The click opens
             the profile picker rather than guessing branded vs plain, the same per-click choice the pens offer. */
          if (machineHas('makePdf')) {
            const btnPdf = mkPen('fa-file-pdf', 'Print to PDF (JobCat make_pdf.py)', 'Print to PDF', async (p) => {
              const rr = btnPdf.getBoundingClientRect();
              await pickProfileAndPrintRowToPdf(p, rr.left, rr.bottom);
            });
            gmistBtns.push(btnPdf);
          }
        }
        // Google Workspace edit for Office / Google-native docs (never markdown).
        let btnGmist = null;
        if (!rowIsFolder(row) && !gmistBtns.length && rowEligibleForWorkspaceEdit(fp)) {
          btnGmist = document.createElement('button');
          btnGmist.type = 'button';
          btnGmist.className =
            'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
          btnGmist.title = 'Open in Google Workspace (edit online)';
          btnGmist.setAttribute('aria-label', 'Open in Google Workspace');
          btnGmist.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>';
          btnGmist.addEventListener('click', async (e) => {
            e.stopPropagation();
            await openRowInGoogleWorkspace(fp);
          });
        }
        const btnClip = document.createElement('button');
        btnClip.type = 'button';
        btnClip.className =
          'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn row-clip-btn d-inline-flex align-items-center justify-content-center';
        btnClip.title = 'Copy (Windows Explorer paste)';
        btnClip.setAttribute('aria-label', 'Copy');
        btnClip.innerHTML = '<i class="fa-solid fa-clipboard" aria-hidden="true"></i>';
        btnClip.addEventListener('click', async (e) => {
          e.stopPropagation();
          const r = await window.tagBrowser.copyExplorerPaste([fp]);
          if (!r || !r.ok) setStatusMain((r && r.error) || 'Copy for Explorer failed');
        });
        const btnTerminal = document.createElement('button');
        btnTerminal.type = 'button';
        btnTerminal.className =
          'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
        btnTerminal.title = rowIsFolder(row)
          ? 'Open Terminal in this folder'
          : 'Open Terminal in parent folder';
        btnTerminal.setAttribute('aria-label', 'Open in Terminal');
        btnTerminal.innerHTML = '<i class="fa-solid fa-terminal" aria-hidden="true"></i>';
        btnTerminal.addEventListener('click', async (e) => {
          e.stopPropagation();
          const cwd = rowIsFolder(row) ? fp : T.parentDir(fp);
          if (!cwd) {
            setStatusMain('Open Terminal: no folder for this row.');
            return;
          }
          const r = await window.tagBrowser.openTerminalAt(cwd);
          if (!r || !r.ok) setStatusMain((r && r.error) || 'Open in Terminal failed');
        });
        const btnCopyQuoted = document.createElement('button');
        btnCopyQuoted.type = 'button';
        btnCopyQuoted.className =
          'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
        btnCopyQuoted.title = 'Copy full path (quoted)';
        btnCopyQuoted.setAttribute('aria-label', 'Copy full path quoted');
        btnCopyQuoted.innerHTML = '<i class="fa-solid fa-quote-right" aria-hidden="true"></i>';
        btnCopyQuoted.addEventListener('click', async (e) => {
          e.stopPropagation();
          const r = await window.tagBrowser.clipboardWriteText('"' + fp + '"');
          if (!r || !r.ok) setStatusMain((r && r.error) || 'Copy quoted path failed');
        });
        const btnMore = document.createElement('button');
        btnMore.type = 'button';
        btnMore.className =
          'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
        btnMore.title = 'More — full actions menu (same as row ⋯)';
        btnMore.setAttribute('aria-label', 'More actions');
        btnMore.innerHTML = '<i class="fa-solid fa-ellipsis" aria-hidden="true"></i>';
        btnMore.addEventListener('click', async (e) => {
          e.stopPropagation();
          const r = btnMore.getBoundingClientRect();
          await openResultsRowItemActionsMenu(fp, r.left, r.bottom, row);
        });
        const btnTags = document.createElement('button');
        btnTags.type = 'button';
        btnTags.className =
          'btn btn-sm btn-outline-primary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
        btnTags.title = rowIsFolder(row)
          ? 'Edit xk/xp/xx tags in the folder name'
          : 'Edit xk/xp/xx tags in the file name';
        btnTags.setAttribute('aria-label', 'Edit tags');
        btnTags.innerHTML = '<i class="fa-solid fa-tags" aria-hidden="true"></i>';
        btnTags.addEventListener('click', (e) => {
          e.stopPropagation();
          openTagModal(fp);
        });
        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className =
          'btn btn-sm btn-outline-danger tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
        btnDelete.title = 'Delete (to Recycle Bin)';
        btnDelete.setAttribute('aria-label', 'Delete to Recycle Bin');
        btnDelete.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
        btnDelete.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!(await confirmRecycle([fp]))) return;
          detachViewerEditorsForTrashedPaths([fp]);
          setDeletingStatus(1);
          const { r, threw } = await trashPathsInvokeWithSearchDebug([fp], 'rowBtn');
          if (threw) {
            setStatusMain('Delete failed');
            return;
          }
          if (!r || !r.ok) setStatusMain((r && r.error) || 'Delete failed');
          else void refreshAfterDiskMutation({ paths: [fp], trashed: true });
        });

        tdActInner.appendChild(btnOpen);
        for (const b of gmistBtns) tdActInner.appendChild(b);
        if (btnGmist) tdActInner.appendChild(btnGmist);
        tdActInner.appendChild(btnScopeParent);
        tdActInner.appendChild(btnClip);
        tdActInner.appendChild(btnTags);
        tdActInner.appendChild(btnTerminal);
        tdActInner.appendChild(btnCopyQuoted);
        tdActInner.appendChild(btnDelete);
        tdActInner.appendChild(btnMore);
        tdAct.appendChild(tdActInner);
        if (starKeys) {
          const starred = starKeys.has(pathNormKey(fp));
          const btnStar = document.createElement('button');
          btnStar.type = 'button';
          btnStar.className = 'results-row-star tagfox-runner-only' + (starred ? ' results-row-star--on' : '');
          btnStar.title = starred ? 'Unstar (Ctrl+D)' : 'Star: keeps it near the top of searches (Ctrl+D)';
          btnStar.setAttribute('aria-label', starred ? 'Unstar' : 'Star');
          btnStar.setAttribute('aria-pressed', starred ? 'true' : 'false');
          btnStar.innerHTML = '<i class="fa-' + (starred ? 'solid' : 'regular') + ' fa-star" aria-hidden="true"></i>';
          btnStar.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleStarPath(fp);
          });
          tdAct.appendChild(btnStar);
        }

        const sizeStr = formatSize(row.size);
        const dateStr = formatModified(row.date_modified ?? row.date_modified_unix);
        /* Runner gives a cell a tooltip only when it says more than the cell: the name on disk where tags
           were taken out of the one shown, and the modified time. The selected row's full path is the
           Viewer's path line. */
        if (!isRunnerMode() || parsedName.pretty !== baseName) bindCellTooltip(tdName, nameTip);
        if (!isRunnerMode()) {
          bindCellTooltip(tdPath, fp);
          bindCellTooltip(tdSize, sizeStr);
        }
        bindCellTooltip(tdDate, dateStr);
        /* Per-button JS tooltips (same class as breadcrumb chrome) are built on first hover: bindResultsLazyTooltipsOnce. */

        tr.appendChild(tdCb);
        tr.appendChild(tdName);
        tr.appendChild(tdPath);
        tr.appendChild(tdAct);
        tr.appendChild(tdSize);
        tr.appendChild(tdDate);

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
            tagBrowserActiveNativeDragPathsAt = Date.now();
            window.tagBrowser.startDragFiles(paths);
            return;
          }
          if (tagBrowserNextOsFileDrag) tagBrowserNextOsFileDrag = false;
          setDataTransferTagBrowserHtml5Paths(e.dataTransfer, paths);
          tr.classList.add('tagfox-results-row--drag-source');
          setInternalPathDragDropTargetHints(true);
        });
        tr.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          // Keep row highlight + checkbox in sync: same as plain click (exclusive) unless row is already part of multi-check.
          if (!isCheckedPath(fp)) resultsExclusiveSelectRow(row, fp);
          else {
            setSelection(row, fp);
            syncResultsRowCheckboxStates();
          }
          void openResultsRowItemActionsMenu(fp, e.clientX, e.clientY, row);
        });
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (e.target.closest('input[type="checkbox"]')) return;
          /* Clicking another row cancels a pending plain-click uncheck on a checked row. */
          if (resultsRowUncheckTimer && resultsRowUncheckPendingFp !== fp) clearResultsRowUncheckPending();
          /* Second click of a double-click: activate like Enter (dblclick alone is unreliable after pullWebContents on first click). */
          if (e.detail === 2 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            clearResultsRowUncheckPending();
            e.preventDefault();
            resultsExclusiveSelectRow(row, fp);
            void keyboardActivateSelection();
            return;
          }
          // Folders: select only (rename, bulk, props) — do not change scope; Enter still scopes/opens like before.
          const rows = listRowsForUi();
          if (e.shiftKey) {
            clearResultsRowUncheckPending();
            e.preventDefault();
            let anchorIdx = navFocusIndexInFilteredRows(rows);
            const clickedIdx = rows.findIndex((r) => fullPathForRow(r) === fp);
            if (clickedIdx < 0) return;
            if (anchorIdx < 0) anchorIdx = clickedIdx;
            const lo = Math.min(anchorIdx, clickedIdx);
            const hi = Math.max(anchorIdx, clickedIdx);
            for (let i = 0; i < rows.length; i++) {
              toggleCheckPath(fullPathForRow(rows[i]), i >= lo && i <= hi);
            }
            resultsShiftRangeAnchorIdx = anchorIdx;
            syncResultsRowCheckboxStates();
            setSelection(row, fp);
            return;
          }
          if (e.ctrlKey || e.metaKey) {
            clearResultsRowUncheckPending();
            e.preventDefault();
            toggleCheckPath(fp, !isCheckedPath(fp));
            resultsShiftRangeAnchorIdx = null;
            syncResultsRowCheckboxStates();
            setSelection(row, fp);
            return;
          }
          if (isCheckedPath(fp)) {
            /* Defer uncheck: immediate uncheck breaks the second click of double-click (detail 2). */
            clearResultsRowUncheckPending();
            resultsRowUncheckPendingFp = fp;
            resultsRowUncheckTimer = setTimeout(() => {
              resultsRowUncheckTimer = null;
              resultsRowUncheckPendingFp = null;
              resultsPlainClickUncheckRow(fp);
            }, 280);
            return;
          }
          resultsExclusiveSelectRow(row, fp);
        });

        tbody.appendChild(tr);
      }
      syncResultsSelectionHighlight();
      updateEmptyResultsPulseHints(rowsForDisplay.length);
      renderRunnerEmptyNote();
      updateResultsLoadMoreUi();
      scheduleFolderChildCountsForVisibleResultsRows();
      lastRenderedTableSig = resultsTableRenderSignature();
      runAfterNextLayoutPaint(() => maybeAutoFillResultsUntilScrollable());
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
      if (tagModalIsFolderDocDraft()) {
        el.textContent = 'Folder doc file name (tags only until you save the folder doc)';
        return;
      }
      if (modalTargetPaths.length > 1) el.textContent = modalTargetPaths.length + ' items selected';
      else if (modalTargetPaths.length === 1) el.textContent = modalTargetPaths[0];
      else el.textContent = '';
      // The Name (rename) field only makes sense for a single existing file, not bulk or drafts.
      const nameRow = document.getElementById('tagModalNameRow');
      if (nameRow) {
        const singleRename = !tagModalIsNameDraft() && modalTargetPaths.length === 1;
        nameRow.classList.toggle('d-none', !singleRename);
      }
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
          if (tagModalIsNameDraft()) {
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
      if (el) el.textContent = msg || '';
      setStatusMain(msg || '');
    }

    function openTagModal(fp) {
      tagModalMode = 'rename';
      syncTagModalHintsAndTitle();
      modalTargetPaths = [fp];
      document.getElementById('tagModalBulkHint').classList.add('d-none');
      setTagApplyFeedback('');
      updateTagModalPathLabel();
      const base = T.baseName(fp);
      const parsed = T.parseSegmentTags(base);
      modalTags = [...parsed.tags];
      const ni = document.getElementById('tagModalBaseName');
      if (ni) ni.value = T.splitExt(parsed.pretty)[0];
      renderModalChips();
      refreshTagModalDatalist();
      if (!tagModalInst) {
        tagModalInst = new bootstrap.Modal(document.getElementById('tagModal'), { focus: false });
      }
      tagModalInst.show();
    }

    function openTagModalFolderDocDraft() {
      tagModalMode = 'folderDocDraft';
      syncTagModalHintsAndTitle();
      modalTargetPaths = [];
      document.getElementById('tagModalBulkHint').classList.add('d-none');
      setTagApplyFeedback('');
      modalTags = folderDocMdTags.slice();
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
        const rootPrefix = rootPrefixValue();
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
        recordRenameUndo(pathPairs, 'remove tag from ' + pathPairs.length + ' item(s)');
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
        const rootPrefix = rootPrefixValue();
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
          recordRenameUndo(pathPairs, 'add tag to ' + pathPairs.length + ' item(s)');
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
      // One date of each family per file: adding a deadline replaces the deadline, adding a
      // hide-until replaces the hide-until, and neither touches the other.
      const addedKind = T.dateKind ? T.dateKind(raw) : '';
      if (addedKind) {
        for (let i = modalTags.length - 1; i >= 0; i--) {
          if (T.dateKind(modalTags[i]) === addedKind && modalTags[i].toLowerCase() !== low) {
            modalTags.splice(i, 1);
          }
        }
      }
      if (tagModalIsNameDraft()) {
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
        // Restore chips to the real on-disk state (also undoes any deadline strip above).
        modalTags = [...T.parseSegmentTags(T.baseName(modalTargetPaths[0])).tags];
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
      let newBase;
      const nameInput = document.getElementById('tagModalBaseName');
      if (!tagModalIsNameDraft() && modalTargetPaths.length === 1 && nameInput) {
        // Rename modal: build from the (possibly edited) Name field stem, keeping the extension.
        const parsed = T.parseSegmentTags(base);
        const [curStem, ext0] = T.splitExt(parsed.pretty);
        const editedStem = String(nameInput.value || '').trim();
        newBase = T.buildTaggedComponent((editedStem || curStem) + ext0, modalTags);
      } else {
        newBase = T.buildTaggedComponent(base, modalTags);
      }
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
        const rootPrefix = rootPrefixValue();
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
        // Re-derive chips + Name field from the real on-disk name (also collapses any duplicate deadline).
        const nb = T.parseSegmentTags(T.baseName(toPath));
        modalTags = [...nb.tags];
        renderModalChips();
        const niAfter = document.getElementById('tagModalBaseName');
        if (niAfter) niAfter.value = T.splitExt(nb.pretty)[0];
        if (oldSel) {
          selectedFullPath = toPath;
          renderScopeBreadcrumb();
        }
        recordRenameUndo([{ from: fromPath, to: toPath }], 'edit tags');
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
      // Non-empty partial page ⇒ this query likely has exactly that many hits; skip alt fetch (still try alt when 0 rows — sort quirk).
      const skipAltBecausePartialPageIsComplete = (n) => n > 0 && n < cap;

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
      searchDebugLog('search.request.base', { runId, baseUrl, searchText, options });
      const baseRes = await runOnce(options);
      if (runId !== searchRunSeq) return null;
      const baseRows = pickRows(baseRes);
      searchDebugLog('search.response.base', {
        runId,
        baseUrl,
        searchText,
        ok: !!(baseRes && baseRes.ok),
        rows: baseRows.length,
        ms: Math.round(performance.now() - t0),
        err: baseRes && baseRes.ok ? '' : (baseRes && baseRes.error) || 'unknown',
        ...(baseRes && baseRes.debug ? { debug: baseRes.debug } : {}),
      });
      if (!baseRes || !baseRes.ok) {
        if (runId !== searchRunSeq) return null;
        return {
          ok: false,
          error: (baseRes && baseRes.error) || 'Search failed',
          rows: [],
          optionsUsed: options,
          ...(baseRes && baseRes.debug ? { debug: baseRes.debug } : {}),
        };
      }
      let rows = baseRows;
      let totalResults = baseRes.totalResults;
      let usedFallbackSort = false;
      if (
        directionCanMisbehave(options) &&
        countLooksWrongForDirection(rows.length) &&
        !skipAltBecausePartialPageIsComplete(rows.length)
      ) {
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
            totalResults = altRes.totalResults;
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
            baseUrl,
            searchText,
            err: (altRes && altRes.error) || 'alt failed',
            ...(altRes && altRes.debug ? { debug: altRes.debug } : {}),
          });
        }
      }
      if (runId !== searchRunSeq) return null;
      return { ok: true, rows, usedFallbackSort, optionsUsed: options, totalResults };
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
      if (el && isRunnerMode() && resultsScrollNearBottom(140) && runnerGrowRenderWindow(runnerRenderLimit)) return;
      if (!el || !resultsPagingCtx || !resultsPagingCtx.hasMore) return;
      /* Runner's smart order re-ranks every page it holds, so a page fetched on scroll would reshuffle
         the rows above the reader. It pages on Load more only. */
      if (isRunnerMode() && runnerSort === 'smart') return;
      if (resultsLoadMoreBusy || searchInFlight) return;
      if (!resultsScrollNearBottom(140)) return;
      if (resultsScrollMoreTimer) return;
      resultsScrollMoreTimer = setTimeout(() => {
        resultsScrollMoreTimer = null;
        void loadMoreResults();
      }, 200);
    }

    /**
     * Hide filters (and other client-side drops) can leave too few tbody rows to fill #resultsScroll — no scrollbar, so scroll paging never fires.
     * After layout, if more ES pages exist and the list is still “short” or already at virtual bottom, fetch again (capped).
     */
    /* Per-search page budget, NOT a recursion counter: renderTable re-arms this after every paint (including
       loadMore's own re-render), so a passed-down counter was reset to full on every page and the autofill
       paged the entire subtree. The budget is keyed to searchRunSeq, so it caps total auto-pages per search
       (a new search resets it) regardless of how many times renderTable re-arms it. Heavy client-side filters
       (Hide Special / Hide ~) can keep the viewport short forever; the cap stops us chewing the whole disk to
       fill it — the user can still scroll to page further. */
    const AUTOFILL_MAX_PAGES = 6;
    let autofillBudgetRunId = -1;
    let autofillPagesLeft = 0;
    let autofillRunning = false;
    async function maybeAutoFillResultsUntilScrollable() {
      if (autofillRunning) return; // a cascade is already draining the budget
      if (autofillBudgetRunId !== searchRunSeq) {
        autofillBudgetRunId = searchRunSeq;
        autofillPagesLeft = AUTOFILL_MAX_PAGES;
      }
      if (autofillPagesLeft <= 0) return;
      if (!resultsPagingCtx?.hasMore || resultsLoadMoreBusy || searchInFlight) return;
      if (isRunnerMode() && runnerSort === 'smart') return;
      const wrap = document.getElementById('resultsScroll');
      if (!wrap) return;
      const fillsViewport = wrap.scrollHeight > wrap.clientHeight + 8;
      const atBottom = resultsScrollNearBottom(140);
      if (fillsViewport && !atBottom) return;
      /* Fetch up to the page budget without rendering each page: renderTable rebuilds the whole growing list,
         so per-page rendering is O(n^2) and was the bulk of the per-search jank. Render once when it settles. */
      autofillRunning = true;
      const runId = searchRunSeq;
      let pagedAny = false;
      try {
        while (autofillPagesLeft > 0 && runId === searchRunSeq && resultsPagingCtx?.hasMore && !searchInFlight) {
          autofillPagesLeft--;
          if (isSearchDebugOn())
            searchDebugLog('autofill.page', { pagesLeft: autofillPagesLeft, rows: lastRows.length });
          const before = resultsPagingCtx.singleOffset;
          await loadMoreResults({ deferRender: true });
          if (runId !== searchRunSeq) return; // a newer search superseded us; don't paint stale rows
          if (!resultsPagingCtx || resultsPagingCtx.singleOffset === before) {
            autofillPagesLeft = 0; // no progress (no further rows): stop and don't re-arm
            break;
          }
          pagedAny = true;
        }
      } finally {
        autofillRunning = false;
        if (pagedAny && runId === searchRunSeq) {
          perfTimeSync('autofill.render', { rows: lastRows.length }, () => {
            renderTable();
          });
          updateResultsLoadMoreUi();
        }
      }
    }

    /** Next Everything offset page; same query/sort as resultsPagingCtx.
        opts.deferRender: merge + persist rows but skip the table render (the autofill cascade renders
        once when it settles, instead of re-rendering the whole growing list on every page). */
    async function loadMoreResults(opts) {
      const deferRender = !!(opts && opts.deferRender);
      if (!resultsPagingCtx || !resultsPagingCtx.hasMore || resultsLoadMoreBusy) return;
      if (searchInFlight) {
        const hint = document.getElementById('resultsLoadMoreHint');
        if (hint) hint.textContent = 'Wait for the current search to finish, then try again.';
        return;
      }
      const ctx = resultsPagingCtx;
      const runId = searchRunSeq;
      const status = document.getElementById('statusMain');
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
          if (res && res.debug) {
            searchDebugLog('loadMore.httpError', { err: res.error, debug: res.debug, baseUrl: ctx.baseUrl });
          }
          if (status) setStatusMain((res && res.error) || 'Load more failed');
          maybeShowEverythingHttpHelpBanner(res && res.error);
          renderTable();
          updateResultsLoadMoreUi();
          return;
        }
        hideEverythingHttpHelpBanner();
        setEverythingConnectionBadgeOk();
        let add = res.rows || [];
        const addRawLen = add.length;
        if (isFoldersOnly()) add = add.filter(rowIsFolder);
        else if (isFilesOnly()) add = add.filter((r) => !rowIsFolder(r));
        if (!addRawLen) {
          resultsPagingCtx = { ...ctx, hasMore: false };
        } else {
          lastRows = mergeSearchRowsDedupe(lastRows, add);
          perfTimeSync('loadMore.sort', { rows: lastRows.length }, () =>
            sortLastRowsForDisplay(!!res.usedFallbackSort)
          );
          applyTagRenamePendingToLastRows();
          const hasMore = addRawLen === ctx.pageSize;
          resultsPagingCtx = {
            ...ctx,
            singleOffset: ctx.singleOffset + addRawLen,
            seedOptions: stripOffsetFromOpts(res.optionsUsed),
            hasMore,
          };
        }
        await syncSelectionAfterSearch();
        if (!deferRender) {
          perfTimeSync('loadMore.render', { rows: lastRows.length }, () => {
            renderTable();
          });
        }
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

    /** Settings header: last-known Everything HTTP status (updated by searches + connection probe). */
    let everythingConnectionBadgeProbeSeq = 0;

    function updateSettingsConnectionChevronFromExpanded(isExpanded) {
      const btn = document.getElementById('btnSettingsConnectionToggle');
      if (!btn) return;
      const i = btn.querySelector('.tagfox-settings-connection-chevron');
      if (i) {
        i.classList.toggle('fa-chevron-down', isExpanded);
        i.classList.toggle('fa-chevron-right', !isExpanded);
      }
      btn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    }

    /** When badge is Connected, collapse URL/auth fields; otherwise expand so the user can fix settings. */
    function syncEverythingConnectionSectionCollapse() {
      const wrap = document.getElementById('settingsConnectionDetails');
      const badge = document.getElementById('everythingConnectionBadge');
      if (!wrap || !badge || typeof bootstrap === 'undefined' || !bootstrap.Collapse) return;
      const connected = badge.textContent.trim() === 'Connected';
      const inst = bootstrap.Collapse.getOrCreateInstance(wrap, { toggle: false });
      if (connected) {
        inst.hide();
      } else {
        inst.show();
        updateSettingsConnectionChevronFromExpanded(true);
      }
    }

    function wireEverythingConnectionSectionCollapseOnce() {
      const wrap = document.getElementById('settingsConnectionDetails');
      if (!wrap || wrap.dataset.tagfoxConnCollapse === '1') return;
      wrap.dataset.tagfoxConnCollapse = '1';
      wrap.addEventListener('shown.bs.collapse', () => updateSettingsConnectionChevronFromExpanded(true));
      wrap.addEventListener('hidden.bs.collapse', () => updateSettingsConnectionChevronFromExpanded(false));
    }

    /** Other settings sections: chevron follows Bootstrap collapse (Connection uses separate logic). */
    function wireTagfoxSettingsSectionCollapsesOnce() {
      const root = document.querySelector('#settingsPanel .offcanvas-body');
      if (!root || root.dataset.tagfoxSettingsSectionsWired === '1') return;
      root.dataset.tagfoxSettingsSectionsWired = '1';
      for (const btn of root.querySelectorAll('[data-tagfox-settings-collapse]')) {
        const id = btn.getAttribute('data-tagfox-settings-collapse');
        const wrap = id ? document.getElementById(id) : null;
        const chev = btn.querySelector('.tagfox-settings-section-chevron');
        if (!wrap || !chev) continue;
        const sync = () => {
          const open = wrap.classList.contains('show');
          chev.classList.toggle('fa-chevron-down', open);
          chev.classList.toggle('fa-chevron-right', !open);
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        };
        wrap.addEventListener('shown.bs.collapse', sync);
        wrap.addEventListener('hidden.bs.collapse', sync);
        sync();
      }
    }

    function setEverythingConnectionBadgeOk() {
      const el = document.getElementById('everythingConnectionBadge');
      if (!el) return;
      el.textContent = 'Connected';
      el.className = 'badge rounded-pill text-bg-success';
      el.title = 'Everything answered OK at this address (last successful request).';
      syncEverythingConnectionSectionCollapse();
    }

    function setEverythingConnectionBadgeUnknown() {
      const el = document.getElementById('everythingConnectionBadge');
      if (!el) return;
      el.textContent = 'Not checked yet';
      el.className = 'badge rounded-pill text-bg-secondary';
      el.title = 'Open Settings to test, or run a search.';
      syncEverythingConnectionSectionCollapse();
    }

    function setEverythingConnectionBadgeFromErr(errMsg) {
      const el = document.getElementById('everythingConnectionBadge');
      if (!el) return;
      const detail = String(errMsg || '').trim();
      if (!detail) {
        setEverythingConnectionBadgeUnknown();
        return;
      }
      const kind = everythingHttpSetupHintKind(errMsg);
      if (!kind) {
        el.textContent = 'Error';
        el.className = 'badge rounded-pill text-bg-warning';
        el.title = detail;
      } else if (kind === 'auth') {
        el.textContent = 'Sign-in failed';
        el.className = 'badge rounded-pill text-bg-warning';
        el.title = 'Match the username and password in Everything → Tools → Options → HTTP Server. ' + detail;
      } else if (kind === 'json') {
        el.textContent = 'Wrong address';
        el.className = 'badge rounded-pill text-bg-danger';
        el.title = 'Not the Everything HTTP API — check URL, port, and that HTTP Server is on. ' + detail;
      } else if (kind === 'http') {
        el.textContent = 'HTTP error';
        el.className = 'badge rounded-pill text-bg-danger';
        el.title = detail;
      } else {
        el.textContent = "Can't connect";
        el.className = 'badge rounded-pill text-bg-danger';
        el.title =
          'Nothing reached this URL — is Everything running with HTTP enabled (and plug-in on 1.5a)? ' + detail;
      }
      syncEverythingConnectionSectionCollapse();
    }

    /** Tiny query using current Settings fields — runs when Settings opens. */
    async function probeEverythingConnectionForSettingsBadge() {
      const el = document.getElementById('everythingConnectionBadge');
      if (!el || !window.tagBrowser || typeof window.tagBrowser.search !== 'function') return;
      const seq = ++everythingConnectionBadgeProbeSeq;
      el.textContent = 'Checking…';
      el.className = 'badge rounded-pill text-bg-secondary';
      el.title = 'Sending a one-result test to Everything…';
      syncEverythingConnectionSectionCollapse();
      let res;
      try {
        res = await everythingSearchOnce({
          searchText: 'sort-mix:',
          count: 1,
          options: { ...everythingOptionsForRequest(), offset: 0 },
        });
      } catch (e) {
        if (seq !== everythingConnectionBadgeProbeSeq) return;
        setEverythingConnectionBadgeFromErr(e && e.message ? String(e.message) : 'Request failed');
        return;
      }
      if (seq !== everythingConnectionBadgeProbeSeq) return;
      if (res && res.ok) setEverythingConnectionBadgeOk();
      else setEverythingConnectionBadgeFromErr(res && res.error);
    }

    /** Offer Settings + Installation tab when search can’t talk to Everything HTTP. */
    function maybeShowEverythingHttpHelpBanner(errMsg) {
      setEverythingConnectionBadgeFromErr(errMsg);
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

    /** The Everything search text for the current filters: scope, query, tags, deadlines, content, recency.
        `tempDir` asks for Runner's Temp hits in that folder instead of leaving Temp out. */
    function everythingSearchTextForUi(ceilingNorms, rootFolder, query, recursive, { tempDir = '' } = {}) {
      let searchText = composeScopedEverythingSearch(ceilingNorms, rootFolder, query, recursive);
      searchText = appendTagFiltersToEverythingQuery(searchText);
      /* Starred only: the stars as a filelist, first, so Everything tests the rest on those paths alone.
         With no stars it is filelist:"", which matches nothing. */
      if (runnerStarredOnlyOn()) {
        const stars = loadFavouriteFolders().map((p) => String(p).replace(/"/g, '').replace(/[/\\]+$/, '')).filter(Boolean);
        searchText = ('filelist:"' + stars.join('|') + '" ' + String(searchText).trim()).trim();
      }
      /* The Temp folder goes first, so the words are tested on Temp's items alone: 75-115ms against
         300-500ms with the folder after the words (2.4 million items, October 2026). */
      if (tempDir) searchText = ('"' + tempDir + '\\" ' + String(searchText).trim()).trim();
      else if (runnerLeavesOutTemp(rootFolder)) searchText = (String(searchText).trim() + ' ' + RUNNER_TEMP_EXCLUDE).trim();
      if (isFoldersOnly()) searchText = (String(searchText).trim() + ' folder:').trim();
      else if (isFilesOnly()) searchText = (String(searchText).trim() + ' file: sort-mix:').trim();
      else searchText = (String(searchText).trim() + ' sort-mix:').trim();
      return appendRecencyToEverythingQuery(searchText);
    }

    /** One search, run by runSearchNow while it holds searchMutex. */
    async function runSearch(eventKind = 'identity', opts = {}) {
      searchInFlight = true;
      const runId = ++searchRunSeq;
      resultsPagingCtx = null;
      try {
      cancelPropsPreviewSchedule();
      if (isRunnerMode()) {
        runnerResetRenderWindowIfNewList();
        /* Runner: a plain flat list. An empty box lists the current folder's own contents; typing, a tag to
           look for, a deadline range or Starred only searches below it, unless This folder only is on. A not-tag
           alone names nothing to look for, so it only thins that list. */
        const q = (document.getElementById('query')?.value || '').trim();
        const wantsTag = [...activeTagKeys].some((k) => !excludedTagKeys.has(k));
        const below = !!(q || wantsTag || deadlineFilterActive() || runnerStarredOnlyOn()) && !runnerThisFolderOnlyOn();
        applyResultsViewRadiosToDom(below, resultsContentMode());
        syncViewRadioActiveFromDom();
      } else {
        /* Classic: typing or a tag searches below the folder. */
        const q = (document.getElementById('query')?.value || '').trim();
        if (q || activeTagKeys.size) {
          const cm = resultsContentMode();
          const keepNarrow = cm === 'files' || cm === 'folders';
          applyResultsViewRadiosToDom(true, keepNarrow ? cm : 'all');
          syncViewRadioActiveFromDom();
        }
      }
      saveSettings();
      const { baseUrl, httpUser, httpPassword } = readEverythingConnection();
      const ceilingNorms = getSearchScopeCeilingFoldersNorms();
      const rootFolder = document.getElementById('rootFolder').value.trim();
      const query = document.getElementById('query').value;
      const hasBread = !!normalizeFolderPathForEverything(rootFolder);
      const hasCeil = ceilingNorms.length > 0;
      const hasScope = hasBread || hasCeil;
      const showSub = isShowSubfolders();
      const fo = isFoldersOnly();
      const fileOnly = isFilesOnly();
      const recursive = showSub || !hasScope;
      const queryForEs = isRunnerMode() ? runnerQueryForEverything(query) : query;
      const searchText = everythingSearchTextForUi(ceilingNorms, rootFolder, queryForEs, recursive);
      lastMainSearchText = searchText;
      const cap = isRunnerMode() ? Math.max(parseMaxResultsCap(), RUNNER_RANK.fetchCap) : parseMaxResultsCap();
      const countStr = String(cap);
      const baseSearchOpts = everythingOptionsForRequest();
      /* Scope: force Match path whenever path filters are present so tokens limit the index. */
      const scopeNeedsPathSearch = hasCeil || !!normalizeFolderPathForEverything(rootFolder);
      const options = {
        ...baseSearchOpts,
        pathSearch: !!(baseSearchOpts.pathSearch || scopeNeedsPathSearch),
      };
      searchDebugLog('runSearch.start', {
        runId,
        eventKind,
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

      /* An explicit refresh (F5 or the Refresh command) that finds nothing new reads exactly like one that
         never ran, which is what "F5 sometimes does not refresh" looks like from the outside. So a refresh
         reports the clock time it finished and what changed, and the keys it started from are kept here. */
      const explicitRefresh = !!(opts && opts.uiHint === 'f5');
      const refreshPrevKeys = explicitRefresh
        ? new Set(lastRows.map((r) => pathNormKey(fullPathForRow(r))).filter(Boolean))
        : null;

      /* Not for an auto-refresh tick: one that finds nothing new returns from renderTableImpl before the
         status is written, so its "Searching…" stayed on the line until the rows next changed. */
      if (!quietAutoRefreshRender) setStatusMain(explicitRefresh ? 'Refreshing…' : 'Searching…', { progress: !explicitRefresh });

      searchDebugLog('runSearch.branch', {
        runId,
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

      /* Runner's extra queries follow the main one, one at a time (runnerExtraRows). Everything answers one query
         at a time, so the main rows come back first and a new list can paint them while the extras run. */
      const mainPromise = everythingSearchWithDirectionFallback({
        ...pageArgs,
        searchText,
        offset: 0,
        seedOptions: options,
      });
      const runnerExtraPromise = isRunnerMode()
        ? runnerExtraRows({ runId, ceilingNorms, rootFolder, queryForEs, recursive, options, cap, after: mainPromise })
        : null;
      let runnerExtrasIn = false;
      if (runnerExtraPromise) runnerExtraPromise.then(() => (runnerExtrasIn = true), () => (runnerExtrasIn = true));
      const res = await mainPromise;
      if (res == null) return;
      if (runId !== searchRunSeq || runnerSearchSuperseded()) return;

      if (!res.ok) {
        lastRows = [];
        resultsPagingCtx = null;
        searchDebugLog('runSearch.error', {
          runId,
          err: res.error || 'Search failed',
          ...(res.debug ? { debug: res.debug } : {}),
        });
        setStatusMain(res.error || 'Search failed');
        maybeShowEverythingHttpHelpBanner(res.error);
        await syncSelectionAfterSearch();
        renderTable();
        return;
      }
      hideEverythingHttpHelpBanner();
      setEverythingConnectionBadgeOk();
      let got = Array.isArray(res.rows) ? res.rows : [];
      let usedLocalFolderFallback = false;
      const localFallbackRows = await maybeBuildLocalCloudBrowseFallbackRows({
        runId,
        rootFolder,
        query,
        recursive,
      });
      if (localFallbackRows == null && runId !== searchRunSeq) return;
      if (Array.isArray(localFallbackRows) && localFallbackRows.length) {
        got = localFallbackRows;
        usedLocalFolderFallback = true;
      }
      searchDebugLog('runSearch.resultSource', {
        runId,
        source: usedLocalFolderFallback ? 'localFolderFallback' : 'everything',
        rootFolder: normalizeFolderPathForEverything(String(rootFolder || '').trim()),
        rowsBeforeUiFilters: got.length,
      });
      /* Everything offset is in raw API rows — never use client-filtered count (e.g. folders-only). */
      const rawPageLen = got.length;
      if (fo) got = got.filter(rowIsFolder);
      else if (fileOnly) got = got.filter((r) => !rowIsFolder(r));
      if (isRunnerMode()) {
        runnerTotalHits = typeof res.totalResults === 'number' ? res.totalResults : null;
        if (!usedLocalFolderFallback && runnerExtraPromise) {
          /* A new list paints the main rows while the extra queries finish, 0.1-0.4s later; the merged list then
             replaces them. Not for an auto-refresh tick, whose list would shrink and grow back every few seconds. */
          if (!runnerExtrasIn && !quietAutoRefreshRender && !runnerSearchSuperseded() && selectAfterSearchKeyFor(query, rootFolder) !== selectAfterSearchKey) {
            lastRows = got;
            dedupeLastRowsByPathKey();
            sortLastRowsForDisplay(!!res.usedFallbackSort);
            applyTagRenamePendingToLastRows();
            renderTable();
            selectRowAfterSearch(query, rootFolder, { early: true });
          }
          let extra = await runnerExtraPromise;
          if (runId !== searchRunSeq || runnerSearchSuperseded()) return;
          if (fo) extra = extra.filter(rowIsFolder);
          else if (fileOnly) extra = extra.filter((r) => !rowIsFolder(r));
          got = mergeSearchRowsDedupe(got, extra);
        }
      }
      lastRows = got;
      dedupeLastRowsByPathKey(); // Everything can repeat the same path in one page, which would list it twice.
      sortLastRowsForDisplay(!!res.usedFallbackSort);
      applyTagRenamePendingToLastRows();
      searchDebugLog('runSearch.single.final', {
        runId,
        usedFallbackSort: !!res.usedFallbackSort,
        rows: lastRows.length,
        first: lastRows.slice(0, 3).map((r) => fullPathForRow(r)),
        last: lastRows.slice(-3).map((r) => fullPathForRow(r)),
      });
      await runSearchDebugScopeProbe({
        runId,
        baseUrl,
        httpUser,
        httpPassword,
        rootFolder,
        query,
        recursive,
        foldersOnly: fo,
        filesOnly: fileOnly,
        currentSearchText: searchText,
        currentOptions: stripOffsetFromOpts(res.optionsUsed),
        currentRowsLen: lastRows.length,
        resultSource: usedLocalFolderFallback ? 'localFolderFallback' : 'everything',
      });
      resultsPagingCtx = {
        mode: 'single',
        pageSize: cap,
        singleOffset: rawPageLen,
        hasMore: !usedLocalFolderFallback && rawPageLen === cap,
        baseUrl,
        httpUser,
        httpPassword,
        searchText,
        seedOptions: stripOffsetFromOpts(res.optionsUsed),
      };
      await syncSelectionAfterSearch();
      renderTable();
      pulseEmptyResultHintsAfterSearchOk();
      if (runId === searchRunSeq) selectRowAfterSearch(query, rootFolder);
      if (runId === searchRunSeq && explicitRefresh) {
        setStatusMain(
          'Refreshed ' + clockTimeHms() + ' — ' + lastRows.length + ' row(s)' + refreshRowChangeSuffix(refreshPrevKeys) + '.'
        );
      }
      } finally {
        if (runId === searchRunSeq) searchInFlight = false;
      }
    }

    function bindResultsDomListeners() {
      bindResultsLazyTooltipsOnce();
      const resultsTableScrollEl = document.getElementById('resultsScroll');
      if (resultsTableScrollEl && resultsTableScrollEl.dataset.resultsScrollBound !== '1') {
        resultsTableScrollEl.dataset.resultsScrollBound = '1';
        resultsTableScrollEl.addEventListener('scroll', onResultsWrapScrollForPaging, { passive: true });
      }
      const loadMoreBtn = document.getElementById('btnLoadMoreResults');
      if (loadMoreBtn && loadMoreBtn.dataset.resultsLoadMoreBound !== '1') {
        loadMoreBtn.dataset.resultsLoadMoreBound = '1';
        loadMoreBtn.addEventListener('click', () => void loadMoreResults());
      }
    }

    bindResultsDomListeners();
    document.getElementById('resultsWrap').addEventListener('focusout', (e) => {
      const tr = e.target && e.target.closest ? e.target.closest('tr.results-row-actions-kbd') : null;
      if (tr && !(e.relatedTarget && tr.contains(e.relatedTarget))) tr.classList.remove('results-row-actions-kbd');
    });

    document.getElementById('query').addEventListener('input', (e) => {
      syncQueryGhostUi();
      if (runnerCmdOnInput()) return;
      scheduleSearch();
      scheduleSearchHistoryCommit();
      /* A pasted path goes there at once; a typed one waits for Enter, so the search runs as it is typed. */
      if (isRunnerMode() && e.inputType === 'insertFromPaste') void runnerGoToPathInBox();
    });
    // Electron/Windows: sometimes the page keeps rendering but keyboard focus is stuck in window chrome
    // (after a native drag, a child window, or some button clicks). win.focus()/webContents.focus() are
    // no-ops while the window is already foreground, so the light pull cannot cure it: clicking the box did
    // nothing and the user had to alt-tab away and back. A genuine click now runs the heavy blur+focus cycle
    // (the programmatic alt-tab) so the box always becomes editable on click. pointerdown only, because the
    // focus handler fires programmatically after every search and a heavy cycle there would loop via window.focus.
    document.getElementById('query').addEventListener('pointerdown', () => {
      recoverSearchBoxKeyboardFocus();
    });
    document.getElementById('query').addEventListener('focus', () => {
      pullWebContentsKeyboardFocus();
    });
    document.getElementById('query').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) void runSearchNow();
      // Leave the field and step into the active pane, keeping the current row so ↑/↓/Enter
      // continue from it (not the first row). Tab keeps its normal tab order.
      if (e.key === 'ArrowDown' && listRowsForUi().length) {
        e.preventDefault();
        enterResultsListKeepingSelection();
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

    document.getElementById('btnReadmeFolderDocTags').addEventListener('click', () => openTagModalFolderDocDraft());
    document.getElementById('readmeFolderDocStemInput').addEventListener('input', () => folderDocOnFilenameUiChanged());

    document.querySelectorAll('input[name="tagFoxRecencyFilter"]').forEach((el) => {
      el.addEventListener('change', () => {
        syncRecencyFilterActiveHighlight();
        saveSettings();
        commitSearchHistoryNow();
        /* dm: is baked into the HTTP search — must re-run Everything or lastRows stays stale. */
        void runSearchNow();
      });
    });
    ['optCase', 'optWholeWord', 'optPath', 'optDiacritics', 'optHideSpecial', 'optHideTilde'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        saveSettings();
        if (id === 'optCase' && document.getElementById('bulkRenameModal')?.classList.contains('show')) {
          updateBulkRenamePreview();
        }
        if (id === 'optHideSpecial' || id === 'optHideTilde') {
          renderTable();
          updateEmptyResultsPulseHints(listRowsForUi().length, { forceRestart: true });
          syncResultsSelectionHighlight();
          updateResultsLoadMoreUi();
        } else {
          scheduleSearch();
        }
        commitSearchHistoryNow();
        syncAdvancedSearchIconFilledState();
      });
    });

    document.getElementById('btnToggleSearchOptsAdvanced').addEventListener('click', () => {
      const panel = document.getElementById('searchOptsAdvancedPanel');
      const btn = document.getElementById('btnToggleSearchOptsAdvanced');
      const open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      syncAdvancedSearchIconFilledState();
    });
    document.addEventListener('pointerdown', (e) => {
      const panel = document.getElementById('searchOptsAdvancedPanel');
      if (panel?.hasAttribute('hidden')) return;
      const wrap = document.querySelector('.tagfox-advanced-wrap');
      if (wrap && !wrap.contains(e.target)) {
        panel.setAttribute('hidden', '');
        const btn = document.getElementById('btnToggleSearchOptsAdvanced');
        btn?.setAttribute('aria-expanded', 'false');
        syncAdvancedSearchIconFilledState();
      }
    });

    ['baseUrl', 'maxResults'].forEach((id) => {
      document.getElementById(id).addEventListener('input', scheduleSearch);
    });
    document.getElementById('btnScopeBarOpen')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return;
      await window.tagBrowser.showInFolder(normalizeFolderPathForEverything(raw));
    });
    document.getElementById('btnScopeBarClip')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const status = document.getElementById('statusMain');
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return;
      const r = await window.tagBrowser.copyExplorerPaste([normalizeFolderPathForEverything(raw)]);
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Copy for Explorer failed');
    });
    document.getElementById('btnScopeBarTags')?.addEventListener('click', (e) => {
      e.preventDefault();
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return;
      openTagModal(normalizeFolderPathForEverything(raw));
    });
    document.getElementById('btnScopeBarTerminal')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return;
      const r = await window.tagBrowser.openTerminalAt(normalizeFolderPathForEverything(raw));
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Open in Terminal failed');
    });
    document.getElementById('btnScopeBarCopyQuoted')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return;
      const r = await window.tagBrowser.clipboardWriteText('"' + normalizeFolderPathForEverything(raw) + '"');
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Copy quoted path failed');
    });
    document.getElementById('btnScopeBarMore')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return;
      const fp = normalizeFolderPathForEverything(raw);
      const rect = e.currentTarget.getBoundingClientRect();
      await openResultsRowItemActionsMenu(fp, rect.left, rect.bottom, null);
    });
    /* Re-click active segment cycles. */
    const contentTrioIds = ['optRvAll', 'optRvDirsOnly', 'optRvFilesOnly'];
    const viewPairs = [['optRvSubsOn', 'optRvSubsOff']];
    const viewRadioActive = {};
    /** Mirror checked state for toggle-on-reclick (loadSettings, setResultsViewRadios). */
    function syncViewRadioActiveFromDom() {
      for (const id of contentTrioIds) {
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
    function bindResultsViewRadiosChanged() {
      saveSettings();
      syncSortPathClass();
      void runSearchNow('identity');
      commitSearchHistoryNow();
    }
    function wireViewTrioClickCycle(ids) {
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
          bindResultsViewRadiosChanged();
        });
      }
    }
    wireViewTrioClickCycle(contentTrioIds);
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
          bindResultsViewRadiosChanged();
        });
      }
    }
    syncViewRadioActiveFromDom();
    document.getElementById('btnClearQuery').addEventListener('click', () => clearSearchQuery());
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
        const st = document.getElementById('statusMain');
        const hint = document.getElementById('globalToggleHotkeyHelp');
        if (r && r.ok) {
          if (st) setStatusMain('Global toggle: ' + r.accelerator);
          if (hint)
            hint.textContent =
              'Saved ' +
              r.accelerator +
              '. Recording needs at least one modifier. Works while TagFox is hidden.';
        } else {
          if (st) setStatusMain((r && r.error) || 'Could not set global shortcut.');
          if (hint) hint.textContent = (r && r.error) || 'Registration failed — shortcut unchanged.';
        }
        setGlobalToggleRecording(false);
      })();
    });
    document.getElementById('btnRecordGlobalToggleHotkey')?.addEventListener('click', () => {
      if (globalToggleRecording) setGlobalToggleRecording(false);
      else setGlobalToggleRecording(true);
    });
    document.getElementById('quickTodoHotkeyDisplay')?.addEventListener('keydown', (ev) => {
      if (!quickTodoHotkeyRecording) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === 'Escape') {
        setQuickTodoHotkeyRecording(false);
        return;
      }
      const acc = acceleratorFromKeydown(ev);
      if (!acc) return;
      void (async () => {
        if (!window.tagBrowser || typeof window.tagBrowser.quickTodoHotkeySet !== 'function') return;
        const r = await window.tagBrowser.quickTodoHotkeySet(acc);
        const st = document.getElementById('statusMain');
        const hint = document.getElementById('quickTodoHotkeyHelp');
        if (r && r.ok) {
          if (st) setStatusMain('Quick TODO shortcut: ' + r.accelerator);
          if (hint)
            hint.textContent =
              'Saved ' + r.accelerator + '. Recording needs at least one modifier. Works only while TagFox is running.';
        } else {
          if (st) setStatusMain((r && r.error) || 'Could not set Quick TODO shortcut.');
          if (hint) hint.textContent = (r && r.error) || 'Registration failed — shortcut unchanged.';
        }
        setQuickTodoHotkeyRecording(false);
      })();
    });
    document.getElementById('btnRecordQuickTodoHotkey')?.addEventListener('click', () => {
      if (quickTodoHotkeyRecording) setQuickTodoHotkeyRecording(false);
      else setQuickTodoHotkeyRecording(true);
    });
    document.getElementById('optHighlightMatchedNames')?.addEventListener('change', () => {
      saveSettings();
      renderTable();
    });
    document.getElementById('optResultThumbnails')?.addEventListener('change', () => {
      saveSettings();
      renderTable();
    });
    document.getElementById('optHoverPreview')?.addEventListener('change', () => {
      saveSettings();
      if (!isHoverPreviewOn()) hideHoverPreview();
    });
    document.getElementById('optFolderGroupHighlight')?.addEventListener('change', () => {
      saveSettings();
      syncResultsSelectionHighlight();
    });
    /* Hover preview: delegated so it survives re-renders; anything other than resting on the icon closes it. */
    document.addEventListener('mouseover', onResultRowHoverOver);
    document.addEventListener('mouseout', onResultRowHoverOut);
    document.addEventListener('scroll', hideHoverPreview, true);
    document.addEventListener('keydown', hideHoverPreview, true);
    document.addEventListener('visibilitychange', hideHoverPreview);
    window.addEventListener('blur', hideHoverPreview);
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
      const ok = await copyPlainTextToClipboard(text);
      const status = document.getElementById('statusMain');
      if (ok) {
        if (status) setStatusMain('Debug log copied.');
      } else if (status) {
        setStatusMain('Could not copy debug log.');
      }
    });

    document.getElementById('btnBulkClip').addEventListener('click', async () => {
      const status = document.getElementById('statusMain');
      const p = getCheckedPathsArr();
      if (!p.length) return;
      const r = await window.tagBrowser.copyExplorerPaste(p);
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Copy for Explorer failed');
    });
    document.getElementById('btnBulkTrash').addEventListener('click', async () => {
      const status = document.getElementById('statusMain');
      const p = getCheckedPathsArr();
      searchDebugLog('recycle.ui', { source: 'bulkBar', phase: 'click', checked: p.length });
      if (!p.length) {
        searchDebugLog('recycle.ui', { source: 'bulkBar', phase: 'noopNoSelection' });
        return;
      }
      if (!(await confirmRecycle(p))) {
        searchDebugLog('recycle.ui', { source: 'bulkBar', phase: 'confirmCancel', count: p.length });
        return;
      }
      detachViewerEditorsForTrashedPaths(p);
      setDeletingStatus(p.length);
      const { r, threw } = await trashPathsInvokeWithSearchDebug(p, 'bulkBar');
      if (threw) {
        setStatusMain('Delete failed');
        return;
      }
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Delete failed');
      else {
        checkedPathsMap.clear();
        updateBulkBar();
        void refreshAfterDiskMutation({ paths: p, trashed: true }); // + paths-mutated from main; retries help Everything catch up
      }
    });
    document.getElementById('btnBulkTags').addEventListener('click', () => {
      const p = getCheckedPathsArr();
      if (!p.length) return;
      openTagModalBulk(p);
    });
    document.getElementById('btnBulkClearSel').addEventListener('click', () => {
      clearResultsCheckedSelection();
    });

    document.getElementById('tagModal').addEventListener('shown.bs.modal', () => {
      refreshTagModalDatalist();
      requestAnimationFrame(() => pinModalFieldFocus(document.getElementById('tagModalInput'), false));
    });
    document.getElementById('tagModal').addEventListener('hidden.bs.modal', () => {
      const wasFolderDocDraft = tagModalMode === 'folderDocDraft';
      if (tagModalMode === 'folderDocDraft') folderDocMdTags = modalTags.slice();
      tagModalMode = 'rename';
      syncTagModalHintsAndTitle();
      if (wasFolderDocDraft) {
        syncFolderDocTagPillsDisplay();
        folderDocOnFilenameUiChanged();
      }
      if (isRunnerMode()) focusQueryBox(false);
    });
    document.getElementById('bulkRenameModal').addEventListener('shown.bs.modal', () => {
      requestAnimationFrame(() => {
        const rep = document.getElementById('bulkRenameReplace');
        if (rep) pinModalFieldFocus(rep, true);
        else pinModalFieldFocus(document.getElementById('bulkRenameFind'), false);
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
    document.getElementById('tagModalRenameBtn')?.addEventListener('click', () => void performTagRename('Renaming…'));
    document.getElementById('tagModalBaseName')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void performTagRename('Renaming…');
      }
    });
    document.getElementById('tagModalAddDateBtn')?.addEventListener('click', () => {
      const di = document.getElementById('tagModalDateInput');
      const v = (di && di.value || '').trim(); // ISO yyyy-mm-dd; buildTaggedComponent writes it as xd-
      if (!v) return;
      di.value = '';
      void applyModalAddTag(v);
    });
    document.getElementById('tagModalAddHideBtn')?.addEventListener('click', () => {
      const hi = document.getElementById('tagModalHideInput');
      const v = (hi && hi.value || '').trim();
      if (!v) return;
      hi.value = '';
      void applyModalAddTag(T.HIDE_PREFIX + v); // the prefix is what makes it a hide-until, not a deadline
    });

    /** Clipboard image in folder-doc / file markdown editors → `.images/paste-<ts>.png` + link at caret. */
    async function onMarkdownViewerPasteImage(e, which) {
      const cd = e.clipboardData;
      if (!cd || !cd.items) return;
      let imageItem = null;
      for (let i = 0; i < cd.items.length; i++) {
        const it = cd.items[i];
        if (it.kind === 'file' && String(it.type || '').startsWith('image/')) {
          imageItem = it;
          break;
        }
        if (String(it.type || '').startsWith('image/')) {
          imageItem = it;
          break;
        }
      }
      if (!imageItem) return;
      let mdPath = null;
      if (which === 'mdFile') {
        const wrap = document.getElementById('mdFileEditorWrap');
        if (!wrap || wrap.classList.contains('d-none')) return;
        mdPath = mdAutosaveTargetPath;
      } else {
        if (globalNestedReadmeView) return;
        const wrap = document.getElementById('readmeEditorWrap');
        if (!wrap || wrap.classList.contains('d-none')) return;
        mdPath = activeReadmePath;
      }
      if (!mdPath || !window.tagBrowser.writeImageFilePng) return;
      e.preventDefault();
      const blob = imageItem.getAsFile();
      if (!blob) return;
      const ab = await blob.arrayBuffer();
      const b64 = arrayBufferToBase64(ab);
      const parent = T.parentDir(mdPath);
      if (!parent) {
        setStatusMain('Could not resolve folder for image.');
        return;
      }
      const imagesDir = joinFolderAndFileName(parent, '.images');
      const fileName = 'paste-' + Date.now() + '.png';
      const fullImagePath = joinFolderAndFileName(imagesDir, fileName);
      const r = await window.tagBrowser.writeImageFilePng({ fullPath: fullImagePath, base64: b64 });
      if (!r.ok) {
        setStatusMain(r.error || 'Could not save pasted image.');
        return;
      }
      const rel = '.images/' + fileName;
      const insert = '![](' + rel + ')';
      const prevId = which === 'mdFile' ? 'mdFilePreview' : 'readmePreview';
      const value = replaceViewerMdSelection(which, insert);
      if (which === 'mdFile') {
        document.getElementById(prevId).innerHTML = editableTextPreviewHtml(value, mdAutosaveTargetPath);
        scheduleMdFileAutosave();
        syncViewerCopyButton();
      } else {
        document.getElementById(prevId).innerHTML = mdPreviewHtml(value, { mdSourcePath: activeReadmePath });
        syncReadmePreviewChrome({ pulse: false });
      }
      void refreshAfterDiskMutation();
      setStatusMain('Image saved next to document.');
    }

    const readmeEditor = ensureViewerMdEditor('readme');
    const mdFileEditor = ensureViewerMdEditor('mdFile');
    const readmeTextarea = getViewerMdTextarea('readme');
    const mdFileTextarea = getViewerMdTextarea('mdFile');
    const onReadmeEditorInput = () => {
      if (globalNestedReadmeView) return;
      document.getElementById('readmePreview').innerHTML = mdPreviewHtml(getViewerMdValue('readme'), {
        mdSourcePath: activeReadmePath,
      });
      syncReadmePreviewChrome({ pulse: false });
    };
    const onMdFileEditorInput = () => {
      document.getElementById('mdFilePreview').innerHTML = editableTextPreviewHtml(
        getViewerMdValue('mdFile'),
        mdAutosaveTargetPath
      );
      scheduleMdFileAutosave();
      syncViewerCopyButton();
    };
    const onReadmeEditorKeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        void closeReadmeEditorWithSave();
      }
    };
    const onMdFileEditorKeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        toggleViewerDocEditor('mdFile');
      }
    };
    if (readmeEditor) {
      readmeEditor.on('paste', (cm, e) => void onMarkdownViewerPasteImage(e, 'readme'));
      readmeEditor.on('changes', onReadmeEditorInput);
      readmeEditor.on('keydown', (cm, e) => onReadmeEditorKeydown(e));
    } else {
      readmeTextarea?.addEventListener('paste', (e) => void onMarkdownViewerPasteImage(e, 'readme'));
      readmeTextarea?.addEventListener('input', onReadmeEditorInput);
      readmeTextarea?.addEventListener('keydown', onReadmeEditorKeydown);
    }
    if (mdFileEditor) {
      mdFileEditor.on('paste', (cm, e) => void onMarkdownViewerPasteImage(e, 'mdFile'));
      mdFileEditor.on('changes', onMdFileEditorInput);
      mdFileEditor.on('blur', () => void flushMdFileAutosave());
      mdFileEditor.on('keydown', (cm, e) => onMdFileEditorKeydown(e));
    } else {
      mdFileTextarea?.addEventListener('paste', (e) => void onMarkdownViewerPasteImage(e, 'mdFile'));
      mdFileTextarea?.addEventListener('input', onMdFileEditorInput);
      mdFileTextarea?.addEventListener('blur', () => void flushMdFileAutosave());
      mdFileTextarea?.addEventListener('keydown', onMdFileEditorKeydown);
    }
    document.getElementById('btnReadmeEdit').addEventListener('click', () => toggleViewerDocEditor('readme'));
    document.getElementById('btnReadmeCancel').addEventListener('click', () => void cancelReadmeEditor());
    document.getElementById('inpGlobalViewerBasenames')?.addEventListener('blur', () => {
      const inp = document.getElementById('inpGlobalViewerBasenames');
      if (!inp) return;
      const list = normalizeGlobalViewerBasenamesList(inp.value);
      localStorage.setItem(LS.globalViewerBasenames, list.join(', '));
      inp.value = list.join(', ');
      if (!globalNestedReadmeView || folderThumbsView) return;
      const selPath = propsTargetPath();
      const row = propsTargetRowForDisplay();
      const root = readmeAggregateRootFolderFromSelection(selPath, row);
      if (root) void loadReadmeForFolder(root, selPath);
    });
    /** Leaving the single-doc view while its editor is open would drop unsaved edits — block and revert controls. */
    function viewerFolderModeBlockedByOpenEditor() {
      const rw = document.getElementById('readmeEditorWrap');
      return !!(rw && !rw.classList.contains('d-none'));
    }
    /** Re-route the current selection through loadReadmeForFolder after a depth/thumbs change. */
    function applyViewerFolderView() {
      const selPath = propsTargetPath();
      const row = propsTargetRowForDisplay();
      const root = readmeAggregateRootFolderFromSelection(selPath, row);
      if (!root || !row) {
        globalNestedReadmeView = false;
        folderThumbsView = false;
        syncReadmeNestedDocsUi();
        return;
      }
      void loadReadmeForFolder(root, selPath);
    }
    function onViewerDepthChanged(wantNested) {
      const want = !!wantNested;
      if (want === globalNestedReadmeView) return;
      if (want && !folderThumbsView && viewerFolderModeBlockedByOpenEditor()) {
        syncReadmeNestedDocsUi();
        setStatusMain('Finish editing folder doc first.');
        return;
      }
      globalNestedReadmeView = want;
      if (folderThumbsView) folderThumbsRenderedSig = ''; /* depth change re-lists; stale grid must not survive */
      applyViewerFolderView();
    }
    function onViewerThumbsToggled(on) {
      const want = !!on;
      if (want === folderThumbsView) return;
      if (want && viewerFolderModeBlockedByOpenEditor()) {
        syncReadmeNestedDocsUi();
        setStatusMain('Finish editing folder doc first.');
        return;
      }
      folderThumbsView = want;
      folderThumbsRenderedSig = '';
      applyViewerFolderView();
    }
    /* The folder view's tabs (Folder doc | Thumbnails) and its Include subfolders switch. */
    document.getElementById('optViewerDocKindDoc')?.addEventListener('change', (e) => {
      if (e.target.checked) onViewerThumbsToggled(false);
    });
    document.getElementById('optViewerDocThumbs')?.addEventListener('change', (e) => {
      if (e.target.checked) onViewerThumbsToggled(true);
    });
    document.getElementById('optViewerDocNested')?.addEventListener('change', (e) => {
      onViewerDepthChanged(!!e.target.checked);
    });
    document.getElementById('btnViewerNewTodo')?.addEventListener('click', () => {
      const root = readmeAggregateRootFolderFromSelection(propsTargetPath(), propsTargetRowForDisplay());
      showQuickTodoPop(root);
    });
    document.getElementById('btnReadmeWrite')?.addEventListener('click', () => setViewerDocEditorOpen('readme', true));
    document.getElementById('btnMdFileRefresh')?.addEventListener('click', () => void refreshMdFileViewerFromDisk());
    document.getElementById('btnPdfRefresh')?.addEventListener('click', () => void refreshPdfViewerFromDisk());
    document.getElementById('btnMdFileEdit').addEventListener('click', () => toggleViewerDocEditor('mdFile'));
    (function bindViewerDocPreviewActivators() {
      function bind(prevId, which) {
        const el = document.getElementById(prevId);
        if (!el) return;
        const open = () => {
          if (which === 'mdFile') void openMdFileEditorFresh();
          else setViewerDocEditorOpen(which, true);
        };
        el.addEventListener('dblclick', () => {
          if (which === 'readme' && globalNestedReadmeView) return;
          open();
        });
        el.addEventListener('keydown', (e) => {
          if (which === 'readme' && globalNestedReadmeView) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        });
      }
      bind('readmePreview', 'readme');
      bind('mdFilePreview', 'mdFile');
    })();

    document.getElementById('btnOpenGoogleWorkspace').addEventListener('click', async () => {
      const btn = document.getElementById('btnOpenGoogleWorkspace');
      const u = btn && btn.dataset && btn.dataset.url;
      const status = document.getElementById('statusMain');
      if (!u || !window.tagBrowser.openGoogleWorkspaceWindow) return;
      const r = await window.tagBrowser.openGoogleWorkspaceWindow({ url: u });
      if (status) setStatusMain(r.ok ? 'Opened in app window.' : (r.error || 'Open failed'));
    });
    document.getElementById('btnGdocOpenBrowser')?.addEventListener('click', (e) => {
      const u = e.currentTarget.dataset.url;
      if (u && window.tagBrowser.openUrlDefaultBrowser) void window.tagBrowser.openUrlDefaultBrowser({ url: u });
    });
    /* The Viewer's own Open and Show in folder, offered where it has nothing to show. */
    document.getElementById('btnViewerOpenDefault')?.addEventListener('click', () => {
      const fp = propsTargetPath();
      if (fp) void openFileDefaultOrGoogleWorkspace(fp);
    });
    document.getElementById('btnViewerShowInFolder')?.addEventListener('click', () => {
      const fp = propsTargetPath();
      if (fp) void window.tagBrowser.showInFolder(fp);
    });

    function onPathsMutated(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      if (p.trashed && Array.isArray(p.paths)) removeGonePathsFromUiNow(p.paths);
      if (Array.isArray(p.moved) && p.moved.length) {
        clearGoneTombstones(p.moved.map((m) => m && m.to));
        removeGonePathsFromUiNow(p.moved.map((m) => m && m.from));
      }
      if (Array.isArray(p.copied) && p.copied.length) clearGoneTombstones(p.copied);
      void refreshAfterDiskMutation(payload);
    }
    window.tagBrowser.setPathsMutatedHandler(onPathsMutated);
    window.tagBrowser.setShellActionErrorHandler((msg) => {
      setStatusMain(String(msg || 'Action failed'));
    });
    if (typeof window.tagBrowser.setSearchDebugFromMainHandler === 'function') {
      window.tagBrowser.setSearchDebugFromMainHandler((eventName, data) => {
        searchDebugLog(eventName, data);
      });
    }
    if (typeof window.tagBrowser.setPlainF5SearchRefreshHandler === 'function') {
      window.tagBrowser.setPlainF5SearchRefreshHandler(() => {
        searchDebugLog('searchRefresh.f5.renderer', { step: 'beforeRunSearchNow', eventKind: 'refresh' });
        void refreshResultsFromUi();
      });
    }
    if (typeof window.tagBrowser.setAppRestartHintHandler === 'function') {
      window.tagBrowser.setAppRestartHintHandler((payload) => {
        const src = payload && payload.source;
        if (src === 'menu') setStatusMain('Restarting TagFox (menu)…');
        else setStatusMain('Restarting TagFox (Ctrl+F5)…');
      });
    }
    if (typeof window.tagBrowser.setQuickTodoOpenHandler === 'function') {
      window.tagBrowser.setQuickTodoOpenHandler(() => showQuickTodoPop());
    }
    if (typeof window.tagBrowser.setRecentChangesOpenHandler === 'function') {
      window.tagBrowser.setRecentChangesOpenHandler(() => void openRecentChanges());
    }
    if (typeof window.tagBrowser.setHotkeyRaisedHandler === 'function') {
      window.tagBrowser.setHotkeyRaisedHandler(() => onHotkeyRaised());
    }
    if (typeof window.tagBrowser.setFileDialogTargetHandler === 'function') {
      window.tagBrowser.setFileDialogTargetHandler((info) => setFileDialogTarget(info));
    }
    document.getElementById('btnFileDialogSendFolder')?.addEventListener('click', () => sendScopeFolderToFileDialog());
    document.getElementById('btnFileDialogCancel')?.addEventListener('click', () => cancelFileDialogTarget());
    document.getElementById('btnQuickTodoPopClose')?.addEventListener('click', () => hideQuickTodoPop());
    document.getElementById('btnQuickTodoPopCancel')?.addEventListener('click', () => {
      const inp = document.getElementById('quickTodoTitleInput');
      const bodyInp = document.getElementById('quickTodoBodyInput');
      if (inp) inp.value = '';
      if (bodyInp) bodyInp.value = '';
      hideQuickTodoPop();
    });
    document.getElementById('btnQuickTodoPopSave')?.addEventListener('click', () => void createQuickTodoFromPop());
    document.getElementById('btnQuickTodoPopTags')?.addEventListener('click', () => toggleQuickTodoTagsPanel());
    document.getElementById('btnQuickTodoPopBody')?.addEventListener('click', () => toggleQuickTodoBodyPanel());
    document.getElementById('btnQuickTodoTagAddBtn')?.addEventListener('click', () => {
      const inp = document.getElementById('quickTodoTagInput');
      const value = inp ? inp.value : '';
      if (inp) inp.value = '';
      addQuickTodoTag(value);
    });
    document.getElementById('quickTodoTagInput')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const inp = document.getElementById('quickTodoTagInput');
      const value = inp ? inp.value : '';
      if (inp) inp.value = '';
      addQuickTodoTag(value);
    });
    document.getElementById('quickTodoAddDateBtn')?.addEventListener('click', () => {
      const di = document.getElementById('quickTodoDateInput');
      const value = di ? di.value : ''; // ISO yyyy-mm-dd; stored as xd- on create
      if (di) di.value = '';
      addQuickTodoTag(value);
    });
    document.getElementById('quickTodoAddHideBtn')?.addEventListener('click', () => {
      const hi = document.getElementById('quickTodoHideInput');
      const value = (hi && hi.value || '').trim();
      if (hi) hi.value = '';
      if (value) addQuickTodoTag(T.HIDE_PREFIX + value);
    });
    document.getElementById('quickTodoTitleInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void createQuickTodoFromPop();
      }
    });
    document.getElementById('btnPropsCopyText')?.addEventListener('click', async () => {
      const text = currentViewerCopyText();
      if (!text) return;
      const ok = await copyPlainTextToClipboard(text);
      setStatusMain(ok ? 'Copied viewer text.' : 'Could not copy viewer text.');
    });

    /** Electron: webContents can stop receiving keys after button clicks until main focuses it again. */
    function pullWebContentsKeyboardFocus() {
      try {
        if (window.tagBrowser && typeof window.tagBrowser.focusWebContents === 'function') {
          window.tagBrowser.focusWebContents();
          if (isSearchDebugOn()) {
            const t = Date.now();
            if (t - searchDebugPullWcLastMs > 900) {
              searchDebugPullWcLastMs = t;
              searchDebugFocusSnapshot('pullWebContents');
            }
          }
        }
      } catch (_) {}
    }

    /** Bootstrap: body gets `modal-open` with backdrop — treat as modal even if `.show` query lags one frame. */
    function tagfoxModalBlocksWorkAreaFocus() {
      return document.body.classList.contains('modal-open') || !!document.querySelector('.modal.show');
    }

    /* Modal fields can show focused but ignore keys on Windows until you alt-tab away and back; force an OS
       focus cycle in main. Heavier than pullWebContentsKeyboardFocus, so call only on modal show, not per click. */
    function forceWebContentsKeyboardFocus() {
      try {
        if (window.tagBrowser && typeof window.tagBrowser.forceFocusWebContents === 'function') {
          window.tagBrowser.forceFocusWebContents();
        }
      } catch (_) {}
    }

    /* Focus the field first so Windows returns the keyboard to it when the forced focus cycle completes. */
    function pinModalFieldFocus(el, selectText) {
      if (!el) return;
      el.focus({ preventScroll: true });
      if (selectText && typeof el.select === 'function') el.select();
      forceWebContentsKeyboardFocus();
    }

    /* Heavy keyboard-focus recovery for a genuine click on the search box. The light pull is a no-op while
       the window is already foreground, so a stuck keyboard is only cured by the blur+focus cycle (the
       programmatic form of the alt-tab the user would otherwise do). Throttled so a pointerdown that is
       followed by a programmatic focus does not cycle twice in quick succession. */
    let lastSearchBoxFocusRecoverMs = 0;
    function recoverSearchBoxKeyboardFocus() {
      if (tagfoxModalBlocksWorkAreaFocus()) return;
      const now = Date.now();
      if (now - lastSearchBoxFocusRecoverMs < 400) {
        pullWebContentsKeyboardFocus();
        return;
      }
      lastSearchBoxFocusRecoverMs = now;
      forceWebContentsKeyboardFocus();
    }

    /** Focus search input; select all text when true. Skips if a dialog is open. */
    function focusQueryBox(selectAll) {
      if (tagfoxModalBlocksWorkAreaFocus()) return;
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

    /* The global toggle shortcut raised the window (main sends tagfox-hotkey-raised after show + focus): put
       the whole query under selection, so typing replaces it and an arrow key steps out of it. The window
       'focus' event also fires for alt-tab and mouse clicks, which keep the caret where it was, so only a
       raise main announced selects. The message and the focus event arrive in either order. Window already
       focused: select now. Otherwise leave a short flag for the focus event to read, one-shot. */
    /* Another app's Open or Save dialog that the toggle shortcut raised TagFox from (main's
       tagfox-file-dialog-target, told on every raise and cleared when the window hides; file-dialog-handoff.js).
       While one is waiting, opening a row (Enter, a double-click, Ctrl+1…9) sends it to the dialog instead,
       Ctrl+Enter sends the folder TagFox is showing, and Esc stops. The strip above the box says so. */
    let fileDialogTarget = null;
    const fileDialogSendLog = [];
    function setFileDialogTarget(info) {
      fileDialogTarget = info && typeof info === 'object' ? info : null;
      const bar = document.getElementById('fileDialogBar');
      if (!bar) return;
      bar.classList.toggle('d-none', !fileDialogTarget);
      if (!fileDialogTarget) return;
      const t = fileDialogTarget;
      const name = String(t.fileName || '').trim();
      const press = t.kind === 'save' ? 'you press Save' : "you press the dialog's own button";
      document.getElementById('fileDialogBarTitle').textContent = `Next pick goes to: ${t.app} · ${t.title}`;
      document.getElementById('fileDialogBarHint').textContent =
        t.kind === 'open'
          ? 'Enter or a double-click sends the selected row: a file opens, a folder is shown in the dialog. Ctrl+Enter sends this folder; Esc stops.'
          : `Enter sends the selected row's folder${name ? `, keeping the name “${name}”` : ''}, and ${press}. Ctrl+Enter sends this folder; Esc stops.`;
    }
    async function sendToFileDialog(fp, isFolder) {
      if (!fileDialogTarget || !fp) return;
      fileDialogSendLog.push({ path: fp, isFolder: !!isFolder });
      if (fileDialogSendLog.length > 20) fileDialogSendLog.shift();
      let r;
      try {
        r = await window.tagBrowser.fileDialogSend(fp, isFolder);
      } catch (e) {
        r = { ok: false, error: String((e && e.message) || e) };
      }
      if (!r || !r.ok) setStatusMain('Not sent to the dialog: ' + ((r && r.error) || 'no answer from TagFox'));
    }
    function sendScopeFolderToFileDialog() {
      const folder = currentScopeFolderPath();
      if (!folder) {
        setStatusMain('No folder to send while searching everywhere: select a folder row and press Enter.');
        return;
      }
      void sendToFileDialog(folder, true);
    }
    function cancelFileDialogTarget() {
      setFileDialogTarget(null);
      void window.tagBrowser.fileDialogCancel?.();
    }

    let hotkeyRaiseSelectUntil = 0;
    const HOTKEY_RAISE_FLAG_MS = 1500;
    function onHotkeyRaised() {
      if (document.querySelector('.dropdown-menu.show')) return;
      if (document.hasFocus()) focusQueryBox(true);
      else hotkeyRaiseSelectUntil = Date.now() + HOTKEY_RAISE_FLAG_MS;
    }

    /** Window 'focus' handler body: true once for a hotkey raise whose message arrived first. */
    function takeHotkeyRaiseFlag() {
      const raised = Date.now() < hotkeyRaiseSelectUntil;
      hotkeyRaiseSelectUntil = 0;
      return raised;
    }

    /** The one explicit-refresh path: F5 (either route) and the Refresh command, from the / list or the
        options panel. The search reports the clock time and what changed, so a refresh that finds nothing new
        still shows it ran. */
    async function refreshResultsFromUi() {
      await runSearchNow('refresh', { uiHint: 'f5' });
    }

    /** After programmatic list selection: move keyboard focus off stray buttons onto the results region. */
    function focusResultsWrapAfterListSelection() {
      if (tagfoxModalBlocksWorkAreaFocus()) return;
      const wrap = document.getElementById('resultsWrap');
      const ae = document.activeElement;
      if (ae && ae.id === 'query') return;
      if (ae && isTypingTarget(ae)) return;
      /* Already in the list: skip refocus — was every ↑/↓ and felt jerky. */
      if (wrap && (ae === wrap || (ae.nodeType === Node.ELEMENT_NODE && wrap.contains(ae)))) return;
      /* No pullWebContents: window keydown uses capture:true — arrows work even when focus is on a button; IPC was jerky. */
      wrap?.focus({ preventScroll: true });
    }

    /** After toolbar/chrome control click: query if no rows, else results region (for ↑/↓ etc.). */
    function focusMainWorkingArea() {
      if (tagfoxModalBlocksWorkAreaFocus()) return;
      if (isTypingTarget(document.activeElement)) return;
      pullWebContentsKeyboardFocus();
      const rows = listRowsForUi();
      if (selectedFullPath && rows.length && !isRunnerMode()) document.getElementById('resultsWrap')?.focus({ preventScroll: true });
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

    /** Folder readme / .md file viewer: Alt+←/→ must not run search-history (caret/word keys in the editor). */
    function isInMarkdownEditSurface(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      if (el.id === 'readmeEditor' || el.id === 'mdFileEditor') return true;
      const rw = document.getElementById('readmeEditorWrap');
      if (rw && !rw.classList.contains('d-none') && rw.contains(el)) return true;
      const mw = document.getElementById('mdFileEditorWrap');
      return !!(mw && !mw.classList.contains('d-none') && mw.contains(el));
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
      return (isTypingTarget(el) || isInMarkdownEditSurface(el)) && !(el && el.id === 'query');
    }

    /** Any dropdown menu, the toggle of an open one, or a breadcrumb flyout owns ↑/↓/←/→ + Enter: skip global table/scope nav, or Enter opens the selected result row instead of the focused item, the first ↓ from the toggle also moves the results selection, and ←/→ would drill the flyout chain. */
    function isMenuKeyboardNavTarget(el) {
      if (!el || !el.closest) return false;
      if (el.matches('[data-bs-toggle="dropdown"][aria-expanded="true"]')) return true;
      return !!el.closest('ul.breadcrumb-folder-flyout, .dropdown-menu');
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

    function scrollActiveResultsRowIntoViewNearest() {
      if (resultsActiveRowScrollRaf != null) cancelAnimationFrame(resultsActiveRowScrollRaf);
      resultsActiveRowScrollRaf = requestAnimationFrame(() => {
        resultsActiveRowScrollRaf = null;
        const tr = document.querySelector('#resultsTable tbody tr.table-active');
        if (tr) tr.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      });
    }

    function moveResultsSelection(delta) {
      resultsShiftRangeAnchorIdx = null;
      const rows = listRowsForUi();
      if (!rows.length) return;
      let idx = navFocusIndexInFilteredRows(rows);
      if (idx < 0) idx = delta > 0 ? 0 : rows.length - 1;
      else idx = Math.max(0, Math.min(rows.length - 1, idx + delta));
      const row = rows[idx];
      resultsExclusiveSelectRow(row, fullPathForRow(row));
      runnerGrowRenderWindow(idx);
      scrollActiveResultsRowIntoViewNearest();
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
      syncResultsRowCheckboxStates();
      const row = rows[newIdx];
      setSelection(row, fullPathForRow(row));
      runnerGrowRenderWindow(newIdx);
      scrollActiveResultsRowIntoViewNearest();
    }

    /** Step into the active pane from the search box: keep the current selection if there is one (just reveal it),
     *  else pick the first row. Used by Tab / ArrowDown so leaving the box never discards the existing selection. */
    function enterResultsListKeepingSelection() {
      const rows = listRowsForUi();
      if (!rows.length) return false;
      if (navFocusIndexInFilteredRows(rows) < 0) moveResultsSelectionToEdge(false);
      else scrollActiveResultsRowIntoViewNearest();
      return true;
    }

    /** The selected row's action buttons by keyboard, in both layouts (October 2026). Tab in the list puts the focus
     *  on the first of them and each further Tab steps along, wrapping; Shift+Tab steps back. Enter or Space presses
     *  the focused button and Esc returns to the list. Any other key leaves the strip and acts on the list as before.
     *  The row carries `results-row-actions-kbd` while its strip has the focus, because Runner shows the strip only
     *  on hover and a display:none button cannot take the focus; the focusout listener on #resultsWrap drops it.
     *  Runs ahead of both layouts' key handlers. True: the key was the strip's. */
    function rowActionButtons(tr) {
      return tr ? Array.from(tr.querySelectorAll('.results-td-actions-inner button')).filter((b) => !b.disabled) : [];
    }
    function focusRowActionButton(btn) {
      const tr = btn.closest('tr');
      document.querySelectorAll('#tbody tr.results-row-actions-kbd').forEach((x) => {
        if (x !== tr) x.classList.remove('results-row-actions-kbd');
      });
      if (tr) tr.classList.add('results-row-actions-kbd');
      btn.focus({ preventScroll: true });
      setStatusMain((btn.getAttribute('aria-label') || btn.title || 'Row button') + ': Enter presses it, Tab moves on, Esc goes back to the list');
    }
    function rowActionStripHandleKeydown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return false;
      if (document.querySelector('.modal.show')) return false;
      if (isRunnerMode() && (runnerCmdListIsOpen() || runnerOptsPanelOpen)) return false;
      const wrap = document.getElementById('resultsWrap');
      const t = e.target;
      const btn = t && t.closest ? t.closest('#tbody .results-td-actions-inner button') : null;
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
        return true;
      };
      if (!btn) {
        if (e.key !== 'Tab' || e.shiftKey || !wrap) return false;
        if (!(t === wrap || t === document.body || (t && t.closest && t.closest('#tbody')))) return false;
        const btns = rowActionButtons(document.querySelector('#tbody tr.table-active'));
        if (!btns.length) return false;
        focusRowActionButton(btns[0]);
        return consume();
      }
      if (e.key === 'Tab') {
        const btns = rowActionButtons(btn.closest('tr'));
        const n = btns.length;
        const i = Math.max(0, btns.indexOf(btn));
        if (n) focusRowActionButton(btns[(i + (e.shiftKey ? -1 : 1) + n) % n]);
        return consume();
      }
      if ((e.key === 'Enter' || e.key === ' ') && !e.shiftKey) {
        if (!e.repeat) btn.click();
        return consume();
      }
      if (wrap) wrap.focus({ preventScroll: true });
      if (e.key === 'Escape') return consume();
      return false;
    }

    /** Jump selection to first (false) or last (true) visible row. */
    function moveResultsSelectionToEdge(isEnd) {
      const rows = listRowsForUi();
      if (!rows.length) return;
      const row = rows[isEnd ? rows.length - 1 : 0];
      resultsExclusiveSelectRow(row, fullPathForRow(row));
      if (isEnd) runnerGrowRenderWindow(rows.length - 1);
      scrollActiveResultsRowIntoViewNearest();
    }

    /** Scroll a result row to the top of #resultsScroll. */
    function scrollResultsRowToTopOfList(tr) {
      const wrap = document.getElementById('resultsScroll');
      if (!wrap || !tr) return;
      const w = wrap.getBoundingClientRect();
      const r = tr.getBoundingClientRect();
      wrap.scrollTop += r.top - w.top;
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
          resultsExclusiveSelectRow(row, fullPathForRow(row));
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

    /** Advanced → Whole word: flip + schedule search (same as clicking the checkbox). */
    /** Flip a search-option checkbox and fire its change handler (whole word, match path, hide special, hide ~). */
    function toggleSearchOptCheckbox(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = !el.checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function toggleWholeWordMatch() {
      toggleSearchOptCheckbox('optWholeWord');
    }

    /** The folder buttons (Explorer, copy, tags, terminal, quoted path, more) need a current folder. */
    function syncScopeBarButtons() {
      const raw = document.getElementById('rootFolder').value.trim();
      const hasScope = !!normalizeFolderPathForEverything(raw);
      for (const id of ['btnScopeBarOpen', 'btnScopeBarClip', 'btnScopeBarTags', 'btnScopeBarTerminal', 'btnScopeBarCopyQuoted', 'btnScopeBarMore']) {
        const el = document.getElementById(id);
        if (el) el.disabled = !hasScope;
      }
    }

    /**
     * Immediate child folders of parentNorm via Everything (parent: + folder:), then client-sort like the results table.
     * Scope chevrons ← / → : sibling navigation.
     */
    async function fetchSortedSiblingFolderRowsUnderParent(parentNorm) {
      if (!window.tagBrowser || typeof window.tagBrowser.search !== 'function') return [];
      const par = normalizeFolderPathForEverything(String(parentNorm || '').trim());
      if (!par) return [];
      let searchText = composeScopedEverythingSearch(getSearchScopeCeilingFoldersNorms(), par, '', true).trim() + ' folder:';
      const res = await everythingSearchOnce({
        searchText,
        count: parseMaxResultsCap(),
        options: { ...everythingOptionsForRequest(), pathSearch: true, offset: 0 },
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
      const status = document.getElementById('statusMain');
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) {
        if (status) setStatusMain('No current folder set.');
        return;
      }
      const norm = normalizeFolderPathForEverything(raw);
      const parRaw = T.parentDir(norm);
      const par = normalizeFolderPathForEverything(parRaw);
      if (!par || pathNormKey(par) === pathNormKey(norm)) {
        if (status) setStatusMain('No sibling folders at this level.');
        return;
      }
      const rows = await fetchSortedSiblingFolderRowsUnderParent(par);
      if (!rows.length) {
        if (status) setStatusMain('Could not list folders in parent.');
        return;
      }
      const scopeKey = pathNormKey(norm);
      const idx = rows.findIndex((r) => pathNormKey(fullPathForRow(r)) === scopeKey);
      if (idx < 0) {
        if (status) setStatusMain('Current folder not in parent listing.');
        return;
      }
      const j = idx + delta;
      if (j < 0 || j >= rows.length) {
        if (status)
          setStatusMain(delta < 0 ? 'Already at first sibling folder.' : 'Already at last sibling folder.');
        return;
      }
      await applySearchScopeAndRefresh(normalizeFolderPathForEverything(fullPathForRow(rows[j])));
    }

    /** Move scope folder to parent (toolbar scope / Settings field). */
    async function goToParentScopeFolder() {
      const status = document.getElementById('statusMain');
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) {
        setStatusMain('No current folder set.');
        return;
      }
      const norm = normalizeFolderPathForEverything(raw);
      // Alt+↑ on C:\: clear current folder so the query is not limited to that drive (Settings scope ceiling unchanged).
      if (isWindowsDriveRootNorm(norm)) {
        document.getElementById('rootFolder').value = '';
        saveSettings();
        renderScopeBreadcrumb();
        await runSearchNow();
        commitSearchHistoryNow();
        pulseSearchBoxAfterScopeFolderChange();
        return;
      }
      const parRaw = T.parentDir(norm);
      const par = normalizeFolderPathForEverything(parRaw);
      if (!par || par.replace(/[/\\]+$/, '').toLowerCase() === norm.replace(/[/\\]+$/, '').toLowerCase()) {
        setStatusMain('Already at top of path.');
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
      if (fileDialogTarget) {
        await sendToFileDialog(fp, rowIsFolder(row));
        return;
      }
      const status = document.getElementById('statusMain');
      if (rowIsFolder(row)) {
        const folderFp = normalizeFolderPathForEverything(fp);
        selectedRow = row;
        selectedFullPath = fp;
        if (String(document.getElementById('query')?.value || '').trim()) {
          clearSearchQueryInputOnly();
        }
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

    /** Tags for the checked rows only. */
    function keyboardOpenTagsModal() {
      const bulk = getCheckedPathsArr();
      if (bulk.length > 1) openTagModalBulk(bulk);
      else if (bulk.length === 1) openTagModal(bulk[0]);
    }

    function toggleKeyboardRowCheckbox() {
      if (!selectedFullPath) return;
      resultsShiftRangeAnchorIdx = null;
      const row = selectedRowForActions();
      if (!row) return;
      const fp = fullPathForRow(row);
      toggleCheckPath(fp, !isCheckedPath(fp));
      renderTable();
    }

    async function keyboardRecycleConfirm() {
      if (tagRenameBusy) return;
      const status = document.getElementById('statusMain');
      const p = getCheckedPathsArr();
      searchDebugLog('recycle.ui', { source: 'deleteKey', phase: 'click', checked: p.length });
      if (!p.length) {
        searchDebugLog('recycle.ui', { source: 'deleteKey', phase: 'noopNoSelection' });
        return;
      }
      if (!(await confirmRecycle(p))) {
        searchDebugLog('recycle.ui', { source: 'deleteKey', phase: 'confirmCancel', count: p.length });
        return;
      }
      detachViewerEditorsForTrashedPaths(p);
      setDeletingStatus(p.length);
      const { r, threw } = await trashPathsInvokeWithSearchDebug(p, 'deleteKey');
      if (threw) {
        setStatusMain('Delete failed');
        return;
      }
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Delete failed');
      else {
        checkedPathsMap.clear();
        updateBulkBar();
        void refreshAfterDiskMutation({ paths: p, trashed: true });
      }
    }

    async function copyShortcutExplorerFiles() {
      const status = document.getElementById('statusMain');
      const paths = getCheckedPathsArr();
      if (!paths.length) return;
      const r = await window.tagBrowser.copyExplorerPaste(paths);
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Copy for Explorer failed');
      else
        setStatusMain(
          paths.length === 1
            ? 'Copied 1 item for Explorer paste (Ctrl+V in a folder).'
            : 'Copied ' + paths.length + ' items for Explorer paste.'
        );
    }

    /** Ctrl+Shift+C / ⌘+Shift+C: plain-text full paths (same strings as ⋯ → Full path); multiple checked → newline-separated. */
    async function keyboardCopyFullPathsText() {
      const status = document.getElementById('statusMain');
      const paths = getCheckedPathsArr();
      if (!paths.length) return;
      const text = paths.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        setStatusMain(paths.length === 1 ? 'Copied full path.' : 'Copied ' + paths.length + ' full paths.');
      } catch (_) {
        setStatusMain('Could not copy paths.');
      }
    }

    async function cutShortcutExplorerFiles() {
      const status = document.getElementById('statusMain');
      const paths = getCheckedPathsArr();
      if (!paths.length) return;
      if (!window.tagBrowser.cutExplorerPaste) {
        setStatusMain('Cut not available.');
        return;
      }
      const r = await window.tagBrowser.cutExplorerPaste(paths);
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Cut for Explorer failed');
      else
        setStatusMain(
          paths.length === 1
            ? 'Cut 1 item — paste in Explorer to move it.'
            : 'Cut ' + paths.length + ' items — paste in Explorer to move them.'
        );
    }

    async function pasteShortcutClipboardIntoScope() {
      const status = document.getElementById('statusMain');
      const currentFolder = currentScopeFolderPath();
      if (!currentFolder) {
        setStatusMain('Set the current folder (breadcrumb or path editor) to paste into.');
        return;
      }
      const dest = await chooseTargetFolderFromCheckedRows(currentFolder);
      if (!dest) {
        setStatusMain('Paste cancelled.');
        return;
      }
      const rootPrefix = rootPrefixValue();
      setBusyStatusHint('Pasting clipboard into folder...');
      const r = await pasteClipboardIntoScopeWithConflictPrompt(dest, rootPrefix);
      if (!r || !r.ok) setStatusMain((r && r.error) || 'Paste failed');
      else {
        setStatusMain('Pasted into folder.');
        void refreshAfterDiskMutation({ paths: [dest] }); // + paths-mutated from main
      }
    }

    /* capture: true — run before focused <button> or other controls eat the key (Electron + Chromium). */
    window.addEventListener(
      'keydown',
      (e) => {
      if (e.defaultPrevented) return;
      if (rowActionStripHandleKeydown(e)) return;
      if (isRunnerMode() && runnerHandleKeydown(e)) return;

      if (e.key === 'Escape' && isPropsTheaterOn() && !document.querySelector('.modal.show')) {
        e.preventDefault();
        setPropsTheaterMode(false);
        return;
      }

      {
        const pop = document.getElementById('quickTodoPop');
        if (
          e.key === 'Escape' &&
          pop &&
          !pop.classList.contains('d-none') &&
          !document.querySelector('.modal.show')
        ) {
          e.preventDefault();
          hideQuickTodoPop();
          return;
        }
      }

      if (e.key === 'Escape' && !document.querySelector('.modal.show') && breadcrumbSubfolderFlyoutsAreOpen()) {
        e.preventDefault();
        hideBreadcrumbSubfolderFlyout();
        return;
      }

      /* Esc: checked result rows → clear checks (before query/scope Esc). No modal / open dropdown. */
      if (
        e.key === 'Escape' &&
        !document.querySelector('.modal.show') &&
        !document.querySelector('.dropdown-menu.show') &&
        checkedPathsMap.size
      ) {
        e.preventDefault();
        clearResultsCheckedSelection();
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
      if (modC && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const hm = document.getElementById('helpModal');
        if (hm) bootstrap.Modal.getOrCreateInstance(hm).show();
        return;
      }
      if (modC && !e.shiftKey && (e.key === ',' || e.code === 'Comma')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleSettingsPanel();
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
      if (modC && e.shiftKey && e.key === 'Home') {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        clearSearchScopeAndTagRecencyFilters();
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleWholeWordMatch();
        return;
      }
      if (modC && !e.shiftKey && (e.key === '.' || e.code === 'Period')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleSearchOptCheckbox('optHideSpecial');
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'j' || e.key === 'J')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        moveResultsSiblingFolder(1);
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        moveResultsSiblingFolder(-1);
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const order = ['1h', '1d', '1w', '1m', '1y', 'all'];
        const cur = recencyFilterMode();
        const next = order[(order.indexOf(cur) + 1) % order.length];
        setRecencyFilterMode(next);
        const nextEl = document.querySelector(`input[name="tagFoxRecencyFilter"][value="${next}"]`);
        nextEl?.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (modC && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleRecencyAllVsHour();
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (document.querySelector('.modal.show')) return;
        // Stricter than blockAppShortcutInTextField: also yield in #query, so Ctrl+Z is native text undo in every input.
        if (isTypingTarget(e.target) || isInMarkdownEditSurface(e.target)) return;
        e.preventDefault();
        void runUndo();
        return;
      }
      if (modC && (e.key === 'h' || e.key === 'H')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        openBulkRenameModal();
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
        if (isInMarkdownEditSurface(e.target) || isInMarkdownEditSurface(document.activeElement)) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void goSearchHistory(-1);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowRight') {
        if (document.querySelector('.modal.show')) return;
        if (isInMarkdownEditSurface(e.target) || isInMarkdownEditSurface(document.activeElement)) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void goSearchHistory(1);
        return;
      }
      /* Ctrl+Shift+1…9 / ⌘+Shift+1…9: the Nth star (1-based); Ctrl+Shift+N stays “new folder”. */
      if (modC && e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        const list = loadFavouriteFolders();
        const idx = Number(e.code.charAt(5)) - 1;
        if (!list[idx]) return;
        e.preventDefault();
        void openFavouritePath(list[idx]);
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === ' ' || e.code === 'Space')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        togglePropsTheaterMode();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal.show')) return;

      if (e.key === 'F5') {
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        /* Same reporting as the main-process F5 route and the button: a silent refresh here was one of the
           ways "F5 did nothing" could be true on screen while the search had in fact run. */
        void refreshResultsFromUi();
        return;
      }
      if (e.key === 'F2') {
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void renameItemInteractive();
        return;
      }

      if (isTypingTarget(e.target)) return;
      if (isMenuKeyboardNavTarget(e.target)) {
        const kk = e.key;
        if (
          kk === 'ArrowDown' ||
          kk === 'ArrowUp' ||
          kk === 'ArrowLeft' ||
          kk === 'ArrowRight' ||
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

      if (isInMarkdownEditSurface(e.target) || isInMarkdownEditSurface(document.activeElement)) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        void keyboardActivateSelection();
        return;
      }

      if ((e.key === ' ' || e.code === 'Space') && !e.shiftKey) {
        /* Let Bootstrap btn-check toggles use native Space. */
        const sp = e.target;
        if (sp && sp.matches && sp.matches('input.btn-check')) return;
        e.preventDefault();
        toggleKeyboardRowCheckbox();
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

      /* → on a folder row: scope into that folder. */
      if (e.key === 'ArrowRight') {
        if (!selectedFullPath) return;
        const row = selectedRowForActions();
        if (row && rowIsFolder(row)) {
          e.preventDefault();
          void applySearchScopeAndRefresh(normalizeFolderPathForEverything(fullPathForRow(row)));
        }
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
          e.target.closest?.('.results-pane tbody tr') || e.target.closest?.('.shelf-chip');
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
        document.querySelectorAll('.results-pane tbody tr.results-drag-over').forEach((tr) =>
          tr.classList.remove('results-drag-over')
        );
        document.querySelectorAll('.results-pane.results-scope-drop-over').forEach((el) =>
          el.classList.remove('results-scope-drop-over')
        );
        document
          .querySelectorAll('#breadcrumbBar [data-drop-path].results-drag-over')
          .forEach((n) => n.classList.remove('results-drag-over'));
        document.getElementById('appShelf')?.classList.remove('shelf-aside-drag-over');
        clearInternalPathDragDropTargetHints();
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
        const st = document.getElementById('statusMain');
        void (async () => {
          if (!window.tagBrowser) {
            if (st) setStatusMain('Electron bridge missing — run TagFox with npm start (not a raw browser tab).');
            console.warn('[TagFox] window.tagBrowser missing');
            return;
          }
          if (addFolder) {
            if (typeof window.tagBrowser.pickScopeFolder !== 'function') {
              if (st)
                setStatusMain(
                  'Folder picker not available — fully quit TagFox and start again so preload.js is reloaded.'
                );
              console.warn('[TagFox] pickScopeFolder missing on tagBrowser');
              return;
            }
            try {
              const r = await window.tagBrowser.pickScopeFolder();
              if (r && r.ok && r.path) await setSearchScopeMaxFromPicker(r.path);
              else if (st) setStatusMain((r && r.error) || 'Folder picker cancelled.');
            } catch (err) {
              if (st) setStatusMain('Folder picker failed: ' + (err && err.message ? err.message : String(err)));
              console.warn('[TagFox] pickScopeFolder', err);
            }
            return;
          }
          if (addProfile) {
            if (typeof window.tagBrowser.userHomeDir !== 'function') {
              if (st) setStatusMain('Profile folder not available — restart TagFox.');
              console.warn('[TagFox] userHomeDir missing on tagBrowser');
              return;
            }
            try {
              const r = await window.tagBrowser.userHomeDir();
              if (r && r.ok && r.path) await setSearchScopeMaxFromPicker(r.path);
              else if (st) setStatusMain((r && r.error) || 'Could not read profile folder.');
            } catch (err) {
              if (st) setStatusMain('Profile folder failed: ' + (err && err.message ? err.message : String(err)));
              console.warn('[TagFox] userHomeDir', err);
            }
            return;
          }
          if (addCurrent) {
            const p = currentScopeFolderPath() || getSearchScopeMaxFolderNorm();
            if (!p) {
              if (st) setStatusMain('No folder — set the breadcrumb or scope first.');
              return;
            }
            await setSearchScopeMaxFromPicker(p);
          }
        })();
      });
    }

    let quickTodoSettingsUiWired = false;
    /** Quick TODO folder: pick / use current / clear (Settings offcanvas). */
    function wireQuickTodoSettingsUiOnce() {
      if (quickTodoSettingsUiWired) return;
      const panel = document.getElementById('settingsPanel');
      if (!panel) return;
      quickTodoSettingsUiWired = true;
      panel.addEventListener('click', (e) => {
        const pick = e.target.closest('#btnQuickTodoPickFolder');
        const setCur = e.target.closest('#btnQuickTodoSetCurrent');
        const clearF = e.target.closest('#btnQuickTodoClearFolder');
        if (!pick && !setCur && !clearF) return;
        e.preventDefault();
        const st = document.getElementById('statusMain');
        void (async () => {
          if (!window.tagBrowser) {
            if (st) setStatusMain('Electron bridge missing — run TagFox with npm start.');
            return;
          }
          if (clearF) {
            clearQuickTodoFolderSetting();
            return;
          }
          if (pick) {
            if (typeof window.tagBrowser.pickScopeFolder !== 'function') {
              if (st) setStatusMain('Folder picker not available — restart TagFox.');
              return;
            }
            try {
              const r = await window.tagBrowser.pickScopeFolder();
              if (r && r.ok && r.path) await setQuickTodoFolderFromPicker(r.path);
              else if (st) setStatusMain((r && r.error) || 'Folder picker cancelled.');
            } catch (err) {
              if (st) setStatusMain('Folder picker failed: ' + (err && err.message ? err.message : String(err)));
            }
            return;
          }
          if (setCur) {
            const p = currentScopeFolderPath() || getSearchScopeMaxFolderNorm();
            if (!p) {
              if (st) setStatusMain('No folder — set the breadcrumb or scope first.');
              return;
            }
            await setQuickTodoFolderFromPicker(p);
          }
        })();
      });
    }

    const freshProfileSortsByPath = localStorage.getItem(LS.sortBy) === null;
    wireEverythingConnectionSectionCollapseOnce();
    wireTagfoxSettingsSectionCollapsesOnce();
    loadSettings();
    setEverythingConnectionBadgeUnknown();
    wireSearchScopeSettingsUiOnce();
    wireQuickTodoSettingsUiOnce();
    document.getElementById('settingsPanel')?.addEventListener('shown.bs.offcanvas', () => {
      void probeEverythingConnectionForSettingsBadge();
      void refreshRunningNow(true);
    });
    /* Which TagFox and which gmist are running, because neither says so and Steve could not tell.
       Main no longer restarts itself when main.js changes on disk, so the header carries a Restart
       button once it has; the gmist half shells out, so it is asked only when Settings opens. */
    const whenText = (t) =>
      new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    async function refreshRunningNow(withGmist) {
      if (!window.tagBrowser?.runtimeInfo) return;
      let info;
      try {
        info = await window.tagBrowser.runtimeInfo({ withGmist });
      } catch (_) {
        return;
      }
      const stale = info.changedSinceStart || [];
      const btn = document.getElementById('btnRestartTagFox');
      if (btn) {
        btn.classList.toggle('d-none', !stale.length);
        btn.title = 'Changed since TagFox started: ' + stale.join(', ') + '. Click to restart and run the new code.';
      }
      const tf = document.getElementById('runningNowTagFox');
      if (tf) {
        tf.textContent =
          'TagFox: started ' + whenText(info.startedAt) + ', PID ' + info.pid +
          (info.restartsInTerminal ? ', under npm start' : ', not under npm start (a restart detaches it)') +
          (stale.length ? '. Code changed since: ' + stale.join(', ') + ' (Restart in the search box).' : '. Running the code on disk.');
      }
      const gm = document.getElementById('runningNowGmist');
      if (gm && withGmist && info.gmist) {
        const g = info.gmist;
        gm.textContent = !machineHas('gmist')
          ? 'gmist: none on this machine, so markdown opens in its default app.'
          : !g.devPortHeld
          ? 'gmist: not running' + (g.sidecarPortHeld ? ', but something holds its sidecar port 5199' : '') +
            '. TagFox starts it the first time a markdown file is opened.'
          : 'gmist: ' + (g.holder ? g.holder.kind : 'running') +
            (g.holder && g.holder.started ? ', started ' + whenText(g.holder.started) : '') +
            (g.holder && g.holder.pid ? ', PID ' + g.holder.pid : '') + ', on port 5173.';
      }
    }
    void refreshRunningNow(false);
    setInterval(() => void refreshRunningNow(false), 30_000);
    window.addEventListener('focus', () => void refreshRunningNow(false));
    void refreshObsidianVaultRoots();
    window.addEventListener('focus', () => void refreshObsidianVaultRoots());
    void refreshMachineFeatures();
    window.addEventListener('focus', () => void refreshMachineFeatures());
    document.getElementById('btnRestartTagFox')?.addEventListener('click', () => void window.tagBrowser?.restartTagFox?.());
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
          (t.closest('ul.breadcrumb-folder-flyout') || t.closest('#breadcrumbBar .dropdown-menu'))
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
          if (tagfoxModalBlocksWorkAreaFocus()) return;
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
      if (t.closest('#quickTodoPop') || t.closest('#quickTodoTitleInput')) return;
      if (t.closest('#settingsPanel input, #settingsPanel textarea, #settingsPanel select')) return;
      if (!t.closest('button, [role="button"], input.btn-check, a.btn, label.btn')) return;
      scheduleRestoreFocusAfterControlClick();
    });
    const HELP_TAB_IDS = ['essentials', 'search', 'files-folders', 'viewer', 'projects', 'runner', 'installation'];
    /** A tab asked for by whatever opened Help (`?` asks for Keys, the Settings link for Setting up), used once. */
    let helpTabOnNextOpen = '';
    /** Runner opens Help on Get started (F1, the / command); Classic reopens the tab last read. */
    function restoreHelpModalTab() {
      const once = helpTabOnNextOpen;
      helpTabOnNextOpen = '';
      const raw = localStorage.getItem(LS.helpModalTab);
      const id = HELP_TAB_IDS.includes(once) ? once : isRunnerMode() ? 'essentials' : HELP_TAB_IDS.includes(raw) ? raw : 'essentials';
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
          .querySelectorAll('#breadcrumbBar [data-bs-toggle="dropdown"]')
          .forEach((btn) => {
            const inst = bootstrap.Dropdown.getInstance(btn);
            if (inst) inst.hide();
          });
        if (modalEl.id === 'helpModal') {
          renderRunnerKeysHelp();
          restoreHelpModalTab();
        }
      });
    });
    installTagFoxTooltipGuardsOnce();
    bindShelfDrop();
    document.getElementById('btnEverythingHttpOpenSettings')?.addEventListener('click', () => {
      const el = document.getElementById('settingsPanel');
      if (el) bootstrap.Offcanvas.getOrCreateInstance(el).show();
    });
    document.getElementById('btnEverythingHttpSetupHelp')?.addEventListener('click', () => {
      helpTabOnNextOpen = 'installation';
      const hm = document.getElementById('helpModal');
      if (hm) bootstrap.Modal.getOrCreateInstance(hm).show();
    });
    document.getElementById('btnEverythingHttpHelpDismiss')?.addEventListener('click', () => {
      hideEverythingHttpHelpBanner();
    });
    document.getElementById('btnShelfOpen').addEventListener('click', async () => {
      const st = await window.tagBrowser.shelfState();
      if (st.ok) void window.tagBrowser.openPath(st.path);
      else setStatusMain(st.error || 'Shelf unavailable');
    });
    document.getElementById('btnShelfOsDrag').addEventListener('click', () => {
      tagBrowserNextOsFileDrag = true;
      setStatusMain(
        'Next drag armed as a real file drag — drop into Explorer or another app. Without this, drags stay inside TagFox.'
      );
    });
    document.getElementById('btnShelfClear').addEventListener('click', async () => {
      if (!confirm('Send everything on the Shelf to the Recycle Bin?')) return;
      const r = await window.tagBrowser.clearShelf();
      setStatusMain(r.ok ? 'Shelf cleared: everything on it went to the Recycle Bin.' : (r.error || 'Clear failed'));
      // On success, main sends paths-mutated → refreshAfterDiskMutation (shelf strip + search retries).
    });
    loadPaneWidthsFromStorage();
    loadViewerDocSplitFromStorage();
    if (freshProfileSortsByPath) {
      sortColumn = 'path';
      sortAsc = true;
      localStorage.setItem(LS.sortBy, sortColumn);
      localStorage.setItem(LS.optAsc, '1');
    }
    /* Page zoom: Ctrl+= / - / 0 and the View menu change it in main, which tells the page; the level is
       remembered across restarts. */
    (function initPageZoom() {
      const remember = (factor) => {
        try {
          localStorage.setItem(LS.pageZoom, String(Number(factor) || 1));
        } catch (_) {}
      };
      window.tagBrowser.setPageZoomChangedHandler(remember);
      let saved = 1;
      try {
        saved = Number(localStorage.getItem(LS.pageZoom)) || 1;
      } catch (_) {}
      /* Restore even at 1: main is the only place that knows the real factor after a reload. */
      void window.tagBrowser.pageZoom(saved).then((r) => {
        if (r && r.ok) remember(r.factor);
      });
    })();

    /** Settings → Hide the window's title bar. The window's frame is fixed when it is created (main.js
        loadWindowChrome), so the box shows the saved setting and a Restart button appears when it differs from
        what this window was created with. */
    let windowChromeState = null;
    async function initWindowChrome() {
      const cb = document.getElementById('optHideTitleBar');
      const restart = document.getElementById('btnRestartForTitleBar');
      try {
        windowChromeState = await window.tagBrowser.windowChromeGet();
      } catch (_) {
        windowChromeState = null;
      }
      if (!windowChromeState) {
        cb?.closest('.col-12')?.classList.add('d-none');
        return;
      }
      if (cb) cb.checked = !!windowChromeState.hideTitleBar;
      document.body.classList.toggle('tagfox-frameless', !!windowChromeState.active);
      syncTitleBarOverlayColors();
      cb?.addEventListener('change', async () => {
        const r = await window.tagBrowser.windowChromeSet(cb.checked);
        if (!r || !r.ok) {
          setStatusMain('Could not save the title bar setting: ' + ((r && r.error) || 'unknown error'));
          return;
        }
        windowChromeState.hideTitleBar = cb.checked;
        restart?.classList.toggle('d-none', cb.checked === !!windowChromeState.active);
        syncTitleBarOverlayColors();
      });
      restart?.addEventListener('click', () => void window.tagBrowser.restartTagFox());
    }

    function cssColorToHex(c) {
      const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?/i.exec(String(c || ''));
      if (!m || (m[4] != null && Number(m[4]) === 0)) return '';
      return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    }

    /** The window buttons take the colours of whatever page sits under them: Runner's strip or Classic's
        header, light or dark. */
    function syncTitleBarOverlayColors() {
      if (!windowChromeState || (!windowChromeState.active && !windowChromeState.hideTitleBar)) return;
      let el = document.elementFromPoint(Math.max(0, window.innerWidth - 12), 8) || document.body;
      let bg = '';
      while (el && !(bg = cssColorToHex(getComputedStyle(el).backgroundColor))) el = el.parentElement;
      const fg = cssColorToHex(getComputedStyle(document.body).color);
      if (bg && fg) void window.tagBrowser.windowChromeColors({ color: bg, symbolColor: fg });
    }

    /** Dark / light mode (the / command): flips the theme and remembers it. */
    function toggleDarkMode() {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-bs-theme') === 'dark';
      if (isDark) { html.removeAttribute('data-bs-theme'); localStorage.setItem(LS.darkMode, '0'); }
      else { html.setAttribute('data-bs-theme', 'dark'); localStorage.setItem(LS.darkMode, '1'); }
      syncTitleBarOverlayColors();
    }
    /** Settings (Ctrl+, and the / command) opens and closes the offcanvas panel. */
    function toggleSettingsPanel() {
      const el = document.getElementById('settingsPanel');
      if (el) bootstrap.Offcanvas.getOrCreateInstance(el).toggle();
    }
    if (localStorage.getItem(LS.darkMode) === '1') document.documentElement.setAttribute('data-bs-theme', 'dark');
    void initWindowChrome();

    seedSearchHistoryFromCurrent();
    bindVerticalSplitters();
    bindViewerDocSplitters();
    document.getElementById('propsTheaterBackdrop').addEventListener('click', () => setPropsTheaterMode(false));
    document.getElementById('btnPropsTheaterToggle').addEventListener('click', () => togglePropsTheaterMode());
    syncViewerDocDividerOrientation();
    syncSortPathClass();
    bindFolderPathDropTargetBarsOnce();
    bindScopeFolderDropdownDragCaptureOnce();
    installLongTaskMonitor();
    installRendererPerfProbe();
    renderTable();
    bindRunnerChromeOnce();
    /* Runner is the only layout (Steve, 24 October 2026), for a test instance as for every other start.
       Classic's code that is left is deleted in stages. */
    applyRunnerModeSync(true, { startup: true });
    updateQueryPlaceholder();
    syncSortPathClass();
    renderScopeBreadcrumb();
    scheduleSearch();
    startDidYouKnowTips();
    void renderShelf().then(() => refreshTagFoxChromeTooltips(document.body));
    /* A hidden window (autostart, tests) runs no frames until it is shown or gets a key, so this can land after the
       user has already opened a menu or focused something; it must not take focus back from them. */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const ae = document.activeElement;
        if (document.querySelector('.dropdown-menu.show')) return;
        if (ae && ae !== document.body) return;
        focusSearchBox();
      })
    );
    window.addEventListener('blur', () => searchDebugFocusSnapshot('window.blur'));
    startEverythingKeepalive();
    document.addEventListener('visibilitychange', () => {
      searchDebugFocusSnapshot('visibilitychange', { hidden: document.hidden });
      /* Timers are throttled while hidden, so the window may surface with Everything already gone cold;
         start warming it the moment it does, in parallel with whatever the raise itself triggers. */
      if (!document.hidden) void everythingKeepalivePing();
    });
    window.addEventListener('focus', () => {
      searchDebugFocusSnapshot('window.focus');
      /* Read the flag now, not in the frame: a slow raise can run the frame seconds later. */
      const hotkeyRaise = takeHotkeyRaiseFlag();
      requestAnimationFrame(() => {
        /* An open menu survives alt-tab; leave its keyboard focus alone or ↑/↓/Enter go to the list. */
        if (!document.querySelector('.dropdown-menu.show')) hotkeyRaise ? focusQueryBox(true) : focusSearchBox();
        requestAnimationFrame(() => searchDebugFocusSnapshot('window.focus.afterRestore'));
      });
    });

    /* Automated-test hook: inert unless the page is loaded with #tagfoxtest in the URL (the dual-pane
       harness in _tmp/ sets it). Exposes the closure-private search/pane orchestration + a state snapshot
       so an external CDP driver can exercise the loop/refresh/dual-pane flows and assert invariants. */
    if (location.hash.includes('tagfoxtest')) {
      const BASE_RESULT_IDS = ['resultsWrap', 'resultsScroll', 'resultsTable', 'tbody', 'resultsLoadMoreWrap', 'btnLoadMoreResults', 'resultsLoadMoreHint'];
      const rowCount = (id) => {
        const el = document.getElementById(id);
        return el ? el.querySelectorAll('tr').length : -1;
      };
      window.__tagfoxTest = {
        runSearchNow: (kind, opts) => runSearchNow(kind, opts),
        /* Asks for one search per text in a single task, as fast typing does on a slow day, and returns at once. */
        startSearches: (texts) => {
          for (const t of texts || []) {
            document.getElementById('query').value = String(t);
            void runSearchNow('identity');
          }
          return true;
        },
        searchCounters: () => ({ ...runnerSearchCounters }),
        resetSearchCounters: () => {
          runnerSearchCounters.run = 0;
          runnerSearchCounters.stepAside = 0;
          runnerSearchCounters.extraSent = 0;
        },
        refreshNow: () => refreshResultsFromUi(),
        scheduleSearch: (kind) => scheduleSearch(kind),
        setQuery: (q) => {
          const el = document.getElementById('query');
          if (el) { el.value = String(q == null ? '' : q); el.dispatchEvent(new Event('input', { bubbles: true })); }
        },
        setRecency: (mode) => { setRecencyFilterMode(mode); void runSearchNow('identity'); },
        setView: (subsOn, content) => { applyResultsViewRadiosToDom(!!subsOn, content || 'all'); syncViewRadioActiveFromDom(); void runSearchNow('identity'); },
        setScope: (root) => { const e = document.getElementById('rootFolder'); if (e) e.value = String(root || ''); void runSearchNow('identity'); },
        autoTick: () => maybeAutoRefreshSearchTick(),
        loadMore: () => loadMoreResults(),
        /* What main's tagfox-open-recent-changes and tagfox-hotkey-raised messages call; a test cannot press the
           OS-wide shortcuts. */
        openRecentChanges: () => openRecentChanges(),
        hotkeyRaised: () => onHotkeyRaised(),
        /* What main's tagfox-file-dialog-target message calls, and what the renderer has asked main to send since. */
        fileDialogTarget: (info) => setFileDialogTarget(info),
        fileDialogSends: () => fileDialogSendLog.slice(),
        machineFeatures: () => machineFeaturesSeen,
        /* Redraw the Shelf from its folder now, and size it, rather than wait for a disk-change event. */
        renderShelf: () => renderShelf().then(() => (syncShelfAsideWidth(), true)),
        /* Every key Runner's key table names, as it spells them, and the next tip shown now. */
        runnerKeyNames: () => RUNNER_KEYS.flatMap((k) => k.keys),
        showNextTip: () => (showNextDidYouKnowTip(), true),
        /* Drive the real disk-mutation handler (the IPC callback) so tests can assert refresh behaviour. */
        mutate: (payload) => onPathsMutated(payload),
        /* The renderer side of a delete: tombstone the paths and repaint, as the trashed IPC callback does. */
        tombstone: (paths) => removeGonePathsFromUiNow(Array.isArray(paths) ? paths : [paths]),
        /* Viewer markdown/text editor. Each driver calls the real function, so a test drives the same
           preview-and-edit path a user does rather than a second copy of it. The synthetic row stands in
           for a search hit when the file is not in the current results. */
        selectViewerFile: async (p) => {
          const fp = String(p);
          selectedFullPath = fp;
          selectedRow =
            findRowByFullPath(fp) ||
            { type: 'file', name: T.baseName(fp), path: T.parentDir(fp), size: 0, date_modified: '' };
          await refreshPropsPanel();
        },
        mdOpenEditor: () => openMdFileEditorFresh(),
        mdCloseEditor: () => setViewerDocEditorOpen('mdFile', false),
        mdSetBuffer: (t) => setViewerMdValue('mdFile', String(t)),
        mdFlush: () => flushMdFileAutosave(),
        mdState: () => ({
          target: mdAutosaveTargetPath,
          editorOpen: mdFileEditorIsOpen(),
          buffer: getViewerMdValue('mdFile'),
          loaded: mdAutosaveLoadedText,
          status: document.getElementById('statusMain')?.textContent || '',
        }),
        disableAutofill: () => { maybeAutoFillResultsUntilScrollable = () => {}; },
        /* Runner layout. */
        setRunnerSort: (sort) => setRunnerSort(String(sort)),
        setDeadlineRange: (range) => setDeadlineRange(String(range || '')),
        setShowHiddenUntil: (on) => setShowHiddenUntil(!!on),
        runCommand: (id) => runRunnerCommand(runnerCommands().find((c) => c.id === String(id))),
        /* Stand-in for Windows' Recent list, opened just now, so a test can see the boost without the real one. */
        setWindowsRecent: (paths) => {
          runnerWindowsRecent = new Map((paths || []).map((p) => [pathNormKey(p), { path: String(p), at: Date.now() }]));
          runnerWindowsRecentAskedAt = Date.now();
        },
        commitHistory: () => commitSearchHistoryNow(),
        toggleStar: (p) => toggleStarPath(String(p)),
        runnerState: () => ({
          on: isRunnerMode(),
          bodyClass: document.body.classList.contains('tagfox-runner'),
          sort: runnerSort,
          query: document.getElementById('query')?.value || '',
          scope: document.getElementById('rootFolder')?.value || '',
          subfolders: isShowSubfolders(),
          selected: selectedFullPath || '',
          rows: listRowsForUi().map((r) => fullPathForRow(r)),
          stars: loadFavouriteFolders(),
          cmdListOpen: runnerCmdListIsOpen(),
          cmdMatches: runnerCmdMatches.map((c) => c.id),
          focusInBox: document.activeElement === document.getElementById('query'),
          status: (document.getElementById('statusMain')?.textContent || '').trim(),
          statusShown: document.body.classList.contains('tagfox-runner-status-on'),
          rankNote: (() => {
            const el = document.getElementById('runnerRankNote');
            return el && !el.classList.contains('d-none') ? { text: el.textContent, title: el.title } : null;
          })(),
          chips: runnerActiveFilterChips().map((c) => c.id),
          checked: checkedPathsMap.size,
          escStep: runnerEscapeLastStep,
          recency: recencyFilterMode(),
          sent: lastMainSearchText,
          sentExtra: lastRunnerExtraSearchTexts,
          viewerOff: document.body.classList.contains('tagfox-runner-viewer-off'),
          focusInList: !!document.activeElement?.closest?.('#resultsWrap'),
        }),
        autoStart: (sec) => { const e = document.getElementById('autoRefreshSec'); if (e) { e.value = String(sec); } syncAutoRefreshTimer(); },
        autoStop: () => { const e = document.getElementById('autoRefreshSec'); if (e) e.value = '0'; syncAutoRefreshTimer(); },
        configure: (cfg) => {
          const c = cfg || {};
          if (c.baseUrl != null) { const e = document.getElementById('baseUrl'); if (e) e.value = c.baseUrl; }
          if (c.rootFolder != null) { const e = document.getElementById('rootFolder'); if (e) e.value = c.rootFolder; }
          if (c.maxResults != null) { const e = document.getElementById('maxResults'); if (e) e.value = String(c.maxResults); }
          saveSettings();
        },
        diag: () => ({
          recencyMode: recencyFilterMode(),
          recencyCutoff: recencyFilterCutoffMs(),
          hideSpecial: isHideSpecialPaths(),
          hideTilde: isHideTildePaths(),
          foldersOnly: isFoldersOnly(),
          filesOnly: isFilesOnly(),
          showSubfolders: isShowSubfolders(),
          n_lastRows: lastRows.length,
          n_afterTags: filteredRowsAfterTagsOnly().length,
          n_beforeAdvanced: filteredRowsBeforeAdvancedPathHides().length,
          n_listRowsForUi: listRowsForUi().length,
          rows: lastRows.slice(0, 8).map((r) => ({ path: fullPathForRow(r), folder: rowIsFolder(r), mtime: modifiedTimeMs(r) })),
        }),
        state: () => ({
          searchFlowRunning,
          renderedRows: renderedRowCount(listRowsForUi().length),
          searchInFlight,
          pendingDebounce: !!searchDebounceTimer,
          searchRunSeq,
          lastRows: lastRows.length,
          tbodyBase: rowCount('tbody'),
          dupBaseIds: BASE_RESULT_IDS.filter((id) => document.querySelectorAll('[id="' + id + '"]').length !== 1),
          status: (document.getElementById('statusMain')?.textContent || '').trim().slice(0, 120),
          recency: recencyFilterMode(),
          foldersOnly: isFoldersOnly(),
          filesOnly: isFilesOnly(),
        }),
      };
      try { window.tagBrowser && window.tagBrowser.setSearchDebugEnabled && window.tagBrowser.setSearchDebugEnabled(false); } catch (_) {}
      console.log('[tagfoxtest] hook ready');
    }
