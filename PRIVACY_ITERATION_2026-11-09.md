# Privacy iteration — 2026-11-09

Based on PR #1 head c4e3a63 and successful Actions run 42569745558 (Windows/Linux, Node 20/24). Selected task retention as the next focused issue: completed or failed job JSON previously retained the full prompt, and Codex's separate answer file remained on disk.

The worker now removes the prompt from its final job record and attempts to unlink the Codex answer file. A cleanup warning is returned if unlink fails for reasons other than a missing file. Stale jobs marked failed on a subsequent submission also have their prompt removed. The answer remains in the job JSON for retrieval. This is data minimization, not secure erasure: disk snapshots, old files, provider CLI logs, filesystem recovery, abrupt crashes, preexisting jobs and stale temporary answer files are not cleaned up. Queued and running jobs necessarily contain prompts. Errors or answers can also contain sensitive content. Users should protect and manually manage the data directory.

Node documents unlink and filesystem error behavior: https://nodejs.org/api/fs.html#fsunlinksyncpath

Validation: `node --check server/bridge.mjs` and `node --test tests/*.test.mjs` passed on Linux using simulated providers (5 tests). The first broad `npm test` attempt also discovered unrelated nested workspace tests and initially lacked manifests; the focused rerun included all PR test files and required manifests. No live provider, Windows or billing test was run for this change. CI must be checked on the new head.

Outstanding: audit cross-process lock stale-removal races and crash recovery; define retention/deletion for existing records and temp files; independently validate Windows ACLs, live providers, marketplace and billing; clarify Anthropic commercial authentication requirements before sale. No provider approval is claimed.
