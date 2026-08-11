Steve reported: results list is not updating to filters.

Investigation (2026-08-10, cut short by /compact): no code changes to filter wiring since Steve's last
working session, and the wiring reads sound end to end. Each filter control either re-runs the Everything
search or re-renders from `lastRows`. Nothing found there.

Probable cause, found 2026-08-11: Everything, not TagFox. Everything pages its index out while nothing
queries it, and after the user instance had been up two weeks the first query took 9,874ms, then 12ms,
51ms, 45ms, 42ms. A filter click calls `runSearchNow()`, which queues on `searchMutex` behind that cold
query and renders nothing meanwhile, so the list sits stale for about ten seconds.

Fix shipped in commit f43431c (written earlier, committed 11 August 2026):

- a keepalive query every 3 minutes, and again whenever the window stops being hidden, so the index stays
  resident (`startEverythingKeepalive` in `renderer.js`);
- a "Waiting for the current search..." status after 150ms, so a click that queues behind a running search
  changes something on screen instead of looking ignored.

Still open: Steve to confirm the symptom has gone. If it recurs, the next question is which specific
control fails to update (checkbox, dropdown, search box, subfolders toggle), and whether the delay is
still ten seconds or something shorter, which would point away from the cold-index explanation.
