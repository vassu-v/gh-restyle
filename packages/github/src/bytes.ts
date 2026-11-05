/*
 * Byte helpers with no platform APIs. React Native's fetch has no reliable `arrayBuffer()`, and Hermes'
 * TextDecoder doesn't support `fatal`, so applying suggestions can't depend on either. Everything here is plain
 * code that behaves the same in browsers, Node, workers and Hermes.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

/** Standard base64 (GitHub's contents API; it wraps lines with \n, which is skipped). Throws on bad input. */
export function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/[\r\n\s]/g, '').replace(/=+$/, '');
  if (clean.length % 4 === 1) throw new Error('bad base64');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0, bits = 0, o = 0;
  for (const c of clean) {
    const v = B64_INDEX.get(c);
    if (v === undefined) throw new Error('bad base64');
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out;
}

export function base64Encode(bytes: Uint8Array): string {
  let out = '', i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) { const n = bytes[i] << 16; out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '=='; }
  if (rest === 2) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8); out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='; }
  return out;
}

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/**
 * Strict UTF-8 → string, or null when the bytes aren't valid UTF-8 (overlong forms, surrogates, code points past
 * U+10FFFF, truncated sequences). A BOM is kept as U+FEFF so the caller decides what to do with it.
 */
export function utf8DecodeStrict(b: Uint8Array): string | null {
  const parts: string[] = []; let chunk: number[] = [];
  for (let i = 0; i < b.length;) {
    const x = b[i];
    let cp: number, n: number;
    if (x < 0x80) { cp = x; n = 1; }
    else if (x >= 0xc2 && x <= 0xdf) { cp = x & 0x1f; n = 2; }
    else if (x >= 0xe0 && x <= 0xef) { cp = x & 0x0f; n = 3; }
    else if (x >= 0xf0 && x <= 0xf4) { cp = x & 0x07; n = 4; }
    else return null;
    if (i + n > b.length) return null;
    for (let k = 1; k < n; k++) { const y = b[i + k]; if ((y & 0xc0) !== 0x80) return null; cp = (cp << 6) | (y & 63); }
    if ((n === 3 && cp < 0x800) || (n === 4 && (cp < 0x10000 || cp > 0x10ffff)) || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    chunk.push(cp); i += n;
    if (chunk.length >= 8192) { parts.push(String.fromCodePoint(...chunk)); chunk = []; }
  }
  parts.push(String.fromCodePoint(...chunk));
  return parts.join('');
}
