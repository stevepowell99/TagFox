# Test harness startup sometimes hangs before the test hook appears

A test TagFox occasionally never exposes `#tagfoxtest`: the harness waits its full 45 seconds and fails with "#tagfoxtest hook never appeared", with the renderer hung. It hits a different test each time and the test passes when rerun alone.

- Seen in four suite logs on 22 and 23 October 2026, then again in `tab lifecycle` on the run that tested runner commit `edabb5e`.
- It predates the Runner ProgramData change, so treat it as a harness fault rather than a product one.
- Start from the diagnostics the 45-second wait already prints, and find out whether the renderer is hung or never loaded `renderer.js`.
- A second harness fault may share the cause: a test that passed sometimes leaves its Electron main process running 1.5 seconds after the test exits, though `close()` sends it SIGKILL, so `run-all.cjs` fails the run with "LEFT RUNNING". Seen twice in 13 runs on 23 October 2026 (`tab lifecycle` in a full suite, `refresh visibility` alone); four further runs that listed test Electrons at 1.5, 5 and 12 seconds found none, so whether the process ever exits by itself is still open.
- `hover preview` fails its two Classic icon checks ("resting on the row's icon opens the preview", "a repaint that removes the row under the open preview closes it") about one run in three, alone or in the suite (23 October 2026, at `f35c706`). A timing assumption in the test is the likeliest cause.
- Run from a checkout under `.claude\worktrees\` (where a background agent's worktree lands), `runner layout`, `runner keys`, `runner syntax` and `hover preview` fail on unchanged code, and pass from `C:\dev\TagFox`. Runner hides paths with a `.` segment, which probably hides the tests' own files there. Either the tests should not depend on the checkout's path, or agent worktrees should sit elsewhere.
