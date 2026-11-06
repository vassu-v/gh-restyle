# Plan: a built-in authenticator (two-factor codes)

**Status:** built on `feat/authenticator` (see `docs/AUTHENTICATOR.md` and the M6 row in `docs/STATUS.md`).

**Why:** GitHub's "approve in GitHub Mobile" prompt only works with GitHub's own app; no other app can receive
it. The alternative GitHub supports for everyone is an **authenticator app**: 6-digit codes that change every
30 seconds (TOTP, RFC 6238). Gitling can make those codes itself, so people who use Gitling don't need a second
app for two-factor sign-in.

**What people get:** Account → **Authenticator**. Add GitHub once by pasting the setup key GitHub shows (or the
`otpauth://` link), then open the screen whenever GitHub asks for a code: the code, a countdown, tap to copy.

## Decisions

1. **Local only.** Codes are computed on the device; secrets never leave it and nothing goes over the network.
2. **Paste, not scan, in v1.** On a phone the QR code is on the same screen, so scanning can't work; GitHub
   shows a "setup key" link under it. Accept the bare key and the full `otpauth://totp/…` link.
3. **SHA-1, 6–8 digits, 10–300 s periods.** That covers GitHub and nearly every site. Other algorithms are
   refused with a clear sentence instead of producing wrong codes.
4. **Secrets live in the same vault as the GitHub token** (Keychain / Keystore on native; AES-GCM with a
   non-extractable WebCrypto key in IndexedDB on web), under their own name and their own key, so signing out
   (which clears the token vault) never touches them. The authenticator's vault is **strict**: a save that
   couldn't reach the device, or saved data that can't be read, is an error, never a quiet loss or an
   overwrite (the token vault keeps its forgiving in-memory fallback, since a token can be entered again).
5. **Signing out doesn't remove authenticator accounts.** They're for GitHub sign-in itself; removing one is
   its own action (two taps).
6. **No export in v1.** Secrets never go into design files, share codes, logs or the saved query cache.
7. **Say the trade-off plainly** on the screen: codes on the same phone as your GitHub session make that phone
   both factors; keep GitHub's recovery codes somewhere else.
8. **Pure TypeScript math** (SHA-1, HMAC, base32) so it runs in Hermes, which has no `crypto.subtle`.

## Pieces and contract

| Piece | Files | Interface |
|---|---|---|
| Code math | `packages/github/src/totp.ts` (exported from the package index), `packages/github/test/totp.test.ts` | `OtpAccount`, `base32Decode`, `hmacSha1`, `hotp`, `totp(account, now) → { code, remaining }`, `parseOtpInput(text, fallbackLabel) → { ok, account } \| { ok: false, error }` |
| Vault | `apps/app/src/session/vault.ts`, `tokenStore.ts` uses it | `createVault(name, { strict? }) → { get(): Promise<string \| null>, set(v), clear() }`. `tokenStore` keeps its existing storage keys so nobody is signed out by the update |
| Accounts store | `apps/app/src/authenticator/store.ts` | `useOtpAccounts() → { accounts: OtpAccount[] \| null, add(a) → Promise<{ ok: true, id } \| { ok: false, error }>, remove(id), rename(id, label) }`; `useTotp(account) → { code, remaining }` ticking each second |
| Screen | `apps/app/src/app/authenticator.tsx`, a row on Account, `routes.authenticator` in `src/lib/links.ts` | uses only the two hooks above |
| Tests | unit (RFC 6238/4226 vectors, parsing, refusals), `scripts/e2e-authenticator.mjs` (add, code matches, copy, rename, remove, survives reload, not cleared by sign-out), smoke | `npm run e2e:authenticator`, part of `npm run verify` and CI |
| Docs | `docs/AUTHENTICATOR.md` (how to set it up on GitHub), ARCHITECTURE, STATUS, AGENTS command table | |

## Not in v1

QR scanning (camera), export/backup, other sites' push approvals, a home-screen widget.
