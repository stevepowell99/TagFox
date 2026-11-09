Whippet went from Electron 33 to 43.8.7 on 9 November 2026, which cleared every Electron advisory npm audit listed that day (the highest affected range was below 42.11.16). Electron supports the latest three majors, so 43 stops getting fixes once 46 is stable; 46 was in alpha on 9 November.

- **What 44 and 45 break here**
  - Electron 44 rewrote the clipboard on the W3C Clipboard API and removed `clipboard.readImage`
    - `main.js`: the `clipboard-kind` and `paste-clipboard-into-folder` handlers, and the image paste behind them
    - Replacement: `clipboard.read()` with `ClipboardItem`; check the 44 docs for the main-process form first
  - Electron 44 removed the `clipboard` module from the renderer; `renderer.js` already uses `navigator.clipboard` and the `clipboard-write-text` IPC
  - Electron 45 drops `Buffer`, `setImmediate` and `require('events')` in sandboxed preloads; `preload.js` and `web-editor-toolbar-preload.js` use only `contextBridge` and `ipcRenderer` (checked 9 November)
  - Electron 45 gives `window.open()` children of unsandboxed windows their own sandboxed process; check `setWindowOpenHandler` in `main.js`
- **Already handled in the move to 43**
  - `install-electron` runs in `postinstall`, since Electron 42 stopped downloading its binary on install
  - The `console-message` handler takes the event object
- **Left in npm audit on 9 November:** 6 moderate findings, all one `minimatch` denial-of-service issue inside electron-builder's macOS packaging path, build time only
- **Source:** the Electron breaking-changes page, https://www.electronjs.org/docs/latest/breaking-changes
