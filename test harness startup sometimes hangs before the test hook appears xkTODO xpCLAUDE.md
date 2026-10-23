# Test harness startup sometimes hangs before the test hook appears

A test TagFox occasionally never exposes `#tagfoxtest`: the harness waits its full 45 seconds and fails with "#tagfoxtest hook never appeared", with the renderer hung. It hits a different test each time and the test passes when rerun alone.

- Seen in four suite logs on 22 and 23 October 2026, then again in `tab lifecycle` on the run that tested runner commit `edabb5e`.
- It predates the Runner ProgramData change, so treat it as a harness fault rather than a product one.
- Start from the diagnostics the 45-second wait already prints, and find out whether the renderer is hung or never loaded `renderer.js`.
