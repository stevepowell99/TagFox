Check how G: and H: are configured as indexed locations in Everything (Options > Indexes in the Everything UI — the folder-index list is not in `Everything-1.5a.ini`, so it can't be read from a script).

If a whole `G:`/`H:` drive root is indexed rather than the specific Shared Drive subtree actually searched, that's the hub-documented mistake (`env-windows.md`: Everything cannot MFT-index Google Shared Drives and grinds for minutes on a whole root). Narrow it to the specific subtree if so.

Background: after adding G:/H: on 2026-07-15, search went unresponsive for a while, even on C:. Re-measured 2026-08-03: Everything is idle and healthy, the only symptom was a slow (4.8s) first query after days of uptime, not a stuck index. So the original "stuck" report may just have been a rescan in progress rather than a lasting config problem — but the index config itself is still unverified. Full detail in native memory `working_state_everything_rescan_stuck`.

Don't force a rescan without asking Steve first — costs him working search for a while.

Measured 26 October 2026, through Everything's HTTP server and a directory walk:

- `H:\` itself is not indexed, which is right.
- Everything held 3 entries from all of `H:`: `Shared drives\Causal-Map-Management`, its `3. Finances` folder and one TODO file. The other six shared drives (Causal Pathways Network, Causal-Map, Causal-Map-Archive, IEA-Qualia, JMDE ARTICLE, Konny-Causal-Map), the 20 folders under `.shortcut-targets-by-id` (folders shared with hello@ and added to My Drive as shortcuts) and `Other computers` held none. Three entries suggests a filter on the folder index or a scan that stopped early.
- A 60-second walk listed 4,859 files in 661 folders under `H:\Shared drives` with 240 folders still unread, and 738 files in 270 folders under `H:\.shortcut-targets-by-id` with 23 unread, so each is larger than that.
- Everything's Options dialog was open but hidden, so the Options menu did nothing; showing the existing dialog (`ShowWindow` on its `#32770` window) brought it back.
