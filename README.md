# TagFox

TagFox is a fast, keyboard-friendly file finder and tagger for Windows. It puts instant search, a folder tree, file previews and filename tags in one window, so you can find, preview and organise your files without opening File Explorer.

It runs on top of [Voidtools Everything](https://www.voidtools.com/), which indexes your whole drive and answers searches the moment you type.

![TagFox main window](docs/img/tagfox-main.png)

## For everyday users

### What you get

- **Instant search** across your whole drive as you type.
- **Tags** you add right in the filename, like `Report xkdraft xkurgent.docx`. Click a tag to filter; the tags travel with the file into Explorer, Google Drive and zip files because they are part of the name.
- **Previews** of images, PDFs, Word, Excel, PowerPoint, markdown, text, audio and video, in a side panel.
- **A folder tree** so you see results in context, not as a flat list.
- **Favourites and saved searches** you reach with one click or a number key.

### Install in three steps

TagFox needs Everything running in the background. Everything is free.

1. **Install Everything 1.5a** from the [Everything 1.5a downloads](https://www.voidtools.com/everything-1.5a), then add the HTTP Server plugin: [x64 installer](https://www.voidtools.com/Everything-HTTP-Server-1.0.3.4.x64-Setup.exe) or [x86 installer](https://www.voidtools.com/Everything-HTTP-Server-1.0.3.4.x86-Setup.exe). Let Everything finish its first index.
2. **Turn on the HTTP server** in Everything under **Tools, Options, HTTP Server**. Keep the default address `127.0.0.1` and port `8080`.
3. **Install TagFox.** Download the latest `TagFox Setup` installer from the [Releases page](https://github.com/stevepowell99/TagFox/releases) and run it. TagFox is not code-signed, so Windows SmartScreen may warn you the first time; choose **More info, Run anyway**.

Open TagFox. In **Settings**, under **Connection to Everything Search**, the URL should already be `http://127.0.0.1:8080`. If results stay empty, Everything is probably not running.

TagFox relies on the `sort-mix:` feature, so Everything 1.5a is the supported version. Everything 1.4 may connect but is not supported.

### First things to try

- **Set a search scope (recommended on a new PC).** In **Settings**, set one **search scope folder**, for example your profile or a projects root. Everything then only returns paths under that root.
- **Pick a current folder** from the breadcrumb. Search, paste and new files use the current folder.
- **Switch views** with the buttons by the search box: Flat, Tree or Smart layout, subfolders on or off, files and folders or folders only.
- **Tag a file.** Select a row, press `Ctrl`+`T`, and add a tag like `draft` or `2026`. The file is renamed on disk straight away.
- **Press `F1` or `Ctrl`+`/`** any time for the full in-app guide.

If search feels slow, open **Advanced** and turn off **Folder-contents highlight** and **Hide special**.

## Features

- **Keyboard first.** Navigate, tag, rename, bulk-edit and search without the mouse. Press `F1` for the shortcut table.
- **Filename tags.** Add, remove and filter by `xktag` labels stored in the filename. No database and no hidden metadata, so tags work everywhere the file goes.
- **Three view switches.** Flat or Tree, subfolders on or off, files and folders or folders only, combined freely. Recency buttons (1h, 1d, 1w, 1m, 1y) filter to what changed recently.
- **Fast previews.** Images, PDFs, Word, Excel, PowerPoint, text, JSON, markdown and more in the Viewer panel. For a folder it shows a folder readme you can edit in place.
- **Smart view.** The default layout adjusts which results you see relative to **Max results**, so you rarely touch the subfolder and file toggles by hand.
- **Favourite folders and saved searches.** Bookmark a folder or a whole search, reorder by drag, and jump back with `Ctrl`+`1` to `9` (searches) or `Ctrl`+`Shift`+`1` to `9` (folders). Together they replace browser-style tabs.
- **The Shelf.** A staging strip beside the results. Collect files from several folders, navigate elsewhere, then paste or drag them in. A clipboard for files that does not empty when you move.
- **Bulk rename.** Check several files, press `Ctrl`+`H`, and use wildcards on the last path segment with a live preview.
- **Add TODO.** Create a small markdown file tagged `xkTODO` in the current folder from the Viewer panel.
- **Folder docs.** The Viewer loads the first of `-readme.md`, `readme.md`, `claude.md`, `agents.md`, `about.md`, `index.md` and similar, so each folder can describe itself.
- **Split result panes.** Drag the horizontal separator to split the results into top and bottom panes, each remembering its own filters and search.
- **Paste from Explorer and screenshots.** Paste copied files into the current folder, or paste a screenshot to save `Clipboard image.png` there.
- **Mixed local and Google Docs.** Local Office files preview inline. Google Workspace shortcuts (`.gdoc`, `.gsheet`, `.gslides`) open in a popup, resolved from the shortcut or the Drive stream, including streamed (on-demand) files.
- **Google Drive shortcut folders.** Shared-folder shortcuts under `.shortcut-targets-by-id` are resolved to their real names in the breadcrumb and Name column, cached across restarts.
- **Open in gmist.** A markdown file (`.md`/`.qmd`) that lives in Google Drive gets a row button that opens it in the [gmist](https://mist.broad-smoke-cc64.workers.dev) web editor. TagFox reads the file's Drive id from the local mirror (the same resolver as Open in Google Workspace) and deep-links your browser to gmist's `/open?file=<id>`; auth is your signed-in gmist session.

## For developers

TagFox is an [Electron](https://www.electronjs.org/) desktop app. It talks only to the local Everything HTTP server and the local filesystem; there is no backend.

### Run from source

You still need Everything 1.5a with its HTTP server running (see the install steps above).

```bash
npm install
npm start
```

`npm start` runs `prestart`, which syncs vendor assets and rebuilds the help file before launching Electron.

### Build an installer

```bash
npm run dist
```

This runs electron-builder and writes an NSIS installer to `dist/`. The build is not code-signed, so SmartScreen may warn recipients. The built `dist/` is gitignored; publish the installer to the GitHub Releases page for the download link above to work.

### Tests

```bash
npm test
```

This runs the dual-pane and refresh regression suite. The tests launch the real app under the Chrome
DevTools Protocol and drive it through a hidden `#tagfoxtest` hook (inert in normal runs), so they exercise
the actual `renderer.js`. Everything must be running, the same as for the app. Full detail, including the
invariants checked and how to add a test, is in [`test/README.md`](test/README.md).

### Project layout

| File | Role |
|------|------|
| `main.js` | Electron main process: window, menus, IPC, filesystem and shell operations, Google OAuth |
| `preload.js` | Context bridge between renderer and main |
| `renderer.js` | The UI: search, results, tree, tags, Viewer, Shelf, favourites, keyboard handling |
| `index.html`, `styles.css` | Markup and styling (Bootstrap 5 plus custom CSS) |
| `tags.js` | Tag parsing and the `xktag1 xktag2` filename grammar |
| `preview-text-helpers.js` | Text and markdown preview helpers |
| `did-you-know-tips.js` | Rotating tips shown in the tip bar |
| `help.md`, `help.html` | In-app help source and generated output |
| `scripts/build-help.js` | Builds `help.html` from `help.md` and its tab markers |
| `scripts/sync-vendor-assets.js` | Copies Bootstrap, Font Awesome, CodeMirror and other vendor files into `vendor/` |
| `scripts/run-dist.js` | Wraps the electron-builder distribution build |
| `test/` | Automated dual-pane / refresh regression tests (see [`test/README.md`](test/README.md)) |

### How search works

Everything's HTTP API returns all folders before all files for a given sort. With **Max results** capped, a folder-heavy scope can fill a page with folders and show no files. Everything 1.5a adds a `sort-mix:` prefix that interleaves files and folders in true sort order, and TagFox appends it when **Hide files** is off (see `runSearch()` in `renderer.js`). This is why 1.5a is required. Reference: the [Everything forum thread](https://www.voidtools.com/forum/viewtopic.php?t=8994).

Active tag filters are sent to Everything as a regex clause, so matches exist before results load. The tag bar refresh control runs a full-index scan for `xk…` tag tokens and prunes tags that no longer appear; ordinary searches do not. **Hide special** and **Hide ~** are client-side filters in `filteredRows()`; the Everything query is unchanged, so paging still counts raw hits per page.

### Search concurrency and dual panes

The results area is two panes (A and B). Only one is active; the active pane owns the canonical DOM ids
(`tbody`, `resultsTable`, and so on) and the global status bar. `swapCanonicalResultsIds()` moves those ids
onto whichever pane is active, so `renderTable()` (which writes to `#tbody`) always targets the active pane.
Each pane's filter state and last results are stored in `resultsPaneState`; switching panes saves the live
UI into the leaving pane and restores the entering one.

One search flow runs at a time. `searchMutex` serialises top-level flows; genuinely nested calls (smart
narrow / probe re-searches, and the inactive-pane refresh launched from inside a `runSearchNow`) skip the
mutex by passing `nested: true`. Nesting is marked explicitly, not inferred from a depth counter: a fresh
event-loop task (the debounced search, F5, a disk-mutation retry) that fires while another flow is mid-await
must wait for the mutex, not run concurrently.

**The inactive pane is a passive snapshot.** It is not refreshed in the background on a search, F5,
auto-refresh or disk mutation. Only the active pane is live; the inactive pane re-runs its own search the
instant you activate it (`activateResultsPane()`). This is the single most important rule for keeping the
dual-pane code sane: a background flow that re-renders the *other* pane while the active flow runs is the
source of every dual-pane race and of the cross-pane CRUD bleed (a file copied from one pane into the other
appeared in both, and deleting either removed both, because the refresh path mirrored the active pane onto
the inactive one and applied the active pane's delete tombstones to it). Removed June 2026; guarded by
`crud-pane-isolation.cjs`.

The id-swap "dance" in `refreshInactiveResultsPane()` (swap the canonical ids onto the inactive pane,
restore its state, run its search so `renderTable()` writes to its tbody, then swap back) still exists, but
now runs only on explicit, serialized actions: first-load seeding of pane B, inactive-pane breadcrumb
navigation, and the test hook. It never fires automatically from a search or a CRUD refresh, so it can no
longer race a concurrent flow.

Two earlier faults here were fixed in June 2026, and the [tests](test/README.md) guard both:

- **Searches rendering into the hidden pane.** Nesting was inferred from a global depth counter, so the
  startup debounced search, firing while the inactive-pane dance held the counter up, mistook itself for a
  nested call, skipped the mutex, and rendered into the id-swapped (hidden) pane. The active pane looked
  empty until a pane switch repainted it. Fixed by making `nested` explicit (`runSearchNow`,
  `refreshInactiveResultsPane`).
- **Load-more rows lost on a background refresh.** `loadMoreResults()` grew `lastRows` but did not save it
  to the active pane's stored state, so the dance's restore reverted to the pre-load-more page. Fixed by
  persisting the active pane state at the end of `loadMoreResults()`.

### Refresh after CRUD (delete fast-path)

Every CRUD refresh acts on the active pane only (`singlePaneOnly`); the inactive pane stays as it was until
you switch to it (see the passive-snapshot rule above). So a copy, move or delete in one pane never changes
the other.

Because the inactive pane is a frozen snapshot, a disk change that touches its folder (a file dropped into
it, or a delete/move/copy under its scope) would otherwise leave it silently out of date. When that happens
in split view, the pane is flagged stale (`markInactivePaneStaleIfAffected`, scope test in
`diskMutationAffectsPaneScope`) and its breadcrumb shows an "out of date" badge; clicking it (or activating
the pane) re-runs that pane's search and clears the flag. Guarded by `pane-stale.cjs`.

A delete only removes rows. `removeGonePathsFromUiNow()` tombstones the deleted paths and repaints once, so
the rows vanish immediately. Because no new content can appear, `refreshAfterDiskMutation()` detects a pure
delete (`isPureTombstoneMutation`, payload `trashed` with no `destFolder`/`copied`/`moved`) and skips the
immediate re-query, scheduling a single quiet reconcile (~1s) to retire the tombstones once the Everything
index settles. Moves and pastes bring in new rows and keep the prompt refresh plus the 350ms/1200ms catch-up
retries. All delete call sites (bulk bar, Delete key, context menu) tag the payload with `trashed: true` so
the fast-path fires regardless of which refresh call wins the coalesce.

The recycle itself (`main.js`) was the bigger cost for cloud paths (Google Drive, OneDrive), which take the
PowerShell route because `shell.trashItem` rejects many of those paths. The old script spawned one PowerShell
per file and compiled C# at runtime each time (about 365ms of compile plus cold start, so 1-4s for a few
files). It now loads `Microsoft.VisualBasic` from the GAC (no compile) and recycles the whole batch in one
spawn, returning per-path results as JSON lines. Local paths still use the native `shell.trashItem` (no
spawn). Measured: 3 files about 4.0s to 1.7s, 5 files about 6.8s to 1.4s.

### Drag and drop

The default row and Shelf drag uses an in-page protocol (move or copy inside the app; hold `Shift` to copy). External apps need `Alt`+drag, or the Shelf **OS drag** arm, to receive native paths. Native drag blocks the UI thread, which is why the two paths are kept separate.

### Editing the help

The in-app help is generated from [`help.md`](help.md). Each tab is introduced by a single-line HTML comment whose body is `help:tab` plus JSON (`id`, `label`, one `"active":true`, optional `"format":"html"`). Edit `help.md`, then run:

```bash
npm run build:help
```

`npm start` and `npm run dist` rebuild the help for you. Notes for maintainers only live in the HTML comment at the top of `help.md`.

### Google Drive setup (optional)

**Create new Google Doc here** needs a single Google OAuth client. Add `google-oauth-client.json` in the app root with either:

- `{ "clientId": "...", "clientSecret": "...", "redirectUri": "http://127.0.0.1:53682/oauth2callback" }`
- or standard Google Desktop JSON (`installed.client_id`, `installed.client_secret`, `installed.redirect_uris`).

In the [Google Cloud Console](https://console.cloud.google.com/), under OAuth consent screen and Credentials, include the scopes `drive.metadata.readonly` and `drive.file`. On first use TagFox opens browser sign-in once and saves a single account token in the app userData folder. If you carried over a token from an older build, delete `tagfox-google-oauth-token.json` in app userData and sign in again so `drive.file` is granted. After startup, a green tick in the status bar means the Drive API ping succeeded.

The `google-oauth-client.json` file holds client credentials and is gitignored. Do not commit it.
