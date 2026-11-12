# Farhan Agent Bridge

A local **Windows stdio MCP plugin** for delegating a task through your existing
Codex or Claude Code subscription login, then retrieving its result.

**Release: 0.2.0 · License: MIT · Runtime: Node.js 20+**

This repository publishes the supplied v0.2.0 plugin. It is not a copy of the
separately installed v0.3.0 bridge. Google/Antigravity support is not included.
This is an independent community project, not an official provider integration.

## What it does

- Checks installed CLI compatibility and subscription authentication.
- Attempts to limit local background work to one task across bridge processes.
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

**Commercial distribution:** Anthropic's developer guidance says products built
for others should use API-key authentication through Claude Console or a supported
cloud provider. This bridge currently accepts only Claude subscription login and
does not support API authentication. Do not market this Claude integration as a
compliant commercial offering without clarifying the exact configuration with
Anthropic. API usage may incur charges and is not enabled by this bridge. See
[Anthropic's authentication guidance](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account).

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

Claude status can display the account email for verification. New job records retain
subscription and authentication type but do not deliberately store that email.
Existing records are not changed, and prompts or provider output can still contain it.

`FARHAN_BRIDGE_DATA` can select another runtime directory. Keep it outside the
repository. Do not upload it or place authentication state in an issue.

Use the official CLI login flows with `CODEX_HOME` or `CLAUDE_CONFIG_DIR` set to
the appropriate dedicated directory. For Claude, use the Claude subscription
login rather than API/Console authentication. The bridge does not log in for you,
accept account terms, or copy browser credentials.

Claude runtime discovery in this release looks for `runtimes/claude/claude.exe`
inside the runtime directory, then `%USERPROFILE%/.local/bin/claude.exe`.
Codex discovery looks for its npm entrypoint in the usual Windows npm directory
and absolute PATH-related npm locations. Empty and relative PATH entries are ignored;
use an absolute installation path. This is Windows-oriented discovery, not a general
cross-platform installer.

## Recovering a stuck submission lock

Use a local disk for `FARHAN_BRIDGE_DATA`; network filesystems may not enforce
exclusive creation reliably. If submissions still report a submission lock after
an interruption, close **all** bridge clients and stop all bridge processes first,
then delete only `submit.lock` in the runtime directory and restart the client.
Never delete it while any bridge process may be submitting: doing so can allow
overlapping tasks. Queued or running workers and job recovery are separate from
this lock; check a task's status before retrying. Do not delete authentication
folders. If lock creation reports another filesystem error, correct the directory
permissions or storage issue instead of removing files blindly.

## Provider lock recovery

`provider.lock` blocks provider commands while another command is running. A timeout,
process error, or bridge interruption can leave it behind, including during status
checks before a task exists. Close every bridge client and confirm the bridge workers,
provider processes and their descendants have stopped. If you cannot confirm this,
do not remove the lock or retry. Once confirmed, remove only `provider.lock` from
the runtime directory and restart the client. Also follow job recovery below for
any queued or running task. The lock does not prove that provider descendants have
stopped after a normally completed command. On Windows, timeout termination uses
`taskkill.exe` in the configured Windows system directory. If that directory is
unavailable, termination is not attempted and recovery remains blocked.

## Job recovery after an interruption

If worker startup fails before a process starts, the bridge records a failed job
and returns its task ID. If it also cannot update the job record, it returns the
ID and requires the offline recovery procedure below. A worker that starts and
then exits is a different case and may still require investigation.

If a task times out, the provider reports a process error, or the bridge cannot record progress, termination of the provider process tree is not confirmed.
The record stays running and blocks new submissions until offline recovery; its
prompt and any temporary answer may remain on disk.

Queued or running records block new submissions even if they are old. First poll
the task ID. If it remains stuck, **close all bridge clients and confirm that the
bridge worker and its provider processes have stopped** before taking any action.
A PID alone is not proof: process IDs can be reused, and a worker may have spawned
other processes. If you cannot confirm this, do not retry the task.
A running record can contain a checkpointed answer if finalization was interrupted;
that is not confirmation of success. Preserve the record and any matching
`<task-id>.answer.txt` file during recovery. Either can contain sensitive data.

Once all workers have stopped, locate the specific stuck `<task-id>.json` in the
runtime directory's `jobs` folder. Move that file outside the `jobs` folder to a
private location for investigation. If a matching `<task-id>.recovery` marker exists,
move it to the same private location, then restart the client. A recovery marker
may report an unconfirmed process when the job record could not be updated; its
absence does not prove a process stopped or that an update succeeded. The moved record is
no longer retrievable through the bridge and may contain a plaintext prompt. Do
not move completed or unrelated jobs, authentication folders, or share the file.
A failed job update may leave a temporary file in the jobs folder; do not
overwrite it blindly, as it may contain sensitive data.
If an unreadable or invalid job record blocks submissions, use the same offline
procedure for that specific record; make a private backup before moving it. An
interrupted task may already have consumed provider allowance or produced a partial
result; inspect available results and provider usage before deciding to resubmit.

## Tools

| Tool | Purpose |
| --- | --- |
| `bridge_status` | Check compatibility and subscription sign-in; no inference |
| `submit_codex_task` | Submit authorized text to Codex |
| `get_codex_task` | Retrieve status, answer and usage |
| `submit_claude_task` | Submit text; public web access is opt-in |
| `get_claude_task` | Retrieve status, answer and usage |

`bridge_status` is paused while a task is queued or running, or another process is checking status or submitting. Poll the active task first.

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

The bridge removes NODE_OPTIONS, NODE_PATH, several provider-specific settings, and
selected AWS, GitHub, Google, Azure and Cloudflare credential variables from child
processes. This may affect workflows that rely on those variables. Other environment variables remain
visible to those processes and may contain secrets; use a clean environment. There is
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

The included tests check manifest consistency, stdio initialization, tool discovery,
input validation, provider-specific result retrieval, independent status reporting,
and selected task lifecycle cases using simulated CLIs and temporary data.
They make no provider inference calls.

These checks passed for this repository preparation. Live inference, authentication,
provider billing behavior, all cross-process failure cases and full worker lifecycle are **not covered**
by the included tests. Earlier local setup claims are not presented as a portable
release test suite.

## License

[MIT](LICENSE), copyright 2026 Farhan Shaikh.
