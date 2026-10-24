# Help's keys table disagrees with the code

Found by the Classic-only inventory on 24 October 2026 (`_tmp/classic-only-inventory.md`), by reading the code; none of these was run.

- In Classic, Ctrl+T and bare `t`/`T` toggle Hide ~ first (renderer.js ~19602, ~19973), so the tag-editing branches below them (Ctrl+T ~19711, Shift+T, `t`) never run. help.md says those keys edit tags. Either the keys or the help is wrong.
- help.md and some tooltips say `x` jumps to Smart and `l` cycles the layout. There are no such handlers; `i` cycles the layout.
- help.md says Ctrl+Z is "Sort by size". The code makes it Undo.
- help.md says Ctrl+Shift+Space is "Reset to Smart view defaults". The only Ctrl+Shift+Space is the global recent-tab shortcut.
- help.md mentions an "Add to Shelf" button that does not exist.

If Steve decides to drop Classic, most of this goes with it; fix only what survives.
