# Farhan Agent Bridge

A local **Windows stdio MCP plugin** for delegating a task through your existing
Codex or Claude Code subscription login, then retrieving its result.

**Release: 0.2.0 · License: MIT · Runtime: Node.js 20+**

This repository publishes the supplied v0.2.0 plugin. It is not a copy of the
separately installed v0.3.0 bridge. Google/Antigravity support is not included.
This is an independent community project, not an official provider integration.

## What it does

- Checks installed CLI compatibility and subscription authentication.
- Runs one local background task at a time across bridge processes.
- Provides separate submit/result tools for Codex and Claude.
- Saves prompts, results and reported usage in a local runtime directory.
- Allows optional **public** Claude web search/fetch with `allow_web: true`.

A separate authentication directory does not mean a separate account. Provider
allowances remain separate; the bridge neither pools them nor provides unlimited
usage. CLI cost estimates are not evidence of an additional subscription charge.

## Requirements

- Windows and Node.js 20 or newer. Repository checks were run on Node.js 24.19.0.
- An MCP client that supports local stdio servers, or the included plugin manifests.
- The official Codex npm CLI and/or official Claude Code, separately installed and
  signed in through the subscription account you intend to use.
- Compatible CLI flags. The bridge probes Codex `exec --ignore-user-config` and
  Claude's safe-mode/tool-configuration support. An incompatible CLI is rejected.

This project does not bundle provider CLIs, credentials or dependencies.
Provider account terms and usage limits still apply.

## Installation

Clone/download the repository. Point a local stdio MCP client at:

```json
{
  "mcpServers": {
    "farhan-agent-bridge": {
      "command": "node",
      "args": ["C:/path/to/farhan-agent-bridge/server/bridge.mjs"]
    }
  }
}
```

The included `.mcp.json`, `mcp.json`, `plugin.json` and `.codex-plugin/plugin.json`
are packaging variants using `${PLUGIN_ROOT}`. Import the variant supported by
your client; repository tests do not establish compatibility with every client.

## Authentication and local storage

By default the runtime directory is `%USERPROFILE%/.farhan-agent-bridge`:

| Directory | Purpose |
| --- | --- |
| `codex-home` | Dedicated Codex sign-in/configuration |
| `claude-home` | Dedicated Claude Code sign-in/configuration |
| `workspace` | Worker working directory |
| `jobs` | Plaintext task prompts, results and usage |

`FARHAN_BRIDGE_DATA` can select another runtime directory. Keep it outside the
repository. Do not upload it or place authentication state in an issue.

Use the official CLI login flows with `CODEX_HOME` or `CLAUDE_CONFIG_DIR` set to
the appropriate dedicated directory. For Claude, use the Claude subscription
login rather than API/Console authentication. The bridge does not log in for you,
accept account terms, or copy browser credentials.

Claude runtime discovery in this release looks for `runtimes/claude/claude.exe`
inside the runtime directory, then `%USERPROFILE%/.local/bin/claude.exe`.
Codex discovery looks for its npm entrypoint in the usual Windows npm directory
and PATH-related npm locations. This is Windows-oriented discovery, not a general
cross-platform installer.

## Tools

| Tool | Purpose |
| --- | --- |
| `bridge_status` | Check compatibility and subscription sign-in; no inference |
| `submit_codex_task` | Submit authorized text to Codex |
| `get_codex_task` | Retrieve status, answer and usage |
| `submit_claude_task` | Submit text; public web access is opt-in |
| `get_claude_task` | Retrieve status, answer and usage |

Call `bridge_status`, submit one authorized task and poll the returned task ID
until completed or failed. Queued/running is not completion. A task prompt may
contain at most 50,000 characters. Workers time out after 20 minutes; Claude also
has a 12-turn cap. The Windows computer must stay awake and online.

For a minimal live check, ask the chosen provider to reply with a fixed test
string, with no tools. Such a live check consumes provider allowance; it is not
part of `npm test`.

## Boundaries

Codex runs in a read-only shell sandbox with ordinary user configuration ignored.
**Read-only does not guarantee unrelated files are unreadable.** Claude receives
supplied text, no shell/local-file/MCP tools, and optional public WebSearch/WebFetch.
Neither worker inherits an authenticated browser through this bridge.

Several API-key and provider-override environment variables are removed. There is
no configured paid API fallback, provider fallback or purchase flow. This is not
a comprehensive security audit or a guarantee about future CLI behavior. Keep
paid extra usage disabled in the official account and inspect usage settings.
Remaining Claude allowance and its billing switch are not exposed by auth status.
Administrator-managed policies may still apply.

Share only authorized context. In particular, do not send a private CV, mailbox,
ledger or personal export to an employer-managed provider account. Review worker
findings before applications, messages, publication or other consequential actions.

See [SECURITY.md](SECURITY.md).

## Development and verification

No npm dependencies are required:

```sh
npm run check
npm test
```

The included tests check manifest version consistency, stdio initialization,
tool discovery, ping, invalid task IDs, empty/oversized prompts and unsupported
methods, using a temporary data directory. They make no provider inference calls.

These checks passed for this repository preparation. Live inference, authentication,
provider billing behavior, concurrency and full worker lifecycle are **not covered**
by the included tests. Earlier local setup claims are not presented as a portable
release test suite.

## License

[MIT](LICENSE), copyright 2026 Farhan Shaikh.
