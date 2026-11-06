/**
 * Time-based one-time passwords (RFC 6238), the 6-digit codes GitHub accepts for two-factor sign-in when
 * "Authenticator app" is set up. Everything here is local math: nothing is sent anywhere.
 *
 * Plain TypeScript (no WebCrypto), so it runs the same in browsers and in React Native's Hermes, which has no
 * crypto.subtle. SHA-1 is what GitHub and almost every authenticator use; SHA-256/512 links are refused with a
 * clear message rather than producing wrong codes.
 */

export type OtpAccount = {
  id: string;
  /** What the person sees, e.g. "GitHub". */
  issuer: string;
  /** Usually the GitHub username. */
  label: string;
  /** Base32 secret, upper-case, no spaces or padding. */
  secret: string;
  digits: 6 | 7 | 8;
  period: number;
};

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648) to bytes. Spaces, dashes and padding are ignored; lower case is fine. Null if invalid. */
export function base32Decode(input: string): Uint8Array | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!s || /[^A-Z2-7]/.test(s)) return null;
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

function sha1(msg: Uint8Array): Uint8Array {
  const ml = msg.length;
  const words = new Uint32Array((((ml + 8) >> 6) + 1) * 16);
  for (let i = 0; i < ml; i++) words[i >> 2] |= msg[i] << (24 - (i % 4) * 8);
  words[ml >> 2] |= 0x80 << (24 - (ml % 4) * 8);
  words[words.length - 1] = ml * 8;
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let b = 0; b < words.length; b += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[b + i];
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (bb & c) | (~bb & d) : i < 40 ? bb ^ c ^ d : i < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(bb, 30) >>> 0; bb = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach((h, i) => { out[i * 4] = h >>> 24; out[i * 4 + 1] = h >>> 16; out[i * 4 + 2] = h >>> 8; out[i * 4 + 3] = h; });
  return out;
}

/** HMAC-SHA1 (RFC 2104). */
export function hmacSha1(key: Uint8Array, msg: Uint8Array): Uint8Array {
  let k = key.length > 64 ? sha1(key) : key;
  const padded = new Uint8Array(64); padded.set(k); k = padded;
  const inner = new Uint8Array(64 + msg.length), outer = new Uint8Array(64 + 20);
  for (let i = 0; i < 64; i++) { inner[i] = k[i] ^ 0x36; outer[i] = k[i] ^ 0x5c; }
  inner.set(msg, 64);
  outer.set(sha1(inner), 64);
  return sha1(outer);
}

/** HOTP (RFC 4226) for a counter. */
export function hotp(key: Uint8Array, counter: number, digits = 6): string {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const h = hmacSha1(key, msg);
  const o = h[19] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The code for an account at a moment, and how many seconds it stays valid. */
export function totp(a: Pick<OtpAccount, 'secret' | 'digits' | 'period'>, now = Date.now()): { code: string; remaining: number } {
  const key = base32Decode(a.secret);
  if (!key) throw new Error('This setup key is not valid.');
  const step = Math.floor(now / 1000 / a.period);
  return { code: hotp(key, step, a.digits), remaining: a.period - (Math.floor(now / 1000) % a.period) };
}

/** Real setup keys are usually 16–32 characters; anything this long is a paste mistake. */
const MAX_SECRET = 256;

export type ParseResult = { ok: true; account: Omit<OtpAccount, 'id'> } | { ok: false; error: string };

/**
 * Reads what GitHub shows when you set up an authenticator app: either the "setup key" (base32 text) or the
 * otpauth:// link behind the QR code. `fallbackLabel` names an account added from a bare key.
 */
export function parseOtpInput(input: string, fallbackLabel = 'GitHub'): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Paste the setup key from GitHub.' };
  if (/^otpauth:/i.test(text)) {
    // Parsed by hand, not with `new URL()`: React Native's URL has been incomplete on some versions, and this
    // must read the same on web and native. otpauth://<type>/<label>?<query>
    const m = /^otpauth:\/\/([^/?#]*)\/?([^?#]*)(?:\?([^#]*))?/i.exec(text);
    if (!m || !/^[a-z]+$/i.test(m[1])) return { ok: false, error: "That link isn't complete. Copy it again." };
    if (m[1].toLowerCase() !== 'totp') return { ok: false, error: 'Only time-based codes (TOTP) are supported, which is what GitHub uses.' };
    const query = new Map<string, string>();
    try {
      for (const pair of (m[3] ?? '').split('&')) {
        if (!pair) continue;
        const [k, v = ''] = pair.split('=');
        const key = decodeURIComponent(k.replace(/\+/g, ' ')).toLowerCase();
        if (!query.has(key)) query.set(key, decodeURIComponent(v.replace(/\+/g, ' ')));
      }
    } catch { return { ok: false, error: "That link isn't complete. Copy it again." }; }
    const p = { get: (k: string) => query.get(k) ?? null };
    const url = { pathname: m[2] };
    const algo = (p.get('algorithm') ?? 'SHA1').toUpperCase();
    if (algo !== 'SHA1') return { ok: false, error: `This link uses ${algo.slice(0, 12)}; Gitling makes SHA-1 codes, which is what GitHub uses.` };
    const secret = (p.get('secret') ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
    if (!base32Decode(secret) || secret.length < 16 || secret.length > MAX_SECRET) return { ok: false, error: "The link's secret isn't valid." };
    const digits = Number(p.get('digits') ?? 6);
    const period = Number(p.get('period') ?? 30);
    if (![6, 7, 8].includes(digits) || !Number.isInteger(period) || period < 10 || period > 300) return { ok: false, error: 'This link asks for an unusual code format that Gitling does not support.' };
    // A broken %-escape in the name would make decodeURIComponent throw; refuse it like any other broken link.
    let path: string;
    try { path = decodeURIComponent(url.pathname.replace(/^\/+/, '')); } catch { return { ok: false, error: "That link isn't complete. Copy it again." }; }
    const [maybeIssuer, ...rest] = path.split(':');
    const label = (rest.length ? rest.join(':') : maybeIssuer).trim() || fallbackLabel;
    const issuer = (p.get('issuer') ?? (rest.length ? maybeIssuer : '')).trim() || 'GitHub';
    return { ok: true, account: { issuer: issuer.slice(0, 40), label: label.slice(0, 60), secret, digits: digits as 6 | 7 | 8, period } };
  }
  const secret = text.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (/[^A-Z2-7]/.test(secret)) return { ok: false, error: "That isn't a setup key. It's letters A–Z and digits 2–7, like “ABCD EFGH IJKL MNOP”." };
  if (secret.length < 16) return { ok: false, error: 'That setup key is too short. Copy the whole key from GitHub.' };
  if (secret.length > MAX_SECRET) return { ok: false, error: 'That setup key is too long. Copy just the key GitHub shows.' };
  return { ok: true, account: { issuer: 'GitHub', label: fallbackLabel.slice(0, 60), secret, digits: 6, period: 30 } };
}
