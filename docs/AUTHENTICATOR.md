# Authenticator: two-factor codes for GitHub

Gitling can make the 6-digit codes GitHub asks for when you sign in with two-factor authentication, so you
don't need a separate authenticator app. The codes are made on your phone. Nothing is sent anywhere.

Open it from **Account → Authenticator**. It works whether or not you're signed in to Gitling.

## Set up GitHub two-factor with Gitling

1. On GitHub, open **Settings → Password and authentication** (or tap "Open GitHub security settings" on the
   Authenticator screen).
2. Choose **Enable two-factor authentication**, or, if it's already on, add or edit the **Authenticator app**
   method.
3. GitHub shows a QR code. In Gitling, open **Account → Authenticator** and either:
   - tap **Scan QR code** and point the camera at it (when GitHub is open on another screen), or
   - take a screenshot of the QR code and tap **From a screenshot** (when GitHub is open on this phone), or
   - tap the **setup key** link under the QR code, copy the key and paste it into Gitling.
4. Check the account Gitling found and tap **Add this account** (or **Add** for a pasted key). A pasted key can
   get a name; if not, it's named after your GitHub login (or "GitHub" when you aren't signed in).
5. Type the code Gitling shows into GitHub to finish.
6. **Save GitHub's recovery codes somewhere other than this phone** (a password manager, or on paper).

You can also paste the whole `otpauth://totp/…` link if you have it; the name in the link is used.

Scanning happens on your phone: the browser's own QR reader where it has one, else a small reader bundled with
Gitling. The camera stops as soon as a code is read, pictures are dropped once read, and nothing is uploaded.
The secret goes straight into the same encrypted vault as everything else here. You can delete the screenshot
afterwards (it contains the secret).

## Encrypted backup

If your phone is lost or reset, the accounts go with it. To keep a copy:

1. Under **encrypted backup**, type a passphrase of at least 10 characters and tap **Save backup**.
2. Keep the file `gitling-authenticator.backup.json` somewhere other than this phone, and remember the passphrase.
   Without it, the file can't be opened by anyone, including you.
3. To restore, type the passphrase, tap **Restore** and pick the file. Accounts already here are skipped.

The file is encrypted on the phone (a key made from your passphrase with PBKDF2-SHA-256, 600,000 rounds, then
AES-256-GCM). The passphrase is never saved or sent. A wrong passphrase or a changed file is refused.

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
- A save either reaches the device or shows an error; it never quietly keeps the account only until you close
  the app.
- If saved accounts can't be read (in full or in part), Gitling refuses to change the list rather than save over
  them.
- With Gitling open in several browser tabs, each change re-reads what's saved, one tab at a time, and the other
  tabs refresh, so one tab can't erase an account added in another.

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
