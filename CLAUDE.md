# TagFox

Electron desktop UI over the local [Voidtools Everything](https://www.voidtools.com/) HTTP server. No backend; it talks only to Everything and the local filesystem. Main editor: Cursor.

## Where the docs are

Do not duplicate these here; read them:

- `README.md` "For developers" is canonical for run/build, project layout, how search works, and the **Search concurrency and dual panes** architecture note.
- `test/README.md` is canonical for the automated tests.

## Working rules

- After changing search, results rendering, paging, or the dual-pane logic in `renderer.js`, run `npm test`. The dual-pane / refresh concurrency is the most fragile part of the codebase; the bugs fixed in June 2026 (searches rendering into the hidden pane; load-more rows lost on a background refresh; copy/delete bleeding between panes) are written up in the README concurrency section and guarded by the suite.
- **Keep the inactive pane passive.** Only the active pane is live. Nothing (search, F5, auto-refresh, CRUD) may refresh, mirror or re-render the inactive pane in the background; it re-runs its own search only when activated. Every past dual-pane bug came from a background flow touching the other pane. If you think you need to update both panes at once, you almost certainly do not.
- The tests drive the real app over CDP via a `#tagfoxtest` hook at the end of `renderer.js` (inert in normal runs). See memory `[[reference_electron_cdp_testing]]` for the general technique.
- Dates in generated output / change stamps must not use year-less numeric form (global writing rule).

## Open threads

- **Smart view flips the subfolders toggle between searches.** Smart auto narrow/widen changes `showSubfolders` (and content) on its own, so repeated identity searches are not idempotent (e.g. 8 rows "this folder only" then 60 "with subfolders"). This is by design but can feel flaky. Offered to Steve to make it less surprising; not yet actioned.
- **Drive sync-status badge: decided against a general one.** Steve's Google Drives are mirrored, not streamed (see hub `env-windows.md`), so a downloaded-vs-cloud-only badge reads "local" for everything and carries no signal; live upload/sync state has no clean API. The only place a marker would inform is shared/streamed content under `.shortcut-targets-by-id` (which `main.js` already detects). Unresolved: whether to add that narrow "shared (streamed)" marker.
