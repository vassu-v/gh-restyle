# Status

Last updated: 2026-11-05, after PR #2 (review pass, real-account testing, security pass) was merged to `main` and
deployed. Keep this file true: update it in the same change that finishes, breaks or defers something.

## Milestones

| | Milestone | State |
|---|---|---|
| M0 | Design direction (Signal skin) | ✅ done |
| M1 | Skeleton: monorepo, app, design engine, sample data, extension v0 | ✅ done |
| M2 | Sign in with GitHub (OAuth App + PKCE + worker), secure token storage, PAT fallback | ✅ built and tested; a real account signed in through the live Worker on 2026-11-05 (the client secret is set as a Secret). The loop fix is deployed; a real one-tap sign-in on the deployed site (owner's phone) is still to do |
| M3 | Core GitHub: feed, inbox triage, repos, code browser (syntax colors, branch picker), issues, PRs (diff, checks, merge, reviews with line comments / approve / request changes), search, profiles, markdown | ✅ done (see gaps below) |
| M4 | Studio: presets gallery, theme, drag-to-reorder tabs/sections/tiles, tile editor, share codes + share links with live preview | ✅ done |
| M5.1 | Install sheet on phones: Install button (Android/Chrome), Add to Home Screen steps (Safari, or the address bar in Chrome/Firefox/Edge on iPhone), "open in your browser" for in-app browsers, menu steps elsewhere; only on the main tabs and never while typing; snoozes 14 days | ✅ built, tested with iPhone/Pixel emulation (`e2e:onboarding`); Chrome reports the preview installable with 0 errors on a Pixel profile. Not yet tried on a real phone |
| M4.1 | Design files (`.gitling.json`: save, open, load in the app and the extension) | ✅ built and tested in Chromium; not yet tried on a real phone. Opening a file on native isn't wired up (paste the text instead) |
| M4.2 | First run in order: install (phone browsers) → sign in or look around → 3-step setup tour once signed in. Home sections: 12 built-ins plus your own searches (up to 12), add and remove, at least one kept | ✅ built and tested in Chromium and phone emulation (`feat/first-run-and-home-sections`); not yet tried on a real phone |
| M5 | Ship the PWA: installable, offline shell, icons; hosted on one Cloudflare Worker with sign-in (`npm run deploy`) | ✅ live at https://gitling.truckcoding.workers.dev |
| P2 | Push notifications, design sync via gist, native store builds | not started |

## How it was verified

| Check | Command | Result |
|---|---|---|
| Types (app + worker) | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Unit + property-based fuzz tests: client, api × sample data, PKCE/state, worker, design + presets, suggestions, diffs, extension storage | `npm test` (`npm run verify` runs everything) | 168/168 |
| Every screen in Chromium at phone size, plus PWA files, service worker and offline launch | `npm run smoke` | 17/17 screens (incl. `/welcome`), SW registers, opens offline |
| First run + tour + Home sections + design files: desktop asks to sign in (no install step), "Look around first", phones get the install step first (iPhone steps, Android install dialog) then sign-in, the install card stays snoozed after it; tour steps save (look, load a file's text, add built-in and search sections, remove down to one, tab bar), replay and Skip return to Studio, returning users, deep links, shared designs, Search links, Studio download + file picker (under the real CSP), install card on iPhone/Android emulation | `npm run e2e:onboarding` | 50/50 |
| Full sign-in flow, GitHub simulated, real worker code; saved cache; a new person's sign-in step leads into the setup tour | `npm run e2e:signin` | 19/19 |
| Studio: presets, mouse drag reorder, share link preview/apply | `npm run e2e:studio` | 12/12 |
| PR reviews: line comments, verdicts, timeline, own-PR rules, replies, resolve/unresolve, multi-line ranges, suggestions (apply, batch, blocked reasons), file changed in the code browser | `npm run e2e:review` | 47/47 |
| Extension stress test on live github.com: 26 page types × 3 backgrounds vs a no-extension baseline, signed out | `npm run stress:extension` (report in `stress-report/`, git-ignored) | 0 new low-contrast text in ~15,000 checks, 0 extension errors, content script 6.3 KB |
| Read endpoints against the real api.github.com | `LIVE_REPO=vassu-v/gh-restyle LIVE_REPO_ONLY=1 npm run test:live` | pass (repo, readme, tree, file, issues, pulls, thread, files, checks) |
| Live site: every screen, service worker, offline launch, Chrome installability | `SMOKE_URL=https://gitling.truckcoding.workers.dev npm run smoke` + CDP installability check | 16/16, SW active, opens offline, 0 installability errors; re-run after the PR #2 deploy: all screens ok under the CSP |
| Extension end to end on live github.com: popup controls, design codes, share links and design files, off/on restore, persistence, in-site navigation | `npm run e2e:extension` | 35/35 |
| Extension | `npm run build:extension` | builds; restyle verified on live github.com during M1 |

## PR #3 QA pass (2026-11-06)

Three test agents (tour and design files; install sheet on phone emulation; regression and security against the
live site), each in its own browser with the real CSP. Fixed from it:
- Two crashes that blanked the app: a design file whose tile label isn't text, and a share link with `import` twice.
  A root error screen (Try again / Go to Home) now replaces any blank page.
- Designs can't repeat a tab or a Home section; missing sections come back switched off. A file with nothing valid
  is refused. Share codes are salvaged like files (an unsafe tile is left out and named, not the whole code).
- Home taken out of the tab bar: the app opens the first tab. A replayed tour returns to Studio after a reload.
- Install sheet: only on the main tabs, never over a text field; per-browser instructions; cancelling the install
  dialog doesn't snooze; a failing prompt doesn't throw; iPad gets Account help; side margins.
- "Saved." no longer shows when the share sheet was cancelled. JSON Schema requires Studio and unique tabs.
  `deploy --preview` takes the last/space-separated name. Search ignores `.`/`..` path segments.
Left as known: reloading mid-tour starts at step 1; Android browsers without an install prompt get no Account
help; on iPhone SE with text size XL the PR screen is too wide (not from this PR).

## Not verified yet (be honest about these)

- **Real OAuth against github.com:** done 2026-11-05 end to end (approve on GitHub, code exchange in the live
  Worker, token stored) from a local build. The loop fix is deployed and a bad callback now gets a clear error
  page (checked); a real one-tap sign-in on the deployed site is still to do.
- **Signed-in screens with a real account:** done 2026-11-05 with a local build signed in through the live
  Worker (see "Tested with a real account" below). Not yet repeated on the deployed site.
- **`/auth/exchange` rate limit** on real Cloudflare: configured, not exercised.
- **iOS / Android builds:** none made yet. Native sign-in uses `expo-web-browser` `openAuthSessionAsync`
  with `gitling://auth/callback`, which isn't exercised on a device.
- **On a real phone:** install and offline behaviour. Chrome's installability check reports no errors on the live site, and offline launch passes in Chromium.

## Fixed 2026-11-05 (review pass)

- **One-tap sign-in looped forever on the live site.** The app and Worker share an origin, so the Worker
  redirected `/auth/callback` to itself (`run_worker_first`). It now serves the app page instead. Unit-tested and
  deployed; a real sign-in on the live site will confirm it.
- **`javascript:` links:** `/ask?template=…`, link tiles and ask tiles from shared designs could hand
  `javascript:` URLs to `window.open`. Script-running schemes (`javascript:`, `data:`, `vbscript:`, `blob:`, …)
  are now refused (`isSafeLink` in packages/design); app links like `gitling://` and `vscode://` still work, and a
  saved design with one bad tile keeps everything else (`salvageDesign`).
- Crashes: markdown `&#9999999;` (bad code point), Studio paste with a broken `%` escape, github.com links with a
  broken `%` escape.
- **Windows:** scripts used `URL.pathname` (gave `D:\D:\…`), and `pwa.mjs` didn't rename `@` font folders on
  Windows, which left every screen blank. All scripts now use `fileURLToPath` / `basename`.

## Tested with a real account (2026-11-05)

Signed in with GitHub (real OAuth through the live Worker) on a private test repo:
- **Reading:** home, feed, inbox, repos, repo, tree, blob (CRLF, BOM and latin1 files, other branches), user
  profile, search, PR diff with 56 files. The only hosts contacted were the app and api.github.com. No token in
  plain storage, and the callback URL is cleaned after sign-in.
- **Writing:** star and unstar, comment (Unicode), close and reopen, review with line comments and suggestions
  (`commit_id` = head), apply one suggestion, batch apply. Bytes were checked with git afterwards: CRLF and the
  BOM were kept.
- **Not tested:** the final merge (left to the owner), inbox writes on a real inbox.

Bugs this found, now fixed:
- "Committing…" stayed on screen ~20 s after the commit landed: mutations waited for every repo query to
  refetch. They no longer wait.
- "Checking if it can merge…" never cleared after a new commit: polling counted the query's whole life (stopped
  after 6 updates). It now counts polls since the state became unknown.
- Picking a merge method didn't restart the 6 s confirm window.
- The default tiles open `you/trail-notes` (sample data) and showed "Not found" when signed in. They now open
  the tile editor with a note.
- GitHub alerts (`> [!NOTE]` etc.) render as callouts.
- Every request uses `cache: 'no-store'`: GitHub gives a file's raw and JSON forms the same ETag, and Chrome's
  HTTP cache answered a raw request with JSON.

Security pass (signed in, looking for leaks), fixed:
- The token is sent only to the API origin, even if a full URL elsewhere reaches the client.
- Path segments `''`, `.` and `..` are refused (no path tricks into other endpoints).
- The Worker revokes and refuses a token granted with scopes beyond `repo notifications read:user`.
- `/auth/callback` is served `no-store` and `no-referrer`, and the app removes `code` from the URL at once.
  GitHub's error text is never shown as-is.
- Trusted Types in the CSP: only Expo's own chunks and `/sw.js` may be loaded as scripts.
- CI runs with a read-only token; `.dev.vars*` is ignored; `wrangler` is pinned in deploy.

Small UI issues seen, fixed afterwards (`src/ui/reveal.ts`): the floating bottom bar covered "Add to review" for
a comment box near the bottom of the Files tab, and the review sheet opened above the visible area. On web, a
panel that opens now scrolls to the middle of the screen (checked at 390×844 in Chromium).
- The Worker also accepts `user` in place of `read:user` (granted earlier); refusing it would revoke every new
  token for that person.

From the CodeRabbit review of PR #2, fixed:
- A sign-in callback opened again after sign-out could reuse the cached exchange and sign the person back in. The
  cache is cleared on sign-out and when a new sign-in starts, and only lives 60 s.
- Pending review comments could mix two head commits (one `commit_id` for both). If new commits arrive while
  comments are pending, the Files tab asks to send or discard them before adding more.
- Extension popup said "Applied" when the save failed; a design still too big without tiles (many home sections)
  failed to save and now keeps just its theme.
- `salvageDesign` reports tiles cut by the 24-tile limit (so the Studio notice and the backup appear).
- `/ask` no longer leaves an unhandled rejection when no app opens a link.
- Windows: extension id hashing upper-cases the drive letter like Chrome; flags and keycaps are skipped in the
  stress contrast check.
- A bad `FUZZ_SCALE` now fails instead of running zero cases. Coverage runs in CI after earlier failures. Docs give
  PowerShell forms for env-var commands and describe what `verify` covers.

## Signed-in check on the live site (2026-11-06)

A real one-tap sign-in on the deployed site worked: there was no loop, and the GitHub code was cleaned from the
URL. Your counts matched GitHub exactly: needs-you 19, mentions 7, unread 8, starred 22. A comment posted from the
live site. No token in readable storage. Only the app and api.github.com were contacted.

That check found, and this change fixes:
- **Repos → Yours showed only the 50 most recently pushed repos** under a count of "50" (the owner has 61). Your
  repos and stars now follow every page, up to 1,000.
- **Nothing was kept between visits.** Every open started empty, about 1.5 s to Home's data on desktop, and a big PR's
  Files took 3.7 s. Signed-in lists and screens are now saved on the device for a day and shown at once on open
  (see ARCHITECTURE.md § Data). `e2e:signin` checks that the data is saved, that it shows before GitHub answers,
  and that sign-out removes it.

## Known gaps / next up

- Also fixed from the 2026-11-05 review (each has a test; see `docs/TESTING.md`):
  - **Suggestions:** CRLF files apply; BOM kept; non-UTF-8 files refused instead of corrupted; file mode only defaults on 404; batch apply re-checks comments against the new head; indented fences; line-ending fallback.
  - **Review threads:** orphaned replies stay one thread. Pending review comments are sent with the commit they were written on (`commit_id`).
  - **Sign-in:**
    - `gitling://` pinned to `gitling://auth/callback`; `localhost:8081` removed from prod (local dev: paste a token); `blob:` URLs refused.
    - `/auth/exchange` rate-limited (10/min per IP) and refuses a `null` body.
    - Native sign-in no longer fails when the same callback arrives twice.
  - **Web:**
    - Content-Security-Policy (script hash, no inline JS), enforced in `smoke`.
    - The service worker serves unhashed files only from the current build.
    - Images from non-GitHub hosts wait for a tap (privacy).
  - **App:**
    - A late 401 from an old token can't sign out a new session.
    - An unreadable stored design is backed up (`gitling.design.v1.unreadable`) before the default replaces it; no-op edits add no undo step.
    - The merge button's timer is cleared.
    - More reserved github.com paths.
  - **Extension:**
    - Safe background check; a design too large for sync storage saves without tiles; save errors show in the popup.
    - `e2e:extension` and `stress:extension` compute the extension id correctly on Windows.
  - **Windows:** `smoke` exits cleanly (no libuv assertion); CI now also runs on Windows.
- Follow-up from reviewing PR #2:
  - `/auth/exchange` survives GitHub answering `null` (found by fuzzing on Windows CI).
  - Links: only schemes that run code in the page are blocked (`javascript:`, `data:`, `blob:`, `file:`…). App links (`obsidian://`, `tel:`) work, and ask templates must spell out their scheme before `{query}`.
  - Saved designs are salvaged part by part (Studio says what was left out) instead of being reset.
  - Suggestion files are read as base64 JSON and decoded by plain code, so it works on React Native too. Each comment is re-checked by id, so there's no 500-comment cap.
  - Image approval is tied to the exact address. The extension's sync quota is counted in bytes. Draft comments use the commit their diff was read at. Blocked links say why.
- Deployed with PR #2: the CSP (with Trusted Types) is served live and the smoke test passes under it. Still not
  checked on real Cloudflare: the rate limit. Not checkable without a device build: the native double-callback.

- Any asset path containing `@` loops on Cloudflare's asset server. `scripts/pwa.mjs` renames `@` folders (scoped
  packages such as fonts) to `_at_` and keeps `@` files out of the precache; keep that step.

- Markdown has no emoji shortcodes, math or mermaid. SVG badges show as links on native.
- Code browser: files over 512 KB open on GitHub; highlighting skips files over 3,000 lines. Diffs aren't syntax-colored.
- PR review threads: line comments, suggestions, apply one and batch apply were tried on a real PR with a real
  account (2026-11-05). Threads showed Resolve, so the GraphQL `databaseId` = REST `id` join works live. Replies,
  resolve and multi-line ranges are tested in sample mode only.
- No commits list. The repo tile's "commits" tab opens github.com.
- **Extension (v0.2.0):** not tested signed in, in Firefox/Edge, or with GitHub's dim/high-contrast settings; not in the Chrome Web Store. The popup still bundles zod (about 450 KB, loads only when opened); the content script is 5.9 KB.
- Studio: drag-to-reorder not yet tried on a real touchscreen (mouse-tested in Chromium). Ideas: user-saved presets, custom accent color picker.
- `@expo-google-fonts` must be imported per weight. Importing a family's index ships every weight (6 MB) on
  web.
