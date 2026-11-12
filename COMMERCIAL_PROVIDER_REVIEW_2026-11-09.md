# Provider and commercial release review — 2026-11-09

Reviewed PR #1 at 61144d27, its current source and prior notes. Actions run 42646310259 passed on Ubuntu and Windows with Node 20 and 24. This is a documentation-only review, not a legal opinion, provider authorization, or release approval. Source pages may change; recheck before any distribution.

## Anthropic: existing integration is a sale blocker

The bridge starts the official Claude Code CLI with a dedicated subscription configuration and accepts Claude subscription sign-in, not API-key mode. Anthropic's current guidance for developers building a product for others says to use API-key authentication via Claude Console or a supported cloud provider. It also says some third-party usage may be drawn from enabled usage credits, at the user's expense. The exact treatment of this bridge's use of the native CLI is not independently confirmed; native CLI invocation does not by itself establish permission to distribute this integration or avoid charges. Source: https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account (reviewed 2026-11-09).

Decision: do not sell or advertise the Claude subscription integration as approved. Before commercial release, obtain clarification for this exact implementation or design an authorized alternative. Any API approach would potentially cost money and is not authorized for use in this task. Do not enable or test paid API usage without owner approval.

## OpenAI: assess actual connection route before product or pricing decisions

The current code invokes the installed Codex CLI and checks ChatGPT sign-in; it does not itself implement a separately established Sign in with ChatGPT (SIWC) flow. OpenAI's SIWC terms effective 2026-11-04 apply to applications integrating or using SIWC, and their ChatGPT Plan scope has conditions including user-controlled runtime, consent for background use, connection-specific use, and access to plan usage without paying or upgrading the application. It also prohibits pooling or reselling plan usage. Source: https://openai.com/policies/sign-in-with-chatgpt-terms/ (reviewed 2026-11-09). Do not assume these particular SIWC terms automatically apply to this CLI invocation, nor assume they authorize or prohibit it: determine applicable terms and the supported distribution route for this exact integration before launch. A paid-only product could conflict with the no-charge condition if that scope applies. No partner status or approval has been verified.

If a ChatGPT app, connector or plugin is distributed, assess applicability of OpenAI's separate App Developer Terms, including privacy notices, security and submission obligations: https://openai.com/policies/developer-apps-terms/ (reviewed 2026-11-09). Marketplace eligibility and fees have not been verified for this product or route.

## Next steps and evidence limits

1. Describe the exact data flow, user, auth route, intended marketplace, background usage and pricing for each provider; seek provider clarification without sharing credentials or private job records.
2. Choose a supported product and authentication model; consider removal or separate opt-in of integrations until their terms and cost controls are resolved. Do not implement or call a paid service without approval.
3. Validate actual Windows clients, independent security/privacy review, usage/billing behavior, process recovery and marketplace packaging before any release. Successful simulated CI is not evidence of provider compliance or billing behavior.

No code, authentication settings, subscriptions, provider usage, external messages or releases were changed in this review. This branch remains a draft.
