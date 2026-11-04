# Status

Last updated: 2026-11-04 (after the first live deploy and GitHub sign-in setup). Keep this file true: update it in the same change that finishes, breaks or
defers something.

## Milestones

| | Milestone | State |
|---|---|---|
| M0 | Design direction (Signal skin) | ✅ done |
| M1 | Skeleton: monorepo, app, design engine, sample data, extension v0 | ✅ done |
| M2 | Sign in with GitHub (OAuth App + PKCE + worker), secure token storage, PAT fallback | ✅ built and tested · ⚠️ live Worker lost its client secret on a deploy (it was a plain variable); owner must re-add `GITHUB_CLIENT_SECRET` as a **Secret**. `/health` shows configured:false until then |
| M3 | Core GitHub: feed, inbox triage, repos, code browser (syntax colors, branch picker), issues, PRs (diff, checks, merge, reviews with line comments / approve / request changes), search, profiles, markdown | ✅ done (see gaps below) |
| M4 | Studio: presets gallery, theme, drag-to-reorder tabs/sections/tiles, tile editor, share codes + share links with live preview | ✅ done |
| M5 | Ship the PWA: installable, offline shell, icons; hosted on one Cloudflare Worker with sign-in (`npm run deploy`) | ✅ live at https://gitling.truckcoding.workers.dev |
| P2 | Push notifications, design sync via gist, native store builds | not started |

## How it was verified

| Check | Command | Result |
|---|---|---|
| Types (app + worker) | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Unit tests: client, api × sample data, PKCE/state, worker, design + presets | `npm test` | 46/46 |
| Every screen in Chromium at phone size, plus PWA files, service worker and offline launch | `npm run smoke` | 16/16 screens, SW registers, opens offline |
| Full sign-in flow, GitHub simulated, real worker code | `npm run e2e:signin` | 12/12 |
| Studio: presets, mouse drag reorder, share link preview/apply | `npm run e2e:studio` | 12/12 |
| PR reviews: line comments, request changes, timeline, own-PR rules | `npm run e2e:review` | 13/13 |
| Extension on live github.com (Graphite + Paper, signed out) | manual Playwright run with the unpacked extension | header themed, buttons readable, content script 5.9 KB |
| Read endpoints against the real api.github.com | `LIVE_REPO=vassu-v/gh-restyle LIVE_REPO_ONLY=1 npm run test:live` | pass (repo, readme, tree, file, issues, pulls, thread, files, checks) |
| Live site: every screen, service worker, offline launch, Chrome installability | `SMOKE_URL=https://gitling.truckcoding.workers.dev npm run smoke` + CDP installability check | 16/16, SW active, opens offline, 0 installability errors |
| Extension | `npm run build:extension` | builds; restyle verified on live github.com during M1 |

## Not verified yet (be honest about these)

- **Real OAuth against github.com:** verified up to GitHub's login page (correct client ID, callback, scopes,
  S256), and GitHub accepts the Worker's client secret. The final approve-and-return step needs a human login.
- **Signed-in screens with a real account in the browser:** live API tests cover the data layer. The
  notifications, feed, search and user endpoints couldn't be called live from the build sandbox, which only
  allowed repo-scoped paths.
- **iOS / Android builds:** none made yet. Native sign-in uses `expo-web-browser` `openAuthSessionAsync`
  with `gitling://auth/callback`, which isn't exercised on a device.
- **On a real phone:** install and offline behaviour. Chrome's installability check reports no errors on the live site, and offline launch passes in Chromium.

## Known gaps / next up

- Any asset path containing `@` loops on Cloudflare's asset server. `@` folders are renamed to `_at_`, and `@` files are kept out of the precache.
- (old note) Asset folders starting with `@` (scoped npm packages, e.g. fonts) loop forever on Cloudflare's asset server. `scripts/pwa.mjs` renames them to `_at_…` at build time; keep that step.

- Markdown has no emoji shortcodes, math or mermaid. SVG badges show as links on native.
- Code browser: files over 512 KB open on GitHub; highlighting skips files over 3,000 lines. Diffs aren't syntax-colored.
- PR review: no replies to existing review threads, no multi-line comments, no suggested changes.
- No commits list. The repo tile's "commits" tab opens github.com.
- **Extension:** the popup still bundles zod (about 450 KB, loads only when opened); the content script is 5.9 KB.
- Studio: drag-to-reorder not yet tried on a real touchscreen (mouse-tested in Chromium). Ideas: user-saved presets, custom accent color picker.
- `@expo-google-fonts` must be imported per weight. Importing a family's index ships every weight (6 MB) on
  web.
