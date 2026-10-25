// TagBrowser — thin bridge: renderer calls Everything via main process
const { contextBridge, ipcRenderer } = require('electron');

let onPathsMutated = null;
let onShellActionError = null;
let onQuickTodoOpen = null;
let onRecentTabOpen = null;
let onHotkeyRaised = null;
let onSearchDebugLine = null;
let onPlainF5SearchRefresh = null;
let onAppRestartHint = null;
let onPageZoomChanged = null;
ipcRenderer.on('paths-mutated', (_e, payload) => {
  if (onPathsMutated) onPathsMutated(payload && typeof payload === 'object' ? payload : {});
});
ipcRenderer.on('shell-action-error', (_e, msg) => {
  if (onShellActionError) onShellActionError(msg);
});
ipcRenderer.on('search-debug-line', (_e, payload) => {
  if (!onSearchDebugLine || !payload || typeof payload.event !== 'string') return;
  onSearchDebugLine(payload.event, payload.data);
});
ipcRenderer.on('tagfox-open-quick-todo', () => {
  if (onQuickTodoOpen) onQuickTodoOpen();
});
ipcRenderer.on('tagfox-open-recent-tab', () => {
  if (onRecentTabOpen) onRecentTabOpen();
});
ipcRenderer.on('tagfox-hotkey-raised', () => {
  if (onHotkeyRaised) onHotkeyRaised();
});
let onFileDialogTarget = null;
ipcRenderer.on('tagfox-file-dialog-target', (_e, info) => {
  if (onFileDialogTarget) onFileDialogTarget(info && typeof info === 'object' ? info : null);
});
ipcRenderer.on('tagfox-plain-f5-refresh', () => {
  if (onPlainF5SearchRefresh) onPlainF5SearchRefresh();
  else ipcRenderer.send('tagfox-plain-f5-missed');
});
ipcRenderer.on('tagfox-page-zoom-changed', (_e, factor) => {
  if (onPageZoomChanged) onPageZoomChanged(Number(factor) || 1);
});
ipcRenderer.on('tagfox-app-restart-imminent', (_e, payload) => {
  if (onAppRestartHint) onAppRestartHint(payload && typeof payload === 'object' ? payload : {});
});

contextBridge.exposeInMainWorld('tagBrowser', {
  /** An automated test's instance (the harness sets TAGFOX_TEST_HIDDEN), known from the first page load. */
  isTestInstance: process.env.TAGFOX_TEST_HIDDEN === '1',
  search: (payload) => ipcRenderer.invoke('everything-search', payload),
  openPath: (fullPath) => ipcRenderer.invoke('open-path', fullPath),
  showInFolder: (fullPath) => ipcRenderer.invoke('show-in-folder', fullPath),
  hideMainWindow: () => ipcRenderer.invoke('hide-main-window'),
  showProperties: (fullPath) => ipcRenderer.invoke('show-properties', fullPath),
  windowChromeGet: () => ipcRenderer.invoke('window-chrome-get'),
  windowChromeSet: (hideTitleBar) => ipcRenderer.invoke('window-chrome-set', !!hideTitleBar),
  windowChromeColors: (colors) => ipcRenderer.invoke('window-chrome-colors', colors),
  openTerminalAt: (cwdPath) => ipcRenderer.invoke('open-terminal-at', cwdPath),
  renamePath: (payload) => ipcRenderer.invoke('rename-path', payload),
  movePathsIntoFolder: (payload) => ipcRenderer.invoke('move-paths-into-folder', payload),
  copyPathsIntoFolder: (payload) => ipcRenderer.invoke('copy-paths-into-folder', payload),
  readTextFile: (payload) => ipcRenderer.invoke('read-text-file', payload),
  readFileBuffer: (payload) => ipcRenderer.invoke('read-file-buffer', payload),
  getThumbnail: (payload) => ipcRenderer.invoke('get-thumbnail', payload),
  readMsgPreview: (payload) => ipcRenderer.invoke('read-msg-preview', payload),
  writeTextFile: (payload) => ipcRenderer.invoke('write-text-file', payload),
  writeImageFilePng: (payload) => ipcRenderer.invoke('write-image-file-png', payload),
  googleWorkspaceShortcutUrl: (payload) => ipcRenderer.invoke('google-workspace-shortcut-url', payload),
  openGoogleWorkspaceWindow: (payload) => ipcRenderer.invoke('open-google-workspace-window', payload),
  openUrlDefaultBrowser: (payload) => ipcRenderer.invoke('open-url-default-browser', payload),
  /** Obsidian's registered vault folders, from its obsidian.json: { ok, found, roots }. */
  obsidianVaultRoots: () => ipcRenderer.invoke('obsidian-vault-roots'),
  /** What this machine has for the buttons that depend on it: { gmist, makePdf, googleSignIn }. */
  machineFeatures: () => ipcRenderer.invoke('machine-features'),
  /** Start a local gmist, or report the one already listening on 5173. Returns at once when it is up. */
  startLocalGmist: () => ipcRenderer.invoke('start-local-gmist'),
  runtimeInfo: (opts) => ipcRenderer.invoke('tagfox-runtime-info', opts || {}),
  restartTagFox: () => ipcRenderer.invoke('tagfox-restart'),
  /** Open a local gmist URL in a TagFox child window (localhost only), like the Google Workspace window. */
  openGmistWindow: (payload) => ipcRenderer.invoke('open-gmist-window', payload),
  /** Hello-world: Drive API about.get + one files.list row (existing token only; no OAuth popup). */
  googleDriveApiPing: () => ipcRenderer.invoke('google-drive-api-ping'),
  resolveFolderViewerDoc: (payload) => ipcRenderer.invoke('resolve-folder-viewer-doc', payload),
  collectGlobalViewerDocs: (payload) => ipcRenderer.invoke('collect-global-viewer-docs', payload),
  resolveShellShortcut: (payload) => ipcRenderer.invoke('resolve-shell-shortcut', payload),
  resolveGoogleDriveFileId: (payload) => ipcRenderer.invoke('resolve-google-drive-file-id', payload),
  /** Windows: folder targets from shell Recent (.lnk), newest first (empty on other OS). */
  windowsRecentFolders: () => ipcRenderer.invoke('windows-recent-folders'),
  /** Windows: file targets from shell Recent (.lnk), newest first (empty on other OS). */
  windowsRecentFiles: () => ipcRenderer.invoke('windows-recent-files'),
  showItemActionsMenu: (payload) => ipcRenderer.invoke('show-item-actions-menu', payload),
  /** Profile picker for Print to PDF (markdown rows); resolves { ok, profile } or { ok, dismissed }. */
  showPrintPdfMenu: (payload) => ipcRenderer.invoke('show-print-pdf-menu', payload),
  /** Render a markdown file to a sibling PDF via JobCat's make_pdf.py (slow: seconds, not ms). */
  makePdfFromMarkdown: (payload) => ipcRenderer.invoke('make-pdf-from-markdown', payload),
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
  copyExplorerPaste: (paths) => ipcRenderer.invoke('copy-explorer-paste', paths),
  cutExplorerPaste: (paths) => ipcRenderer.invoke('cut-explorer-paste', paths),
  pasteClipboardIntoFolder: (payload) => ipcRenderer.invoke('paste-clipboard-into-folder', payload),
  /** { files: count, image: bool, text } on the clipboard now. */
  clipboardKind: () => ipcRenderer.invoke('clipboard-kind'),
  listChildFolders: (payload) => ipcRenderer.invoke('list-child-folders', payload),
  /** { ok, kinds: { [path]: 'file' | 'folder' | 'missing' } } */
  pathKinds: (paths) => ipcRenderer.invoke('path-kinds', paths),
  listFolderEntries: (payload) => ipcRenderer.invoke('list-folder-entries', payload),
  debugFolderSnapshot: (payload) => ipcRenderer.invoke('debug-folder-snapshot', payload),
  listDriveRoots: () => ipcRenderer.invoke('list-drive-roots'),
  focusWebContents: () => ipcRenderer.send('tagbrowser-focus-web-contents'),
  forceFocusWebContents: () => ipcRenderer.send('tagbrowser-force-web-contents-focus'),
  /* Must be synchronous with dragstart or OS drag never starts (send is async). */
  startDragFiles: (paths) => ipcRenderer.sendSync('start-drag-files', paths),
  trashPaths: (paths, opts) => {
    const p = Array.isArray(paths) ? paths : [];
    const src = opts && typeof opts === 'object' && opts.debugSource ? String(opts.debugSource) : '';
    return ipcRenderer.invoke('trash-paths', src ? { paths: p, debugSource: src } : p);
  },
  setSearchDebugFromMainHandler: (fn) => {
    onSearchDebugLine = typeof fn === 'function' ? fn : null;
  },
  /** Plain F5: main prevents Chromium reload and signals here (see attachPageZoomShortcuts). */
  setPlainF5SearchRefreshHandler: (fn) => {
    onPlainF5SearchRefresh = typeof fn === 'function' ? fn : null;
  },
  setAppRestartHintHandler: (fn) => {
    onAppRestartHint = typeof fn === 'function' ? fn : null;
  },
  createEmptyFolder: (payload) => ipcRenderer.invoke('create-empty-folder', payload),
  shelfState: () => ipcRenderer.invoke('shelf-state'),
  clearShelf: () => ipcRenderer.invoke('clear-shelf'),
  removeShelfPaths: (paths) => ipcRenderer.invoke('remove-shelf-paths', paths),
  setPathsMutatedHandler: (fn) => {
    onPathsMutated = typeof fn === 'function' ? fn : null;
  },
  setShellActionErrorHandler: (fn) => {
    onShellActionError = typeof fn === 'function' ? fn : null;
  },
  /** Tag bar persistence in userData (read before first paint — sync IPC). */
  tagPrefsReadSync: () => ipcRenderer.sendSync('tag-prefs-read-sync'),
  tagPrefsWrite: (payload) => ipcRenderer.invoke('tag-prefs-write', payload),
  tagPrefsWriteSync: (payload) => ipcRenderer.sendSync('tag-prefs-write-sync', payload),
  /** OS-wide show/hide shortcut (Electron globalShortcut). */
  globalToggleGet: () => ipcRenderer.invoke('global-toggle-get'),
  globalToggleSet: (accelerator) => ipcRenderer.invoke('global-toggle-set', accelerator),
  quickTodoHotkeyGet: () => ipcRenderer.invoke('quick-todo-hotkey-get'),
  quickTodoHotkeySet: (accelerator) => ipcRenderer.invoke('quick-todo-hotkey-set', accelerator),
  setQuickTodoOpenHandler: (fn) => {
    onQuickTodoOpen = typeof fn === 'function' ? fn : null;
  },
  setRecentTabOpenHandler: (fn) => {
    onRecentTabOpen = typeof fn === 'function' ? fn : null;
  },
  setHotkeyRaisedHandler: (fn) => {
    onHotkeyRaised = typeof fn === 'function' ? fn : null;
  },
  /** Another app's Open or Save dialog that the toggle shortcut raised TagFox from: told on every raise (null when none). */
  setFileDialogTargetHandler: (fn) => {
    onFileDialogTarget = typeof fn === 'function' ? fn : null;
  },
  fileDialogSend: (p, isFolder) => ipcRenderer.invoke('file-dialog-send', { path: String(p || ''), isFolder: !!isFolder }),
  fileDialogCancel: () => ipcRenderer.invoke('file-dialog-cancel'),
  pickScopeFolder: () => ipcRenderer.invoke('pick-scope-folder'),
  userHomeDir: () => ipcRenderer.invoke('user-home-dir'),
  /** Page zoom for the navbar buttons: 'in' | 'out' | 'reset' | 'get', or a factor to restore. */
  pageZoom: (dir) => ipcRenderer.invoke('page-zoom', dir),
  setPageZoomChangedHandler: (fn) => {
    onPageZoomChanged = typeof fn === 'function' ? fn : null;
  },
  /** Renderer-side jank lines into the main perf log (%TEMP%\tagfox-mainperf.log, or -test.log for a test instance); rate-capped in main. */
  perfLog: (line) => ipcRenderer.send('tagfox-perf-log', String(line || '')),
});
