# 0001: One Expo codebase, PWA first

**Context.** The app has to be usable on any phone now, without app-store review, and become a real
native app later without a rewrite.

**Decision.** Expo (React Native + TypeScript) with Expo Router, rendered on the web by react-native-web and
shipped first as an installable PWA. iOS/Android builds come from the same code via EAS.

**Consequences.**
- Only libraries that work on web *and* native: no DOM-only UI kits, no HTML rendering.
- Web-only code is guarded with `Platform.OS === 'web'` (see `src/pwa`, `src/session/tokenStore.ts`).
- Push on iOS web requires the PWA to be installed to the Home Screen (iOS 16.4+), which is acceptable for
  phase 2.
