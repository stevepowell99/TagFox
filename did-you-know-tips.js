// "Did you know?" tips for Runner's status line: scores + segment arrays (strings, { kbd } for a key, { code }
// for text typed into the box), rendered by renderer.js. Every { kbd } is spelled as Runner's key table
// (RUNNER_KEYS) spells it, and every `/` command in a { code } must find a command; test/runner-status.cjs
// checks both.
(function (global) {
  function K(s) {
    return { kbd: String(s) };
  }
  function C(s) {
    return { code: String(s) };
  }
  global.TagFoxDidYouKnowTips = Object.freeze([
    { score: 5, tip: ['Type to search: with the box empty you see this folder, and once you type, every folder below it.'] },
    { score: 5, tip: [K('/'), ' lists commands for sorting, filters, tags and match options. Type a few letters to narrow it.'] },
    { score: 5, tip: [K('?'), ' in the empty box lists every key.'] },
    { score: 5, tip: [K('→'), ' goes into the selected folder, and ', K('←'), ' back up to its parent.'] },
    { score: 5, tip: [K('Enter'), ' opens the selected row; on a folder it searches inside it.'] },
    { score: 5, tip: [K('Alt+P'), ' shows or hides the Viewer, and ', K('Shift+Space'), ' makes it full screen.'] },
    { score: 5, tip: [K('Ctrl+D'), ' stars the selected row. Starred items rank higher, and ', K('Ctrl+Shift+1…9'), ' opens the first nine.'] },
    { score: 5, tip: [K('Ctrl+T'), ' edits the tags of the selected or checked rows. Tags live in the file name, as in ', C('Report xkTODO.docx'), '.'] },
    { score: 5, tip: ['Drag rows onto the Shelf under the list, go to another folder, then drag them onto a folder row. ', K('Shift'), ' copies.'] },
    { score: 4, tip: [C('-word'), ' leaves out anything matching that word.'] },
    { score: 4, tip: ['A file type lists only that type: ', C('.pdf'), ', or just ', C('pdf'), '. On its own it lists the newest first.'] },
    { score: 4, tip: [C('^map'), ' matches only where a word starts: ', C('map.json'), ' but not ', C('roadmap.txt'), '.'] },
    { score: 4, tip: [C('/todo'), ' and ', K('Enter'), ' lists only files tagged xkTODO, and ', C('/not todo'), ' leaves them out.'] },
    { score: 4, tip: [C('/size'), ' sorts by size, largest first; ', C('/smallest'), ' the other way round.'] },
    { score: 4, tip: [K('Ctrl+R'), ' steps through modified in the last hour, day, week, month, year or any time.'] },
    { score: 4, tip: [K('Ctrl+M'), ' sorts by date and ', K('Ctrl+N'), ' by name; press either again for the smart order.'] },
    { score: 4, tip: [K('Alt+O'), ' opens the options. A setting away from its default shows as a chip under the box, and its × resets it.'] },
    { score: 4, tip: [K('Alt+Home'), ' starts again: no text, no folder, every filter at its default.'] },
    { score: 4, tip: [K('Alt+←'), ' and ', K('Alt+→'), ' step back and forward through earlier searches.'] },
    { score: 4, tip: [K('Ctrl+1…9'), ' opens one of the first nine rows; hold Ctrl to see their numbers.'] },
    { score: 4, tip: [K('Shift+Enter'), ' goes to the folder holding the selected row.'] },
    { score: 4, tip: [K('Ctrl+Enter'), ' shows the selected row in File Explorer.'] },
    { score: 4, tip: [K('Shift+↑'), ' and ', K('Shift+↓'), ' check a run of rows, and ', K('Space'), ' checks one.'] },
    { score: 4, tip: [K('Ctrl+C'), ' or ', K('Ctrl+X'), ' copies or cuts files for Explorer, and ', K('Ctrl+V'), ' pastes files from Explorer into this folder.'] },
    { score: 4, tip: [K('Del'), ' sends the checked rows to the Recycle Bin. TagFox never deletes anything for good.'] },
    { score: 4, tip: [K('Esc'), ' steps back one thing a press: a menu, the checked rows, the text, the folder, then TagFox hides.'] },
    { score: 4, tip: [K('Ctrl+Alt+Space'), ' shows or hides TagFox from anywhere in Windows; Settings can change the key.'] },
    { score: 4, tip: [K('Ctrl+Shift+Space'), ' from anywhere in Windows lists what changed in the last hour, in every folder.'] },
    { score: 3, tip: [K('Backspace'), ' in the empty box leaves the folder and searches everywhere.'] },
    { score: 3, tip: [K('Ctrl+U'), ' switches Match path off, so only names match; press it again to switch it back on.'] },
    { score: 3, tip: [K('Ctrl+B'), ' matches whole words only, and ', K('Ctrl+I'), ' matches case.'] },
    { score: 3, tip: [K('Tab'), " in the list steps along the selected row's buttons, and ", K('Enter'), ' presses one.'] },
    { score: 3, tip: [K('Shift+F10'), " opens the selected row's menu."] },
    { score: 3, tip: [K('F2'), ' renames the selected row, and ', K('Ctrl+H'), ' renames the checked rows with wildcards.'] },
    { score: 3, tip: [K('Ctrl+Shift+N'), ' makes a new folder in the current folder.'] },
    { score: 3, tip: [K('Ctrl+Shift+C'), ' copies the full paths of the selected files as text.'] },
    { score: 3, tip: ['A screenshot pasted with ', K('Ctrl+V'), ' is saved as ', C('Clipboard image.png'), ' in the current folder.'] },
    { score: 3, tip: ['Hold ', K('Alt'), ' as you start dragging a row or a Shelf chip to drop it into Explorer or another app.'] },
    { score: 3, tip: ['Click a folder in the path above the box to go there, or the › after it for the folders inside it.'] },
    { score: 3, tip: ['Point at the folder chip at the start of the box for its buttons: Explorer, copy, tags and terminal.'] },
    { score: 3, tip: ['The smart order puts name matches above path matches, then favours recent, starred and often-opened items.'] },
    { score: 3, tip: ["Everything's own syntax works in the box: ", C('a|b'), ', ', C('"exact phrase"'), ', ', C('size:>1mb'), ', ', C('dm:today'), '.'] },
    { score: 3, tip: [K('F5'), ' searches again if the list looks out of date.'] },    { score: 3, tip: [K('F1'), ' opens the help, and ', K('Ctrl+,'), ' opens Settings.'] },
    { score: 3, tip: [K('Alt+Enter'), " opens the selected row's Properties."] },
    { score: 2, tip: ['Everything must be running for TagFox to find anything; look for its icon in the system tray.'] },
    { score: 2, tip: ["Settings, Hide the window's title bar, gives the list more room from the next start."] },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
