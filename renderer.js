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
      treeView: 'tagBrowserTreeView',
      resultsViewMode: 'tagBrowserResultsViewMode',
      foldersOnly: 'tagBrowserFoldersOnly',
      filesOnly: 'tagBrowserFilesOnly',
      flatView: 'tagBrowserFlatView',
      showSubfolders: 'tagBrowserShowSubfolders',
      hideFiles: 'tagBrowserHideFiles',
      propsWidthPx: 'tagBrowserPropsW',
      favFoldersColPx: 'tagBrowserFavFoldersW',
      favFoldersCollapsed: 'tagBrowserFavFoldersCollapsed',
      tableCols: 'tagBrowserTableColsV2',
      favFolders: 'tagBrowserFavFolders',
      folderFocusStats: 'tagBrowserFolderFocusStats',
      fileFocusStats: 'tagBrowserFileFocusStats',
      favSearches: 'tagBrowserFavSearches',
      scopeFolderHistory: 'tagBrowserScopeFolderHist',
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
      darkMode: 'tagBrowserDarkMode',
      treeFolding: 'tagBrowserTreeFolding',
      treeGroupHighlight: 'tagBrowserTreeGroupHL',
      highlightMatchedNames: 'tagBrowserHighlightMatchedNames',
      resultThumbnails: 'tagBrowserResultThumbnails',
      hoverPreview: 'tagBrowserHoverPreview',
      collapsedFolders: 'tagBrowserCollapsedFolders',
      resultsLayout: 'tagBrowserResultsLayout',
      resultsContent: 'tagBrowserResultsContent',
      gdriveShortcutNames: 'tagBrowserGDriveShortcutNames',
      quickTodoFolder: 'tagBrowserQuickTodoFolder',
      globalViewerBasenames: 'tagBrowserGlobalViewerBasenames',
      viewerDocSplitPct: 'tagBrowserViewerDocSplitPct',
      viewerDocSplitPctTheater: 'tagBrowserViewerDocSplitPctTheater',
      tabsState: 'tagBrowserTabsState',
      tagBarShowAll: 'tagBrowserTagBarShowAll',
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

    let propsPanePx = 300;
    let viewerDocSplitPct = 50;
    let viewerDocSplitPctTheater = 50;
    /** Favourites column width when expanded (px). Collapsed rail peek reuses this saved full width. */
    const FAV_COL_MIN = 120;
    const FAV_COL_MAX = 600;
    let favFoldersColPx = 220;
    let favFoldersCollapsed = false;
    /** Percent weights: chk, name, path, actions, size, modified (sum 100). Type column removed — 6 cols. */
    const COL_PERCENT_DEFAULT = [4, 42, 24, 14, 6, 10];
    /** Drag resize: don’t shrink Actions below this (% of table) at Path|Actions or Actions|Size. */
    const COL_RESIZE_MIN_ACTIONS_PCT = 6;
    /** Table column index for Path (hidden in tree view). */
    const RESULTS_PATH_COL_IDX = 2;
    let colPercent = COL_PERCENT_DEFAULT.slice();

    let lastRows = [];
    /** HTML5 drag payload for moving rows onto folder rows in the results table. */
    const TAG_BROWSER_PATHS_DRAG_TYPE = 'application/x-tagbrowser-paths';
    /** Single folder row drag: lets the favourites bar insert by gap instead of moving on disk. */
    const TAG_BROWSER_FAV_FOLDER_DRAG_TYPE = 'application/x-tagbrowser-fav-folder';
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

    function getDataTransferFavouriteFolder(dt) {
      try {
        const raw = dt.getData(TAG_BROWSER_FAV_FOLDER_DRAG_TYPE);
        return normalizeFolderPathForEverything(String(raw || '').trim());
      } catch {
        return '';
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
      clearAllFavBarDropGaps();
    }
    /** Last tag scan: Everything r=1 + `[ \\]x[kpxd]` so we only index `xk/xp/xx/xd` tag tokens. */
    let tagDiscoveryRows = [];
    /** Last non-empty scan — keeps tag pills when a later scan fails, returns empty, or races navigation. */
    let tagDiscoveryRowsLastGood = [];
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
    /** Two-step test control: next click after clear expects Copy. */
    let searchDebugTestAwaitingCopy = false;
    /** Fresh debug capture: run one deeper scope probe on the next search. */
    let searchDebugNextScopedProbe = false;
    /** Incremented at each runSearch start; in-flight HTTP from an older id must not touch UI (overlapping debounced runs). */
    let searchRunSeq = 0;
    /** True while runSearch() awaits Everything (auto-refresh skips ticks to avoid overlap). */
    let searchInFlight = false;
    /** True while loadMoreResults() is fetching the next Everything page. */
    let resultsLoadMoreBusy = false;
    /** Offset paging: replay same query with higher Everything offset (null = no further pages for current search). */
    let resultsPagingCtx = null;
    /** One top-level search flow at a time: serializes runSearchNow. Nested calls (smart-narrow / smart-probe re-search fired synchronously inside an outer runSearch) pass opts.nested and skip the mutex to avoid self-deadlock. */
    let searchMutex = Promise.resolve();
    let topLevelSearchDepth = 0;
    /** Scratch result tabs. One tab is visible in the single results pane; the rest are passive state snapshots that re-run their own search when activated. Each tab: { id, searchState, lastRows, resultsPagingCtx }. Capped at MAX_TABS. */
    const MAX_TABS = 10;
    let tabs = [];
    let activeTabId = null;
    let nextTabId = 1;
    /** Smart view event kind for the current search: identity|refresh|manual|smart-narrow|smart-probe|null. */
    let smartEvent = null;
    /** Before a Smart probe-widen: saved {subs, content} to revert if cap exceeded. */
    let smartProbePrior = null;
    /** After Smart revert — blocks repeated expand probe until query/offset/hasMore state changes. */
    let smartRevertFP = null;
    /** Smart narrow/before-paint message flushed after runSearch + smartAfterPaint (row line must stay). */
    let pendingSmartStatusNote = null;
    /** Set in smartAfterPaint when results page is full (more in Everything); merged with pending chip in runSearch tail. */
    let smartCapStressBigFolderAfterPaint = false;
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
    /** True only while the LHS favourites splitter is actively being dragged. */
    let favFoldersSplitDragging = false;
    const DID_YOU_KNOW_ROTATE_MS = 4 * 60 * 1000;
    /** Fade the tip out this long after it updates; the next rotation shows it again. */
    const DID_YOU_KNOW_FADE_MS = 60 * 1000;
    /** Tips + scores: did-you-know-tips.js → window.TagFoxDidYouKnowTips (empty array if load failed). */
    const DID_YOU_KNOW_TIPS = window.TagFoxDidYouKnowTips || Object.freeze([]);
    let didYouKnowBag = [];
    let didYouKnowLastTipKey = '';
    let didYouKnowTimerId = null;
    let didYouKnowFadeTimerId = null;
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

    /* View: Smart | Tree | Flat; Subfolders (on first); Content: all | folders | files. */
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

    /** Cap-only “Big folder!” is for empty-browse stress; full Smart + real search expects paged hits. */
    function shouldSuppressCapOnlyBigFolderChip() {
      return (
        isSmartView() &&
        isShowSubfolders() &&
        isAllContent() &&
        smartSearchShouldStartBroad()
      );
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

    /**
     * Smart layout + subfolders + files & folders; re-search.
     * clearFilters: drop active tag filters, set recency to All, whole word off (same as Ctrl+Shift+Space).
     */
    function reimposeSmartViewDefaults(opts) {
      const clearFilters = !!(opts && opts.clearFilters);
      smartRevertFP = null;
      smartProbePrior = null;
      if (clearFilters) {
        activeTagKeys.clear();
        excludedTagKeys.clear();
        setRecencyFilterMode('all');
        const ww = document.getElementById('optWholeWord');
        if (ww) ww.checked = false;
        syncAdvancedSearchIconFilledState();
      }
      applyResultsViewRadiosToDom('smart', true, 'all');
      syncViewRadioActiveFromDom();
      clearStatusSmartNote();
      applyNaturalSortWhenTreeViewOn();
      saveSettings();
      updateSortHeaders();
      applyResultsTablePathColumnVisibility();
      renderTagBar();
      if (clearFilters) {
        void (async () => {
          await runSearchNow('identity');
          commitSearchHistoryNow();
          updateEmptyResultsPulseHints(listRowsForUi().length);
        })();
        return;
      }
      void runSearchNow('identity');
      commitSearchHistoryNow();
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

    /** Yellow markup for search terms in Name / Path cells (Settings → Search results). Default on. */
    function isHighlightMatchedNamesOn() {
      const el = document.getElementById('optHighlightMatchedNames');
      if (el) return !!el.checked;
      return localStorage.getItem(LS.highlightMatchedNames) !== '0';
    }

    /** @type {Set<string>} lowercase keys; tag bar filters with AND (click cycles off → include → exclude → off). */
    let activeTagKeys = new Set();
    /** @type {Set<string>} subset of activeTagKeys that are negated (not-B); a pill's 3rd click state. */
    let excludedTagKeys = new Set();
    /** Multiple tag filters: false = AND (default), true = OR (Everything regex + client filter). */
    let tagFilterCombineOr = false;
    /** Tag bar: these bodies (lowercase keys) always show; the rest hide behind "More" (active hidden ones still show). */
    const TAG_BAR_PRIMARY = ['todo', 'gcc', 'waiting', 'later'];
    let tagBarShowAll = false;
    /** Tag modal targets (length 1 = single-name edit, &gt;1 = union add/remove on each). */
    let modalTargetPaths = [];
    let modalTags = [];
    /** 'rename' = existing paths; 'newTodo' = Add TODO box only (no rename until create). */
    let tagModalMode = 'rename';
    /** Bracket tags for the next Add TODO .md (default TODO); edited via same #tagModal as renames. */
    let newTodoMdTags = ['TODO'];
    /** Bracket tags for the folder doc file name (stem + ext in UI); applied on Save in the readme editor. */
    let folderDocMdTags = [];
    /** Default folder doc stem (no ext); `-` sorts before letters in typical name order. */
    const DEFAULT_FOLDER_DOC_STEM = '-readme';
    /** When set: viewer uses this path or FOLDER_DOC_OVERRIDE_NEW instead of resolveFolderViewerDoc’s first match. */
    const FOLDER_DOC_OVERRIDE_NEW = '__folderDocNew__';
    let folderDocViewerOverridePath = null;
    /** pathKeyLoose(doc path) last mirrored into stem/ext/tags — avoids refresh resetting a new filename. */
    let folderDocHeaderLastSyncedKey = '';
    /** Multi-select checkboxes: path key lowercase → canonical path */
    const checkedPathsMap = new Map();
    /** document pointermove listener for floating #bulkBar (only while checkedPathsMap.size > 0). */
    let bulkBarPointerBound = false;
    /** Last pointer (viewport) — used to show/position bulk bar right after selection changes without wiggling the mouse. */
    let lastPointerClientX = 0;
    let lastPointerClientY = 0;
    /** Persisted set of folder paths the user has collapsed in tree view. */
    const collapsedFolderPaths = new Set();
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
    /** Index in filteredRows() for Shift+↑/↓ range checkbox select; cleared on plain ↑/↓. */
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
    /** Click handler on #readmePreview for per-section Edit/Save/Cancel in nested mode. */
    let nestedReadmePreviewClickHandler = null;
    /** Shallow copies of section records for cancel/save sync (mutate .text on save). */
    let globalNestedCompositeSections = [];
    let activeMdPath = null;
    /** RHS .md / .txt editor: path the textarea belongs to + debounced write */
    let mdAutosaveTimer = null;
    let mdAutosaveTargetPath = null;
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
    /** Matches lastReadmeFolderPathLoose across quick refresh (folder row, or trigger file + nested toggle). */
    function readmeBlockQuickVisibleFolderKey(propPath, propRow) {
      if (!propPath || !propRow) return '';
      if (rowIsFolder(propRow)) return pathKeyLoose(propPath);
      if (globalNestedReadmeView && isGlobalViewerMarkdownFilePath(propPath)) {
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

    async function flushMdFileAutosave() {
      cancelMdFileAutosave();
      const p = mdAutosaveTargetPath;
      if (!p) return;
      const text = getViewerMdValue('mdFile');
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
      setStatusMain(r.ok ? 'Saved.' : (r.error || 'Save failed'));
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

    /** File row: shell open, or Workspace child window for .gdoc / .gsheet / .gslides (same as Viewer button). */
    async function openFileDefaultOrGoogleWorkspace(fp) {
      const status = document.getElementById('statusMain');
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
        const r = await window.tagBrowser.openGoogleWorkspaceWindow({ url: rGw.url });
        if (status && !r.ok) setStatusMain(r.error || 'Open failed');
        else bumpFileFocusVisit(fp);
        return;
      }
      const err = await window.tagBrowser.openPath(fp);
      if (err && status) setStatusMain('Open failed: ' + err);
      else if (!err) bumpFileFocusVisit(fp);
    }

    /* Open in gmist (the Drive-only markdown web editor). gmist opens a Drive file by its Drive file id, which
       TagFox reads off the local mirror via the same resolver as Open in Google Workspace, then deep-links to
       the worker's /open route in the default browser (where Steve is signed into gmist). */
    const GMIST_BASE_URL = 'https://mist.broad-smoke-cc64.workers.dev';
    const GMIST_EXT = new Set(['md', 'qmd']);

    /** True when the path is under a Google Drive mount (own My Drive mirror, or a shared shortcut target). */
    function pathUnderGoogleDrive(fp) {
      const s = String(fp || '');
      return /[\\/]My Drive [(]/i.test(s) || /\.shortcut-targets-by-id|\.shortcuts-by-id/i.test(s);
    }

    /** A markdown file living under a Google Drive mount: the only rows gmist can open. */
    function rowEligibleForGmist(fp) {
      const s = String(fp || '');
      const base = T.baseName(s);
      const dot = base.lastIndexOf('.');
      const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
      if (!GMIST_EXT.has(ext)) return false;
      return pathUnderGoogleDrive(s);
    }

    async function openRowInGmist(fp) {
      if (!window.tagBrowser || typeof window.tagBrowser.resolveGoogleDriveFileId !== 'function') {
        setStatusMain('Open in gmist is not available.');
        return;
      }
      setStatusMain('Opening in gmist…');
      const r = await window.tagBrowser.resolveGoogleDriveFileId({ fullPath: fp });
      if (!r || !r.ok || !r.fileId) {
        const why =
          r && r.reason === 'drive-name-ambiguous'
            ? 'several Drive files share this name; rename one or open it from drive.google.com.'
            : r && r.reason === 'no-drive-api'
              ? 'Google Drive sign-in is needed first (Settings).'
              : 'could not find this file in Google Drive.';
        setStatusMain('Open in gmist: ' + why);
        return;
      }
      /* A harmless, readable breadcrumb the target ignores: the path from the user home, so the URL is legible. */
      const crumb = String(r.relPath || '').trim();
      const crumbSuffix = crumb ? '&p=' + crumb.split('/').map(encodeURIComponent).join('/') : '';
      const url = GMIST_BASE_URL + '/open?file=' + encodeURIComponent(r.fileId) + crumbSuffix;
      const opened = await window.tagBrowser.openUrlDefaultBrowser({ url });
      if (opened && opened.ok === false) setStatusMain(opened.error || 'Could not open browser for gmist.');
      else setStatusMain('Opening in gmist (browser)…');
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
        const why =
          r && r.reason === 'drive-name-ambiguous'
            ? 'several Drive files share this name; rename one or open it from drive.google.com.'
            : r && r.reason === 'no-drive-api'
              ? 'Google Drive sign-in is needed first (Settings).'
              : 'could not find this file in Google Drive.';
        setStatusMain('Open in Google Workspace: ' + why);
        return;
      }
      const url = googleEditorUrlForExt(ext, r.fileId);
      if (!url) {
        setStatusMain('No Google editor for this file type.');
        return;
      }
      const opened = await window.tagBrowser.openGoogleWorkspaceWindow({ url });
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
      return { ext, markdown: MARKDOWN_EDIT_EXT.has(ext) };
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

    /** Negated (not-tag) pill: red tint + strike-through, overriding the per-tag hue style. */
    function applyTagBarPillExcludeStyle(el) {
      el.style.setProperty('background-color', 'hsl(0, 70%, 90%)', 'important');
      el.style.setProperty('color', '#842029', 'important');
      el.style.setProperty('border-color', 'hsl(0, 60%, 60%)', 'important');
      el.style.setProperty('text-decoration', 'line-through', 'important');
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
      refreshTagFoxChromeTooltips(document.getElementById('breadcrumbShell') || document.body);
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
      refreshTagFoxChromeTooltips(document.getElementById('breadcrumbShell') || document.body);
      /* Scope strip is hidden in pen mode; park folder actions after shell like static HTML. */
      const scopeRowActs = document.getElementById('tagfoxScopeBarRowActions');
      const scopeBreadcrumbRow = document.querySelector('.scope-breadcrumb-row');
      if (scopeRowActs && scopeBreadcrumbRow && shell) {
        scopeBreadcrumbRow.insertBefore(scopeRowActs, shell.nextSibling);
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
      const status = document.getElementById('statusMain');
      if (!raw) {
        leaveScopePathEditChrome();
        clearSearchScope();
        return;
      }
      const synErr = scopePathClientSyntaxError(raw);
      if (synErr) {
        if (status) setStatusMain(synErr);
        scopePathEditCommitError = false;
        syncScopePathEditValidationVisual();
        return;
      }
      const norm = normalizeFolderPathForEverything(raw);
      if (window.tagBrowser && typeof window.tagBrowser.listChildFolders === 'function') {
        const r = await window.tagBrowser.listChildFolders({ parentPath: norm });
        if (!r || !r.ok) {
          if (status) {
            setStatusMain(
              'Invalid folder path: ' + (r && r.error ? String(r.error) : 'Not a folder or not reachable.')
            );
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

    /** Clear current folder plus active tag/recency filters; keep query and view mode unchanged. */
    function clearSearchScopeAndTagRecencyFilters() {
      leaveScopePathEditChrome();
      document.getElementById('rootFolder').value = '';
      activeTagKeys.clear();
      excludedTagKeys.clear();
      persistActiveTagFilter();
      setRecencyFilterMode('all');
      saveSettings();
      renderScopeBreadcrumb();
      renderTagBar();
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

    function applyPaneWidths() {
      document.getElementById('propsAside').style.width = propsPanePx + 'px';
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

    function applyFavFoldersColumnWidth() {
      const col = document.getElementById('favFoldersColumn');
      const btn = document.getElementById('btnToggleFavFoldersCollapse');
      if (!col) return;
      col.style.setProperty('--tagfox-fav-expanded-w', favFoldersColPx + 'px');
      col.classList.toggle('tagfox-fav-column--collapsed', favFoldersCollapsed);
      col.title = favFoldersCollapsed ? 'Favourites — Peek Mode' : 'Favourites — Fixed Mode';
      if (!btn) return;
      btn.title = favFoldersCollapsed
        ? 'Peek Mode — click to switch to Fixed Mode'
        : 'Fixed Mode — click to switch to Peek Mode';
      btn.setAttribute(
        'aria-label',
        favFoldersCollapsed
          ? 'Favourites sidebar in Peek Mode — switch to Fixed Mode'
          : 'Favourites sidebar in Fixed Mode — switch to Peek Mode'
      );
      btn.setAttribute('aria-expanded', favFoldersCollapsed ? 'false' : 'true');
      btn.setAttribute('aria-pressed', favFoldersCollapsed ? 'true' : 'false');
    }

    function loadFavFoldersColFromStorage() {
      const w = parseInt(localStorage.getItem(LS.favFoldersColPx) || '', 10);
      if (Number.isFinite(w) && w >= FAV_COL_MIN && w <= FAV_COL_MAX) favFoldersColPx = w;
      favFoldersCollapsed = localStorage.getItem(LS.favFoldersCollapsed) === '1';
      applyFavFoldersColumnWidth();
    }

    function persistFavFoldersCol() {
      localStorage.setItem(LS.favFoldersColPx, String(favFoldersColPx));
      localStorage.setItem(LS.favFoldersCollapsed, favFoldersCollapsed ? '1' : '0');
    }

    function toggleFavFoldersCollapsed() {
      const col = document.getElementById('favFoldersColumn');
      favFoldersCollapsed = !favFoldersCollapsed;
      if (col) col.classList.toggle('tagfox-fav-column--peek-suppressed', favFoldersCollapsed);
      if (favFoldersCollapsed) closeFavColumnHoverUi();
      if (!favFoldersCollapsed) favFoldersColPx = Math.max(FAV_COL_MIN, favFoldersColPx);
      applyFavFoldersColumnWidth();
      persistFavFoldersCol();
    }

    function closeFavColumnHoverUi() {
      /* If keyboard focus is inside an open subfolder menu or flyout the user is navigating it; a stray
         pointermove (including the synthetic one the browser fires when scrollIntoView scrolls content
         under a stationary cursor) must not tear the list down mid-navigation. */
      const ae = document.activeElement;
      if (ae && ae.closest && ae.closest('#favFoldersColumn .dropdown-menu, ul.breadcrumb-folder-flyout')) return;
      hideBreadcrumbSubfolderFlyout();
      document
        .querySelectorAll('#favFoldersColumn [data-bs-toggle="dropdown"]')
        .forEach((btn) => bootstrap.Dropdown.getInstance(btn)?.hide());
      const a = document.activeElement;
      if (
        a &&
        a !== document.body &&
        a.blur &&
        (a.closest?.('#favFoldersColumn') || a.closest?.('ul.breadcrumb-folder-flyout'))
      ) {
        a.blur();
      }
    }

    /** Collapsed rail uses CSS :hover for peek; HTML5 drag suppresses hover, so toggle an explicit class. */
    function setFavColumnDragPeek(on) {
      const col = document.getElementById('favFoldersColumn');
      if (!col) return;
      const want = !!on && !!favFoldersCollapsed;
      if (col.classList.contains('tagfox-fav-column--drag-peek') === want) return;
      col.classList.toggle('tagfox-fav-column--drag-peek', want);
      if (!want) closeFavColumnHoverUi();
      if (isSearchDebugOn()) searchDebugLog('folderPathDrop.favRailPeek', { on: want, collapsed: !!favFoldersCollapsed });
    }

    /** Splitter hover in collapsed mode should keep the rail open so the user can resize it. */
    function setFavColumnSplitPeek(on) {
      const col = document.getElementById('favFoldersColumn');
      if (!col) return;
      const want = !!on && !!favFoldersCollapsed;
      if (col.classList.contains('tagfox-fav-column--split-peek') === want) return;
      col.classList.toggle('tagfox-fav-column--split-peek', want);
      if (!want) closeFavColumnHoverUi();
    }

    /** Body-rooted subfolder flyouts are outside #favFoldersColumn, so :hover peek drops; mirror drag-peek while open. */
    function syncFavColumnFlyoutPeek() {
      const col = document.getElementById('favFoldersColumn');
      if (!col) return;
      const fly0 = breadcrumbSubfolderFlyoutChain[0];
      const anchoredInFav =
        !!favFoldersCollapsed &&
        fly0 &&
        fly0.classList.contains('is-open') &&
        fly0._anchorLi &&
        fly0._anchorLi.isConnected &&
        fly0._anchorLi.closest('#favFoldersColumn');
      if (col.classList.contains('tagfox-fav-column--flyout-peek') === !!anchoredInFav) return;
      col.classList.toggle('tagfox-fav-column--flyout-peek', !!anchoredInFav);
    }

    /** Hover zone that should keep the collapsed LHS rail open. */
    function isFavColumnHoverZonePoint(clientX, clientY) {
      try {
        const hit = document.elementFromPoint(clientX, clientY);
        if (!hit || !hit.closest) return false;
        return !!(
          hit.closest('#favFoldersColumn') ||
          hit.closest('#splitFavFolders') ||
          hit.closest('#favFoldersColumn .dropdown-menu.show') ||
          hit.closest('ul.breadcrumb-folder-flyout.is-open')
        );
      } catch {
        return false;
      }
    }

    function bindFavColumnCollapsedHoverExit() {
      /* pointermove fires continuously; closeFavColumnHoverUi walks every chip (laggy with many favourites).
         Run the cleanup once per excursion into the rail zone, then stay idle until the pointer enters again. */
      let exitCleanupPending = false;
      document.addEventListener(
        'pointermove',
        (ev) => {
          if (!favFoldersCollapsed) return;
          if (favFoldersSplitDragging) return;
          const t = ev.target;
          if (!t || !t.closest) return;
          if (t.closest('#favFoldersColumn, #splitFavFolders, ul.breadcrumb-folder-flyout.is-open')) {
            exitCleanupPending = true;
            return;
          }
          if (!exitCleanupPending) return;
          exitCleanupPending = false;
          const col = document.getElementById('favFoldersColumn');
          if (col) col.classList.remove('tagfox-fav-column--peek-suppressed');
          closeFavColumnHoverUi();
        },
        true
      );
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

    /** Draggable right edge of favourite-folders column (same handle style as viewer splitter). */
    function bindFavFoldersSplitter() {
      const split = document.getElementById('splitFavFolders');
      if (!split) return;
      split.addEventListener('mouseenter', () => setFavColumnSplitPeek(true));
      split.addEventListener('mouseleave', () => {
        if (!favFoldersSplitDragging) setFavColumnSplitPeek(false);
      });
      split.addEventListener('mousedown', (e) => {
        e.preventDefault();
        favFoldersSplitDragging = true;
        setFavColumnSplitPeek(true);
        const startedCollapsed = !!favFoldersCollapsed;
        favFoldersColPx = Math.max(FAV_COL_MIN, favFoldersColPx);
        applyFavFoldersColumnWidth();
        const startX = e.clientX;
        const startW = favFoldersColPx;
        let raf = 0;
        function flush() {
          raf = 0;
          applyFavFoldersColumnWidth();
        }
        function move(ev) {
          /* Column is left of the handle: drag handle right = wider favourites column. */
          favFoldersColPx = Math.min(FAV_COL_MAX, Math.max(FAV_COL_MIN, startW + (ev.clientX - startX)));
          if (!raf) raf = requestAnimationFrame(flush);
        }
        function up(ev) {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          if (raf) cancelAnimationFrame(raf);
          favFoldersSplitDragging = false;
          favFoldersCollapsed = startedCollapsed;
          favFoldersColPx = Math.max(FAV_COL_MIN, favFoldersColPx);
          flush();
          setFavColumnSplitPeek(startedCollapsed && isFavColumnHoverZonePoint(ev.clientX, ev.clientY));
          persistFavFoldersCol();
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    }

    function bindFavFoldersCollapseButton() {
      const btn = document.getElementById('btnToggleFavFoldersCollapse');
      if (!btn) return;
      btn.addEventListener('click', () => toggleFavFoldersCollapsed());
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

    /** Show/hide handles: flat uses name|path + path|actions; tree uses only name|actions (same col indices 2|3 as path|actions). */
    function syncResultsTableResizeHandles() {
      const showPath = !isTreeViewOn();
      const table = document.getElementById('resultsTable');
      if (!table) return;
      for (const el of table.querySelectorAll('.th-resize[data-resize-mode]')) {
        const mode = el.dataset.resizeMode;
        if (mode === 'always') el.style.removeProperty('display');
        else if (mode === 'flat') el.style.display = showPath ? '' : 'none';
        else if (mode === 'tree') el.style.display = showPath ? 'none' : '';
      }
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
      syncResultsTableResizeHandles();
    }

    /** Clamp the dragged pair so a divider cannot collapse either column. */
    function clampTableResizePair(leftIdx, rightIdx, leftPct, rightPct) {
      let left = leftPct;
      let right = rightPct;
      const minLeft =
        leftIdx === 0 ? 4 : leftIdx === 3 ? COL_RESIZE_MIN_ACTIONS_PCT : 3;
      const minRight = rightIdx === 3 ? COL_RESIZE_MIN_ACTIONS_PCT : 3;
      if (left < minLeft) {
        right -= minLeft - left;
        left = minLeft;
      }
      if (right < minRight) {
        left -= minRight - right;
        right = minRight;
      }
      return [left, right];
    }

    /** Pointer-driven column resize: keeps dragging working outside the tiny handle hit area. */
    function startTableColResize(e, handleEl, leftIdx, rightIdx) {
      if (e.button !== 0) return;
      e.preventDefault();
      const table = document.getElementById('resultsTable');
      if (!table || !handleEl) return;
      const startX = e.clientX;
      const pointerId = e.pointerId;
      const startP = colPercent.slice();
      const pairTotal = (startP[leftIdx] || 0) + (startP[rightIdx] || 0);
      let nextP = startP.slice();
      let raf = 0;

      document.body.classList.add('tagfox-table-col-resize-active');
      handleEl.classList.add('th-resize-active');
      if (handleEl.setPointerCapture && pointerId != null) {
        try {
          handleEl.setPointerCapture(pointerId);
        } catch (_) {}
      }

      function flush() {
        raf = 0;
        colPercent = nextP.slice();
        applyTableColWidths();
      }

      function finish(commit) {
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', up, true);
        document.removeEventListener('pointercancel', cancel, true);
        document.body.classList.remove('tagfox-table-col-resize-active');
        handleEl.classList.remove('th-resize-active');
        if (handleEl.releasePointerCapture && pointerId != null) {
          try {
            handleEl.releasePointerCapture(pointerId);
          } catch (_) {}
        }
        if (raf) cancelAnimationFrame(raf);
        colPercent = nextP.slice();
        applyTableColWidths();
        if (commit) localStorage.setItem(LS.tableCols, JSON.stringify(colPercent));
      }

      function move(ev) {
        if (pointerId != null && ev.pointerId !== pointerId) return;
        const tw = table.getBoundingClientRect().width;
        if (tw < 80) return;
        const deltaPct = ((ev.clientX - startX) / tw) * 100;
        let left = (startP[leftIdx] || 0) + deltaPct;
        let right = pairTotal - left;
        [left, right] = clampTableResizePair(leftIdx, rightIdx, left, right);
        nextP = startP.slice();
        nextP[leftIdx] = left;
        nextP[rightIdx] = right;
        if (!raf) raf = requestAnimationFrame(flush);
        ev.preventDefault();
      }

      function up(ev) {
        if (pointerId != null && ev.pointerId !== pointerId) return;
        finish(true);
      }

      function cancel(ev) {
        if (pointerId != null && ev.pointerId !== pointerId) return;
        finish(false);
      }

      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
      document.addEventListener('pointercancel', cancel, true);
    }

    /**
     * Settings scope folder changed from UI: persist, breadcrumb, immediate Everything refresh.
     * Use for breadcrumb, favourites, folder row, row parent-scope (chevron), sibling-folder dropdown, etc.
     */
    async function applySearchScopeAndRefresh(folderAbsPath) {
      leaveScopePathEditChrome();
      setSearchScopeFolder(clampFolderPathToSearchMax(folderAbsPath));
      const scopeNorm = normalizeFolderPathForEverything(document.getElementById('rootFolder').value.trim());
      if (scopeNorm) {
        rememberScopeFolderHistory(scopeNorm);
        bumpFolderFocusVisit(scopeNorm);
      }
      saveSettings();
      renderScopeBreadcrumb();
      await runSearchNow();
      commitSearchHistoryNow();
      pulseSearchBoxAfterScopeFolderChange();
      void renderRecentFoldersBar();
    }

    function cloneResultsPagingCtx(ctx) {
      if (!ctx || typeof ctx !== 'object') return null;
      try {
        return JSON.parse(JSON.stringify(ctx));
      } catch (_) {
        return null;
      }
    }

    // -------------------------------------------------------------------------
    // Result tabs (replaced the A/B split panes). One results pane is visible; the
    // active tab owns the live UI + canonical #results* ids. Inactive tabs are pure
    // state snapshots — no DOM — that re-run their own search when activated.
    // -------------------------------------------------------------------------

    function makeTabId() { return nextTabId++; }
    function activeTab() { return tabs.find((t) => t.id === activeTabId) || null; }
    function tabIndexById(id) { return tabs.findIndex((t) => t.id === id); }
    function newBlankTab(searchState) {
      return { id: makeTabId(), searchState: searchState || null, lastRows: [], resultsPagingCtx: null };
    }

    /** Short label for a tab chip: scope-folder leaf, else the query text, else a default. */
    function tabTitle(tab) {
      const st = tab && tab.searchState;
      if (st) {
        const root = String(st.rootFolder || '').trim().replace(/[/\\]+$/, '');
        if (root) {
          const leaf = segmentPretty(T.baseName(root));
          if (leaf) return leaf;
        }
        const q = String(st.query || '').trim();
        if (q) return q;
      }
      return 'New tab';
    }

    function saveActiveTabStateFromUi() {
      const tab = activeTab();
      if (!tab) return;
      tab.searchState = serializeSearchState();
      tab.lastRows = Array.isArray(lastRows) ? lastRows.slice() : [];
      tab.resultsPagingCtx = cloneResultsPagingCtx(resultsPagingCtx);
      persistTabsToStorage();
      renderTabStrip();
    }

    /** Load a tab's saved state into the single live pane (no id swapping — one pane only). */
    function restoreTabStateIntoUi(tab) {
      if (!tab) return;
      lastRows = Array.isArray(tab.lastRows) ? tab.lastRows.slice() : [];
      resultsPagingCtx = cloneResultsPagingCtx(tab.resultsPagingCtx);
      if (tab.searchState) {
        applySearchState(tab.searchState);
        updateQueryPlaceholder();
        persistActiveTagFilter();
        saveSettings();
      }
      updateSortHeaders();
      renderScopeBreadcrumb();
      renderTagBar();
      applyResultsTablePathColumnVisibility();
      renderTable();
      bindResultsDomListeners();
    }

    /* Tabs persist their searchState (filter / scope / view) across restart as one JSON blob.
       lastRows / resultsPagingCtx are search results (stale after restart) and intentionally not
       persisted; the active tab's search re-runs at startup and others re-run when activated. */
    function persistTabsToStorage() {
      try {
        const blob = {
          activeIndex: Math.max(0, tabIndexById(activeTabId)),
          tabs: tabs.map((t) => ({ searchState: t.searchState || null })),
        };
        localStorage.setItem(LS.tabsState, JSON.stringify(blob));
      } catch (_) {
        /* ignore quota / serialize errors — tabs fall back to a single default tab next restart */
      }
    }
    function loadTabsFromStorage() {
      const obj = lsGetJson(LS.tabsState, null);
      if (!obj || !Array.isArray(obj.tabs) || !obj.tabs.length) return null;
      return obj;
    }

    async function activateTab(id, opts = {}) {
      if (id === activeTabId) return;
      const target = tabs.find((t) => t.id === id);
      if (!target) return;
      saveActiveTabStateFromUi();
      activeTabId = id;
      restoreTabStateIntoUi(target);
      renderTabStrip();
      persistTabsToStorage();
      if (opts && opts.skipSearch) return;
      await runSearchNow('identity');
      saveActiveTabStateFromUi();
    }

    /** Open a new scratch tab (seeded from the current search) and activate it. Refuses past MAX_TABS. */
    async function openNewTab(opts = {}) {
      if (tabs.length >= MAX_TABS) {
        setStatusMain('Tab limit reached (' + MAX_TABS + '). Close a tab first.');
        return null;
      }
      saveActiveTabStateFromUi();
      const seed = opts.seedFromCurrent === false ? null : serializeSearchState();
      const tab = newBlankTab(seed);
      const at = tabIndexById(activeTabId);
      tabs.splice(at >= 0 ? at + 1 : tabs.length, 0, tab);
      activeTabId = tab.id;
      restoreTabStateIntoUi(tab);
      renderTabStrip();
      persistTabsToStorage();
      if (!opts.skipSearch) { await runSearchNow('identity'); saveActiveTabStateFromUi(); }
      return tab;
    }

    /** Close a tab. Activates a neighbour; never drops below one tab (the last one resets to blank). */
    async function closeTab(id) {
      const idx = tabIndexById(id);
      if (idx < 0) return;
      if (tabs.length <= 1) {
        const only = tabs[0];
        only.searchState = null;
        only.lastRows = [];
        only.resultsPagingCtx = null;
        restoreTabStateIntoUi(only);
        renderTabStrip();
        persistTabsToStorage();
        await runSearchNow('identity');
        saveActiveTabStateFromUi();
        return;
      }
      const wasActive = id === activeTabId;
      tabs.splice(idx, 1);
      if (!wasActive) {
        renderTabStrip();
        persistTabsToStorage();
        return;
      }
      const next = tabs[Math.min(idx, tabs.length - 1)];
      activeTabId = next.id;
      restoreTabStateIntoUi(next);
      renderTabStrip();
      persistTabsToStorage();
      await runSearchNow('identity');
      saveActiveTabStateFromUi();
    }

    /** Cycle to the next (dir=1) or previous (dir=-1) tab with wraparound. */
    function cycleTab(dir) {
      if (tabs.length < 2) return;
      const at = tabIndexById(activeTabId);
      const nextIdx = (((at + dir) % tabs.length) + tabs.length) % tabs.length;
      void activateTab(tabs[nextIdx].id);
    }

    /** Move a tab within the strip (drag reorder). */
    function reorderTab(fromIdx, toIdx) {
      if (fromIdx < 0 || fromIdx >= tabs.length) return;
      const to = Math.max(0, Math.min(tabs.length - 1, toIdx));
      if (fromIdx === to) return;
      const [moved] = tabs.splice(fromIdx, 1);
      tabs.splice(to, 0, moved);
      renderTabStrip();
      persistTabsToStorage();
    }

    function renderTabStrip() {
      const list = document.getElementById('resultsTabList');
      if (!list) return;
      list.textContent = '';
      tabs.forEach((tab, idx) => {
        const chip = document.createElement('div');
        chip.className = 'results-tab' + (tab.id === activeTabId ? ' results-tab-active' : '');
        chip.setAttribute('data-tab-id', String(tab.id));
        chip.setAttribute('data-tab-idx', String(idx));
        chip.setAttribute('draggable', 'true');
        chip.title = tabTitle(tab);
        const label = document.createElement('span');
        label.className = 'results-tab-label';
        label.textContent = tabTitle(tab);
        chip.appendChild(label);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'results-tab-close';
        close.setAttribute('aria-label', 'Close tab');
        close.innerHTML = '<i class="fa-solid fa-xmark fa-xs" aria-hidden="true"></i>';
        chip.appendChild(close);
        list.appendChild(chip);
      });
      const addBtn = document.getElementById('btnNewTab');
      if (addBtn) addBtn.disabled = tabs.length >= MAX_TABS;
    }

    /* Spring-load: a file/Shelf drag that hovers a tab opens that tab after a short hold, so the
       user can drop into it. Timer cleared on leave / drop / dragend. */
    let tabSpringHoverTimer = null;
    let tabSpringHoverId = null;
    function clearTabSpringHover() {
      if (tabSpringHoverTimer) { clearTimeout(tabSpringHoverTimer); tabSpringHoverTimer = null; }
      tabSpringHoverId = null;
    }
    function bindTabStripOnce() {
      const strip = document.getElementById('resultsTabStrip');
      if (!strip || strip.dataset.tabStripBound === '1') return;
      strip.dataset.tabStripBound = '1';
      let dragFromIdx = -1;

      strip.addEventListener('click', (e) => {
        if (e.target.closest('#btnNewTab')) { e.preventDefault(); void openNewTab(); return; }
        const closeBtn = e.target.closest('.results-tab-close');
        if (closeBtn) {
          e.preventDefault(); e.stopPropagation();
          const chip = closeBtn.closest('.results-tab');
          if (chip) void closeTab(Number(chip.getAttribute('data-tab-id')));
          return;
        }
        const chip = e.target.closest('.results-tab');
        if (chip) void activateTab(Number(chip.getAttribute('data-tab-id')));
      });
      /* Middle-click closes a tab (browser convention). */
      strip.addEventListener('auxclick', (e) => {
        if (e.button !== 1) return;
        const chip = e.target.closest('.results-tab');
        if (chip) { e.preventDefault(); void closeTab(Number(chip.getAttribute('data-tab-id'))); }
      });

      strip.addEventListener('dragstart', (e) => {
        const chip = e.target.closest('.results-tab');
        if (!chip) return;
        dragFromIdx = Number(chip.getAttribute('data-tab-idx'));
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', 'tab:' + chip.getAttribute('data-tab-id')); } catch (_) {}
        chip.classList.add('results-tab-dragging');
      });
      strip.addEventListener('dragend', (e) => {
        const chip = e.target.closest('.results-tab');
        if (chip) chip.classList.remove('results-tab-dragging');
        dragFromIdx = -1;
        clearTabSpringHover();
      });
      strip.addEventListener('dragover', (e) => {
        if (dragFromIdx >= 0) {
          if (e.target.closest('.results-tab') || e.target.closest('#resultsTabList')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
          return;
        }
        if (!dataTransferHasTagBrowserOrFiles(e.dataTransfer)) return;
        const chip = e.target.closest('.results-tab');
        if (!chip) { clearTabSpringHover(); return; }
        e.preventDefault();
        e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
        const id = Number(chip.getAttribute('data-tab-id'));
        if (id === activeTabId) { clearTabSpringHover(); return; }
        if (id !== tabSpringHoverId) {
          clearTabSpringHover();
          tabSpringHoverId = id;
          tabSpringHoverTimer = setTimeout(() => { tabSpringHoverTimer = null; void activateTab(id); }, 550);
        }
      });
      strip.addEventListener('dragleave', (e) => {
        if (!strip.contains(e.relatedTarget)) clearTabSpringHover();
      });
      strip.addEventListener('drop', (e) => {
        const chip = e.target.closest('.results-tab');
        if (dragFromIdx >= 0) {
          e.preventDefault();
          const toIdx = chip ? Number(chip.getAttribute('data-tab-idx')) : tabs.length - 1;
          reorderTab(dragFromIdx, toIdx);
          dragFromIdx = -1;
          return;
        }
        if (!dataTransferHasTagBrowserOrFiles(e.dataTransfer)) return;
        clearTabSpringHover();
        if (!chip) return;
        e.preventDefault();
        const tab = tabs.find((t) => t.id === Number(chip.getAttribute('data-tab-id')));
        const paths = collectPathsForShelfDrop(e.dataTransfer);
        if (!tab || !paths.length) return;
        const dest = normalizeFolderPathForEverything(String((tab.searchState && tab.searchState.rootFolder) || '').trim());
        if (!dest) { setStatusMain('That tab has no folder scope to drop into.'); return; }
        void applyInternalPathsDrop(dest, paths, e.shiftKey ? 'copy' : 'move');
      });
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

    /* Serialize whole runSearchNow flow (active runSearch + inactive refresh dance) so two F5/auto-refresh ticks can't interleave the swap-canonical-IDs dance. Reuses searchMutex/topLevelSearchDepth; nested runSearchNow (smart-narrow inside outer runSearch) sees depth>0 and skips re-acquire. */
    async function runSearchNow(eventKind = 'identity', opts) {
      /* Nested = a call made synchronously inside an already-running flow (smart-narrow / smart-probe
         re-search), which must skip the mutex to avoid self-deadlock. It is marked explicitly via
         opts.nested. A fresh event-loop task (debounced search, F5, disk-mutation retry) that fires while
         a flow holds topLevelSearchDepth>0 is NOT nested: inferring nesting from the global counter let it
         skip the mutex and run concurrently with the inactive-pane dance, rendering its rows into the
         id-swapped (hidden) pane's tbody. The active pane then looked empty until a pane switch repainted
         it. Explicit flag → such a task waits on the mutex instead. */
      const isNested = !!(opts && opts.nested);
      let releaseMutex = null;
      if (!isNested) {
        const prev = searchMutex;
        searchMutex = new Promise((r) => {
          releaseMutex = r;
        });
        await prev;
      }
      topLevelSearchDepth++;
      try {
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = null;
        }
        await runSearch(eventKind, opts);
        saveActiveTabStateFromUi();
        /* The active tab is the only one with DOM. Inactive tabs are passive state snapshots re-searched on
           activation, so F5 / auto-refresh / disk mutation only ever touch the active tab. There is no
           background flow against another pane, which is where the old dual-pane races and cross-pane bleed
           lived. */
      } finally {
        topLevelSearchDepth--;
        if (!isNested && releaseMutex) releaseMutex();
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
         Everything catches up, instead of two extra full repaints the user reads as flicker. The retry only
         ever touches the active pane (singlePaneOnly); the inactive pane refreshes when activated. */
      const delays = opts && opts.quietSingle ? [1000] : [350, 1200];
      for (const delayMs of delays) {
        diskMutationRefreshTimeouts.push(
          setTimeout(() => {
            void runSearchNow('refresh', { singlePaneOnly: true });
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
        /* Rows are already gone from the UI. Skip the immediate re-render and its inactive-pane dance;
           schedule a single quiet reconcile to retire the tombstones once the index settles. */
        clearAndScheduleSearchRetries(payload, { quietSingle: true });
        return;
      }
      clearAndScheduleSearchRetries(payload);
      void runSearchNow('refresh', { singlePaneOnly: true });
    }

    function tagModalIsNewTodoDraft() {
      return tagModalMode === 'newTodo';
    }

    function tagModalIsFolderDocDraft() {
      return tagModalMode === 'folderDocDraft';
    }

    /** Add TODO or folder doc title: chips edit local list only until create / readme save. */
    function tagModalIsNameDraft() {
      return tagModalIsNewTodoDraft() || tagModalIsFolderDocDraft();
    }

    function syncTagModalHintsAndTitle() {
      const renameEl = document.getElementById('tagModalHintRename');
      const newTodoEl = document.getElementById('tagModalHintNewTodo');
      const folderDocEl = document.getElementById('tagModalHintFolderDoc');
      const lbl = document.getElementById('tagModalLabel');
      const isRename = !tagModalIsNameDraft();
      renameEl?.classList.toggle('d-none', !isRename);
      newTodoEl?.classList.toggle('d-none', !tagModalIsNewTodoDraft());
      folderDocEl?.classList.toggle('d-none', !tagModalIsFolderDocDraft());
      if (tagModalIsNewTodoDraft()) {
        if (lbl) lbl.textContent = 'Tags for new TODO file';
      } else if (tagModalIsFolderDocDraft()) {
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
            const st = document.getElementById('statusMain');
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
    function didYouKnowSegmentsPlain(segments) {
      return segments.map((seg) => (typeof seg === 'string' ? seg : seg.kbd)).join('');
    }
    function didYouKnowSegmentsHtml(segments) {
      return segments
        .map((seg) =>
          typeof seg === 'string'
            ? escStatusHtmlForStatus(seg)
            : '<kbd class="tagfox-navbar-tip-kbd">' +
              escStatusHtmlForStatus(seg.kbd) +
              '</kbd>'
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
    /** Leading icon inside a status hint chip (Font Awesome solid class, e.g. fa-gear). */
    function statusHintPillInnerHtml(iconFaClass, escapedInnerHtml) {
      return (
        '<i class="fa-solid ' +
        iconFaClass +
        ' fa-fw" aria-hidden="true"></i> ' +
        escapedInnerHtml
      );
    }

    /** Smart automation line (wand icon + chip); kind warn = big-folder / cap stress. */
    function clearStatusSmartNote() {
      const el = document.getElementById('statusSmartNote');
      if (!el) return;
      el.innerHTML = '';
      el.classList.add('d-none');
      el.classList.remove('tagfox-status-hidden-hint--warn');
    }
    /** Cap-stress chip from smartAfterPaint; clear when paging shows no further pages (load-more doesn’t rerun smartAfterPaint). */
    function clearBigFolderCapSmartNoteIfStale() {
      if (!isSmartView() || !resultsPagingCtx || resultsPagingCtx.hasMore) return;
      const chip = document.getElementById('statusSmartNote');
      if (chip && !chip.classList.contains('d-none') && /Big folder!/.test(String(chip.textContent || '')))
        clearStatusSmartNote();
    }

    function setStatusSmartNote(text, kind) {
      const el = document.getElementById('statusSmartNote');
      if (!el) return;
      if (!text) {
        clearStatusSmartNote();
        return;
      }
      /* Same chip as filter hints; wand icon links to Smart view control. */
      el.innerHTML =
        statusHintPillInnerHtml('fa-wand-magic-sparkles', escStatusHtmlForStatus(text));
      el.classList.remove('d-none');
      el.classList.toggle('tagfox-status-hidden-hint--warn', kind === 'warn');
      /* Chip already says Smart/layout context — remove trailing “Smart view, …” from main line. */
      stripViewModeSentenceFromStatusMain();
    }

    /** Drop last " · Flat|Tree|Smart view…" segment from #statusMain (smart chip is the sole layout hint). */
    function stripViewModeSentenceFromStatusMain() {
      const main = document.getElementById('statusMain');
      if (!main) return;
      const vx = main.querySelector('.tagfox-status-view-suffix');
      if (vx) {
        vx.remove();
        return;
      }
      const t = String(main.textContent || '');
      const idx = t.lastIndexOf(' · ');
      if (idx < 0) return;
      const tail = t.slice(idx + 3);
      if (/^(Flat|Tree|Smart) view/.test(tail)) main.textContent = t.slice(0, idx);
    }

    /** Main status line; clears Smart chip so transient messages don’t stack. */
    function setStatusMain(text) {
      const el = document.getElementById('statusMain');
      if (el) el.textContent = text == null ? '' : String(text);
      clearStatusSmartNote();
    }

    /* ===== Single-level undo (Ctrl+Z): rename/tag-edit, move, copy/paste, new folder.
       One entry only: each new tracked action replaces it. Delete is not undone here — recycled items
       are recoverable from the Windows Recycle Bin (runUndo says so). Bare `z` still sorts by size. ===== */
    let undoEntry = null; // { label, invert: async () => boolean }

    /** Reflect the current undo entry on the toolbar button (enabled + tooltip). */
    function updateUndoButton() {
      const b = document.getElementById('btnUndo');
      if (!b) return;
      if (undoEntry) {
        b.disabled = false;
        b.title = 'Undo: ' + undoEntry.label + ' (Ctrl+Z)';
      } else {
        b.disabled = true;
        b.title = 'Nothing to undo (Ctrl+Z)';
      }
    }

    function setUndoEntry(entry) {
      undoEntry = entry;
      updateUndoButton();
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

    /** First #statusMain segment: raw hit count from Everything (not table row count — path tree may add rows). */
    function formatRowCountLeadingSegmentForStatus(vis, raw) {
      void vis;
      if (raw === 0) return { text: '0 hits' };
      return { text: raw === 1 ? '1 hit' : raw + ' hits' };
    }
    /** Hidden-row reasons only (icons + labels); no “N hidden due to” prefix — count stays in the hits segment. */
    function hiddenDueToStatusHtml(hiddenN, reasonParts) {
      void hiddenN;
      const body = reasonParts
        .map((p, i) => {
          const sep =
            i === 0 ? '' : ' <span class="tagfox-status-hidden-sep text-muted">|</span> ';
          return (
            sep +
            '<i class="fa-solid ' +
            p.icon +
            ' fa-fw" aria-hidden="true"></i> ' +
            escStatusHtmlForStatus(p.label)
          );
        })
        .join('');
      return '<span class="tagfox-status-hidden-hint">' + body + '</span>';
    }
    /** Hide special / ~ only (no row delta): eye-slash matches Advanced popover icon. */
    function hideOptionHintStatusHtml(plain) {
      return (
        '<span class="tagfox-status-hidden-hint">' +
        '<i class="fa-solid fa-eye-slash fa-fw" aria-hidden="true"></i> ' +
        escStatusHtmlForStatus(plain) +
        '</span>'
      );
    }
    /** “Filters on: …” chip: tags vs clock for recency (no gear). */
    function tagRecencyStatusFilterHintHtml(plain) {
      if (!plain) return '';
      if (plain === 'Filters on: tags and recency') {
        return (
          '<span class="tagfox-status-hidden-hint">' +
          '<i class="fa-solid fa-tags fa-fw" aria-hidden="true"></i> ' +
          '<i class="fa-solid fa-clock fa-fw" aria-hidden="true"></i> ' +
          escStatusHtmlForStatus(plain) +
          '</span>'
        );
      }
      const icon = plain === 'Filters on: recency' ? 'fa-clock' : 'fa-tags';
      return (
        '<span class="tagfox-status-hidden-hint">' +
        '<i class="fa-solid ' + icon + ' fa-fw" aria-hidden="true"></i> ' +
        escStatusHtmlForStatus(plain) +
        '</span>'
      );
    }
    /**
     * Plain text for status bar: “Filters on: tags / recency / both” (empty = neither).
     * recencyNarrows: recency bucket is on and removed ≥1 row vs tag-only set (else recency chip omitted).
     */
    function tagRecencyStatusFilterHintPlain(activeKeys, recencyMode, recencyNarrows) {
      const hasTags = activeKeys && activeKeys.size > 0;
      const hasRec = recencyMode && recencyMode !== 'all' && recencyNarrows;
      if (!hasTags && !hasRec) return '';
      if (hasTags && hasRec) return 'Filters on: tags and recency';
      if (hasTags) return 'Filters on: tags';
      return 'Filters on: recency';
    }
    /**
     * Single place that builds the persistent results-table status HTML (hits, filter pills, view suffix).
     * Separation is only via join(' · ') — never put “ · ” inside a segment.
     */
    function formatResultsStatusMainHtml(opts) {
      const {
        visN,
        rawN,
        tagRecencyHintPlain,
        hiddenDueHtml,
        showHideSpecialHint,
        showHideTildeHint,
        omitViewSuffix,
        viewModeSentence,
      } = opts;
      const rowLead = formatRowCountLeadingSegmentForStatus(visN, rawN);
      const segments = [];
      segments.push(escStatusHtmlForStatus(rowLead.text));
      if (hiddenDueHtml) segments.push(hiddenDueHtml);
      else {
        if (showHideSpecialHint) segments.push(hideOptionHintStatusHtml('Hiding special files/folders'));
        if (showHideTildeHint) segments.push(hideOptionHintStatusHtml('Hiding paths with ~ segment'));
      }
      if (tagRecencyHintPlain) segments.push(tagRecencyStatusFilterHintHtml(tagRecencyHintPlain));
      if (!omitViewSuffix && viewModeSentence)
        segments.push('<span class="tagfox-status-view-suffix">' + escStatusHtmlForStatus(viewModeSentence) + '</span>');
      return segments.join(' · ');
    }

    /** After startup: one Drive API call — green tick (or warning) in header next to New dbg. */
    async function refreshGoogleDriveApiPingSegment() {
      const mount = document.getElementById('navbarGoogleDrivePing');
      if (!window.tagBrowser || typeof window.tagBrowser.googleDriveApiPing !== 'function') {
        if (mount) mount.innerHTML = '';
        return;
      }
      try {
        const r = await window.tagBrowser.googleDriveApiPing();
        if (r && r.skipped) {
          if (mount) mount.innerHTML = '';
          return;
        }
        if (r && r.ok && r.email) {
          const tip =
            'Drive API: ' +
            r.email +
            (r.sampleFileName ? ' · ' + r.sampleFileName : '');
          const safeTip = String(tip).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
          if (mount)
            mount.innerHTML =
              '<span class="tagfox-navbar-drive-ping" title="' +
              safeTip +
              '" aria-label="' +
              safeTip +
              '"><i class="fa-solid fa-check text-success" aria-hidden="true"></i></span>';
        } else if (r && r.error) {
          const short = String(r.error).length > 96 ? String(r.error).slice(0, 96) + '…' : String(r.error);
          if (mount)
            mount.innerHTML =
              '<span class="tagfox-navbar-drive-ping text-warning small">' +
              escStatusHtmlForStatus('Drive API: ' + short) +
              '</span>';
        } else {
          if (mount) mount.innerHTML = '';
        }
      } catch (e) {
        const msg = 'Drive API: ' + String(e.message || e);
        if (mount)
          mount.innerHTML =
            '<span class="tagfox-navbar-drive-ping text-warning small">' + escStatusHtmlForStatus(msg) + '</span>';
      }
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
      /* Files-only: list file hits in path order only — no real or synthetic folder rows. */
      if (isFilesOnly()) return false;
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

    function saveFavouriteFolders(paths) {
      lsSetJson(LS.favFolders, paths.slice(0, 30));
    }

    /** Per-path focus counts + last visit (normalized lowercased keys) for the Recent bars. */
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

    /** Per-folder focus counts + last visit for the Recent bar. */
    function loadFolderFocusStats() {
      return loadFocusStats(LS.folderFocusStats);
    }

    function saveFolderFocusStats(o) {
      lsSetJson(LS.folderFocusStats, o);
    }

    /** Per-file open counts + last open for the Recent files bar. */
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
      void renderRecentFilesBar();
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

    /** Save one folder into favourites at gap 0…n; if already saved, move that existing slot. */
    function upsertFavouriteFolderAtGap(folderPathRaw, gapIdx) {
      const folderPath = normalizeFolderPathForEverything(String(folderPathRaw || '').trim());
      if (!folderPath) return { changed: false, existed: false };
      const prev = loadFavouriteFolders()
        .map((p) => normalizeFolderPathForEverything(String(p || '').trim()))
        .filter(Boolean);
      const key = folderPath.toLowerCase();
      const existed = prev.some((p) => p.toLowerCase() === key);
      const n = prev.length;
      const safeGapIdx = Number.isFinite(gapIdx) ? Math.max(0, Math.min(gapIdx, n)) : n;
      let removedBeforeGap = 0;
      const next = [];
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].toLowerCase() === key) {
          if (i < safeGapIdx) removedBeforeGap += 1;
          continue;
        }
        next.push(prev[i]);
      }
      const ins = Math.max(0, Math.min(safeGapIdx - removedBeforeGap, next.length));
      next.splice(ins, 0, folderPath);
      const changed =
        next.length !== prev.length || next.some((p, i) => pathNormKey(p) !== pathNormKey(prev[i] || ''));
      if (!changed) return { changed: false, existed };
      saveFavouriteFolders(next);
      renderFavFoldersBar();
      return { changed: true, existed };
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

    /**
     * LHS column: folder chip + ▾ + same subfolder flyouts as breadcrumb; drop target via data-drop-path on .fav-folder-chip-go.
     * opts.recent: no ×, no reorder slot; opts.removable + favIdx: favourites bar only.
     */
    function buildFavColumnFolderChipRowEl(fp, opts) {
      opts = opts || {};
      const parentNorm = normalizeFolderPathForEverything(fp);
      const row = document.createElement('span');
      row.className = 'd-flex align-items-stretch w-100 tagfox-fav-chip-row';
      if (Number.isFinite(opts.favIdx)) row.dataset.favIdx = String(opts.favIdx);
      const grp = document.createElement('div');
      grp.className = 'btn-group btn-group-sm fav-folder-chip-group';
      const go = document.createElement('span');
      go.setAttribute('role', 'button');
      go.tabIndex = 0;
      go.draggable = false;
      go.className = 'btn btn-sm fav-folder-chip-go d-inline-flex align-items-center flex-wrap gap-1 text-start';
      const n = String(fp || '').replace(/[/\\]+$/, '');
      const base = T.baseName(n) || n;
      const parsed = T.parseSegmentTags(base);
      const pretty = parsed.pretty || base;
      const lead = document.createElement('span');
      lead.className = 'd-inline-flex align-items-center gap-1 fav-folder-chip-lead';
      lead.appendChild(folderIconEl());
      const nm = document.createElement('span');
      nm.className = 'fav-folder-chip-name';
      nm.textContent = pretty;
      lead.appendChild(nm);
      go.appendChild(lead);
      if (opts.removable) {
        const rm = document.createElement('span');
        rm.className = 'fav-folder-chip-remove';
        rm.setAttribute('role', 'button');
        rm.tabIndex = 0;
        rm.setAttribute('data-fav-no-drag', '1');
        rm.setAttribute('aria-label', 'Remove favourite');
        rm.title = 'Remove favourite';
        rm.innerHTML = '<i class="fa-solid fa-xmark fa-sm" aria-hidden="true"></i>';
        const removeThisFav = () => {
          const next = loadFavouriteFolders().filter((p) => p.toLowerCase() !== fp.toLowerCase());
          saveFavouriteFolders(next);
          renderFavFoldersBar();
        };
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          removeThisFav();
        });
        rm.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          removeThisFav();
        });
        go.appendChild(rm);
      }
      for (const tag of parsed.tags) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.style.backgroundColor = tagColorCss(tag);
        b.style.color = '#212529';
        b.textContent = tag;
        go.appendChild(b);
      }
      if (opts.recent) {
        go.title = fp;
        go.setAttribute('aria-label', 'Open recent folder ' + fp);
      } else {
        const idx = opts.favIdx | 0;
        const slot = idx + 1;
        go.title =
          'Drag to reorder (up/down).' + (idx < 9 ? ' Shortcut: Ctrl+Shift+' + slot + '.' : '');
        go.setAttribute(
          'aria-label',
          'Open favourite folder ' +
            slot +
            (idx < 9 ? ' (keyboard Ctrl+Shift+' + slot + ')' : '') +
            '. ' +
            fp
        );
      }
      go.addEventListener('click', () => void applySearchScopeAndRefresh(fp));
      go.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        void applySearchScopeAndRefresh(fp);
      });
      go.dataset.dropPath = parentNorm;
      const ddWrap = document.createElement('div');
      ddWrap.className = 'dropdown';
      const ddBtn = document.createElement('button');
      ddBtn.type = 'button';
      ddBtn.className = 'btn btn-sm dropdown-toggle fav-folder-chip-chevron tagfox-scope-chevron';
      ddBtn.setAttribute('data-bs-toggle', 'dropdown');
      ddBtn.setAttribute('data-fav-no-drag', '1');
      ddBtn.setAttribute('aria-expanded', 'false');
      ddBtn.setAttribute(
        'aria-label',
        opts.recent ? 'Subfolders of this recent folder' : 'Subfolders of this favourite'
      );
      ddBtn.innerHTML = '<span class="visually-hidden">Subfolders</span>' + breadcrumbDropdownChevronHtml();
      const menu = document.createElement('ul');
      const hl = breadcrumbHighlightChildPathNorm(parentNorm);
      /* Click-to-open, NOT hover-open: these fav/recent chips point at arbitrary (often Google Drive) folders,
         and hover-open fired listChildFolders -> fs.readdir on each one a 150ms dwell landed on. On a Drive
         mirror that makes the Drive filesystem driver hydrate the folder, stalling the whole machine while the
         mouse just rests on or moves down the favourites list. The ▾ still opens the subfolder list on click. */
      bindSubfolderDropdownWithFlyouts(ddBtn, menu, ddWrap, parentNorm, hl || '', false, {
        favColumnSubmenu: true,
        menuAlignStart: false,
      });
      grp.appendChild(go);
      ddWrap.appendChild(ddBtn);
      ddWrap.appendChild(menu);
      grp.appendChild(ddWrap);
      row.appendChild(grp);
      return row;
    }

    /** LHS column: file chip + ▾ (parent folder submenus); opens file with default app / Workspace. */
    function buildFavColumnFileChipRowEl(fp) {
      const fileNorm = normalizeFolderPathForEverything(String(fp || '').trim());
      const parentNorm = normalizeFolderPathForEverything(T.parentDir(fileNorm));
      const row = document.createElement('span');
      row.className = 'd-flex align-items-stretch w-100 tagfox-fav-chip-row';
      const grp = document.createElement('div');
      grp.className = 'btn-group btn-group-sm fav-folder-chip-group';
      const go = document.createElement('span');
      go.setAttribute('role', 'button');
      go.tabIndex = 0;
      go.draggable = false;
      go.className = 'btn btn-sm fav-folder-chip-go d-inline-flex align-items-center flex-wrap gap-1 text-start';
      const n = String(fileNorm || '').replace(/[/\\]+$/, '');
      const base = T.baseName(n) || n;
      const parsed = T.parseSegmentTags(base);
      const pretty = parsed.pretty || base;
      const lead = document.createElement('span');
      lead.className = 'd-inline-flex align-items-center gap-1 fav-folder-chip-lead';
      lead.appendChild(fileIconEl(fileExtFromPretty(parsed.pretty)));
      const nm = document.createElement('span');
      nm.className = 'fav-folder-chip-name';
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
      go.title = fileNorm;
      go.setAttribute('aria-label', 'Open recent file ' + fileNorm);
      go.addEventListener('click', () => void openFileDefaultOrGoogleWorkspace(fileNorm));
      go.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        void openFileDefaultOrGoogleWorkspace(fileNorm);
      });
      go.dataset.dropPath = parentNorm;
      const ddWrap = document.createElement('div');
      ddWrap.className = 'dropdown';
      const ddBtn = document.createElement('button');
      ddBtn.type = 'button';
      ddBtn.className = 'btn btn-sm dropdown-toggle fav-folder-chip-chevron tagfox-scope-chevron';
      ddBtn.setAttribute('data-bs-toggle', 'dropdown');
      ddBtn.setAttribute('data-fav-no-drag', '1');
      ddBtn.setAttribute('aria-expanded', 'false');
      ddBtn.setAttribute('aria-label', 'Subfolders of folder containing this file');
      ddBtn.innerHTML = '<span class="visually-hidden">Subfolders</span>' + breadcrumbDropdownChevronHtml();
      const menu = document.createElement('ul');
      const hl = breadcrumbHighlightChildPathNorm(parentNorm);
      /* Click-to-open, NOT hover-open: these fav/recent chips point at arbitrary (often Google Drive) folders,
         and hover-open fired listChildFolders -> fs.readdir on each one a 150ms dwell landed on. On a Drive
         mirror that makes the Drive filesystem driver hydrate the folder, stalling the whole machine while the
         mouse just rests on or moves down the favourites list. The ▾ still opens the subfolder list on click. */
      bindSubfolderDropdownWithFlyouts(ddBtn, menu, ddWrap, parentNorm, hl || '', false, {
        favColumnSubmenu: true,
        menuAlignStart: false,
      });
      grp.appendChild(go);
      ddWrap.appendChild(ddBtn);
      ddWrap.appendChild(menu);
      grp.appendChild(ddWrap);
      row.appendChild(grp);
      return row;
    }

    function renderFavFoldersBar() {
      const el = document.getElementById('favFoldersBar');
      if (!el) return;
      el.innerHTML = '';
      const paths = loadFavouriteFolders();
      if (!paths.length) {
        el.innerHTML = '<span class="text-muted small fst-italic px-2">Click <i class="fa-solid fa-floppy-disk"></i> to save the current folder</span>';
        void renderRecentFoldersBar();
        void renderRecentFilesBar();
        return;
      }
      for (let idx = 0; idx < paths.length; idx++) {
        el.appendChild(
          buildFavColumnFolderChipRowEl(paths[idx], { favIdx: idx, removable: true })
        );
      }
      refreshTagFoxChromeTooltips(el);
      void renderRecentFoldersBar();
      void renderRecentFilesBar();
    }

    /** Recent bar (under favourites): merged TagFox visit stats + Windows shell Recent; excludes favourite paths. */
    async function renderRecentFoldersBar() {
      const el = document.getElementById('favRecentFoldersBar');
      if (!el) return;
      el.innerHTML = '';
      const favSet = new Set(loadFavouriteFolders().map((p) => String(p).toLowerCase()));
      const stats = loadFolderFocusStats();
      let winFolders = [];
      try {
        if (window.tagBrowser && typeof window.tagBrowser.windowsRecentFolders === 'function') {
          const r = await perfTimeAsync('windowsRecentFolders', {}, () => window.tagBrowser.windowsRecentFolders());
          if (r && r.ok && Array.isArray(r.folders)) winFolders = r.folders;
        }
      } catch (_) {}
      const byKey = new Map();
      for (const k of Object.keys(stats)) {
        const ent = stats[k];
        if (!ent || !ent.path) continue;
        const norm = normalizeFolderPathForEverything(String(ent.path));
        if (!norm) continue;
        const low = norm.toLowerCase();
        if (favSet.has(low)) continue;
        byKey.set(low, {
          path: norm,
          visits: ent.visits || 0,
          lastTs: ent.lastTs || 0,
          winMtimeMs: 0,
        });
      }
      for (const w of winFolders) {
        const raw = w && w.path ? String(w.path) : '';
        if (!raw) continue;
        const norm = normalizeFolderPathForEverything(raw);
        if (!norm) continue;
        const low = norm.toLowerCase();
        if (favSet.has(low)) continue;
        const mt = typeof w.mtimeMs === 'number' ? w.mtimeMs : 0;
        if (byKey.has(low)) {
          const o = byKey.get(low);
          o.winMtimeMs = Math.max(o.winMtimeMs || 0, mt);
          o.lastTs = Math.max(o.lastTs || 0, mt);
        } else {
          byKey.set(low, { path: norm, visits: 0, lastTs: mt, winMtimeMs: mt });
        }
      }
      const now = Date.now();
      const ranked = [];
      for (const v of byKey.values()) {
        const lastTs = Math.max(v.lastTs || 0, v.winMtimeMs || 0);
        const ageMs = Math.max(0, now - lastTs);
        const week = 7 * 24 * 3600000;
        const recency = Math.exp(-ageMs / week);
        const freq = Math.log(1 + (v.visits || 0));
        const score = freq * 2.2 + recency * 3.5;
        ranked.push({ ...v, lastTs, score });
      }
      ranked.sort((a, b) => b.score - a.score);
      const top = ranked.slice(0, 20);
      if (!top.length) {
        el.innerHTML =
          '<span class="text-muted small fst-italic px-2">Open folders here to build this list</span>';
        return;
      }
      for (const row of top) {
        el.appendChild(buildFavColumnFolderChipRowEl(row.path, { recent: true }));
      }
      refreshTagFoxChromeTooltips(el);
    }

    /** Recent files: merged TagFox open counts + Windows shell Recent file targets. */
    async function renderRecentFilesBar() {
      const el = document.getElementById('favRecentFilesBar');
      if (!el) return;
      el.innerHTML = '';
      const stats = loadFileFocusStats();
      let winFiles = [];
      try {
        if (window.tagBrowser && typeof window.tagBrowser.windowsRecentFiles === 'function') {
          const r = await perfTimeAsync('windowsRecentFiles', {}, () => window.tagBrowser.windowsRecentFiles());
          if (r && r.ok && Array.isArray(r.files)) winFiles = r.files;
        }
      } catch (_) {}
      const byKey = new Map();
      for (const k of Object.keys(stats)) {
        const ent = stats[k];
        if (!ent || !ent.path) continue;
        const norm = normalizeFolderPathForEverything(String(ent.path));
        if (!norm) continue;
        const low = norm.toLowerCase();
        byKey.set(low, {
          path: norm,
          visits: ent.visits || 0,
          lastTs: ent.lastTs || 0,
          winMtimeMs: 0,
        });
      }
      for (const w of winFiles) {
        const raw = w && w.path ? String(w.path) : '';
        if (!raw) continue;
        const norm = normalizeFolderPathForEverything(raw);
        if (!norm) continue;
        const low = norm.toLowerCase();
        const mt = typeof w.mtimeMs === 'number' ? w.mtimeMs : 0;
        if (byKey.has(low)) {
          const o = byKey.get(low);
          o.winMtimeMs = Math.max(o.winMtimeMs || 0, mt);
          o.lastTs = Math.max(o.lastTs || 0, mt);
        } else {
          byKey.set(low, { path: norm, visits: 0, lastTs: mt, winMtimeMs: mt });
        }
      }
      const now = Date.now();
      const ranked = [];
      for (const v of byKey.values()) {
        const lastTs = Math.max(v.lastTs || 0, v.winMtimeMs || 0);
        const ageMs = Math.max(0, now - lastTs);
        const week = 7 * 24 * 3600000;
        const recency = Math.exp(-ageMs / week);
        const freq = Math.log(1 + (v.visits || 0));
        const score = freq * 2.2 + recency * 3.5;
        ranked.push({ ...v, lastTs, score });
      }
      ranked.sort((a, b) => b.score - a.score);
      const top = ranked.slice(0, 20);
      if (!top.length) {
        el.innerHTML =
          '<span class="text-muted small fst-italic px-2">Open files here to build this list</span>';
        return;
      }
      for (const row of top) {
        el.appendChild(buildFavColumnFileChipRowEl(row.path));
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
      if (!chips.length) {
        barEl.appendChild(createFavDropGapEl(0));
        return;
      }
      barEl.insertBefore(createFavDropGapEl(0), chips[0]);
      for (let i = 0; i < chips.length; i++) {
        const chip = chips[i];
        const gap = createFavDropGapEl(i + 1);
        if (chip.nextSibling) barEl.insertBefore(gap, chip.nextSibling);
        else barEl.appendChild(gap);
      }
      searchDebugLog('favBar.dnd.injectGaps', {
        bar: barEl.id,
        chipRows: chips.length,
        gapSlots: barEl.querySelectorAll('.tagfox-fav-drop-gap').length,
      });
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

    /** Which gap is closest to the pointer (fallback when not over a chip row). */
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

    /** Gap index 0…n for reorder: explicit gap hit, else left/right half of chip row (fixes “drop at end” vs nearest-centre). */
    function favGapIndexFromBarPointer(barEl, clientX, clientY, e) {
      const raw = e && e.target;
      const t = raw && raw.nodeType === 3 ? raw.parentElement : raw;
      const vertical = barEl && barEl.classList && barEl.classList.contains('tagfox-fav-bar--vertical');
      if (t) {
        const gEl = t.closest && t.closest('.tagfox-fav-drop-gap');
        if (gEl && barEl.contains(gEl)) return +gEl.dataset.favGapIdx;
        const row = t.closest && t.closest('.tagfox-fav-chip-row');
        if (row && barEl.contains(row)) {
          const idx = +row.dataset.favIdx;
          if (Number.isFinite(idx) && idx >= 0) {
            const gapA = barEl.querySelector('.tagfox-fav-drop-gap[data-fav-gap-idx="' + idx + '"]');
            const gapB = barEl.querySelector('.tagfox-fav-drop-gap[data-fav-gap-idx="' + (idx + 1) + '"]');
            if (vertical) {
              /* Vertical bar: gap idx is above chip idx, gap idx+1 below — split by horizontal midline between gaps. */
              if (gapA && gapB) {
                const ra = gapA.getBoundingClientRect();
                const rb = gapB.getBoundingClientRect();
                const midY = (ra.bottom + rb.top) / 2;
                return clientY < midY ? idx : idx + 1;
              }
              const goEl = row.querySelector('.fav-folder-chip-go, .fav-search-chip-go');
              const r = (goEl && goEl.getBoundingClientRect()) || row.getBoundingClientRect();
              return clientY < r.top + r.height / 2 ? idx : idx + 1;
            }
            /* Horizontal bar: midpoint between gap left of chip and gap right of chip. */
            if (gapA && gapB) {
              const mid = (gapA.getBoundingClientRect().right + gapB.getBoundingClientRect().left) / 2;
              return clientX < mid ? idx : idx + 1;
            }
            const goEl = row.querySelector('.fav-folder-chip-go, .fav-search-chip-go');
            const r = (goEl && goEl.getBoundingClientRect()) || row.getBoundingClientRect();
            return clientX < r.left + r.width / 2 ? idx : idx + 1;
          }
        }
      }
      return nearestFavGapIndex(barEl, clientX, clientY);
    }

    let favouriteBarsReorderBound = false;
    let suppressNextFavGoClick = false;
    let favFolderPointerState = null;
    /** Favourite folders (LHS column): pointer-driven reorder — HTML5 drag/drop fails in Electron here. */
    function bindFavFoldersPointerReorderOnce() {
      const barEl = document.getElementById('favFoldersBar');
      if (!barEl || barEl.dataset.tagfoxFavPointerBound === '1') return;
      barEl.dataset.tagfoxFavPointerBound = '1';
      const DRAG_THR2 = 5 * 5;

      function onPointerMove(e) {
        const state = favFolderPointerState;
        if (!state) return;
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        if (!state.active) {
          if (dx * dx + dy * dy < DRAG_THR2) return;
          state.active = true;
          favListDragKind = 'folder';
          injectFavBarDropGaps(barEl);
          state.row.classList.add('tagfox-fav-chip-row--dragging');
        }
        e.preventDefault();
        const gapIdx = favGapIndexFromBarPointer(barEl, e.clientX, e.clientY, e);
        setActiveFavDropGap(barEl, gapIdx);
        state.lastGapIdx = gapIdx;
      }

      function onPointerUp(e) {
        const state = favFolderPointerState;
        favFolderPointerState = null;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        if (!state) return;
        if (!state.active) return;
        const fromIdx = state.fromIdx;
        state.row.classList.remove('tagfox-fav-chip-row--dragging');
        clearFavBarDropGaps(barEl);
        favListDragKind = null;
        const gapIdx = Number.isFinite(state.lastGapIdx)
          ? state.lastGapIdx
          : favGapIndexFromBarPointer(barEl, e.clientX, e.clientY, e);
        if (!Number.isFinite(gapIdx)) return;
        const list = loadFavouriteFolders();
        if (fromIdx < 0 || fromIdx >= list.length) return;
        const next = reorderFavListByGap(list, fromIdx, gapIdx);
        let unchanged = list.length === next.length;
        if (unchanged) {
          for (let i = 0; i < list.length; i++) {
            if (list[i] !== next[i]) {
              unchanged = false;
              break;
            }
          }
        }
        if (unchanged) return;
        suppressNextFavGoClick = true;
        saveFavouriteFolders(next);
        renderFavFoldersBar();
        const st = document.getElementById('statusMain');
        if (st) setStatusMain('Favourite folders reordered.');
      }

      barEl.addEventListener(
        'pointerdown',
        (e) => {
          if (e.button !== 0) return;
          if (document.querySelector('.modal.show')) return;
          if (e.target.closest && e.target.closest('[data-fav-no-drag="1"]')) return;
          const go = e.target.closest && e.target.closest('.fav-folder-chip-go');
          if (!go || !barEl.contains(go)) return;
          const row = go.closest('.tagfox-fav-chip-row');
          if (!row) return;
          const fromIdx = +row.dataset.favIdx;
          if (!Number.isFinite(fromIdx)) return;
          favFolderPointerState = {
            fromIdx,
            row,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            lastGapIdx: null,
          };
          document.addEventListener('pointermove', onPointerMove);
          document.addEventListener('pointerup', onPointerUp);
          document.addEventListener('pointercancel', onPointerUp);
        },
        true
      );

      barEl.addEventListener(
        'click',
        (e) => {
          if (!suppressNextFavGoClick) return;
          const go = e.target.closest && e.target.closest('.fav-folder-chip-go');
          if (!go || !barEl.contains(go)) return;
          e.preventDefault();
          e.stopPropagation();
          suppressNextFavGoClick = false;
        },
        true
      );
    }

    /** One-time: HTML5 drag-drop reorder on #favSearchesBar only (#favFoldersBar uses pointer reorder). */
    function bindFavouriteBarsDragReorderOnce() {
      if (favouriteBarsReorderBound) return;
      favouriteBarsReorderBound = true;

      function wire(barEl, kind) {
        if (!barEl) return;
        const dndKey = kind === 'folder' ? 'tagfox-fav:folder' : 'tagfox-fav:search';
        let lastLoggedGapIdx = -1;
        const dropEl = barEl;

        barEl.addEventListener(
          'dragstart',
          (e) => {
            if (document.querySelector('.modal.show')) {
              e.preventDefault();
              searchDebugLog('favBar.dnd.dragstart', { bar: barEl.id, kind, phase: 'blocked', reason: 'modal' });
              return;
            }
            const t = e.target && e.target.nodeType === 3 ? e.target.parentElement : e.target;
            if (!t || typeof t.closest !== 'function') {
              searchDebugLog('favBar.dnd.dragstart', { bar: barEl.id, kind, phase: 'blocked', reason: 'noTargetElement' });
              return;
            }
            const row = t.closest('.tagfox-fav-chip-row');
            if (!row || !barEl.contains(row)) {
              searchDebugLog('favBar.dnd.dragstart', {
                bar: barEl.id,
                kind,
                phase: 'blocked',
                reason: 'noChipRow',
                tag: t.tagName,
                inBar: !!(row && barEl.contains(row)),
              });
              return;
            }
            if (t.closest('[data-fav-no-drag="1"]')) {
              e.preventDefault();
              searchDebugLog('favBar.dnd.dragstart', { bar: barEl.id, kind, phase: 'blocked', reason: 'noDragZone', tag: t.tagName });
              return;
            }
            const idx = +row.dataset.favIdx;
            if (!Number.isFinite(idx) || idx < 0) {
              searchDebugLog('favBar.dnd.dragstart', { bar: barEl.id, kind, phase: 'blocked', reason: 'badFavIdx', raw: row.dataset.favIdx });
              return;
            }
            const rr = row.getBoundingClientRect();
            searchDebugLog('favBar.dnd.dragstart', {
              bar: barEl.id,
              kind,
              phase: 'ok',
              favIdx: idx,
              targetTag: t.tagName,
              targetClass: t.className && String(t.className).slice(0, 160),
              clientX: e.clientX,
              clientY: e.clientY,
              rowLeft: Math.round(rr.left),
              rowRight: Math.round(rr.right),
              rowWidth: Math.round(rr.width),
            });
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
          searchDebugLog('favBar.dnd.dragend', { bar: barEl.id, kind, lastGapHover: lastLoggedGapIdx });
          lastLoggedGapIdx = -1;
          favListDragKind = null;
          document.querySelectorAll('.tagfox-fav-chip-row--dragging').forEach((n) => n.classList.remove('tagfox-fav-chip-row--dragging'));
          clearAllFavBarDropGaps();
        });

        dropEl.addEventListener('dragover', (e) => {
          if (favListDragKind !== kind) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (barEl.dataset.tagfoxGapsInjected !== '1') injectFavBarDropGaps(barEl);
          const gapIdx = favGapIndexFromBarPointer(barEl, e.clientX, e.clientY, e);
          if (gapIdx !== lastLoggedGapIdx) {
            lastLoggedGapIdx = gapIdx;
            searchDebugLog('favBar.dnd.gapHover', { bar: barEl.id, kind, gapIdx, clientX: e.clientX, clientY: e.clientY });
          }
          setActiveFavDropGap(barEl, gapIdx);
        });

        dropEl.addEventListener('drop', (e) => {
          if (favListDragKind !== kind) {
            searchDebugLog('favBar.dnd.drop', {
              bar: barEl.id,
              kind,
              phase: 'ignored',
              reason: 'favListDragKindMismatch',
              favListDragKind,
            });
            return;
          }
          e.preventDefault();
          const raw = e.dataTransfer.getData('text/plain');
          const re = kind === 'folder' ? /^tagfox-fav:folder:(\d+)$/ : /^tagfox-fav:search:(\d+)$/;
          const m = raw.match(re);
          if (!m) {
            searchDebugLog('favBar.dnd.drop', {
              bar: barEl.id,
              kind,
              phase: 'blocked',
              reason: 'badPlaintext',
              raw: String(raw).slice(0, 120),
              clientX: e.clientX,
              clientY: e.clientY,
            });
            clearAllFavBarDropGaps();
            return;
          }
          const fromIdx = +m[1];
          if (!Number.isFinite(fromIdx)) {
            searchDebugLog('favBar.dnd.drop', { bar: barEl.id, kind, phase: 'blocked', reason: 'badFromIdx' });
            clearAllFavBarDropGaps();
            return;
          }
          const gapIdx = favGapIndexFromBarPointer(barEl, e.clientX, e.clientY, e);
          const tgt = e.target && e.target.nodeType === 3 ? e.target.parentElement : e.target;
          const tgtTag = tgt && tgt.tagName;
          const hitGap = tgt && tgt.closest && tgt.closest('.tagfox-fav-drop-gap');
          if (!Number.isFinite(gapIdx)) {
            searchDebugLog('favBar.dnd.drop', { bar: barEl.id, kind, phase: 'blocked', reason: 'badGapIdx', fromIdx, clientX: e.clientX });
            clearAllFavBarDropGaps();
            return;
          }

          if (kind === 'folder') {
            const list = loadFavouriteFolders();
            if (fromIdx >= list.length) {
              searchDebugLog('favBar.dnd.drop', { bar: barEl.id, kind, phase: 'blocked', reason: 'fromIdxOOB', fromIdx, listLen: list.length });
              clearAllFavBarDropGaps();
              return;
            }
            const next = reorderFavListByGap(list, fromIdx, gapIdx);
            searchDebugLog('favBar.dnd.drop', {
              bar: barEl.id,
              kind,
              phase: 'ok',
              fromIdx,
              gapIdx,
              listLen: list.length,
              hitGap: !!hitGap,
              dropTargetTag: tgtTag,
              clientX: e.clientX,
              clientY: e.clientY,
            });
            saveFavouriteFolders(next);
            renderFavFoldersBar();
          } else {
            const list = loadFavouriteSearches();
            if (fromIdx >= list.length) {
              searchDebugLog('favBar.dnd.drop', { bar: barEl.id, kind, phase: 'blocked', reason: 'fromIdxOOB', fromIdx, listLen: list.length });
              clearAllFavBarDropGaps();
              return;
            }
            const next = reorderFavListByGap(list, fromIdx, gapIdx);
            searchDebugLog('favBar.dnd.drop', {
              bar: barEl.id,
              kind,
              phase: 'ok',
              fromIdx,
              gapIdx,
              listLen: list.length,
              hitGap: !!hitGap,
              dropTargetTag: tgtTag,
              clientX: e.clientX,
              clientY: e.clientY,
            });
            saveFavouriteSearches(next);
            renderFavSearchesBar();
          }
          clearAllFavBarDropGaps();
          const st = document.getElementById('statusMain');
          if (st) setStatusMain(kind === 'folder' ? 'Favourite folders reordered.' : 'Saved searches reordered.');
        });
      }

      wire(document.getElementById('favSearchesBar'), 'search');
    }

    function loadFavouriteSearches() {
      const arr = lsGetJson(LS.favSearches, []);
      return Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : [];
    }

    function saveFavouriteSearches(entries) {
      localStorage.setItem(LS.favSearches, JSON.stringify(entries.slice(0, 30)));
    }

    /* Index for deleteSavedSearchModal confirm; cleared when modal closes. */
    let pendingRemoveFavSearchIdx = null;

    /** Open Bootstrap confirm before removing slot idx from saved searches. */
    function openRemoveSavedSearchConfirm(idx) {
      const list = loadFavouriteSearches();
      if (idx < 0 || idx >= list.length) return;
      pendingRemoveFavSearchIdx = idx;
      const n = idx + 1;
      const q = list[idx].query != null ? String(list[idx].query).trim() : '';
      const bodyEl = document.getElementById('deleteSavedSearchModalBody');
      const modalEl = document.getElementById('deleteSavedSearchModal');
      if (bodyEl) {
        let msg = 'Remove saved search #' + n + ' from the bar? This only removes the shortcut, not any files.';
        if (q) {
          const short = q.length > 80 ? q.slice(0, 77) + '…' : q;
          msg = 'Remove saved search #' + n + ' (“' + short + '”)? This only removes the shortcut, not any files.';
        }
        bodyEl.textContent = msg;
      }
      if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
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
        row.dataset.favIdx = String(idx);
        /* Same as folder chips: no row-level tooltip (would overlap ✕). Drag line prepended onto go below. */
        const grp = document.createElement('div');
        grp.className = 'btn-group btn-group-sm fav-search-chip-group';
        const n = idx + 1;
        const go = document.createElement('span');
        go.setAttribute('role', 'button');
        go.tabIndex = 0;
        go.draggable = true;
        go.className = 'btn btn-sm fav-search-chip-go d-inline-flex align-items-center gap-1';
        const slotNum = document.createElement('span');
        slotNum.textContent = String(n);
        go.appendChild(slotNum);
        /* × inside pill (after slot #); span + role=button — cannot nest <button> in .fav-search-chip-go. */
        const rm = document.createElement('span');
        rm.className = 'fav-search-chip-remove';
        rm.setAttribute('role', 'button');
        rm.tabIndex = 0;
        rm.setAttribute('data-fav-no-drag', '1');
        rm.setAttribute('aria-label', 'Remove saved search');
        rm.title = 'Remove saved search';
        rm.innerHTML = '<i class="fa-solid fa-xmark fa-sm" aria-hidden="true"></i>';
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          openRemoveSavedSearchConfirm(idx);
        });
        rm.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          openRemoveSavedSearchConfirm(idx);
        });
        go.appendChild(rm);
        const a11y =
          'Restore saved search ' +
          n +
          (idx < 9 ? ' (keyboard Ctrl+' + n + ')' : '') +
          '. Hover for query, current folder, and filters.';
        go.setAttribute('aria-label', a11y);
        go.title = 'Drag to reorder.\n\n' + favouriteSearchTooltip(s, idx);
        go.addEventListener('click', () => void applyFavouriteSearchState(s));
        go.addEventListener('keydown', (ev) => {
          if (ev.key !== 'Enter' && ev.key !== ' ') return;
          ev.preventDefault();
          void applyFavouriteSearchState(s);
        });
        grp.appendChild(go);
        row.appendChild(grp);
        el.appendChild(row);
      });
      refreshTagFoxChromeTooltips(el);
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

    /** Scope bars that can host folder-drop pills and subfolder ▾ toggles. */
    const SCOPE_FOLDER_DROP_BAR_IDS = ['breadcrumbBar', 'favFoldersBar', 'favRecentFoldersBar', 'favRecentFilesBar'];
    /** Breadcrumb / fav / recent ▾ toggles — derived from the same bar list to keep hover/drag logic in sync. */
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
          if (favListDragKind === 'folder' && !dataTransferHasTagBrowserOrFiles(e.dataTransfer)) return;
          if (!dataTransferHasTagBrowserOrFiles(e.dataTransfer)) {
            setFavColumnDragPeek(false);
            return;
          }
          const favCol = document.getElementById('favFoldersColumn');
          const overFavCol =
            !!favCol &&
            e.clientX >= favCol.getBoundingClientRect().left &&
            e.clientX <= favCol.getBoundingClientRect().right &&
            e.clientY >= favCol.getBoundingClientRect().top &&
            e.clientY <= favCol.getBoundingClientRect().bottom;
          setFavColumnDragPeek(overFavCol);
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

    /** LHS fav column: subfolder list opens to the right of ▾; clamp to viewport. */
    function positionFavSubfolderDropdownMenu(ddBtn, menu) {
      if (!ddBtn || !menu) return;
      const r = ddBtn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.margin = '0';
      menu.style.transform = 'none';
      menu.style.maxWidth = 'min(26rem, calc(100vw - 2rem))';
      menu.style.width = 'max-content';
      menu.style.top = r.top + 'px';
      menu.style.zIndex = '1060';
      menu.style.right = 'auto';
      let left = r.right + 4;
      menu.style.left = left + 'px';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const mw = menu.offsetWidth || 0;
          let L = r.right + 4;
          if (L + mw > window.innerWidth - 8) L = Math.max(8, window.innerWidth - mw - 8);
          menu.style.left = L + 'px';
          menu.classList.add('tagfox-fav-dd-placed');
        });
      });
    }

    /**
     * Trailing-▾ pattern: list direct subfolders of parentPathRaw + chained ul.breadcrumb-folder-flyout (same IPC as breadcrumb).
     * highlightPathNorm: optional path segment hint along current scope. hoverOpen: hover-opens-menu on ddWrap (breadcrumb + favourites; fav wraps only ▾ + menu so Go isn’t hijacked).
     */
    function bindSubfolderDropdownWithFlyouts(ddBtn, menu, ddWrap, parentPathRaw, highlightPathNorm, hoverOpen, opts) {
      opts = opts || {};
      const parentForList = normalizeFolderPathForEverything(parentPathRaw);
      menu.className =
        'dropdown-menu py-1 small shadow' + (opts.menuAlignStart === false ? '' : ' dropdown-menu-start');
      if (opts.favColumnSubmenu) {
        ddWrap.setAttribute('data-bs-display', 'static');
        ddBtn.removeAttribute('data-bs-placement');
        ddBtn.addEventListener('shown.bs.dropdown', function favSubmenuPlace() {
          requestAnimationFrame(() => requestAnimationFrame(() => positionFavSubfolderDropdownMenu(ddBtn, menu)));
        });
        ddBtn.addEventListener('hidden.bs.dropdown', function favSubmenuClearPlace() {
          menu.classList.remove('tagfox-fav-dd-placed');
          menu.style.position = '';
          menu.style.left = '';
          menu.style.top = '';
          menu.style.margin = '';
          menu.style.transform = '';
          menu.style.zIndex = '';
          menu.style.maxWidth = '';
          menu.style.width = '';
          menu.style.right = '';
        });
      } else {
        ddWrap.removeAttribute('data-bs-display');
        ddBtn.removeAttribute('data-bs-placement');
      }
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
          function repositionFavMenuIfNeeded() {
            if (opts.favColumnSubmenu) {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => positionFavSubfolderDropdownMenu(ddBtn, menu))
              );
            }
          }
          if (!r || !r.ok) {
            const li0 = document.createElement('li');
            li0.innerHTML =
              '<span class="dropdown-item-text text-danger small">' +
              (r && r.error ? String(r.error) : 'Could not list folders') +
              '</span>';
            menu.appendChild(li0);
            repositionFavMenuIfNeeded();
            return;
          }
          const folders = r.folders || [];
          if (!folders.length) {
            const li0 = document.createElement('li');
            li0.innerHTML = '<span class="dropdown-item-text text-muted">(no subfolders)</span>';
            menu.appendChild(li0);
            repositionFavMenuIfNeeded();
            return;
          }
          const listOpts = { onMouseLeaveRow: scheduleHideBreadcrumbSubfolderFlyout };
          if (highlightPathNorm) listOpts.highlightPathNorm = highlightPathNorm;
          appendBreadcrumbFolderListItems(menu, folders, ddBtn, 0, listOpts);
          repositionFavMenuIfNeeded();
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
      syncFavColumnFlyoutPeek();
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
        const anchorInFavCol =
          li.closest &&
          (li.closest('#favFoldersBar') || li.closest('#favRecentFoldersBar') || li.closest('#favRecentFilesBar'));
        /* LHS fav / Recent: keep chained panels opening to the right; only clamp (don’t flip left of row). */
        if (anchorInFavCol) {
          if (left + fr.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - fr.width - 8);
        } else if (left + fr.width > window.innerWidth - 8) {
          left = Math.max(8, r.left - fr.width - 2);
        }
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
      try {
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
      } finally {
        syncFavColumnFlyoutPeek();
      }
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
      const scopeBreadcrumbRow = document.querySelector('.scope-breadcrumb-row');
      const scopeRowActs = document.getElementById('tagfoxScopeBarRowActions');
      /* Detach before innerHTML — buttons live here after first render; clearing would destroy them. */
      if (scopeRowActs) scopeRowActs.remove();
      el.innerHTML = '';
      const maxNorm = getSearchScopeMaxFolderNorm();
      const scopeRaw = document.getElementById('rootFolder').value.trim();
      const btnClear = document.getElementById('btnClearScope');
      if (!maxNorm && !scopeRaw) {
        el.classList.add('d-none');
        el.classList.remove('d-flex', 'align-items-center', 'flex-wrap', 'gap-0');
        /* Keep shell visible so path-edit + history (inside .tagfox-breadcrumb-shell-actions) stay usable. */
        if (shell) {
          shell.classList.remove('d-none');
          shell.classList.add('d-flex');
        }
        if (editWrap) editWrap.classList.add('d-none');
        if (btnClear) btnClear.disabled = true;
        /* Empty scope: park row actions after shell (same as static HTML; breadcrumb strip stays hidden). */
        if (scopeBreadcrumbRow && scopeRowActs) scopeBreadcrumbRow.appendChild(scopeRowActs);
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
          await applySearchScopeAndRefresh(maxNormFull);
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
      syncStatusBarParentScopeButton();
      renderedScopeBreadcrumbKey = currentScopeBreadcrumbKey();
      refreshTagFoxChromeTooltips(document.getElementById('breadcrumbBar'));
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

    async function createTodoMdInScope() {
      const folder = currentScopeFolderPath();
      const raw = document.getElementById('newMdTitleInput').value.trim();
      const created = await createTodoMdAt(folder, raw, {});
      if (created) document.getElementById('newMdTitleInput').value = '';
      return created;
    }

    function hideQuickTodoPop() {
      const el = document.getElementById('quickTodoPop');
      if (el) el.classList.add('d-none');
      hideQuickTodoTagsPanel();
      hideQuickTodoBodyPanel();
    }

    function showQuickTodoPop() {
      const el = document.getElementById('quickTodoPop');
      if (!el) return;
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
      const folder = hid ? hid.value.trim() : '';
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
      const dn = document.getElementById('propDisplayName');
      if (dn) dn.textContent = '';
      const tt = document.getElementById('propTitleTags');
      if (tt) { tt.innerHTML = ''; tt.classList.add('d-none'); tt.classList.remove('d-flex'); }
      const iconMount = document.getElementById('propTitleIconMount');
      if (iconMount) iconMount.innerHTML = '';
      const secTitle = document.getElementById('propsPanelSectionTitle');
      if (secTitle) { secTitle.textContent = 'Viewer'; secTitle.classList.remove('d-none'); }
      const todoLbl = document.getElementById('labelNewMdTitle');
      if (todoLbl) {
        todoLbl.textContent = 'Add TODO here';
        todoLbl.title = 'Creates Title xkTODO.md in the current folder';
      }
      const readmeStem = document.getElementById('readmeFolderDocStemInput');
      const readmeExt = document.getElementById('readmeFolderDocExt');
      if (readmeStem) readmeStem.value = DEFAULT_FOLDER_DOC_STEM;
      if (readmeExt) readmeExt.textContent = '.md';
      folderDocMdTags = [];
      syncFolderDocTagPillsDisplay();
      folderDocViewerOverridePath = null;
      folderDocHeaderLastSyncedKey = '';
      activeReadmePath = null;
      readmeSaveTargetVerifiedOnDisk = false;
      lastReadmeFolderPathLoose = '';
      globalNestedReadmeView = false;
      const single = document.getElementById('optViewerDocSingle');
      const nested = document.getElementById('optViewerDocNested');
      if (single) single.checked = true;
      if (nested) nested.checked = false;
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
          (globalNestedReadmeView &&
            isGlobalViewerMarkdownFilePath(pathForSig) &&
            (!lastReadmeFolderPathLoose || aggK !== lastReadmeFolderPathLoose));
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
      const isFolder = rowIsFolder(propRow);
      const secTitle = document.getElementById('propsPanelSectionTitle');
      if (secTitle) {
        secTitle.textContent = isFolder ? 'View/edit text files in folder' : 'Viewer';
        // File: the filename already labels the panel, so hide the "Viewer" word; folder: keep the label.
        secTitle.classList.toggle('d-none', !isFolder);
      }
      const todoLbl = document.getElementById('labelNewMdTitle');
      if (todoLbl) {
        if (isFolder) {
          todoLbl.textContent = 'Add TODO here';
          todoLbl.title = 'Creates Title xkTODO.md in the current folder';
        } else {
          const par = T.parentDir(propPath);
          const leaf = segmentPretty(T.baseName(String(par || '').replace(/[/\\]+$/, '')));
          todoLbl.textContent = leaf ? 'Add TODO in ' + leaf : 'Add TODO here';
          todoLbl.title = 'Creates Title xkTODO.md in ' + (leaf ? leaf : 'this folder');
        }
      }
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
      if (isSameFolderReadme) propPh.classList.add('d-none');
      else {
        propPh.classList.remove('d-none');
        propPh.textContent = 'Loading preview…';
      }

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
      const editableTextKind = !rowIsFolder(targetRow) ? editableTextKindForBase(base) : null;

      propPh.classList.add('d-none');

      if (rowIsFolder(targetRow)) {
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        await loadReadmeForFolder(targetFp, targetFp);
        return;
      }

      if (isGlobalViewerMarkdownFilePath(targetFp) && globalNestedReadmeView) {
        const par = T.parentDir(targetFp);
        if (!par) {
          activeReadmePath = null;
          activeMdPath = null;
          mdAutosaveTargetPath = null;
          propPh.classList.remove('d-none');
          propPh.textContent = 'No parent folder for nested docs.';
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
        const titleEl = document.getElementById('mdFileTitle');
        if (titleEl) titleEl.textContent = editableTextKind.markdown ? 'Markdown file' : 'Text file';
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
        const rTxt = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (rTxt.ok) {
          setViewerMdValue('mdFile', rTxt.text);
          mdAutosaveTargetPath = targetFp;
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

      if ((ext === 'html' || ext === 'htm') && window.tagBrowser.readTextFile) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        const htmlBlock = document.getElementById('htmlBlock');
        const htmlPreviewFrame = document.getElementById('htmlPreviewFrame');
        const sz = rowSizeBytes(targetRow);
        if (sz != null && sz > TEXT_PREVIEW_MAX_BYTES) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'HTML preview: file too large (max ~2 MB). Use Open.';
          return;
        }
        const rHtml = await window.tagBrowser.readTextFile({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!htmlBlock || !htmlPreviewFrame) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'HTML preview UI missing.';
          return;
        }
        if (!rHtml.ok) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'HTML: ' + (rHtml.error || 'Could not load.');
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
        document.getElementById('officeTitle').textContent = ext === 'ods' ? 'Calc (ODS)' : 'Excel';
        const prev = document.getElementById('officePreview');
        prev.innerHTML = '<p class="text-muted small mb-0">Loading…</p>';
        const r = await window.tagBrowser.readFileBuffer({ fullPath: targetFp, maxBytes: SPREADSHEET_PREVIEW_MAX_BYTES });
        if (!propsViewStill(targetFp)) return;
        if (!r.ok) {
          propPh.classList.remove('d-none');
          propPh.textContent = String(r.error || 'Could not load.');
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

      if (ext === 'odp' && window.tagBrowser.readFileBuffer) {
        activeReadmePath = null;
        activeMdPath = null;
        mdAutosaveTargetPath = null;
        officeBlock.classList.remove('d-none');
        document.getElementById('officeTitle').textContent = 'Impress (ODP)';
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
          propPh.classList.remove('d-none');
          propPh.textContent = 'MSG preview: file too large (max 50 MB). Use Open.';
          return;
        }
        const rMsg = await window.tagBrowser.readMsgPreview({ fullPath: targetFp });
        if (!propsViewStill(targetFp)) return;
        if (!rMsg.ok) {
          propPh.classList.remove('d-none');
          propPh.textContent = 'Outlook MSG: ' + (rMsg.error || 'Could not load.');
          return;
        }
        textFileBlock.classList.remove('d-none');
        document.getElementById('textPreviewTitle').textContent = 'Outlook (.msg)';
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

    function syncMdFileViewerButtons() {
      const block = document.getElementById('mdFileBlock');
      const visible = !!(block && !block.classList.contains('d-none'));
      const text = getViewerMdValue('mdFile');
      const copyBtn = document.getElementById('btnMdFileCopyText');
      const refreshBtn = document.getElementById('btnMdFileRefresh');
      if (copyBtn) copyBtn.disabled = !visible || !text.length;
      if (refreshBtn) refreshBtn.disabled = !visible || !propsTargetPath();
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

    async function copyMdFileViewerText() {
      const text = getViewerMdValue('mdFile');
      if (!text.length) return;
      const ok = await copyPlainTextToClipboard(text);
      setStatusMain(ok ? 'Copied file text.' : 'Could not copy file text.');
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
      syncViewerCopyButton();
      if (!pulse || !filled) return;
      prev.classList.remove('readme-preview--pulse');
      void prev.offsetWidth;
      prev.classList.add('readme-preview--pulse');
      prev.addEventListener('animationend', () => prev.classList.remove('readme-preview--pulse'), { once: true });
    }

    /** Folder doc + text-file viewer: editor hidden until Edit or double-click preview (same chrome for both). */
    function resetViewerDocEditorChrome() {
      for (const which of ['readme', 'mdFile']) {
        const wrapId = which === 'readme' ? 'readmeEditorWrap' : 'mdFileEditorWrap';
        const dividerId = which === 'readme' ? 'readmeEditorDivider' : 'mdFileEditorDivider';
        const btnId = which === 'readme' ? 'btnReadmeEdit' : 'btnMdFileEdit';
        document.getElementById(wrapId)?.classList.add('d-none');
        document.getElementById(dividerId)?.classList.add('d-none');
        const b = document.getElementById(btnId);
        if (b) {
          b.setAttribute('aria-expanded', 'false');
          b.title = which === 'readme' ? 'Edit folder doc' : 'Edit file';
          b.setAttribute('aria-label', which === 'readme' ? 'Edit folder doc' : 'Edit file');
          if (which === 'readme') {
            b.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
            b.classList.remove('btn-primary', 'btn-outline-primary');
            b.classList.add('btn-outline-secondary');
            document.getElementById('btnReadmeCancel')?.classList.add('d-none');
          } else {
            b.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
          }
        }
      }
      refreshTagFoxChromeTooltips(document.getElementById('propsChromeStack') || document.body);
    }

    function setViewerDocEditorOpen(which, open) {
      const wrapId = which === 'readme' ? 'readmeEditorWrap' : 'mdFileEditorWrap';
      const dividerId = which === 'readme' ? 'readmeEditorDivider' : 'mdFileEditorDivider';
      const prevId = which === 'readme' ? 'readmePreview' : 'mdFilePreview';
      const btnId = which === 'readme' ? 'btnReadmeEdit' : 'btnMdFileEdit';
      const cancelBtn = which === 'readme' ? document.getElementById('btnReadmeCancel') : null;
      const wrap = document.getElementById(wrapId);
      const divider = document.getElementById(dividerId);
      const prev = document.getElementById(prevId);
      const btn = document.getElementById(btnId);
      if (!wrap || !prev) return;
      const show = !!open;
      if (show && which === 'readme' && globalNestedReadmeView) return;
      if (!show && which === 'mdFile') void flushMdFileAutosave();
      wrap.classList.toggle('d-none', !show);
      if (divider) divider.classList.toggle('d-none', !show);
      if (show) ensureViewerMdEditor(which);
      if (btn) {
        btn.setAttribute('aria-expanded', show ? 'true' : 'false');
        if (which === 'readme') {
          btn.innerHTML = show
            ? '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
          btn.classList.toggle('btn-outline-primary', show);
          btn.classList.toggle('btn-outline-secondary', !show);
          btn.title = show ? 'Save folder doc to disk and close editor (Ctrl+Enter)' : 'Edit folder doc';
          btn.setAttribute('aria-label', show ? 'Save folder doc' : 'Edit folder doc');
        } else {
          btn.innerHTML = show
            ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
          btn.classList.remove('btn-outline-primary');
          btn.classList.add('btn-outline-secondary');
          btn.title = show ? 'Close editor (pending edits are saved automatically)' : 'Edit file';
          btn.setAttribute('aria-label', show ? 'Close editor' : 'Edit file');
        }
      }
      if (cancelBtn) cancelBtn.classList.toggle('d-none', !show);
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
      const wrap = document.getElementById('readmeFolderDocControlsWrap');
      const single = document.getElementById('optViewerDocSingle');
      const nested = document.getElementById('optViewerDocNested');
      const prev = document.getElementById('readmePreview');
      if (single) single.checked = !globalNestedReadmeView;
      if (nested) nested.checked = globalNestedReadmeView;
      if (wrap) wrap.classList.toggle('d-none', globalNestedReadmeView);
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
        folderDocViewerOverridePath = null;
        folderDocHeaderLastSyncedKey = '';
        activeReadmePath = null;
        readmeSaveTargetVerifiedOnDisk = false;
      }

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
      const statusEl = document.getElementById('statusMain');
      const { baseUrl, httpUser, httpPassword } = readEverythingConnection();
      const mr = Math.max(1, parseInt(document.getElementById('maxResults').value, 10) || 60);
      const countCap = Math.min(50000, Math.max(5000, mr));
      const ui = searchOptionsFromUI();
      // r=1: a space or path sep before any family prefix (xk/xp/xx/xd) so only tag tokens match.
      const bracketDiscoveryQuery = '[ \\\\]x[kpxd]';
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
        if (statusEl) setStatusMain('Tag scan failed: ' + (res.error || 'unknown error'));
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
          setStatusMain('Tag scan: ' + n + ' path(s) with xk/xp/xx tags (full index).' + extra);
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

    /** One (?i)regex:… clause matching the `xk<tag>` token (same as rowHasTag / pathHasTag). */
    function tagKeyToEverythingBracketRegex(lowerKey) {
      const t = String(lowerKey || '').trim().toLowerCase();
      if (!t) return '';
      let inner = t.replace(/[|*?()<>]/g, '');
      if (!inner) inner = t.replace(/[^a-z0-9_-]/gi, '');
      if (!inner) return '';
      // Match the exact on-disk casing: lowercase family prefix + uppercase body. Tag bodies are
      // always uppercase, so this matches whether or not Match Case is on, without relying on an
      // inline (?i) flag (which Everything's regex does not always honour).
      const esc = escapeEverythingRegexFragment(inner.toUpperCase());
      // Use \s, never a literal space: a real space inside an inline `regex:` term makes Everything
      // split it into two terms, which silently breaks the filter. Boundary before the family prefix,
      // then the tag as a whole token anchored to the leaf segment (boundary then non-backslash to
      // end, or end) so a tagged parent folder does not match.
      return '[\\s\\\\]' + T.prefixForTag(inner) + esc + '(?:[\\s.][^\\\\]*)?$';
    }

    /** Narrow Everything: AND (space) or OR (|) of regex: clauses per active tag. Only positive (include) tags
     *  narrow the server query; negation is applied by the client filter. In OR mode a negative term matches
     *  rows that merely LACK a tag, so Everything cannot pre-narrow safely — send no tag clause and let the
     *  client filter do it all. In AND mode, narrowing by the positives is always a correct superset. */
    function appendActiveTagToEverythingQuery(searchText) {
      if (!activeTagKeys.size) return searchText;
      let out = String(searchText || '').trim();
      const anyNegative = [...activeTagKeys].some((k) => excludedTagKeys.has(k));
      if (tagFilterCombineOr && anyNegative) return out;
      const res = [...activeTagKeys]
        .filter((k) => !excludedTagKeys.has(k))
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

    /** Size column: accent by magnitude (Everything gives size for many folder rows too; synthetic tree folders stay —). */
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

        function paneScopeFolderForDrop() {
          const s = activeTab() && activeTab().searchState;
          const paneRoot = normalizeFolderPathForEverything(String((s && s.rootFolder) || '').trim());
          if (paneRoot) return paneRoot;
          return currentScopeFolderPath();
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
          const scopeDest = paneScopeFolderForDrop();
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
          const scopeDest = paneScopeFolderForDrop();
          if (!scopeDest) {
            setStatusMain('Set the current folder (breadcrumb or path editor) to drop into the list.');
            return;
          }
          await applyInternalPathsDrop(scopeDest, paths, e.shiftKey ? 'copy' : 'move');
        });
      }
    }

    /** Breadcrumb + favourite folder pills: drop rows/Shelf/files to move (Shift = copy) into that folder. */
    let folderPathDropTargetBarsBound = false;
    function bindFolderPathDropTargetBarsOnce() {
      if (folderPathDropTargetBarsBound) return;
      folderPathDropTargetBarsBound = true;

      const barIds = ['breadcrumbBar', 'favFoldersBar', 'favRecentFoldersBar', 'favRecentFilesBar'];
      for (const id of barIds) {
        const bar = document.getElementById(id);
        if (!bar || bar.dataset.folderPathDropBound === '1') continue;
        bar.dataset.folderPathDropBound = '1';

        function clearBarPathDragOver() {
          bar.querySelectorAll('[data-drop-path].results-drag-over').forEach((n) => n.classList.remove('results-drag-over'));
        }

        const isFavFoldersBar = bar.id === 'favFoldersBar';

        bar.addEventListener('dragover', (e) => {
          const favFolderInsertPath = isFavFoldersBar ? getDataTransferFavouriteFolder(e.dataTransfer) : '';
          if (favFolderInsertPath) {
            if (bar.dataset.tagfoxGapsInjected !== '1') injectFavBarDropGaps(bar);
            const hasFavRows = !!bar.querySelector(':scope > .tagfox-fav-chip-row');
            /* Gaps are narrow; “between pills” usually hits the chip row, not .tagfox-fav-drop-gap — use pointer vs main pill only. */
            let overPillGo = null;
            if (e.target.closest) {
              const g = e.target.closest('.fav-folder-chip-go');
              if (g && bar.contains(g)) overPillGo = g;
            }
            if (hasFavRows && overPillGo) {
              clearFavBarDropGaps(bar);
              /* fall through: highlight pill for move/copy into that folder */
            } else {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              clearBarPathDragOver();
              const gapIdx = favGapIndexFromBarPointer(bar, e.clientX, e.clientY, e);
              setActiveFavDropGap(bar, gapIdx);
              return;
            }
          }
          if (isFavFoldersBar) clearFavBarDropGaps(bar);
          /* Reorder-only drag has no x-tagbrowser-paths / files — don't let a stuck favListDragKind block row→folder drops. */
          if (
            isFavFoldersBar &&
            favListDragKind === 'folder' &&
            !dataTransferHasTagBrowserOrFiles(e.dataTransfer)
          ) {
            clearBarPathDragOver();
            return;
          }
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
          const favFolderInsertPath = isFavFoldersBar ? getDataTransferFavouriteFolder(e.dataTransfer) : '';
          if (favFolderInsertPath) {
            const hasFavRows = !!bar.querySelector(':scope > .tagfox-fav-chip-row');
            let overPillGo = null;
            if (e.target.closest) {
              const g = e.target.closest('.fav-folder-chip-go');
              if (g && bar.contains(g)) overPillGo = g;
            }
            if (!hasFavRows || !overPillGo) {
              e.preventDefault();
              e.stopPropagation();
              clearBarPathDragOver();
              const gapIdx = favGapIndexFromBarPointer(bar, e.clientX, e.clientY, e);
              clearFavBarDropGaps(bar);
              if (!Number.isFinite(gapIdx)) return;
              const r = upsertFavouriteFolderAtGap(favFolderInsertPath, gapIdx);
              if (!r.changed) return;
              setStatusMain(r.existed ? 'Favourite folders reordered.' : 'Favourite folder saved.');
              return;
            }
            clearFavBarDropGaps(bar);
          }
          if (isFavFoldersBar) clearFavBarDropGaps(bar);
          if (
            isFavFoldersBar &&
            favListDragKind === 'folder' &&
            !dataTransferHasTagBrowserOrFiles(e.dataTransfer)
          ) {
            clearBarPathDragOver();
            return;
          }
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
        'The shelf is temporary storage, like a clipboard. Drag files or folders to and from it (to move not copy, press shift while dragging). To drag things ourside TagFox, press the hand button first or use Alt+drag.';
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
        chip.textContent = ent.name;
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
        rm.title = 'Remove this item from Shelf';
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

    /** Clamp fixed #bulkBar inside the viewport (after layout). */
    function positionBulkBarFloat(clientX, clientY) {
      const bar = document.getElementById('bulkBar');
      if (!bar || bar.classList.contains('d-none')) return;
      const pad = 10;
      let x = clientX + pad;
      let y = clientY + pad;
      bar.style.left = x + 'px';
      bar.style.top = y + 'px';
      const w = bar.offsetWidth;
      const h = bar.offsetHeight;
      const maxLeft = Math.max(4, window.innerWidth - w - 4);
      const maxTop = Math.max(4, window.innerHeight - h - 4);
      const nx = Math.min(Math.max(4, x), maxLeft);
      const ny = Math.min(Math.max(4, y), maxTop);
      if (nx !== x || ny !== y) {
        bar.style.left = nx + 'px';
        bar.style.top = ny + 'px';
      }
    }

    /** True if pointer is in an expanded box around the visible bar (crossing empty space from row → buttons). */
    function pointerNearBulkBar(clientX, clientY) {
      const bar = document.getElementById('bulkBar');
      if (!bar || bar.classList.contains('d-none')) return false;
      const r = bar.getBoundingClientRect();
      const pad = 72;
      return (
        clientX >= r.left - pad &&
        clientX <= r.right + pad &&
        clientY >= r.top - pad &&
        clientY <= r.bottom + pad
      );
    }

    /** After selection changes: if pointer is already over a checked row (or the bar), show/update without moving the mouse. */
    function bulkBarSyncFloatFromLastPointer() {
      if (!checkedPathsMap.size) return;
      const bar = document.getElementById('bulkBar');
      if (!bar) return;
      const x = lastPointerClientX;
      const y = lastPointerClientY;
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      if (el.closest && el.closest('#bulkBar')) {
        const lbl = document.getElementById('bulkBarLabel');
        if (lbl) lbl.textContent = checkedPathsMap.size + ' selected:';
        bar.classList.remove('d-none');
        bar.setAttribute('aria-hidden', 'false');
        return;
      }
      const tr = el.closest && el.closest('#resultsTable tbody tr');
      const fp = tr && tr.dataset && tr.dataset.rowPath ? String(tr.dataset.rowPath) : '';
      if (fp && isCheckedPath(fp)) {
        const lbl = document.getElementById('bulkBarLabel');
        if (lbl) lbl.textContent = checkedPathsMap.size + ' selected:';
        bar.classList.remove('d-none');
        bar.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => positionBulkBarFloat(x, y));
      }
    }

    /** Show bar near cursor on checked rows; keep visible while pointer is over #bulkBar. */
    function onBulkBarPointerMove(e) {
      if (!checkedPathsMap.size) return;
      const bar = document.getElementById('bulkBar');
      if (!bar) return;
      if (e.target.closest && e.target.closest('#bulkBar')) return;
      const tr = e.target.closest && e.target.closest('#resultsTable tbody tr');
      const fp = tr && tr.dataset && tr.dataset.rowPath ? String(tr.dataset.rowPath) : '';
      if (fp && isCheckedPath(fp)) {
        const lbl = document.getElementById('bulkBarLabel');
        if (lbl) lbl.textContent = checkedPathsMap.size + ' selected:';
        bar.classList.remove('d-none');
        bar.setAttribute('aria-hidden', 'false');
        positionBulkBarFloat(e.clientX, e.clientY);
      } else if (pointerNearBulkBar(e.clientX, e.clientY)) {
        return;
      } else {
        bar.classList.add('d-none');
        bar.setAttribute('aria-hidden', 'true');
      }
    }

    function syncBulkBarPointerTracking() {
      if (checkedPathsMap.size > 0) {
        if (!bulkBarPointerBound) {
          document.addEventListener('pointermove', onBulkBarPointerMove, true);
          bulkBarPointerBound = true;
        }
      } else if (bulkBarPointerBound) {
        document.removeEventListener('pointermove', onBulkBarPointerMove, true);
        bulkBarPointerBound = false;
      }
    }

    function updateBulkBar() {
      const n = checkedPathsMap.size;
      const bar = document.getElementById('bulkBar');
      if (!bar) return;
      const lbl = document.getElementById('bulkBarLabel');
      if (lbl) lbl.textContent = n + ' selected:';
      if (!n) {
        bar.classList.add('d-none');
        bar.setAttribute('aria-hidden', 'true');
        syncBulkBarPointerTracking();
        return;
      }
      bar.classList.add('d-none');
      bar.setAttribute('aria-hidden', 'true');
      syncBulkBarPointerTracking();
      bulkBarSyncFloatFromLastPointer();
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
      updateSelectAllCheckboxState();
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
      updateSelectAllCheckboxState();
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

    function googleDriveDebugSharedDrivesPathForScope(fullPath) {
      const L = googleDriveDebugRootLetter(fullPath);
      if (!L) return '';
      return `${L}:\\Shared drives`;
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
      const oneShot = !!searchDebugNextScopedProbe;
      searchDebugNextScopedProbe = false;
      const normRoot = normalizeFolderPathForEverything(String(rootFolder || '').trim());
      const gdRootLetter = googleDriveDebugRootLetter(normRoot);
      const sharedDrivesPath = googleDriveDebugSharedDrivesPathForScope(normRoot);
      if (!normRoot) {
        if (oneShot) searchDebugLog('scope.debug.skip', { runId, reason: 'noRootFolder' });
        return;
      }
      const shortcutPath = searchDebugPathLooksLikeShortcutTargets(normRoot);
      if (!oneShot && !shortcutPath && currentRowsLen > 0) return;
      const plainBrowseOnly = !String(query || '').trim() && activeTagKeys.size === 0 && recencyFilterMode() === 'all';
      searchDebugLog('scope.debug.begin', {
        runId,
        oneShot,
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
      if (oneShot && sharedDrivesPath && window.tagBrowser && typeof window.tagBrowser.debugFolderSnapshot === 'function') {
        try {
          const sharedSnap = await window.tagBrowser.debugFolderSnapshot({ folderPath: sharedDrivesPath });
          if (runId !== searchRunSeq) return;
          searchDebugLog('scope.debug.sharedDrivesSnapshot', sharedSnap);
        } catch (e) {
          if (runId !== searchRunSeq) return;
          searchDebugLog('scope.debug.sharedDrivesSnapshotError', { err: String(e && e.message ? e.message : e) });
        }
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
      if (oneShot && sharedDrivesPath && pathNormKey(sharedDrivesPath) !== pathNormKey(cleanRoot)) {
        const sharedVariants = [
          {
            label: 'sharedDrives_treeQuotedTrailingSlash_p1',
            searchText: (searchDebugQuotedTreeToken(sharedDrivesPath, true) + suffix).trim(),
            options: { ...currentOptions, pathSearch: true, offset: 0 },
          },
          {
            label: 'sharedDrives_treeQuotedNoTrailingSlash_p1',
            searchText: (searchDebugQuotedTreeToken(sharedDrivesPath, false) + suffix).trim(),
            options: { ...currentOptions, pathSearch: true, offset: 0 },
          },
        ];
        for (const variant of sharedVariants) {
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
      if (T && T.isDateTag && T.isDateTag(k)) return; // deadlines have their own filter, not tag-bar pills
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
        if (T && T.isDateTag && T.isDateTag(k)) continue; // deadlines have their own filter, not tag-bar pills
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
      document.getElementById('optPath').checked = localStorage.getItem(LS.optPath) === '1';
      document.getElementById('optDiacritics').checked = localStorage.getItem(LS.optDiacritics) === '1';
      document.getElementById('optHideSpecial').checked = localStorage.getItem(LS.optHideSpecial) === '1';
      document.getElementById('optHideTilde').checked = localStorage.getItem(LS.optHideTilde) === '1';
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
      /* Recency is a "right now" filter: always launch at All rather than restoring a persisted time window.
         A stale 1h/1d would otherwise silently cap every search after a restart (looks like search is broken). */
      setRecencyFilterMode('all');
      restoreDeadlineFilter();
      sortColumn = localStorage.getItem(LS.sortBy) || 'name';
      if (sortColumn === 'ext') sortColumn = 'name';
      if (!['name', 'path', 'date_modified', 'size'].includes(sortColumn)) sortColumn = 'name';
      sortAsc = localStorage.getItem(LS.optAsc) !== '0';
      applyNaturalSortWhenTreeViewOn();
      document.getElementById('optTreeFolding').checked = localStorage.getItem(LS.treeFolding) !== '0';
      document.getElementById('optTreeGroupHL').checked = localStorage.getItem(LS.treeGroupHighlight) !== '0';
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
      {
        collapsedFolderPaths.clear();
        try {
          const arr = JSON.parse(localStorage.getItem(LS.collapsedFolders) || '[]');
          if (Array.isArray(arr)) for (const p of arr) collapsedFolderPaths.add(p);
        } catch (_) { /* ignore bad JSON */ }
      }
      activeTagKeys = activeTagKeysFromStored(localStorage.getItem(LS.activeTagFilter));
      // Excluded ⊆ active (drop any stale exclusion whose tag is no longer an active filter).
      excludedTagKeys = new Set([...activeTagKeysFromStored(localStorage.getItem(LS.excludedTagFilter))].filter((k) => activeTagKeys.has(k)));
      tagFilterCombineOr = localStorage.getItem(LS.tagFilterCombineOr) === '1';
      tagBarShowAll = localStorage.getItem(LS.tagBarShowAll) === '1';
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
      syncGlobalViewerBasenamesInputFromStorage();
      syncAutoRefreshTimer();
      searchDebugRender();
      void refreshGlobalToggleHotkeyFromMain();
      void refreshQuickTodoHotkeyFromMain();
      renderQuickTodoFolderUi();
      syncAdvancedSearchIconFilledState();
    }

    function saveSettings() {
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
      localStorage.setItem(LS.resultsLayout, resultsLayoutFromUi());
      localStorage.setItem(LS.resultsContent, resultsContentMode());
      localStorage.setItem(LS.flatView, isFlatView() ? '1' : '0');
      localStorage.setItem(LS.showSubfolders, isShowSubfolders() ? '1' : '0');
      localStorage.setItem(LS.hideFiles, isFoldersOnly() ? '1' : '0');
      localStorage.setItem(LS.treeView, isFlatView() ? '0' : '1');
      /* Recency intentionally not persisted (see loadSettings): it always launches at All. */
      localStorage.setItem(LS.sortBy, sortColumn);
      localStorage.setItem(LS.optAsc, sortAsc ? '1' : '0');
      localStorage.setItem(LS.treeFolding, document.getElementById('optTreeFolding').checked ? '1' : '0');
      localStorage.setItem(LS.treeGroupHighlight, document.getElementById('optTreeGroupHL').checked ? '1' : '0');
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

    /** Append one line and trim buffer (shared by searchDebugLog + console mirror). */
    function searchDebugAppend(line) {
      searchDebugLines.push(line);
      if (searchDebugLines.length > SEARCH_DEBUG_MAX) {
        searchDebugLines = searchDebugLines.slice(searchDebugLines.length - SEARCH_DEBUG_MAX);
      }
      searchDebugRender();
    }

    function syncSearchDebugTestCycleBtn() {
      const b = document.getElementById('btnSearchDebugTestCycle');
      if (!b) return;
      b.textContent = searchDebugTestAwaitingCopy ? 'Copy dbg' : 'New dbg';
      b.title = searchDebugTestAwaitingCopy
        ? 'Step 2: copy search debug log to the clipboard'
        : 'Step 1: turn on logging if needed, clear log, then capture — same as Clear log';
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
    /** Log any renderer main-thread long task (jank), e.g. a big sort or full table re-render, to the debug buffer. */
    function installLongTaskMonitor() {
      if (typeof PerformanceObserver !== 'function') return;
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const ms = Math.round(e.duration);
            if (ms >= PERF_SLOW_MS) searchDebugLog('perf.longtask', { ms });
          }
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch (_) {}
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
        syncAdvancedSearchIconFilledState();
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
      add(['md', 'markdown', 'mdown'], 'text', '#0969da', 'Markdown');
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
    /** Cap so a long browsing session does not retain unbounded data URLs. value null = tried, no thumbnail. */
    const THUMBNAIL_CACHE_MAX = 2000;
    const thumbnailCache = new Map();

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
    /** One shell call per (path, mtime, px); null cached so a missing provider is not retried. */
    async function fetchThumbnail(fp, key, px) {
      if (thumbnailCache.has(key)) return thumbnailCache.get(key);
      let dataUrl = null;
      try {
        const r = await perfTimeAsync('getThumbnail', { path: fp, px }, () =>
          window.tagBrowser.getThumbnail({ fullPath: fp, size: px })
        );
        if (r && r.ok && r.dataUrl) dataUrl = r.dataUrl;
      } catch (_e) { /* keep glyph */ }
      thumbCacheSet(key, dataUrl);
      return dataUrl;
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
        { rootMargin: '200px' }
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
      if (thumbnailCache.has(key)) {
        applyThumbnail(holder, thumbnailCache.get(key));
        return;
      }
      const obs = ensureThumbObserver();
      if (obs) obs.observe(holder);
      else void loadThumbnail(holder); /* no IntersectionObserver: fall back to eager load */
    }

    /* ---- Hover preview: a larger floating thumbnail while the pointer rests on an eligible row. ---- */
    function isHoverPreviewOn() {
      const el = document.getElementById('optHoverPreview');
      if (el) return !!el.checked;
      return localStorage.getItem(LS.hoverPreview) === '1';
    }
    let hoverPreviewEl = null;
    let hoverPreviewTimer = null;
    let hoverPreviewActiveKey = null;
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
    async function showHoverPreviewFor(fp, key, x, y) {
      const dataUrl = await fetchThumbnail(fp, key, HOVER_PREVIEW_REQ_PX);
      if (hoverPreviewActiveKey !== key || !dataUrl) return;
      const el = ensureHoverPreviewEl();
      const img = el.firstChild;
      const place = () => {
        if (hoverPreviewActiveKey === key) positionHoverPreview(el, x, y);
      };
      img.onload = place;
      img.src = dataUrl;
      place();
    }
    function onResultRowHoverOver(e) {
      if (!isHoverPreviewOn()) return;
      const tr = e.target.closest && e.target.closest('tr[data-thumb-path]');
      if (!tr) return;
      const fp = tr.dataset.thumbPath;
      if (!fp) return;
      const key = thumbKey(fp, tr.dataset.thumbMtime, HOVER_PREVIEW_REQ_PX);
      if (hoverPreviewActiveKey === key) return; /* still on the same row */
      if (hoverPreviewTimer) clearTimeout(hoverPreviewTimer);
      if (hoverPreviewEl && !hoverPreviewEl.classList.contains('d-none')) {
        hoverPreviewEl.classList.add('d-none');
      }
      hoverPreviewActiveKey = key;
      const x = e.clientX;
      const y = e.clientY;
      hoverPreviewTimer = setTimeout(() => void showHoverPreviewFor(fp, key, x, y), HOVER_PREVIEW_DELAY_MS);
    }
    function onResultRowHoverOut(e) {
      const tr = e.target.closest && e.target.closest('tr[data-thumb-path]');
      if (!tr) return;
      const to = e.relatedTarget;
      if (to && tr.contains(to)) return; /* moving within the same row */
      hideHoverPreview();
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
    const DEADLINE_ELEM_ID = {
      overdue: 'optDeadlineOverdue',
      today: 'optDeadlineToday',
      thisweek: 'optDeadlineThisWeek',
      nextweek: 'optDeadlineNextWeek',
    };

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
    /** Deadline dates (xd- bodies) on a row, from its leaf name and row.name. */
    function rowDeadlineDates(r) {
      const seen = new Set();
      const collect = (name) => {
        for (const t of T.parseSegmentTags(String(name || '')).tags) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(t)) seen.add(t);
        }
      };
      collect(T.baseName(fullPathForRow(r) || ''));
      collect(r && r.name);
      return [...seen];
    }
    function deadlineFilterActive() {
      return !!activeDeadlineRange;
    }
    function syncDeadlineFilterUi() {
      for (const id of DEADLINE_RANGE_IDS) {
        const el = document.getElementById(DEADLINE_ELEM_ID[id]);
        if (el) el.checked = activeDeadlineRange === id;
      }
      const dBtn = document.getElementById('btnToggleDeadline');
      if (dBtn) {
        const active = deadlineFilterActive();
        dBtn.classList.toggle('tagfox-advanced-filled', active);
        const labels = { overdue: 'Overdue', today: 'Today', thisweek: 'This wk', nextweek: 'Next wk' };
        const lbl = active ? labels[activeDeadlineRange] || '' : '';
        dBtn.innerHTML = '<i class="fa-solid fa-calendar-day fa-fw" aria-hidden="true"></i>' + (lbl ? '<span class="ms-1">' + lbl + '</span>' : '');
        dBtn.classList.toggle('tagfox-deadline-toggle--labeled', !!lbl);
      }
    }
    function persistDeadlineFilter() {
      localStorage.setItem(LS_DEADLINE_FILTER, activeDeadlineRange);
    }
    function restoreDeadlineFilter() {
      const v = localStorage.getItem(LS_DEADLINE_FILTER) || '';
      activeDeadlineRange = DEADLINE_RANGE_IDS.includes(v) ? v : '';
      syncDeadlineFilterUi();
    }
    /** Set the active deadline range ('' clears) and re-run the search. */
    function setDeadlineRange(range) {
      activeDeadlineRange = DEADLINE_RANGE_IDS.includes(range) ? range : '';
      persistDeadlineFilter();
      syncDeadlineFilterUi();
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

    /** Same pipeline as filteredRows but before Hide special / Hide ~ (for status hints). */
    function filteredRowsBeforeAdvancedPathHides() {
      let rows = filteredRowsAfterTagsOnly();
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
          rows = rows.filter((r) => !rowIsFolder(r));
        }
      }
      if (deadlineFilterActive()) {
        const b = deadlineRangeBounds();
        rows = rows.filter((r) => rowDeadlineDates(r).some((d) => deadlineDateInActiveRange(d, b)));
      }
      return rows;
    }

    /** Advanced path hides at node level (used for both raw rows and tree display rows). */
    function applyAdvancedPathHides(rowsIn) {
      let rows = Array.isArray(rowsIn) ? rowsIn : [];
      if (isHideSpecialPaths()) {
        rows = rows.filter((r) => !pathUnderHideSpecialSegments(fullPathForRow(r)));
      }
      if (isHideTildePaths()) {
        rows = rows.filter((r) => !pathUnderTildeSegment(fullPathForRow(r)));
      }
      return rows;
    }

    function filteredRows() {
      const baseRows = filteredRowsBeforeAdvancedPathHides();
      return applyAdvancedPathHides(baseRows);
    }

    /** Smart + tree + path A→Z: custom display order only — lastRows stays path-sorted (grouping + selection need that). */
    function shouldReorderRowsForSmartViewTree() {
      return isSmartView() && !isFlatView() && sortColumn === 'path' && sortAsc;
    }

    /**
     * Preorder DFS: folders A→Z, then files by modified desc. Input must be the same row set as lastRows (filtered);
     * never mutates lastRows — only reorders refs for buildPathGroupedDisplayRows so synthetics stay consistent.
     */
    function orderRowsForSmartViewTreeDisplay(rows) {
      const arr = Array.isArray(rows) ? rows : [];
      if (!arr.length || !shouldReorderRowsForSmartViewTree()) return arr;
      const byParent = new Map();
      for (const r of arr) {
        const fp = fullPathForRow(r);
        const par = normalizeFolderPathForEverything(String(T.parentDir(fp) || '').trim());
        const pk = pathNormKey(par);
        if (!byParent.has(pk)) byParent.set(pk, []);
        byParent.get(pk).push(r);
      }
      function cmpSibling(a, b) {
        const fa = rowIsFolder(a);
        const fb = rowIsFolder(b);
        if (fa !== fb) return fa ? -1 : 1;
        if (fa) {
          const na = String(T.baseName(fullPathForRow(a)) || '');
          const nb = String(T.baseName(fullPathForRow(b)) || '');
          const c = na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
          if (c !== 0) return c;
          return pathSortKey(a).localeCompare(pathSortKey(b));
        }
        const da = rowModifiedSortKey(a);
        const db = rowModifiedSortKey(b);
        if (db !== da) return db - da;
        return pathSortKey(a).localeCompare(pathSortKey(b));
      }
      for (const kids of byParent.values()) kids.sort(cmpSibling);
      const out = [];
      const visited = new Set();
      function walk(parentKey) {
        const kids = byParent.get(parentKey) || [];
        for (const r of kids) {
          const k = pathNormKey(fullPathForRow(r));
          if (!k || visited.has(k)) continue;
          visited.add(k);
          out.push(r);
          if (rowIsFolder(r)) walk(k);
        }
      }
      const scope = currentScopeFolderPath();
      const scopeKey = scope ? pathNormKey(normalizeFolderPathForEverything(scope)) : '';
      const pathKeys = new Set(arr.map((r) => pathNormKey(fullPathForRow(r))).filter(Boolean));
      if (scopeKey) {
        walk(scopeKey);
      } else {
        const roots = [];
        for (const pk of byParent.keys()) {
          if (!pathKeys.has(pk)) roots.push(pk);
        }
        roots.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        for (const pk of roots) walk(pk);
      }
      if (out.length < arr.length) {
        const rest = arr.filter((r) => !visited.has(pathNormKey(fullPathForRow(r))));
        rest.sort((a, b) => pathSortKey(a).localeCompare(pathSortKey(b)));
        out.push(...rest);
      }
      return out;
    }

    /** Visible rows in the table UI (includes synthetic folder rows in path-group mode). */
    function listRowsForUi() {
      const baseRows = filteredRowsBeforeAdvancedPathHides();
      const forTree = orderRowsForSmartViewTreeDisplay(baseRows);
      const treeRows = buildPathGroupedDisplayRows(forTree);
      return applyAdvancedPathHides(treeRows);
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

    /** Recency segmented control (tag toolbar, RHS); target for zero-row pulse when a bucket other than All is active. */
    function recencyFilterGroupEl() {
      return document.querySelector('.tagfox-search-opts-rhs [aria-label="Recency"]');
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
      [document.querySelector('label[for="optHideSpecial"]'), document.querySelector('label[for="optHideTilde"]')].forEach((el) => {
        el?.classList.remove('pulse-hint', 'pulse-hint--sparse');
        el?.style.removeProperty('--empty-pulse-frac');
      });
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
      const hideSpecialBtn = document.querySelector('label[for="optHideSpecial"]');
      const hideTildeBtn = document.querySelector('label[for="optHideTilde"]');
      const wantHideSpecial = isEmpty && !!document.getElementById('optHideSpecial')?.checked;
      const wantHideTilde = isEmpty && !!document.getElementById('optHideTilde')?.checked;
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
        restartPulseHint(hideSpecialBtn, wantHideSpecial, mode, sparseFrac);
        restartPulseHint(hideTildeBtn, wantHideTilde, mode, sparseFrac);
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
      toggleRvPulse(hideSpecialBtn, wantHideSpecial);
      toggleRvPulse(hideTildeBtn, wantHideTilde);
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
      return perfTimeSync('render.tagBar', { rows: lastRows.length }, renderTagBarImpl);
    }
    function renderTagBarImpl() {
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
          'Re-run the main Everything search, then a full-index xk/xp/xx tag scan. Prunes remembered or active tag filters that do not appear in that scan. (Ordinary searches do not run this scan — use this when the tag bar is stale.)';
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
      const isDateKey = (k) => !!(T && T.isDateTag && T.isDateTag(k));
      for (const t of knownBracketTagsList) {
        if (!t || !t.key) continue;
        if (isDateKey(t.key)) continue; // deadlines never appear in the tag bar (own range filter)
        pillKeys.add(t.key);
        const hit = counts.get(t.key);
        entries.push({ key: t.key, display: t.display, count: hit ? hit.count : 0 });
      }
      for (const ak of activeTagKeys) {
        if (pillKeys.has(ak)) continue;
        if (isDateKey(ak)) continue;
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
          'No tags in your list yet. Add one from the tags dialog, toggle a filter, or use Rescan.';
        el.appendChild(s);
        appendRescanAllTags();
        updateEmptyResultsPulseHints(listRowsForUi().length);
        return;
      }
      function appendTagFilterCombineToggle(barEl) {
        const g = document.createElement('div');
        g.className = 'btn-group btn-group-sm tagfox-tag-combine-toggle';
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
      const renderPill = (info) => {
        const key = info.key;
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.tagKey = key;
        const paintPill = () => {
          const on = activeTagKeys.has(key);
          const neg = on && excludedTagKeys.has(key);
          b.className = 'btn btn-sm tag-bar-pill' + (on ? ' tag-bar-pill-active' : '') + (neg ? ' tag-bar-pill-exclude' : '');
          b.style.cssText = '';
          if (neg) applyTagBarPillExcludeStyle(b);
          else applyTagBarPillStyle(b, key);
          const label = (neg ? '¬' : '') + info.display; // ¬ marks a negated (not-tag) filter
          b.textContent = info.count > 0 ? label + ' (' + info.count + ')' : label;
        };
        paintPill();
        b.title = 'Left-click: filter by ' + info.display + '. Right-click: exclude (not ' + info.display + '). Same button again clears.';
        const applyTagFilterChange = (mutate) => {
          mutate();
          // Instant feedback before the async Everything round-trip: recolour the clicked pill and re-filter
          // the already-loaded rows client-side. runSearchNow() then reconciles (may pull more matches).
          paintPill();
          persistActiveTagFilter();
          renderTable();
          void (async () => {
            await runSearchNow();
            commitSearchHistoryNow();
          })();
        };
        // Left-click: include (off or excluded → include; include → off). One search per click.
        b.addEventListener('click', () =>
          applyTagFilterChange(() => {
            if (activeTagKeys.has(key) && !excludedTagKeys.has(key)) {
              activeTagKeys.delete(key);
            } else {
              rememberTag(key, info.display);
              activeTagKeys.add(key);
              excludedTagKeys.delete(key);
            }
          })
        );
        // Right-click: exclude / not-tag (off or included → exclude; exclude → off).
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          applyTagFilterChange(() => {
            if (excludedTagKeys.has(key)) {
              activeTagKeys.delete(key);
              excludedTagKeys.delete(key);
            } else {
              rememberTag(key, info.display);
              activeTagKeys.add(key);
              excludedTagKeys.add(key);
            }
          });
        });
        el.appendChild(b);
      };

      /* Primary tags (TAG_BAR_PRIMARY) always show, in that order; the rest hide behind "More". A hidden
         tag that is currently an active filter still shows, so an active filter is never invisible. */
      const isPrimaryKey = (k) => TAG_BAR_PRIMARY.includes(String(k).toLowerCase());
      const byKey = new Map(entries.map((e) => [e.key, e]));
      const primaryEntries = TAG_BAR_PRIMARY.map((k) => byKey.get(k)).filter(Boolean);
      const secondaryEntries = entries.filter((e) => !isPrimaryKey(e.key));
      const activeSecondary = secondaryEntries.filter((e) => activeTagKeys.has(e.key));
      const hiddenSecondaryCount = secondaryEntries.length - activeSecondary.length;

      primaryEntries.forEach(renderPill);
      (tagBarShowAll ? secondaryEntries : activeSecondary).forEach(renderPill);

      if (secondaryEntries.length > 0 && (tagBarShowAll || hiddenSecondaryCount > 0)) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'btn btn-sm btn-outline-secondary tagfox-tagbar-more flex-shrink-0';
        more.setAttribute('aria-expanded', tagBarShowAll ? 'true' : 'false');
        more.innerHTML = tagBarShowAll
          ? '<i class="fa-solid fa-chevron-left fa-fw" aria-hidden="true"></i> Less'
          : '<i class="fa-solid fa-chevron-right fa-fw" aria-hidden="true"></i> More' + (hiddenSecondaryCount > 0 ? ' (' + hiddenSecondaryCount + ')' : '');
        more.title = tagBarShowAll ? 'Show only the main tags' : 'Show all tags';
        more.addEventListener('click', () => {
          tagBarShowAll = !tagBarShowAll;
          try { localStorage.setItem(LS.tagBarShowAll, tagBarShowAll ? '1' : '0'); } catch (_) {}
          renderTagBar();
        });
        el.appendChild(more);
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
            excludedTagKeys.clear();
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
      } else if (res && res.action === 'editTags') openTagModal(fp);
      else if (res && res.action === 'setCurrentFolder') {
        const target =
          row && rowIsFolder(row) ? normalizeFolderPathForEverything(fullPathForRow(row)) : null;
        if (target) await applySearchScopeAndRefresh(target);
      } else if (res && res.action === 'rename') void renameItemInteractive(fp);
      else if (res && res.action === 'bulkRename') openBulkRenameModal();
      else if (res && res.action === 'trash') void refreshAfterDiskMutation({ paths: fp ? [fp] : [], trashed: true });
    }

    function renderTable() {
      const t0 = performance.now();
      try {
        renderTableImpl();
      } finally {
        const ms = Math.round(performance.now() - t0);
        const dom = document.getElementById('tbody')?.childElementCount || 0;
        if (ms >= PERF_SLOW_MS) searchDebugLog('perf.slow', { label: 'render.table', ms, rows: lastRows.length, dom });
      }
    }
    function renderTableImpl() {
      const tbody = document.getElementById('tbody');
      const status = document.getElementById('statusMain');
      /* Do not clear #statusSmartNote here — e.g. “Big folder!” must survive checkbox/selection redraws. Cleared by setStatusMain, smartAfterPaint, or empty chip. */
      tbody.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
        const tip = bootstrap.Tooltip.getInstance(el);
        if (tip) tip.dispose();
      });
      clearInternalPathDragDropTargetHints();
      resetThumbObserver();
      tbody.innerHTML = '';
      applyGoneTombstonesToLastRows();
      pruneCheckedPaths();
      const rows = filteredRows();
      const rowsForDisplay = listRowsForUi();
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
        /* Default Smart (subs on, all content): redundant with toolbar — omit suffix. */
        if (smart && sub && rcc === 'all') return '';
        const layout = flat ? 'Flat view' : smart ? 'Smart view' : 'Tree view';
        let s = layout;
        if (sub) s += ' with subfolders';
        else s += ', this folder only';
        if (rcc === 'folders') s += ', folders only';
        else if (rcc === 'files') s += ', files only';
        if (!sub && !scopePath) s += ' (set a current folder in Settings for a clearer listing)';
        return s;
      }
      const someRowsHidden = visN < rawN;
      const afterTagsOnlyRows = filteredRowsAfterTagsOnly();
      const beforePathHides = filteredRowsBeforeAdvancedPathHides();
      const hideSpecialDrops = isHideSpecialPaths()
        ? beforePathHides.filter((r) => pathUnderHideSpecialSegments(fullPathForRow(r))).length
        : 0;
      const hideTildeDrops = isHideTildePaths()
        ? beforePathHides.filter((r) => pathUnderTildeSegment(fullPathForRow(r))).length
        : 0;
      const recencyDrop =
        recencyFilterMode() !== 'all'
          ? Math.max(0, afterTagsOnlyRows.length - beforePathHides.length)
          : 0;
      let afterSpecial = beforePathHides;
      if (isHideSpecialPaths()) {
        afterSpecial = beforePathHides.filter((r) => !pathUnderHideSpecialSegments(fullPathForRow(r)));
      }
      const specialDrop = isHideSpecialPaths() ? beforePathHides.length - afterSpecial.length : 0;
      let afterTilde = afterSpecial;
      if (isHideTildePaths()) {
        afterTilde = afterSpecial.filter((r) => !pathUnderTildeSegment(fullPathForRow(r)));
      }
      const tildeDrop = isHideTildePaths() ? afterSpecial.length - afterTilde.length : 0;
      /* Recency status chip only when client pipeline drops rows (Everything-only window may drop 0 here). */
      const recencyNarrows = recencyDrop > 0;
      if (status) {
        let hiddenDueHtml = '';
        if (someRowsHidden) {
          const hiddenN = rawN - visN;
          const parts = [];
          const tagDrop = activeTagKeys.size > 0 ? rawN - afterTagsOnlyRows.length : 0;
          if (tagDrop > 0) parts.push({ icon: 'fa-tags', label: 'Tag filters' });
          if (recencyDrop > 0) parts.push({ icon: 'fa-clock', label: 'Recency' });
          if (specialDrop > 0) parts.push({ icon: 'fa-eye-slash', label: 'Hiding special files/folders' });
          if (tildeDrop > 0) parts.push({ icon: 'fa-eye-slash', label: 'Hiding paths with ~ segment' });
          if (parts.length) hiddenDueHtml = hiddenDueToStatusHtml(hiddenN, parts);
          else {
            hiddenDueHtml =
              '<span class="tagfox-status-hidden-hint">' +
              escStatusHtmlForStatus(hiddenN + ' hidden') +
              '</span>';
          }
        }
        /* Omit “Smart view, …” when #statusSmartNote will say it (pending/cap chip) or chip already visible — avoids “Smart view… · Big folder! Smart View is hiding…”. */
        const smartNoteEl = document.getElementById('statusSmartNote');
        const smartNoteVisible =
          smartNoteEl &&
          !smartNoteEl.classList.contains('d-none') &&
          String(smartNoteEl.textContent || '').trim().length > 0;
        const capStressOmitsViewSuffix =
          isSmartView() &&
          resultsPagingCtx &&
          resultsPagingCtx.mode === 'single' &&
          !!resultsPagingCtx.hasMore &&
          !shouldSuppressCapOnlyBigFolderChip();
        status.innerHTML = formatResultsStatusMainHtml({
          visN,
          rawN,
          tagRecencyHintPlain: !someRowsHidden
            ? tagRecencyStatusFilterHintPlain(activeTagKeys, recencyFilterMode(), recencyNarrows)
            : '',
          hiddenDueHtml,
          showHideSpecialHint: hideSpecialDrops > 0,
          showHideTildeHint: hideTildeDrops > 0,
          omitViewSuffix:
            !!pendingSmartStatusNote || smartNoteVisible || capStressOmitsViewSuffix,
          viewModeSentence: viewModeStatusSentence(),
        });
      }
      const showPathFolderGrouping = shouldShowPathFolderGrouping();
      const showPathTreeGutter = isTreeViewOn() && sortColumn === 'path' && isShowSubfolders();
      const pathTreeDepths = rowsForDisplay.map((r) => pathTreeUiDepth(r, showPathFolderGrouping));
      const pathTreeGutters = showPathTreeGutter ? pathTreeGutterStringsForDepths(pathTreeDepths) : null;
      const treeFoldUi = isTreeFoldUiActive();
      /* Highlight #query in name/path when enabled (Settings). */
      const qTrim = (document.getElementById('query')?.value || '').trim();
      const queryNeedle = isHighlightMatchedNamesOn() && qTrim ? qTrim : null;
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
        chk.title = 'Multi-select: plain row click checks one; Ctrl/Shift for more; bulk actions use checked rows only.';
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
        {
          const nameInner = renderNameCell(row, parsedName, queryNeedle);
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
        fillPathCellBox(
          pathBox,
          collapseGDriveShortcutDisplay(pathColumnDisplayForRow(fp, rowIsFolder(row))),
          queryNeedle
        );
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
        /* Edit online (pen): Drive-resident markdown → gmist; other Drive docs (Office / Google-native) → Google Workspace. */
        let btnGmist = null;
        const gmistOk = !rowIsFolder(row) && rowEligibleForGmist(fp);
        const wsEditOk = !rowIsFolder(row) && !gmistOk && rowEligibleForWorkspaceEdit(fp);
        if (gmistOk || wsEditOk) {
          btnGmist = document.createElement('button');
          btnGmist.type = 'button';
          btnGmist.className =
            'btn btn-sm btn-outline-secondary tagfox-scope-bar-icon-btn d-inline-flex align-items-center justify-content-center';
          btnGmist.title = gmistOk ? 'Open in gmist (Google Drive markdown editor)' : 'Open in Google Workspace (edit online)';
          btnGmist.setAttribute('aria-label', gmistOk ? 'Open in gmist' : 'Open in Google Workspace');
          btnGmist.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>';
          btnGmist.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (gmistOk) await openRowInGmist(fp);
            else await openRowInGoogleWorkspace(fp);
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
        /* Same tag icon as tag toolbar lead (#tagBar row in index.html). */
        btnTags.innerHTML = '<i class="fa-solid fa-tags" aria-hidden="true"></i>';
        btnTags.addEventListener('click', (e) => {
          e.stopPropagation();
          openTagModal(fp);
        });

        tdActInner.appendChild(btnOpen);
        if (btnGmist) tdActInner.appendChild(btnGmist);
        tdActInner.appendChild(btnScopeParent);
        tdActInner.appendChild(btnClip);
        tdActInner.appendChild(btnTags);
        tdActInner.appendChild(btnTerminal);
        tdActInner.appendChild(btnCopyQuoted);
        tdActInner.appendChild(btnMore);
        tdAct.appendChild(tdActInner);

        const sizeStr = formatSize(row.size);
        const dateStr = formatModified(row.date_modified ?? row.date_modified_unix);
        bindCellTooltip(tdName, nameTip);
        bindCellTooltip(tdPath, fp);
        bindCellTooltip(tdSize, sizeStr);
        bindCellTooltip(tdDate, dateStr);
        /* Per-button JS tooltips (same class as breadcrumb chrome), not one mega-tooltip on the cell. */
        refreshTagFoxChromeTooltips(tdActInner, { allowInResultsTable: true });

        tr.appendChild(tdCb);
        tr.appendChild(tdName);
        tr.appendChild(tdPath);
        tr.appendChild(tdAct);
        tr.appendChild(tdSize);
        tr.appendChild(tdDate);

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
            tagBrowserActiveNativeDragPathsAt = Date.now();
            window.tagBrowser.startDragFiles(paths);
            return;
          }
          if (tagBrowserNextOsFileDrag) tagBrowserNextOsFileDrag = false;
          setDataTransferTagBrowserHtml5Paths(e.dataTransfer, paths);
          const favFolderDragPath =
            rowIsFolder(row) && paths.length === 1 && pathNormKey(paths[0]) === pathNormKey(fp)
              ? normalizeFolderPathForEverything(fp)
              : '';
          if (favFolderDragPath) e.dataTransfer.setData(TAG_BROWSER_FAV_FOLDER_DRAG_TYPE, favFolderDragPath);
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
            updateSelectAllCheckboxState();
            syncResultsRowCheckboxStates();
            setSelection(row, fp);
            return;
          }
          if (e.ctrlKey || e.metaKey) {
            clearResultsRowUncheckPending();
            e.preventDefault();
            toggleCheckPath(fp, !isCheckedPath(fp));
            resultsShiftRangeAnchorIdx = null;
            updateSelectAllCheckboxState();
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
      if (tagModalIsNewTodoDraft()) {
        el.textContent = 'New file from Add TODO (tags only; no path yet)';
        return;
      }
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
      // One deadline per file: adding a date drops any existing deadline first (replace, not append).
      if (T.isDateTag && T.isDateTag(raw)) {
        for (let i = modalTags.length - 1; i >= 0; i--) {
          if (T.isDateTag(modalTags[i]) && modalTags[i].toLowerCase() !== low) modalTags.splice(i, 1);
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
            renderTagBar();
            renderTable();
          });
          updateResultsLoadMoreUi();
          clearBigFolderCapSmartNoteIfStale();
        }
      }
    }

    /** Next Everything offset page; same query/sort as resultsPagingCtx.
        opts.deferRender: merge + persist rows but skip the table/tag-bar render (the autofill cascade renders
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
          clearBigFolderCapSmartNoteIfStale();
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
            renderTagBar();
            renderTable();
          });
        }
        updateResultsLoadMoreUi();
        clearBigFolderCapSmartNoteIfStale();
      } finally {
        resultsLoadMoreBusy = false;
        /* loadMore mutates lastRows + resultsPagingCtx; persist them to the active tab or a later tab
           switch (restoreTabStateIntoUi) reverts to the pre-load-more page and the extra rows vanish. */
        if (runId === searchRunSeq) saveActiveTabStateFromUi();
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

    /** Smart auto-narrow chip: one short line from toggles (no jargon). */
    function smartNarrowChipForToggles(subsOn, content) {
      const bits = [];
      if (!subsOn) bits.push('Smart View is hiding subfolders');
      if (content === 'folders') bits.push('Smart View is hiding files');
      if (content === 'files') bits.push('Smart View is hiding folders');
      if (!bits.length) return 'Smart View is using a smaller view.';
      return bits.join('; ') + '.';
    }
    /** Text after “Big folder! ” when cap stress is merged with the auto-narrow note (see smartNarrowChipForToggles). */
    function bigFolderSmartChipNarrowSuffix(narrowNoteText) {
      const t = String(narrowNoteText || '').trim();
      const lower = t.toLowerCase();
      const hasSub = /smart view is hiding subfolders/.test(lower);
      const hasNotFiles = /smart view is hiding files/.test(lower);
      const hasNotFolders = /smart view is hiding folders/.test(lower);
      if (hasSub && hasNotFiles) return 'Smart View is hiding subfolders and files.';
      if (hasSub && hasNotFolders) return 'Smart View is hiding subfolders and folders.';
      if (hasSub) return 'Smart View is hiding subfolders.';
      if (hasNotFiles) return 'Smart View is hiding files.';
      if (hasNotFolders) return 'Smart View is hiding folders.';
      if (t) return t.replace(/\.\s*$/, '') + '.';
      return '';
    }

    /**
     * Smart before-paint: if cap exceeded, either revert a probe or narrow the view, then re-search.
     * Returns true if a re-search was triggered (caller should return without painting).
     */
    async function smartBeforePaint(runId) {
      if (!isSmartView()) return false;
      if (runId !== searchRunSeq) return false;
      if (!resultsPagingCtx || resultsPagingCtx.mode !== 'single' || !resultsPagingCtx.hasMore) return false;

      /* Probe exceeded cap: revert to prior toggles and re-search as smart-narrow. */
      if (smartEvent === 'smart-probe' && smartProbePrior) {
        const prior = smartProbePrior;
        pendingSmartStatusNote = {
          text: smartNarrowChipForToggles(prior.subs, prior.content),
          kind: 'warn',
        };
        applyResultsViewRadiosToDom('smart', prior.subs, prior.content);
        syncViewRadioActiveFromDom();
        saveSettings();
        smartProbePrior = null;
        await runSearchNow('smart-narrow', { keepPendingSmartNote: true, nested: true });
        smartRevertFP = smartOutcomeFingerprint();
        return true;
      }

      /* Identity + plain empty browse only: cap full page ⇒ narrow. If query, tags, or recency filter act on ES, do not impose toggles here. */
      if (smartEvent === 'identity' && !smartSearchShouldStartBroad()) {
        const rootFolder = document.getElementById('rootFolder').value.trim();
        if (isShowSubfolders()) {
          const droppingSubsOk = !lastRows.length || smartScopeHasDirectChildHit(lastRows, rootFolder);
          if (droppingSubsOk) {
            applyResultsViewRadiosToDom('smart', false, resultsContentMode());
            syncViewRadioActiveFromDom();
            saveSettings();
            pendingSmartStatusNote = { text: 'Smart View is hiding subfolders.', kind: 'warn' };
            await runSearchNow('smart-narrow', { keepPendingSmartNote: true, nested: true });
            return true;
          }
        }
        if (!isFilesOnly() && !isFoldersOnly()) {
          applyResultsViewRadiosToDom('smart', isShowSubfolders(), 'folders');
          syncViewRadioActiveFromDom();
          saveSettings();
          pendingSmartStatusNote = { text: 'Smart View is hiding files.', kind: 'warn' };
          await runSearchNow('smart-narrow', { keepPendingSmartNote: true, nested: true });
          return true;
        }
      }

      return false;
    }

    /**
     * Smart after-paint: if the view is narrowed but results are within Max results, probe-widen to full tree.
     * Probe success: chip suppressed — main status line already reflects Smart view + toggles.
     */
    async function smartAfterPaint() {
      smartCapStressBigFolderAfterPaint = false;
      if (!isSmartView()) {
        smartEvent = null;
        smartProbePrior = null;
        smartRevertFP = null;
        clearStatusSmartNote();
        return;
      }
      if (!resultsPagingCtx || resultsPagingCtx.mode !== 'single') return;

      if (smartRevertFP && smartOutcomeFingerprint() !== smartRevertFP) smartRevertFP = null;

      const hasMore = !!resultsPagingCtx.hasMore;

      /* Probe success: main line already shows Smart view + subs; no chip. */
      if (smartEvent === 'smart-probe' && !hasMore) {
        smartProbePrior = null;
        smartRevertFP = null;
        clearStatusSmartNote();
        return;
      }

      /* Cap stress: more hits in Everything than fit this page (incl. after smart-narrow). Chip text merged with pending in runSearch. */
      if (hasMore) {
        smartRevertFP = null;
        smartCapStressBigFolderAfterPaint = true;
        return;
      }

      /* manual / smart-narrow / refresh: no probe-widen below (everything fits one page). */
      if (smartEvent === 'manual' || smartEvent === 'smart-narrow' || smartEvent === 'refresh') return;

      /* All results fit but view is narrowed: probe-widen back to full Smart defaults. */
      if (!isShowSubfolders() || !isAllContent()) {
        const scopeJustChanged = smartRevertFP == null;
        if (!smartSearchShouldStartBroad() && !scopeJustChanged) return;
        if (smartRevertFP && smartOutcomeFingerprint() === smartRevertFP) return;
        smartProbePrior = { subs: isShowSubfolders(), content: resultsContentMode() };
        applyResultsViewRadiosToDom('smart', true, 'all');
        syncViewRadioActiveFromDom();
        saveSettings();
        await runSearchNow('smart-probe', { nested: true });
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

    async function runSearch(eventKind = 'identity', opts = {}) {
      const isNested = topLevelSearchDepth > 0;
      let releaseSearchMutex = null;
      if (!isNested) {
        const prev = searchMutex;
        const next = new Promise((r) => {
          releaseSearchMutex = r;
        });
        searchMutex = next;
        await prev;
      }
      topLevelSearchDepth++;
      try {
      const keepPendingSmartNote = !!opts.keepPendingSmartNote;
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
          const cm = resultsContentMode();
          const keepNarrow = cm === 'files' || cm === 'folders';
          applyResultsViewRadiosToDom(resultsLayoutFromUi(), true, keepNarrow ? cm : 'all');
          syncViewRadioActiveFromDom();
        }
      }
      if (!keepPendingSmartNote) pendingSmartStatusNote = null;
      saveSettings();
      const { baseUrl, httpUser, httpPassword } = readEverythingConnection();
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
      // Deadline range filter: narrow to files carrying any xd- deadline; the exact range is
      // applied client-side (\s, never a literal space, so Everything keeps it as one regex term).
      if (deadlineFilterActive()) searchText = (String(searchText).trim() + ' regex:[\\s\\\\]xd-').trim();
      if (fo) searchText = (String(searchText).trim() + ' folder:').trim();
      else if (fileOnly) searchText = (String(searchText).trim() + ' file: sort-mix:').trim();
      else searchText = (String(searchText).trim() + ' sort-mix:').trim();
      searchText = appendRecencyToEverythingQuery(searchText);
      const cap = parseMaxResultsCap();
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

      setStatusMain(opts && opts.uiHint === 'f5' ? 'F5 — searching…' : 'Searching…');

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
        searchDebugLog('runSearch.error', {
          runId,
          err: res.error || 'Search failed',
          ...(res.debug ? { debug: res.debug } : {}),
        });
        setStatusMain(res.error || 'Search failed');
        maybeShowEverythingHttpHelpBanner(res.error);
        await syncSelectionAfterSearch();
        renderTagBar();
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
      lastRows = got;
      dedupeLastRowsByPathKey(); // Everything can repeat the same path in one page — breaks tree (duplicate siblings).
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
      if (runId === searchRunSeq && (await smartBeforePaint(runId))) return;
      await syncSelectionAfterSearch();
      renderTagBar();
      renderTable();
      pulseEmptyResultHintsAfterSearchOk();
      if (runId === searchRunSeq) await smartAfterPaint();
      if (runId === searchRunSeq) {
        const pending = pendingSmartStatusNote;
        pendingSmartStatusNote = null;
        const cap = smartCapStressBigFolderAfterPaint;
        clearStatusSmartNote();
        const capChip = cap && !shouldSuppressCapOnlyBigFolderChip();
        if (pending || capChip) {
          /* pending: auto-narrow note. capChip: empty-browse page full — not when full Smart + query/tags/recency (normal paging). */
          let text;
          if (pending) {
            const extra = bigFolderSmartChipNarrowSuffix(pending.text);
            text = extra ? 'Big folder! ' + extra : 'Big folder!';
          } else {
            text = 'Big folder!';
          }
          setStatusSmartNote(text, pending ? pending.kind : 'warn');
        } else if (opts && opts.uiHint === 'f5') {
          setStatusMain('Refreshed (F5) — ' + lastRows.length + ' row(s).');
        }
      }
      } finally {
        if (runId === searchRunSeq) searchInFlight = false;
      }
    } finally {
      topLevelSearchDepth--;
      if (!isNested && releaseSearchMutex) releaseSearchMutex();
    }
    }

    function bindResultsDomListeners() {
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
      const resultsThead = document.getElementById('resultsTable')?.querySelector('thead');
      if (resultsThead && resultsThead.dataset.resultsHeadBound !== '1') {
        resultsThead.dataset.resultsHeadBound = '1';
        resultsThead.addEventListener('pointerdown', (e) => {
          const h = e.target.closest('.th-resize');
          if (!h) return;
          if (h.style.display === 'none') return;
          const left = +h.dataset.resizeLeft;
          const right = +h.dataset.resizeRight;
          if (!Number.isFinite(left) || !Number.isFinite(right)) return;
          e.preventDefault();
          e.stopPropagation();
          startTableColResize(e, h, left, right);
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
      }
      const selectAll = document.getElementById('chkSelectAllResults');
      if (selectAll && selectAll.dataset.resultsSelectAllBound !== '1') {
        selectAll.dataset.resultsSelectAllBound = '1';
        selectAll.addEventListener('change', (e) => {
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
      }
    }

    /* Bulk float bar: fresh coords on click + move so updateBulkBar can sync without wiggling the mouse. */
    const recordLastPointerClient = (e) => {
      lastPointerClientX = e.clientX;
      lastPointerClientY = e.clientY;
    };
    document.addEventListener('pointermove', recordLastPointerClient, { passive: true, capture: true });
    document.addEventListener('pointerdown', recordLastPointerClient, { passive: true, capture: true });

    bindResultsDomListeners();

    document.getElementById('query').addEventListener('input', () => {
      syncQueryGhostUi();
      scheduleSearch();
      scheduleSearchHistoryCommit();
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

    document.getElementById('btnSaveFavouriteFolder').addEventListener('click', () => {
      const status = document.getElementById('statusMain');
      const p = currentScopeFolderPath();
      if (!p) {
        setStatusMain('No folder to save — set the current folder in Settings, or click a folder row.');
        return;
      }
      const list = loadFavouriteFolders();
      if (list.some((x) => x.toLowerCase() === p.toLowerCase())) {
        setStatusMain('Already in favourites.');
        return;
      }
      list.push(p);
      saveFavouriteFolders(list);
      renderFavFoldersBar();
      setStatusMain('Favourite saved.');
    });

    document.getElementById('btnSaveFavouriteSearch').addEventListener('click', () => {
      const status = document.getElementById('statusMain');
      const snap = serializeSearchState();
      const list = loadFavouriteSearches();
      if (list.some((x) => searchStatesEqual(x, snap))) {
        setStatusMain('Already saved this search.');
        return;
      }
      list.push(snap);
      saveFavouriteSearches(list);
      renderFavSearchesBar();
      setStatusMain('Search saved.');
    });

    document.getElementById('btnNewTodoMdTags').addEventListener('click', () => openTagModalNewTodoDraft());
    document.getElementById('btnReadmeFolderDocTags').addEventListener('click', () => openTagModalFolderDocDraft());
    document.getElementById('readmeFolderDocStemInput').addEventListener('input', () => folderDocOnFilenameUiChanged());
    document.getElementById('btnCreateTodoMd').addEventListener('click', () => {
      void createTodoMdInScope().then((ok) => { if (ok) closeAddTodoPanel(); });
    });
    document.getElementById('btnCancelTodoMd').addEventListener('click', () => {
      const inp = document.getElementById('newMdTitleInput');
      if (inp) inp.value = '';
      closeAddTodoPanel();
    });
    document.getElementById('newMdTitleInput').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeAddTodoPanel(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      document.getElementById('btnCreateTodoMd').click();
    });

    /* Add TODO pop-out (header +TODO icon): click toggles; typing lives inside, so no hover-open. */
    function closeAddTodoPanel() {
      const panel = document.getElementById('addTodoPanel');
      const btn = document.getElementById('btnToggleAddTodo');
      if (!panel || panel.hasAttribute('hidden')) return;
      panel.setAttribute('hidden', '');
      btn?.setAttribute('aria-expanded', 'false');
    }
    (function wireAddTodoPopover() {
      const wrap = document.querySelector('.tagfox-addtodo-wrap');
      const panel = document.getElementById('addTodoPanel');
      const btn = document.getElementById('btnToggleAddTodo');
      if (!wrap || !panel || !btn) return;
      const open = () => {
        if (!panel.hasAttribute('hidden')) return;
        panel.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        const inp = document.getElementById('newMdTitleInput');
        if (inp) { inp.focus(); inp.select(); }
      };
      btn.addEventListener('click', () => { panel.hasAttribute('hidden') ? open() : closeAddTodoPanel(); });
      document.addEventListener('pointerdown', (e) => {
        if (!panel.hasAttribute('hidden') && !wrap.contains(e.target)) closeAddTodoPanel();
      });
    })();

    document.querySelectorAll('input[name="tagFoxRecencyFilter"]').forEach((el) => {
      el.addEventListener('change', () => {
        syncRecencyFilterActiveHighlight();
        saveSettings();
        commitSearchHistoryNow();
        /* dm: is baked into the HTTP search — must re-run Everything or lastRows stays stale. */
        void runSearchNow();
      });
    });
    document.querySelectorAll('input[name="tagFoxDeadlineFilter"]').forEach((el) => {
      el.addEventListener('change', () => {
        if (el.checked) setDeadlineRange(el.value);
      });
    });
    document.getElementById('btnDeadlineClear')?.addEventListener('click', () => {
      const cur = document.querySelector('input[name="tagFoxDeadlineFilter"]:checked');
      if (cur) cur.checked = false;
      setDeadlineRange('');
    });
    ['optCase', 'optWholeWord', 'optPath', 'optDiacritics', 'optHideSpecial', 'optHideTilde'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        saveSettings();
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

    /* Deadline filter popover: opens on hover or click (mirrors the "A" more-options popover). The radios
       and clear button inside keep their IDs, so their existing handlers still fire. */
    (function wireDeadlinePopover() {
      const wrap = document.querySelector('.tagfox-deadline-wrap');
      const panel = document.getElementById('deadlineFilterPanel');
      const btn = document.getElementById('btnToggleDeadline');
      if (!wrap || !panel || !btn) return;
      let hoverTimer = null;
      const clearHoverTimer = () => { if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; } };
      const open = () => { clearHoverTimer(); if (!panel.hasAttribute('hidden')) return; panel.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); };
      const close = () => { clearHoverTimer(); if (panel.hasAttribute('hidden')) return; panel.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); };
      btn.addEventListener('click', () => { panel.hasAttribute('hidden') ? open() : close(); });
      wrap.addEventListener('mouseenter', () => { clearHoverTimer(); hoverTimer = setTimeout(open, 120); });
      wrap.addEventListener('mouseleave', () => { clearHoverTimer(); hoverTimer = setTimeout(close, 260); });
      /* Picking a range (or clear) closes the popover; setTimeout lets the change/click logic run first. */
      panel.addEventListener('click', (e) => { if (e.target.closest('.btn')) setTimeout(close, 0); });
      document.addEventListener('pointerdown', (e) => { if (!panel.hasAttribute('hidden') && !wrap.contains(e.target)) close(); });
    })();

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
    document.getElementById('btnStatusScopeParent')?.addEventListener('click', () => void goToParentScopeFolder());
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
    /* Re-click active segment cycles, except Smart which reapplies Smart defaults for this context. */
    const viewLayoutTrioIds = ['optRvSmart', 'optRvTree', 'optRvFlat'];
    const contentTrioIds = ['optRvAll', 'optRvDirsOnly', 'optRvFilesOnly'];
    const viewPairs = [['optRvSubsOn', 'optRvSubsOff']];
    const viewRadioActive = {};
    let pendingSmartViewReset = false;
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
          if (id === 'optRvSmart') {
            if (viewRadioActive[id]) {
              reimposeSmartViewDefaults();
            } else {
              pendingSmartViewReset = true;
            }
            return;
          }
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
          if (id === 'optRvSmart' && pendingSmartViewReset) {
            pendingSmartViewReset = false;
            syncViewRadioActiveFromDom();
            reimposeSmartViewDefaults();
            return;
          }
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
    /* Hover preview: delegated so it spans both panes and survives re-renders; hidden on scroll / leaving the window. */
    document.addEventListener('mouseover', onResultRowHoverOver);
    document.addEventListener('mouseout', onResultRowHoverOut);
    document.addEventListener('scroll', hideHoverPreview, true);
    window.addEventListener('blur', hideHoverPreview);
    document.getElementById('optSearchDebug').addEventListener('change', () => {
      saveSettings();
      if (isSearchDebugOn()) searchDebugLog('debug.enabled', { on: true });
      else {
        searchDebugNextScopedProbe = false;
        searchDebugTestAwaitingCopy = false;
        syncSearchDebugTestCycleBtn();
      }
    });
    document.getElementById('btnClearSearchDebug').addEventListener('click', () => {
      searchDebugNextScopedProbe = false;
      searchDebugTestAwaitingCopy = false;
      syncSearchDebugTestCycleBtn();
      searchDebugClear();
      searchDebugLog('debug.cleared', {});
    });
    document.getElementById('btnCopySearchDebug').addEventListener('click', async () => {
      const text = searchDebugLines.join('\n');
      if (!text) return;
      const ok = await copyPlainTextToClipboard(text);
      const status = document.getElementById('statusMain');
      if (ok) {
        searchDebugTestAwaitingCopy = false;
        syncSearchDebugTestCycleBtn();
        if (status) setStatusMain('Debug log copied.');
      } else if (status) {
        setStatusMain('Could not copy debug log.');
      }
    });
    syncSearchDebugTestCycleBtn();
    document.getElementById('btnSearchDebugTestCycle')?.addEventListener('click', () => {
      if (searchDebugTestAwaitingCopy) {
        searchDebugTestAwaitingCopy = false;
        syncSearchDebugTestCycleBtn();
        document.getElementById('btnCopySearchDebug')?.click();
        return;
      }
      const opt = document.getElementById('optSearchDebug');
      const wasOff = !!(opt && !opt.checked);
      if (wasOff) {
        opt.checked = true;
        saveSettings();
      }
      searchDebugClear();
      if (wasOff) searchDebugLog('debug.enabled', { on: true });
      searchDebugLog('debug.cleared', {});
      searchDebugNextScopedProbe = true;
      searchDebugLog('debug.captureArmed', { nextScopedProbe: true });
      searchDebugTestAwaitingCopy = true;
      syncSearchDebugTestCycleBtn();
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
      if (tagModalMode === 'newTodo') newTodoMdTags = modalTags.slice();
      else if (tagModalMode === 'folderDocDraft') folderDocMdTags = modalTags.slice();
      tagModalMode = 'rename';
      syncTagModalHintsAndTitle();
      if (wasFolderDocDraft) {
        syncFolderDocTagPillsDisplay();
        folderDocOnFilenameUiChanged();
      }
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
      if (!globalNestedReadmeView) return;
      const selPath = propsTargetPath();
      const row = propsTargetRowForDisplay();
      const root = readmeAggregateRootFolderFromSelection(selPath, row);
      if (root) void loadReadmeForFolder(root, selPath);
    });
    function onViewerDocModeChanged(wantNested) {
      const want = !!wantNested;
      if (want) {
        const rw = document.getElementById('readmeEditorWrap');
        if (rw && !rw.classList.contains('d-none')) {
          const single = document.getElementById('optViewerDocSingle');
          const nested = document.getElementById('optViewerDocNested');
          if (single) single.checked = true;
          if (nested) nested.checked = false;
          setStatusMain('Finish editing folder doc first.');
          return;
        }
      }
      const selPath = propsTargetPath();
      const row = propsTargetRowForDisplay();
      const root = readmeAggregateRootFolderFromSelection(selPath, row);
      if (!root || !row) {
        const single = document.getElementById('optViewerDocSingle');
        const nested = document.getElementById('optViewerDocNested');
        if (single) single.checked = true;
        if (nested) nested.checked = false;
        globalNestedReadmeView = false;
        return;
      }
      globalNestedReadmeView = want;
      void loadReadmeForFolder(root, selPath);
    }
    document.getElementById('optViewerDocSingle')?.addEventListener('change', (e) => {
      const t = e.target;
      if (!t || t.id !== 'optViewerDocSingle' || !t.checked) return;
      onViewerDocModeChanged(false);
    });
    document.getElementById('optViewerDocNested')?.addEventListener('change', (e) => {
      const t = e.target;
      if (!t || t.id !== 'optViewerDocNested' || !t.checked) return;
      onViewerDocModeChanged(true);
    });
    document.getElementById('btnMdFileCopyText')?.addEventListener('click', () => void copyMdFileViewerText());
    document.getElementById('btnMdFileRefresh')?.addEventListener('click', () => void refreshMdFileViewerFromDisk());
    document.getElementById('btnPdfRefresh')?.addEventListener('click', () => void refreshPdfViewerFromDisk());
    document.getElementById('btnMdFileEdit').addEventListener('click', () => toggleViewerDocEditor('mdFile'));
    (function bindViewerDocPreviewActivators() {
      function bind(prevId, which) {
        const el = document.getElementById(prevId);
        if (!el) return;
        el.addEventListener('dblclick', () => {
          if (which === 'readme' && globalNestedReadmeView) return;
          setViewerDocEditorOpen(which, true);
        });
        el.addEventListener('keydown', (e) => {
          if (which === 'readme' && globalNestedReadmeView) return;
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
      const status = document.getElementById('statusMain');
      if (!u || !window.tagBrowser.openGoogleWorkspaceWindow) return;
      const r = await window.tagBrowser.openGoogleWorkspaceWindow({ url: u });
      if (status) setStatusMain(r.ok ? 'Opened in app window.' : (r.error || 'Open failed'));
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
        void runSearchNow('refresh', { uiHint: 'f5' });
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

    /** After programmatic list selection: move keyboard focus off stray buttons onto the results region. */
    function focusResultsWrapAfterListSelection() {
      if (tagfoxModalBlocksWorkAreaFocus()) return;
      const wrap = document.getElementById('resultsWrap');
      const ae = document.activeElement;
      if (ae && ae.id === 'query') return;
      if (ae && isTypingTarget(ae)) return;
      /* Already in the list: skip refocus — was every ↑/↓ and felt jerky. */
      if (wrap && (ae === wrap || (ae.nodeType === Node.ELEMENT_NODE && wrap.contains(ae)))) return;
      /* No pullWebContents: window keydown uses capture:true — arrows work even when focus is on a header button; IPC was jerky. */
      wrap?.focus({ preventScroll: true });
    }

    /** After toolbar/chrome control click: query if no rows, else results region (for ↑/↓ etc.). */
    function focusMainWorkingArea() {
      if (tagfoxModalBlocksWorkAreaFocus()) return;
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

    /** Breadcrumb ▾ menus + fixed flyouts own ↑/↓/←/→ + Enter: skip global table/scope nav (would re-render breadcrumb and kill focus, and ←/→ drill the flyout chain). */
    function isBreadcrumbScopeFolderNavTarget(el) {
      if (!el || !el.closest) return false;
      if (el.closest('ul.breadcrumb-folder-flyout')) return true;
      if (el.closest('#breadcrumbBar .dropdown-menu')) return true;
      if (
        el.closest('#favFoldersBar .dropdown-menu') ||
        el.closest('#favRecentFoldersBar .dropdown-menu') ||
        el.closest('#favRecentFilesBar .dropdown-menu')
      )
        return true;
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
      // Skip collapse-hidden rows
      const trs = document.querySelectorAll('#resultsTable tbody tr');
      const step = delta > 0 ? 1 : -1;
      while (idx >= 0 && idx < rows.length && trs[idx] && trs[idx].classList.contains('results-tree-collapse-hidden')) {
        idx += step;
      }
      if (idx < 0 || idx >= rows.length) return;
      const row = rows[idx];
      resultsExclusiveSelectRow(row, fullPathForRow(row));
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
      updateSelectAllCheckboxState();
      syncResultsRowCheckboxStates();
      const row = rows[newIdx];
      setSelection(row, fullPathForRow(row));
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

    /** Jump selection to first (false) or last (true) visible row. */
    function moveResultsSelectionToEdge(isEnd) {
      const rows = listRowsForUi();
      if (!rows.length) return;
      const row = rows[isEnd ? rows.length - 1 : 0];
      resultsExclusiveSelectRow(row, fullPathForRow(row));
      scrollActiveResultsRowIntoViewNearest();
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

    /** Toggle between two radios in a pair + trigger the save/search cycle. */
    function toggleViewRadioPair(idA, idB) {
      const a = document.getElementById(idA);
      const b = document.getElementById(idB);
      if (!a || !b) return;
      const target = a.checked ? b : a;
      target.checked = true;
      target.dispatchEvent(new Event('change', { bubbles: true }));
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

    /** True when scope has a parent path we can navigate to. */
    function canGoToParentScopeFolder() {
      const raw = document.getElementById('rootFolder').value.trim();
      if (!raw) return false;
      const norm = normalizeFolderPathForEverything(raw);
      if (isWindowsDriveRootNorm(norm)) return true;
      const parRaw = T.parentDir(norm);
      const par = normalizeFolderPathForEverything(parRaw);
      if (!par) return false;
      if (par.replace(/[/\\]+$/, '').toLowerCase() === norm.replace(/[/\\]+$/, '').toLowerCase()) return false;
      const maxN = getSearchScopeMaxFolderNorm();
      if (maxN && !pathIsUnderOrEqualFolder(par, maxN)) return false;
      return true;
    }

    function syncStatusBarParentScopeButton() {
      const raw = document.getElementById('rootFolder').value.trim();
      const hasScope = !!normalizeFolderPathForEverything(raw);
      const canUp = canGoToParentScopeFolder();
      const b = document.getElementById('btnStatusScopeParent');
      if (b) b.disabled = !canUp;
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
      if (shouldReorderRowsForSmartViewTree()) sortRowsForDisplay(rows, 'name', true);
      else sortRowsForDisplay(rows, sortColumn, sortAsc);
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
        leaveScopePathEditChrome();
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

    /**
     * ← on a results row: always moves the current folder.
     * - Item is a direct child of the current folder → parent of current folder.
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

    /** t / Ctrl+T: tags for checked rows only. */
    function keyboardOpenTagsModal() {
      const bulk = getCheckedPathsArr();
      if (bulk.length > 1) openTagModalBulk(bulk);
      else if (bulk.length === 1) openTagModal(bulk[0]);
    }

    /** Replace tags on checked rows exactly (file renames). */
    async function keyboardReplaceCheckedTagsExact(nextTags, busyHint, doneHint) {
      if (tagRenameBusy) return false;
      const paths = getCheckedPathsArr();
      if (!paths.length) return false;
      const dedupedTags = [];
      const seenTags = new Set();
      for (const raw of nextTags || []) {
        const display = String(raw || '').trim();
        if (!display) continue;
        const key = display.toLowerCase();
        if (seenTags.has(key)) continue;
        seenTags.add(key);
        dedupedTags.push(display);
      }
      tagRenameBusy = true;
      setStatusMain(busyHint || 'Updating tags...');
      try {
        const rootPrefix = rootPrefixValue();
        const pathPairs = [];
        let any = false;
        for (const fp of paths) {
          const base = T.baseName(fp);
          const parent = T.parentDir(fp);
          const sep = fp.includes('/') ? '/' : '\\';
          const toPath = parent ? parent + sep + T.buildTaggedComponent(base, dedupedTags) : T.buildTaggedComponent(base, dedupedTags);
          const fromN = fp.replace(/[/\\]+$/, '').toLowerCase();
          const toN = toPath.replace(/[/\\]+$/, '').toLowerCase();
          if (fromN === toN) continue;
          any = true;
          const res = await window.tagBrowser.renamePath({ fromPath: fp, toPath, rootPrefix });
          if (!res || !res.ok) {
            setStatusMain((res && res.error) || 'Rename failed on ' + fp);
            return false;
          }
          pathPairs.push({ from: fp, to: toPath });
          if (selectedFullPath && selectedFullPath.replace(/[/\\]+$/, '').toLowerCase() === fromN) {
            selectedFullPath = toPath;
            renderScopeBreadcrumb();
          }
        }
        if (!any) {
          setStatusMain('No change.');
          return true;
        }
        recordRenameUndo(pathPairs, 'edit tags on ' + pathPairs.length + ' item(s)');
        await refreshAfterTagsSaved(pathPairs);
        setStatusMain(doneHint || 'Tags updated.');
        return true;
      } catch (e) {
        setStatusMain(String(e.message || e));
        return false;
      } finally {
        tagRenameBusy = false;
      }
    }

    async function keyboardRemoveCheckedTags() {
      return keyboardReplaceCheckedTagsExact([], 'Removing tags...', 'Tags removed.');
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
      const isPlainSearchFocusToggleKey =
        e.key === '/' ||
        e.code === 'NumpadDivide' ||
        (e.code === 'Slash' && !e.shiftKey);
      if (modC && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const hm = document.getElementById('helpModal');
        if (hm) bootstrap.Modal.getOrCreateInstance(hm).show();
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'u' || e.key === 'U')) {
        if (document.querySelector('.modal.show')) return;
        const q = document.getElementById('query');
        if (e.target === q) { e.preventDefault(); q.blur(); return; }
        if (isTypingTarget(e.target)) return;
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
      if (modC && e.shiftKey && e.key === 'Home') {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        clearSearchScopeAndTagRecencyFilters();
        return;
      }
      if (modC && e.key === 'Home') {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        clearSearchScope();
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const cl = ['optRvAll', 'optRvDirsOnly', 'optRvFilesOnly'];
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
      if (modC && e.shiftKey && (e.key === ' ' || e.code === 'Space')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        reimposeSmartViewDefaults({ clearFilters: true });
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleWholeWordMatch();
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleSearchOptCheckbox('optPath');
        return;
      }
      if (modC && !e.shiftKey && (e.key === '.' || e.code === 'Period')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleSearchOptCheckbox('optHideSpecial');
        return;
      }
      if (modC && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleSearchOptCheckbox('optHideTilde');
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const vl = ['optRvSmart', 'optRvTree', 'optRvFlat'];
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
      if (modC && !e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const note = flatViewOnIfTreeForColumnSort();
        applySortColumnKey('date_modified', note || undefined);
        return;
      }
      if (modC && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const note = flatViewOnIfTreeForColumnSort();
        applySortColumnKey('name', note || undefined);
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
      if (modC && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        toggleViewRadioPair('optRvSubsOn', 'optRvSubsOff');
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
      if (modC && (e.key === 'l' || e.key === 'L')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        const hb = document.getElementById('btnScopeFolderHistory');
        if (!hb) return;
        bootstrap.Dropdown.getOrCreateInstance(hb).show();
        return;
      }
      if (modC && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void openNewTab();
        return;
      }
      if (modC && e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        void closeTab(activeTabId);
        return;
      }
      if (modC && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
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
      /* Ctrl+Tab / Ctrl+Shift+Tab cycle result tabs (browser convention). Not an OS-level accelerator, so
         preventDefault here keeps the renderer in control. */
      if (modC && (e.key === 'Tab' || e.code === 'Tab')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
        return;
      }

      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === ' ' || e.code === 'Space')) {
        if (document.querySelector('.modal.show')) return;
        if (blockAppShortcutInTextField(e.target)) return;
        e.preventDefault();
        togglePropsTheaterMode();
        return;
      }

      /* Plain / must run before the Ctrl/Meta/Alt bail-out: AltGr (many layouts) sets ctrl+alt and would block /. */
      if (isPlainSearchFocusToggleKey) {
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

      /* i / f / s: toggle view / content / subfolders radio pairs */
      if (e.key === 'i') {
        e.preventDefault();
        const vl = ['optRvSmart', 'optRvTree', 'optRvFlat'];
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
        const cl = ['optRvAll', 'optRvDirsOnly', 'optRvFilesOnly'];
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
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        toggleWholeWordMatch();
        return;
      }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); toggleSearchOptCheckbox('optPath'); return; }
      if (e.key === '.' || e.code === 'Period') { e.preventDefault(); toggleSearchOptCheckbox('optHideSpecial'); return; }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleSearchOptCheckbox('optHideTilde'); return; }
      if (e.key === 'r') {
        e.preventDefault();
        const order = ['1h', '1d', '1w', '1m', '1y', 'all'];
        const cur = recencyFilterMode();
        const next = order[(order.indexOf(cur) + 1) % order.length];
        setRecencyFilterMode(next);
        const nextEl = document.querySelector(`input[name="tagFoxRecencyFilter"][value="${next}"]`);
        nextEl?.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
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
      if (e.key === 'T') { e.preventDefault(); void keyboardRemoveCheckedTags(); return; }
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
          .querySelectorAll(
            '#breadcrumbBar [data-drop-path].results-drag-over, #favFoldersBar [data-drop-path].results-drag-over, #favRecentFoldersBar [data-drop-path].results-drag-over, #favRecentFilesBar [data-drop-path].results-drag-over'
          )
          .forEach((n) => n.classList.remove('results-drag-over'));
        document.getElementById('appShelf')?.classList.remove('shelf-aside-drag-over');
        setFavColumnDragPeek(false);
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

    const treeViewDefaultsFreshProfile = localStorage.getItem(LS.sortBy) === null;
    wireEverythingConnectionSectionCollapseOnce();
    wireTagfoxSettingsSectionCollapsesOnce();
    loadSettings();
    setEverythingConnectionBadgeUnknown();
    void refreshDriveRootsPickerGate();
    wireSearchScopeSettingsUiOnce();
    wireQuickTodoSettingsUiOnce();
    document.getElementById('settingsPanel')?.addEventListener('shown.bs.offcanvas', () => {
      void probeEverythingConnectionForSettingsBadge();
    });
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
    document.getElementById('btnUndo')?.addEventListener('click', () => void runUndo());
    updateUndoButton();
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
            t.closest('#favFoldersBar .dropdown-menu') ||
            t.closest('#favRecentFoldersBar .dropdown-menu') ||
            t.closest('#favRecentFilesBar .dropdown-menu'))
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
      if (t.closest('#newMdTitleInput')) return;
      if (t.closest('#quickTodoPop') || t.closest('#quickTodoTitleInput')) return;
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
          .querySelectorAll(
            '#breadcrumbBar [data-bs-toggle="dropdown"], #favFoldersBar [data-bs-toggle="dropdown"], #favRecentFoldersBar [data-bs-toggle="dropdown"], #favRecentFilesBar [data-bs-toggle="dropdown"]'
          )
          .forEach((btn) => {
            const inst = bootstrap.Dropdown.getInstance(btn);
            if (inst) inst.hide();
          });
        if (modalEl.id === 'helpModal') restoreHelpModalTab();
      });
    });
    installTagFoxTooltipGuardsOnce();
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
      else setStatusMain(st.error || 'Shelf unavailable');
    });
    document.getElementById('btnShelfOsDrag').addEventListener('click', () => {
      tagBrowserNextOsFileDrag = true;
      setStatusMain(
        'Next drag armed as a real file drag — drop into Explorer or another app. Without this, drags stay inside TagFox.'
      );
    });
    document.getElementById('btnShelfClear').addEventListener('click', async () => {
      if (!confirm('Remove everything from Shelf?')) return;
      const r = await window.tagBrowser.clearShelf();
      setStatusMain(r.ok ? 'Shelf cleared.' : (r.error || 'Clear failed'));
      // On success, main sends paths-mutated → refreshAfterDiskMutation (shelf strip + search retries).
    });
    loadPaneWidthsFromStorage();
    loadViewerDocSplitFromStorage();
    loadFavFoldersColFromStorage();
    loadColWidthsFromStorage();
    applyResultsTablePathColumnVisibility();
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
    bindViewerDocSplitters();
    bindTabStripOnce();
    bindFavFoldersSplitter();
    bindFavFoldersCollapseButton();
    bindFavColumnCollapsedHoverExit();
    document.getElementById('propsTheaterBackdrop').addEventListener('click', () => setPropsTheaterMode(false));
    document.getElementById('btnPropsTheaterToggle').addEventListener('click', () => togglePropsTheaterMode());
    syncViewerDocDividerOrientation();
    updateSortHeaders();
    bindFavouriteBarsDragReorderOnce();
    bindFavFoldersPointerReorderOnce();
    (function wireDeleteSavedSearchModal() {
      const modalEl = document.getElementById('deleteSavedSearchModal');
      const btn = document.getElementById('deleteSavedSearchModalConfirm');
      if (!modalEl || !btn) return;
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modalEl.addEventListener('hidden.bs.modal', () => {
        pendingRemoveFavSearchIdx = null;
      });
      btn.addEventListener('click', () => {
        const idx = pendingRemoveFavSearchIdx;
        pendingRemoveFavSearchIdx = null;
        if (idx != null && idx >= 0) {
          const next = loadFavouriteSearches();
          if (idx < next.length) {
            next.splice(idx, 1);
            saveFavouriteSearches(next);
            renderFavSearchesBar();
          }
        }
        modal.hide();
      });
    })();
    bindFolderPathDropTargetBarsOnce();
    bindScopeFolderDropdownDragCaptureOnce();
    installLongTaskMonitor();
    renderFavFoldersBar();
    renderFavSearchesBar();
    renderTagBar();
    renderTable();
    /* Initialise result tabs from last session (or a single default tab). The live UI already reflects the
       loaded per-control settings, so it becomes the active tab's state. Other tabs carry only their saved
       searchState and re-run their own search when first activated. lastRows / resultsPagingCtx are not
       persisted (stale after restart); the active tab's scheduleSearch() below rebuilds its rows. */
    {
      const saved = loadTabsFromStorage();
      const activeState = serializeSearchState();
      if (saved) {
        const activeIndex = Math.min(Math.max(0, saved.activeIndex | 0), saved.tabs.length - 1);
        tabs = saved.tabs.map((t, i) => {
          const st = i === activeIndex ? activeState : (t.searchState || null);
          /* Same rule as the live UI (loadSettings): recency always launches at All, never restored. */
          if (st) st.recencyFilter = 'all';
          return newBlankTab(st);
        });
        activeTabId = tabs[activeIndex].id;
      } else {
        tabs = [newBlankTab(activeState)];
        activeTabId = tabs[0].id;
      }
      renderTabStrip();
      persistTabsToStorage();
    }
    scheduleSearch();
    startDidYouKnowTips();
    /** Drive API hello-world (navbar tick after New dbg). */
    setTimeout(() => void refreshGoogleDriveApiPingSegment(), 1200);
    void renderShelf().then(() => refreshTagFoxChromeTooltips(document.body));
    requestAnimationFrame(() => requestAnimationFrame(focusSearchBox));
    window.addEventListener('blur', () => searchDebugFocusSnapshot('window.blur'));
    document.addEventListener('visibilitychange', () =>
      searchDebugFocusSnapshot('visibilitychange', { hidden: document.hidden })
    );
    window.addEventListener('focus', () => {
      searchDebugFocusSnapshot('window.focus');
      requestAnimationFrame(() => {
        focusSearchBox();
        requestAnimationFrame(() => searchDebugFocusSnapshot('window.focus.afterRestore'));
      });
    });

    /* Automated-test hook: inert unless the page is loaded with #tagfoxtest in the URL (the dual-pane
       harness in _tmp/ sets it). Exposes the closure-private search/pane orchestration + a state snapshot
       so an external CDP driver can exercise the loop/refresh/dual-pane flows and assert invariants. */
    if (location.hash.includes('tagfoxtest')) {
      const BASE_RESULT_IDS = ['resultsWrap', 'resultsScroll', 'resultsTable', 'tbody', 'resultsLoadMoreWrap', 'btnLoadMoreResults', 'resultsLoadMoreHint', 'chkSelectAllResults'];
      const rowCount = (id) => {
        const el = document.getElementById(id);
        return el ? el.querySelectorAll('tr').length : -1;
      };
      window.__tagfoxTest = {
        runSearchNow: (kind, opts) => runSearchNow(kind, opts),
        refreshNow: () => runSearchNow('refresh', { uiHint: 'f5' }),
        scheduleSearch: (kind) => scheduleSearch(kind),
        setQuery: (q) => {
          const el = document.getElementById('query');
          if (el) { el.value = String(q == null ? '' : q); el.dispatchEvent(new Event('input', { bubbles: true })); }
        },
        setRecency: (mode) => { setRecencyFilterMode(mode); void runSearchNow('identity'); },
        setView: (subsOn, content) => { applyResultsViewRadiosToDom('smart', !!subsOn, content || 'all'); syncViewRadioActiveFromDom(); void runSearchNow('identity'); },
        setScope: (root) => { const e = document.getElementById('rootFolder'); if (e) e.value = String(root || ''); void runSearchNow('identity'); },
        autoTick: () => maybeAutoRefreshSearchTick(),
        loadMore: () => loadMoreResults(),
        /* Tab drivers. springHoverTab models the spring-load result: a drag hovering a tab activates it. */
        newTab: () => openNewTab(),
        closeTab: (id) => closeTab(Number(id)),
        activateTab: (id) => activateTab(Number(id)),
        cycleTab: (dir) => cycleTab(Number(dir) || 1),
        reorderTab: (from, to) => reorderTab(Number(from), Number(to)),
        springHoverTab: (id) => activateTab(Number(id)),
        tabIds: () => tabs.map((t) => t.id),
        /* Drive the real disk-mutation handler (the IPC callback) so tests can assert refresh behaviour. */
        mutate: (payload) => onPathsMutated(payload),
        /* Simulate the renderer side of a delete: tombstone the paths + repaint the active pane. Used by
           crud-pane-isolation to prove a delete in the active tab never touches other tabs' stored rows. */
        tombstone: (paths) => removeGonePathsFromUiNow(Array.isArray(paths) ? paths : [paths]),
        disableAutofill: () => { maybeAutoFillResultsUntilScrollable = () => {}; },
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
          smart: isSmartView(),
          n_lastRows: lastRows.length,
          n_afterTags: filteredRowsAfterTagsOnly().length,
          n_beforeAdvanced: filteredRowsBeforeAdvancedPathHides().length,
          n_filteredRows: filteredRows().length,
          n_listRowsForUi: listRowsForUi().length,
          rows: lastRows.slice(0, 8).map((r) => ({ path: fullPathForRow(r), folder: rowIsFolder(r), mtime: modifiedTimeMs(r) })),
        }),
        state: () => ({
          activeTabId,
          activeTabIndex: tabIndexById(activeTabId),
          tabCount: tabs.length,
          tabs: tabs.map((t) => ({ id: t.id, rows: Array.isArray(t.lastRows) ? t.lastRows.length : 0 })),
          activeTabRows: activeTab() && Array.isArray(activeTab().lastRows) ? activeTab().lastRows.length : 0,
          topLevelSearchDepth,
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
