// Preload for the in-app web editor child window (Google Workspace, local gmist): URL bar + nav (main holds real webContents).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webEditorToolbar', {
  go: (url) => ipcRenderer.send('webedit-toolbar-go', url),
  back: () => ipcRenderer.send('webedit-toolbar-back'),
  forward: () => ipcRenderer.send('webedit-toolbar-forward'),
  reload: () => ipcRenderer.send('webedit-toolbar-reload'),
  /** When Google’s bottom mini-bar isn’t inspectable / too small: main simulates clicks there. */
  restoreSatellite: () => ipcRenderer.send('webedit-toolbar-restore-satellite'),
  /** Which document this window holds — the title bar can be off screen, the toolbar never is. */
  onLabel: (cb) => {
    ipcRenderer.on('webedit-toolbar-set-label', (_e, s) => cb(s));
  },
  onUrl: (cb) => {
    ipcRenderer.on('webedit-toolbar-set-url', (_e, u) => cb(u));
  },
  onNavState: (cb) => {
    ipcRenderer.on('webedit-toolbar-nav-state', (_e, s) => cb(s));
  },
});
