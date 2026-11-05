# Context: the owner, the story so far, and how to work here

Read this together with `AGENTS.md` (rules and commands) and `docs/STATUS.md` (current state). It holds
what code can't tell you: who this is for, what they like and dislike, what already happened, and the
environment's quirks. **No secrets live in this repo.**

## The owner

- GitHub **vassu-v**. Commits use author `vassu-v <shoryavardhaans2@gmail.com>`; the owner chose to keep that
  email public.
- Writes casually and fast ("gng", "bro", typos). Answer in **plain, friendly English**:
  - Short sections, the result first, then what they need to do, as numbered steps.
  - Explain anything technical as what it means for them, not how it works inside.
- Wants things **done end-to-end**, not just advice: build it, test it, push it, deploy it. Then report
  honestly what was verified and what wasn't.
- Wants a **sturdy, sound architecture** and this repo kept as the source of truth, so any agent session
  can continue (that's why this file exists).

## What they want: the product

**Gitling** is a GitHub client they design themselves.
- **Why:** they find GitHub's own mobile interface awful, confusing and plain.
- **Core idea:** customization. Themes, tab bar, home sections, and shortcut tiles where "different links go
  to different stuff" (search, repo, user, file, inbox filter, URL, ask-prompt).
- **Platform:** they said "you pick". We chose one Expo codebase: PWA now, native later
  (`docs/decisions/0001`).
- **Feed:** they asked for one (`/feed`).
- **Desktop:** they asked for "our CSS on top of github.com", which became the browser extension in
  `apps/extension`.
- **Push notifications:** wanted later, with "a clean plan and structure from day 1" (`PLAN.md` § 7,
  phase 2).
- **Hosting:** all on Cloudflare; they said "prod on cloudflare itself". Vercel config is kept only as a
  fallback.
- **Later ideas they raised:** a "works with GitHub" badge (done as an independent "built for GitHub"
  badge plus a not-endorsed note; never imply GitHub endorsement), and applying to the GitHub Developer
  Program once it's live.

## Design taste (important; they push back hard on this)

- **They reject "AI slop":**
  - They called the first prototype "very sloppy".
  - They called the minimal **Ledger** direction "ai slop minimalism".
  - Don't ship generic, template-looking UI.
- **They liked Telemetry and Quiet Pro.** The approved skin is **Signal**, a hybrid of the two. It has:
  - dot-matrix (Doto) instrument numbers, tick-bar status strips, Geist and Geist Mono
  - graphite or black or paper backgrounds, a glass tab bar
  - calm density, "make sure no stress"
- **Mockups:** `design/` holds them (`directions.html`, `hybrid.html`, PNG boards).
- **Research:** they want real references (Mobbin, Dribbble, Pinterest), not invented UI.
- **Rules:** new screens follow Signal and use tokens only (AGENTS.md rule 3). If a design change is big,
  show a mockup first.
- **Skins:** one skin now; more skins later through the same token names.

## Timeline

1. **Prototype:** the HTML prototype in `prototype/`. It was rejected as sloppy, which led to research and
   the three directions, and then the Signal choice.
2. **M1 skeleton:** pushed as the first commit to `vassu-v/gh-restyle`. The owner created the repo; the
   session couldn't create repos.
3. **M2 + M3 + PWA (one push):**
   - typed `api.ts` layer, PKCE sign-in
   - repo, code, list, profile and thread screens, markdown renderer
   - PWA, CI, agent docs
   - CI passed on GitHub on the first run
4. **Hosting moved to one Cloudflare Worker** serving the app and sign-in (`docs/decisions/0008`).
5. **First live deploy** came up blank. The cause: Cloudflare's asset server loops forever on `%40` (`@`) in
   paths, so the fonts never loaded. `scripts/pwa.mjs` now renames `@` folders to `_at_`, and the smoke test
   now fails on broken same-origin requests.
6. **Studio polish (M4):** preset gallery, drag-to-reorder, share links with a live preview.
   The same push also shipped: syntax colors, a branch picker, full PR reviews (line comments, request
   changes), and the extension cleanup (450 KB → 6 KB content script, readable buttons, themed signed-out
   header).
7. **GitHub OAuth App created** by the owner, and the client secret was set on the Worker. `/health` now
   reports `configured:true`. A live click-through reaches GitHub's login page with the correct parameters.

8. **Review threads (2026-11-05):** built by a lead agent plus worker agents (package, app screens, e2e,
   extension check) against a written contract (`docs/plans/review-threads-contract.md`). The owner asked for a
   **pull request** for this one, so it lives on `feat/review-threads` instead of being pushed to `main`.
   Same session: `npm run e2e:extension` added; it found and fixed share links not working in the popup.
   Note: GitHub redirects `facebook/react` to `react/react`.

## Live setup (non-secret facts)

| Thing | Value |
|---|---|
| App + sign-in URL | https://gitling.truckcoding.workers.dev |
| Health check | `/health` → `{"ok":true,"configured":true}` |
| Cloudflare account ID | `d379d74e43d51e6b491e8b67edfecf91` (subdomain `truckcoding.workers.dev`) |
| Worker name | `gitling` (`services/edge/wrangler.toml`) |
| GitHub OAuth App | "Gitling", client ID `Ov23likikLApWz5YvJtj`, callback `https://gitling.truckcoding.workers.dev/auth/callback` |
| Worker secret | `GITHUB_CLIENT_SECRET`, set in the Cloudflare dashboard; it is **not** in this repo or any env file |
| Repo | https://github.com/vassu-v/gh-restyle, branch `main` (we push to `main` directly; the owner asked for that) |

### Redeploy from a session

```bash
export CLOUDFLARE_API_TOKEN=…   # from the environment's secrets, never from chat or files
export CLOUDFLARE_ACCOUNT_ID=d379d74e43d51e6b491e8b67edfecf91
npm run deploy                  # builds with wrangler.toml vars, deploys, prints the URL
SMOKE_URL=https://gitling.truckcoding.workers.dev npm run smoke   # then verify live
```

If `CLOUDFLARE_API_TOKEN` isn't set in the session, ask the owner to add it under the environment's
**Network secrets**, then start a new session. Env changes only reach new sessions. Don't ask them to paste
it in chat.

## Bug found late: the service worker never registered

Until 2026-11-04 the PWA's offline support was silently off. `register.ts` waited for `window` 'load', which
had already fired by the time the lazily loaded app code ran. It now registers immediately when the page is
already loaded. The install prompt is captured by an inline script in `index.html`, and `npm run smoke` now
fails if the service worker doesn't register or the app doesn't open offline.
A second cause showed up live: library icons named `…@2x.png` hit Cloudflare's `@` redirect loop, and one
failed file aborted the whole service-worker install. `scripts/pwa.mjs` now leaves any path with `@` out of
the precache. Verified live: the worker activates in about 5 s and the app opens offline.

## Extension stress test (2026-11-05)

`npm run stress:extension` loads the unpacked extension on 26 kinds of github.com pages in all three
backgrounds. It compares text contrast against the same pages without the extension and saves screenshots.

The first run found two problems:
- **Unreadable code in dark looks** (180 spots on one file page). Signed-out GitHub is in light mode, so its
  syntax colors were light-tuned. The content script now sets GitHub's own `data-color-mode` to match the
  design.
- **White text on the pastel accent** (skip link, badges). `--bgColor-accent-emphasis` is now deepened to
  4.5:1.

Gist's classic header was fixed afterwards. The final result is 0 new problems. Signed-in pages are
untested, because they need the owner's own browser.

## Incident: secret wiped by a deploy

- The owner added `GITHUB_CLIENT_SECRET` in the Cloudflare dashboard as a plain-text **variable**, not a
  **Secret**.
- The next `npm run deploy` replaced the dashboard variables with `wrangler.toml` [vars], so the secret
  disappeared and `/health` went back to `configured:false`.
- **Fixes:**
  - `keep_vars = true` in `wrangler.toml`.
  - `deploy.mjs` now warns when the live Worker isn't configured.
  - The owner re-adds the value as type **Secret**, which deploys never touch.
- **After any deploy,** check `/health` says `configured:true`.

## Security history and rules

- The owner once pasted a Cloudflare API token and R2 keys into chat. They were told to **roll the token**
  and **delete the R2 key**. Assume that token is dead. If a deploy fails with an auth error, that's why:
  ask for the new token through environment secrets.
- **Never ask for secrets in chat.** Use environment secrets, `wrangler secret put` (it prompts), or the
  Cloudflare dashboard.
- **Never commit:** tokens, `.env.local`, or the client secret. `.gitignore` covers `.env*` except
  `.env.example`.

## Environment quirks (cloud sessions)

- **GitHub API through the session proxy** only allows the attached repo (`vassu-v/gh-restyle`).
  - For live API tests use `LIVE_REPO=vassu-v/gh-restyle LIVE_REPO_ONLY=1`.
  - Node also needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
  - The sandbox's own `GITHUB_TOKEN`/`GH_TOKEN` are invalid; don't send them.
- **Playwright:** pinned to `1.63.0`, matching the browser preinstalled in cloud sessions. Don't upgrade it
  casually, and don't run `playwright install` in the cloud sandbox.
- **Blocked actions:** the auto-mode safety check blocks domain, DNS and subdomain changes (for example
  creating a `workers.dev` subdomain through the API). Ask the owner to do those in the dashboard.
- **New `workers.dev` hostnames:** they need about a minute for TLS before they answer.
- **Expo packages:** import fonts and icons per file: `@expo-google-fonts/x/400Regular`,
  `lucide-react-native/icons/<name>`. The package index pulls in everything (the web build went from
  9.4 MB to 3.1 MB after this fix).

## Open to-dos (most useful next)

1. **Owner tests real sign-in** and sends screenshots of anything off. Inbox, Feed, Search and Profiles
   haven't been exercised with a real account yet.
2. **Studio follow-ups:** saved custom presets, custom accent picker. Studio polish (M4) shipped: presets, drag reorder, share links.
3. **Push notifications (phase 2):** the plan is in `PLAN.md` § 7; the owner asked how it would work and was shown that plan.
4. **Review threads:** built on `feat/review-threads` (replies, resolve, multi-line, suggestions). Owner to try on a real PR.
5. **Extension:** optionally slim the popup (zod).
6. **Phase 2:** design sync through a private gist; native builds with EAS.
7. **Optional:** GitHub Developer Program application, and a custom domain in place of `workers.dev`.
