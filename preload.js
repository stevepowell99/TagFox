// TagBrowser — thin bridge: renderer calls Everything via main process
const { contextBridge, ipcRenderer } = require('electron');

let onPathsMutated = null;
let onShellActionError = null;
let onQuickTodoOpen = null;
let onSearchDebugLine = null;
let onPlainF5SearchRefresh = null;
let onAppRestartHint = null;
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
ipcRenderer.on('tagfox-plain-f5-refresh', () => {
  if (onPlainF5SearchRefresh) onPlainF5SearchRefresh();
  else ipcRenderer.send('tagfox-plain-f5-missed');
});
ipcRenderer.on('tagfox-app-restart-imminent', (_e, payload) => {
  if (onAppRestartHint) onAppRestartHint(payload && typeof payload === 'object' ? payload : {});
});

contextBridge.exposeInMainWorld('tagBrowser', {
  search: (payload) => ipcRenderer.invoke('everything-search', payload),
  openPath: (fullPath) => ipcRenderer.invoke('open-path', fullPath),
  showInFolder: (fullPath) => ipcRenderer.invoke('show-in-folder', fullPath),
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
  /** Is a local `npm run dev:local` gmist up? (main-process probe; short timeout). */
  probeLocalGmist: (payload) => ipcRenderer.invoke('probe-local-gmist', payload),
  /** Start a local gmist (`npm run dev:local`, detached) and wait for it to answer. */
  startLocalGmist: () => ipcRenderer.invoke('start-local-gmist'),
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
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
  copyExplorerPaste: (paths) => ipcRenderer.invoke('copy-explorer-paste', paths),
  cutExplorerPaste: (paths) => ipcRenderer.invoke('cut-explorer-paste', paths),
  pasteClipboardIntoFolder: (payload) => ipcRenderer.invoke('paste-clipboard-into-folder', payload),
  listChildFolders: (payload) => ipcRenderer.invoke('list-child-folders', payload),
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
  pickScopeFolder: () => ipcRenderer.invoke('pick-scope-folder'),
  userHomeDir: () => ipcRenderer.invoke('user-home-dir'),
});
