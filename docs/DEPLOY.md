# Deploy

## Production: Cloudflare (one Worker)

One Cloudflare Worker (`services/edge`, named `gitling`) serves everything at
`https://gitling.<subdomain>.workers.dev`:

- **The web app (PWA):** static assets from `apps/app/dist`, with single-page fallback. `_headers` sets
  caching and security headers.
- **Sign-in:** `/auth/callback`, `/auth/exchange` and `/health`, the only paths that run Worker code
  (`run_worker_first`).

The app and sign-in share one origin, so there's no cross-site setup.

### Deploy

```bash
npm run deploy
```

`scripts/deploy.mjs` reads `GITHUB_CLIENT_ID` and `ALLOWED_RETURN` from `services/edge/wrangler.toml`,
builds the app with those values baked in (`EXPO_PUBLIC_*`), then runs `wrangler deploy`. Add `--dry-run` to
build and bundle without uploading.

Auth: either `CLOUDFLARE_API_TOKEN` (the "Edit Cloudflare Workers" template), plus `CLOUDFLARE_ACCOUNT_ID`
if the token can see several accounts, or `npx wrangler@4 login` on your own machine.

### First time only

1. Open Workers & Pages in the Cloudflare dashboard once. That creates the account's free `workers.dev`
   subdomain.
2. `npm run deploy`, then note the URL it prints.
3. Put that URL first among the https entries in `ALLOWED_RETURN` in `wrangler.toml`. Commit, then run
   `npm run deploy` again.
4. Set up sign-in: `docs/SETUP-SIGNIN.md`.

Open the URL on a phone.
- **Android / Chrome:** Account → **Install app**.
- **iPhone / Safari:** Share → **Add to Home Screen**.

Each deploy changes the service worker's cache name, so installed apps update on their next launch.

## Alternative: Vercel

`vercel.json` (at the repo root) builds with `npm run build:web` and serves `apps/app/dist` with an SPA
rewrite and the same headers. Import the repo at vercel.com/new and set the two `EXPO_PUBLIC_*` variables
to the Worker's values. Then add the Vercel origin to `ALLOWED_RETURN` and redeploy the Worker. The app
then lives on Vercel, while sign-in stays on the Worker.
