# Tool argument validation iteration — 2026-11-09

Base PR #1 head aba86bf; Actions run 42636181976 succeeded for Ubuntu and Windows on Node 20/24. Reviewed latest source, envelope notes, tests and CI. Chosen gap: the server published input schemas but silently accepted extra fields and wrong types, including a string `allow_web`; arguments could reach handlers despite contradicting advertised requirements.

Before dispatch, known tool arguments must now be objects with only advertised properties, required properties and matching primitive types. Existing task-length and ID checks remain in the handlers. No generic JSON Schema library was added; schema changes beyond the current simple object/string/boolean fields require extending the validator. See official MCP SDK guidance on validating tool arguments: https://go.sdk.modelcontextprotocol.io/server/.

Validation: `npm run check` and `npm test` on Linux Node 24.22.1 passed, 18/18 tests. Extended protocol test covers extra fields, wrong boolean and ID types, absent task, null and array arguments. No live provider calls or credentials used. CI for the new head and real Windows/client interoperability remain to be checked.

Open: full schema and envelope validation, task-length counting differences for Unicode, protocol resource bounds, crash/process-tree recovery, filesystem durability and ACLs, live provider billing, commercial provider terms and marketplace packaging. No provider approval claimed.
