# 0008: Host the app and sign-in on one Cloudflare Worker

**Context.** The PWA needs a static host and sign-in needs a small server. With two hosts (Vercel plus a
Worker) the maintainer manages two accounts, and the app makes cross-origin calls.

**Decision.** One Worker (`services/edge`, name `gitling`) uses Workers Static Assets to serve
`apps/app/dist`, with `not_found_handling = "single-page-application"`. Only `/auth/*` and `/health` run
Worker code (`run_worker_first`). `scripts/deploy.mjs` builds the app from the same `wrangler.toml` vars and
deploys, so settings live in one place.

**Consequences.**
- One account, one deploy, one origin. CORS only matters for local dev.
- Static requests never invoke Worker code, which keeps them free on the free plan.
- `vercel.json` stays as an alternative.
- The Cloudflare Pages `_redirects` file was dropped, because Workers assets handle the SPA fallback
  through config.
