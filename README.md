# TagFox

Small Electron UI for [Voidtools Everything](https://www.voidtools.com/) HTTP search, with optional **bracket tags** in file and folder names.

## Run

1. In Everything: **Tools → Options → HTTP Server** — enable the server and note the URL (e.g. `http://127.0.0.1:8080`).
2. In this folder: `npm install` then `npm start`.
3. Open **Settings** and set **Everything base URL**. Optionally set **Scope folder** so the app starts in a particular directory—that path is your **current folder** (same idea people sometimes call “scope”).
4. Press **F1** or the **?** button for in-app help. **Ctrl+/** (**⌘+/** on Mac) focuses the search box; plain **/** does the same when no dialog is open.

## Bulk rename (Ctrl+H)

- **Ctrl+H** / **⌘+H** on Mac opens **Bulk rename in name** (wildcard find/replace on the last path segment only — not parent folders).
- **Targets**: all **checked** rows, or the **highlighted** row if nothing is checked.
- **Find** and **Replace** prefill with the **longest contiguous substring shared by every selected name**, computed on **stems** only (the part before the last `.` — e.g. `foo` from `foo.pdf`; extensions are ignored for this prefill, not for the actual rename). Wildcards in **Find** only: `*` = any characters, `?` = one character.
- **Match case** for the rename pattern follows the search-row **Match case** toggle (same as Everything options).
- **Preview** lists current → new names as you edit (first 200 rows shown; **Rename** still affects the whole batch captured when the dialog opened).
- Renames obey **Scope folder** the same way as **Tags** and **F2** rename.

## Reloading during development

**View** menu (menu bar: **Alt** on Windows, or the app menu on macOS): **Reload** (**Ctrl+R**), **Force reload** / hard reload (**Ctrl+Shift+R**), extra hard reload (**Ctrl+F5**, **Ctrl+Shift+F5**), **Toggle DevTools** (**Ctrl+Shift+I**). The menu bar is hidden by default on Windows; **Alt** toggles it.

| Changed files | What to do |
|---------------|------------|
| `index.html`, `styles.css`, `tags.js`, `renderer.js` (renderer) | **Ctrl+Shift+R**, **Ctrl+F5**, or **Ctrl+Shift+F5** to hard reload; if the UI still looks stale, **`npm start` again**. |
| `preload.js`, `main.js` | **Quit the app** and **`npm start` again** (those load only at process start). |

## Windows installer (electron-builder)

From this folder after `npm install`: `npm run dist`. The NSIS setup executable is written to `dist/`. Builds are **not** code-signed, so Windows Smart Screen may warn recipients.

## Current folder, breadcrumb, history

- **Current folder** is where the app searches and what row actions treat as “here”. **Settings → Scope folder** sets it; clearing that field searches the whole index.
- The **breadcrumb** (under Favourites) shows the path: click a segment to jump. **▾** menus list siblings or subfolders; you can open nested flyouts from the last segment’s menu.
- **Search history** (**Alt+←** / **→**, or the toolbar arrows) restores whole past searches: query, **current folder**, tags, toggles.
- **Recent folders** (**Ctrl+L** or the clock button) only jumps among folder paths you have used, not full search snapshots.

## Tag syntax

Use one block in the **last** `[ ( … ) ]` pair of a segment: comma-separated tags inside **parentheses**:

- File: `Notes[(draft,review)].md` — title shows as `Notes.md`; tags are `draft` and `review`.
- Folder: `Project[(2024,clientA)]` — tags apply to that folder segment.

Plain `[draft]` without inner `()` is **not** a TagFox tag (treated as part of the filename). Only `[(draft)]` counts.

**Tags** on a row opens a modal; **Add** (or removing a chip) **renames on disk** at once. When **Scope folder** is set in Settings, renames are required to stay under that path (check in the main process).

## Tag bar

**Settings → Scope folder** is the Everything search prefix and the rename-safety root (same path as the breadcrumb); it is not “ignored.” The tag bar lists tags from **`[(…)]`** blocks in names (discovered via a full-index scan for `[(`, plus remembered tags). Plain `[foo]` without parens is ignored by that scan.

Buttons are tags seen in results plus **remembered** tags (local store, max 40). Choosing a tag saves it; the **active** tag filter is restored next launch. A number in parentheses counts rows in the **current results list** (after filters) that carry that tag—capped by **Max results**. If there is no number, the tag is not on any row in that list. Use **Clear all tags** or toggle pills off to drop the filter.

- **↻** (end of the tag pill row): re-runs the main search, then the same **full-index** `[(…)]` scan and **prunes** remembered / active tags missing from that scan (ghost cleanup). Ordinary searches also refresh tag discovery **without** pruning, so caps cannot silently wipe your list.

With **Regex** off, active tags are also sent to Everything so you can find matches before results load. With **Regex** on, tag filtering is **client-side** on the current list.

## Row actions (⋯)

Each row has **⋯** — a main-process context menu (`Menu`, `shell`, `clipboard`).

The menu opens with those **copy** actions (no nested submenu): on Windows **Copy for Explorer paste** (`CF_HDROP`), **full path**, parent path, **name only**, forward slashes, **file://** when applicable. **Ctrl+Shift+C** (⌘+Shift+C on Mac) copies the same full path(s) as text for the highlighted row or all checked rows (one line each). **Paste** from Explorer into a scope folder is supported on Windows. Then **Open**, **Reveal in File Explorer**, **Search Google Drive for filename…**, **Open in Windows Terminal**, **Edit with Notepad** (files), **Delete** (confirmation; Windows Recycle Bin).

## Drag and drop

- **Normal drag** (no modifier): move or copy within TagFox — onto folder rows, the breadcrumb, or the **Shelf** strip (`Shift` for copy). This uses the in-page drag protocol only.
- **External targets** (File Explorer, Word, etc. that need real files): on Windows/Electron you must use **Alt+drag** — hold **Alt** and start dragging from a result row or a **Shelf** chip. That uses the OS native file drag (`CF_HDROP`). A plain drag does **not** supply that, so external apps may see no usable file data.
- **OS drag** (Shelf toolbar button): arms **one** upcoming row or chip drag to use the same native path as **Alt+drag**, so you can avoid holding Alt for that single gesture.
- **Open** the Shelf staging folder on disk from **Settings** (Shelf row).

Normal and native drags cannot be combined in one gesture: native drag blocks the UI thread until you drop, which is why in-app moves stay on the default path and Explorer-style drops need Alt or **OS drag**.

## Layout

Drag the **splitter** between the main area and the **Viewer** (width saved). Drag column header **right edges** in the results table to resize columns (saved).

## Search options

The **query** and **Settings** fields update results live (debounced). Toggles map to Everything: case, whole word, path, regex, diacritics. Next to the search row, **Both** / **Folders only** / **Files only** pick what Everything returns (`folder:` / `file:` when narrowed; [docs](https://www.voidtools.com/support/everything/searching/)).

**Sort** uses column headers; order is sent to Everything. **Sort folders with files** (Settings, default on) merges folders and files by that column; off keeps Everything’s usual folders-first order.

**Hide “dot” folders** (advanced): hides paths under segments like `.git` or `.vscode` (see the in-app tooltip; leaf dotfiles such as `.env` are different).

## Viewer

The **Viewer** shows path, type, size, modified. **Folders**: `readme.md` editor with Markdown preview ([marked](https://marked.js.org/)). **`.md` / `.txt`**: same editor + preview/autosave (UTF-8). **`.gdoc` / `.gsheet` / `.gslides`** (Google Drive shortcuts): **Open in app window** loads Docs/Sheets/Slides in a child Electron window (persistent login partition). **PDF** and other Office types where supported ([mammoth](https://github.com/mwilliamson/mammoth.js) / [SheetJS](https://sheetjs.com/) via CDN; legacy `.doc` stays “use Open”). Large files may not preview.

Read/write uses UTF-8. **Tags / rename** still requires paths under **Scope folder** when that field is set.
