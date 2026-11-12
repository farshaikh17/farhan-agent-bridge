# Request-envelope iteration — 2026-11-09

Base PR #1 head 0ba697d; Actions run 42630343535 passed on Windows and Ubuntu, Node 20 and 24. Reviewed PR, source, protocol tests and previous findings. The last iteration handled non-object inputs, but malformed objects could still reach tool dispatch despite missing or incorrect protocol version, invalid method, invalid identifier, or unstructured parameters.

The bridge now rejects those malformed envelopes before dispatch. The JSON-RPC specification describes request members and notifications: https://www.jsonrpc.org/specification#request_object. Existing valid notifications are still ignored without reply, and valid requests retain their original IDs. This is basic envelope validation, not full schema enforcement: parameter arrays and method-specific argument shapes still need review, batch requests remain unsupported, and interoperability with real clients is not established.

Validation: `npm run check` and `npm test` on Linux Node 24.22.1 passed, 18/18 tests; extended the subprocess test with malformed objects followed by a successful ping. Windows CI for this head remains to be checked. No live provider calls, credentials, or billing used.

Outstanding: enforce method-specific input schemas and resource bounds, verify client compatibility, Windows/provider/billing behavior, process-tree recovery, persistence, privacy/ACLs, and commercial provider terms and marketplace requirements. No provider approval claimed.
