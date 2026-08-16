Steve, 16 August 2026: pressing the global hotkey (his is Ctrl+Space) left the search box unable to take a
keystroke for several seconds. Fixed by `disable-renderer-backgrounding` plus `backgroundThrottling: false`
(see `CLAUDE.md` → Working rules), which stops Chromium demoting the renderer to Idle priority whenever the
window is hidden or covered.

The mechanism is measured; the size of the win is not, because the 3-7s case only shows on a process that
has been running a day or more and could not be forced on demand. So this needs a few days of ordinary use
before it counts as done.

What to check:

- `%TEMP%\tagfox-mainperf.log`, the `raise …` lines. Warm should be `js=` under 100ms and `to-paint=` under
  150ms. A recurrence prints the working set and CPU of every process across the raise: tens of MB faulting
  back in with almost no CPU means the OS is paging TagFox in; CPU burnt means we are doing work, and the
  `rend longtask …` lines in the same file will say how long.
- With TagFox hidden or covered, `Get-Process` must still show `PriorityClass=Normal` for its
  `--type=renderer` processes. Idle there means the switch stopped working (an Electron upgrade, say).

Delete this file once Steve says the raise is reliably instant.
