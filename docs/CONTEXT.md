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
   Note: GitHub redirects `facebook/react` to `react/react`. Merged to `main` as PR #1.
9. **Review pass + real-account testing (2026-11-05, PR #2, merged and deployed):** a local session on the
   owner's Windows machine, with a cloud session reviewing alongside.
   - Fixed the live one-tap sign-in loop, `javascript:` links, crashes, and every Windows script bug.
   - Added property-based fuzz tests (`tests/fuzz`), `npm run verify`, and a Windows CI job.
   - Signed in with the owner's real account (in their Chrome) and tried every feature on a private test repo,
     `vassu-v/gitling-test`. This found the slow "Committing…", the stuck merge status, and the broken sample
     tiles.
   - A security pass looked for leaks while signed in: token scoped to the API origin, Worker scope check,
     callback hardening, Trusted Types.
   - CodeRabbit's review comments were all fixed.
   - Afterwards the test sign-in was removed: signed out, and the OAuth grant revoked.

## Live setup (non-secret facts)

| Thing | Value |
|---|---|
| App + sign-in URL | https://gitling.truckcoding.workers.dev |
| Health check | `/health` → `{"ok":true,"configured":true}` |
| Cloudflare account ID | `d379d74e43d51e6b491e8b67edfecf91` (subdomain `truckcoding.workers.dev`) |
| Worker name | `gitling` (`services/edge/wrangler.toml`) |
| GitHub OAuth App | "Gitling", client ID `Ov23likikLApWz5YvJtj`, callback `https://gitling.truckcoding.workers.dev/auth/callback` |
| Worker secret | `GITHUB_CLIENT_SECRET`, set in the Cloudflare dashboard; it is **not** in this repo or any env file |
| Repo | https://github.com/vassu-v/gh-restyle, branch `main`. Small changes go straight to `main`; bigger work goes through a PR when the owner asks (PR #1 review threads, PR #2 review pass). Agents never merge; the owner does |
| Commit identity | AGENTS.md says `vassu-v <shoryavardhaans2@gmail.com>`; for PR #2 the owner chose `vassu-v <coderscode17@gmail.com>`. Ask which to use if unsure |
| Test repo | `vassu-v/gitling-test` (private): LF, CRLF, BOM and latin1 files, a test issue and PR, for trying writes with a real account. Ask before writing to any other repo |

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

- The owner has pasted Cloudflare API tokens and R2 keys into chat twice, the second time on 2026-11-05.
  They chose to keep using the second one ("I'll rotate when necessary"). Cloud sessions used it, at the
  owner's request, for the 2026-11-05 deploys (PR #1 and PR #2), passed only on the command line and never
  written to a file.
  - It isn't in the environment's secrets, so a new session won't have it.
  - If a deploy fails with an auth error, the token was rotated: ask the owner to add the new one as
    `CLOUDFLARE_API_TOKEN` under Network secrets, or to run `npm run deploy` themselves.
  - Mention rotation at most once; the owner doesn't want to be nagged.
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

## Environment quirks (local Windows sessions)

- **Line endings:** git has `core.autocrlf=true`, so checkouts come out CRLF. Scripted find-and-replace must
  allow for `\r\n`. When seeding test files whose bytes matter, clone with `-c core.autocrlf=false`.
- **Local sign-in:** `ALLOWED_RETURN` only lists the live site, so a local build can't do one-tap sign-in.
  Paste a token, or test sign-in on the live site.
- **Testing with the owner's account:** use Claude in Chrome (their Chrome, already signed in to GitHub) against a
  local build served on `localhost:8081`. Sign out and revoke the grant at github.com/settings/applications
  afterwards. The auto-mode safety check blocks merging a PR by click, so the owner merges.
- **Chrome HTTP cache:** GitHub gives a file's raw and JSON forms the same ETag, so the client fetches with
  `cache: 'no-store'`. Keep it.
- **Extension IDs on Windows:** Chrome hashes the path as UTF-16LE with the drive letter upper-cased (the e2e
  scripts do the same).

## Open to-dos (most useful next)

1. **Owner tries the live site on their phone:** one-tap sign-in (confirms the loop fix), install, offline, the
   Files tab with the keyboard open. Then send screenshots of anything off.
2. **Studio follow-ups:** saved custom presets, custom accent picker. Studio polish (M4) shipped: presets, drag reorder, share links.
3. **Push notifications (phase 2):** the plan is in `PLAN.md` § 7; the owner asked how it would work and was shown that plan.
4. **Review threads:** merged and tried live (comments, suggestions, apply, batch). Replies, resolve and
   multi-line ranges are still untried with a real account. Applying a suggestion takes ~8 s of sequential git API
   calls; some could run in parallel.
5. **Housekeeping:** the owner can delete `vassu-v/gitling-test` when done with it.
6. **Extension:** optionally slim the popup (zod).
7. **Phase 2:** design sync through a private gist; native builds with EAS.
8. **Optional:** GitHub Developer Program application, and a custom domain in place of `workers.dev`.
9. **Small product gaps the owner was offered (2026-11-05):**
   - a commits list (the repo's Commits tab still opens github.com)
   - syntax colors in diffs
   - the extension on the Chrome Web Store
10. **Recommended order shown to the owner:** phone check of the live site → push notifications (needs the
    owner's yes on Cloudflare's $5/month plan and on a server-held encrypted token, decision 0009) → native
    builds → Studio extras → the small gaps above. The owner hasn't picked yet.
