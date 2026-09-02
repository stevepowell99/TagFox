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

## Prerequisites

- `npm install` has been run (Electron is a dev dependency; `vendor/` is synced by `postinstall`).
- Everything 1.5a with the HTTP server is running (the same requirement as the app). The tests auto-detect
  the port: they try `$TAGFOX_TEST_URL`, then `http://localhost:8080`, then `http://localhost:7070`. Set
  `TAGFOX_TEST_URL` if yours differs.
- Node 18+ (uses the global `WebSocket`). The repo runs on Node 22.

## Running

```
npm test                      # whole suite (smoke + tab-lifecycle + tab-isolation + load-more + column-resize + splitter-drag + refresh-visible + quiet-refresh + 3 fuzz seeds)
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
during a run). A hidden window still renders and drives through the `#tagfoxtest` hook over CDP. Normal app
runs are unaffected: `main.js` only skips `show()` when that env var is set.

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
| `quiet-refresh.cjs` | Auto-refresh is silent until something really changes: four ticks over an unchanged folder leave the row nodes and the scroll position alone, and a file appearing on disk still gets through and repaints. The positive control matters more than the negative one here, because a tick that never ran looks exactly like a tick that found nothing. |
| `fuzz.cjs` | Random bursts of actions (type, refresh, new/close/cycle tab, recency, view, scope, auto-refresh tick) with a structural check plus a consistency re-search after every burst. |
| `run-all.cjs` | Runs the above in sequence and prints a pass/fail summary. |

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
- inspectors: `state()` (active tab, tab list + per-tab row counts, depth, in-flight, id integrity, status)
  and `diag()` (filter-stage counts and the current rows).

The hook is the only test-specific code in the shipped app and adds no behaviour to normal runs.

## Adding a test

Require `./harness.cjs`, call `connect({ port, profile })` for a driver, drive via `T('method', ...args)`,
`await settle('label')`, and assert with `structuralProblems(s)`. Use a unique `port` and `profile` per
file. Add new drivers or inspectors to the `#tagfoxtest` hook in `renderer.js` if you need more control.
