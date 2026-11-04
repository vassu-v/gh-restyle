/**
 * Sign in with GitHub — the pure parts (no platform APIs), shared by the app and tested in Node.
 *
 * Flow (see docs/ARCHITECTURE.md § Sign-in):
 *   app → github.com/login/oauth/authorize (PKCE S256, state = nonce + where to return)
 *       → GitHub redirects to the auth worker's /auth/callback (the ONE callback URL registered on the OAuth App)
 *       → worker checks the return target against its allowlist and redirects to the app with ?code&state
 *   app → POST worker /auth/exchange {code, code_verifier} → worker adds client_secret → GitHub → {access_token}
 */

export const OAUTH_SCOPES = ['repo', 'notifications', 'read:user'] as const;

export function base64url(bytes: Uint8Array): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63] + abc[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) { const n = bytes[i] << 16; out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63]; }
  if (rest === 2) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8); out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63]; }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);
function fromBase64url(s: string): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of s) {
    const v = abc.indexOf(ch);
    if (v < 0) throw new Error('bad base64url');
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 255); }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export type CryptoDeps = {
  /** n cryptographically random bytes */
  random: (n: number) => Uint8Array;
  sha256: (data: Uint8Array) => Promise<ArrayBuffer | Uint8Array>;
};

/** RFC 7636 PKCE pair. The verifier is 43 chars of base64url (32 random bytes). */
export async function createPkce(c: CryptoDeps) {
  const verifier = base64url(c.random(32));
  const challenge = await challengeFor(verifier, c);
  return { verifier, challenge };
}
export async function challengeFor(verifier: string, c: Pick<CryptoDeps, 'sha256'>) {
  return base64url(new Uint8Array(await c.sha256(utf8(verifier))));
}

/** state = "<nonce>.<base64url(returnTo)>". The nonce proves the redirect belongs to a sign-in this device started. */
export function encodeState(nonce: string, returnTo: string) { return `${nonce}.${base64url(utf8(returnTo))}`; }
export function decodeState(state: string): { nonce: string; returnTo: string } | null {
  const i = state.indexOf('.');
  if (i < 1) return null;
  try { return { nonce: state.slice(0, i), returnTo: fromBase64url(state.slice(i + 1)) }; } catch { return null; }
}

export function authorizeUrl(o: { clientId: string; callbackUrl: string; state: string; challenge: string; scopes?: readonly string[] }) {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.callbackUrl,
    scope: (o.scopes ?? OAUTH_SCOPES).join(' '),
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
    allow_signup: 'true',
  });
  return `https://github.com/login/oauth/authorize?${q}`;
}

/** The worker's callback URL — the one value registered on the GitHub OAuth App. */
export const callbackUrlFor = (authBase: string) => `${authBase.replace(/\/+$/, '')}/auth/callback`;

export type ExchangeResult = { access_token: string; scope: string; token_type: string };

export async function exchangeCode(o: { authBase: string; code: string; verifier: string; fetch?: typeof fetch }): Promise<ExchangeResult> {
  const f = o.fetch ?? fetch;
  let res: globalThis.Response;
  try {
    res = await f(`${o.authBase.replace(/\/+$/, '')}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: o.code, code_verifier: o.verifier }),
    });
  } catch {
    throw new Error("Couldn't reach the sign-in service. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as Partial<ExchangeResult> & { error?: string };
  if (!res.ok || !body.access_token) throw new Error(body.error ?? `Sign-in failed (${res.status}).`);
  return { access_token: body.access_token, scope: body.scope ?? '', token_type: body.token_type ?? 'bearer' };
}

/** Scopes the app needs that the granted token lacks (GitHub lets users narrow scopes). */
export function missingScopes(granted: string): string[] {
  const have = new Set(granted.split(/[,\s]+/).filter(Boolean));
  return OAUTH_SCOPES.filter((s) => !have.has(s) && !(s === 'read:user' && have.has('user')));
}
