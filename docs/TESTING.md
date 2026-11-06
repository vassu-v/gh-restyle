# Testing

How Gitling is tested, what each layer catches, and which command to run when.

## The short version

| When | Run | Time |
|---|---|---|
| While coding | `npm run verify -- --fast` (types, lint, unit + fuzz) | ~30 s |
| Before you say "done" | `npm run verify` (the local suite: check, smoke, every e2e; not live, coverage, stress or deploy; keeps going past failures, prints one table) | ~4–6 min |
| Before a release, or after touching parsing/auth code | `FUZZ_SCALE=20 npm run test:fuzz` (PowerShell: `$env:FUZZ_SCALE = '20'; npm run test:fuzz`; deep fuzz, new random seed every run) | ~1 min |
| After changing the extension or its colours | `npm run stress:extension` (26 live github.com page types × 3 backgrounds) | ~5 min |
| What isn't covered yet | `npm run test:coverage`, then open `coverage/index.html` | ~15 s |

CI runs `check`, smoke and the three app e2e suites on **Ubuntu and Windows**, plus coverage on Ubuntu.

## Layers, and what each one is for

1. **Types and lint** (`npm run typecheck`, `npm run lint`): wrong shapes and hook mistakes.
2. **Unit tests** (`packages/*/test`, `services/*/test`, vitest): one known input → one expected output. Every
   endpoint in `api.ts` runs against the sample data, so sample mode can't drift from the real API.
3. **Property-based fuzz tests** (`tests/fuzz`, [fast-check](https://fast-check.dev)): instead of picking
   examples, state a rule that must hold for *every* input and let fast-check generate thousands of inputs and
   shrink any failure to the smallest one. They cover the code where a missed edge case is costly:
   - share codes: encode/decode round-trips; decoding junk never throws; `isSafeLink` never lets a scheme
     that can run code or content in the page through (`javascript:`, `data:`, `vbscript:`, `blob:`…), including
     `java\tscript:` and similar tricks. App links (`tel:`, `obsidian:`, `vscode:`…) are allowed on purpose
   - contrast fitting always reaches the minimum
   - sign-in Worker: the allowlist never admits a foreign origin; `/auth/callback` never redirects outside it;
     no request makes it crash or answer 5xx
   - diffs: every line anchor maps to the right line of the old or new file
   - applying suggestions: bytes outside the edit stay identical across CRLF/LF mixes and missing final newlines

   On their first run they found real bugs that review and example tests had missed. A `blob:` URL passed the
   sign-in allowlist, `fit()` fell short of 4.5:1 on mid-dark backgrounds, and a `null` JSON body crashed
   `/auth/exchange`. When one fails, it prints a `seed` and a shrunk `Counterexample`: turn that into a plain unit
   test next to the fix.
4. **Browser tests (Playwright)** against the real web build:
   - `smoke` opens every screen at phone size under the production Content-Security-Policy, checks the
     service worker and offline start, and fails on any page error or console error, CSP violations included
   - `e2e:signin` runs the whole OAuth flow with the real Worker code, with GitHub faked
   - `e2e:studio`, `e2e:review` and `e2e:onboarding` drive real user flows. Onboarding covers the welcome tour
     and design files, including a real download and the browser's file picker. Screen tests start as a
     returning user (`gitling.onboarded.v1` set), so only `e2e:onboarding` sees the tour
5. **Live checks:**
   - `e2e:extension` and `stress:extension` run the extension on real github.com; the stress test compares text
     contrast with and without the extension
   - `test:live` calls the real api.github.com read-only
   - after a deploy, `SMOKE_URL=https://gitling.truckcoding.workers.dev npm run smoke`
     (PowerShell: `$env:SMOKE_URL = 'https://gitling.truckcoding.workers.dev'; npm run smoke`)

## Adding tests

- A new pure function (parsing, encoding, URL handling, maths): add a property in `tests/fuzz`. Wrap run
  counts in `runs(n)` so `FUZZ_SCALE` can scale them.
- A bug fix: add the smallest failing case as a unit test next to the code's existing tests.
- A new screen: add it to `SCREENS` in `scripts/smoke.mjs`. If it has a flow worth protecting, add it to an
  e2e script.

## Known limits

- **No native (iOS/Android) runs.** Native-only paths, such as the `gitling://` sign-in return, are covered only
  by unit tests.
- **Signed-in screens against real GitHub are not run in CI**, because that needs a token. The data layer is
  covered by `test:live`, and the screens by sample mode.
- **Cloudflare-only behaviour can't be reproduced locally:** the `_headers` rules, the rate-limit binding and the
  asset server's `@` quirk. Check it on the live site after each deploy.
