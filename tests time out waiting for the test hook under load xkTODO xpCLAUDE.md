# Tests time out waiting for the test hook under load

On 23 October 2026 the full suite on the runner branch failed once in `refresh-visible` and once in `runner-keys` with "#tagfoxtest hook never appeared" after the 12s startup wait, before any check ran. Both passed on rerun, and the hook normally appears in about 1s (five launches each on runner and main). The likely cause is machine load while several Electron instances start at once.

A startup timeout reads as a failed feature, so either make the wait patient enough for a loaded machine, or have the runner retry a launch once and say that it did.
