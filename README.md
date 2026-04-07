# TagFox

A small desktop app that uses [Voidtools Everything](https://www.voidtools.com/) to search your files very quickly. You can also add **tags** in file and folder names (text in square brackets) to sort and filter your stuff.

**First run:** In a terminal, run `npm install` and then `npm start`. Everything must be installed and running. Turn on its **HTTP server** (in Everything’s settings), then in TagFox open **Settings** and paste the **Everything base URL** it shows you (or the address you use for Everything in the browser).

**In the app:** Press **F1** for the full guide.

**If search feels slow:** Open **Advanced** and try turning off **Folder-contents highlight** and **Hide special**.

**Editing help:** Change [`help.md`](help.md), then run `npm run build:help` (or just `npm start` / `npm run dist`, which rebuild help for you). Notes for maintainers only are in HTML comments at the top of `help.md`.
