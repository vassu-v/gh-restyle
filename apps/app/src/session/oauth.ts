import { authorizeUrl, callbackUrlFor, createPkce, decodeState, encodeState, exchangeCode, base64url, type ExchangeResult } from '@gitling/github';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { config } from '@/config';

/**
 * One-tap "Sign in with GitHub" (OAuth App + PKCE, through the auth worker in services/edge).
 *
 * web:    full-page redirect to GitHub → worker → /auth/callback route (src/app/auth/callback.tsx) → completeSignIn()
 * native: in-app browser session (ASWebAuthenticationSession / Custom Tabs) that returns gitling://auth/callback
 *
 * The pending verifier + nonce are kept per platform: sessionStorage on web (survives the redirect, dies with the tab),
 * memory on native (the browser session returns into the same JS runtime).
 */

const PENDING = 'gitling.oauth.pending';
type Pending = { verifier: string; nonce: string; at: number };
let nativePending: Pending | null = null;

const crypto = {
  random: (n: number) => Crypto.getRandomBytes(n),
  sha256: (d: Uint8Array) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, d as Uint8Array<ArrayBuffer>),
};

function savePending(p: Pending) {
  if (Platform.OS === 'web') sessionStorage.setItem(PENDING, JSON.stringify(p));
  else nativePending = p;
}
function takePending(): Pending | null {
  if (Platform.OS === 'web') {
    const raw = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
    try { return raw ? (JSON.parse(raw) as Pending) : null; } catch { return null; }
  }
  const p = nativePending; nativePending = null; return p;
}

/** Where the worker should send the browser back to. */
function returnTarget() {
  return Platform.OS === 'web' ? `${window.location.origin}/auth/callback` : Linking.createURL('auth/callback');
}

/**
 * Starts sign-in. On web this navigates away and resolves never; on native it resolves with the token,
 * or null if the person closed the sheet.
 */
export async function startSignIn(): Promise<ExchangeResult | null> {
  const { verifier, challenge } = await createPkce(crypto);
  const nonce = base64url(crypto.random(16));
  savePending({ verifier, nonce, at: Date.now() });
  const url = authorizeUrl({ clientId: config.githubClientId, callbackUrl: callbackUrlFor(config.authUrl), state: encodeState(nonce, returnTarget()), challenge });

  if (Platform.OS === 'web') {
    window.location.assign(url);
    return new Promise(() => {});
  }
  const res = await WebBrowser.openAuthSessionAsync(url, returnTarget());
  if (res.type !== 'success') { takePending(); return null; }
  const q = Linking.parse(res.url).queryParams ?? {};
  return completeSignIn({ code: str(q.code), state: str(q.state), error: str(q.error) });
}

const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '');

/** Finishes sign-in from the callback's query params. Throws a person-readable Error on failure. */
export async function completeSignIn(p: { code?: string; state?: string; error?: string }): Promise<ExchangeResult> {
  const pending = takePending();
  if (p.error) throw new Error(p.error === 'access_denied' ? 'You cancelled the sign-in on GitHub.' : `GitHub said: ${p.error}`);
  const st = decodeState(p.state ?? '');
  if (!pending || !st || st.nonce !== pending.nonce) throw new Error('This sign-in link is out of date. Start again from Gitling.');
  if (Date.now() - pending.at > 10 * 60e3) throw new Error('That sign-in took too long. Try again.');
  if (!p.code) throw new Error('GitHub did not send a sign-in code. Try again.');
  return exchangeCode({ authBase: config.authUrl, code: p.code, verifier: pending.verifier });
}
