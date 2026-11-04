# Set up "Sign in with GitHub"

You do this once, in about 10 minutes. Until then the app works with sample data, and the "paste a token"
sign-in on the Account screen keeps working.

You'll create two things:

1. **A GitHub OAuth App.** It tells GitHub "Gitling may ask people to sign in". Its client ID is public; its
   client secret goes only to step 2.
2. **The auth worker on Cloudflare (free).** A tiny server that swaps GitHub's one-time code for a token,
   because that swap needs the secret and can't happen in a browser.

## 1. Deploy the worker first (you need its URL for step 2)

1. Make a free account at https://dash.cloudflare.com/sign-up.
2. Log in from the terminal, then deploy:

   ```bash
   npx wrangler@4 login
   ```

   ```bash
   npm run deploy:auth
   ```

   Wrangler prints the worker URL. Keep it; this guide calls it `AUTH_URL` from here on. It looks like
   `https://gitling-auth.<your-subdomain>.workers.dev`.
3. Check it's up: open `AUTH_URL/health`. It should say `{"ok":true,"configured":false}`. The `false` is
   expected until step 3.

## 2. Create the GitHub OAuth App

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name:** Gitling
   - **Homepage URL:** your app URL (or `http://localhost:8081` for now)
   - **Authorization callback URL:** `AUTH_URL/auth/callback` (exactly this, one URL)
3. Click **Register application**. Copy the **Client ID**.
4. Click **Generate a new client secret** and copy it. GitHub shows it only once.

## 3. Give the worker its settings

In `services/edge/wrangler.toml`, set:

```toml
GITHUB_CLIENT_ID = "<your client id>"
ALLOWED_RETURN = "http://localhost:8081,gitling://,https://<your-app>.vercel.app"
```

`ALLOWED_RETURN` lists every place the app runs:
- dev server
- native scheme
- each deployed web URL

Then store the secret, which never goes in a file, and redeploy:

```bash
npx wrangler@4 secret put GITHUB_CLIENT_SECRET -c services/edge/wrangler.toml
```

```bash
npm run deploy:auth
```

`AUTH_URL/health` should now say `"configured":true`.

## 4. Tell the app where things are

Both values are public, not secrets.

**Local dev:** copy `apps/app/.env.example` to `apps/app/.env.local` and fill in:

```
EXPO_PUBLIC_GITHUB_CLIENT_ID=<client id>
EXPO_PUBLIC_AUTH_URL=<AUTH_URL>
```

Restart `npm run web`.

**Hosted builds:** add the same two variables in the host's settings, then redeploy:
- **Vercel:** Project → Settings → Environment Variables.
- **Cloudflare Pages:** Settings → Variables.

Expo bakes them in at build time.

## Check it

Open the app → avatar → **Sign in with GitHub** → approve on GitHub. You land back on Home with your own data.

## Notes

- **Scopes requested:** `repo` (private repos, merge, comment), `notifications` (inbox) and `read:user`.
  GitHub only gives the inbox API to OAuth and classic tokens, which is why this is an OAuth App and not a
  GitHub App.
- **To revoke:** github.com/settings/applications → Authorized OAuth Apps → Gitling.
- **Native apps (later):** `gitling://` is already in the allowlist. Expo Go uses `exp://…`; add `exp://` to
  `ALLOWED_RETURN` only while testing in Expo Go.
