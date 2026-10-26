# Delete the Classic layout's code in stages

Steve decided on 24 October 2026 to keep only Runner: hide Classic first, then delete its code in stages. Classic is hidden: there is no layout switch, and every start, a test instance's included, opens in Runner. This file is the inventory to delete against.

- **Each stage** deletes one area (for example Classic's match-option toolbar), its CSS and HTML, and the tests that cover only it, and keeps every piece Runner depends on (listed below). Run the full suite after each stage.
- **Steve decided on 25 October 2026** what Runner gains before Classic's code goes: the deadline filters as `/` Due commands; a "Show only starred items" command instead of a visible star list; and Windows Recent as a ranking boost rather than a list. A "Search this folder only" command keeps typing to the current folder's own contents. All four are in Runner now. The Shelf shows in Runner (`2d8c22b`), and so does the Restart button, in the search box. Saved searches are back in Runner too (Steve, 25 October 2026): `/` commands ("Save this search", then one per saved search) and `Alt`+`1`…`9`, reading the same `LS.favSearches` list Classic saved, so stage two took only Classic's bar.

Read-only survey by a subagent at main `74c8ac1`; line numbers are approximate. Since then Runner has gained chips for the deadline and hide-until filters (the hazard the survey found).

**Summary.** Runner's state is its own: the current folder (`currentFolderPath`), the search options (`searchOpts`, `recencyMode`) and the view (`viewShowSubfolders`, `viewContent`) are renderer variables. What is left of Classic is code Runner still calls, listed under "Classic code Runner depends on".

## What only Classic does

### Views and search

Classic's toolbar (the recency radios, the match options with their Advanced popover, and the view radios) is gone. Runner sets the same state from `/` commands, chips and keys: subfolders through "Search this folder only", folders only and files only, the match options, and the recency window, whose 1m and 1y are reached only by Ctrl+R cycling (`/` has any time, 1h, 1d and 1w).

### Shelf

Staging folder `%APPDATA%\...\TagBrowserShelf`. Drop files on `#appShelf` (move; Shift copies), drag chips out, `#btnShelfOsDrag` arms an OS drag (Alt+drag too), clear and per-chip remove, the row menu's "Put shortcut on shelf" (shared menu, so it survives), Settings "Open the shelf folder". Runner shows it under the list (`2d8c22b`), so it is shared now. Renderer ~200 lines (`renderShelf`, `bindShelfDrop`, `bindShelfChipDrag`); `main.js` ~250 lines (`registerShelfIpc`, `isPathUnderShelf`, `movePathsToShelf`). help.md mentions an "Add to Shelf" button that does not exist.

### Breadcrumb and folder actions

Runner keeps the names and ▾ menus; Left, Backspace, Esc and the chip's × go up or clear the folder, and a path typed or pasted into the box goes there. The folder buttons are shared (they move into the chip).

### Viewer, Settings, global shortcuts

- Viewer modes and the splitter `#splitProps` are shared. The divider sets one width (`runnerViewerPx`, `LS.runnerViewerWidthPx`), and Runner holds the Viewer at a third until the divider is dragged.
- Settings: nothing in it is Classic's ("Open the shelf folder" went with the Shelf to both layouts). **Folder groups** (Search results) frames a selected folder with the rows under it that follow it, in both layouts.
- The global shortcuts are shared: Ctrl+Alt+Space, Quick TODO, and **Ctrl+Shift+Space** (`openRecentChanges`), which resets the search in place to Runner's own defaults.

## Classic code Runner depends on

- **Breadcrumb:** `#breadcrumbBar`, `renderScopeBreadcrumb`, `goToBreadcrumbFolder`, the flyout and dropdown helpers, the six `btnScopeBar*` buttons.
- **Tags:** the filter state and functions (`tagFilterCombineOr` included, which nothing on screen sets now: only a stored value turns OR on), `appendTagFiltersToEverythingQuery`, the tag store and modal, and the rename, new-folder, paste-target, bulk-rename and recycle modals.
- **Results table:** `renderTableImpl` (including Classic's row buttons), `#bulkBar`, `loadMoreResults`, `rowActionStripHandleKeydown`.
- **Viewer:** `#propsAside` and everything in it.
- **Favourites store (the stars):** `loadFavouriteFolders`, `saveFavouriteFolders`, `toggleStarPath`, `openFavouritePath` (Ctrl+Shift+1..9, which asks IPC `path-kinds` whether a star is a file or a folder); `fuzzyPathScore` (used by Runner's `/` list) lives in the favourites code. IPC `windows-recent-folders`/`-files` and `scanWindowsRecentLnkTargets` in `main.js` feed Runner's ranking boost and are not Classic's.
- **History and undo:** `searchHist`, `goSearchHistory`, `runUndo`.
- **Clicked hidden controls:** `#helpModal`, `#settingsPanel`; `#statusMain` and `setStatusMain`.
- **Keys:** every key is a `RUNNER_KEYS` entry, and the key map was rationalised on 25 October 2026 (Ctrl+J/K, Ctrl+↑, Ctrl+P and Ctrl+Shift+Home dropped; Alt+↑ is ←). `runnerGoUp` still calls Classic's `goToParentScopeFolder`, and Ctrl+Z calls `runUndo`. The search box's own keydown listener still sends Ctrl+↓ and Alt+↓ into the list (`enterResultsListKeepingSelection`).

## Tests

- **Runner:** a test instance opens in Runner from its first load, as every start does, so every test that opens a window runs in Runner without switching.
- **No layout:** `restart-in-terminal`, `help-build` and `tags-dates` do not go through the harness's `connect`.

## Decisions before any deletion

- None left: deadlines, the star list, Restart, Windows Recent, Ctrl+Shift+Space and Subfolders are all settled above.
- **Classic's base rules under Runner's stay (Steve, 26 October 2026).** Many base rules in `styles.css` set what a `body.tagfox-runner` rule then overrides, but proving a rule dead means reaching every state it applies in and comparing every element's box and computed style. For the result rows that took longer than Steve allowed, and two rules a first pass had called dead were live: the 1d recency colour and the row buttons' hover. The `body.tagfox-runner` prefix stays too: it selects nothing extra, but its specificity is what lets Runner's rules beat Bootstrap's state rules (`.btn:active`, `.btn:focus-visible`).
