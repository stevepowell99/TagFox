// TagBrowser — thin bridge: renderer calls Everything via main process
const { contextBridge, ipcRenderer } = require('electron');

let onPathsMutated = null;
let onShellActionError = null;
ipcRenderer.on('paths-mutated', () => {
  if (onPathsMutated) onPathsMutated();
});
ipcRenderer.on('shell-action-error', (_e, msg) => {
  if (onShellActionError) onShellActionError(msg);
});

contextBridge.exposeInMainWorld('tagBrowser', {
  search: (payload) => ipcRenderer.invoke('everything-search', payload),
  openPath: (fullPath) => ipcRenderer.invoke('open-path', fullPath),
  showInFolder: (fullPath) => ipcRenderer.invoke('show-in-folder', fullPath),
  renamePath: (payload) => ipcRenderer.invoke('rename-path', payload),
  movePathsIntoFolder: (payload) => ipcRenderer.invoke('move-paths-into-folder', payload),
  copyPathsIntoFolder: (payload) => ipcRenderer.invoke('copy-paths-into-folder', payload),
  readTextFile: (payload) => ipcRenderer.invoke('read-text-file', payload),
  readFileBuffer: (payload) => ipcRenderer.invoke('read-file-buffer', payload),
  writeTextFile: (payload) => ipcRenderer.invoke('write-text-file', payload),
  ensureReadme: (payload) => ipcRenderer.invoke('ensure-readme', payload),
  showItemActionsMenu: (payload) => ipcRenderer.invoke('show-item-actions-menu', payload),
  copyExplorerPaste: (paths) => ipcRenderer.invoke('copy-explorer-paste', paths),
  cutExplorerPaste: (paths) => ipcRenderer.invoke('cut-explorer-paste', paths),
  pasteClipboardIntoFolder: (payload) => ipcRenderer.invoke('paste-clipboard-into-folder', payload),
  listChildFolders: (payload) => ipcRenderer.invoke('list-child-folders', payload),
  focusWebContents: () => ipcRenderer.send('tagbrowser-focus-web-contents'),
  /* Must be synchronous with dragstart or OS drag never starts (send is async). */
  startDragFiles: (paths) => ipcRenderer.sendSync('start-drag-files', paths),
  trashPaths: (paths) => ipcRenderer.invoke('trash-paths', paths),
  createEmptyFolder: (payload) => ipcRenderer.invoke('create-empty-folder', payload),
  shelfState: () => ipcRenderer.invoke('shelf-state'),
  clearShelf: () => ipcRenderer.invoke('clear-shelf'),
  getGlobalFocusHotkey: () => ipcRenderer.invoke('get-global-focus-hotkey'),
  setGlobalFocusHotkey: (accelerator) => ipcRenderer.invoke('set-global-focus-hotkey', accelerator),
  setPathsMutatedHandler: (fn) => {
    onPathsMutated = typeof fn === 'function' ? fn : null;
  },
  setShellActionErrorHandler: (fn) => {
    onShellActionError = typeof fn === 'function' ? fn : null;
  },
});
