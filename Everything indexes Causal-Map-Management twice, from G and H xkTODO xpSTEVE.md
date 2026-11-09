Remove `G:\Shared drives\Causal-Map-Management` from Everything's folder index (Options > Indexes > Folders). Keep `H:\Shared drives\Causal-Map-Management`.

The hello@ shared drive Causal-Map-Management is indexed from both Google Drive mounts, so Everything held 2,794 entries under each on 9 November 2026 and TagFox lists every file in that drive twice, its `xk` task files included. The hub rule in `env-windows.md` is to index a Shared Drive subtree from one mount only; H: is the hello@ mount, which owns the drive.

The rest of the G: and H: index is right, measured through Everything's HTTP server on 9 November 2026: neither root is indexed; H: holds Causal-Map-Management and all 20 folders under `.shortcut-targets-by-id` (12,361 entries); G: holds the pogol shared drives `pogol-shared` and `pogol-archive`. The other six hello@ shared drives stay unindexed until a file is missed there (Steve, 9 November 2026).

Removing a folder index makes Everything drop those entries; it should not rescan the rest, but say so before doing it while Steve is mid-search.

Pass: `"G:\Shared drives\Causal-Map-Management\"` returns 0 in Everything, and `"H:\Shared drives\Causal-Map-Management\"` still returns about 2,800.
