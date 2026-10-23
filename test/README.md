# TagFox tests

Automated regression tests for the search and result-tabs logic in `renderer.js`. They launch the real app
under the Chrome DevTools Protocol (CDP) and drive it through a hidden test hook, so they exercise the
actual renderer rather than a reimplementation.

The results area is a set of scratch tabs (see [Result tabs](../README.md#result-tabs)). Only the active
tab has DOM and is refreshed; inactive tabs are passive state snapshots re-searched on activation. The tests
guard:

- The single canonical results DOM (`tbody`, `resultsTable`, and so on) stays present and unique.
- Load-more rows are stored on the active tab and rendered (the load-more desync bug).
- A copy or delete in the active tab never mutates another tab's stored rows.
- Tab lifecycle: open to the cap, refuse past it, close down to one (never zero), cycle with wraparound,
  reorder, and spring-hover activation.
- Every visible results column divider can actually be grabbed with the mouse.
- The Viewer splitter follows the pointer across the previews, stops where the layout stops it, and lets go.
- The global Ctrl+Shift+Space tab opens (or reuses an empty-scope tab) with every filter reset and a 1 hour recency window, and leaves the scoped tab it came from alone.
- Previewing a markdown file never writes it back, and an edit whose file has moved on disk is refused.

## Prerequisites

- `npm install` has been run (Electron is a dev dependency; `vendor/` is synced by `postinstall`).
- Everything 1.5a with the HTTP server is running (the same requirement as the app). The tests auto-detect
  the port: they try `$TAGFOX_TEST_URL`, then `http://localhost:8080`, then `http://localhost:7070`. Set
  `TAGFOX_TEST_URL` if yours differs.
- Node 18+ (uses the global `WebSocket`). The repo runs on Node 22.

## Running

```
npm test                      # whole suite (smoke + tab-lifecycle + tab-isolation + load-more + column-resize + splitter-drag + refresh-visible + quiet-refresh + md-preview-no-write + menu-enter + recent-folders-filter + recent-tab + runner-layout + runner-keys + runner-syntax + window-chrome + 3 fuzz seeds)
npm run test:smoke            # readable walkthrough of the main flows
npm run test:tabs             # tab lifecycle: open/close/cap/cycle/reorder/spring-hover
npm run test:loadmore         # focused load-more / tab-state regression
npm run test:fuzz             # randomized fuzz, default 60 iterations
node test/fuzz.cjs 100 31337  # fuzz: <iterations> <seed>
```

Each test launches its own isolated Electron instance (its own CDP port and `--user-data-dir` under the
temp folder), so do not run them in parallel; `run-all.cjs` runs them in sequence. A run leaves no trace in
your real TagFox profile.

The harness spawns Electron with `TAGFOX_TEST_HIDDEN=1`, so the window never shows onscreen (no flashing
during a run). A hidden window still renders and drives through the `#tagfoxtest` hook over CDP. The same
variable turns off the dev reloader, so editing a file in the repo while the suite runs no longer reloads a
test's window and strips its hook mid-run, and it keeps a test instance off the OS-wide hotkeys: whichever
TagFox registers Ctrl+Space first owns it, so a test instance started while Steve's was down answered his
Ctrl+Space with a blank profile. Normal app runs are unaffected: `main.js` only skips `show()`, the reloader
and the hotkeys when that variable is set.

The hook normally appears about a second after launch, but a machine busy with other Electron starts has
taken over 12s, so `connect()` waits up to 45s and prints `(slow start: …)` for any start over 5s. A start
that never produces the hook fails with the page's URL and load state and the tail of Electron's stderr, so
a loaded machine and a renderer that failed to load read differently.

`run-all.cjs` gives each run five minutes. A run that overstays is killed along with the Electron it
launched and counted as failed, so one hung test cannot stall the suite. Each run's time is printed after
it. After every run it also looks for an Electron still running on a test profile (a folder in the temp
directory whose name starts `tagfox-test-`, found by `test-processes.cjs`, never by image name) and stops
it by PID, failing that run with `LEFT RUNNING by …`. A relaunched TagFox is outside the process tree a
kill reaches, which is how one was once left open on Steve's screen.

## What each file covers

| File | Covers |
|------|--------|
| `harness.cjs` | Shared library: launch Electron under CDP, the `#tagfoxtest` driver, `settle()`, and `structuralProblems()` (the invariants below). Not a test itself. |
| `smoke.cjs` | Startup, a 10x F5 refresh loop, type+refresh races, opening a 2nd/3rd tab and searching different scopes, cycling tabs, and closing the active tab. Checks the structural invariants after each step. |
| `tab-lifecycle.cjs` | Open to the cap, refuse the 11th, cycle with wraparound, reorder by index, spring-hover activation, and close down to one (never zero). |
| `crud-pane-isolation.cjs` | A delete in the active tab must leave another tab's stored rows untouched (cross-tab CRUD bleed). Guards the passive-inactive-tab rule. |
| `loadmore-regression.cjs` | Loads two extra pages and checks the rows are stored on the active tab and rendered (the load-more desync bug). |
| `column-resize.cjs` | Walks `elementFromPoint` across every visible header boundary, in flat and tree view, and requires the resize handle to be on top for most of a 15px window. Catches handles buried under the neighbouring sticky `th`, which leaves a divider half-dead and sends boundary clicks to that column's sort. |
| `refresh-visible.cjs` | The header Refresh button exists and is wired. Every explicit refresh route (button, F5) writes a `Refreshed hh:mm:ss — N row(s), …` status. Guards the answer to "F5 sometimes does not refresh": a refresh that finds nothing new must still prove it ran. |
| `quiet-refresh.cjs` | Auto-refresh is silent until something really changes: four ticks over an unchanged folder leave the row nodes, the scroll position and the status line alone (a tick used to leave "Searching…" there for good), and a file appearing on disk still gets through and repaints. The positive control matters more than the negative one here, because a tick that never ran looks exactly like a tick that found nothing. |
| `md-preview-no-write.cjs` | Previewing a `.md`/`.txt` file must never write it back, opening the editor re-reads the file, and a write whose file has moved on disk is refused. The positive control is the half that matters: an edit made in the open editor, and one saved by closing it, must still reach disk, or a fix that simply stopped saving would pass. |
| `menu-enter.cjs` | Ctrl+L opens the recent-folders menu, the arrows move through it without the results list also taking them, and Enter applies the focused folder. Sent as real key events over CDP, because a synthetic click would pass whether or not the global Enter handler swallowed the key. |
| `recent-tab.cjs` | The renderer half of the global Ctrl+Shift+Space (`openRecentTab`, driven through the test hook): the tab is empty of query, scope folder, tags and every search option, carries a 1 week recency window that reaches the Everything query as `dm:`, an existing empty-scope tab is reused (from another tab, and in place after typing in it) instead of a third being opened, and the scoped tab it came from is unchanged. The OS-wide registration itself lives in `main.js` (`RECENT_TAB_ACCEL`) and is not pressable from a test without raising the window. |
| `restart-in-terminal.cjs` | TagFox started through `scripts/start.js` says so, fills the Settings **Running now** block, and on Restart comes back as a new process under the same wrapper. Then a TagFox carrying the wrapper's environment with no wrapper above it, the state Ctrl+F5 used to leave: it must not claim the terminal, and Restart must relaunch it rather than end it. Every wait on the relaunched one is bounded, and it is stopped by its profile afterwards, since it runs outside the test's process tree. |
| `runner-layout.cjs` | The Runner layout, by real key events: an empty box lists only the current folder, a file created on disk appears (positive control), typing searches below the folder, name matches rank above path-only matches, a year-old whole-word name ranks above a just-modified inside-word one (so recency cannot outweigh the match), `.md` lists markdown files only with the newest first, `-word` excludes, Down keeps focus in the box, Right and Left move into a folder and back to its parent, `/` filters commands and Enter runs one, `Ctrl`+`D` stars and unstars (and the favourites column shows a starred file as a file), hovering a row shows its buttons, AppData\Local\Temp is hidden by default and the `/` command shows it (shown first, so the hidden check cannot pass on a file Everything has not yet indexed), and switching back restores Classic's own view. |
| `runner-keys.cjs` | Runner's keys and what they put on screen, by real key and mouse events: with the defaults there are no filter chips, a changed setting shows one and its x (or Reset all) puts the default back; checkboxes appear once Shift+Down checks two rows and Esc removes them; Enter straight after typing acts on the new search's top row (the positive control is a different folder selected first); letters typed with the focus off the box go into it rather than to Classic's one-letter shortcuts; a held Backspace stops at the empty box; Ctrl+L (Classic's recent folders) opens nothing; holding Ctrl numbers nine rows and Ctrl+2 opens the second; PageDown, Ctrl+End and Ctrl+Home move as described; Tab and Shift+Tab move between the box and the list, where Space toggles a check; Alt+P hides and shows the Viewer; `?` opens Help at Runner's keys, drawn from the key table; Alt+Home clears text, folder and filters; Ctrl+Tab is answered rather than switching hidden tabs; F1 opens Help on the Runner tab; an AppData file ranks below the same name elsewhere but not inside an AppData folder; and Esc steps through text, folder and hiding. It writes one folder under `%LOCALAPPDATA%` for the AppData check and removes it. |
| `runner-syntax.cjs` | What can be typed into Runner's box, one check per convention against files made for the test: Everything's own syntax passes through (`a|b`, `!word`, `"phrase"`, `ext:`, `dm:today`, `size:>1mb`, `regex:`, `<grouping>`, `wfn:`), and Runner's additions work on top: `-word`, `-.docx`, a bare `pdf` filtering strictly (a `pdf exports` folder must not appear), `map` staying a word, `^map` matching at word starts only, and the / toggle **Word starts only** doing the same for every word and showing as a chip. |
| `window-chrome.cjs` | Settings "Hide the window's title bar", seeded into a fresh profile: the window buttons are drawn over the page, Runner's drag strip is the title bar's height while the 3px gradient stays 3px, nothing clickable sits under the window buttons in Runner, Classic or the expanded Viewer, the Classic header drags while its buttons click, the window buttons follow the light and dark theme, and with the setting off the window keeps its title bar (positive control). |
| `fuzz.cjs` | Random bursts of actions (type, refresh, new/close/cycle tab, recency, view, scope, auto-refresh tick) with a structural check plus a consistency re-search after every burst. |
| `run-all.cjs` | Runs the above in sequence, each under a five-minute deadline, and prints a pass/fail summary. |
| `test-processes.cjs` | Not a test: finds and stops the Electron processes running on a test profile, for `run-all.cjs` and the restart test. Both quotings of `--user-data-dir` occur (`app.relaunch()` quotes the whole argument). |

## Invariants checked (`structuralProblems` in `harness.cjs`)

After every settle:

- **id integrity:** each canonical results id (`tbody`, `resultsTable`, and so on) appears exactly once.
- **settled:** no search depth, nothing in flight, no pending debounce (no deadlock).
- **active-tab state in sync:** global `lastRows` equals the active tab's stored rows.
- **tab count in range:** at least one tab, at most ten.
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
- tab drivers: `newTab`, `closeTab(id)`, `activateTab(id)`, `cycleTab(dir)`, `reorderTab(from,to)`,
  `springHoverTab(id)`, `tabIds()`.
- test controls: `disableAutofill` (headless viewport makes auto-paging nondeterministic), `mutate`,
  `tombstone`.
- Viewer markdown editor: `selectViewerFile(path)` (previews a file through the real props-panel path),
  `mdOpenEditor`, `mdCloseEditor`, `mdSetBuffer(text)`, `mdFlush`, and the `mdState()` inspector.
- inspectors: `state()` (active tab, tab list + per-tab row counts, depth, in-flight, id integrity, status)
  and `diag()` (filter-stage counts and the current rows).

The hook is the only test-specific code in the shipped app and adds no behaviour to normal runs.

## Adding a test

Require `./harness.cjs`, call `connect({ port, profile })` for a driver, drive via `T('method', ...args)`,
`await settle('label')`, and assert with `structuralProblems(s)`. Use a unique `port` and `profile` per
file. `connect({ profileFiles: { name: text } })` writes files into the fresh profile before launch, for
settings main reads at startup (`window-chrome.cjs` seeds `tagfox-window-chrome.json`). Add new drivers or inspectors to the `#tagfoxtest` hook in `renderer.js` if you need more control.
