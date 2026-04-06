<!--
  Help — source for help.html (npm run build:help). Loaded into index.html via sync XHR → #helpModalContainer.

  ========== DEVELOPER / TECHNICAL (hidden from the UI) ==========

  Dev: Enable Everything HTTP → in repo: npm install && npm start → Settings: base URL (optional starting current folder).

  Hot reload: View menu — Reload (Ctrl+R), Force reload (Ctrl+Shift+R), Ctrl+F5 / Ctrl+Shift+F5, Toggle DevTools (Ctrl+Shift+I).
  On Windows the menu bar is hidden by default; Alt toggles it.
  | Renderer: index.html, styles.css, tags.js, renderer.js | hard reload (Ctrl+Shift+R / Ctrl+F5 / Ctrl+Shift+F5); if UI still stale, npm start again |
  | preload.js, main.js | quit app and npm start |

  Ship: npm run dist (electron-builder) → NSIS under dist/. Not code-signed; SmartScreen may warn recipients.

  Everything sort-mix: (implementation — do not remove) The HTTP API returns all folders before all files for a given sort. With Max results capped,
  a scope with many folders can yield folder-only pages and zero visible files. Everything 1.5a adds sort-mix: so files and folders interleave in true sort order.
  TagFox appends sort-mix: when Hide files is OFF (renderer.js, runSearch()).
  Ref: https://www.voidtools.com/forum/viewtopic.php?t=8994

  Row ⋯ menu: main process (Menu, shell, clipboard). Windows: Copy for Explorer paste (CF_HDROP), full path, parent, name only, slashes, file:// where applicable.
  Ctrl+Shift+C (⌘+Shift+C on Mac): copy full path(s) as text. Paste from Explorer into current folder (Windows). Then Open, Reveal, Terminal, Notepad, Delete, etc.

  Drag and drop: default row/Shelf drag uses TagFox’s in-page protocol (move/copy inside the app; Shift = copy). External apps need Alt+drag or the Shelf “OS drag” arm for native paths (CF_HDROP). Native drag blocks the UI thread, hence the split.

  Hide special (advanced): hides paths with any segment starting with ., ~, or $, plus desktop.ini; .. and .shortcut-targets-by-id are not hidden.
  With Everything 1.5+, TagFox adds a !path:regex clause; on 1.4 that stack may not apply server-side — the table still filters the same client-side.

  Active tag filters: sent to Everything as a regex clause so matches exist before results load. Tag bar ↻ runs a full-index [( scan and prunes ghosts; normal searches do not.

  Bulk rename preview: first 200 rows in the dialog only; Rename applies to the full batch captured at open. Wildcard Find uses same Match case as the search row.

  Keyboard nuance: Ctrl+/ (⌘+/ on Mac) focuses search; plain / when no dialog is open. Esc clears the query when it has text if no dialog or open dropdown needs Esc and focus is not in another text field (see Shortcuts table for fuller behaviour).

  Tab boundaries: see scripts/build-help.js — each pane is introduced by a single-line HTML comment whose body is help:tab plus JSON (id, label, exactly one "active":true, optional "format":"html" for raw HTML). Run npm run build:help after edits.
-->

<!-- help:tab {"id":"essentials","label":"🚀 Get started","active":true} -->

Welcome! Here's the quick version — everything you need to know to start using TagFox.

1. **🔌 TagFox needs Everything Search.** It's a fast file-finder app by Voidtools. TagFox talks to Everything's HTTP server — without it running, you'll see an empty list. Set the URL in **Settings** (top-left).
2. **📂 Pick a folder to work in.** The breadcrumb bar (under the favourite chips) shows your *current folder*. Search, paste, and new files all happen inside it. Leave it empty to search your whole disk.
3. **👁️ Three view switches.** The icon-pair buttons next to the search box each let you pick between two modes: *Flat / Tree* view, *Subfolders on / off*, and *Files+folders / Folders only*. The active choice is highlighted. Keyboard shortcuts: `l`, `s`, `f`.
4. **🏷️ Tags live in filenames.** TagFox adds tags in a `[(tag1,tag2)]` block in the **last** `[ ( … ) ]` pair of a name segment (e.g. `Notes[(draft,review)].md` shows as `Notes.md`). Plain `[text]` without inner `()` is not a TagFox tag. They work everywhere — Explorer, Google Drive, zip files. No hidden database.
5. **⭐ Favourites instead of tabs.** Save folders and searches as chips; **drag** chips to reorder keyboard slots. `Ctrl`+`Shift`+`1`…`9` — folders; `Ctrl`+`1`…`9` — saved searches. See **⭐ Favourites** and **📦 Shelf**.
6. **👀 The Viewer panel** (right side) previews images, PDFs, Office files, markdown, and more. For folders, it shows a “folder doc” (`readme.md` etc.) you can edit right there.
7. **☁️ Cloud sync has limits.** Google Drive and OneDrive “streaming” mode (files download on demand) can make renames and moves unreliable — see **⚠️ Gotchas**.
8. **❓ Press `F1` anytime** to reopen this help. It remembers which tab you were on.

<!-- help:tab {"id":"motivation","label":"💡 Why TagFox?"} -->

### 🤔 The problem

Searching the web feels instant. Searching your own hard drive? Painfully slow — unless you use an index tool like **Voidtools Everything**. But even Everything gives you a flat list of results without showing *where* things fit in your folder structure.

Meanwhile, tools like Google Drive train you to type a word and expect the right file. But you still get a flat list. When your projects have folders with similar names, you quickly lose track of what belongs where.

### 🦊 What TagFox does differently

TagFox combines **instant search** (powered by Everything) with a **folder tree view** — so you see results *in context*. You can navigate folders, tag files, preview documents, and manage simple project TODOs without ever opening File Explorer.

Tags are stored in the filename itself (e.g. `Report[(draft,urgent)].docx`), so they travel with the file — no proprietary database, no hidden metadata folders. They work in Explorer, Google Drive, zip exports, everywhere.

<p class="text-muted mb-0">TagFox is deliberately simple: fast search, tags, previews, keyboard shortcuts, favourites, and a shelf — not a full project-management suite.</p>

<!-- help:tab {"id":"features","label":"✨ Features"} -->

- ⌨️ **Keyboard-first** — navigate, tag, rename, bulk-edit and search without touching the mouse. See **⌨️ Shortcuts**.
- ⭐ **Favourite folders & saved searches** — drag chips to reorder; folders: `Ctrl`+`Shift`+`1`…`9`; saved searches: `Ctrl`+`1`…`9` (or click).
- 🔍 **Three view switches** — Flat/Tree, Subfolders on/off, Files+folders/Folders only (combine freely). Plus recency buttons (1h, 1d, 1w, 1m, 1y) to filter “what changed recently”.
- 👁️ **Fast previews** — images, PDFs, Word, Excel, PowerPoint, text, JSON, markdown and more, right in the Viewer panel.
- 🏷️ **Filename tags** — add, remove and filter by `[(tag)]` labels. Tags scan your folder automatically; click them to filter results.
- 📋 **Add TODO** — create a small markdown file tagged `[(TODO)]` in the current folder, right from the Viewer panel.
- 📝 **Folder docs** — Viewer loads the first of `readme.md` → `readme.txt` → `claude.md` → `agents.md` → `about.md` → `about.txt` → `context.md` → `context.txt` → `index.md` → `index.txt` (details under **📁 Files & folders**).
- 📦 **Shelf** — a visual staging area for files. Copy items onto the Shelf, navigate to another folder, paste them. No tabs or split panes needed.
- 🔄 **Bulk rename** — check several files (or highlight one), press `Ctrl`+`H`, use wildcards (`*` / `?`) on the **last path segment only**; live preview shows the first 200 rows but **Rename** still applies to the whole batch captured when the dialog opened. **Match case** follows the search row toggle.
- 📏 **Layout** — drag the splitter between results and the Viewer (width saved).
- ☁️ **Mixed local + Google Docs** — local Office files preview inline; Google Workspace shortcuts (`.gdoc`, `.gsheet`, `.gslides`) open in a popup window. On Windows with Google Drive for Desktop, TagFox resolves the Doc URL from the shortcut file or from the `user.drive.id` virtual stream when the stub JSON cannot be read (including many `.shortcut-targets-by-id` paths). That path usually works for **streamed** (on-demand) files too, not only fully mirrored ones.

<!-- help:tab {"id":"search","label":"🔍 Search & views"} -->

### 📂 Current folder

- The **breadcrumb** under the favourites row shows your **current folder**. Everything you search, create and paste goes here. Clear it (× button) to search your whole index. If the search box still has text when you change folder (double-click a folder row, breadcrumb, favourites, etc.), that filter stays on; the search row flashes briefly as a reminder.
- `Ctrl`+`Backspace` (`⌘`+`Backspace` on Mac) clears the current folder from **any** focus when a folder is set — skipped while a dialog is open (and it overrides the usual “delete previous word” in text fields while a scope is active).
- The ✏️ **pen button** lets you type a path directly. Press `Enter` to apply, `Esc` to cancel.
- The 🕐 **clock button** (or `Ctrl`+`L`) lists **recent folders** only (paths you have used), not full search snapshots. Full search history is `Alt`+`←` / `→` (or the toolbar arrows).

### 🔍 Searching

- Type in the search box — results update as you type. Press `Enter` to force a refresh.
- Tip: `foo|bar` matches either word. `!foo` excludes files matching “foo”.
- Next to the search row, **Both** / **Folders only** / **Files only** narrow what Everything returns (`folder:` / `file:` when narrowed). See [Everything searching](https://www.voidtools.com/support/everything/searching/).
- The **Advanced** button opens extra options: match case, match path, whole word, diacritics. **Hide special** (there) hides paths with segments starting with `.`, `~`, or `$`, plus `desktop.ini`; works best server-side on Everything 1.5+.
- **Tree View** (sitemap icon next to the search box) is a one-click preset: path sort A→Z, Path column hidden, recursive on, files and folders. It stays on only while that whole bundle matches; changing sort, columns, recursive, or type filter turns it off.

### 👁️ View toggles

Three icon-pair switches next to the search box — combine them freely:

- <i class="fa-solid fa-list fa-fw"></i> / <i class="fa-solid fa-sitemap fa-fw"></i> **Flat / Tree** (`l`) — flat list with Path column, or tree layout grouped by folder.
- <i class="fa-solid fa-folder-tree fa-fw"></i> / <i class="fa-solid fa-folder fa-fw"></i> **Subfolders on / off** (`s`) — include items from subdirectories, or show only this folder.
- <i class="fa-solid fa-copy fa-fw"></i> / <i class="fa-solid fa-folder fa-fw"></i> **Files+folders / Folders only** (`f`) — show everything, or folders only.

### ⏱️ Recency & sorting

- The **recency buttons** (1h, 1d, 1w, 1m, 1y, All) filter results to items modified recently — handy for “what did I change today?”.
- Click any **column header** to sort by that column. Click again to reverse. Drag the edges between headers to resize columns — widths are saved.
- With focus outside a text field, `z` / `m` / `n` sort by size / modified / name (like clicking those columns; repeat to flip). `p` sorts by path (useful in tree view when the Path column is hidden). `t` opens tag edit like `Ctrl`+`T`.
- On large scopes, Everything 1.5+ is recommended so files don’t get pushed entirely off the first “page” of results by folders (TagFox asks the index for mixed file/folder ordering when folders and files are shown together).

### ⏪ Search history

- Use `Alt`+`←` / `→` (or the arrow buttons top-left) to step back and forward through your recent searches. Each step restores the full search — query, folder, tags, toggles, and sort.

<!-- help:tab {"id":"files-folders","label":"📁 Files & folders"} -->

### 🧭 Breadcrumb navigation

- Click any segment of the breadcrumb to jump to that folder.
- The small **▾** arrows between segments show sibling folders; the one after the last segment shows children. You can hover into nested menus to drill down quickly.
- The ◀ ▲ ▶ chevrons next to the search box go to the previous sibling, parent, or next sibling folder.

### 🏷️ Tags

- Tags appear as coloured chips in the tag bar (below the breadcrumb). Click a tag to filter results; click again to remove the filter. Counts in parentheses reflect the current result list (after filters), capped by **Max results**.
- The **↻** control at the end of the tag row re-runs the main search and rescans the whole index for `[(…)]` patterns, pruning remembered/active tags that no longer appear — use if the bar looks stale or after bulk renames outside TagFox. Ordinary searches do not do that full scan.
- To edit a file's tags: select the row and press `Ctrl`+`T`, or use the **Tags** button in the bulk bar. **Add** or removing a chip renames on disk immediately. When a **current folder** is set, renames must stay under that path.
- Tags are stored as `[(tag1,tag2)]` inside the **last** bracketed segment of a name piece — e.g. `Notes[(draft)].md` or a folder `Project[(2024,clientA)]`. Plain `[text]` without inner `()` is *not* a TagFox tag.

### 📄 Viewer panel

- Select a file to see its details and preview on the right. Supports images, PDFs, Office files, markdown, text, audio, and video.
- For folders, the Viewer shows a **folder doc** — the first match it finds (case-insensitive basename): `readme.md` → `readme.txt` → `claude.md` → `agents.md` → `about.md` → `about.txt` → `context.md` → `context.txt` → `index.md` → `index.txt`. You can edit and save there; if none exist, **Save** creates `readme.md`.
- The row **⋯** menu gives you options to open, reveal in Explorer, copy the path, and more.
- Press `Shift`+`Space` to expand the Viewer to near-fullscreen.
- Google Workspace shortcuts (`.gdoc` / `.gsheet` / `.gslides`): **Open** uses an in-app window when TagFox can get the document URL (from the stub JSON, or on Windows from the Drive stream `filename:user.drive.id`). Streamed-only files are usually fine; if not, use Open again, context “Search Google Drive…”, or hydrate the file in Drive.

<!-- help:tab {"id":"favourites","label":"⭐ Favourites"} -->

### 📂 Favourite folders

- The 💾 **save button** on the favourites row saves the current folder as a chip. Click a chip to jump there; × removes it.
- **Drag** a folder chip (grab anywhere except the subfolder ▾ control or ×) to reorder. While dragging, the **gaps** between chips widen and the **active gap** highlights — drop there (not on a pill). `Ctrl`+`Shift`+`1`…`9` follows *left-to-right* order.

### 🔖 Saved searches

- The 💾 on the **saved searches** row saves your entire search state — query, folder, tags, filters, sort, and view mode.
- **Drag** a numbered chip (not ×) to reorder; the **highlighted gap** is the drop target. `Ctrl`+`1`…`9` restores the search in that slot, or click the chip.
- Together, favourite folders and saved searches replace browser-style tabs — you get instant switching without the clutter.

<!-- help:tab {"id":"shelf","label":"📦 Shelf"} -->

### 📦 What is the Shelf?

The Shelf is the narrow vertical strip to the left of the results table. It's a **staging area** for files you want to move or copy between folders.

### 🔄 How to use it

1. Select files in the results and click **Add to Shelf** (or drag them onto the Shelf strip).
2. Navigate to a different folder.
3. Open the Shelf, select the items, and paste or drag them into the new location.

### 💡 Tips

- The **OS drag** button arms one drag from a row or Shelf chip with a native path for Explorer and other apps. Alternatively, hold `Alt` while starting a drag from a result row or Shelf chip. A normal drag without `Alt` stays inside TagFox only.
- The Shelf remembers its contents until you clear it — you can collect files from multiple folders before pasting.
- Think of it as a clipboard for files that doesn't disappear when you navigate away.

<!-- help:tab {"id":"projects","label":"📋 Projects & TODOs"} -->

TagFox lets you manage simple projects right on your filesystem — no separate app needed.

- 📋 **Add TODO** — in the Viewer panel, type a title and hit save. TagFox creates a markdown file like `Buy milk[(TODO)].md` in your current folder. The `[(TODO)]` tag makes it easy to find later.
- 📝 **Folder docs** — write a short description of what a folder is for. Tag it *active*, *archived*, etc. to track project status. Filter by tag to see only active work.
- 🌲 **Tree view + tags = lightweight project management.** You can organise a whole project with markdown notes, tags, and folder docs — no proprietary database. Everything stays as normal files that work in Explorer, Drive, and zip exports.

<p class="text-muted mb-0">💡 Tip: if renaming <strong>folders</strong> on synced Google Drive is unreliable, just tag <em>files</em> instead and add a <code>readme.md</code> in the folder root.</p>

<!-- help:tab {"id":"gotchas","label":"⚠️ Gotchas"} -->

Things that might trip you up:

- ☁️ **Cloud “streaming” mode** (Google Drive / OneDrive) — files look local but download on demand. Search and previews usually work, but renames, moves and deep paths can fail or behave oddly. If you switch to “full mirroring” in your sync app, things work more reliably.
- 📂 **Tagging folders** means renaming them on disk. Windows sometimes blocks renames if something has the folder open (e.g. a terminal, an editor). Tagging *files* is always reliable.
- 📄 **Google Docs shortcuts** (`.gdoc` etc.) show one name in Drive on the web and a different name locally after you tag them — this mismatch is expected.
- 📱 **Opening Docs/Sheets/Slides from Drive:** TagFox first reads the small JSON stub; if that fails (e.g. under `.shortcut-targets-by-id`), Windows + Google Drive for Desktop can still expose the cloud file id on the stream `yourfile.gdoc:user.drive.id`. That is metadata from the Drive client and normally works for **streamed** as well as **mirrored** files, without downloading the whole document. If the id is not ready (`local…` placeholder) or your install does not expose the stream, use normal **Open**, Search in Drive from the row menu, or open the file once in the browser.
- 👥 **Shared Drive files** from other people may not resolve in the popup if your account cannot read the stub or stream; permissions and client version still matter.
- 🔧 **Everything 1.5 vs 1.4** — some advanced search features work better with Everything 1.5+. Both versions work, but 1.5 is recommended.
- ⚡ **Everything must be running.** TagFox only talks to Everything's HTTP server — if Everything is closed, you'll get no results.

<!-- help:tab {"id":"installation","label":"📦 Installation"} -->

Getting TagFox up and running takes about five minutes:

1. **Install [Voidtools Everything](https://www.voidtools.com/)** and let it finish its first index. TagFox uses Everything for search — it won't work without it.

   <p class="small mb-0 mt-2"><strong>Everything 1.5 Alpha</strong> builds (e.g. <code>sort-mix:</code>): <a href="https://www.voidtools.com/everything-1.5a" target="_blank" rel="noopener">https://www.voidtools.com/everything-1.5a</a>. <strong>HTTP Server plug-in</strong> (required for HTTP on 1.5a): <a href="https://www.voidtools.com/Everything-HTTP-Server-1.0.3.4.x64-Setup.exe" target="_blank" rel="noopener">x64 installer</a>, <a href="https://www.voidtools.com/Everything-HTTP-Server-1.0.3.4.x86-Setup.exe" target="_blank" rel="noopener">x86 installer</a> — portable zips and other versions: <a href="https://www.voidtools.com/forum/viewtopic.php?t=9799" target="_blank" rel="noopener">voidtools forum: Plug-ins</a>.</p>

2. **Turn on the HTTP server** in Everything:
   - **Everything 1.5 (Alpha)**: install the HTTP Server *plugin* first, then go to **Tools → Options → HTTP Server** — turn it on, set address to `127.0.0.1` and port to `8080` (or your preference). Optionally set a username/password.
   - **Everything 1.4.x**: HTTP is built in — just go to **Tools → Options → HTTP Server** and enable it. No plugin needed.

3. **Start TagFox:** in the TagFox folder, run `npm install` then `npm start`.

4. **Configure the connection:** open **Settings** (top-left), set **Everything base URL** to match (e.g. `http://127.0.0.1:8080`). Optionally set a **starting current folder** so the breadcrumb opens in a chosen path (clear it to search the whole index). If you set HTTP auth in Everything, enter the same username/password here.

5. **Start browsing!** Set a folder using the breadcrumb or path editor, type in the search box, and you should see results instantly.

<!-- help:tab {"id":"shortcuts","label":"⌨️ Shortcuts","format":"html"} -->

<p class="text-muted mb-2 mt-3"><kbd>Ctrl</kbd> = <kbd>Ctrl</kbd> on Windows, <kbd>⌘</kbd> on Mac. Most shortcuts are disabled while a dialog is open.</p>

<h6 class="text-secondary mt-3 mb-1">Search &amp; view</h6>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>/</kbd></td><td>Toggle focus into / out of the search box (also <kbd>Ctrl</kbd>+<kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>F</kbd>)</td></tr>
<tr><td><kbd>Esc</kbd></td><td>Close expanded Viewer / flyouts; if no dialog or open menu needs it — clear query when it has text, or with focus in the search box and an empty query, clear current folder (whole index)</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Backspace</kbd></td><td>Clear current folder (whole index) from any focus when a folder is set; skipped if a dialog is open (replaces the usual “delete word” shortcut in text fields while scope is active)</td></tr>
<tr><td><kbd>F5</kbd> or <kbd>Ctrl</kbd>+<kbd>R</kbd></td><td>Refresh results</td></tr>
<tr><td><kbd>l</kbd></td><td>Switch Flat / Tree view</td></tr>
<tr><td><kbd>s</kbd></td><td>Switch Subfolders on / off</td></tr>
<tr><td><kbd>f</kbd></td><td>Switch Files+folders / Folders only</td></tr>
<tr><td><kbd>z</kbd> / <kbd>m</kbd> / <kbd>n</kbd></td><td>Sort by Size / Modified / Name (repeat toggles direction). In <strong>Tree</strong> view, those sorts or the same column headers switch to <strong>Flat</strong> first (status bar note); Tree alone keeps path A→Z.</td></tr>
</tbody></table></div>

<h6 class="text-secondary mt-3 mb-1">Navigation</h6>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Move through the results list</td></tr>
<tr><td><kbd>Home</kbd> / <kbd>End</kbd></td><td>Jump to first / last row</td></tr>
<tr><td><kbd>Enter</kbd></td><td>Open file or enter folder</td></tr>
<tr><td><kbd>→</kbd></td><td>Scope into selected folder</td></tr>
<tr><td><kbd>←</kbd></td><td>Scope to parent or first subfolder on the row's path</td></tr>
<tr><td><kbd>+</kbd> / <kbd>-</kbd></td><td>Expand / collapse folder in tree view; with multi-select (e.g.&nbsp;<kbd>Ctrl</kbd>+<kbd>A</kbd>) toggles all top-level folders</td></tr>
<tr><td><kbd>Backspace</kbd></td><td>Go up to the parent folder</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>↑</kbd></td><td>Go up to the parent of the <strong>current folder</strong> (including while the search box is focused)</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd></td><td>Search history back / forward</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>L</kbd></td><td>Recent folders list</td></tr>
</tbody></table></div>

<h6 class="text-secondary mt-3 mb-1">Selection &amp; file operations</h6>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>Space</kbd></td><td>Check / uncheck the current row</td></tr>
<tr><td><kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd></td><td>Extend selection up or down</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Select all visible rows</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd></td><td>Copy, cut, paste files (Explorer-compatible)</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd></td><td>Copy full path(s) as text</td></tr>
<tr><td><kbd>F2</kbd></td><td>Rename the selected item</td></tr>
<tr><td><kbd>Del</kbd></td><td>Delete selected items (Recycle Bin)</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd></td><td>Create a new folder</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>T</kbd> or <kbd>t</kbd></td><td>Edit tags on selected items (<kbd>t</kbd> when not typing in a field — use <kbd>Ctrl</kbd>+<kbd>T</kbd> from the search box)</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>H</kbd></td><td>Bulk rename with wildcards</td></tr>
</tbody></table></div>

<h6 class="text-secondary mt-3 mb-1">Favourites &amp; app</h6>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>…<kbd>9</kbd></td><td>Jump to favourite folder #1–9</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>9</kbd></td><td>Restore saved search #1–9</td></tr>
<tr><td><kbd>Shift</kbd>+<kbd>Space</kbd></td><td>Toggle Viewer fullscreen</td></tr>
<tr><td><kbd>F1</kbd></td><td>Open this help</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>,</kbd></td><td>Open / close Settings</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Space</kbd></td><td>Show / hide TagFox (system-wide; changeable in Settings)</td></tr>
</tbody></table></div>
