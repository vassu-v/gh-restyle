# Authenticator: two-factor codes for GitHub

Gitling can make the 6-digit codes GitHub asks for when you sign in with two-factor authentication, so you
don't need a separate authenticator app. The codes are made on your phone. Nothing is sent anywhere.

Open it from **Account → Authenticator**. It works whether or not you're signed in to Gitling.

## Set up GitHub two-factor with Gitling

1. On GitHub, open **Settings → Password and authentication** (or tap "Open GitHub security settings" on the
   Authenticator screen).
2. Choose **Enable two-factor authentication**, or, if it's already on, add or edit the **Authenticator app**
   method.
3. GitHub shows a QR code. On a phone you can't scan your own screen, so tap the **setup key** link under the
   QR code and copy the key (letters and digits, like `ABCD EFGH IJKL MNOP`).
4. In Gitling, open **Account → Authenticator**, paste the key and tap **Add**. You can give it a name; if you
   don't, it's named after your GitHub login (or "GitHub" when you aren't signed in).
5. Type the code Gitling shows into GitHub to finish.
6. **Save GitHub's recovery codes somewhere other than this phone** (a password manager, or on paper).

You can also paste the whole `otpauth://totp/…` link if you have it; the name in the link is used.

## Using it

- When GitHub asks for a code, open Account → Authenticator. Tap the code (or **Copy**) to copy it, then paste
  it into GitHub.
- The bar under each code shows how long it's valid. It changes colour in the last 5 seconds; if it's that low,
  wait for the next code.
- **Rename** changes the name shown above the code.
- **Remove** asks you to tap again. If you don't, it goes back to normal after 6 seconds. Removing an account
  only removes it from Gitling: turn two-factor off on GitHub first, or you'll need your recovery codes.

## The trade-off

Two-factor means two different things: something you know (your password) and something you have (your phone).
If Gitling is signed in to GitHub **and** makes your codes on the same phone, then whoever has that phone,
unlocked, has both. That's the same as any authenticator app on the phone you use GitHub on. Keep your phone
locked, and keep GitHub's recovery codes somewhere else.

Signing out of Gitling does **not** remove these accounts, because you need them to sign back in.

## How the secrets are kept

- On phones: in the iOS Keychain or Android Keystore.
- On the web app: in IndexedDB, encrypted with AES-GCM under a key the browser won't let anyone export.
- They're kept apart from your GitHub token, with their own key, so signing out never touches them.
- They never go into design files, share codes, logs or Gitling's saved cache, and nothing is sent over the
  network.

## Not supported (yet)

- Scanning a QR code with the camera (paste the setup key instead).
- Exporting or backing up accounts. If you lose the phone, use GitHub's recovery codes.
- Approving sign-ins with a tap, the way GitHub Mobile does. Only GitHub's own app can do that.
- Codes other than SHA-1, 6–8 digits, 10–300 second periods. That covers GitHub and nearly every other site;
  anything else is refused with a message instead of making wrong codes.
- A home-screen widget.

## Where the code lives

| What | File |
|---|---|
| Code math (base32, HMAC-SHA1, TOTP), parsing setup keys and links | `packages/github/src/totp.ts`, tests in `packages/github/test/totp.test.ts` |
| Encrypted storage on the device | `apps/app/src/session/vault.ts` |
| Accounts store and the ticking code hook | `apps/app/src/authenticator/store.ts` |
| Screen | `apps/app/src/app/authenticator.tsx` (`routes.authenticator`), row on `apps/app/src/app/account.tsx` |
| Browser test | `scripts/e2e-authenticator.mjs` (`npm run e2e:authenticator`) |
| Plan and decisions | `docs/plans/authenticator.md` |
