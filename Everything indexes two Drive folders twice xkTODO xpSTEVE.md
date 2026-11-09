Two Drive folders are in Everything's index twice, so TagFox lists every file in them twice, `xk` task files included. In Everything's Options:

- **Indexes > Folders:** remove `G:\Shared drives\Causal-Map-Management`. Keep `H:\Shared drives\Causal-Map-Management`, since H: is the hello@ mount, which owns that shared drive.
- **Exclude > Exclude folders:** add `H:\.shortcut-targets-by-id\1AvNLJqWPdvF-jUD36PiSQ-u4Ia-XUasp`, the Garden (`19aCMgarden`), which the hello@ My Drive mirror already puts on C:. The other 19 folders under `H:\.shortcut-targets-by-id` are not on C: and stay indexed.

Measured through Everything's HTTP server on 9 November 2026:

- Causal-Map-Management: 2,794 entries under each mount, 15 `xk` task files under each.
- The Garden: 6,229 entries under `C:\Users\Zoom\My Drive (hello@causalmap.app)\...\19aCMgarden` and 6,228 under the H: shortcut target.
- The rest is right: neither G: nor H: is indexed as a whole drive; H: holds Causal-Map-Management and the 20 shortcut-target folders (12,361 entries); G: holds the pogol shared drives `pogol-shared` and `pogol-archive`. The other six hello@ shared drives stay unindexed until a file is missed there (Steve, 9 November 2026).

The hub rule in `env-windows.md` is to index a Shared Drive subtree from one mount only. Removing an index or adding an exclusion drops those entries; check with Steve before doing it while he is mid-search.

Pass: `"G:\Shared drives\Causal-Map-Management\"` and `"H:\.shortcut-targets-by-id\1AvNLJqWPdvF-jUD36PiSQ-u4Ia-XUasp\"` each return 0 in Everything; the H: Causal-Map-Management and the C: Garden still return about 2,800 and 6,200.
