<!--
  Help — source for help.html (npm run build:help). Loaded into index.html via sync XHR → #helpModalContainer.

  ========== DEVELOPER / TECHNICAL (hidden from the UI) ==========

  Dev: Enable Everything HTTP → in repo: npm install && npm start → Settings: base URL (optional starting current folder).

  Hot reload: F5 = refresh search in app; View → Reload (click) = full window reload; Restart TagFox (Ctrl+F5), Toggle DevTools (Ctrl+Shift+I).
  | Any app code (index.html, styles.css, tags.js, renderer.js, preload.js, main.js) | restart TagFox (Ctrl+F5) |

  Ship: npm run dist (electron-builder) → NSIS under dist/. Not code-signed; SmartScreen may warn recipients.

  Everything sort-mix: (implementation — do not remove) The HTTP API returns all folders before all files for a given sort. With Max results capped,
  a scope with many folders can yield folder-only pages and zero visible files. Everything 1.5a adds sort-mix: so files and folders interleave in true sort order.
  TagFox appends sort-mix: when Hide files is OFF (renderer.js, runSearch()).
  Ref: https://www.voidtools.com/forum/viewtopic.php?t=8994

  Row ⋯ menu: main process (Menu, shell, clipboard). Windows: Copy for Explorer paste (CF_HDROP), full path, parent, name only, slashes, file:// where applicable.
  Ctrl+Shift+C: copy full path(s) as text. Paste from Explorer into current folder (Windows). If the clipboard has no file list but has a bitmap (screenshot, copied image), paste saves Clipboard image.png in the current folder. Then Open, Reveal, Terminal, Notepad, Delete, etc.

  Drag and drop: default row/Shelf drag uses TagFox’s in-page protocol (move/copy inside the app; Shift = copy). External apps need Alt+drag or the Shelf “OS drag” arm for native paths (CF_HDROP). Native drag blocks the UI thread, hence the split.

  Hide special / Hide ~: client-side only — filteredRows() uses pathUnderHideSpecialSegments() and pathUnderTildeSegment() in renderer.js; Everything query unchanged (pagination still uses raw hit count per page).

  Active tag filters: sent to Everything as a regex clause so matches exist before results load.

  Bulk rename preview: first 200 rows in the dialog only; Rename applies to the full batch captured at open. Wildcard Find uses same Match case as the search row.

  The Keys tab's table is drawn at open from RUNNER_KEYS (renderRunnerKeysHelp into #runnerKeysTable), so it cannot drift from the keys. Tab ids are read by
  HELP_TAB_IDS and restoreHelpModalTab in renderer.js: F1 and the / command Help open `essentials` (Get started), `?` opens `runner` (the Keys tab), the Settings link "Get Everything 1.5a" opens `installation`.

  Tab boundaries: see scripts/build-help.js — each pane is introduced by a single-line HTML comment whose body is help:tab plus JSON (id, label, exactly one "active":true, optional "format":"html" for raw HTML). Run npm run build:help after edits.
-->

<!-- help:tab {"id":"essentials","label":"Get started","active":true} -->

### What TagFox does

TagFox finds files and folders on your computer as you type, and lets you open, preview, move, rename and tag them without going through File Explorer. Most things can be done from the keyboard.

### Everything has to be running

TagFox does not search the disk itself. It asks [Everything](https://www.voidtools.com/), a free search program from voidtools, which keeps an index of every file name on the computer. If TagFox finds nothing at all, Everything is probably not running: look for its icon in the system tray, or see **Setting up**.

### Bring TagFox up from anywhere

- `Ctrl`+`Alt`+`Space` shows TagFox from any program, and pressing it again hides it. You can choose another key in **Settings**, under **Global hotkey & Quick TODO**: click **Record…** and press the keys you want.
- The × at the top right of the window, or `Ctrl`+`W`, hides TagFox rather than closing it, so the shortcut still brings it back. To quit, choose **File → Quit TagFox**, or the `/` command **Quit TagFox**. The shortcuts then stop working until TagFox starts again.
- `Ctrl`+`Shift`+`Space`, from anywhere, shows everything that changed in the last hour, in every folder.
- `Alt`+`Shift`+`N`, from anywhere, opens the **Quick TODO** box, for noting a task as a file (see **Tags and tasks**).

### A first search

- Type a few letters of a name. The list changes as you type.
- `↑` and `↓` choose a row, and `Enter` opens it. On a folder, `Enter` takes you inside.
- `Esc` steps back one thing a press: it closes a menu, unchecks rows, clears the text, leaves the folder, and last of all hides TagFox.

### What is on the screen

- The **search box** is at the top. When you are inside a folder, the folder's name sits at the start of the box, and its path runs along a thin line above it.
- The **list** shows what was found: each row's name, the folder it is in, its size and when it last changed.
- The **Viewer**, on the right, previews whatever is selected (see **The Viewer**).
- The **Shelf**, under the list, holds files while you find the folder they belong in (see **Working with files**).
- Each time you bring TagFox up, and every few minutes while it is up, a line at the bottom of the list shows a tip for ten seconds. A message, such as what an action did or why it failed, takes its place for a few seconds; point at it to keep it there.
- Two faint buttons sit at the right of the search box. The first hides and shows the Viewer. The second, **Options**, lists the sort orders, filters and tags as buttons.

### Help and keys

- `?`, with the search box empty, or `Ctrl`+`/` anywhere, lists every key (the **Keys** tab here).
- `F1` opens this help, and `Ctrl`+`,` opens **Settings**.

<!-- help:tab {"id":"search","label":"Finding things"} -->

### Typing

- With the search box empty you see the current folder's own contents. Once you type, the search covers that folder and every folder inside it.
- When you are not inside a folder, the search covers everything Everything has indexed.
- Your words are matched against the whole path, so `budget 2026` finds `2026\budget.xlsx` as well as `budget 2026.xlsx`. `Ctrl`+`U` matches names only; press it again to go back.
- `F5` searches again, if the list looks out of date. TagFox also searches again on its own every few seconds, and changes the list only when something has changed.

### Moving between folders

- `→`, or `Enter` on a folder, goes into the selected folder. `←`, or `Alt`+`↑` as in File Explorer, goes up to the parent, with the folder you left selected.
- Inside a folder, with the search box empty, the folder itself is selected: its name at the start of the box lights up, and the Viewer shows the folder, with its folder doc. `↓` goes to the first row, and `↑` from the first row comes back to the folder. Once you type, the best match is selected, so `Enter` opens it.
- `Backspace` in an empty search box leaves the folder, so you search everywhere. So does the × on the folder's name at the start of the box.
- Click any name in the path above the search box to go there, or the › after it to choose one of the folders inside.
- `Shift`+`Enter` goes to the folder holding the selected row.
- Paste a folder's path into the search box to go straight there, or a file's path to go to its folder with the file selected. A typed path goes there when you press `Enter`.
- Point at the folder's name at the start of the search box for its buttons: show it in File Explorer, copy it, edit its tags, open a terminal there, copy its full path in quotes, and the full menu.
- `Alt`+`←` and `Alt`+`→` go back and forward through your earlier searches, as in a browser. `Alt`+`Home` starts again, with no text, no folder and every filter at its default.

### Commands and options

- Type `/` in the search box for a list of commands: sort orders, filters, tags, match settings, **Settings** and more. Type a few letters to find one (`/size`, `/todo`), choose with `↑` and `↓`, and press `Enter`. A command that has a key of its own shows it at the right.
- **Options**, the second faint button at the right of the search box, or `Alt`+`O`, shows the same commands as buttons.
- Every filter or setting that differs from the usual shows as a chip under the search box, such as **Modified in the last day** or **Folders only**. Click a chip's × to undo it. If the list is empty, the chips are the first place to look.
- `Ctrl`+`R` limits the list to what changed recently: the last hour, then a day, a week, a month, a year, and then any time again, a step a press. `Ctrl`+`Shift`+`R` steps back.
- **Folders only** and **Files only**, under `/`, do what they say.
- **Search this folder only** keeps a search to the current folder's own contents, without the folders inside it.
- **Show system files**, or `Ctrl`+`.`, lists the files Windows and programs keep out of sight (names starting with `.` or `$`, and `desktop.ini`), which are left out at first.

### What you can type

- A minus in front of a word leaves out anything that matches it: `report -draft`.
- A file type lists only that type: `.pdf`, or just `pdf` for the common document, image, sound and video types. Several (`.docx .pdf`) list any of them, and `-pdf` leaves one out. A file type on its own lists the newest first.
- `^word` matches only where a word starts: `^map` finds `map.json` and `old map.md` but not `roadmap.txt`. The `/` command **Word starts only** does the same for every word.
- `Ctrl`+`B` matches whole words only, and `Ctrl`+`I` makes capital letters count.
- Everything's own search language works too: `a|b` for either word, `"exact phrase"`, the `*` and `?` wildcards, `size:>1mb`, `dm:today` and more. See [Everything's searching guide](https://www.voidtools.com/support/everything/searching/).
- When nothing matches, a line in the list says what was searched: the folder, the text and any filter. Inside a folder, `Enter` then searches everywhere for the same text.

### How the list is ordered

- Files whose **name** matches come before files that match only by the folder they are in. A whole word ranks above the start of a word, which ranks above a match in the middle of one.
- After that, TagFox favours files changed recently, starred files and folders, things you open often in TagFox, and things Windows lists as recently opened in any program.
- Files under `AppData` and `ProgramData` folders, Word's `~$` lock files and the like are listed lower down, unless you typed their name.
- `Ctrl`+`M` sorts by date, newest first, and the same key again goes back to the usual order. `/name` sorts by name, `/size` puts the largest first, and `/smallest` the smallest.
- A search that finds a very large number of matches ranks only the newest few hundred; a note at the right of the search box then says how many it ranked out of how many it found. Type more to narrow it down.

### Saved searches

- `Ctrl`+`S`, or the `/` command **Save this search**, saves the search on screen. TagFox keeps the folder, the text in the box and every filter, and names the search after its text, or after the folder when the box is empty.
- Each saved search becomes a `/` command of its own: type `/` and a few letters of its name. `Alt`+`1` to `Alt`+`9` run the first nine, in the order you saved them.
- While a saved search is on screen, the `/` command reads **Forget this saved search**, and `Ctrl`+`S` says which one it is.

<!-- help:tab {"id":"files-folders","label":"Working with files"} -->

### Opening

- `Enter`, or a double-click, opens the selected file in its usual program. On a folder it goes inside, here in TagFox.
- `Ctrl`+`Enter` shows the selected file in File Explorer. `Alt`+`Enter` opens its Windows **Properties**.
- `Ctrl`+`1` to `Ctrl`+`9` open one of the first nine rows; hold `Ctrl` to see their numbers.

### A row's buttons and menu

- Point at a row and its buttons appear beside the star at its right-hand end. They open the file (or show a folder in File Explorer), go to the parent folder, copy the file, edit its tags, open a terminal in its folder, copy its full path in quotes, send it to the Recycle Bin, and open the full menu.
- Some files get extra buttons, where this computer can use them, such as one that opens a Word or Excel file in Google Docs or Sheets.
- Right-click a row, or press `Shift`+`F10`, for its full menu: more ways to copy the path, open it in other programs, duplicate it, make a shortcut and more.
- `Tab` from the list steps along the selected row's buttons; `Enter` presses one, and `Esc` goes back to the list.

### Choosing several rows

- Click a row to select it. `Ctrl`+click or `Shift`+click checks more than one, and their checkboxes appear.
- From the keyboard, `Space` checks or unchecks the selected row, `Shift`+`↑` and `Shift`+`↓` check a run of rows, and `Ctrl`+`A` checks every row.
- With two or more rows checked, a bar at the bottom of the list offers copy, Recycle Bin, tags and uncheck.

### Renaming, copying and deleting

- `F2` renames the selected file or folder. `Ctrl`+`H` renames all the checked files at once, using wildcards.
- `Ctrl`+`Shift`+`N` makes a new folder in the folder you are in.
- `Ctrl`+`Z` undoes the last rename, tag change, move, paste or new folder.
- `Ctrl`+`C` and `Ctrl`+`X` copy or cut the selected files, to paste in File Explorer. `Ctrl`+`V` pastes files copied in File Explorer into the folder you are in. If you copied a picture or a screenshot instead, `Ctrl`+`V` saves it there as `Clipboard image.png`.
- `Ctrl`+`Shift`+`C` copies the selected files' full paths as text.
- `Del` sends the checked rows to the Recycle Bin, after asking. TagFox never deletes anything for good, so `Shift`+`Del` recycles too.

### Dragging

- Drag rows onto a folder row, or onto a folder's name in the path above the search box, to move them there. Hold `Shift` to copy instead.
- Dropping onto a file's row puts them in the folder that file is in.
- To drag something out of TagFox, into File Explorer, an email or another program, hold `Alt` as you start the drag.
- You can also drag files from File Explorer into TagFox.

### Stars

- `Ctrl`+`D`, or the star at the end of a row, stars the selected file or folder; the same again takes the star off. TagFox keeps up to 30 stars.
- A starred item sits near the top of any search that finds it.
- `Ctrl`+`Shift`+`1` to `Ctrl`+`Shift`+`9` open your first nine stars, in the order you starred them: a folder opens here in TagFox, and a file opens in its program.
- The `/` command **Show only starred items** lists the stars in the current folder and the folders inside it, or every star when you are not in a folder.

### The Shelf

The Shelf is the strip under the list. It holds files and folders while you go and find the place they belong.

- Drag rows from the list onto the Shelf, or drop files on it from File Explorer. A drag moves them onto the Shelf; hold `Shift` to copy them instead.
- Go to the folder they belong in, or search for it.
- Drag them off the Shelf onto a folder row, or into the list when you are inside a folder. Again a drag moves them and `Shift` copies.
- The Shelf keeps what is on it until you take it off, so you can collect files from several folders first.
- A chip's × (point at the chip to see it), and the bin button at the end of the Shelf, send things to the Recycle Bin. Moving a file onto the Shelf moved the original, so the Recycle Bin is where to get it back.
- To drag a chip into another program, hold `Alt` as you start, or click the hand button at the start of the Shelf first.
- For a single batch of files, `Ctrl`+`X` and then `Ctrl`+`V` in the folder they belong in do the same without the Shelf.

### Another program's Open and Save dialogs

TagFox can pick the file for a program that is asking you to open or save one.

- With an Open or Save dialog on screen (Notepad's, a browser's upload, most of Office), press TagFox's shortcut (`Ctrl`+`Alt`+`Space`, unless you chose another). TagFox comes up with a strip above the search box saying where the next pick goes, such as **Next pick goes to: Notepad · Open**.
- Find the file or folder as usual, then press `Enter` or double-click it. TagFox steps aside and the dialog takes it. In an Open dialog a file opens, and a folder is shown in the dialog. A Save dialog gets the folder and keeps the file name it already had, and you press **Save** yourself.
- `Ctrl`+`Enter`, or **Send this folder** on the strip, sends the folder TagFox is showing.
- `Esc`, or the × on the strip, stops sending to the dialog, and `Enter` opens rows again.

<!-- help:tab {"id":"viewer","label":"The Viewer"} -->

### Previews

- Select a file and the Viewer on the right shows it: pictures, PDFs, Word documents (`.docx`), web pages, text and markdown files, sound and video.
- Its top line shows the file's name. Under that are its tags, its size, when it last changed and the folder it is in; click the folder to copy the file's full path.
- A file the Viewer cannot show says so, and offers **Open** and **Show in folder**.

### Showing and hiding it

- The Viewer starts at a third of the window. Drag the gap between the list and the Viewer to make it wider or narrower, and TagFox remembers the width. Double-click the gap to put it back to a third.
- `Alt`+`P`, or the first faint button at the right of the search box, hides the Viewer and gives the list the whole width. The same again brings it back.
- `Shift`+`Space`, or the arrows button at the top right of the Viewer, makes it fill most of the window. The same again puts it back.

### Text and markdown files

- A text or markdown file has an **Edit** button, which opens an editor beside the preview; double-clicking the text does the same.
- Your changes are saved as you type, and a note beside the button says when they were. **Done** closes the editor.
- If something else changed the file since TagFox loaded it, TagFox does not save over it and says so. The reload button at the top of the Viewer loads the file again from disk.

### Folders

When you select a folder, the Viewer has two tabs.

- **Folder doc** shows the folder's doc: a short note saying what the folder is for, kept in the folder as a file named `-readme.md`, `readme.md` or similar. **Edit** opens it in an editor, and **Save** writes it. A folder without one says so, and **Write it** starts one.
- **Thumbnails** shows the pictures and documents in the folder as a grid.
- The **Subfolders** switch adds the docs, or the thumbnails, of the folders inside it.
- **New TODO** opens the Quick TODO box for this folder (see **Tags and tasks**).

<!-- help:tab {"id":"projects","label":"Tags and tasks"} -->

### Tags live in the file name

A tag is a short code word in a file's name, such as `xkTODO` in `Report xkTODO.docx`. Because the tag is part of the name, it goes wherever the file goes: File Explorer, Google Drive, a zip file or an email attachment. TagFox shows the tags as labels in front of the name, and leaves them out of the name itself.

TagFox knows three kinds of tag, each with its own two-letter prefix:

| Kind | Prefix | Words |
|---|---|---|
| Status: what state the task is in | `xk` | `TODO`, `BLOCKING`, `WAITING`, `LATER` |
| Owner: whose it is | `xp` | `STEVE`, `CLAUDE`, `GCC` |
| Label: what kind of thing it is | `xx` | `PUB`, `INFO`, `KEY` |

A word only counts as a tag with its own prefix: `xkTODO` is a tag, while `todo` in `todo list.txt` is just part of the name.

### Adding and removing tags

- `Ctrl`+`T` opens the tag editor on the selected row, or on every checked row. Click a tag's button to add it or take it off. The file is renamed on disk straight away.
- The tag button among a row's buttons, and **Edit tags…** in its menu, open the same editor.
- The × on a tag in front of a row's name takes that tag off.
- Tag files rather than folders where you can. Renaming a folder breaks shortcuts and saved paths that point into it. To tag a folder, tag its folder doc instead (see **The Viewer**).

### Finding tagged files

- Type `/` and a tag, such as `/todo`, and press `Enter`, to list only the files carrying it. The filter shows as a chip, such as **Tagged TODO**, and its × removes it. Two tags list the files that carry both.
- `/not` and a tag, such as `/not later`, leaves that tag out. In **Options** (`Alt`+`O`), right-click a tag's button for the same.
- Typing the word on its own, without `/`, is an ordinary search: `todo` also finds `todo list.txt`.

### Deadlines

- The tag editor has a **Deadline** date. Pick a date and press **Add**, and the file name gains a token such as `xd-2026-07-15`.
- The `/` commands **Overdue**, **Due today**, **Due this week** and **Due next week** list only the files whose deadline falls then, from the current folder and every folder inside it. Weeks run from Monday to Sunday.

### Hiding a file until a date

- The tag editor's **Hide until** date adds a token such as `xh-2026-09-01`. TagFox leaves the file out of every list until that day, and then it comes back on its own. Use it for a task that cannot start yet.
- The `/` command **Show files hidden until a later date** lists them anyway.
- The hiding happens only in TagFox. File Explorer, Everything and Google Drive still show the file.

### Writing a task down

- **Quick TODO** makes a markdown file whose name is the task, such as `Ring the bank xkTODO.md`. Type a title and press the save button.
- `Alt`+`Shift`+`N` opens it from anywhere in Windows. The file goes in the **Quick TODO folder**, which you choose in **Settings** under **Global hotkey & Quick TODO**.
- `Ctrl`+`N`, **New TODO** in the Viewer when a folder is selected, or the `/` command **New TODO in this folder** opens the same box aimed at that folder. Outside a folder, `Ctrl`+`N` aims it at the Quick TODO folder.
- The box's tag button chooses its tags, deadline and hide-until date, and its other button adds text to go inside the file. **Open in list after save** takes you to the new file.
- When the task is done, delete the file, or change its tag.

<!-- help:tab {"id":"runner","label":"Keys"} -->

Every key TagFox answers to. `?`, with the search box empty, opens this list.

<div id="runnerKeysTable"></div>

<!-- help:tab {"id":"installation","label":"Setting up"} -->

### Install Everything

1. Download and install **Everything 1.5a** from <a href="https://www.voidtools.com/everything-1.5a" target="_blank" rel="noopener">Everything 1.5a downloads</a>, and let it finish its first index.
2. Install the HTTP Server plugin for your version of Windows: the <a href="https://www.voidtools.com/Everything-HTTP-Server-1.0.3.4.x64-Setup.exe" target="_blank" rel="noopener">64-bit installer</a> for nearly every computer today, or the <a href="https://www.voidtools.com/Everything-HTTP-Server-1.0.3.4.x86-Setup.exe" target="_blank" rel="noopener">32-bit installer</a>.
3. In Everything, open **Tools → Options → HTTP Server**, turn it on, and keep the address `127.0.0.1` and port `8080` unless you have a reason to change them.

### Connect TagFox

- Start TagFox. In **Settings**, under **Connection to Everything Search**, the address should be the same as Everything's: `http://127.0.0.1:8080` unless you changed it.
- If you gave Everything's HTTP server a username and password, enter the same ones here.
- Everything has to be running whenever you use TagFox. Its icon sits in the system tray.

### Settings worth knowing

- **Global hotkey & Quick TODO**: the key that shows and hides TagFox, the Quick TODO key, and the folder new Quick TODO files go in.
- **Search only inside one folder**: keeps every search inside one folder or drive, such as your Windows profile folder.
- **Auto-refresh**: how often TagFox looks for changes made outside it.
- **Search results**: highlight the matching letters, show thumbnails in place of file icons, and show a larger preview when the pointer rests on a file's icon.
- **Hide the window's title bar** gives the list more room, from the next start. Drag the window by the strip along its top.
