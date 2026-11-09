# Whippet (TagFox)

Electron desktop UI over the local [Voidtools Everything](https://www.voidtools.com/) HTTP server. No backend; it talks only to Everything and the local filesystem. Main editor: Cursor. Public on GitHub as `stevepowell99/whippet-files`, MIT licence.

**Naming.** The product is "Whippet": every name a user sees (window title, menus, Help, Settings, status lines, the installer's product name, README). Steve and this file still call it TagFox. The structural names stay TagFox on purpose, because settings, logs, tasks and tests are keyed on them: the `C:\dev\TagFox` folder, the userData files (`tagfox-*.json`, `tagBrowser-*.json`; a packaged install pins its userData to `%APPDATA%\TagFox`), `%LOCALAPPDATA%\TagFox`, `%TEMP%\tagfox-mainperf.log`, the `TagFoxAutostart` task, `#tagfoxtest`, `tagfox-` CSS classes and data attributes, `window.tagBrowser`, function names such as `restartTagFoxProcess`, the package name `tagbrowser` and app id `app.tagbrowser`, test file names and the hello@ Drive's `TagFox download` folder. Do not rename them.

Role: the tool Steve reaches for a hundred times a day, so it has to work in his hands rather than in a test. Measure what is on screen before designing for it; land the work on `main` in `C:\dev\TagFox`, where he runs it; prove it in the running app before calling it done. Ledger: `_role.md`.

## Where the docs are

Do not duplicate these here; read them:

- `README.md` "For developers" is canonical for run/build, project layout, how search works, the **Search concurrency** architecture note, and the history and measurements behind each rule below. Before changing an area a rule covers, read its README section.
- `test/README.md` is canonical for the automated tests and the `#tagfoxtest` hook they drive over CDP (general technique: memory `reference_electron_cdp_testing`).
- `TAG_VOCAB` in `tags.js` is the single source of the status (`xk`) and label (`xx`) tags. The hub `CLAUDE.md` table mirrors it, so a new tag goes into `tags.js` first. Owner (`xp`) names are a per-user setting, none by default: `tagfox-tag-owners.json` in userData, written by Settings → Owner tags and read by main and the window at startup (`setOwnerTags`). Steve's are in the hub table.

## Running, restarting and shipping

- **A background job here runs directly in `C:\dev\TagFox`, not an isolated worktree** (`.claude/settings.json` sets `worktree.bgIsolation: none`). A fresh worktree carries no `node_modules`, so a job confined to one could never run `npm test` or `npm run dist`, and the work has to land in this checkout, where Steve runs the app. General rule: memory `reference_working_in_parallel`.
  - A worktree made by hand sits beside the repo, never inside a dot-folder such as `.claude\worktrees\`: Whippet hides dot-folders by default, so the tests' seed files never reach the list and about half the suite fails (9 November 2026; the same suite passed 47/47 from `C:\dev\TagFox-e43`). It needs its own `npm install`, is cut from `main` and lands on `main` by fast-forward. A docs-only or task-file commit does not need a full suite.
- **Steve runs TagFox with `npm start`, always, and never installs the packaged app.** `npm run dist` exists only to hand someone else a build (`scripts/run-dist.js` copies the installer to the hello@ Drive's `Causal Map\TagFox download\`): build it when asked to ship, and never install or update an exe on Steve's machine. When diagnosing his running app, it is the working tree.
- **Autostart is the per-machine scheduled task `TagFoxAutostart`** (`scripts/autostart.ps1`: the Everything user instance, then `npm start`). Install or remove it with `pwsh scripts/install-autostart.ps1 [-Uninstall]`; git does not carry it, so a fresh machine needs `machine-parity.ps1 -Fix`. It logs to `%LOCALAPPDATA%\TagFox\autostart.log`, including a line per Electron exit; there is no crash reporter. README "Autostart, restart and the dev reloader".
- **An edit to `main.js` never restarts TagFox; a Restart button shows in the search box instead.** Every restart goes through `restartTagFoxProcess()`, which exits 75 under the `scripts/start.js` wrapper so TagFox stays in the same terminal, and falls back to `app.relaunch` outside it. Main counts itself under the wrapper only when its parent process is the wrapper (`START_WRAPPER_EXIT_CODE`). Guarded by `test/restart-in-terminal.cjs`.
- **The dev reloader never reloads the window over stale main-process or preload code** (`startDevReloader`): a renderer edit reloads Whippet's own pages only while main and the preloads are as they started, and otherwise waits for Restart. A reload onto renderer code that needed a newer main froze Steve's window for 100 minutes (9 November 2026). It polls only the root files of `build.files`. Guarded by `test/dev-reloader.cjs`.
  - **In a change that touches main-process or preload code and the renderer, save the main-side edit first.** Once main is stale nothing reloads; a renderer edit saved first still reloads the window over the old main, which is the freeze again. A larger change of that kind goes in a worktree beside the repo and lands by one fast-forward, whose files reach the disk together.

## Speed

- **The renderer must never be left at Chromium's background priority** (`disable-renderer-backgrounding`, `backgroundThrottling: false`), and main raises its own process to Normal at startup; the autostart task registers at priority 4. **Assert it rather than trust the switch name:** with the window hidden or covered, `Get-Process` must show `PriorityClass=Normal` for the `--type=renderer` processes. README "Speed: priority and the perf log".
- **`%TEMP%\tagfox-mainperf.log` is the one perf log, and both processes write to it.** Thresholds are set so an ordinary session writes nothing, so any line there is a real stall. Read it before theorising about a slow TagFox, and its `page …` lines (`watchPageHealth`) first for a blank or frozen window. A test instance writes `tagfox-mainperf-test.log` instead.

## Search and results

- After changing search, results rendering or paging in `renderer.js`, run `npm test`. The results and refresh concurrency is the most fragile part of the codebase (README "Search concurrency").
- **One results pane, and nothing renders anywhere else.** One search state: the live controls, `lastRows` and `resultsPagingCtx`; search, F5, auto-refresh and CRUD all act on it. Do not reintroduce background rendering of a second pane.
- **Auto-refresh defaults to 5 seconds, and a tick repaints only on a real change** (`resultsTableRenderSignature()`) and writes nothing to the status line. `autoRefreshTickWouldDisturb()` skips a tick while the pointer is in the list, a drag is live, or the list has grown past its first page; that last test is `singleOffset > pageSize`, never `> 0`. F5 and Refresh always repaint and report. Guarded by `test/quiet-refresh.cjs`, whose positive control (a new file still gets through) is the half that matters.
- **An explicit refresh must prove it ran:** every route goes through `refreshResultsFromUi()` and reports `Refreshed hh:mm:ss — N row(s), unchanged` (or `+3 new, -1 gone`). Do not reduce that status to a bare row count. Refresh is a click in the options panel and the `/` list as well as F5; Runner does not carry a refresh button of its own (Steve, 25 October 2026). Guarded by `test/refresh-visible.cjs`.
- **Recency means a file's own modified time, so a recency window excludes folders (`file:`) unless Folders only is on.** `appendRecencyToEverythingQuery` is the one place recency is applied; there is no client-side recency filter.

## Runner, keys and the window

- **Runner is the only layout (Steve, 24 October 2026); Classic's code is gone and nothing offers a layout switch.** **The base CSS rules under Runner's block stay where Runner overrides them (Steve, 26 October 2026):** proving one dead means reaching every state it applies in and comparing every element's box and computed style.
- **Runner is a layout of this renderer, never a fork.** A Runner-only copy of the search, the table, the Viewer or the favourites store is a defect. Every ranking weight is in `RUNNER_RANK`, applied only through `runnerRankWeights()`. README "Runner layout"; `test/runner-layout.cjs`.
- **Keys follow the analogues people already know, and an action takes as many keys as the analogues suggest (Steve, 26 October 2026).** Where Everything, Explorer, a browser or an ordinary Windows app each suggest a key for the same action, TagFox answers to all of them, Everything's and Explorer's always among them; otherwise the ordinary Windows meaning holds. One key must never mean two things in the same place. Every key is a `RUNNER_KEYS` entry with a `does`, the table Help's Keys tab is drawn from: a key handled anywhere else is missing from Help and breaks unnoticed. A key that stands for a `/` command names it with `cmd`.
- **Taking anything off the Shelf recycles it, never deletes it** (`clear-shelf` and `remove-shelf-paths` call `recycleListBatched`). A drop onto the Shelf moves the original, so a Shelf item is often the only copy. Its × asks nothing; do not bring back a permanent delete there, for speed or for files Node cannot remove. `test/runner-shelf.cjs`.
- **Toggling TagFox in raises no overlay.** Do not reintroduce an on-show overlay.
- **The window's × hides TagFox and never quits it** unless `appQuitting` is set (File → Quit TagFox, the `/` command, Windows' `query-session-end`). Guarded by `test/close-hides.cjs`, which posts a real `WM_CLOSE`.
- **Start menu apps are ordinary rows: real `.lnk` files that Everything indexes, never a second kind of row** (Steve, 9 November 2026). Store apps get real shortcuts too, written by main into userData's `Store apps` (`refreshStoreAppShortcuts`). Enter on one switches to the app's latest window, or starts it (`app-switch-or-launch`); open windows are not listed as rows of their own. README "Start menu apps"; `test/runner-apps.cjs`, and `test/manual-app-switch.cjs` by hand.
- **Every koffi binding is declared once, in `win32.js`**: koffi registers a named type once per process, so a module declaring its own `HWND` throws.
- **Ctrl+Shift+Space is a fixed third global shortcut** (`RECENT_CHANGES_ACCEL`, not in Settings): TagFox on the last hour's changes anywhere (`openRecentChanges()`).
- **Every global-shortcut raise parks the doc windows first** (`minimiseWebEditorWindows`), since an owned window always sits above the main window.
- **The toggle shortcut pressed from another app's Open or Save dialog sends the next pick to that dialog** (`file-dialog-handoff.js`, `fileDialogTarget`; README "Sending a pick to a file dialog"). Four rules are load-bearing:
  - Text goes only to the file-name box of the same dialog (same handle and process, found again at the moment of sending, and inside that dialog), by `WM_SETTEXT`, and is read back before anything is pressed.
  - The dialog's button is pressed (`WM_COMMAND` `IDOK`) only when it reads Open.
  - A Save dialog, or one whose button says anything else, is only filled in, with the folder plus the name already in its box, and never pressed, because Save over an existing file brings up an overwrite prompt.
  - No keystrokes are synthesised, so nothing can land in whichever window has the focus.

  Guarded by `test/file-dialog-handoff.cjs`. `test/manual-file-dialog.cjs` opens real dialogs on screen: run it by hand only, after asking Steve.

## Viewer

- **The Viewer's markdown write is armed by the editor, never by the preview, and refuses a file that has moved on disk.** `flushMdFileAutosave` returns unless `mdFileEditorIsOpen()`; `openMdFileEditorFresh` re-reads the file before the editor opens; the write is refused, with a status line, when the bytes on disk differ from `mdAutosaveLoadedText`. Do not arm the write anywhere else, and do not treat the refusal as an edge case: an agent co-editing the file is the common case here, and the old behaviour reverted Steve's work for eight weeks (README "Viewer internals"). Guarded by `test/md-preview-no-write.cjs`, whose positive control (an edit must still save) is the half that matters.
- **The Viewer's header is the only header.** A mode block inside `#propsDetails` does not carry a title or button row of its own; its actions live in the header. Loading, errors and kinds TagFox cannot preview go through `showPropsPlaceholder`. `test/viewer-runner.cjs`.
- **The folder doc is two-state** (`syncFolderDocHeaderExists`, `syncFolderDocChrome`): a found doc, or the empty state with one name field. Do not show create or rename chrome while a found doc is displayed. A folder doc writes only on Save; a text file saves as you type.
- **Every way of making a TODO uses the one Quick TODO box** (`showQuickTodoPop(folder)`) and one set of tags (`newTodoMdTags`).
- **A splitter drag runs under a shield** (`addSplitDragShield`), the Viewer splitter on pointer events with `setPointerCapture`, and the Viewer width is clamped by `maxPropsPaneWidthPx()`. Guarded by `test/splitter-drag.cjs`.
- **A PDF loads without the plugin's toolbar**: `PDF_VIEW_PARAMS_PANE` in the side pane, `PDF_VIEW_PARAMS_THEATER` expanded, rebuilt by `syncPdfViewParams`. **`toolbar=0` is the only thing that closes the plugin's thumbnail sidebar; do not spend another session on `pagemode`.** A hidden test window draws the plugin at the wrong size, so read its zoom over CDP (`document.querySelector('pdf-viewer').viewport_.getZoom()` in its frame), never from a screenshot.
- **A Google shortcut's preview is the PDF Google exports, fetched with the Workspace window's cookies** (`google-shortcut-pdf`), the shortcut's `email` as `authuser`. Signed out, Google answers 200 with its sign-in page, so the bytes must start `%PDF-` before anything is shown. The OAuth scopes stay `drive.file` and `drive.metadata.readonly`: `drive.readonly` is restricted and would put Google's unverified-app screen in front of everyone given the installer.

## Google Drive

- **Without `google-oauth-client.json` at the app root, every Drive-backed action reports a sign-in problem and opens nothing.** The file is gitignored; README "Google Drive setup" names the copy to use, and `machine-parity.ps1` checks for it.
- **Resolve a row's Drive file id with `resolveGoogleDriveFileIdRobust` (`main.js`), not the stream-only `resolveGoogleDriveFileIdForPath`.**
  - **The `:user.drive.id` read is synchronous and escalates to cmd and then PowerShell, so it must never run per file over a folder.** The sibling scan reads every sibling with `{ cheapOnly: true }` and escalates on at most `ADS_ESCALATION_BUDGET`. Keep the cheap pass over the whole folder: the bound belongs on how hard each file is tried, not on how many files are looked at.
- **Drive and vault membership are each decided once, in the renderer** (`pathUnderGoogleDrive`, `pathInObsidianVault`), and passed to the row context menu as `underGoogleDrive` and `inObsidianVault`, so a button and its menu entry are one decision. Do not add a second test of either in `main.js`.

## Open in gmist, Google Workspace and the browser

README "Open in gmist and Google Workspace" describes the row's pen buttons and the mechanisms below.

- **Every open path goes through `openFileDefaultOrGoogleWorkspace`**, which routes `.md`/`.qmd` to local gmist, starting it if it is down; the context menu's **Open with default app** is the way to Obsidian. The local pen and the online cloud are separate actions (`openRowInLocalGmist`, `openRowInOnlineGmist`), not a fallback chain, and gmist owns both `/open` contracts. TagFox holds no gmist credentials and never touches the localfs sidecar or its token.
- **A button that cannot work on this machine is not shown** (`machine-features`: gmist, makePdf, googleSignIn). `localGmistSource()` is the one place that decides whether this machine has a gmist. **Key the gmist test on there being no gmist anywhere, never on gmist not running.** `test/machine-features.cjs`.
- **The local pen starts gmist when it is not running (`start-local-gmist`), rather than hiding itself.** Load-bearing:
  - **Whether the ports are held settles "is gmist up", and no HTTP probe is allowed near that question.** `portIsHeld()` checks 5173 and 5199 on both `127.0.0.1` and `[::1]`; with 5199 held and 5173 free, `sidecarHasLiveGmistRunner()` tells a starting gmist from an orphan sidecar. Guarded by `test/gmist-start-guard.cjs`.
  - `listenersByPort()` and `netstat` only on error paths, to name a culprit, and always `netstat -ano`, never `-p tcp`, which lists IPv4 only.
  - Spawn with `shell: true` and not `detached`; output to `%LOCALAPPDATA%\TagFox\gmist-local.log`, whose tail a failure reports.
  - Start `preview:local`, a production build, never the dev server (`localGmistStartScript()`): React's dev build kills gmist on any deck with the slide pane open.
  - Find the repo, never hardcode it (`repoDir` in `tagfox-local-gmist.json`, else a sibling `mist`, else `C:\dev\mist`).
- **One child-window mechanism serves both editors** (`openWebEditorWindow`); everything site-specific lives in `WEB_EDITOR_KINDS`.
- **A minimised doc window parks in Whippet's doc tray, never as Windows' desktop stub** (`parkWebEditorWindow`, Steve, 9 November 2026): hidden, with a pill on the Shelf's row that restores or closes it. `webEditParked` is the one record of what is in the tray. `test/manual-doc-tray.cjs`, by hand only.
- **A doc window's icon carries two letters (`webEditorIconAbbrev`), and two is the measured ceiling, not a compromise to revisit.** A `PrintWindow` capture misleads here; capture the live screen.
- **The row's cloud pen opens online gmist in the default browser; local gmist's own Online button asks** (`offerOnlineGmistTarget`).
- **Ask the shell which browser, never the registry:** `openUrlInSystemDefaultBrowser` is `shell.openExternal`, with `rundll32 url.dll,FileProtocolHandler` behind it. `cmd /c start` is not a fallback: it truncates a URL at the first `&`. `test/manual-browser-open.cjs` opens a real tab, so it stays out of `npm test`.

## Print markdown to PDF

- **The PDF is JobCat's `make_pdf.py`, run as a subprocess, so TagFox holds no PDF styling:** change the house PDF in JobCat. Three profiles are chosen per click. README "Print markdown to PDF".
- **An existing PDF of that name is never replaced without asking**, and a run reports a PDF only when the output is on disk and non-empty, since `make_pdf.py` can print a traceback and exit 0.

## Open threads

- **No general Drive sync-status badge** (mirrored Drives would read "local" for everything). Undecided: a narrow "shared (streamed)" marker for `.shortcut-targets-by-id` content; README "Decided against".
