# TagFox

A small desktop app that uses [Voidtools Everything](https://www.voidtools.com/) to search your files very quickly. You can also add **tags** in file and folder names (text in square brackets) to sort and filter your stuff.

**Smart view** is the default results layout. It automatically adjusts which results you see (subfolders, files & folders) relative to **Max results** — so you mostly don't need to touch those toggles yourself. You *can* still click them for a one-off override, but Smart view will reset to its own logic on the next search.

**If you installed TagFox from a `.exe`:** install [Everything 1.5a](https://www.voidtools.com/everything-1.5a) and the HTTP Server plugin, let it finish indexing, then turn on **HTTP Server** under **Tools → Options → HTTP Server**. In TagFox **Settings**, under **Connection to Everything Search**, use the same URL; the default is `http://127.0.0.1:8080`.

**If you cloned this repo:** do the same Everything setup, then run `npm install` and `npm start` in the TagFox folder.

TagFox relies on `sort-mix:`, so `Everything 1.5a` is the supported setup.

**In the app:** Press **F1** or **Ctrl+/** for the full guide.

**If search feels slow:** Open **Advanced** and try turning off **Folder-contents highlight** and **Hide special**.

**Google Drive (single-account folder actions):** To use **Create new Google Doc here** in any Drive-backed path, add `google-oauth-client.json` in the app root with either:
- `{ "clientId": "...", "clientSecret": "...", "redirectUri": "http://127.0.0.1:53682/oauth2callback" }`
- or standard Google Desktop JSON (`installed.client_id`, `installed.client_secret`, `installed.redirect_uris`).
In [Google Cloud Console](https://console.cloud.google.com/) → OAuth consent screen / Credentials, include scopes **`drive.metadata.readonly`** and **`drive.file`** (create docs in folders).
On first use, TagFox opens browser sign-in once and saves a single account token in app userData.
If you already had a token from an older TagFox build, delete `tagfox-google-oauth-token.json` in the app userData folder and sign in again so **`drive.file`** is granted.
After startup, a green **✓** in the status bar means the Drive API ping succeeded (details in tooltip).

**Google Drive — possible next steps (when you have time):**
- In Google Cloud Console, add **`drive.file`** to the OAuth consent screen if it is not already listed, then delete `tagfox-google-oauth-token.json` in app userData and sign in again so **Create new Google Doc here** can use `files.create` in the resolved folder.
- If **Create new Google Doc here** returns 403, the saved token predates `drive.file`; re-consent as above.
- Optional: multi-account API vs in-app Google session — align both to the same Google account, or document limitations.

**Editing help:** Change [`help.md`](help.md), then run `npm run build:help` (or just `npm start` / `npm run dist`, which rebuild help for you). Notes for maintainers only are in HTML comments at the top of `help.md`.
