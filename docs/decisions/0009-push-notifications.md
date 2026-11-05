# 0009 — Push notifications: an opt-in, server-held token in the same Worker

**Context.** GitHub doesn't push to third-party apps and has no notification webhooks for users. Push means
polling `/notifications` while the phone sleeps, which needs the person's token on a server. That breaks the
phase-1 rule "tokens never leave the device".

**Decision.**
- **Opt-in exception.** Turning on notifications stores the GitHub token in Cloudflare D1, AES-GCM encrypted
  with a key held only as a Worker secret. It's used only for `GET /notifications` and deleted on Turn off,
  sign-out or a 401.
- **Pipeline:** Cron (every minute) → Queue (one account per message) → poller with `If-Modified-Since`
  (304s are free) → own Web Push sender on WebCrypto (VAPID ES256, aes128gcm).
- **Payload:** one JSON shape that also satisfies Safari's Declarative Web Push.
- **Hosting:** the same `gitling` Worker; no second service.

**Consequences.**
- `AGENTS.md` rule 7 gains a documented exception, which the UI states before you turn it on.
- **Free plan:** CPU (10 ms) and subrequest (50) limits fit a handful of users with per-account queue
  messages. More users need Workers Paid ($5/month).
- **iPhone:** needs the app on the Home Screen (iOS 16.4+).
- Plan details: `docs/plans/push-notifications.md`.
