# TagFox tests

Automated regression tests for the search and dual-pane logic in `renderer.js`. They launch the real app
under the Chrome DevTools Protocol (CDP) and drive it through a hidden test hook, so they exercise the
actual renderer, not a reimplementation.

These guard the two concurrency bugs fixed in June 2026 (see [Search concurrency and dual panes](../README.md#search-concurrency-and-dual-panes)):

- Searches rendering into the hidden pane during the startup / refresh pane dance.
- Load-more rows being dropped when the background inactive-pane refresh ran.

## Prerequisites

- `npm install` has been run (Electron is a dev dependency; `vendor/` is synced by `postinstall`).
- Everything 1.5a with the HTTP server is running (the same requirement as the app). The tests auto-detect
  the port: they try `$TAGFOX_TEST_URL`, then `http://localhost:8080`, then `http://localhost:7070`. Set
  `TAGFOX_TEST_URL` if yours differs.
- Node 18+ (uses the global `WebSocket`). The repo runs on Node 22.

## Running

```
npm test                      # whole suite (smoke + load-more + 3 fuzz seeds)
npm run test:smoke            # readable walkthrough of the main flows
npm run test:loadmore         # focused load-more / pane-state regression
npm run test:fuzz             # randomized fuzz, default 60 iterations
node test/fuzz.cjs 100 31337  # fuzz: <iterations> <seed>
```

Each test launches its own isolated Electron instance (its own CDP port and `--user-data-dir` under the
temp folder), so do not run them in parallel; `run-all.cjs` runs them in sequence. A run leaves no trace in
your real TagFox profile.

## What each file covers

| File | Covers |
|------|--------|
| `harness.cjs` | Shared library: launch Electron under CDP, the `#tagfoxtest` driver, `settle()`, and `structuralProblems()` (the invariants below). Not a test itself. |
| `smoke.cjs` | Startup, a 10x F5 refresh loop, type+refresh races, pane switches, rapid A/B toggles, and the inactive-pane dance racing a scheduled search. Checks the structural invariants after each step. |
| `loadmore-regression.cjs` | Loads a second page, runs the background dance, and checks the loaded rows survive (the load-more desync bug). |
| `fuzz.cjs` | Random bursts of actions (type, refresh, pane switch, recency, view, scope, dance, auto-refresh tick) with a structural check plus a consistency re-search after every burst. |
| `run-all.cjs` | Runs the above in sequence and prints a pass/fail summary. |

## Invariants checked (`structuralProblems` in `harness.cjs`)

After every settle:

- **id integrity:** each canonical results id (`tbody`, `resultsTable`, and so on) appears exactly once.
- **base `#tbody` is in the active pane:** the canonical id never strands on the hidden pane.
- **CSS active matches logical active:** `.results-pane-active` matches `activeResultsPane`.
- **settled:** no search depth, nothing in flight, no pending debounce (no deadlock).
- **active-pane state in sync:** global `lastRows` equals the active pane's stored `lastRows`.
- **render matches data:** when no recency / folders-only / files-only filter is hiding rows, the visible
  tbody is non-empty exactly when `lastRows` is non-empty.

`fuzz.cjs` also re-runs the identical search and checks the row count is unchanged, *unless* smart view
changed the subfolders/content toggles between the two searches (smart auto narrow/widen is deliberately
non-idempotent, so that case is expected and skipped).

## How it works: the `#tagfoxtest` hook

`renderer.js` ends with a block guarded by `location.hash.includes('tagfoxtest')`. It is inert in normal use
(TagFox never loads with that hash) and only activates when a test loads the page with `#tagfoxtest`. It
exposes `window.__tagfoxTest` with:

- drivers: `runSearchNow`, `refreshNow`, `refreshInactivePane`, `activatePane`, `scheduleSearch`,
  `setQuery`, `setRecency`, `setView`, `setScope`, `loadMore`, `autoTick`, `configure`.
- test controls: `disableAutofill` (headless viewport makes auto-paging nondeterministic).
- inspectors: `state()` (active pane, depth, in-flight, per-pane row counts, id integrity, status) and
  `diag()` (filter-stage counts and the current rows).

The hook is the only test-specific code in the shipped app and adds no behaviour to normal runs.

## Adding a test

Require `./harness.cjs`, call `connect({ port, profile })` for a driver, drive via `T('method', ...args)`,
`await settle('label')`, and assert with `structuralProblems(s)`. Use a unique `port` and `profile` per
file. Add new drivers or inspectors to the `#tagfoxtest` hook in `renderer.js` if you need more control.
