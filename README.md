# Gitling

A GitHub client you design yourself. One Expo app for phone and web (installable PWA), plus a browser
extension that restyles github.com on desktop.

- **New here, or an AI agent?** Read [`AGENTS.md`](AGENTS.md) first.
- **Where things stand:** [`docs/STATUS.md`](docs/STATUS.md)
- **How it works:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · **why:** [`docs/decisions/`](docs/decisions/)
- **Plan:** [`PLAN.md`](PLAN.md)

## Run it

```bash
npm install
npm run web
```

It opens with sample data, so every screen works without an account. To use your own GitHub:

- **One-tap sign-in:** set up once with [`docs/SETUP-SIGNIN.md`](docs/SETUP-SIGNIN.md) (GitHub OAuth App + free Cloudflare worker).
- **Or paste a token:** avatar → Account → "Use a personal access token instead" (classic token with `repo`, `notifications`, `read:user`).

On a phone during development: install **Expo Go** and scan the QR code that `npx expo start` prints in `apps/app`.

## Install it on your phone

Deploy the web build to Vercel or Cloudflare Pages ([`docs/DEPLOY.md`](docs/DEPLOY.md)), open the URL, then
Account → **Install app** (Android/Chrome) or Share → **Add to Home Screen** (iPhone).

## Desktop extension

```bash
npm run build:extension
```

Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → `apps/extension/dist`. Open github.com.
Use the Gitling icon to change background or number style, or paste a design code from the app (Studio → Share).

## Checks

```bash
npm run check
```

That runs types, lint, unit tests, and the extension and web builds. Then:

```bash
npm run smoke
```

```bash
npm run e2e:signin
```

`smoke` opens every screen in a browser. `e2e:signin` runs the full sign-in flow with GitHub simulated.
