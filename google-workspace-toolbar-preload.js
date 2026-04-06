// Preload for Google Workspace child window: URL bar + nav (main holds real webContents).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gwsToolbar', {
  go: (url) => ipcRenderer.send('gws-toolbar-go', url),
  back: () => ipcRenderer.send('gws-toolbar-back'),
  forward: () => ipcRenderer.send('gws-toolbar-forward'),
  reload: () => ipcRenderer.send('gws-toolbar-reload'),
  onUrl: (cb) => {
    ipcRenderer.on('gws-toolbar-set-url', (_e, u) => cb(u));
  },
  onNavState: (cb) => {
    ipcRenderer.on('gws-toolbar-nav-state', (_e, s) => cb(s));
  },
});
