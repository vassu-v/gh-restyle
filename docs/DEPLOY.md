# Deploy the web app (PWA)

The web build is static files in `apps/app/dist`, produced by `npm run build:web`. Any static host works.
Configs for two hosts are in the repo.

## Vercel (`vercel.json` at the repo root)

1. On https://vercel.com/new, import the GitHub repo. Leave **Root Directory** as the repo root. `vercel.json`
   sets the install command, the build command (`npm run build:web`) and the output folder
   (`apps/app/dist`).
2. Optional: add `EXPO_PUBLIC_GITHUB_CLIENT_ID` and `EXPO_PUBLIC_AUTH_URL` under Environment Variables (see
   `docs/SETUP-SIGNIN.md`).
3. Deploy. Add the resulting `https://<name>.vercel.app` to the worker's `ALLOWED_RETURN`, then run
   `npm run deploy:auth`.

`vercel.json` also handles these:
- **SPA rewrite:** deep links like `/repo/x/y` load the app.
- **Long cache:** hashed bundles are cached for a long time.
- **No cache:** `sw.js`, `index.html` and the manifest are never cached.
- **Security headers.**

## Cloudflare Pages

1. In the dashboard, go to Workers & Pages → Create → Pages → Connect to Git → pick the repo.
2. Settings:
   - **Build command:** `npm run build:web`
   - **Build output directory:** `apps/app/dist`
   - **Environment variable:** `NODE_VERSION=22`
   - Optionally, the two `EXPO_PUBLIC_*` variables.
3. Deploy. `apps/app/public/_redirects` (SPA fallback) and `_headers` (cache and security headers) are
   copied into the build automatically.
4. Add the `https://<name>.pages.dev` origin to the worker's `ALLOWED_RETURN`.

## After the first deploy

- Open the URL on a phone.
  - **Android / Chrome:** Account → **Install app**.
  - **iPhone / Safari:** Share → **Add to Home Screen**.
- Updates: each deploy changes the service worker's cache name. Installed apps pick up the new version on
  the next launch.
