# Gitling — plan

A GitHub client for your phone whose interface you design yourself.

## 1. Decisions

| Question | Decision | Why |
|---|---|---|
| Platform | **One Expo (React Native + TypeScript) codebase.** It ships first as an installable web app (PWA) and later as iOS/Android apps. | You can use it on any phone without an app store. Real native builds come later from the same code, with no rewrite. |
| Routing | Expo Router (file-based) | Its deep links work the same on web and native, so a tile can open `gitling://repo/owner/name`. |
| Data | A small typed GitHub client plus TanStack Query (cached, persisted, offline-readable) | Lists render instantly from cache. Conditional requests with ETag/304 don't count against GitHub's rate limit. |
| Sign-in | A GitHub **OAuth App** plus a tiny auth worker on Cloudflare (free tier) | The notifications (inbox) API needs an OAuth or classic token; fine-grained and GitHub App tokens are documented as unsupported there. GitHub's token exchange needs the client secret and blocks direct browser calls, so a ~40-line worker does that one step. |
| Push notifications | **Phase 2.** It reuses the same worker; the slot for it exists from day one. | GitHub doesn't push to third-party apps, so a server has to poll for you. |
| Design | **Signal** skin (a hybrid of Telemetry and Quiet Pro), with more skins later. Decided from real references (see `design/`). Mockups get approved before any screen is built. | So it doesn't look generic. |

## 2. How GitHub connects

```
Phone (Gitling)                Auth worker (Cloudflare)              GitHub
───────────────                ────────────────────────              ──────
"Sign in with GitHub"  ─────────────────────────────────────▶  github.com/login/oauth/authorize
                                                                (scopes: repo notifications read:user,
                                                                 state + PKCE S256)
                       ◀──── redirect with ?code ────────────  user approves
POST /auth/exchange {code, verifier} ──▶  adds client_secret ──▶  /login/oauth/access_token
                       ◀──── {access_token} ─────────────────  token
Token stored on device only:
  web    → IndexedDB, encrypted with a device-bound WebCrypto key
  native → iOS Keychain / Android Keystore (expo-secure-store)
All API calls go straight from the phone to api.github.com. The worker never sees them.
```

- The worker stores nothing in phase 1. It only exchanges the code.
- There's an alternative sign-in for advanced users, or when the worker is down: paste a classic token.
- Signing out deletes the token on the device. A link explains how to revoke the app's access at github.com/settings/applications.

## 3. Repository layout

```
gitling/
  apps/app/                 Expo app (web/PWA + iOS + Android)
    app/                    routes: (tabs)/home, feed, inbox, repos, studio · repo/[owner]/[name]/… · pr/… · studio/…
    src/features/           feed, inbox, repo, pr, issue, code, search, studio, tiles, auth
    src/ui/                 primitives built only from design tokens (Text, Row, Pill, Sheet, TabBar…)
  packages/github/          typed REST client, ETag cache, rate-limit + X-Poll-Interval handling
  packages/design/          design schema (zod), presets, token resolver, contrast fixes, share codes
  services/edge/            Cloudflare Worker: /auth/exchange now; /push/* + cron poller in phase 2
  design/                   references, direction boards, approved mockups
  prototype/                the first HTML prototype (kept for reference)
```

## 4. Feed

- **Tab:** Feed sits between Home and Inbox. It can also appear as an optional "From your feed" section on Home.
- **Sources:**
  - **Following:** `GET /users/{you}/received_events`, which covers people you follow and repos you watch.
  - **You:** `GET /users/{you}/events`.
  - **Releases and Stars:** filters on the same events (`ReleaseEvent`, `WatchEvent`).
- **Rendering:**
  - Events are grouped by person and time ("lin starred 3 repositories").
  - Releases show the version in dot-matrix with the first line of the notes.
  - Pushes list up to 2 commits.
  - New repos get a card with a Star button.
- **Limits, stated honestly:** GitHub's API has no algorithmic "For you" feed and no trending endpoint, and the events API only returns the last 90 days (up to 300 events). Polling uses ETag, so unchanged results don't count against the rate limit.

## 5. Desktop: browser extension

- **What it is:** a Manifest V3 extension for Chrome, Edge and Firefox, in `apps/extension`, that restyles github.com itself.
- **No sign-in:** it uses the GitHub session you already have in the browser, and every GitHub feature keeps working.
- **How it styles:** it overrides GitHub's own **Primer design tokens** (`--bgColor-default`, `--fgColor-accent`, `--fontStack-system`, …) instead of class names, so it survives GitHub's UI updates. CSS variables are set through the CSSOM, which GitHub's Content-Security-Policy allows. Fonts and a few static rules ship in the extension's `content.css`.
- **Shared design:** it uses the same `@gitling/design` package. Paste a design code from the app into the extension popup and desktop matches the phone.
- **Later:** a Gitling shortcut bar on github.com built from your tiles, Safari via Xcode's web-extension converter, and the Chrome Web Store / Firefox Add-ons listing.

## 6. The customization model (the core of the app)

One versioned JSON document, the **Design**. Everything you can change lives in it:

```ts
Design = {
  version: 1,
  theme:  { preset, mode, accent?, font?, radius?, density?, surface?, iconWeight?, textScale? },
  nav:    { tabs: TabId[], style: 'floating' | 'docked' | 'minimal' },
  home:   { sections: { id, visible, options }[] },
  tiles:  Tile[]   // icon, color, style, size, target (deep link), badge
}
```

- It's validated with zod, so a broken share code can't crash the app.
- Share codes are the Design encoded as base64url.
- Planned: sync your Design across devices through a private gist on your own account, so no server stores it.
- Every UI primitive reads from resolved tokens. No screen hardcodes a color, radius or font.

## 7. Phase 2: push (planned, not built)

- `/push/register`: the device sends its push subscription (Web Push for the PWA; on iOS this needs the app added to the Home Screen) or an Expo push token (native), plus an encrypted GitHub token.
- A cron poller (each minute, respecting `X-Poll-Interval`) calls `/notifications` with `If-Modified-Since` and sends pushes for new threads, filtered by your rules (mentions, reviews, CI).
- Tokens are encrypted at rest. Revoking or signing out deletes them server-side.

## 8. Milestones

1. **M0 — Design direction.** Reference research → 3 directions as mockups → you pick one.
2. **M1 — Skeleton. ✅ Done.** Monorepo, Expo app (web/iOS/Android), design token engine, five-tab nav, sample-data mode. All screens run on sample data or a pasted token. The desktop extension v0 restyles github.com.
3. **M2 — Sign-in.** OAuth App + auth worker deployed, secure token storage, fallback token paste.
4. **M3 — Core GitHub.** Feed, inbox with swipe triage, repos, issues, PRs (conversation, files/diff, merge), code browser, search.
5. **M4 — Studio.** Presets, theme controls, tab/home editing, tile editor, share codes.
6. **M5 — Ship the PWA.** Install prompt, offline cache, icons, deploy to GitHub Pages / Cloudflare Pages.
7. **Phase 2.** Push notifications, gist sync, native builds (Android APK; iOS through TestFlight once there's an Apple developer account).

## 9. What you'll need to do (once, at M2)

1. Create a GitHub OAuth App at github.com/settings/developers → New OAuth App. I'll give you the exact callback URL.
2. Create a free Cloudflare account so the auth worker can be deployed, or let me deploy it if you give this session access.
