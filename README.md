# TagFox

Small Electron UI for [Voidtools Everything](https://www.voidtools.com/) HTTP search, with optional **bracket tags** in file and folder names.

## Run

1. In Everything: **Tools → Options → HTTP Server** — enable the server and note the URL (e.g. `http://127.0.0.1:8080`).
2. In this folder: `npm install` then `npm start`.
3. Open **Settings** and set **Everything base URL**. Optionally set **Scope folder** so the app starts in a particular directory—that path is your **current folder** (same idea people sometimes call “scope”).
4. Press **F1** or the **?** button for in-app help. **Ctrl+/** (**⌘+/** on Mac) focuses the search box; plain **/** does the same when no dialog is open.

## Windows installer (electron-builder)

From this folder after `npm install`: `npm run dist`. The NSIS setup executable is written to `dist/`. Builds are **not** code-signed, so Windows Smart Screen may warn recipients.

## Current folder, breadcrumb, history

- **Current folder** is where the app searches and what row actions treat as “here”. **Settings → Scope folder** sets it; clearing that field searches the whole index.
- The **breadcrumb** (under Favourites) shows the path: click a segment to jump. **▾** menus list siblings or subfolders; you can open nested flyouts from the last segment’s menu.
- **Search history** (**Alt+←** / **→**, or the toolbar arrows) restores whole past searches: query, **current folder**, tags, toggles.
- **Recent folders** (**Ctrl+L** or the clock button) only jumps among folder paths you have used, not full search snapshots.

## Tag syntax

Use one bracket block in the **last** `[ … ]` pair of a segment name, comma-separated:

- File: `Notes[draft,review].md` — table title shows as `Notes.md`; tags are `draft` and `review`.
- Folder: `Project[2024,clientA]` — tags apply to that folder segment.

**Tags** on a row opens a modal; **Add** (or removing a chip) **renames on disk** at once. When **Scope folder** is set in Settings, renames are required to stay under that path (check in the main process).

## Tag bar

Buttons are tags seen in results plus **remembered** tags (local store, max 40). Choosing a tag saves it; the **active** tag filter is restored next launch. Counts show `0` when a tag is absent from the latest results. **Clear tag filter** only clears the filter.

With **Regex** off, active tags are also sent to Everything so you can find matches before results load. With **Regex** on, tag filtering is **client-side** on the current list.

## Row actions (⋯)

Each row has **⋯** — a main-process context menu (`Menu`, `shell`, `clipboard`).

**Copy** submenu: full path, parent path, **name only**, forward slashes, **file://** URL, and on Windows **Copy for Explorer paste** (`CF_HDROP`). **Paste** from Explorer into a scope folder is supported on Windows. Then **Open**, **Reveal in File Explorer**, **Search Google Drive for filename…**, **Open in Windows Terminal**, **Edit with Notepad** (files), **Delete** (confirmation; Windows Recycle Bin).

## Layout

Drag the **splitter** between the main area and the **Viewer** (width saved). Drag column header **right edges** in the results table to resize columns (saved).

## Search options

The **query** and **Settings** fields update results live (debounced). Toggles map to Everything: case, whole word, path, regex, diacritics. Next to the search row, **Both** / **Folders only** / **Files only** pick what Everything returns (`folder:` / `file:` when narrowed; [docs](https://www.voidtools.com/support/everything/searching/)).

**Sort** uses column headers; order is sent to Everything. **Sort folders with files** (Settings, default on) merges folders and files by that column; off keeps Everything’s usual folders-first order.

**Hide “dot” folders** (advanced): hides paths under segments like `.git` or `.vscode` (see the in-app tooltip; leaf dotfiles such as `.env` are different).

## Viewer

The **Viewer** shows path, type, size, modified. **Folders**: `readme.md` editor with Markdown preview ([marked](https://marked.js.org/)). **PDF**, Office where supported ([mammoth](https://github.com/mwilliamson/mammoth.js), [SheetJS](https://sheetjs.com/) via CDN). Large files may not preview.

Read/write uses UTF-8. **Tags / rename** still requires paths under **Scope folder** when that field is set.
