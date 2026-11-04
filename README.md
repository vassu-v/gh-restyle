# Gitling

A GitHub client you design yourself. One Expo app for phone and web, plus a browser extension that restyles github.com on desktop.

## Layout

```
apps/app         Expo app (web/PWA + iOS + Android): Home, Feed, Inbox, Repos, Studio, PR/issue threads, search, tile editor
apps/extension   Browser extension (Manifest V3) that applies your design to github.com
packages/design  The Design schema, the Signal skin, token resolver, share codes (used by app + extension)
packages/github  Typed GitHub REST client with ETag caching, plus sample data
design/          Research mockups (Signal skin)
prototype/       The first HTML prototype, kept for reference
PLAN.md          Architecture, decisions and milestones
```

## Run the app

```bash
npm install
npm run web
```

It opens with sample data. To use your real account before one-tap sign-in lands (M2), open the avatar → paste a classic token with `repo`, `notifications`, `read:user`.

On a phone: install **Expo Go** and scan the QR code that `npx expo start` prints in `apps/app`.

## Build and load the extension

```bash
npm run build -w @gitling/extension
```

Then in Chrome go to `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick `apps/extension/dist`. Open github.com. Click the Gitling icon to switch background or number style, or paste a design code from the app's Studio → Share.

## Checks

```bash
cd apps/app && npx tsc --noEmit && npx expo lint
```
