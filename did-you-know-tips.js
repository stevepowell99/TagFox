// "Did you know?" tips for Runner's status line: scores + segment arrays (strings, { kbd } for a key, { code }
// for text typed into the box), rendered by renderer.js. Every { kbd } is spelled as Runner's key table
// (RUNNER_KEYS) spells it, and every `/` command in a { code } must find a command; test/runner-status.cjs
// checks both. Written for someone who has never read the help: say what it is for, in everyday words, and
// leave TagFox's own terms (Match path, smart order, scope) to the help.
(function (global) {
  function K(s) {
    return { kbd: String(s) };
  }
  function C(s) {
    return { code: String(s) };
  }
  global.TagFoxDidYouKnowTips = Object.freeze([
    { score: 5, tip: ['Typing searches this folder and every folder inside it. Clear the search box to see just this folder.'] },
    { score: 5, tip: ['Press ', K('/'), ' for commands to sort, filter and tag. Type a few letters to find the one you want.'] },
    { score: 5, tip: ['Forgotten a key? Press ', K('?'), ' with the search box empty to see them all.'] },
    { score: 5, tip: [K('→'), ' steps into the selected folder, and ', K('←'), ' takes you back up a level.'] },
    { score: 5, tip: [K('Enter'), ' opens the selected file. On a folder, it takes you inside.'] },
    { score: 5, tip: [K('Alt+P'), ' shows or hides the preview on the right, and ', K('Shift+Space'), ' makes it fill the screen.'] },
    { score: 5, tip: [K('Ctrl+D'), ' stars a file or folder, which brings it higher up the list. ', K('Ctrl+Shift+1…9'), ' opens your first nine stars.'] },
    { score: 4, tip: ['Run the same search often? ', C('/save'), ' keeps it, folder and filters included, and ', K('Alt+1…9'), ' runs your first nine saved searches.'] },
    { score: 5, tip: [K('Ctrl+T'), ' tags the selected file. Tags are kept in the file name, as in ', C('Report xkTODO.docx'), ', so they go wherever the file goes.'] },
    { score: 5, tip: ['Moving files? Drag them onto the Shelf at the bottom, find the folder they belong in, then drag them from the Shelf onto it. Hold ', K('Shift'), ' to copy instead.'] },
    { score: 4, tip: ['Paste a folder or file path into the search box to jump straight there. If you type one, press ', K('Enter'), '.'] },
    { score: 4, tip: ['Put a minus in front of a word, as in ', C('-draft'), ', to leave out anything that matches it.'] },
    { score: 4, tip: ['Type a file type to see only those files: ', C('.pdf'), ', or just ', C('pdf'), '. On its own, it shows the newest first.'] },
    { score: 4, tip: ['Start a word with ^ to match only at the start of words: ', C('^map'), ' finds ', C('map.json'), ' but not ', C('roadmap.txt'), '.'] },
    { score: 4, tip: [C('/todo'), ' then ', K('Enter'), ' shows only files tagged xkTODO, and ', C('/not todo'), ' hides them.'] },
    { score: 4, tip: [C('/size'), ' puts the biggest files first, and ', C('/smallest'), ' the smallest.'] },
    { score: 4, tip: [K('Ctrl+R'), ' shows only what changed recently. Keep pressing to widen it from the last hour to a day, a week, a month, a year, and then any time.'] },
    { score: 4, tip: [K('Ctrl+M'), ' sorts by date and ', K('Ctrl+N'), ' by name. Press the same key again to go back to the usual order.'] },
    { score: 4, tip: [K('Alt+O'), ' opens the search options. Anything you change shows as a chip under the search box; click its × to undo it.'] },
    { score: 4, tip: [K('Alt+Home'), ' starts afresh: no text, no folder and no filters.'] },
    { score: 4, tip: [K('Alt+←'), ' and ', K('Alt+→'), ' take you back and forward through your earlier searches, as in a browser.'] },
    { score: 4, tip: [K('Ctrl+1…9'), ' opens one of the first nine rows. Hold Ctrl to see their numbers.'] },
    { score: 4, tip: [K('Shift+Enter'), ' takes you to the folder the selected file is in.'] },
    { score: 4, tip: [K('Ctrl+Enter'), ' shows the selected file in File Explorer.'] },
    { score: 4, tip: ['To pick several rows, hold ', K('Shift+↑'), ' or ', K('Shift+↓'), ', or press ', K('Space'), ' on each one to check it.'] },
    { score: 4, tip: [K('Ctrl+C'), ' and ', K('Ctrl+X'), ' copy or cut files to paste in Explorer, and ', K('Ctrl+V'), ' pastes files from Explorer into the folder you are in.'] },
    { score: 4, tip: [K('Del'), ' sends the checked files to the Recycle Bin. TagFox never deletes anything outright.'] },
    { score: 4, tip: [K('Esc'), ' undoes one thing per press: it closes a menu, unchecks rows, clears the text, leaves the folder, and last of all hides TagFox.'] },
    { score: 4, tip: [K('Ctrl+Alt+Space'), ' brings TagFox up from anywhere in Windows, and hides it again. You can change the key in Settings.'] },
    { score: 4, tip: [K('Ctrl+Shift+Space'), ', from anywhere in Windows, shows everything that changed in the last hour, in every folder.'] },
    { score: 3, tip: [K('Backspace'), ' in an empty search box leaves the folder, so you search everywhere.'] },
    { score: 3, tip: [K('Ctrl+U'), ' searches file names only, not the folders they sit in. Press it again to search whole paths.'] },
    { score: 3, tip: [K('Ctrl+B'), ' matches whole words only, and ', K('Ctrl+I'), ' makes capitals count.'] },
    { score: 3, tip: [K('Tab'), " moves along the selected row's buttons, and ", K('Enter'), ' presses the one you are on.'] },
    { score: 3, tip: [K('Shift+F10'), ' opens the menu for the selected row, as a right-click does.'] },
    { score: 3, tip: [K('F2'), ' renames the selected file, and ', K('Ctrl+H'), ' renames all the checked files at once, with wildcards.'] },
    { score: 3, tip: [K('Ctrl+Shift+N'), ' makes a new folder here.'] },
    { score: 3, tip: [K('Ctrl+Shift+C'), " copies the selected files' full paths as text, ready to paste."] },
    { score: 3, tip: ['Copied a screenshot? ', K('Ctrl+V'), ' saves it here as ', C('Clipboard image.png'), '.'] },
    { score: 3, tip: ['To drag a file into Explorer, an email or another app, hold ', K('Alt'), ' as you start dragging. That works for Shelf chips too.'] },
    { score: 3, tip: ['Click any folder in the path above the search box to go there, or the › after it to see the folders inside.'] },
    { score: 3, tip: ['Point at the folder name at the start of the search box for buttons that show it in Explorer, copy it or its path, edit its tags and open a terminal there.'] },
    { score: 3, tip: ['Files whose name matches come before files that match only by their folder. After that, recently changed, starred and often-opened files come first.'] },
    { score: 3, tip: ["The search box also understands Everything's own search language: ", C('a|b'), ', ', C('"exact phrase"'), ', ', C('size:>1mb'), ', ', C('dm:today'), '.'] },
    { score: 3, tip: [K('F5'), ' searches again if the list looks out of date.'] },
    { score: 3, tip: [K('F1'), ' opens the help, and ', K('Ctrl+,'), ' opens Settings.'] },
    { score: 3, tip: [K('Alt+Enter'), " opens the selected file's Windows Properties."] },
    { score: 2, tip: ['TagFox needs Everything running to find anything. Look for its icon in the system tray.'] },
    { score: 2, tip: ["Want more room? Settings can hide the window's title bar, from the next start."] },
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
