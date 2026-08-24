# Confirm the bundled gmist works on a machine with no checkout

`TagFox Setup 1.2.4.exe` (Causal Map Drive root) is the first build that carries
gmist inside it. Everything under "already proven" was measured on 24 August 2026;
the part under "not proven" needs a machine without a `mist` checkout, and this
one has one.

## What Gabriele should see

Install 1.2.4, open any `.md` or `.qmd` row, and press Enter (or double-click, or
the row Open button). gmist should open in a TagFox window after roughly ten
seconds the first time and at once after that. Editing and saving should write
the file in place.

Before 1.2.4 that click reported "could not find the gmist repo" and opened
nothing, so any markdown file at all is the test.

## Already proven here

- The staged bundle runs on its own, and reads and writes real files through the
  localfs sidecar.
- The packaged payload runs using the packaged `TagFox.exe` as its node runtime,
  mints a room from `/open`, serves the room page, and reads the file through the
  Durable Object.
- No `.dev.vars` reaches the installer, so none of Steve's secrets travel with it.

## Not proven

TagFox's own start path for the bundle (`startBundledGmist` in `main.js`), because
a `mist` checkout wins wherever there is one and this machine has `C:\dev\mist`.

To check it here rather than waiting for Gabriele: stop the dev gmist first, since
both want ports 5173 and 5199, then start TagFox with
`TAGFOX_GMIST_FORCE_BUNDLED=1`. Failures are logged to
`%LOCALAPPDATA%\TagFox\gmist-local.log`.

## To decide later

Gabriele's gmist is pinned to her TagFox: the bundle is built from the `mist`
checkout at package time, so a gmist fix reaches her only in the next TagFox
installer.
