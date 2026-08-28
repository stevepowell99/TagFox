Check how G: and H: are configured as indexed locations in Everything (Options > Indexes in the Everything UI — the folder-index list is not in `Everything-1.5a.ini`, so it can't be read from a script).

If a whole `G:`/`H:` drive root is indexed rather than the specific Shared Drive subtree actually searched, that's the hub-documented mistake (`env-windows.md`: Everything cannot MFT-index Google Shared Drives and grinds for minutes on a whole root). Narrow it to the specific subtree if so.

Background: after adding G:/H: on 2026-07-15, search went unresponsive for a while, even on C:. Re-measured 2026-08-03: Everything is idle and healthy, the only symptom was a slow (4.8s) first query after days of uptime, not a stuck index. So the original "stuck" report may just have been a rescan in progress rather than a lasting config problem — but the index config itself is still unverified. Full detail in native memory `working_state_everything_rescan_stuck`.

Don't force a rescan without asking Steve first — costs him working search for a while.
