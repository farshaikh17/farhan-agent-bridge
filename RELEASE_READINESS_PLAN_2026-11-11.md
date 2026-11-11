# Release readiness plan — 2026-11-11

Reviewed draft PR #1 head 150113c7139abb8cbc85d6ccf9c8bba910fa7cfd and iteration notes. Actions run 42666265503 succeeded; local Linux syntax check and 18 tests passed using simulated providers. No live inference or billing check.

## Priorities

1. **Timeout and process recovery (release blocker).** In server/bridge.mjs, execute() rejects immediately after requesting termination on timeout. Windows taskkill runs asynchronously, and non-Windows kills only the direct child. Neither confirms that the provider process tree has stopped before worker() records failure, allowing a new submission. Windows taskkill's own spawn error is also unhandled. Review process-tree behavior and design fail-closed recovery: do not permit another task until termination is verified or the user performs explicit offline recovery. Preserve the answer and prompt where recovery requires them. Add deterministic tests for failed and delayed termination, descendants, and recovery on Windows and Linux. This is a code-review finding; it has not been reproduced with a live provider.
2. Test installation and real client interoperability on a clean Windows machine, including recovery and data permissions. Automated mock-provider CI does not establish real CLI compatibility.
3. Review inherited environment and plaintext records; design and test minimal environments and secure deletion/retention claims without assuming Windows permissions.
4. Resolve commercial provider authorization for the precise integration and business model, plus billing behavior. Do not represent existing guidance as approval.
5. Validate an actually deliverable marketplace package and payout eligibility for an India-based seller before sale.

No implementation change was made in this review. The existing 18 tests do not exercise the timeout termination race. The draft remains unmerged; no credentials, paid calls or private correspondence were used.
