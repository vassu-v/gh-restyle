import { Design } from './schema';

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

export type DecodeResult = { ok: true; design: Design } | { ok: false; error: string };

export function decodeDesign(code: string): DecodeResult {
  const raw = code.trim();
  if (!raw.startsWith(PREFIX)) return { ok: false, error: 'That is not a Gitling design code. It starts with GITLING1.' };
  let json: unknown;
  try { json = JSON.parse(fromB64Url(raw.slice(PREFIX.length))); } catch { return { ok: false, error: 'This code is incomplete. Copy it again in full.' }; }
  const parsed = Design.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'This code is from a newer version or was changed by hand.' };
  return { ok: true, design: parsed.data };
}
