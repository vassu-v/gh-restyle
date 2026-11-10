<div align="center">

<img src="design/gitling-logo-512.png" alt="Gitling logo: a dot-matrix g with a blue dot" width="96">

# Gitling

**The GitHub client you design yourself.**<br>
A phone app for your repos, inbox and pull requests, and a browser extension that puts the same look on github.com.<br>
Local-first: it runs on your device and talks to GitHub directly.

[![CI](https://github.com/vassu-v/gh-restyle/actions/workflows/ci.yml/badge.svg)](https://github.com/vassu-v/gh-restyle/actions/workflows/ci.yml)
[![Live](https://img.shields.io/badge/live-gitling.truckcoding.workers.dev-A8B8FF?style=flat-square)](https://gitling.truckcoding.workers.dev)
![Local-first](https://img.shields.io/badge/local--first-no_server_storage-5BD69A?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square)
![Extension](https://img.shields.io/badge/extension-Chrome_MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)

**[Try it now](https://gitling.truckcoding.workers.dev)** &nbsp;·&nbsp; no account needed, it opens with sample data

<br>

<img src="design/studio-board.png" alt="Gitling Studio on a phone: the Look tab with presets, the Tiles tab with drag-to-reorder shortcuts, and the Share tab with a GITLING1 design code" width="820">

</div>

> [!NOTE]
> Gitling is an independent app that uses the GitHub API. It is not made or endorsed by GitHub.

## What you get

- **Your layout, not ours.** Pick a preset (Signal, Terminal, Paper, Dense, Calm, Ink), then tune the accent, background, numbers, density and text size. Undo works everywhere.
- **A Home that shows what you care about.** Add or remove sections: review requests, your PRs, mentions, inbox, feed, starred repos, recent checks, or any GitHub search under your own title. Shortcut tiles open any search, repo, file or link.
- **Real GitHub work on a phone.** Feed, inbox triage, a code browser with syntax colors, issues, and pull requests with diffs, checks, merge and full reviews (line comments, suggestions, approve or request changes).
- **Feels like an app.** Install it to your home screen, open it offline, and land on your last data instead of a spinner. First launch walks you through install, sign-in and a short setup.
- **Designs you can share.** A `GITLING1.` code, a link that previews before applying, or a readable [`.gitling.json` file](docs/DESIGN-FILE.md).
- **The same look on desktop.** The extension restyles github.com with your design, and can hide the sales menus, Copilot prompts and footer. It uses your existing GitHub session.

## Local-first

Everything happens on your device. There's no Gitling account and no Gitling database.

| What | Where it lives |
|---|---|
| Your GitHub token | On your device, encrypted (AES-GCM in IndexedDB on the web) |
| Your design | On your device; in the extension, in your browser's synced storage |
| Your GitHub data | Fetched straight from `api.github.com`; lists and screens you've opened are kept on your device for 24 hours so the app opens instantly (file contents, PR diffs and review threads aren't), and removed when you sign out |
| The server | One Cloudflare Worker that serves the app's files and swaps the sign-in code for a token once. It stores nothing. |

Sample mode needs no sign-in at all, and the extension never signs in to anything.

## Use it

**On your phone:** open [gitling.truckcoding.workers.dev](https://gitling.truckcoding.workers.dev). It offers to install itself (Android: **Install**; iPhone: Share → **Add to Home Screen**), then to sign in, or you can look around with sample data first.

**On your desktop browser** (not on the Chrome Web Store yet):
1. `npm install`, then `npm run build:extension`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `apps/extension/dist`.
3. Open github.com. The toolbar button turns Gitling on or off; **Settings** has presets, colors, text size, design files and developer mode.

Only Chrome is tested so far. Every control and the known limits are in [`docs/EXTENSION.md`](docs/EXTENSION.md).

<!-- Screenshot to add: a github.com repo page with the extension on, Paper (light) and Graphite (dark) side by side, plus the settings page. -->

## Develop

Needs Node.js 20+.

```bash
npm install
npm run web      # dev server with sample data; every screen works signed out
```

| Command | What it does |
|---|---|
| `npm run check` | Types, lint, unit tests and both builds. Run it before calling anything done. |
| `npm run verify` | The whole local suite: `check`, a smoke test of every screen, and every end-to-end run |
| `npm run deploy` | Builds the app and ships the one Cloudflare Worker ([`docs/DEPLOY.md`](docs/DEPLOY.md)) |
| `npm run deploy:preview` | Uploads this branch to its own URL without touching the live site |

To use your own account locally, set up one-tap sign-in with [`docs/SETUP-SIGNIN.md`](docs/SETUP-SIGNIN.md), or use avatar → Account → **Use a personal access token instead** (classic token with `repo`, `notifications`, `read:user`). On a phone during development, scan the QR code from `npx expo start` in `apps/app` with Expo Go.

## How it's built

```
apps/app/          Expo Router + React Native Web: the app and the PWA
apps/extension/    Manifest V3 extension: popup, settings page, content script
packages/github/   typed GitHub REST client, OAuth/PKCE, sample data
packages/design/   design schema, presets, share codes and files, contrast fitting
services/edge/     Cloudflare Worker: static app + OAuth code exchange
scripts/           PWA post-build, smoke and end-to-end runs, deploy
```

## Read more

| | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Start here if you're contributing (or you're an AI agent): rules and every command |
| [`docs/STATUS.md`](docs/STATUS.md) | What's done, how it was verified, and what isn't yet |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it fits together; [`docs/decisions/`](docs/decisions/) explains why |
| [`docs/TESTING.md`](docs/TESTING.md) | Test layers and when to run what |
| [`PLAN.md`](PLAN.md) | Milestones and what's next (push notifications, design sync, store builds) |

## Licence

Gitling is open source under the [GNU AGPL-3.0](LICENSE). Want to use it in a closed-source product or service? See [COMMERCIAL.md](COMMERCIAL.md) for a commercial licence.
