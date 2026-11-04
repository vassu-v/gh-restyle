# AGENTS.md — start here

Context for any coding agent (Claude Code, Codex, Cursor, …) or new contributor. Read in this order:

1. this file: rules and commands
2. `docs/CONTEXT.md`: the owner, their taste, the story so far, live deploy facts, environment quirks, open to-dos
3. `docs/STATUS.md`: what's done and how it was verified
4. `docs/ARCHITECTURE.md`: how it fits together; `docs/decisions/` explains why

Product plan and milestones: `PLAN.md`. Live app: https://gitling.truckcoding.workers.dev

## What this is

**Gitling** — a GitHub client for your phone whose interface you design yourself (themes, tab bar, home
sections, shortcut tiles that open any GitHub target). One Expo codebase ships as an installable web app (PWA)
now and iOS/Android apps later. A browser extension applies the same design to github.com on desktop.

## Map

```
apps/app/            Expo app (Expo Router, React Native, react-native-web). Has its own AGENTS.md about Expo.
  src/app/           routes (every file is a screen) — see ARCHITECTURE.md § Routes
  src/data/queries.ts  the only place screens get GitHub data (TanStack Query hooks over packages/github api)
  src/session/       sign-in (oauth.ts), token vault (tokenStore.ts), SessionProvider
  src/design/        DesignProvider: the user's Design document, persisted, with undo
  src/ui/            primitives (T, Panel, Row, Button, Screen, BackHeader…), Markdown, Code (syntax colors), Icon, Reorder
  src/features/      shared rows, tiles, inbox swipe, tab bar, repo/BranchPicker, thread/DiffFile + ReviewPanel
  src/lib/           links.ts (in-app routes + github.com URL → route), format.ts
  src/pwa/           service-worker registration + install prompt
  public/            copied into the web build: manifest, icons, _headers
apps/extension/      Manifest V3 extension; restyles github.com via Primer CSS variables
packages/github/     typed GitHub REST: client.ts (transport), api.ts (every endpoint), auth.ts (OAuth/PKCE), diff.ts (patch → line numbers), mock.ts (sample data)
packages/design/     Design schema (zod), Signal skin, token resolver, contrast fitting, share codes
services/edge/       Cloudflare Worker "gitling": serves the web app (static assets) + sign-in routes (phase 2: push)
scripts/             pwa.mjs (post-build), smoke.mjs (every screen), e2e-signin/studio/review.mjs, deploy.mjs
docs/                CONTEXT, STATUS, ARCHITECTURE, SETUP-SIGNIN, DEPLOY, decisions/
```

## Commands (from the repo root)

| Command | What it does |
|---|---|
| `npm install` | install everything (npm workspaces) |
| `npm run web` | dev server for the app (sample data unless signed in) |
| `npm run check` | **run before you say you're done**: typecheck (app + worker), lint, unit tests, extension build, web build |
| `npm test` | unit tests (vitest): packages/github, packages/design, services/edge |
| `npm run smoke` | after `build:web`: opens every screen in Chromium at phone size, fails on errors |
| `npm run e2e:signin` | full "Sign in with GitHub" flow in a browser with GitHub simulated (real worker code) |
| `npm run e2e:studio` | after `build:web`: Studio presets, drag-to-reorder, share links in a browser |
| `npm run e2e:review` | after `build:web`: PR review flow (line comments, request changes, timeline) in a browser |
| `npm run test:live` | read-only tests against the real api.github.com (`LIVE_REPO=owner/name`, optional `GITHUB_TOKEN`) |
| `npm run build:web` | `expo export` + `scripts/pwa.mjs` → `apps/app/dist` (what Vercel/Cloudflare serve) |
| `npm run build:extension` | → `apps/extension/dist` (load unpacked) |
| `npm run deploy` | build the app with settings from `services/edge/wrangler.toml` and deploy the Worker (needs Cloudflare auth; see docs/DEPLOY.md) |

Playwright-based scripts need Chromium (`npx playwright install chromium` if it isn't on the machine).

## Rules that keep the architecture sound

1. **GitHub access goes through `packages/github/src/api.ts`.** Add an endpoint there, add its sample-data
   route in `mock.ts`, add a line to `packages/github/test/api.test.ts`. Screens call hooks in
   `apps/app/src/data/queries.ts`, never `fetch` or raw paths.
2. **Every screen must work in sample mode** (no sign-in). That's how the smoke test and new users see it.
3. **No hardcoded colors, fonts or radii in screens.** Read tokens with `useTokens()`; use `src/ui/primitives`.
   The Design (packages/design) is the product — users restyle everything through it.
4. **In-app navigation uses `routes.*` from `src/lib/links.ts`.** github.com links go through `openUrl()`,
   which opens a Gitling screen when one exists.
5. **Query keys start with the session kind** (`'sample' | 'live'`); mutations invalidate what they change.
6. **Secrets never go in the app.** The OAuth client secret lives only in the worker (`wrangler secret`).
   `EXPO_PUBLIC_*` values are public by design.
7. **Tokens never leave the device** except to api.github.com. Don't log them, don't put them in URLs.
8. Expo moves fast: check versioned docs before using an Expo API (see `apps/app/AGENTS.md`). Add native
   packages with `npx expo install`, not `npm i`.
9. Keep `docs/STATUS.md` true. If you finish, break or defer something, update it in the same change.
   Add lasting facts (owner preferences, deploy details, quirks) to `docs/CONTEXT.md`, but never secrets.
10. Talk to the owner in plain, friendly English: the result first, then numbered steps for what they need to
    do. Never ask them to paste tokens or secrets in chat (see `docs/CONTEXT.md` § Security).

## Done means

`npm run check` passes, and for UI changes `npm run smoke` passes and you looked at the screen.
After deploying, `SMOKE_URL=https://gitling.truckcoding.workers.dev npm run smoke` passes.
Commit as `vassu-v <shoryavardhaans2@gmail.com>` and push to `main`.
Say plainly what you verified and what you couldn't (e.g. native builds, real OAuth without credentials).
