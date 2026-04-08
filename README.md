# TagFox

A small desktop app that uses [Voidtools Everything](https://www.voidtools.com/) to search your files very quickly. You can also add **tags** in file and folder names (text in square brackets) to sort and filter your stuff.

**Smart view** is the default results layout. It automatically adjusts which results you see (subfolders, files & folders) relative to **Max results** — so you mostly don't need to touch those toggles yourself. You *can* still click them for a one-off override, but Smart view will reset to its own logic on the next search.

**First run:** In a terminal, run `npm install` and then `npm start`. Everything must be installed and running. Turn on its **HTTP server** (in Everything's settings), then in TagFox open **Settings** and paste the **Everything base URL** it shows you (or the address you use for Everything in the browser).

**In the app:** Press **F1** or **Ctrl+/** for the full guide.

**If search feels slow:** Open **Advanced** and try turning off **Folder-contents highlight** and **Hide special**.

**Editing help:** Change [`help.md`](help.md), then run `npm run build:help` (or just `npm start` / `npm run dist`, which rebuild help for you). Notes for maintainers only are in HTML comments at the top of `help.md`.
