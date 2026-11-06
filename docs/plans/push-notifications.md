# Plan: push notifications

Status: **planned, not built** (2026-11-04). Decision record: `docs/decisions/0009-push-notifications.md`.
This replaces the short sketch in `PLAN.md` § 7.

## What the person gets

1. Account → **Notifications** → **Turn on**. On iPhone, if Gitling isn't on the Home Screen yet, it first
   explains "Add to Home Screen" (iOS requires it).
2. **Rules:**
   - which events notify (review requested, mentioned, assigned, CI failed on my PR, replies to my threads,
     PR merged)
   - quiet hours
   - muted repos
3. A notification arrives within about 1–2 minutes of the GitHub event. Tapping it opens that PR or issue in
   Gitling.
4. **Send a test notification** button. **Turn off** deletes everything stored on the server.

## Why a server is involved, and what that changes

- **The server has to hold a token.** GitHub never pushes to third-party apps, and there are no webhooks for a
  user's notifications. Something must poll `GET /notifications` for you while your phone sleeps, and it needs
  your GitHub token to do that.
- **This changes a rule.** `AGENTS.md` rule 7 says tokens never leave the device. Push is **opt-in** and is
  the single exception. It's stated in the UI before you turn it on, and recorded in decision 0009.
- **How the token is protected:**
  - It's encrypted at rest (AES-GCM, with the key in a Worker secret that never reaches the database).
  - It's used only for `GET /notifications`.
  - It's deleted on Turn off, on sign-out, and when GitHub answers 401.

## Architecture

```
Phone                                Worker "gitling" (services/edge)                         GitHub / push services
─────                                ─────────────────────────────────                        ──────────────────────
Turn on → Notification.requestPermission()  (must be a tap)
  pushManager.subscribe({ userVisibleOnly, applicationServerKey: VAPID public key })
POST /push/register {subscription, githubToken, rules} ──▶ verify token (GET /user) ──────────▶ api.github.com
                                                          D1: upsert account (token encrypted), device
cron * * * * * ─────────────────────────────────────────▶ pick accounts with next_poll ≤ now (batch)
                                                          send one Queue message per account
Queue consumer (one account per message):
                                                          GET /notifications  If-Modified-Since ──▶ 304: free, done
                                                                                                 ◀── 200: new threads
                                                          filter by rules + quiet hours, drop already-sent (D1 `sent`)
                                                          build payload {title, body, url:/thread/o/r/n}
                                                          Web Push (VAPID-signed, aes128gcm) ─────▶ FCM / Mozilla / Apple
                                                          404/410 from push service → delete device
                                                          401 from GitHub → delete account + devices
                                                          next_poll = now + max(60 s, X-Poll-Interval)
Service worker: 'push' → showNotification(); 'notificationclick' → open /thread/… (focus an open window if any)
```

**Endpoints (Worker):**
- `POST /push/register`
- `POST /push/rules`
- `POST /push/test`
- `POST /push/unregister`
- `GET /push/vapid-key`

They're authenticated by the GitHub token itself: the Worker checks it with `GET /user` and keys data by user
id. CORS is limited to the app's own origin.

**D1 schema:**

```sql
accounts(user_id PK, login, token_enc, token_iv, rules_json, quiet_json, last_modified, next_poll, created_at)
devices(id PK, user_id, kind 'web'|'expo', endpoint, p256dh, auth, expo_token, ua, created_at, last_ok_at)
sent(user_id, thread_id, updated_at, PRIMARY KEY(user_id, thread_id))   -- dedupe; prune after 7 days
```

**Payload:**
- One JSON shape works both for service workers and for Safari's Declarative Web Push (iOS 18.4+):
  `{"web_push":8030,"notification":{"title":"…","body":"…","navigate":"https://…/thread/o/r/n","app_badge":N}}`.
- Older browsers read it in the service worker.
- Keep it under 3,993 bytes of plaintext.

**Web Push sender:**
- A small module inside the Worker, about 150 lines on `crypto.subtle`: ECDH P-256, HKDF, AES-GCM and ES256
  VAPID JWT.
- It's tested against the RFC 8291 appendix example.
- Small libraries exist (`web-push-neo`, `@pushforge/builder`), but both have few users. Owning about 150
  tested lines is safer.
- **Always include:** `TTL`, `Urgency`, and a VAPID `sub` (Apple rejects JWTs without it).

**Secrets (Worker):**
- `VAPID_PRIVATE_KEY`, with `VAPID_PUBLIC_KEY` as a var.
- `PUSH_TOKEN_KEY` (AES key for tokens).
- `VAPID_SUBJECT` = `mailto:` the maintainer's address, set in the dashboard, not committed.

## Cloudflare plan: the one decision for the maintainer

| | Free | Workers Paid ($5/month) |
|---|---|---|
| CPU per cron/queue invocation | 10 ms | 30 s |
| Outgoing requests per invocation | 50 | 10,000 |
| Who it covers | You and a handful of people, if each queue message handles one account (one GitHub call + a few pushes, fanned out through Queues: 10,000 ops/day free) | Thousands of users |

- **Recommendation:** build it to work on **Free** first, with one account per queue message and pushes
  signed per message. Measure CPU against the 10 ms limit.
- **When to switch to Paid:** if signing pushes goes over the limit, or more people use it.
- Cron is per minute at most, so delivery lands about 1–2 minutes after the GitHub event.

## Rules engine (pure, unit-tested)

```
shouldNotify(notification, rules, now, quiet) → boolean
reason ∈ review_requested | mention | team_mention | assign | author | comment | ci_activity | state_change …
CI rule: reason ci_activity AND subject is a failing check on your PR (from the subject title or a check-suite lookup)
quiet hours in the person's time zone (saved from the device)
```

## App changes

- **Account → Notifications screen:**
  - state: off, asking, on, blocked by the browser, or needs the Home Screen
  - rules, quiet hours, muted repos
  - test button
- **Service worker (scripts/pwa.mjs template):**
  - `push` → `showNotification(title, {body, data:{url}, badge, tag:thread})`
  - `notificationclick` → `clients.openWindow(url)` or focus an existing window
- **Native (later):** the Expo push token goes to the same register endpoint (`kind: 'expo'`). The sender
  posts to `https://exp.host/--/api/v2/push/send` and drops tokens on `DeviceNotRegistered`.

## Tests

- **Unit:**
  - the rules engine
  - quiet hours across midnight and time zones
  - Web Push encryption against the RFC 8291 vector
  - the VAPID JWT shape
  - dedupe
- **Worker:**
  - register/unregister/test with GitHub faked
  - the poller: 304 path, new-thread path, 401 → delete, 410 from the push service → device deleted
  - CORS
- **Browser e2e:** subscribe in Chromium, then deliver a push with the DevTools protocol
  (`ServiceWorker.deliverPushMessage`). Check a notification is shown and that clicking opens the thread.
- **Live, manual:**
  - the maintainer turns it on, on Android, then on iPhone with the app on the Home Screen
  - a real review request arrives as a push

## Build order (about 1–2 sessions)

1. D1 schema and migrations (`wrangler d1`), token encryption, `/push/register` `/unregister` `/rules`
   `/vapid-key`, with tests.
2. Web Push sender module + `/push/test` + service-worker handlers + Notifications screen. A test push
   working on a real phone is the first milestone.
3. Cron → Queue → poller with dedupe and rules.
4. Rules UI, quiet hours, muted repos.
5. Docs, STATUS, and a runbook for rotating VAPID or token keys.

## Owner setup when we build it

1. Create the D1 database and Queue: one command each, or I run them with the API token.
2. Put the three secrets in the dashboard as **type Secret**. I generate the VAPID key pair locally and give
   you the values to paste.
3. Decide Free vs Paid. Start on Free.

## Sources (researched 2026-11-04)

- VAPID: https://www.rfc-editor.org/rfc/rfc8292.html. Message encryption and the 4,096-byte limit: https://www.rfc-editor.org/rfc/rfc8291.html
- iOS web push (16.4+, Home Screen, user gesture): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Declarative Web Push (iOS 18.4 / macOS 15.5): https://webkit.org/blog/16535/meet-declarative-web-push/
- Push service status codes (404/410 = delete subscription): https://autopush.readthedocs.io/en/latest/http.html
- Workers limits (Free: 10 ms CPU and 50 subrequests per invocation): https://developers.cloudflare.com/workers/platform/limits/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/ · Queues pricing (free tier): https://developers.cloudflare.com/queues/platform/pricing/
- GitHub notifications polling (If-Modified-Since, X-Poll-Interval, 304s free): https://docs.github.com/en/rest/activity/notifications
- Expo push: https://docs.expo.dev/push-notifications/sending-notifications/
- Workers-compatible libraries considered: https://github.com/ryoppippi/web-push-neo, https://npmjs.com/package/@pushforge/builder
- **Unverified:** Apple's exact limits and headers (the Apple docs page didn't load). Check them while building.
