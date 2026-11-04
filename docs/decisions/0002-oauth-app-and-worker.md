# 0002 — OAuth App + PKCE + stateless worker

**Context.**
- The inbox needs `GET /notifications`. GitHub documents that endpoint as unavailable to fine-grained PATs
  and GitHub App tokens. OAuth App and classic tokens work.
- GitHub's token endpoint needs the client secret and blocks browser CORS. A PWA can't call it directly.
- Native apps can't receive https redirects without extra setup, and an OAuth App takes only one callback
  URL.

**Decision.** Use a GitHub OAuth App with PKCE (S256). A Cloudflare Worker (`services/edge`) is the single
callback URL. It does two jobs:
- It reads the app's return target from `state`, checks it against `ALLOWED_RETURN` (exact origin for
  http(s), scheme for `gitling://`), and redirects there with the code.
- `/auth/exchange` adds the secret and swaps the code for a token.

The worker stores nothing.

**Consequences.**
- One OAuth App serves every web host and native. Adding a host is a worker config change.
- A forged or replayed callback fails because the nonce in `state` must match the device's pending
  sign-in. An open redirect is impossible because of the allowlist.
- Classic PAT paste stays as the no-infrastructure fallback.
- Phase 2 push reuses the same worker.
