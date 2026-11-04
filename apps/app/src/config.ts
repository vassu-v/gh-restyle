/**
 * Build-time configuration. Expo inlines EXPO_PUBLIC_* at build time, so set these in
 * apps/app/.env.local for dev, or in the host's env settings (Vercel/Cloudflare) for deploys.
 * See docs/SETUP-SIGNIN.md.
 */
export const config = {
  /** The GitHub OAuth App's client ID (public, not a secret). */
  githubClientId: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '',
  /** Base URL of the auth worker in services/edge, e.g. https://gitling-auth.<you>.workers.dev */
  authUrl: (process.env.EXPO_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, ''),
};

/** One-tap sign-in is available only when both values are set; otherwise the token paste still works. */
export const oauthConfigured = !!(config.githubClientId && config.authUrl);
