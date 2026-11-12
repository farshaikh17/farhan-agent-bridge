# Security and privacy

The bridge is a local stdio MCP server, not a public HTTP service. Do not expose
its input or runtime directory to untrusted users or a network service.

- Job prompts, answers, account metadata and usage are saved locally in plaintext.
  Keep the runtime directory outside this repository and do not commit it.
- Dedicated CLI authentication directories contain sensitive login state. Never
  upload them, a browser profile, or an archive of the runtime directory.
- Codex uses a read-only sandbox. Read-only is not a guarantee that unrelated
  files cannot be read. Only delegate tasks and context you intend to share.
- Claude is limited to supplied text and, when explicitly enabled, public web
  search/fetch. Do not include private material in prompts sent to work accounts.
- Child processes inherit most environment variables. Variables containing credentials
  or other secrets may be accessible to provider CLIs and their subprocesses. Run
  the bridge from a clean environment without unrelated secrets.
- This release strips NODE_OPTIONS, NODE_PATH, selected provider settings, and selected AWS, GitHub, Google, Azure and Cloudflare credential variables,
  but this is not a complete security audit or a guarantee against every fallback.
  Keep paid extra usage disabled and inspect provider usage settings yourself.
- Windows timeout handling locates taskkill in the configured system directory rather than PATH.
  The system-directory environment setting must itself be trusted.
- Retrieved pages and worker answers are untrusted data. Review them before taking
  consequential actions.

Do not post credentials, authentication files or private job records in issues.
Use GitHub private vulnerability reporting if enabled; otherwise open a minimal
issue requesting a private reporting channel without including sensitive details.
