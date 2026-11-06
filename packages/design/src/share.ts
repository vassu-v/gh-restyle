import { type Design, salvageDesign } from './schema';
import { DEFAULT_DESIGN } from './signal';

const PREFIX = 'GITLING1.';

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** A design as a short code people can paste on another device (or into the desktop extension). */
export function encodeDesign(d: Design): string {
  return PREFIX + toB64Url(JSON.stringify(d));
}

/** `dropped`: parts left out because this version doesn't accept them (e.g. an unsafe link tile), as for files. */
export type DecodeResult = { ok: true; design: Design; dropped: string[] } | { ok: false; error: string };

export function decodeDesign(code: string): DecodeResult {
  const raw = code.trim();
  if (!raw.startsWith(PREFIX)) return { ok: false, error: 'That is not a Gitling design code. It starts with GITLING1.' };
  let json: unknown;
  try { json = JSON.parse(fromB64Url(raw.slice(PREFIX.length))); } catch { return { ok: false, error: 'This code is incomplete. Copy it again in full.' }; }
  // Same salvage as files and stored designs: one part this version rejects (say, an unsafe link tile) is left out
  // and named, instead of refusing the whole code. A code with nothing usable is still refused.
  const got = salvageDesign(json, DEFAULT_DESIGN);
  if (!got || (['theme', 'nav', 'home'] as const).every((k) => got.dropped.includes(k))) return { ok: false, error: 'This code is from a newer version or was changed by hand.' };
  return { ok: true, design: got.design, dropped: got.dropped };
}
