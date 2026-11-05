import { decodeDesign } from './share';
import { Design, salvageDesign } from './schema';
import { DEFAULT_DESIGN } from './signal';

/**
 * The Gitling design file (`*.gitling.json`): a person's whole setup (look, tab bar, home layout, shortcuts) as
 * a readable JSON file they can keep, edit by hand, put in a repo or gist, and load on another device.
 * Format reference: docs/DESIGN-FILE.md. JSON Schema: apps/app/public/design.schema.json.
 *
 *   { "format": "gitling.design", "formatVersion": 1, "name": "…", "exportedAt": "…", "design": { …Design } }
 *
 * `design` is exactly the Design document the app stores (packages/design/src/schema.ts), so share codes,
 * files and storage all carry the same thing in different wrappers.
 */
export const DESIGN_FILE_FORMAT = 'gitling.design';
export const DESIGN_FILE_VERSION = 1;
export const DESIGN_FILE_EXT = '.gitling.json';
/** Files bigger than this aren't a design (24 tiles of text fit in a few KB). */
export const DESIGN_FILE_MAX_BYTES = 256 * 1024;

export type DesignFile = { format: typeof DESIGN_FILE_FORMAT; formatVersion: number; name?: string; exportedAt?: string; design: Design };

/** Pretty-printed file text, stable key order, ending with a newline (diff-friendly in a repo). */
export function designToFile(design: Design, opts: { name?: string; now?: Date } = {}): string {
  const file: DesignFile & { $schema: string } = {
    $schema: 'https://gitling.truckcoding.workers.dev/design.schema.json',
    format: DESIGN_FILE_FORMAT,
    formatVersion: DESIGN_FILE_VERSION,
    ...(opts.name?.trim() ? { name: opts.name.trim().slice(0, 80) } : {}),
    exportedAt: (opts.now ?? new Date()).toISOString(),
    design,
  };
  return JSON.stringify(file, null, 2) + '\n';
}

/** A file name for a design: "gitling-<name or preset>-2026-11-05.gitling.json". */
export function designFileName(name: string | undefined, now = new Date()): string {
  const slug = (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `gitling-${slug ? slug + '-' : ''}${now.toISOString().slice(0, 10)}${DESIGN_FILE_EXT}`;
}

export type ReadResult =
  | { ok: true; design: Design; name?: string; dropped: string[] }
  | { ok: false; error: string };

/**
 * Reads anything a person might load as a design, so "Open a file" and the paste box accept the same things:
 * a design file, a bare Design JSON object, a GITLING1 share code, or a share link containing one.
 * Parts a newer/older schema rejects are left out and named in `dropped` (same salvage as stored designs).
 */
export function readDesignText(text: string): ReadResult {
  if (text.length > DESIGN_FILE_MAX_BYTES) return { ok: false, error: 'That file is too big to be a Gitling design.' };
  const raw = text.replace(/^﻿/, '').trim();
  if (!raw) return { ok: false, error: 'That file is empty.' };

  if (!/^[{[]/.test(raw)) {
    // A share link (…/studio?import=GITLING1.…) or a bare code.
    let code = raw;
    const m = /[?&]import=([^&\s#]+)/.exec(raw);
    if (m) { try { code = decodeURIComponent(m[1]); } catch { code = m[1]; } }
    const r = decodeDesign(code);
    return r.ok ? { ok: true, design: r.design, dropped: [] } : { ok: false, error: r.error };
  }

  let json: unknown;
  try { json = JSON.parse(raw); } catch { return { ok: false, error: "That file isn't valid JSON. It may be cut off or edited by hand." }; }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, error: "That file isn't a Gitling design." };
  const o = json as Record<string, unknown>;

  let body: unknown = json;
  let name: string | undefined;
  if ('format' in o || 'design' in o) {
    if (o.format !== DESIGN_FILE_FORMAT) return { ok: false, error: "That file isn't a Gitling design (its format isn't gitling.design)." };
    if (typeof o.formatVersion !== 'number' || o.formatVersion < 1) return { ok: false, error: 'That design file has no format version.' };
    if (o.formatVersion > DESIGN_FILE_VERSION) return { ok: false, error: 'That design file is from a newer Gitling. Update the app and try again.' };
    body = o.design;
    if (typeof o.name === 'string') name = o.name.slice(0, 80);
  } else if (!('theme' in o)) {
    return { ok: false, error: "That file isn't a Gitling design." };
  }

  const got = salvageDesign(body, DEFAULT_DESIGN);
  if (!got) return { ok: false, error: "That file's design couldn't be read." };
  return { ok: true, design: got.design, name, dropped: got.dropped };
}
