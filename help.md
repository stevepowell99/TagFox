<!--
  Help — source for help.html (npm run build:help). Loaded into index.html via sync XHR → #helpModalContainer.

  ========== DEVELOPER / TECHNICAL (hidden from the UI) ==========

  Dev: Enable Everything HTTP → in repo: npm install && npm start → Settings: base URL (optional starting current folder).

  Hot reload: F5 = refresh search in app; View → Reload (click) = full window reload; Restart TagFox (Ctrl+F5), Toggle DevTools (Ctrl+Shift+I).
  On Windows the menu bar is hidden by default; Alt toggles it.
  | Any app code (index.html, styles.css, tags.js, renderer.js, preload.js, main.js) | restart TagFox (Ctrl+F5) |

  Ship: npm run dist (electron-builder) → NSIS under dist/. Not code-signed; SmartScreen may warn recipients.

  Everything sort-mix: (implementation — do not remove) The HTTP API returns all folders before all files for a given sort. With Max results capped,
  a scope with many folders can yield folder-only pages and zero visible files. Everything 1.5a adds sort-mix: so files and folders interleave in true sort order.
  TagFox appends sort-mix: when Hide files is OFF (renderer.js, runSearch()).
  Ref: https://www.voidtools.com/forum/viewtopic.php?t=8994

  Row ⋯ menu: main process (Menu, shell, clipboard). Windows: Copy for Explorer paste (CF_HDROP), full path, parent, name only, slashes, file:// where applicable.
  Ctrl+Shift+C: copy full path(s) as text. Paste from Explorer into current folder (Windows). If the clipboard has no file list but has a bitmap (screenshot, copied image), paste saves Clipboard image.png in the current folder. Then Open, Reveal, Terminal, Notepad, Delete, etc.

  Drag and drop: default row/Shelf drag uses TagFox’s in-page protocol (move/copy inside the app; Shift = copy). External apps need Alt+drag or the Shelf “OS drag” arm for native paths (CF_HDROP). Native drag blocks the UI thread, hence the split.

  Hide special / Hide ~ (Advanced): client-side only — filteredRows() uses pathUnderHideSpecialSegments() and pathUnderTildeSegment() in renderer.js; Everything query unchanged (pagination still uses raw hit count per page).

  Active tag filters: sent to Everything as a regex clause so matches exist before results load. Tag bar ↻ runs a full-index xk… scan and prunes ghosts; normal searches do not.

  Bulk rename preview: first 200 rows in the dialog only; Rename applies to the full batch captured at open. Wildcard Find uses same Match case as the search row.

Keyboard nuance: `/` and `Ctrl+U` toggle focus into / out of the search box when no dialog is open and focus is not already in another text field. `F1` and `Ctrl+/` open help. `Esc` clears the query when it has text if no dialog or open dropdown needs `Esc` and focus is not in another text field (see Shortcuts table for fuller behaviour).

  Tab boundaries: see scripts/build-help.js — each pane is introduced by a single-line HTML comment whose body is help:tab plus JSON (id, label, exactly one "active":true, optional "format":"html" for raw HTML). Run npm run build:help after edits.

  Collapsed-folder query exclusion (planned / Option A): Currently, collapsed tree folders are cosmetic — their children still count
  against the results-per-page cap, so large collapsed subtrees eat the budget and force many "Load more" clicks. The fix: in
  runSearch(), for each top-level path in collapsedFolderPaths, append !"C:\...\folder\" to the Everything search text. The trailing
  backslash means "items under this folder", which excludes children but not the folder row itself — exactly what we need. Nested
  collapsed folders only need the topmost ancestor excluded. "Load more" inherits the same searchText via resultsPagingCtx, so paging
  automatically skips collapsed subtrees. Main complexity: unfolding a folder whose children were excluded requires a re-search (or
  targeted sub-query) since the rows aren't in lastRows. Mitigation: on twisty expand, check if children exist in lastRows; if yes,
  show them instantly (current cosmetic behaviour); if no, re-run runSearch(). The "N hidden" badge would change to a generic
  "collapsed" indicator for server-excluded folders (exact count unknown without a separate query). See also: composeScopedEverythingSearch(),
  folderScopeEverythingToken(), appendRecencyToEverythingQuery() for the query-building pipeline where the exclusion would slot in.
-->

<!-- help:tab {"id":"essentials","label":"🚀 Get started","active":true} -->

Welcome to TagFox — a fast, keyboard-friendly file manager powered by instant search.

1. **🔌 First, make sure Everything Search is running.** TagFox relies on [Voidtools Everything](https://www.voidtools.com/) for its speed. See **📦 Installation** for setup. If results are empty, Everything probably isn't running.
2. **🧱 Optional scope (recommended on a new PC):** open **Settings** and set **one** optional **search scope folder** (e.g. **Set profile folder**, or **Set folder…**). Everything then only returns paths under that root. The breadcrumb’s **first** segment is that folder (you cannot navigate above it). Your **current folder** can narrow further inside it, or stay empty to search the whole tree under the scope. **Clear scope** removes the ceiling (whole index, subject to the breadcrumb).
3. **📂 Pick a folder to work in.** The breadcrumb bar shows your scope root (if set) and current folder — search, paste, and new files use the current folder when it is set, otherwise the scope root. Clear the current folder (×) to widen to the whole scope tree; **Clear scope** in Settings removes the ceiling entirely.
4. **👁️ Switch views to suit the task.** Toggle between Flat/Tree/Smart, Subfolders on/off, and Files+Folders/Folders only with the buttons next to the search box (or keys `x` for Smart, `l` to cycle layout, `s`, `f`).
5. **🏷️ Tag your files and folders for easy organisation.** Add tags like `draft`, `urgent`, or `2026` to any file or folder — then filter by tag to find exactly what you need. Tags are stored in the filename itself, so they travel with your files everywhere (Explorer, Google Drive, zip files). See **🏷️ Tags** for details.
6. **⭐ Save favourite folders and searches.** Click 💾 to bookmark a folder or an entire search. Jump back with a click or `Ctrl`+`1`…`9`. See **⭐ Favourites**.
7. **👀 Preview files without leaving TagFox.** The Viewer panel (right side) shows images, PDFs, Office docs, markdown, and more. For folders, it shows a folder readme doc you can edit in place. View and edit google files like gdocs, gslides without leaving TagFox.
8. **❓ Press `F1` or `Ctrl`+`/` anytime** to reopen this help.

<!-- help:tab {"id":"motivation","label":"💡 Why TagFox?"} -->

### 🦊 What TagFox does differently

TagFox combines **instant search** (powered by Everything) with a **folder tree view** — so you see results *in context*. You can navigate folders, tag files, preview documents, and manage simple project specifications and tasks without ever opening File Explorer.

**Tags** are short labels you attach to files and folders to organise your work. You can filter by tag to instantly find everything marked that way. Windows has no native equivalent, so TagFox fills that gap. TagFox stores tags in the filename itself (e.g. `Report xkTODO xxKEY.docx`), so they travel with the file: no database, no hidden metadata. They work in Explorer, Google Drive, zip exports, everywhere.

Tags come from a fixed vocabulary in three families: `xk` status (`TODO`, `WAITING`, `LATER`), `xp` person (`GCC`, `STEVE`, `CLAUDE`), and `xx` label (`PUB`, `INFO`, `KEY`). Only these words are treated as tags, which keeps ordinary filenames from being mistaken for tags. Bodies are always uppercase and you do not type the prefix; type `todo` and TagFox writes `xkTODO`. To add a word to the vocabulary, edit `TAG_VOCAB` in `tags.js`.

A fourth family is deadlines: `xd-` plus an ISO date, e.g. `xd-2026-07-15`. Type a date like `2026-07-15` and TagFox writes `xd-2026-07-15`. The `xd-` marks it as a deadline so it stands apart from incidental dates in filenames; filter or search `xd-` to see every deadline.

### 🤔 The problems TagFox solves

Searching the web feels instant. Searching your own hard drive? Painfully slow — unless you use an index tool like **Voidtools Everything**. But even Everything gives you a flat list of results without showing *where* things fit in your folder structure.

Meanwhile, tools like Google Drive train you to type a word and expect the right file. But you still get a flat list. When your projects have folders with similar names, you quickly lose track of what belongs where.

<p class="text-muted mb-0">TagFox is deliberately simple: fast search, tags, previews, keyboard shortcuts, favourites, and a shelf — not a full project-management suite.</p>

<!-- help:tab {"id":"features","label":"✨ Features"} -->

- ⌨️ **Keyboard-first** — navigate, tag, rename, bulk-edit and search without touching the mouse. See **⌨️ Shortcuts**.
- ⭐ **Favourite folders & saved searches** — drag chips to reorder; folders: `Ctrl`+`Shift`+`1`…`9`; saved searches: `Ctrl`+`1`…`9` (or click).
- 🔍 **Three view switches** — Flat/Tree, Subfolders on/off, Files+folders/Folders only (combine freely). Plus recency buttons (1h, 1d, 1w, 1m, 1y) to filter “what changed recently”.
- 👁️ **Fast previews** — images, PDFs, Word, Excel, PowerPoint, text, JSON, markdown and more, right in the Viewer panel.
- 🏷️ **Filename tags** — add, remove and filter by `xk`/`xp`/`xx` tags. Tags scan your folder automatically; click them to filter results.
- 📋 **Add TODO** — create a small markdown file tagged `xkTODO` in the current folder, right from the Viewer panel.
- 📝 **Folder docs** — Viewer loads the first of `-readme.md` → `-readme.txt` → `readme.md` → `readme.txt` → `claude.md` → `agents.md` → `about.md` → `about.txt` → `context.md` → `context.txt` → `index.md` → `index.txt` (details under **📁 Files & folders**).
- 📦 **Shelf** — a visual staging area for files, like a kind of clipboard. Copy items onto the Shelf, navigate to another folder, paste them. The Shelf keeps them as you move around.
- 🔄 **Bulk rename** — check several files (or highlight one), press `Ctrl`+`H`, use wildcards (`*` / `?`) on the **last path segment only**; live preview shows the first 200 rows but **Rename** still applies to the whole batch captured when the dialog opened. **Match case** follows the search row toggle.
- 📏 **Layout** — drag the splitter between results and the Viewer (width saved).
- 🗂️ **Result tabs** — open throwaway scratch tabs above the results (the `+` button, up to 10), each with its own search, scope and filters. Switch with a click, `Ctrl`+`Tab` / `Ctrl`+`Shift`+`Tab`, or by dragging a file onto a tab to spring it open. Drag tabs to reorder; middle-click or × to close. Tabs are kept for the session.
- ☁️ **Mixed local + Google Docs** — local Office files preview inline; Google Workspace shortcuts (`.gdoc`, `.gsheet`, `.gslides`) open in a popup window. On Windows with Google Drive for Desktop, TagFox resolves the Doc URL from the shortcut file or from the `user.drive.id` virtual stream when the stub JSON cannot be read (including many `.shortcut-targets-by-id` paths). That path usually works for **streamed** (on-demand) files too, not only fully mirrored ones.
- 🔗 **Google Drive shortcut folders** — Google Drive for Desktop stores shared-folder shortcuts under `.shortcut-targets-by-id\<long ID>`. TagFox auto-resolves the real folder name: the Name column shows 🔗 plus the actual name, and the breadcrumb and Path column collapse the ugly ID segments. Hover any collapsed path for the full raw path. The resolved names are cached across restarts.


<!-- help:tab {"id":"search","label":"🔍 Search & views"} -->

### 📂 Current folder

- The **breadcrumb** under the favourites row shows your **scope folder** (if set in Settings) as the first segment, then your **current folder** beneath it. Everything you search, create and paste uses the current folder when set; if only the scope is set, those actions use the scope root. Clear the current folder (×) to widen to the whole tree under the scope. **Settings → Search scope folder** sets or clears the hard ceiling. If the search box still has text when you change folder (double-click a folder row, breadcrumb, favourites, etc.), that filter stays on; the search row flashes briefly as a reminder.
- The ✏️ **pen button** lets you type a path directly. Press `Enter` to apply, `Esc` to cancel.
- The 🕐 **clock button** (or `Ctrl`+`L`) lists **recent folders** only (paths you have used), not full search snapshots. Full search history is `Alt`+`←` / `→` (or the toolbar arrows).

### 🔍 Searching

- Type in the search box — results update as you type. Press `Enter` to force a refresh.
- Tip: `foo|bar` matches either word. `!foo` excludes files matching “foo”.
- Next to the search row, **Both** / **Folders only** / **Files only** narrow what Everything returns (`folder:` / `file:` when narrowed). See [Everything searching](https://www.voidtools.com/support/everything/searching/).
- Three toggles sit as standalone icons next to the search row: **Match path** (route icon, `p` / `Ctrl`+`P`), **Hide special** (eye-slash, `.` / `Ctrl`+`.`) and **Hide ~** (`~` glyph, `t` / `Ctrl`+`T`). The **More match options** button (font icon) holds the rest: match case, whole word (`w` / `Ctrl`+`W`), respect accents. **Hide special** removes rows whose path has a segment starting with `.` or `$`, or equals `desktop.ini` (`..` is ignored; `.shortcut-targets-by-id` is kept). **Hide ~** removes rows with any segment starting with `~` (e.g. profile junctions). Both are **table only**; Everything still fetches up to **Results per page** before filtering — if the list looks empty, raise that limit, use **Load more**, or narrow scope/query. When those rows are still shown (toggles off), **Hide special** matches fade more (lower opacity) than **~** matches.
- **Tree** / **Smart** / **Flat** (`l` cycles; `x` → Smart): Tree hides the Path column and groups by folder; Tree mode keeps path sort A→Z. Size/Modified/Name sorts switch to Flat (status bar note).

### 👁️ View toggles

Three icon-pair switches next to the search box — combine them freely:

- <i class="fa-solid fa-wand-magic-sparkles fa-fw"></i> **Smart** (`x` jumps here; `l` cycles) — auto-adjusts subfolders and files/folders for manageable lists.
- <i class="fa-solid fa-list fa-fw"></i> / <i class="fa-solid fa-sitemap fa-fw"></i> **Flat / Tree** (`l` cycles all three layouts) — flat list with Path column, or tree layout grouped by folder.
- <i class="fa-solid fa-folder-tree fa-fw"></i> / <i class="fa-solid fa-folder fa-fw"></i> **Subfolders on / off** (`s`) — include items from subdirectories, or show only this folder.
- <i class="fa-solid fa-copy fa-fw"></i> / <i class="fa-solid fa-folder fa-fw"></i> **Files+folders / Folders only / Files only** (`f` cycles the three) — control what Everything returns for the list.

### ⏱️ Recency & sorting

- The **recency buttons** (1h, 1d, 1w, 1m, 1y, All) filter results to items modified recently — handy for “what did I change today?”.
- Click any **column header** to sort by that column. Click again to reverse. Drag the edges between headers to resize columns — widths are saved.
- With focus outside a text field, `z` / `m` / `n` sort by size / modified / name (like clicking those columns; repeat to flip). `t` opens tag edit like `Ctrl`+`T`.
- On large scopes, Everything 1.5+ is recommended so files don’t get pushed entirely off the first “page” of results by folders (TagFox asks the index for mixed file/folder ordering when folders and files are shown together).

### ⏪ Search history

- Use `Alt`+`←` / `→` (or the arrow buttons top-left) to step back and forward through your recent searches. Each step restores the full search — query, folder, Settings scope folder, tags, toggles, and sort.

<!-- help:tab {"id":"files-folders","label":"📁 Files & folders"} -->

### 🧭 Breadcrumb navigation

- **Paste image (Windows):** with a **current folder** set and focus outside a text field, **Ctrl**+**V** pastes Explorer files as usual; if the clipboard has **no file paths** but has a **screenshot or copied image**, TagFox saves **`Clipboard image.png`** there (then `Clipboard image (1).png`, …) and refreshes results.

- Click any segment of the breadcrumb to jump to that folder.
- The small **▾** arrows between segments show sibling folders; the one after the last segment shows children. You can hover into nested menus to drill down quickly.
- **K** / **J** — previous or next sibling folder; ▲ (in the last breadcrumb segment) goes to the parent folder.

### 🏷️ Tags

- Tags appear as coloured chips in the tag bar (below the breadcrumb). Each click cycles the chip: **include** (coloured) → **exclude** (red, struck-through, shown as `¬TAG`) → off. Exclude means "not this tag", so you can build filters like `TODO` and `¬CLAUDE` (TODOs that are not Claude's). The **AND / OR** switch combines all chips, mixing includes and excludes. Counts in parentheses reflect the current result list (after filters), capped by **Max results**.
- The **↻** control at the end of the tag row re-runs the main search and rescans the whole index for `xk`/`xp`/`xx` tag tokens, pruning remembered/active tags that no longer appear — use if the bar looks stale or after bulk renames outside TagFox. Ordinary searches do not do that full scan.
- To edit a file's tags: select the row and press `Ctrl`+`T`, or use the **Tags** button in the bulk bar. **Add** or removing a chip renames on disk immediately. When a **current folder** is set, renames must stay under that path.
- Tags are stored as trailing prefixed tokens before the extension, e.g. `Notes xxINFO.md`. A token is a tag only when it is a vocabulary word with its family prefix (e.g. `xkTODO`, `xpGCC`, `xxPUB`); anything else is literal text.
- Tag files, not folders. Renaming a folder to tag it is risky (it breaks shortcuts, saved paths and shared-folder names). To tag a folder, tag a readme inside it: any `.md` whose name contains `readme` is treated as the folder's doc, so `TreeAid readme xkTODO.md` both tags the folder and still shows as its folder doc. Never rename `CLAUDE.md` to tag it — that name is special and renaming it would hide it from Claude.
- **Deadlines.** Set a deadline with the date picker in the tag editor or the Add TODO box; it is stored as `xd-2026-07-15`. The deadline buttons on the toolbar (Overdue, Today, This wk, Next wk) filter results to files whose deadline falls in that range; pick one (they are single-select), and the **✕** button clears it. Week ranges run Monday to Sunday, and This wk includes today.

### 📄 Viewer panel

- Select a file to see its details and preview on the right. Supports images, PDFs, Office files, markdown, text, audio, and video.
- For folders, the Viewer shows a **folder doc** — the first match it finds (case-insensitive basename): `-readme.md` → `-readme.txt` → `readme.md` → `readme.txt` → `claude.md` → `agents.md` → `about.md` → `about.txt` → `context.md` → `context.txt` → `index.md` → `index.txt`. **Edit** opens the editor (live preview); **Save** writes to disk, closes the editor, and refreshes the search. If none of those files exist yet, saving creates `-readme.md`.
- The row **⋯** menu gives you options to open, reveal in Explorer, copy the path, and more.
- Press `Shift`+`Space` to expand the Viewer to near-fullscreen.
- Google Workspace shortcuts (`.gdoc` / `.gsheet` / `.gslides`): **Open** uses an in-app window when TagFox can get the document URL (from the stub JSON, or on Windows from the Drive stream `filename:user.drive.id`). Streamed-only files are usually fine; if not, use Open again, context “Search Google Drive…”, or hydrate the file in Drive.

<!-- help:tab {"id":"favourites","label":"⭐ Favourites"} -->

### 📂 Favourite folders

- The **left-hand folder sidebar** is the whole column on the left. It contains **Favourite folders** at the top, then **Recent folders** and **Recent files** below.
- The 💾 **save button** saves the current folder into the **Favourite folders** part of that sidebar. Click a folder pill to jump there; × removes it.
- Each folder row has a main pill plus a ▾ button. Click the main pill to go there; use ▾ to browse subfolders without leaving your current place first.
- The sidebar has two display modes:
  - **Fixed Mode**: the column stays open at its normal saved width, so long names are truncated to fit.
  - **Peek Mode**: the column collapses to a thin strip. Hover it to peek it open temporarily, or click the rail button to return to Fixed Mode.
- In **Peek Mode**, the sidebar also peeks open while you drag files onto it. That lets you reach the folder pills and their ▾ menus during a drag, and while it is peeked open the full names are shown instead of being truncated.
- **Drag** a favourite folder pill (grab anywhere except the subfolder ▾ control or ×) to reorder. While dragging, the **gaps** between pills widen and the **active gap** highlights — drop there (not on a pill). `Ctrl`+`Shift`+`1`…`9` follows *top-to-bottom* order.

### 🔖 Saved searches

- The 💾 on the **saved searches** row saves your entire search state — query, folder, tags, filters, sort, and view mode.
- **Drag** a numbered chip (not ×) to reorder; the **highlighted gap** is the drop target. `Ctrl`+`1`…`9` restores the search in that slot, or click the chip.
- Favourite folders and saved searches are your **persistent** bookmarks (`Ctrl`+`1`…`9`); result tabs (see **✨ Features**) are for **throwaway** working views you open and close.

<!-- help:tab {"id":"shelf","label":"📦 Shelf"} -->

### 📦 What is the Shelf?

The Shelf is the narrow vertical strip to the right of the results table. It's a **staging area** for files you want to move or copy between folders.

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

- 📋 **Add TODO** — in the Viewer panel, type a title and hit save. TagFox creates a markdown file like `Buy milk xkTODO.md` in your current folder. The `xkTODO` tag makes it easy to find later.
- 📝 **Folder docs** — write a short description of what a folder is for. Tag it *active*, *archived*, etc. to track project status. Filter by tag to see only active work.
- 🌲 **Tree view + tags = lightweight project management.** You can organise a whole project with markdown notes, tags, and folder docs — no proprietary database. Everything stays as normal files that work in Explorer, Drive, and zip exports.

<p class="text-muted mb-0">💡 Tip: if renaming <strong>folders</strong> on synced Google Drive is unreliable, just tag <em>files</em> instead and add a folder doc (e.g. <code>-readme.md</code>) in the folder root.</p>

<!-- help:tab {"id":"gotchas","label":"⚠️ Gotchas"} -->

Things that might trip you up:

- ☁️ **Cloud “streaming” mode** (Google Drive / OneDrive) — files look local but download on demand. Search and previews usually work, but renames, moves and deep paths can fail or behave oddly. If you switch to “full mirroring” in your sync app, things work more reliably.
- 📂 **Tagging folders** means renaming them on disk. Windows sometimes blocks renames if something has the folder open (e.g. a terminal, an editor). Tagging *files* is always reliable.
- 📄 **Google Docs shortcuts** (`.gdoc` etc.) show one name in Drive on the web and a different name locally after you tag them — this mismatch is expected.
- 📱 **Opening Docs/Sheets/Slides from Drive:** TagFox first reads the small JSON stub; if that fails (e.g. under `.shortcut-targets-by-id`), Windows + Google Drive for Desktop can still expose the cloud file id on the stream `yourfile.gdoc:user.drive.id`. That is metadata from the Drive client and normally works for **streamed** as well as **mirrored** files, without downloading the whole document. If the id is not ready (`local…` placeholder) or your install does not expose the stream, use normal **Open**, Search in Drive from the row menu, or open the file once in the browser.
- 👥 **Shared Drive files** from other people may not resolve in the popup if your account cannot read the stub or stream; permissions and client version still matter.
- 🔧 **Use Everything 1.5a.** TagFox relies on `sort-mix:` for mixed file/folder ordering. `1.4.x` may connect over HTTP, but it is not the supported setup.
- ⚡ **Everything must be running.** TagFox only talks to Everything's HTTP server — if Everything is closed, you'll get no results.

<!-- help:tab {"id":"installation","label":"📦 Installation"} -->

1. **Install Everything 1.5a.** Download it here: <a href="https://www.voidtools.com/everything-1.5a" target="_blank" rel="noopener">Everything 1.5a downloads</a>. Then install the HTTP Server plugin for your build: <a href="https://www.voidtools.com/Everything-HTTP-Server-1.0.3.4.x64-Setup.exe" target="_blank" rel="noopener">x64 installer</a>, <a href="https://www.voidtools.com/Everything-HTTP-Server-1.0.3.4.x86-Setup.exe" target="_blank" rel="noopener">x86 installer</a>. Let Everything finish its first index.

2. **Turn on HTTP Server in Everything.** Go to **Tools → Options → HTTP Server**, turn it on, and keep the default address `127.0.0.1` and port `8080` unless you want something else.

3. **Start TagFox and connect it.**
   - **If you installed TagFox from a `.exe`:** just launch TagFox.
   - **If you cloned the repo:** in the TagFox folder run `npm install` then `npm start`.
   In **Settings**, under **Connection to Everything Search**, use the same URL. Default: `http://127.0.0.1:8080`. If you set HTTP auth in Everything, enter the same username/password here. Optional: under **Search only inside one folder**, choose one main folder to keep searches narrower.

<!-- help:tab {"id":"shortcuts","label":"⌨️ Shortcuts","format":"html"} -->

<p class="text-muted mb-2 mt-3">Most shortcuts are disabled while a dialog is open. Bare-letter shortcuts work only outside text fields. Checked rows are the bulk selection. Repeating sort keys toggles direction; in <strong>Tree</strong>, sort keys switch to <strong>Flat</strong> first. <kbd>Esc</kbd> clears the query; with an empty query in the search box, it clears the current folder.</p>

<h5 class="help-md-section-title">Search &amp; view</h5>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>/</kbd> / <kbd>Ctrl</kbd>+<kbd>U</kbd></td><td>Focus / unfocus search</td></tr>
<tr><td><kbd>Esc</kbd></td><td>Close Viewer / flyouts, or clear query / current folder</td></tr>
<tr><td><kbd>F5</kbd></td><td>Refresh results</td></tr>
<tr><td><kbd>i</kbd> / <kbd>Ctrl</kbd>+<kbd>I</kbd></td><td>Cycle layout</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd></td><td>Reset to Smart view defaults (subfolders on, files + folders; not Flat), plus clear tag filters, recency <strong>All</strong>, whole word off</td></tr>
<tr><td><kbd>w</kbd> / <kbd>Ctrl</kbd>+<kbd>W</kbd></td><td>Toggle whole word</td></tr>
<tr><td><kbd>p</kbd> / <kbd>Ctrl</kbd>+<kbd>P</kbd></td><td>Toggle match path</td></tr>
<tr><td><kbd>.</kbd> / <kbd>Ctrl</kbd>+<kbd>.</kbd></td><td>Toggle hide special (dot / <kbd>$</kbd> paths)</td></tr>
<tr><td><kbd>t</kbd> / <kbd>Ctrl</kbd>+<kbd>T</kbd></td><td>Toggle hide ~ paths</td></tr>
<tr><td><kbd>s</kbd> / <kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Toggle subfolders</td></tr>
<tr><td><kbd>f</kbd> / <kbd>Ctrl</kbd>+<kbd>F</kbd></td><td>Cycle content mode</td></tr>
<tr><td><kbd>r</kbd> / <kbd>Ctrl</kbd>+<kbd>R</kbd></td><td>Cycle recency</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd></td><td>Toggle recency between <strong>All</strong> and <strong>1h</strong> only</td></tr>
<tr><td><kbd>z</kbd> / <kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Sort by size</td></tr>
<tr><td><kbd>m</kbd> / <kbd>Ctrl</kbd>+<kbd>M</kbd></td><td>Sort by modified</td></tr>
<tr><td><kbd>n</kbd> / <kbd>Ctrl</kbd>+<kbd>N</kbd></td><td>Sort by name</td></tr>
</tbody></table></div>

<h5 class="help-md-section-title">Navigation</h5>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Move selection</td></tr>
<tr><td><kbd>j</kbd> / <kbd>Ctrl</kbd>+<kbd>J</kbd> and <kbd>k</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Next / previous sibling folder</td></tr>
<tr><td><kbd>Home</kbd> / <kbd>End</kbd></td><td>First / last row</td></tr>
<tr><td><kbd>Enter</kbd></td><td>Open / enter folder</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Enter</kbd></td><td>Set current folder to selected row’s parent</td></tr>
<tr><td><kbd>→</kbd></td><td>Scope into selected folder</td></tr>
<tr><td><kbd>←</kbd></td><td>Scope toward parent</td></tr>
<tr><td><kbd>+</kbd> / <kbd>-</kbd></td><td>Expand / collapse tree folder</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>↑</kbd> or <kbd>Ctrl</kbd>+<kbd>↑</kbd></td><td>Parent of current folder</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Home</kbd></td><td>Clear current folder: search everywhere</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Home</kbd></td><td>Clear current folder, active tag filters, and recency (set to <strong>All</strong>)</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd></td><td>History back / forward</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>L</kbd></td><td>Recent folders list</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd></td><td>Next / previous result tab</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>W</kbd></td><td>New / close result tab</td></tr>
</tbody></table></div>

<h5 class="help-md-section-title">Selection &amp; file operations</h5>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>Space</kbd></td><td>Toggle checked row</td></tr>
<tr><td><kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd></td><td>Check range</td></tr>
<tr><td><kbd>Ctrl</kbd>+click a row</td><td>Toggle checked row</td></tr>
<tr><td><kbd>Shift</kbd>+click a row</td><td>Check range to clicked row</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Check all visible rows</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd></td><td>Copy / cut / paste checked files</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd></td><td>Copy full path(s) as text</td></tr>
<tr><td><kbd>F2</kbd></td><td>Rename the selected item</td></tr>
<tr><td><kbd>Del</kbd></td><td>Delete checked items</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd></td><td>Create a new folder</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>T</kbd> or <kbd>t</kbd></td><td>Edit tags on checked items</td></tr>
<tr><td><kbd>Shift</kbd>+<kbd>T</kbd></td><td>Remove tags from checked items</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>H</kbd></td><td>Bulk rename with wildcards</td></tr>
</tbody></table></div>

<h5 class="help-md-section-title">Favourites &amp; app</h5>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>…<kbd>9</kbd></td><td>Favourite folder 1-9</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>9</kbd></td><td>Saved search 1-9</td></tr>
<tr><td><kbd>Shift</kbd>+<kbd>Space</kbd></td><td>Toggle Viewer fullscreen</td></tr>
<tr><td><kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>/</kbd></td><td>Open this help</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>,</kbd></td><td>Open / close Settings</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Space</kbd></td><td>Show / hide TagFox from anywhere (default; change in Settings)</td></tr>
</tbody></table></div>
