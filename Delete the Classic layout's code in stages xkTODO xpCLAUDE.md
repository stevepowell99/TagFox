# Delete the Classic layout's code in stages

Steve decided on 24 October 2026 to keep only Runner: hide Classic first, then delete its code in stages. Classic is hidden (no layout switch, every real start in Runner; the test hook still opens a fresh profile in Classic so its tests guard the code until it goes). This file is the inventory to delete against.

- **Each stage** deletes one area (for example tabs, or Tree and Smart views), its CSS and HTML, and the tests that cover only it, and keeps every piece Runner depends on (listed below). Run the full suite after each stage.
- **Steve has not yet said** which Classic-only features Runner should gain before their code goes: a visible star list, setting a deadline filter, Windows Recent, or searching only the current folder while typing. Ask before deleting any of those. The Shelf now shows in Runner (`2d8c22b`), and the Restart button shows in Runner's box, so neither is Classic-only any more.

Read-only survey by a subagent at main `74c8ac1`; line numbers are approximate. Since then Runner has gained chips for the deadline and hide-until filters (the hazard the survey found).

**Summary.** Runner would lose Smart view, Tree view, result tabs, the favourites column, saved searches, Windows Recent, the deadline filters and the tag bar's counts. Classic cannot be cut out cleanly, because Runner keeps its state in Classic's hidden controls. Classic is about a fifth of `renderer.js` (4,000 to 4,500 of 20,759 lines) and about a quarter of `styles.css` and `index.html`.

## What only Classic does

"Runner?" says whether Runner has an equivalent.

### Views and search

| Feature | In Classic | Runner? | Code |
|---|---|---|---|
| Smart view (auto narrow and widen, "Big folder!" chip) | `#optRvSmart`, `i` / Ctrl+I | None; Runner is always flat | `smartBeforePaint`, `smartAfterPaint`, `smartSearchShouldStartBroad`, `reimposeSmartViewDefaults` (~250 lines) |
| Tree view (path grouping, twisties, collapse state) | `#optRvTree`, `+` / `-`; Settings tree-performance option | None | `buildPathGroupedDisplayRows`, `pathTreeGutterStringsForDepths`, `refreshResultsTreeCollapseHidden` (~300 lines) |
| Subfolders on/off | `optRvSubsOn/Off`, `s` / Ctrl+S | None: with text in the box Runner always searches below the folder, so it cannot search the current folder alone | `applyResultsViewRadiosToDom`, `isShowSubfolders` |
| Files and folders / folders only / files only | `f` / Ctrl+F | Partial: `/folders`, `/files` | `resultsContentMode` |
| Match options | toolbar, bare letters | Partial: `/` commands and Ctrl keys | `searchOptionsFromUI`, `toggleSearchOptCheckbox` |
| Recency 1h / 1d / 1w / 1m / 1y / All | toolbar radios | Partial: `/` has all, 1h, 1d, 1w; 1m and 1y only by Ctrl+R cycling | `setRecencyFilterMode` |
| Deadline filter (Overdue, Today, This week, Next week) and "Show hidden" for `xh-` files | `btnToggleDeadline`, `deadlineFilterPanel`, `optShowHiddenUntil` | Chips and × only (no way to set them) | `setDeadlineRange`, `setShowHiddenUntil` |
| Tag bar: pills with counts, include/exclude, More, AND/OR, ↻ full-index rescan | `#tagBar` | Partial: per-tag commands, the tags chip, Ctrl+T; no counts, no OR, no rescan | `renderTagBarImpl`, `runTagDiscoverySearch` |
| Column sort by name, path, size, modified, either direction | header click; `z`, `m`, `n` | Partial: smart, date, name, size, size smallest first; no path sort, no oldest first, no Z-A | `applySortColumnKey`, `updateSortHeaders` |
| Column resizing | `.th-resize` | None | `startTableColResize`, `applyTableColWidths` |
| Status line with hit count and filter hints | standing line | None: Runner shows no count except "N of M ranked" | `formatResultsStatusMainHtml`, `hiddenDueToStatusHtml` |
| Empty-result pulse hints | toolbar pulses | Partial: only the box pulses | `updateEmptyResultsPulseHints` |

### Tabs

Result tabs (up to 10), drag to reorder, middle-click close, spring-open on file drag, drop a file on a tab to move it to that folder; `#resultsTabStrip`, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+Shift+T, Ctrl+Shift+W. Runner has none ("Result tabs are only in the Classic layout"). UI code ~320 lines (`activateTab`, `openNewTab`, `closeTab`, `cycleTab`, `reorderTab`, `renderTabStrip`); the tab *state* code is shared (see below).

### Favourites, recents, saved searches

| Feature | Runner? | Code |
|---|---|---|
| Favourites column (up to 30): fixed or peek rail, splitter, ▾ subfolder menus, drag to reorder, drop files on a pill to move or copy, save current folder | Partial: the store is shared (Ctrl+D stars, Ctrl+Shift+1..9 opens the Nth star, stars rank higher), but there is no visible list, no reorder, no remove, and no way to star the current folder | `renderFavFoldersBar` and friends (~1,160 lines in all) |
| Windows Recent folders and files | None | `renderRecentFoldersBar`, `renderRecentFilesBar`; IPC `windows-recent-folders`/`-files`; `scanWindowsRecentLnkTargets` in `main.js` |
| Saved searches (Ctrl+1..9) | None; in Runner Ctrl+1..9 opens row n | `renderFavSearchesBar`, `applyFavouriteSearchState` |

### Shelf

Staging folder `%APPDATA%\...\TagBrowserShelf`. Drop files on `#appShelf` (move; Shift copies), drag chips out, `#btnShelfOsDrag` arms an OS drag (Alt+drag too), clear and per-chip remove, the row menu's "Put shortcut on shelf" (shared menu, so it survives), Settings "Open the shelf folder". Invisible in Runner because `#appShelf` is hidden. Renderer ~200 lines (`renderShelf`, `bindShelfDrop`, `bindShelfChipDrag`); `main.js` ~250 lines (`registerShelfIpc`, `isPathUnderShelf`, `movePathsToShelf`). help.md mentions an "Add to Shelf" button that does not exist.

### Breadcrumb and folder actions

Classic only: clear-folder ×, parent ▲, typed-path editor, recent-folders dropdown (Ctrl+L), drive picker. Runner keeps the names and ▾ menus, and Left, Backspace, Esc and the chip's × replace clear and parent, but has no typed path, no drive picker and no Ctrl+L. The folder buttons are shared (they move into the chip).

### Header (hidden in Runner)

History back/forward (Runner: Alt+←/→), Undo (Ctrl+Z), **Restart button: nothing in Runner shows that main.js changed** (Ctrl+F5 and the View menu still restart), Refresh (F5, `/refresh`), Help (F1, `?`), dark mode (`/dark`), zoom buttons (Ctrl+/-/0 still work), Settings (`/settings`, Ctrl+,), "New dbg" (none), the Drive API ping (none), the "Did you know" tips (none).

### Viewer, Settings, global shortcuts

- Viewer modes are shared; only the splitter `#splitProps` and its remembered width are Classic's (Runner: a fixed third, Alt+P).
- Settings: only "Open the shelf folder" and the tree-performance option are Classic's.
- Ctrl+Alt+Space and Quick TODO are shared. **Ctrl+Shift+Space** has no Runner branch: by reading, in Runner it runs the hidden-tab machinery, unchecks Hide special and calls `reimposeSmartViewDefaults` on a flat layout. Not run; `recent-tab.cjs` covers Classic only.

## Classic code Runner depends on

- **Hidden controls as Runner's state store (the main obstacle):** `#rootFolder` (current folder); `#optPath`, `#optHideSpecial`, `#optHideTilde`, `#optCase`, `#optWholeWord`, `#optDiacritics`; the recency radios; the `optRv*` view radios; `sortColumn`/`sortAsc` and `compareRowsBySort`.
- **Breadcrumb:** `#breadcrumbBar`, `renderScopeBreadcrumb`, `goToBreadcrumbFolder`, the flyout and dropdown helpers, the six `btnScopeBar*` buttons.
- **Tags:** the filter state and functions, `appendTagFiltersToEverythingQuery`, `renderTagBar` (runs on every search into the hidden bar), the tag store and modal, and the rename, new-folder, paste-target, bulk-rename and recycle modals.
- **Results table:** `renderTableImpl` (including Classic's row buttons), `#bulkBar`, `loadMoreResults`, `rowActionStripHandleKeydown`.
- **Viewer:** `#propsAside` and everything in it.
- **Favourites store:** `loadFavouriteFolders`, `saveFavouriteFolders`, `openFavouritePath`, IPC `path-kinds`; `fuzzyPathScore` (used by Runner's `/` list) lives in the favourites code.
- **Tab state:** `tabs`, `saveActiveTabStateFromUi` (called by `setRunnerMode`), `restoreTabStateIntoUi`, `persistTabsToStorage`, the load-more persist and startup tab init.
- **History and undo:** `searchHist`, `goSearchHistory`, `runUndo`.
- **Clicked hidden controls:** `#btnToggleDarkMode`, `#btnToggleSettings`, `#helpModal`, `#settingsPanel`, `#selToggleOpens`; `#statusMain` and `setStatusMain`.
- **Smart and tree code is guarded, not isolated:** `runSearch` sets the Smart state and calls `smartBeforePaint`/`smartAfterPaint`; `renderTableImpl` and `listRowsForUi` call the tree helpers.
- **Keys:** Runner's key table hands several keys to Classic's handler (Ctrl+R, Alt+←/→, F5, Space, Ctrl+A, Ctrl+Shift+1..9, Shift+Space, F2, Ctrl+Shift+N, Ctrl+H, F1, Ctrl+,), and some work in Runner only by falling through to it: Ctrl+W, Ctrl+., Ctrl+J/K, Ctrl+Shift+R, Ctrl+Z, Ctrl+↑ / Alt+↑, Ctrl+Shift+Home.

## Classic-only keys

- Bare letters outside a text field: `i`, `f`, `s`, `w`, `p`, `.`, `t`, `r`, `z`, `m`, `n`, `j`, `k`, `+`, `-`, Home, End, and `/` (focus toggle).
- Ctrl+I layout cycle, Ctrl+F content cycle, Ctrl+S subfolders, Ctrl+L recent folders, the tab keys, Ctrl+1..9 saved searches, Ctrl+Home clear folder, Ctrl+Enter scope to the parent, Ctrl+U unfocus search.
- Left from the results can scope to the first subfolder towards a deeper item; Runner's Left only goes up.

## Tests

- **Classic only:** `smoke`, `tab-lifecycle`, `crud-pane-isolation`, `fuzz`, `column-resize`, `splitter-drag`, `menu-enter`, `recent-folders-filter`, `recent-tab`, `zoom-buttons`, `refresh-visible` (header button half).
- **Runner only:** the five `runner-*` tests, several with Classic round-trip checks that would need rewriting.
- **Both:** `hotkey-raise-select`, `hover-preview`, `row-actions-keys`, `window-chrome`.
- **Layout-neutral but run in Classic:** `md-preview-no-write`, `quiet-refresh`, `loadmore-regression`, `restart-in-terminal`, `gmist-start-guard`, `help-build`, `tags-dates`.
- `test/README.md` omits tags-dates, zoom-buttons, repro-crash, recent-folders-filter, gmist-start-guard and hover-preview.

## Decisions before any deletion

- Deadline and hide-until: drop them, or give Runner a way to set them as well as the new chips.
- The star list: whether Runner needs a visible one.
- The Restart prompt: whether Runner shows it.
- Windows Recent: keep or lose.
- Subfolders: whether losing "search only this folder while typing" matters.
- Ctrl+Shift+Space: what it does in Runner.
