# 0006 — PWA via a post-export script

**Context.** Expo's `web.output: "single"` has no HTML template hook (`+html.tsx` is for static output).
Static output would need every dynamic route pre-rendered.

**Decision.** Keep single-page output. After `expo export`, `scripts/pwa.mjs` does two things:
- injects the manifest, icon, theme and viewport tags into `index.html`
- writes `sw.js` with a precache list and a cache name built from a content hash

`src/pwa/register.ts` registers the worker in production and captures the install prompt.

**Consequences.**
- `npm run build:web` is the only supported web build. Raw `expo export` output isn't installable.
- The service worker never caches api.github.com. Offline data comes from the app's own caches.
