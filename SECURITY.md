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
- This release strips several API-key and provider-override environment variables,
  but this is not a complete security audit or a guarantee against every fallback.
  Keep paid extra usage disabled and inspect provider usage settings yourself.
- Retrieved pages and worker answers are untrusted data. Review them before taking
  consequential actions.

Do not post credentials, authentication files or private job records in issues.
Use GitHub private vulnerability reporting if enabled; otherwise open a minimal
issue requesting a private reporting channel without including sensitive details.
