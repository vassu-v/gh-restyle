# Status

Last updated: 2026-11-04. Keep this file true: update it in the same change that finishes, breaks or
defers something.

## Milestones

| | Milestone | State |
|---|---|---|
| M0 | Design direction (Signal skin) | ✅ done |
| M1 | Skeleton: monorepo, app, design engine, sample data, extension v0 | ✅ done |
| M2 | Sign in with GitHub (OAuth App + PKCE + worker), secure token storage, PAT fallback | ✅ code done and tested · ⏳ needs the owner's OAuth App + Cloudflare deploy (`docs/SETUP-SIGNIN.md`) |
| M3 | Core GitHub: feed, inbox triage, repos, code browser, issues, PRs (diff, checks, merge, approve), search, profiles, markdown | ✅ done (see gaps below) |
| M4 | Studio: presets, theme, tabs/sections, tile editor, share codes | 🟡 basic version exists since M1; polish pending |
| M5 | Ship the PWA: installable, offline shell, icons, Vercel + Cloudflare Pages configs | ✅ build + configs done · ⏳ not deployed yet (`docs/DEPLOY.md`) |
| P2 | Push notifications, design sync via gist, native store builds | not started |

## How it was verified

| Check | Command | Result |
|---|---|---|
| Types (app + worker) | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Unit tests: client, api × sample data, PKCE/state, worker, design | `npm test` | 38/38 |
| Every screen in Chromium at phone size, plus PWA files | `npm run smoke` | 16/16 screens, PWA ok |
| Full sign-in flow, GitHub simulated, real worker code | `npm run e2e:signin` | 12/12 |
| Read endpoints against the real api.github.com | `LIVE_REPO=vassu-v/gh-restyle LIVE_REPO_ONLY=1 npm run test:live` | pass (repo, readme, tree, file, issues, pulls, thread, files, checks) |
| Worker bundles for Cloudflare | `npx wrangler@4 deploy --dry-run` (in services/edge) | 5.4 KiB |
| Extension | `npm run build:extension` | builds; restyle verified on live github.com during M1 |

## Not verified yet (be honest about these)

- **Real OAuth against github.com:** it needs the OAuth App and deployed worker. The flow is covered by the
  e2e test with GitHub faked.
- **Signed-in screens with a real account in the browser:** live API tests cover the data layer. The
  notifications, feed, search and user endpoints couldn't be called live from the build sandbox, which only
  allowed repo-scoped paths.
- **iOS / Android builds:** none made yet. Native sign-in uses `expo-web-browser` `openAuthSessionAsync`
  with `gitling://auth/callback`, which isn't exercised on a device.
- **Service worker offline behaviour on a real phone.** Install prompt UI is checked only in desktop
  Chromium.

## Known gaps / next up

- Markdown has no syntax highlighting, emoji shortcodes, math or mermaid. SVG badges show as links on
  native.
- Code browser: no branch picker; ref comes from the link or the default branch. Files over 512 KB open on
  GitHub.
- PR review: approve only. No line comments or request-changes.
- No commits list. The repo tile's "commits" tab opens github.com.
- **Extension:**
  - bundle is about 450 KB, mostly zod; could ship a slim decoder
  - signed-out marketing header stays dark
- Studio (M4) polish: presets gallery, drag-to-reorder tiles, live preview of share codes.
- `@expo-google-fonts` must be imported per weight. Importing a family's index ships every weight (6 MB) on
  web.
