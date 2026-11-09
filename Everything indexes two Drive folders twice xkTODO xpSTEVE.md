One Drive folder is still indexed through the wrong mount in Everything, so TagFox opens the hello@ business files through the pogol account. In Everything's Options > Indexes > Folders:

- **Add** `H:\Shared drives\Causal-Map-Management`, since H: is the hello@ mount, which owns that shared drive.
- **Then remove** `G:\Shared drives\Causal-Map-Management` (the pogol mount), so the folder is indexed once.

State measured through Everything's HTTP server on 9 November 2026, after Steve's edit:

- Causal-Map-Management: 2,794 entries on G:, 0 on H:. Each file is listed once, through pogol.
- The Garden (`19aCMgarden`): fixed. 6,230 entries on C: (the hello@ My Drive mirror), 0 under `H:\.shortcut-targets-by-id\1AvNLJqWPdvF-jUD36PiSQ-u4Ia-XUasp`.
- The rest is right: neither G: nor H: is indexed as a whole drive; H: holds the 20 other shortcut-target folders; G: holds the pogol shared drives `pogol-shared` and `pogol-archive`. The other six hello@ shared drives stay unindexed until a file is missed there (Steve, 9 November 2026).

The hub rule in `env-windows.md` is to index a Shared Drive subtree from one mount only, and from the mount of the account that owns it. Check with Steve before changing an index while he is mid-search.

Pass: `"H:\Shared drives\Causal-Map-Management\"` returns about 2,800, `"G:\Shared drives\Causal-Map-Management\"` returns 0, and the C: Garden still returns about 6,200.

Steve was asked on 9 November 2026 whether to swap the mount to H: (recommended) or keep G:. Delete this file once he answers and the index matches.
