/**
 * Build-time configuration. Expo inlines EXPO_PUBLIC_* at build time, so set these in
 * apps/app/.env.local for dev. Deploys get them from services/edge/wrangler.toml via scripts/deploy.mjs.
 * See docs/SETUP-SIGNIN.md.
 */
export const config = {
  /** The GitHub OAuth App's client ID (public, not a secret). */
  githubClientId: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '',
  /** Base URL of the Worker in services/edge (also serves the app), e.g. https://gitling.<you>.workers.dev */
  authUrl: (process.env.EXPO_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, ''),
};

/** One-tap sign-in is available only when both values are set; otherwise the token paste still works. */
export const oauthConfigured = !!(config.githubClientId && config.authUrl);
