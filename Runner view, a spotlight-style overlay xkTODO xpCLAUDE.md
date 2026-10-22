# Runner view, a spotlight-style overlay

Steve's spec, dictated 22 October 2026 (voice notes 138 and 139, transcripts lightly trimmed).

> A new version or fork of TagFox. Keep the current code frozen and running. Either fork the existing code, write a new one, or have it as an additional layer inside TagFox; I don't mind which.
>
> The same key combination brings up a spotlight-type runner overlay, large on the screen, with a large search box to type into and, underneath it filling the rest of the screen height, a results pane.
>
> By default results are sorted in a smart way, with a big weight for recency and obviously for accuracy of search hits. Ideally they are also weighted by how frequently they have been actioned on before inside TagFox.
>
> Up and down arrows move through the results. Right arrow on a folder digs into that folder; left arrow anywhere goes to the parent folder.
>
> You can star any row to save it as a remembered item or folder, and these are preferred in search results.
>
> Discreetly next to the search box: the obvious toggles, such as show/hide system files and sort order.
>
> By default the right-hand third of the results area is a preview of the selected file, showing images, text and so on as the current TagFox Viewer does; markdown can be edited as usual.
>
> Keep the same inline buttons on the result rows as TagFox has now. It is very important visually that it is just a large search box with search results below it.
>
> Much the same as current TagFox but a much simpler interface. Later we might add back the Shelf. No favourites column on the left, no tabs, and for the moment no special filters such as to-do.
>
> We won't have smart view. Filters should be almost hidden by default.
>
> Addendum: while typing in the search box, a slash opens a fuzzy search over quick commands, such as sort by date descending.

Decided in the runner tab, 22 October 2026: drop the row actions column to save width; on row hover the action buttons fly out, anchored to a new row icon; remove the existing flaky hover-flyout code. Built into Runner first. The flyout to remove is the bulk bar's float that follows the pointer, and it goes from Classic as well; Classic's bulk actions must stay reachable without it.

Decided in the runner tab, 22 October 2026: inside a folder (reached with Left or Right), an empty search box lists only that folder's immediate contents; once text is typed, the search covers the folder recursively. This is a fixed rule, separate from smart view.

Decided in the coordinator chat, 22 October 2026: search works like Google by default. Match path is on by default (switchable from the filter control and a `/` command), so each word must appear somewhere in the full path, in any order; a leading `-word` excludes it (sent to Everything as `!word`). In the smart order, a row whose terms match only in its path ranks below rows that match in the name.

## Plan (coordinator, 22 October 2026)

- Build it as a second layout of the same renderer, not a fork: `renderer.js` is about 800KB, and a fork would mean every fix landed twice.
- It lands on `main` behind a Settings switch ("toggle key opens: Runner / Classic"), default Classic, so the current UI stays as it is until Steve flips it.
- Pane brief: `_tmp/runner-pane-brief.md`.
