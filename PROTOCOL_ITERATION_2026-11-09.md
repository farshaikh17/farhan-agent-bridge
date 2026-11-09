# Protocol robustness iteration — 2026-11-09

Base PR #1 head 9209653; Actions run 42617696381 passed on Windows and Ubuntu with Node 20 and 24. Reviewed current source, PR and recent iteration notes. Parsing the JSON value `null` led to `msg.id` access outside error handling and terminated the stdio server.

Non-object JSON values now receive JSON-RPC error -32600 with null ID, and the server remains available for a subsequent request. This bridge rejects arrays as unsupported; it does not implement JSON-RPC batch requests. See https://www.jsonrpc.org/specification#error_object. This narrow fix is not full JSON-RPC or MCP compliance; object envelope, argument schema validation, batch compatibility, line-size limits and client interoperability still need review.

Validation: `npm run check` and `npm test`, Linux Node 24.22.1, 18/18 passed. Added a subprocess regression test sending null, primitives and an array, then ping on the same process. Windows checks for this head remain to be verified. No credentials or live providers were used.

Open: Windows/provider and billing behavior, security and privacy, process-tree recovery, storage durability, client/marketplace packaging, and commercial provider terms. No approval claimed.
