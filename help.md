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

Tags come from a fixed vocabulary in three families: `xk` status (`TODO`, `BLOCKING`, `WAITING`, `LATER`), `xp` person (`GCC`, `STEVE`, `CLAUDE`), and `xx` label (`PUB`, `INFO`, `KEY`). Only these words are treated as tags, which keeps ordinary filenames from being mistaken for tags. Bodies are always uppercase and you do not type the prefix; type `todo` and TagFox writes `xkTODO`. To add a word to the vocabulary, edit `TAG_VOCAB` in `tags.js`.

Two more families hold dates, and they answer different questions. A **deadline** is `xd-` plus an ISO date, e.g. `xd-2026-07-15`: when the thing is due. A **hide-until** is `xh-` plus a date, e.g. `xh-2026-09-01`: the date before which you do not want to see the thing at all. A file can carry one of each, which is the common case for something you cannot start yet but must finish by a fixed day. The prefixes mark both apart from the many incidental dates in filenames, so you can search `xd-` for every deadline and `xh-` for everything deferred.

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
- The 🕐 **clock button** (or `Ctrl`+`L`) lists your last 300 **recent folders** (paths you have used), not full search snapshots. Type in its filter box to narrow them fuzzily (letters in order, any part of the path); whole words and longer runs of letters rank well above letters scattered across the path, and `Enter` opens the best match. Full search history is `Alt`+`←` / `→` (or the toolbar arrows).

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

<!-- help:tab {"id":"runner","label":"🏃 Runner"} -->

### 🏃 What Runner is

- Runner is TagFox's layout: one large search box with a ranked list below it and the Viewer on the right third. The Classic layout that the other tabs of this help describe is being retired and no longer shows.
- Runner keeps its own search settings, so switching back and forth leaves Classic's view, filters and folder as they were.
- Inside a folder, its path runs along a thin line above the box. Click any folder in it to go there, or the › after a folder to pick one of the folders inside it. A long path shows its last few folders after `…`; point at the `…` for the whole path.
- Each row shows the name, the folder it is in, the size and when it last changed. Point at the time for the full date, or at a name with tags in front of it for the name on disk.
- Point at the folder's chip at the start of the box for its buttons: show in Explorer, copy, tags, terminal, copy the quoted path, and the full menu.
- Settings that differ from the defaults show as chips under the box. The line between the list and the Shelf shows a tip, which changes every few minutes. A message (an error, what an action did, the F5 report) takes its place for a few seconds; point at it to keep it there.
- **Settings → Hide the window's title bar** gives the list the space Windows' title bar and menu took, in either layout, from the next start. The minimise, maximise and close buttons stay at the top right; drag the window by the strip along the top.

### ⌨️ Keys

Type to search. With the box empty you see the current folder's own contents; once you type, the search covers everything below it, or only the folder's own contents while the `/` command **Search this folder only** is on (it shows as a chip). This list is drawn from the same table Runner's keys are read from, so it always matches them; `?` in an empty box opens it.

<div id="runnerKeysTable"></div>

### 🔎 What you can type

- A path goes there. Paste a folder's path (`C:\Users\Zoom\Downloads`, or Explorer's "Copy as path" with its quotes) and Runner opens that folder; paste a file's path and it opens the file's folder with the file selected. A typed path goes there when you press `Enter`, so until then it is searched for like any other text. A path that does not exist is just a search.
- A leading `-word` leaves out anything matching that word.
- A file type lists only that type: `.pdf`, or just `pdf` for the common document, image, audio and video types. Several (`.docx .pdf`) list any of them, and `-pdf` leaves a type out. A file type on its own lists the newest first; with other words, as in `budget xlsx`, the words decide the order. Words such as `map`, `log` and `key` stay words, so "causal map" is not a search for .map files.
- `^word` matches only where a word starts: `^map` finds `map.json` and `old map.md` but not `roadmap.txt`. The `/` command **Word starts only** does the same for every word.
- Everything's own syntax works as it does in Everything: `a|b`, `!word`, `"exact phrase"`, the `*` and `?` wildcards (which match the whole name), `ext:`, `dm:today`, `size:>1mb`, `regex:`, `path:`, `parent:`, `nopath:`, `wfn:`, `case:`, `startwith:` and `<grouping>`. See [Everything searching](https://www.voidtools.com/support/everything/searching/).

### 🏷️ Tags

- A row shows its tags in front of its name, as in Classic; the × on one takes that tag off the file.
- **`Ctrl`+`T`** opens the tag editor on the selected row, or on every checked row (`Shift`+`↓` checks a run of them). Adding or removing a tag renames the file on disk straight away. The row's hover buttons and its menu open the same editor.
- To list only the files carrying a tag, type `/` and the tag, for example `/todo`, and press `Enter`, or click the tag in the options panel (**Alt+O**). The filter shows as a chip under the box, such as **Tagged TODO**, and its × removes it. Two tags list the files that carry both.
- To leave a tag out, type `/not` and the tag (`/not claude`), or right-click the tag in the options panel, where it then shows as `¬CLAUDE`. The chip reads **Not tagged CLAUDE**, or **Tagged TODO and not CLAUDE** beside a tag you asked for. The same command or right-click again puts it back.
- With the box empty, a tag you ask for searches every folder below the current one, while a tag left out only thins the current folder's own list.
- Typing the word itself (`todo`) is an ordinary search: it also finds `todo list.txt`. The tag filter lists only files tagged `xkTODO`.

### 📅 Deadlines and stars

- The `/` commands **Overdue**, **Due today**, **Due this week** and **Due next week** list only the files whose `xd-` deadline falls in that range, from every folder below the current one. Weeks run Monday to Sunday. The range shows as a chip; its × or the same command again clears it.
- Files whose `xh-` hide-until date is still to come are left out. **Show files hidden until a later date** lists them as well.
- **Show only starred items** lists the starred files and folders below the current folder, or every star when there is no folder.

### 📊 How the list is ordered

- The smart order puts rows whose **name** matches above rows that match only in the **path**. Within the name, a whole word ranks highest, then a match at the start of a word, then one at the end of a word, then one inside a word (`map` finds `old map`, `mapping`, `roadmap`, then `xmapx`). After that it favours recent changes, though never enough to lift a file that only contains the word above an older one named for it, starred items, things you open often, and files and folders in Windows' own Recent list (opened lately in any app), the more so the more recently. It puts anything under an `AppData` or `ProgramData` folder lower down, unless you are in that folder or typed its name, and anything with a `~` in its path (Word's `~$` lock files, `~folders`) lower down too, unless you typed its whole name or a `~`. The `/` sort commands switch to date or name order, or to size with the largest or the smallest first (`/size`).
- The defaults: **Match path** on, system files (`.` and `$` names, `desktop.ini`) left out, `~` paths listed but lower down, and the newest 25 matches in your own `AppData\Local\Temp` listed lower down too (the date, name and size orders leave Temp out). **Hide ~ paths** and **Hide temp files** leave them out altogether. The faint options button at the right of the box (or **Alt+O**) and the `/` commands change each of them. Anything that differs from the defaults shows as a chip under the box, and its × puts the default back.
- Runner ranks the 300 newest matches of each search, plus the 300 newest whose name matches, the names that are exactly what you typed, and every starred item it can find. When a search finds more, a note at the right of the box says how many it ranked out of how many it found (hover it for the whole sentence); type more to narrow it, or sort by date and scroll to page through them all.

<!-- help:tab {"id":"files-folders","label":"📁 Files & folders"} -->

### 🧭 Breadcrumb navigation

- **Paste image (Windows):** with a **current folder** set and focus outside a text field, **Ctrl**+**V** pastes Explorer files as usual; if the clipboard has **no file paths** but has a **screenshot or copied image**, TagFox saves **`Clipboard image.png`** there (then `Clipboard image (1).png`, …) and refreshes results.

- Click any segment of the breadcrumb to jump to that folder.
- The small **▾** arrows between segments show sibling folders; the one after the last segment shows children. You can hover into nested menus to drill down quickly.
- **K** / **J** — previous or next sibling folder; ▲ (in the last breadcrumb segment) goes to the parent folder.

### 🏷️ Tags

- Tags appear as coloured chips in the tag bar (below the breadcrumb). **Left-click** a chip to filter by that tag (click again to clear). **Right-click** to exclude it — the chip turns red, struck-through and shown as `¬TAG`, meaning "not this tag", so you can build filters like `TODO` and `¬CLAUDE` (TODOs that are not Claude's). The **AND / OR** switch combines all chips, mixing includes and excludes. Counts in parentheses reflect the current result list (after filters), capped by **Max results**.
- The **↻** control at the end of the tag row re-runs the main search and rescans the whole index for `xk`/`xp`/`xx` tag tokens, pruning remembered/active tags that no longer appear — use if the bar looks stale or after bulk renames outside TagFox. Ordinary searches do not do that full scan.
- To edit a file's tags: select the row and press `Ctrl`+`T`, or use the **Tags** button in the bulk bar. **Add** or removing a chip renames on disk immediately. When a **current folder** is set, renames must stay under that path.
- Tags are stored as trailing prefixed tokens before the extension, e.g. `Notes xxINFO.md`. A token is a tag only when it is a vocabulary word with its family prefix (e.g. `xkTODO`, `xpGCC`, `xxPUB`); anything else is literal text.
- Tag files, not folders. Renaming a folder to tag it is risky (it breaks shortcuts, saved paths and shared-folder names). To tag a folder, tag a readme inside it: any `.md` whose name contains `readme` is treated as the folder's doc, so `TreeAid readme xkTODO.md` both tags the folder and still shows as its folder doc. Never rename `CLAUDE.md` to tag it — that name is special and renaming it would hide it from Claude.
- **Deadlines.** Set a deadline with the date picker in the tag editor or the Add TODO box; it is stored as `xd-2026-07-15`. The deadline buttons on the toolbar (Overdue, Today, This wk, Next wk) filter results to files whose deadline falls in that range; pick one (they are single-select), and the **✕** button clears it. Week ranges run Monday to Sunday, and This wk includes today.
- **Hide until.** The second date picker, beside the deadline one, sets a hide-until date, stored as `xh-2026-09-01`. A file carrying a hide-until date in the future is dropped from results, so it stops competing for your attention until the day comes, then reappears on its own. This is switched **on by default**: a hide you have to remember to turn on hides nothing. To see what is currently hidden, open the deadline panel and turn on **Show hidden**.
  - A hide-until is not a status. `xkLATER` means someday, maybe never; a hide-until means definitely, just not yet, and here is when to ask again. Nor is it a deadline: put both on the same file when you cannot start before one date and must finish by another.
  - The hiding only happens inside TagFox. Everything, grep and Google Drive cannot read the token, so they will still return the file. That is the cost of keeping the whole state in the filename, and it errs the right way: a raw search is a deliberate act of looking.

### 📄 Viewer panel

- Select a file to see its details and preview on the right. Supports images, PDFs, Office files, markdown, text, audio, and video.
- For folders, the Viewer shows a **folder doc** — the first match it finds (case-insensitive basename): `-readme.md` → `-readme.txt` → `readme.md` → `readme.txt` → `claude.md` → `agents.md` → `about.md` → `about.txt` → `context.md` → `context.txt` → `index.md` → `index.txt`. **Edit** opens the editor (live preview); **Save** writes to disk, closes the editor, and refreshes the search. If none of those files exist yet, saving creates `-readme.md`.
- The row **⋯** menu gives you options to open, reveal in Explorer, copy the path, and more.
- Press `Shift`+`Space` to expand the Viewer to near-fullscreen.
- Google Workspace shortcuts (`.gdoc` / `.gsheet` / `.gslides`): **Open** uses an in-app window when TagFox can get the document URL (from the stub JSON, or on Windows from the Drive stream `filename:user.drive.id`). Streamed-only files are usually fine; if not, use Open again, context “Search Google Drive…”, or hydrate the file in Drive.

<!-- help:tab {"id":"favourites","label":"⭐ Favourites"} -->

### 📂 Favourite folders

- The **left-hand folder sidebar** is the whole column on the left. It contains **Favourite folders** at the top, then **Recent folders** and **Recent files** below.
- The 💾 **save button** saves the current folder into the **Favourite folders** part of that sidebar. Click a folder pill to jump there; × removes it. Files starred in the Runner layout appear here too, as file pills: click one to open the file.
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

The Shelf is the strip under the results list, one line high while it is empty. It's a **staging area** for files and folders you want to move or copy to another folder. It keeps them while you search and move around.

### 🔄 How to use it

- Drag rows from the list onto the Shelf. A drag moves them there; hold `Shift` to copy them instead.
- Go to the folder they belong in, or search for it.
- Drag a chip, or **All**, onto a folder row, or into the list when you are inside a folder. Again a drag moves and `Shift` copies.

### 💡 Tips

- A chip's × (it shows when you point at the chip) and the bin button send items to the **Recycle Bin**. A drag onto the Shelf moved the original, so that is where to get one back.
- To drag something to another app, such as File Explorer or an email, hold `Alt` as you start the drag from a row or a chip, or click the hand button first. A drag without `Alt` stays inside TagFox.
- The Shelf keeps its contents until you take them off, so you can collect files from several folders before dropping them.
- For one batch of files, `Ctrl`+`X` and then `Ctrl`+`V` in the folder they belong in do the same without the Shelf.

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

<p class="mb-2 mt-3"><strong>These are the Classic layout's keys.</strong> The Runner layout has its own, listed on the 🏃 Runner tab.</p>

<p class="text-muted mb-2 mt-3">Most shortcuts are disabled while a dialog is open. Bare-letter shortcuts work only outside text fields. Checked rows are the bulk selection. Repeating sort keys toggles direction; in <strong>Tree</strong>, sort keys switch to <strong>Flat</strong> first. <kbd>Esc</kbd> clears the query; with an empty query in the search box, it clears the current folder.</p>

<h5 class="help-md-section-title">Search &amp; view</h5>
<div class="table-responsive">
<table class="table table-sm table-striped mb-0"><thead><tr><th scope="col" style="width:40%">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>
<tr><td><kbd>/</kbd> / <kbd>Ctrl</kbd>+<kbd>U</kbd></td><td>Focus / unfocus search</td></tr>
<tr><td><kbd>Esc</kbd></td><td>Close Viewer / flyouts, or clear query / current folder</td></tr>
<tr><td><kbd>F5</kbd></td><td>Refresh results (or the <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> button in the header, which works even when the keyboard focus has slipped off the page). The status line then reports the time it ran and whether anything changed.</td></tr>
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
<tr><td><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd></td><td>From the list, step along the selected row’s buttons; <kbd>Enter</kbd> or <kbd>Space</kbd> presses one, <kbd>Esc</kbd> goes back to the list</td></tr>
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
<tr><td><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Space</kbd></td><td>Show / hide TagFox from anywhere (default; change in Settings). Showing it puts the cursor in the search box with its text selected: type to replace it, or press an arrow key to step out of it</td></tr>
</tbody></table></div>
