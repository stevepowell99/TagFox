# Delete the Classic layout's code in stages

Steve decided on 24 October 2026 to keep only Runner: hide Classic first, then delete its code in stages. Classic is hidden (no layout switch, every real start in Runner; the test hook still opens a fresh profile in Classic so its tests guard the code until it goes). This file is the inventory to delete against.

- **Each stage** deletes one area (for example Tree and Smart views), its CSS and HTML, and the tests that cover only it, and keeps every piece Runner depends on (listed below). Run the full suite after each stage.
- **Steve decided on 25 October 2026** what Runner gains before Classic's code goes: the deadline filters as `/` Due commands; a "Show only starred items" command instead of a visible star list; and Windows Recent as a ranking boost rather than a list. A "Search this folder only" command keeps typing to the current folder's own contents. All four are in Runner now. The Shelf shows in Runner (`2d8c22b`), and so does the Restart button, in the search box. Saved searches are back in Runner too (Steve, 25 October 2026): `/` commands ("Save this search", then one per saved search) and `Alt`+`1`…`9`, reading the same `LS.favSearches` list Classic saved, so stage two took only Classic's bar.

Read-only survey by a subagent at main `74c8ac1`; line numbers are approximate. Since then Runner has gained chips for the deadline and hide-until filters (the hazard the survey found).

**Summary.** Runner would lose Smart view, Tree view and the tag bar's counts. Classic cannot be cut out cleanly, because Runner keeps its state in Classic's hidden controls.

## What only Classic does

"Runner?" says whether Runner has an equivalent.

### Views and search

| Feature | In Classic | Runner? | Code |
|---|---|---|---|
| Smart view (auto narrow and widen, "Big folder!" chip) | `#optRvSmart`, `i` / Ctrl+I | None; Runner is always flat | `smartBeforePaint`, `smartAfterPaint`, `smartSearchShouldStartBroad`, `reimposeSmartViewDefaults` (~250 lines) |
| Tree view (path grouping, twisties, collapse state) | `#optRvTree`, `+` / `-`; Settings tree-performance option | None | `buildPathGroupedDisplayRows`, `pathTreeGutterStringsForDepths`, `refreshResultsTreeCollapseHidden` (~300 lines) |
| Subfolders on/off | `optRvSubsOn/Off`, `s` / Ctrl+S | Yes: the `/` command "Search this folder only" and its chip | `applyResultsViewRadiosToDom`, `isShowSubfolders` |
| Files and folders / folders only / files only | `f` / Ctrl+F | Partial: `/folders`, `/files` | `resultsContentMode` |
| Match options | toolbar, bare letters | Partial: `/` commands and Ctrl keys | `searchOptionsFromUI`, `toggleSearchOptCheckbox` |
| Recency 1h / 1d / 1w / 1m / 1y / All | toolbar radios | Partial: `/` has all, 1h, 1d, 1w; 1m and 1y only by Ctrl+R cycling | `setRecencyFilterMode` |
| Deadline filter (Overdue, Today, This week, Next week) and "Show hidden" for `xh-` files | `btnToggleDeadline`, `deadlineFilterPanel`, `optShowHiddenUntil` | Yes: the `/` Due commands and their chips | `setDeadlineRange`, `setShowHiddenUntil` |
| Tag bar: pills with counts, include/exclude, More, AND/OR, ↻ full-index rescan | `#tagBar` | Partial: per-tag commands, the tags chip, Ctrl+T; no counts, no OR, no rescan | `renderTagBarImpl`, `runTagDiscoverySearch` |
| Column sort by name, path, size, modified, either direction | header click; `z`, `m`, `n` | Partial: smart, date, name, size, size smallest first; no path sort, no oldest first, no Z-A | `applySortColumnKey`, `updateSortHeaders` |
| Column resizing | `.th-resize` | None | `startTableColResize`, `applyTableColWidths` |
| Status line with hit count and filter hints | standing line | None: Runner shows no count except "N of M ranked" | `formatResultsStatusMainHtml`, `hiddenDueToStatusHtml` |
| Empty-result pulse hints | toolbar pulses | Partial: only the box pulses | `updateEmptyResultsPulseHints` |

### Shelf

Staging folder `%APPDATA%\...\TagBrowserShelf`. Drop files on `#appShelf` (move; Shift copies), drag chips out, `#btnShelfOsDrag` arms an OS drag (Alt+drag too), clear and per-chip remove, the row menu's "Put shortcut on shelf" (shared menu, so it survives), Settings "Open the shelf folder". Runner shows it under the list (`2d8c22b`), so it is shared now. Renderer ~200 lines (`renderShelf`, `bindShelfDrop`, `bindShelfChipDrag`); `main.js` ~250 lines (`registerShelfIpc`, `isPathUnderShelf`, `movePathsToShelf`). help.md mentions an "Add to Shelf" button that does not exist.

### Breadcrumb and folder actions

Classic only: clear-folder ×, parent ▲, typed-path editor, recent-folders dropdown (Ctrl+L), drive picker. Runner keeps the names and ▾ menus, and Left, Backspace, Esc and the chip's × replace clear and parent, but has no typed path, no drive picker and no Ctrl+L. The folder buttons are shared (they move into the chip).

### Header (hidden in Runner)

History back/forward (Runner: Alt+←/→), Undo (Ctrl+Z), Restart (Runner: the same button, moved into the search box), Refresh (F5, `/refresh`), Help (F1, `?`), dark mode (`/dark`), zoom buttons (Ctrl+/-/0 still work), Settings (`/settings`, Ctrl+,), "New dbg" (none), the Drive API ping (none), the "Did you know" tips (none).

### Viewer, Settings, global shortcuts

- Viewer modes are shared; only the splitter `#splitProps` and its remembered width are Classic's (Runner: a fixed third, Alt+P).
- Settings: only "Open the shelf folder" and the tree-performance option are Classic's.
- Ctrl+Alt+Space and Quick TODO are shared. **Ctrl+Shift+Space** (`openRecentTab`) resets the search in place in both layouts; Runner's branch is guarded in `runner-layout.cjs`, and Classic's reset (every option off but Match path, smart view) in `recent-tab.cjs`.

## Classic code Runner depends on

- **Hidden controls as Runner's state store (the main obstacle):** `#rootFolder` (current folder); `#optPath`, `#optHideSpecial`, `#optHideTilde`, `#optCase`, `#optWholeWord`, `#optDiacritics`; the recency radios; the `optRv*` view radios; `sortColumn`/`sortAsc` and `compareRowsBySort`.
- **Breadcrumb:** `#breadcrumbBar`, `renderScopeBreadcrumb`, `goToBreadcrumbFolder`, the flyout and dropdown helpers, the six `btnScopeBar*` buttons.
- **Tags:** the filter state and functions, `appendTagFiltersToEverythingQuery`, `renderTagBar` (runs on every search into the hidden bar), the tag store and modal, and the rename, new-folder, paste-target, bulk-rename and recycle modals.
- **Results table:** `renderTableImpl` (including Classic's row buttons), `#bulkBar`, `loadMoreResults`, `rowActionStripHandleKeydown`.
- **Viewer:** `#propsAside` and everything in it.
- **Favourites store (the stars):** `loadFavouriteFolders`, `saveFavouriteFolders`, `toggleStarPath`, `openFavouritePath` (Ctrl+Shift+1..9, which asks IPC `path-kinds` whether a star is a file or a folder); `fuzzyPathScore` (used by Runner's `/` list) lives in the favourites code. IPC `windows-recent-folders`/`-files` and `scanWindowsRecentLnkTargets` in `main.js` feed Runner's ranking boost and are not Classic's.
- **Tab state:** `tabs`, `saveActiveTabStateFromUi` (called by `setRunnerMode`), `persistTabsToStorage`, the load-more persist and startup tab init. Collapsing it is a stage of its own (below).
- **History and undo:** `searchHist`, `goSearchHistory`, `runUndo`.
- **Clicked hidden controls:** `#btnToggleDarkMode`, `#btnToggleSettings`, `#helpModal`, `#settingsPanel`, `#selToggleOpens`; `#statusMain` and `setStatusMain`.
- **Smart and tree code is guarded, not isolated:** `runSearch` sets the Smart state and calls `smartBeforePaint`/`smartAfterPaint`; `renderTableImpl` and `listRowsForUi` call the tree helpers.
- **Keys:** Runner's key table hands several keys to Classic's handler (Ctrl+R, Alt+←/→, F5, Space, Ctrl+A, Ctrl+Shift+1..9, Shift+Space, F2, Ctrl+Shift+N, Ctrl+H, F1, Ctrl+,), and some work in Runner only by falling through to it: Ctrl+W, Ctrl+., Ctrl+J/K, Ctrl+Shift+R, Ctrl+Z, Ctrl+↑ / Alt+↑, Ctrl+Shift+Home.

## Classic-only keys

- Bare letters outside a text field: `i`, `f`, `s`, `w`, `p`, `.`, `t`, `r`, `z`, `m`, `n`, `j`, `k`, `+`, `-`, Home, End, and `/` (focus toggle).
- Ctrl+I layout cycle, Ctrl+F content cycle, Ctrl+S subfolders, Ctrl+L recent folders, Ctrl+Home clear folder, Ctrl+Enter scope to the parent, Ctrl+U unfocus search.
- Left from the results can scope to the first subfolder towards a deeper item; Runner's Left only goes up.

## Tests

- **Classic only:** `smoke`, `fuzz`, `column-resize`, `splitter-drag`, `menu-enter`, `recent-folders-filter`, `recent-tab`, `zoom-buttons`, `refresh-visible` (header button half).
- **Runner only:** the `runner-*` tests and `viewer-runner`, several with Classic round-trip checks that would need rewriting.
- **Both:** `hotkey-raise-select`, `hover-preview`, `row-actions-keys`, `window-chrome`.
- **Layout-neutral but run in Classic:** `md-preview-no-write`, `quiet-refresh`, `loadmore-regression`, `delete-hides-row`, `restart-in-terminal`, `gmist-start-guard`, `help-build`, `tags-dates`.
- `test/README.md` omits tags-dates, zoom-buttons, repro-crash, recent-folders-filter, gmist-start-guard and hover-preview.

## Stages named so far

- **Collapse the tab state to Runner's one search.** Nothing switches tabs, but the search state is still an array: `tabs`, `activeTabId`, `nextTabId`, `makeTabId`, `newBlankTab`, `tabIndexById`, `activeTab`; `persistTabsToStorage` and `loadTabsFromStorage` (`LS.tabsState`, which still restores every tab a Classic session saved); the copies `saveActiveTabStateFromUi` makes after every search and load-more, which only the tests read; and the test hook's `state().tabCount` and `activeTabRows` with the harness's "active-tab state in sync" check. `openRecentTab`, `RECENT_TAB_ACCEL`, `tagfox-open-recent-tab`, `setRecentTabOpenHandler` and `recent-tab.cjs` are named for a tab they no longer open. `runSearchNow`'s `singlePaneOnly` option is passed but never read.

## Decisions before any deletion

- None left: deadlines, the star list, Restart, Windows Recent, Ctrl+Shift+Space and Subfolders are all settled above.
