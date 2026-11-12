# Worker launch iteration — 2026-11-09

Base PR #1 head 4149a3c; Actions run 42610150973 passed on Ubuntu and Windows, Node 20 and 24. Reviewed source, PR, tests and earlier recovery and finalization notes. Chosen issue: a failure to spawn the detached worker previously returned an error without a task ID and left the queued job, causing fail-closed submission blocking.

The bridge now changes the queued record to failed, removes the prompt, and returns the task ID on a synchronous launch exception or a pre-spawn child error. If saving that failed record fails, it returns the ID and directs the user to offline recovery; it does not pretend the record was updated. A successful spawn preserves the existing asynchronous lifecycle. Node documents that `spawn` signals process creation, not successful work: https://nodejs.org/api/child_process.html#event-spawn. Failures after process creation remain ambiguous and are not automatically cleared.

Validation: `npm run check` and `npm test` on Linux Node 24.22.1 passed (17 tests). Added tests for synchronous launch exception, real missing executable, failed-record save failure, and successful launch. Existing tests exercise a simulated provider end-to-end. Windows CI for this head must still be checked. No live provider inference, credentials, or billing used.

Remaining: spawn success followed by early worker death can still leave queued/running records requiring offline manual recovery. This change does not guarantee process-tree termination, power-loss persistence, race freedom or provider accounting. Continue Windows live validation, ACL and privacy review, provider commercial terms and marketplace readiness before release; no provider approval claimed.
