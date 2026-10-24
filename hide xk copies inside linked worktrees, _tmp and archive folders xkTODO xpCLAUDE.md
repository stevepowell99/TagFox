TagFox lists task files that are copies, not tasks: about 1,600 xk files sit inside the 11 linked git worktrees of `C:\dev\causal-map-extension`, and others in `_tmp` and `archive` folders. The hub's session-start scanner already skips them (`C:\Users\Zoom\.claude\bin\surface-tasks.ps1`, `IsLinkedWorktree` and its `$skip` list); TagFox has no equivalent.

The row filter lives in `applyAdvancedPathHides` (`renderer.js`, about 14760-14769). `optHideSpecial` already hides `.claude\worktrees\`, but four worktrees sit outside any dot-folder or `_tmp` (`C:\dev\cme-words`, `C:\rbx-src\afirst`, `C:\rbx-src\recall`, two under `C:\Users\Zoom\freestyle-vsjr\*\_src`), so path rules alone cannot do it. Detection has to read the `.git` file:

- `main.js`, beside `path-kinds` (about line 6232): add `ipcMain.handle('linked-worktree-dirs', ...)`. For each directory, walk up its ancestors (memoised) and test `fs.stat(dir/.git).isFile()` plus `/[\\/]worktrees[\\/]/` in its content, the same test as `IsLinkedWorktree`. A Drive repo's `.git` file points at `C:\dev\_gitdirs\`, which does not match.
- `preload.js` (about line 96): expose it.
- `renderer.js`: after each search, send the unique directories of rows carrying a status tag once, and keep the answer in a Set.
- `applyAdvancedPathHides`: a fourth pass that drops a row with an xk, xp or xx tag when a path segment is `_tmp`, `archive` or `_archive`, or an ancestor is in the Set. Apply it to tagged rows only, so ordinary files in archive folders stay visible. Add a "Show copies" toggle beside `showHiddenUntil` (about line 14664).

The skip list then exists in PowerShell and JavaScript: add a line to the hub memory `reference_xk_task_files.md` saying both change together. Also wrap the cleanup in `test/runner-tags.cjs` (the `rmSync` at about line 350) in `finally`, since a crashed run left four xk-named fixtures in `_tmp\runner-tags-15712\`.

Pass: a search for xkTODO no longer returns the cm4 worktree copies.

Mapped by the dream sweep of 24 October 2026 (read-only review).
