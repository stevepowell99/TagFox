# TagFox tests

Automated regression tests for the search, results and refresh logic in `renderer.js`. They launch the real app
under the Chrome DevTools Protocol (CDP) and drive it through a hidden test hook, so they exercise the
actual renderer rather than a reimplementation.

The results area is one pane (see [Search concurrency](../README.md#search-concurrency)). The tests guard:

- The single canonical results DOM (`tbody`, `resultsTable`, and so on) stays present and unique.
- Load-more rows are stored on the active tab and rendered (the load-more desync bug).
- A deleted row stays hidden through a refresh.
- Every visible results column divider can actually be grabbed with the mouse.
- The Viewer splitter follows the pointer across the previews, stops where the layout stops it, and lets go.
- Raising TagFox with the global toggle shortcut selects the whole query in the search box (Classic and Runner), while a plain window focus keeps the caret; typing then replaces it and an arrow key steps out of it.
- The global Ctrl+Shift+Space resets the search in place, with every filter reset and a 1 hour recency window.
- Previewing a markdown file never writes it back, and an edit whose file has moved on disk is refused.
- Runner's tag filter keeps tagged files and drops untagged ones, and its tag editor renames files on disk.

## Prerequisites

- `npm install` has been run (Electron is a dev dependency; `vendor/` is synced by `postinstall`).
- Everything 1.5a with the HTTP server is running (the same requirement as the app). The tests auto-detect
  the port: they try `$TAGFOX_TEST_URL`, then `http://localhost:8080`, then `http://localhost:7070`. Set
  `TAGFOX_TEST_URL` if yours differs.
- Node 18+ (uses the global `WebSocket`). The repo runs on Node 22.

## Running

```
npm test                      # whole suite: every test listed in run-all.cjs, in order
npm run test:smoke            # readable walkthrough of the main flows
npm run test:loadmore         # focused load-more / tab-state regression
npm run test:fuzz             # randomized fuzz, default 60 iterations
node test/fuzz.cjs 100 31337  # fuzz: <iterations> <seed>
```

Each test launches its own isolated Electron instance, with a CDP port the OS hands out and a
`--user-data-dir` under the temp folder named for the test and tagged for the checkout (`tagfox-test-runner-1a2b3c`,
from `testProfileDir` in `harness.cjs`). So suites in different checkouts (`C:\dev\TagFox` and each worktree) can
run at the same time; within one checkout `run-all.cjs` runs the tests in sequence, since a test's profile is
wiped when it starts. A run leaves no trace in your real TagFox profile. `gmist-start-guard.cjs` is the exception
across checkouts: it holds gmist's own ports, 5173 and 5199, which cannot be per checkout.

The harness spawns Electron with `TAGFOX_TEST_HIDDEN=1`, so the window never shows onscreen (no flashing
during a run). A hidden window still renders and drives through the `#tagfoxtest` hook over CDP. The same
variable turns off the dev reloader, so editing a file in the repo while the suite runs no longer reloads a
test's window and strips its hook mid-run, and it keeps a test instance off the OS-wide hotkeys: whichever
TagFox registers Ctrl+Space first owns it, so a test instance started while Steve's was down answered his
Ctrl+Space with a blank profile. Normal app runs are unaffected: `main.js` only skips `show()`, the reloader
and the hotkeys when that variable is set.

`connect()` switches the 5-second auto-refresh timer off once the hook is up, unless a test passes
`autoRefresh: true`, because a tick is a whole search arriving at a moment no test chose. Tests that need a
tick call `autoTick` and get one when they ask.

The hook normally appears about a second after launch, but a machine busy with other Electron starts has
taken over 12s, so `connect()` waits up to 45s and prints `(slow start: …)` for any start over 5s. A start
that never produces the hook fails with the page's URL and load state and the tail of Electron's stderr, so
a loaded machine and a renderer that failed to load read differently.

`run-all.cjs` gives each run five minutes. A run that overstays is killed along with the Electron it
launched and counted as failed, so one hung test cannot stall the suite. Each run's time is printed after
it. After every run it also looks for an Electron still running on a test profile (a folder in the temp
directory whose name starts `tagfox-test-`, found by `test-processes.cjs`, never by image name) and stops
it by PID, failing that run with `LEFT RUNNING by …`. A relaunched TagFox is outside the process tree a
kill reaches, which is how one was once left open on Steve's screen. Only Electrons started from this
checkout's own `node_modules` count, so a suite in a worktree and one in `C:\dev\TagFox` leave each other's
instances alone.

## What each file covers

| File | Covers |
|------|--------|
| `harness.cjs` | Shared library: launch Electron under CDP, the `#tagfoxtest` driver, `settle()`, and `structuralProblems()` (the invariants below). Not a test itself. |
| `help-build.cjs` | No Electron. Builds a copy of the working `help.md` in a temp folder, once with LF and once with CRLF line endings, and checks that each build writes one line ending (the one `help.md` had) and says exactly what the working `help.html` says. So a start on a CRLF checkout leaves `help.html` unmodified in `git status`, and a `help.md` edited without rebuilding fails here. It fails on the build script from before 23 October 2026, which turned a CRLF blank line into an indented one. |
| `smoke.cjs` | Startup, a 10x F5 refresh loop, type+refresh races, and searching two other scope folders, one of them while a search is running. Checks the structural invariants after each step. |
| `delete-hides-row.cjs` | The renderer side of a delete (`removeGonePathsFromUiNow`, through the `tombstone` driver; nothing on disk is touched): the row drops out of the list at once and a refresh does not bring it back, checked by count and by path. The positive control is that the search had rows to start with. |
| `loadmore-regression.cjs` | Loads two extra pages and checks the rows are stored on the active tab and rendered (the load-more desync bug). |
| `column-resize.cjs` | Walks `elementFromPoint` across every visible header boundary, in flat and tree view, and requires the resize handle to be on top for most of a 15px window. Catches handles buried under the neighbouring sticky `th`, which leaves a divider half-dead and sends boundary clicks to that column's sort. |
| `refresh-visible.cjs` | The header Refresh button exists and is wired. Every explicit refresh route (button, F5) writes a `Refreshed hh:mm:ss — N row(s), …` status. Guards the answer to "F5 sometimes does not refresh": a refresh that finds nothing new must still prove it ran. |
| `quiet-refresh.cjs` | Auto-refresh is silent until something really changes: four ticks over an unchanged folder leave the row nodes, the scroll position and the status line alone (a tick used to leave "Searching…" there for good), and a file appearing on disk still gets through and repaints. The positive control matters more than the negative one here, because a tick that never ran looks exactly like a tick that found nothing. |
| `md-preview-no-write.cjs` | Previewing a `.md`/`.txt` file must never write it back, opening the editor re-reads the file, and a write whose file has moved on disk is refused. The positive control is the half that matters: an edit made in the open editor, and one saved by closing it, must still reach disk, or a fix that simply stopped saving would pass. |
| `menu-enter.cjs` | Ctrl+L opens the recent-folders menu, the arrows move through it without the results list also taking them, and Enter applies the focused folder. Sent as real key events over CDP, because a synthetic click would pass whether or not the global Enter handler swallowed the key. |
| `recent-tab.cjs` | The renderer half of the global Ctrl+Shift+Space in Classic (`openRecentTab`, driven through the test hook). The positive control is a busy search: a query, a scope folder, a 1 day window, three options on and Match path off. After the press the box and the scope folder are empty, every option is off but Match path, and the 1 hour window reaches the Everything query as `dm:`. Runner's half is in `runner-layout.cjs`. The OS-wide registration itself lives in `main.js` (`RECENT_TAB_ACCEL`) and is not pressable from a test without raising the window. |
| `hotkey-raise-select.cjs` | The renderer half of the global toggle shortcut's raise (`onHotkeyRaised`, driven through the test hook, with the window `focus` event dispatched by hand and `document.hasFocus()` pinned to choose the order): with text in the box, a raise leaves the whole query selected whether main's message comes before the focus event, after its frame, or between the event and the frame; a plain window focus returns to the box and keeps the caret (so "always select on focus" fails); the flag is spent after one focus and expires if no focus event follows; a real key typed after a raise replaces the query; in Classic ArrowDown leaves the box with the text intact; in Runner Right and Left only collapse the selection (the folder is unchanged) and a second press enters the folder and goes up again, which is the positive control. It fails with the renderer's message handler removed. The OS-wide registration and the message itself live in `main.js` and are not pressable from a test. |
| `restart-in-terminal.cjs` | TagFox started through `scripts/start.js` says so, fills the Settings **Running now** block, and on Restart comes back as a new process under the same wrapper. Then a TagFox carrying the wrapper's environment with no wrapper above it, the state Ctrl+F5 used to leave: it must not claim the terminal, and Restart must relaunch it rather than end it. Every wait on the relaunched one is bounded, and it is stopped by its profile afterwards, since it runs outside the test's process tree. |
| `runner-layout.cjs` | The Runner layout, by real key events: an empty box lists only the current folder, a file created on disk appears (positive control), typing searches below the folder (and "Search this folder only" keeps it to the folder's own contents), name matches rank above path-only matches, a year-old whole-word name ranks above a just-modified inside-word one (so recency cannot outweigh the match), `.md` lists markdown files only with the newest first, `-word` excludes, Down keeps focus in the box, Right and Left move into a folder and back to its parent, `/` filters commands and Enter runs one, `/size` sorts largest first and its pair smallest first, each size shows as at most three figures in one column, fainter for a smaller unit, with the dates in line beside it, a deadline range and shown hide-until files show as chips whose × clears them, the `/` Due commands set them and from an empty box look below the folder, "Show only starred items" lists just the stars below the folder, Windows' Recent list lifts the older of two otherwise tied names (with the order checked without it first), the Restart button sits in Runner's search box and goes back to the header in Classic, Ctrl+Shift+Space resets Runner's one search in place with no new tab, only a tagged name (whose name on disk differs) and the time carry tooltips, `Ctrl`+`D` stars and unstars (and the favourites column shows a starred file as a file), hovering a row shows its buttons, a file in AppData\Local\Temp is listed by default below a file of the same name elsewhere, and the `/` command hides it while the plain file stays (so the hidden check cannot pass on a search that found nothing), and switching back restores Classic's own view. |
| `runner-keys.cjs` | Runner's keys and what they put on screen, by real key and mouse events: with the defaults there are no filter chips, a changed setting shows one and its x (or Reset all) puts the default back; checkboxes appear once Shift+Down checks two rows and Esc removes them; Enter straight after typing acts on the new search's top row (the positive control is a different folder selected first); letters typed with the focus off the box go into it rather than to Classic's one-letter shortcuts; a held Backspace stops at the empty box; Ctrl+L (Classic's recent folders) opens nothing; holding Ctrl numbers nine rows and Ctrl+2 opens the second; PageDown, Ctrl+End and Ctrl+Home move as described; Tab and Shift+Tab move between the box and the list, where Space toggles a check (Tab within the list is `row-actions-keys.cjs`); Alt+P hides and shows the Viewer; Alt+O opens the options panel with the first item chosen, Down and Enter switch one on with the panel left open, Esc closes it without touching the box or folder, and Alt+O closes it too; `?` opens Help at Runner's keys, drawn from the key table; Alt+Home clears text, folder and filters; Ctrl+Tab is answered rather than switching hidden tabs; F1 opens Help on the Runner tab; an AppData or ProgramData file ranks below the same name elsewhere but not inside that folder; and Esc steps through text, folder and hiding. It writes one folder under `%LOCALAPPDATA%` and one under `%ProgramData%` for those checks and removes them. |
| `runner-syntax.cjs` | What can be typed into Runner's box, one check per convention against files made for the test: Everything's own syntax passes through (`a|b`, `!word`, `"phrase"`, `ext:`, `dm:today`, `size:>1mb`, `regex:`, `<grouping>`, `wfn:`), and Runner's additions work on top: `-word`, `-.docx`, a bare `pdf` filtering strictly (a `pdf exports` folder must not appear), `map` staying a word, `^map` matching at word starts only, and the / toggle **Word starts only** doing the same for every word and showing as a chip. |
| `runner-tags.cjs` | Runner's tags, by real key and mouse events against files made for the test. `/tagged todo` and Enter switch on Classic's tag filter, which keeps `alpha xkTODO.md` (the positive control) and drops `todo list.txt` and an untagged file, so it cannot pass by searching for the word; it reaches Everything as a regex clause and shows as a **Tagged TODO** chip whose x removes it. Alt+O lists the vocabulary as buttons and a click filters by one. `/not claude` and Enter leave CLAUDE out: the other files stay (the positive control) and the CLAUDE one goes, with the box empty the folder's own list is thinned rather than everything below it listed, and the chip reads **Not tagged CLAUDE**, then **Tagged TODO and not CLAUDE** once TODO is asked for too. In the panel CLAUDE then reads `¬CLAUDE`, the panel has no separate not-tag items, and a right-click on TODO leaves it out and a second puts it back. `Ctrl`+`T` opens the tag editor on the selected row: adding TODO renames the file on disk, removing it renames it back, and closing the editor returns the focus to the box. `Ctrl`+`T` on two rows checked with `Shift`+`↓` tags both on disk. `↓` from a box whose text is selected leaves the caret at the end, so typing adds to the query. Inside a five-deep folder its path is one line of names under 12px above the box, every name shown in an 1800px window, and in a 700px one the leading names give way to "…" while the folder's own name stays and the line still fits; the box's hint names only the folder. A click on the third folder's name goes there with the box cleared and the fourth folder, the way back, selected. The box's folder chip holds the folder's buttons out of sight until it is hovered, and its tags button opens the tag editor on the folder. Searching everywhere hides the line. A page call that never returns fails the run instead of ending it with code 0. |
| `runner-query-order.cjs` | The order of terms in Runner's Everything queries, which is most of what a query costs, since Everything checks an item's terms left to right and stops at the first that fails: a tag filter sends the tag as plain text ahead of its regex, the starred-paths query starts with its `filelist:`, and the Temp query with the Temp folder. The test also sends each query to Everything itself, so a reordering that broke one cannot pass: the tag query keeps `alpha xkTODO.md` and drops `todo list.txt`, the starred-paths query returns the starred file and the Temp query the file made in Temp. The main query goes first, so a new list shows its own rows while the search is still running and before the Temp file, which only the Temp query finds, arrives; the merged list then holds both and selects its own top row. Of three searches asked for in one task, as fast typing does during a slow search, only the last runs and the other two send no query, counted against one search's own counts as the control. |
| `runner-shelf.cjs` | The Shelf in Runner: under the list and one line high while empty; a drop onto it moves a file there and a drop with `Shift` copies it; the drop's message comes up above the Shelf, inside the window, rather than over the Shelf, and a search run while it is up leaves its text in place; a chip dragged onto a folder row moves the item into that folder; with 31 items the strip is at most a few lines high and scrolls, leaving the list most of the window; a chip's × puts the item in the Recycle Bin, which the test finds by its `$I` record and then takes back out. Last, Classic still gets its rotated strip and inline width. The drags are synthetic `DragEvent`s carrying TagFox's own paths payload; a native drag to another app is not driven. |
| `runner-status.cjs` | Runner's status line is a bar docked along the bottom of the list, full width, with the list running down to the Shelf. It shows a tip while no message is up. An F5 report replaces the tip and tints the bar with an accent edge, without moving the list; the tip comes back once the message has gone. Every key the tips in `did-you-know-tips.js` name is in Runner's key table (or is a global shortcut or a held modifier), and every `/` command they name offers the command it describes first. Last, Classic gets its footer and its header tip back. |
| `runner-go-to-path.cjs` | A path in Runner's box goes there. Pasted, a folder's path opens that folder and empties the box, a file's path opens its folder with the file selected, and a quoted path works the same; in a folder of 330 files an old file is found by its name in the box. Typed, a folder's path is searched for as text until Enter, which goes there. A path that does not exist, pasted or typed and entered, stays an ordinary search with the folder unchanged, and pasted ordinary text searches as before. The paste is the box's own `insertFromPaste` input, so the test never writes the system clipboard. |
| `viewer-runner.cjs` | The Viewer in Runner, against folders and files made for the test: a folder's name takes the header's width and the line under it gives its parent; a folder without a doc shows the empty state with the name field and **Write it**, the field moves into the bar while writing, and Save creates `-readme.md` with what was typed (the positive control), after which the bar names the doc and offers Edit; **Folder doc** and **Thumbnails** swap the body; **Subfolders** shows the folder's doc and its subfolder's; **New TODO** opens the Quick TODO box named for the folder on screen and saving puts the file there, while the `/` command aims it at the current folder; a markdown file's Edit reads Done with the editor open and an autosave shows Saved; a kind with no preview names its extension and offers Open and Show in folder; no mode block carries a heading; a PDF loads with `#toolbar=0&view=FitH` in the side pane and `#zoom=150&toolbar=0` expanded. |
| `runner-empty-list.cjs` | An empty Runner list says why. The positive control comes first: a list with rows does not show the line. Text that finds nothing in a folder shows a line naming the folder and the text and offering Enter; with Folders only and a date sort on, the line names Folders only and leaves the sort out, since `narrows: false` marks it. Enter in the box then drops the folder and keeps the text, finding a file outside the folder, and the line goes. Without a folder or a chip, the line reads only "Nothing matches ‘…’". |
| `machine-features.cjs` | A markdown row on this machine, where a gmist checkout exists, carries the local gmist pen (the positive control); started again with `TAGFOX_GMIST_FORCE_BUNDLED=1` and no bundled gmist, which is a recipient's machine, main reports no gmist and the row has no local pen while keeping its other buttons. Skips the second half loudly when the checkout carries a bundled gmist. |
| `row-actions-keys.cjs` | The selected row's action buttons by keyboard, in Classic and in Runner, by real key events: Tab in the list focuses the row's first button and puts the strip on screen with the pointer elsewhere (Runner otherwise shows it only on hover); further Tabs step along and wrap, Shift+Tab steps back and wraps; the status line names the focused button; Esc returns to the list, closes the strip and leaves the box and folder alone; Down leaves the strip and moves the selection. The positive control is a press: Enter in Classic and Space in Runner on **Open parent folder** move the scope to the row's folder, so a strip that took the focus and pressed nothing fails. |
| `window-chrome.cjs` | Settings "Hide the window's title bar", seeded into a fresh profile: the window buttons are drawn over the page, Runner's drag strip is the title bar's height while the 3px gradient stays 3px, nothing clickable sits under the window buttons in Runner, Classic or the expanded Viewer, the Classic header drags while its buttons click, the window buttons follow the light and dark theme, and with the setting off the window keeps its title bar (positive control). |
| `fuzz.cjs` | Random bursts of actions (type, refresh, recency, view, scope, scheduled search, auto-refresh tick) with a structural check plus a consistency re-search after every burst. |
| `file-dialog-handoff.cjs` | The renderer half of sending a row to another app's Open or Save dialog, in Runner by real key events, with main's `tagfox-file-dialog-target` message delivered through the test hook (a test cannot press the OS-wide shortcut or put a dialog in front) and the sends read back from the renderer's own log. With no dialog waiting there is no strip and Enter goes into a folder (the positive control); with an Open dialog waiting the strip names the app and the dialog, Enter on a file and on a folder sends that row while TagFox stays in its folder, a double-click sends, Ctrl+Enter sends the folder TagFox is showing, and main's "No Open or Save dialog is waiting" reaches the status line; a Save dialog's strip keeps its file name and leaves Save to Steve; Esc removes the strip, nothing more is sent and Enter goes into a folder again. |
| `manual-file-dialog.cjs` | **By hand only, after asking Steve: it opens real dialogs on screen for about fifteen seconds.** The main half (`file-dialog-handoff.js`) against PowerShell's own Open and Save As dialogs, started by the test so their PIDs are known and no keystroke goes to any app. An Open dialog is recognised with its folder and an empty name, a folder sent to it is navigated to (its address bar names it afterwards), a file sent to it opens (the dialog closes and hands that path back, the positive control), and the closed dialog is then refused. A Save dialog is recognised with its file name, a folder fills in folder + name, and Save is not pressed: the dialog is still open seconds later with nothing handed back. A control inside a dialog is not taken for a dialog. Kills its PowerShells by PID. |
| `hover-preview.cjs` | Settings "Hover preview", in Classic and in Runner, with a real PNG and real pointer moves: resting on a row's name opens nothing; resting on its icon opens the preview (the positive control); a repaint that takes that row away from under the resting pointer closes the open preview, and stops one still on its way; a key press closes it. A repaint has no mouseout for the row it replaces, which is what left previews stuck over the list. |
| `run-all.cjs` | Runs the above in sequence, each under a five-minute deadline, and prints a pass/fail summary. |
| `test-processes.cjs` | Not a test: finds and stops the Electron processes this checkout started on a test profile, for `run-all.cjs` and the restart test. Both quotings of `--user-data-dir` occur (`app.relaunch()` quotes the whole argument). |

## Invariants checked (`structuralProblems` in `harness.cjs`)

After every settle:

- **id integrity:** each canonical results id (`tbody`, `resultsTable`, and so on) appears exactly once.
- **settled:** no search depth, nothing in flight, no pending debounce (no deadlock).
- **active-tab state in sync:** global `lastRows` equals the active tab's stored rows.
- **an active tab:** there is at least one tab.
- **render matches data:** when no recency / folders-only / files-only filter is hiding rows, the visible
  tbody is non-empty exactly when `lastRows` is non-empty.

`fuzz.cjs` also re-runs the identical search and checks the row count is unchanged, *unless* smart view
changed the subfolders/content toggles between the two searches (smart auto narrow/widen is deliberately
non-idempotent, so that case is expected and skipped).

## How it works: the `#tagfoxtest` hook

`renderer.js` ends with a block guarded by `location.hash.includes('tagfoxtest')`. It is inert in normal use
(TagFox never loads with that hash) and only activates when a test loads the page with `#tagfoxtest`. It
exposes `window.__tagfoxTest` with:

- search drivers: `runSearchNow`, `refreshNow`, `scheduleSearch`, `setQuery`, `setRecency`, `setView`,
  `setScope`, `loadMore`, `autoTick`, `configure`.
- global shortcut drivers: `openRecentTab`, `hotkeyRaised`.
- test controls: `disableAutofill` (headless viewport makes auto-paging nondeterministic), `mutate`,
  `tombstone`.
- Viewer markdown editor: `selectViewerFile(path)` (previews a file through the real props-panel path),
  `mdOpenEditor`, `mdCloseEditor`, `mdSetBuffer(text)`, `mdFlush`, and the `mdState()` inspector.
- inspectors: `state()` (active tab, its row count, depth, in-flight, id integrity, status)
  and `diag()` (filter-stage counts and the current rows).

The hook is the only test-specific code in the shipped app and adds no behaviour to normal runs.

## Adding a test

Require `./harness.cjs`, call `connect({ port, profile })` for a driver, drive via `T('method', ...args)`,
`await settle('label')`, and assert with `structuralProblems(s)`. Use a unique `port` and `profile` per
file. `connect({ profileFiles: { name: text } })` writes files into the fresh profile before launch, for
settings main reads at startup (`window-chrome.cjs` seeds `tagfox-window-chrome.json`). Add new drivers or inspectors to the `#tagfoxtest` hook in `renderer.js` if you need more control.
