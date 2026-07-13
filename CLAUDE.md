# TagFox

Electron desktop UI over the local [Voidtools Everything](https://www.voidtools.com/) HTTP server. No backend; it talks only to Everything and the local filesystem. Main editor: Cursor.

## Where the docs are

Do not duplicate these here; read them:

- `README.md` "For developers" is canonical for run/build, project layout, how search works, and the **Search concurrency and result tabs** architecture note.
- `test/README.md` is canonical for the automated tests.

## Working rules

- **Steve runs TagFox with `npm start`, always. He never installs the packaged app.** So `npm run dist` exists only to hand Gabriele a build (the installer is copied to the Causal Map Drive root by `scripts/run-dist.js`); build it when asked to ship, and never install or update an exe on Steve's machine. When diagnosing his running app, it is the working tree, not a packaged build. A second running instance is another `npm start`, which loses the global hotkeys and the Chromium disk cache to the first (harmless startup errors: "already in use", "Unable to move the cache").
- After changing search, results rendering, paging, or the result-tabs logic in `renderer.js`, run `npm test`. The results/refresh concurrency is the most fragile part of the codebase; the historical bugs (searches rendering into a hidden pane; load-more rows lost on a background refresh; copy/delete bleeding between panes) are written up in the README concurrency section and guarded by the suite.
- **Only the active tab has DOM; inactive tabs are pure state.** The results area is one visible pane driven by a `tabs` array (each entry: `searchState`, `lastRows`, `resultsPagingCtx`). Switching tabs saves the live UI into the leaving tab and loads the entering one; the active tab re-runs its search on activation. Nothing (search, F5, auto-refresh, CRUD) renders or mutates any tab but the active one. This single-visible-pane model is what replaced the old A/B split in July 2026 and deleted its whole race/bleed bug class, so do not reintroduce background rendering of a second pane. `loadMoreResults()` must persist the grown rows into the active tab in its `finally` or a later tab switch reverts to the pre-load-more page.
- The tests drive the real app over CDP via a `#tagfoxtest` hook at the end of `renderer.js` (inert in normal runs). See memory `[[reference_electron_cdp_testing]]` for the general technique.
- **The viewer panel header is the only header (July 2026).** Mode blocks inside `#propsDetails` (text file, PDF, image, office…) must not carry their own title/button rows; per-mode actions live in the panel header, default `d-none`, toggled with their block (pattern: `btnPdfRefresh`, `btnMdFileRefresh`/`btnMdFileEdit` via `syncMdFileViewerButtons`). The folder-mode "Folder doc" row is two-state (`syncFolderDocHeaderExists`): doc found on disk → read-only name label; no doc yet → editable stem + tags, where Edit + Save creates the file. Do not show create/rename chrome while a found doc is displayed — deliberately dropped: starting a differently named second folder doc from that row (nested view reaches every doc instead).
- Dates in generated output / change stamps must not use year-less numeric form (global writing rule).
- **Resolving a row's Google Drive file id: use `resolveGoogleDriveFileIdRobust` (main.js), not the thin `resolveGoogleDriveFileIdForPath`.** The robust one escalates: the local `:user.drive.id` stream, else hunt the parent folder id via a sibling that carries one (`inferGoogleDriveFolderIdFromChildItems`) and look the file up scoped to that folder (collision-safe for repeated names), else a unique exact-name Drive-API match. The thin resolver is stream-only and returns nothing for a mirrored file whose stream is unreadable. The stream path needs no API; the fallbacks need Google sign-in (the `google-oauth-client.json` OAuth account, same as "Open in Google Workspace" / "Create Google Doc here").

## Open in gmist / Google Workspace (the row edit-pen icon)

The results-row edit icon (pen, `btnGmist` in `renderer.js`) opens the row for online editing. It routes by file type, all gated on the file being under a Google Drive mount (`pathUnderGoogleDrive`):

- `.md`/`.qmd` → **gmist**: TagFox resolves the Drive file id (above) and opens `https://mist.broad-smoke-cc64.workers.dev/open?file=<id>&p=<readable home-relative path>` in the default browser. gmist mints the room server-side and is the source of truth for that contract (see gmist's `CLAUDE.md`, the `GET /open` route); `&p=` is a harmless legibility breadcrumb gmist ignores. Auth is the browser's gmist session, so TagFox holds no gmist credentials. Eligibility is a cheap path check (`rowEligibleForGmist`); the click-time resolve is authoritative.
- Office and Google-native docs (`.docx`/`.xlsx`/`.pptx`/`.odt`/`.ods`/`.odp`/`.rtf`/`.csv` and `.gdoc`/`.gsheet`/`.gslides`) → **Open in Google Workspace** (`rowEligibleForWorkspaceEdit` → `openRowInGoogleWorkspace`). Google-native shortcuts reuse the existing shortcut resolver (`openFileDefaultOrGoogleWorkspace`, same as the row Open button and the Viewer); Office files resolve their Drive file id and open the matching Google editor (`docs.google.com/document|spreadsheets|presentation/d/<id>/edit`) in an in-app Workspace window. Needs Google sign-in for the resolver fallbacks (stream path needs none).

## Open threads

- **Smart view flips the subfolders toggle between searches.** Smart auto narrow/widen changes `showSubfolders` (and content) on its own, so repeated identity searches are not idempotent (e.g. 8 rows "this folder only" then 60 "with subfolders"). This is by design but can feel flaky. Offered to Steve to make it less surprising; not yet actioned.
- **Drive sync-status badge: decided against a general one.** Steve's Google Drives are mirrored, not streamed (see hub `env-windows.md`), so a downloaded-vs-cloud-only badge reads "local" for everything and carries no signal; live upload/sync state has no clean API. The only place a marker would inform is shared/streamed content under `.shortcut-targets-by-id` (which `main.js` already detects). Unresolved: whether to add that narrow "shared (streamed)" marker.
