# Set up "Sign in with GitHub"

You do this once, after the first Cloudflare deploy (`docs/DEPLOY.md`). Until then the app works with
sample data, and "paste a token" on the Account screen keeps working.

Two pieces are involved:

1. **A GitHub OAuth App.** It tells GitHub "Gitling may ask people to sign in". Its client ID is public; its
   client secret goes only to the Worker.
2. **The Worker**, already deployed with the app. It swaps GitHub's one-time code for a token, because that
   swap needs the secret and can't happen in a browser. It stores nothing.

Below, `APP_URL` means your deployed address, e.g. `https://gitling.<subdomain>.workers.dev`.

## 1. Create the GitHub OAuth App

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name:** Gitling
   - **Homepage URL:** `APP_URL`
   - **Authorization callback URL:** `APP_URL/auth/callback` (exactly; it's the only one needed, and it also
     covers localhost and the native app)
3. Click **Register application**, then copy the **Client ID**.
4. Click **Generate a new client secret** and copy it. GitHub shows it only once. Don't paste it into chats,
   issues or files.

## 2. Configure and redeploy

In `services/edge/wrangler.toml`:

```toml
ALLOWED_RETURN = "APP_URL,http://localhost:8081,gitling://"
GITHUB_CLIENT_ID = "<client id>"
```

Store the secret on Cloudflare. The command prompts for it, so it never lands in a file or your shell
history:

```bash
npx wrangler@4 secret put GITHUB_CLIENT_SECRET -c services/edge/wrangler.toml
```

Then redeploy, which rebuilds the app with the client ID:

```bash
npm run deploy
```

`APP_URL/health` should now say `"configured":true`.

## Check it

Open `APP_URL` → avatar → **Sign in with GitHub** → approve on GitHub. You land back on Home with your own
data.

## Local dev with real sign-in

Copy `apps/app/.env.example` to `apps/app/.env.local`, set `EXPO_PUBLIC_GITHUB_CLIENT_ID` and
`EXPO_PUBLIC_AUTH_URL=APP_URL`, then run `npm run web`. `http://localhost:8081` is already allowed.

## Notes

- **Scopes requested:** `repo` (private repos, merge, comment), `notifications` (inbox) and `read:user`.
  GitHub only gives the inbox API to OAuth and classic tokens, which is why this is an OAuth App and not a
  GitHub App.
- **To revoke:** github.com/settings/applications → Authorized OAuth Apps → Gitling.
- **Native apps (later):** `gitling://` is already allowed. Add `exp://` only while testing in Expo Go.
