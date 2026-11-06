# Architecture

How Gitling fits together. For *why* each choice was made, see `docs/decisions/`.

Gitling is **local-first**: the app runs on the device and calls `api.github.com` directly. The token
(encrypted), the design and the saved data cache live on the device. The one server, a Cloudflare Worker, serves
the static app and exchanges the OAuth code for a token, and stores nothing. The planned push notifications
(decision 0009) would be the first opt-in exception.

## Layers

```
┌──────────────────────────── apps/app (Expo) ─────────────────────────────┐
│ src/app/*            screens (Expo Router routes)                        │
│   ↓ uses                                                                 │
│ src/ui, src/features presentational components, read design tokens       │
│ src/data/queries.ts  TanStack Query hooks  ──┐                           │
│ src/design           DesignProvider (tokens) │                           │
│ src/session          SessionProvider ── api ─┤                           │
└──────────────────────────────────────────────┼───────────────────────────┘
                                               ↓
┌──────────── packages/github ────────────┐   ┌──────── packages/design ────────┐
│ api.ts     every endpoint, typed        │   │ schema.ts  Design (zod)          │
│ client.ts  auth header, ETag/304 cache, │   │ signal.ts  Signal skin palettes  │
│            errors, rate limit, paging   │   │ tokens.ts  Design → tokens,      │
│ mock.ts    sample data, same paths      │   │            contrast fit()        │
│ auth.ts    PKCE, state, exchange        │   │ share.ts   GITLING1.<base64url>  │
└─────────────────────────────────────────┘   └──────────────────────────────────┘
           ↓ HTTPS (from the device)                     ↑ also used by
      api.github.com                               apps/extension (desktop)
```

Dependency direction is one way: screens → hooks → `api` → `client` → network. Packages never import from
`apps/`. `packages/*` have no React Native imports, so they run in Node tests, the extension and the worker.

## Data

- `createClient(session)` returns a transport. `session` is `{kind:'sample'}` (in-memory sample data, no
  network) or `{kind:'token', token}`.
- `createApi(client)` wraps every endpoint Gitling uses. Paths exist only in `api.ts`, and `mock.ts`
  answers the same paths, so sample mode can't drift from the real API. `test/api.test.ts` calls every
  endpoint against the sample data.
- **Caching:** TanStack Query caches in memory per screen. The client also keeps an ETag cache (an LRU of
  300 entries), so refetches that come back 304 don't count against GitHub's rate limit.
- **Saved cache** (`src/data/persist.ts`, rules in `src/data/cachePolicy.ts`): signed-in lists and screens are also
  saved on the device (IndexedDB on web, AsyncStorage on phones) for 24 hours, so a reopened app shows them at once
  and refreshes in the background.
  - It never saves sample data, file contents, PR diffs or review threads.
  - It's removed on sign-out.
  - It isn't encrypted (only the token is), so it's private repo data at rest on the device.
  - Change the `buster` in `_layout.tsx` when a saved data shape changes.
- **Polling:** notifications refetch at GitHub's `X-Poll-Interval` (usually 60 s).
- **Pagination:** list endpoints return `{items, next}` from the `Link` header (`useInfiniteQuery`).
  Comments and PR files follow up to 5 and 3 pages.
- **Errors:** `GitHubError {status, message}` with readable messages for these cases:
  - offline
  - 401
  - rate limit, including minutes until reset
  - 404

  A 401 on any query signs the user out and shows a notice (`SessionProvider`).
- **Markdown:** the app renders markdown *source* (`issue.body`, README, `.md` files) with `marked`'s lexer
  into React Native views (`src/ui/Markdown.tsx`). React Native can't render GitHub's HTML. Relative links and
  images resolve against the repo, `@user` and `#123` become in-app links, and `github.com` links open
  Gitling screens when one exists.

## Code and reviews

- **Syntax colors:** `src/ui/Code.tsx` runs highlight.js core with about 25 languages, each imported one by
  one. Its HTML output is parsed into lines of segments, and the colors come from design tokens (keyword =
  accent, string = ok, number = wait, comment = dim, type = merged). Files over 3,000 lines skip
  highlighting. It's used by the file viewer and markdown code fences.
- **Reviews:**
  - `packages/github/src/diff.ts` turns a PR file's `patch` into lines with old and new line numbers.
    `anchorFor()` gives the `{line, side}` a review comment needs (deletions LEFT, everything else RIGHT).
  - Line comments collect as drafts in the thread screen, then go out in one `submitReview` call with the
    verdict. GitHub doesn't allow approving or requesting changes on your own PR, so the UI only offers
    Comment there.
- **Review threads** (`docs/decisions/0010`, contract in `docs/plans/review-threads-contract.md`):
  - `threads.ts` `groupThreads()` turns REST review comments (`in_reply_to_id`) into threads and merges the
    GraphQL `reviewThreads` state (resolved, outdated, permissions) by the root comment's `databaseId`.
    If GraphQL fails, threads still show, just without resolved state.
  - Replies go to the thread root (`replyToReviewComment`); Resolve/Unresolve are GraphQL mutations through
    `client.graphql()`.
  - Multi-line comments: long-press a diff line, tap the last line (same hunk). Drafts carry `start_line`/`start_side`.
  - Suggestions: `suggest.ts` parses ```` ```suggestion ```` blocks, checks them (`checkSuggestion`, plain reasons)
    and applies line edits (`applyEdits`, keeps CRLF and the final newline).
  - Applying (`apply.ts`, `api.applySuggestions`): GitHub has no API for it, so Gitling commits itself with
    the Git Data API on the PR's head repo: read each file at `head.sha`, verify the original lines still
    match the comment's `diff_hunk`, build a tree (keeping each file's mode), commit with `Co-authored-by`
    lines, then move the branch with `force:false` (a moved branch is refused, never overwritten).

## Routes (`apps/app/src/app`)

| Path | Screen |
|---|---|
| `/` `(tabs)/index` | Home: status instruments, tiles, needs-you, feed, inbox, recent |
| `/feed` | Feed (`received_events`, or your own events) |
| `/inbox` | Notifications with swipe triage |
| `/repos` | Your repos / starred |
| `/studio` | Design editor (theme, tabs, sections, tiles, share codes, save/open design files, replay the tour) |
| `/welcome` | First run from `/` only: install (phone browsers) → sign in → setup tour; `?replay=1` is the tour alone (see Design system) |
| `/repo/[owner]/[name]` | Repo home: stats, star, Code/Issues/PRs, README |
| `/repo/[owner]/[name]/tree?path&ref` | Directory listing, branch picker |
| `/repo/[owner]/[name]/blob?path&ref` | File viewer (syntax colors, line numbers; markdown preview), branch picker |
| `/repo/[owner]/[name]/list?kind=issues\|pulls` | Paged open/closed list |
| `/thread/[owner]/[repo]/[number]` | Issue or PR: timeline (comments + reviews), files/diff with line comments, checks, comment, close, merge (method), review (comment / approve / request changes) |
| `/user/[login]` | Profile and repos |
| `/search?q&kind&title` | Search issues/PRs/repos |
| `/tile/[id]` | Tile editor |
| `/ask` | "Ask" tile prompt |
| `/account` | Sign in/out, install app, Authenticator row |
| `/authenticator` | Two-factor codes for GitHub (local only; works signed out) |
| `/auth/callback` | OAuth return (web) |

Build hrefs with `routes.*` from `src/lib/links.ts`.

## Sign-in (OAuth App + PKCE + worker)

```
App                                   Worker (services/edge)                  GitHub
───                                   ──────────────────────                  ──────
createPkce(), nonce, returnTo
state = nonce.base64url(returnTo)
→ github.com/login/oauth/authorize?client_id&redirect_uri=<worker>/auth/callback&state&code_challenge(S256)
                                                                    user approves
                                      ← GET /auth/callback?code&state ────────┘
                                      returnTo from state, must match ALLOWED_RETURN
                                      (exact origin for http(s), scheme for gitling://)
← 302 returnTo?code&state
completeSignIn: nonce must match the
pending one (sessionStorage on web,
memory on native), ≤10 min old, single use
POST /auth/exchange {code, code_verifier} →  + client_secret →  /login/oauth/access_token
                                      ← {access_token, scope}
tokenStore.set(token); GET /user to validate
```

- The OAuth App has **one** callback URL: `<APP_URL>/auth/callback` (same Worker that serves the app). Web origins (localhost, Vercel,
  other hosts) and native (`gitling://`) all work through the worker's allowlist, so adding a host is a
  config change, not a GitHub change.
- The worker stores nothing. CORS on `/auth/exchange` only allows allowlisted origins. Native requests send
  no Origin header and are allowed.
- **Token storage:**
  - Native: Keychain or Keystore (`expo-secure-store`).
  - Web: IndexedDB, AES-GCM encrypted with a non-extractable WebCrypto key. The M1 plain localStorage token
    migrates on first read.
- **Fallback:** paste a classic PAT on the Account screen. It's always available.
- **Tests:**
  - `services/edge/test` covers the allowlist, redirect, exchange, CORS and errors.
  - `packages/github/test/auth.test.ts` covers PKCE, state and exchange.
  - `scripts/e2e-signin.mjs` runs the whole browser flow with GitHub faked.

## Authenticator (two-factor codes)

Gitling makes the TOTP codes (RFC 6238) GitHub asks for at sign-in, so people don't need a second app.
Plan and decisions: `docs/plans/authenticator.md`; how to use it: `docs/AUTHENTICATOR.md`.

- **Local only.** Codes are computed on the device; nothing goes over the network, and it works signed out.
- **Math:** `packages/github/src/totp.ts`: base32, SHA-1/HMAC and TOTP in plain TypeScript (Hermes has no
  `crypto.subtle`), and `parseOtpInput()` for a pasted setup key or `otpauth://totp/…` link. Only SHA-1, 6–8
  digits and 10–300 s periods; anything else is refused with a sentence.
- **Storage:** `apps/app/src/session/vault.ts` `createVault(name, { strict })`, the same vault as the GitHub token
  (Keychain/Keystore on native; AES-GCM with a non-extractable WebCrypto key in IndexedDB on web) under its own
  name (`otp`) and its own key. Signing out clears the token vault and the saved cache, never this one.
- **Store:** `apps/app/src/authenticator/store.ts`: `useOtpAccounts()` (a module-level list shared by every
  screen; duplicate secrets refused) and `useTotp(account)` (code and seconds left, re-rendered on each new second).
  The vault is strict (a failed save or unreadable data is an error). Every change runs inside a Web Lock
  (`gitling-otp`, across tabs), re-reads the vault, refuses if anything saved can't be read in full, saves, then
  updates the list and tells other tabs to re-read over a `BroadcastChannel`.
- **Screen:** `src/app/authenticator.tsx` (`routes.authenticator`, a row on Account): add from a key or link,
  big code in the design's number style, countdown bar, copy, rename, two-tap remove.
- Secrets never go into design files, share codes, logs or the query cache. No export in v1.
- **Tests:** `packages/github/test/totp.test.ts` (RFC vectors, parsing, refusals); `scripts/e2e-authenticator.mjs`
  checks codes against `node:crypto` with a fixed clock, and searches all browser storage for the plaintext secret.

## PWA

- `expo export --platform web` produces a single-page app in `apps/app/dist`. Then `scripts/pwa.mjs` runs:
  - It adds manifest, icon, theme and `viewport-fit=cover` tags to `index.html`. Expo's `single` output has no
    HTML template.
  - It writes `sw.js`. Its cache name is the hash of the build's files, and it precaches the build.
  - It preloads the 7 font files and adds an HTML splash (`#gitling-splash`, plain HTML and CSS, no script) that
    shows from the first paint; `src/app/_layout.tsx` fades it out once the app has drawn (or the error screen has).
- **One bundle on web** (`app.json`: `["expo-router", { "asyncRoutes": { "web": false } }]`). Expo Router's
  default splits every screen into its own file, fetched on first visit after the layout files: the live site
  showed ~3 s of black at startup and a wait on each new screen. One ~590 KB (gzip) bundle loads with the fonts
  in parallel instead. `npm run smoke` checks: splash removed, fonts preloaded, no code fetched when changing
  screens.
- **Service worker behaviour:**
  - Navigations are network-first, falling back to the cached shell.
  - Same-origin static files are cache-first, looked up across the current build's cache and the two
    previous builds' caches, so an app left open during a deploy can still load its own code chunks.
  - It never touches api.github.com.
- `src/pwa/register.ts` registers the worker (production only) and captures `beforeinstallprompt`. Account
  shows "Install app" (Chrome/Edge/Android) or Add-to-Home-Screen steps (iOS).
- **Hosting:** production is one Cloudflare Worker (`services/edge`).
  - Static assets serve the app, with SPA fallback; `_headers` sets caching and security headers.
  - Only `/auth/*` and `/health` run Worker code, so the app and sign-in share one origin.
  - `vercel.json` is kept as an alternative host.

  See `docs/DEPLOY.md`.
- **Install sheet** (`src/pwa/InstallSheet.tsx`, rendered once in the root layout) asks phone browsers to install
  Gitling:
  - Android/Chrome/Edge: an **Install** button that opens the browser's own dialog (the saved
    `beforeinstallprompt`).
  - iPhone/iPad: the two Safari taps, Share → Add to Home Screen.
  - Other phone browsers: where the menu keeps "Install app".
  - It never shows on desktop, inside the installed app, during the welcome tour or sign-in, or for 14 days after
    "Not now" (`gitling.install.dismissed`). Account → Install app is always there.
  - Tested in `e2e:onboarding` with iPhone and Pixel emulation.

## Design system

- The user's **Design** is one versioned JSON document, validated with zod. It holds:
  - theme: accent, background, number style, tile style, density, text scale
  - tab list
  - home sections
  - tiles
- `resolveTokens(design)` turns it into colors, fonts, spacing and scale. `fit()` adjusts accent and tile
  colors until they reach a minimum contrast on the chosen background.
- `DesignProvider` persists the Design to AsyncStorage (`gitling.design.v1`) with an undo stack.
- Share codes (`GITLING1.…`) move a design between phone and the desktop extension.
  Share links (`<app>/studio?import=<code>`) open Studio with a live preview, and the person picks
  "Apply this design" or "Only the look".
- **Presets** (`packages/design/src/presets.ts`) are curated themes that change only `theme`.
  `TokensScope` (in `DesignProvider`) lets a subtree render with another design's tokens. That's how the
  preset cards and share previews draw.
- **Reordering** (tiles, home sections, tabs) uses `src/ui/Reorder.tsx`: a drag grip that works with touch
  and mouse. Screen readers get Move up / Move down actions instead.
- **Design files** (`*.gitling.json`, `packages/design/src/file.ts`, reference in `docs/DESIGN-FILE.md`) wrap the
  same Design document with `format`/`formatVersion`. `readDesignText` is the one reader for every box that takes
  a design: a file, a bare design, a code or a link. It salvages partly invalid files and names what it dropped.
  `apps/app/src/lib/designFile.ts` handles download and file picker on web, and the share sheet on native.
- **First run** (`src/app/welcome.tsx`, `src/onboarding/OnboardingProvider.tsx`, `useFirstRun()`), in order:
  1. **Install** (phone browsers only, not inside the installed app): the browser's install dialog or the steps for
     that browser. First because on iPhone the installed app has its own storage, so signing in before installing
     means signing in twice. "Continue in the browser" passes it (`gitling.onboarding.install`) and also snoozes
     the install card.
  2. **Sign in** with GitHub, or "Look around first" (`gitling.onboarding.signin-skipped`): sample data, and the
     tour waits until they sign in.
  3. **Tour**, once signed in: look (with "Already have a setup?" to load a file or code) → Home sections → tab
     bar with a few tips. Same controls as Studio (`src/features/studio/controls.tsx`), editing the live design, so
     there's no separate "apply" step. Studio → Share → Replay opens it alone.
  - Someone is "new" on `/` when they haven't finished or skipped the tour (`gitling.onboarded.v1`) and have no
    saved design. People from before the tour have a saved design and skip all of it.
  - A reload mid-way brings it back (`gitling.onboarding.pending`).
  - The provider sits outside DesignProvider so it reads storage before the default design is first saved.
  - Tests that check screens set `gitling.onboarded.v1` first.
- New skins add palettes in `packages/design` and keep the same token names.

## Desktop extension

- Manifest V3. It overrides GitHub's own Primer CSS variables (`--bgColor-default`, `--fgColor-accent`,
  `--fontStack-system`, …) through CSSOM `setProperty`, which survives GitHub's class-name churn and CSP.
- Fonts ship in the extension. Settings live in `chrome.storage`, and changes apply live to open tabs.
- It has no login: it restyles the GitHub session the browser already has.

## Phase 2 hooks (not built)

- **Push:** `services/edge` gains `/push/register` and a cron poller that reads `/notifications` with
  `If-Modified-Since` and sends Web Push / Expo push. `SessionProvider` already centralizes the token.
- **Design sync:** a private gist on the user's own account.
