# Delete the Classic layout's code in stages

Steve decided on 24 October 2026 to keep only Runner: hide Classic first, then delete its code in stages. Classic is hidden: there is no layout switch, and every start, a test instance's included, opens in Runner. This file is the inventory to delete against.

- **Each stage** deletes one area (for example Classic's match-option toolbar), its CSS and HTML, and the tests that cover only it, and keeps every piece Runner depends on (listed below). Run the full suite after each stage.
- **Steve decided on 25 October 2026** what Runner gains before Classic's code goes: the deadline filters as `/` Due commands; a "Show only starred items" command instead of a visible star list; and Windows Recent as a ranking boost rather than a list. A "Search this folder only" command keeps typing to the current folder's own contents. All four are in Runner now. The Shelf shows in Runner (`2d8c22b`), and so does the Restart button, in the search box. Saved searches are back in Runner too (Steve, 25 October 2026): `/` commands ("Save this search", then one per saved search) and `Alt`+`1`…`9`, reading the same `LS.favSearches` list Classic saved, so stage two took only Classic's bar.

Read-only survey by a subagent at main `74c8ac1`; line numbers are approximate. Since then Runner has gained chips for the deadline and hide-until filters (the hazard the survey found).

**Summary.** Classic cannot be cut out cleanly, because Runner keeps its state in Classic's hidden controls.

## What only Classic does

"Runner?" says whether Runner has an equivalent.

### Views and search

| Feature | In Classic | Runner? | Code |
|---|---|---|---|
| Subfolders on/off | `optRvSubsOn/Off` radios | Yes: the `/` command "Search this folder only" and its chip | `applyResultsViewRadiosToDom`, `isShowSubfolders` |
| Files and folders / folders only / files only | `optRvAll`, `optRvDirsOnly`, `optRvFilesOnly` radios | Partial: `/folders`, `/files` | `resultsContentMode` |
| Match options | toolbar | Partial: `/` commands and Ctrl keys | `searchOptionsFromUI`, `toggleSearchOptCheckbox` |
| Recency 1h / 1d / 1w / 1m / 1y / All | toolbar radios | Partial: `/` has all, 1h, 1d, 1w; 1m and 1y only by Ctrl+R cycling | `setRecencyFilterMode` |
| Sort by path, oldest first, or Z-A | nothing on screen sets one. A fresh profile starts on Path, A-Z (`freshProfileSortsByPath`); otherwise only a saved Classic value sets one. Folder rows take a tint while Path is the sort | No: smart, date, name, largest or smallest first. `applyRunnerAtStartup` sets `sortColumn` from Runner's own sort, so a Path sort lasts only until then | `sortColumn`/`sortAsc` through `applySearchState`, `syncSortPathClass`, `freshProfileSortsByPath`, `compareRowsBySort`'s path case, the `results-sort-path` CSS |

### Shelf

Staging folder `%APPDATA%\...\TagBrowserShelf`. Drop files on `#appShelf` (move; Shift copies), drag chips out, `#btnShelfOsDrag` arms an OS drag (Alt+drag too), clear and per-chip remove, the row menu's "Put shortcut on shelf" (shared menu, so it survives), Settings "Open the shelf folder". Runner shows it under the list (`2d8c22b`), so it is shared now. Renderer ~200 lines (`renderShelf`, `bindShelfDrop`, `bindShelfChipDrag`); `main.js` ~250 lines (`registerShelfIpc`, `isPathUnderShelf`, `movePathsToShelf`). help.md mentions an "Add to Shelf" button that does not exist.

### Breadcrumb and folder actions

Runner keeps the names and ▾ menus; Left, Backspace, Esc and the chip's × go up or clear the folder, and a path typed or pasted into the box goes there. The folder buttons are shared (they move into the chip).

### Viewer, Settings, global shortcuts

- Viewer modes and the splitter `#splitProps` are shared. The divider sets one width (`runnerViewerPx`, `LS.runnerViewerWidthPx`), and Runner holds the Viewer at a third until the divider is dragged.
- Settings: nothing in it is Classic's ("Open the shelf folder" went with the Shelf to both layouts). **Folder groups** (Search results) frames a selected folder with the rows under it that follow it, in both layouts.
- The global shortcuts are shared: Ctrl+Alt+Space, Quick TODO, and **Ctrl+Shift+Space** (`openRecentChanges`), which resets the search in place to Runner's own defaults.

## Classic code Runner depends on

- **Hidden controls as Runner's state store (the main obstacle):** `#rootFolder` (current folder); `#optPath`, `#optHideSpecial`, `#optHideTilde`, `#optCase`, `#optWholeWord`, `#optDiacritics`; the recency radios; the `optRvSubs*` and content (`optRvAll`, `optRvDirsOnly`, `optRvFilesOnly`) radios; `sortColumn`/`sortAsc` and `compareRowsBySort`.
- **Breadcrumb:** `#breadcrumbBar`, `renderScopeBreadcrumb`, `goToBreadcrumbFolder`, the flyout and dropdown helpers, the six `btnScopeBar*` buttons.
- **Tags:** the filter state and functions (`tagFilterCombineOr` included, which nothing on screen sets now: only a stored value turns OR on), `appendTagFiltersToEverythingQuery`, the tag store and modal, and the rename, new-folder, paste-target, bulk-rename and recycle modals.
- **Results table:** `renderTableImpl` (including Classic's row buttons), `#bulkBar`, `loadMoreResults`, `rowActionStripHandleKeydown`.
- **Viewer:** `#propsAside` and everything in it.
- **Favourites store (the stars):** `loadFavouriteFolders`, `saveFavouriteFolders`, `toggleStarPath`, `openFavouritePath` (Ctrl+Shift+1..9, which asks IPC `path-kinds` whether a star is a file or a folder); `fuzzyPathScore` (used by Runner's `/` list) lives in the favourites code. IPC `windows-recent-folders`/`-files` and `scanWindowsRecentLnkTargets` in `main.js` feed Runner's ranking boost and are not Classic's.
- **History and undo:** `searchHist`, `goSearchHistory`, `runUndo`.
- **Clicked hidden controls:** `#helpModal`, `#settingsPanel`; `#statusMain` and `setStatusMain`.
- **Keys:** Runner's key table hands several keys to Classic's handler (Ctrl+R, Alt+←/→, F5, Space, Ctrl+A, Ctrl+Shift+1..9, Shift+Space, F2, Ctrl+Shift+N, Ctrl+H, F1, Ctrl+,, and Esc once Runner's own steps are done: the full-screen Viewer, Quick TODO, the breadcrumb flyouts), and some work in Runner only by falling through to it: Ctrl+/ (Help), Ctrl+W, Ctrl+., Ctrl+J/K, Ctrl+Shift+R, Ctrl+Z, Ctrl+↑ / Alt+↑, Ctrl+Shift+Home, ↑ and ↓ (Shift too) outside the search box, and →, Enter and Del with the focus on neither the box nor the list. Ctrl+C, Ctrl+X, Ctrl+V and Ctrl+Shift+C have Runner entries, but from an open menu they reach Classic's copies.

## Tests

- **Runner:** a test instance opens in Runner from its first load, as every start does, so every test that opens a window runs in Runner without switching.
- **Classic CSS that nothing reaches:** the Shelf's rotated strip and narrow column (`.app-shelf`, `.app-shelf-rot` and `.app-shelf--rhs .app-shelf-rot`, which Runner's block overrides). No test covers them; compare the Shelf's computed styles before and after deleting them.
- **No layout:** `restart-in-terminal`, `help-build` and `tags-dates` do not go through the harness's `connect`.
- `test/README.md` omits tags-dates and repro-crash.

## Stages named so far

- **Move the rest of Classic's key handler into `RUNNER_KEYS`:** the keys in the Keys bullet above.
- **Path sort:** everything in the Code column of the "Sort by path" row above.
- **`runSearch`'s `eventKind`** reaches only the search debug log (`runSearch.start`), through `scheduleSearch` and `runSearchNow`, so the argument can go from every call site.

## Decisions before any deletion

- None left: deadlines, the star list, Restart, Windows Recent, Ctrl+Shift+Space and Subfolders are all settled above.
