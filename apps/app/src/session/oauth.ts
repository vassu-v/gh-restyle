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
function peekPending(): Pending | null {
  if (Platform.OS === 'web') {
    const raw = sessionStorage.getItem(PENDING);
    try { return raw ? (JSON.parse(raw) as Pending) : null; } catch { return null; }
  }
  return nativePending;
}
function clearPending() {
  if (Platform.OS === 'web') sessionStorage.removeItem(PENDING);
  else nativePending = null;
}
function takePending(): Pending | null { const p = peekPending(); clearPending(); return p; }

/** GitHub's documented error codes, in our words. Anything else gets one fixed sentence: the `error` value comes
 *  from the URL, so showing it would let anyone put their own text on Gitling's page. */
const GITHUB_ERRORS: Record<string, string> = {
  access_denied: 'You cancelled the sign-in on GitHub.',
  application_suspended: 'GitHub has suspended this app. Use a personal access token instead.',
  redirect_uri_mismatch: 'Sign-in is set up wrong on the server. Use a personal access token for now.',
};

/** Where the worker should send the browser back to. */
function returnTarget() {
  return Platform.OS === 'web' ? `${window.location.origin}/auth/callback` : Linking.createURL('auth/callback');
}

/**
 * Starts sign-in. On web this navigates away and resolves never; on native it resolves with the token,
 * or null if the person closed the sheet.
 */
export async function startSignIn(): Promise<ExchangeResult | null> {
  forgetSignIn();
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
let inFlight: { code: string; at: number; result: Promise<ExchangeResult> } | null = null;
/** Forget the last exchange: after sign-out, or when a new sign-in starts, an old callback must not sign anyone back in. */
export function forgetSignIn() { inFlight = null; }

export function completeSignIn(p: { code?: string; state?: string; error?: string }): Promise<ExchangeResult> {
  // On native the OS may deliver the same gitling://auth/callback twice (to openAuthSessionAsync and to the
  // /auth/callback route). Codes are single use, so the second caller shares the first exchange instead of
  // failing with "out of date".
  if (p.code && inFlight?.code === p.code && Date.now() - inFlight.at < 60e3) return inFlight.result;
  const result = finish(p);
  if (p.code) inFlight = { code: p.code, at: Date.now(), result };
  return result;
}

async function finish(p: { code?: string; state?: string; error?: string }): Promise<ExchangeResult> {
  // The nonce first: a link someone else made must neither show its text here nor cancel a sign-in in progress,
  // so the pending sign-in is only used up by the answer to it.
  const pending = peekPending();
  const st = decodeState(p.state ?? '');
  if (!pending || !st || st.nonce !== pending.nonce) throw new Error('This sign-in link is out of date. Start again from Gitling.');
  clearPending();
  if (p.error) throw new Error(GITHUB_ERRORS[p.error] ?? 'GitHub didn’t finish the sign-in. Try again.');
  if (Date.now() - pending.at > 10 * 60e3) throw new Error('That sign-in took too long. Try again.');
  if (!p.code) throw new Error('GitHub did not send a sign-in code. Try again.');
  return exchangeCode({ authBase: config.authUrl, code: p.code, verifier: pending.verifier });
}
