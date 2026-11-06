import { runs } from './runs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUNDS, contrast, decodeDesign, Design, encodeDesign, fit, inkOn, isSafeLink, isSafeTemplate, resolveTokens, SectionId, TileTarget, type HomeSection,
} from '../../packages/design/src';

/* ─── arbitraries built from schema.ts constraints ─── */

const hexColor = fc.tuple(fc.integer({ min: 0, max: 0xffffff }), fc.boolean())
  .map(([n, up]) => { const h = n.toString(16).padStart(6, '0'); return '#' + (up ? h.toUpperCase() : h); });

const repoChar = fc.constantFrom(...'abcxyzABZ019_.-'.split(''));
const repoPart = fc.stringOf(repoChar, { minLength: 1, maxLength: 12 });
const repo = fc.tuple(repoPart, repoPart).map(([a, b]) => `${a}/${b}`);
const nonEmpty = fc.fullUnicodeString({ minLength: 1, maxLength: 20 });

const linkUrl = fc.oneof(
  fc.webUrl({ withQueryParameters: true, withFragments: true }),
  fc.emailAddress().map((e) => `mailto:${e}`),
);

const target = fc.oneof(
  fc.record({ type: fc.constant('search' as const), q: nonEmpty }),
  fc.record({ type: fc.constant('repo' as const), repo, tab: fc.constantFrom('overview', 'issues', 'prs', 'code', 'commits') }),
  fc.record({ type: fc.constant('user' as const), login: nonEmpty }),
  fc.record({ type: fc.constant('file' as const), repo, path: fc.fullUnicodeString({ maxLength: 30 }) }),
  fc.record({ type: fc.constant('inbox' as const), filter: fc.constantFrom('all', 'review_requested', 'mention', 'assign', 'author', 'comment', 'ci_activity') }),
  fc.record({ type: fc.constant('link' as const), url: linkUrl }),
  fc.record({
    type: fc.constant('ask' as const),
    prompt: nonEmpty,
    template: fc.tuple(fc.webUrl(), fc.fullUnicodeString({ maxLength: 8 })).map(([u, s]) => `${u}${u.includes('?') ? '&' : '?'}q=${encodeURIComponent(s)}{query}`),
    dest: fc.constantFrom('issues' as const, 'repos' as const, 'link' as const),
  }),
).filter((t) => TileTarget.safeParse(t).success);

const tile = fc.record({
  id: fc.fullUnicodeString({ maxLength: 12 }),
  label: nonEmpty,
  icon: fc.string({ maxLength: 12 }),
  tint: hexColor,
  count: fc.boolean(),
  size: fc.constantFrom('half' as const, 'full' as const),
  target,
});

const tabs = fc.shuffledSubarray(['home', 'feed', 'inbox', 'repos'] as const, { minLength: 1, maxLength: 4 })
  .chain((rest) => fc.integer({ min: 0, max: rest.length }).map((i) => [...rest.slice(0, i), 'studio' as const, ...rest.slice(i)]));

export const designArb: fc.Arbitrary<Design> = fc.record({
  version: fc.constant(1 as const),
  skin: fc.constant('signal' as const),
  theme: fc.record({
    accent: hexColor,
    background: fc.constantFrom('graphite' as const, 'black' as const, 'paper' as const),
    numbers: fc.constantFrom('dot' as const, 'mono' as const, 'sans' as const),
    tiles: fc.constantFrom('window' as const, 'plain' as const),
    density: fc.integer({ min: 1, max: 5 }),
    textScale: fc.double({ min: 0.85, max: 1.3, noNaN: true }),
  }),
  nav: fc.record({ tabs }),
  home: fc.record({
    // Every built-in once plus a few search sections, in any order and on/off, at least one on (the schema refuses
    // duplicates and an empty Home; loading adds missing built-ins).
    sections: fc.tuple(
      fc.shuffledSubarray([...SectionId.options], { minLength: SectionId.options.length, maxLength: SectionId.options.length }),
      fc.array(fc.record({ title: fc.string({ minLength: 1, maxLength: 40 }), q: fc.string({ minLength: 1, maxLength: 256 }), visible: fc.boolean() }), { maxLength: 4 }),
      fc.array(fc.boolean(), { minLength: SectionId.options.length, maxLength: SectionId.options.length }),
      fc.nat(),
    ).map(([ids, searches, on, at]) => {
      const all: HomeSection[] = ids.map((id, i) => ({ id, visible: on[i] }));
      searches.forEach((s, i) => all.splice(at % (all.length + 1), 0, { id: `q-${i}`, ...s }));
      if (!all.some((s) => s.visible)) all[at % all.length].visible = true;
      return all;
    }),
  }),
  tiles: fc.array(tile, { maxLength: 24 }),
}) as fc.Arbitrary<Design>;

describe('design share codes', () => {
  it('the arbitrary only produces schema-valid designs', () => {
    fc.assert(fc.property(designArb, (d) => { expect(Design.safeParse(d).success).toBe(true); }), { numRuns: runs(200) });
  });

  it('decodeDesign(encodeDesign(d)) round-trips', () => {
    fc.assert(fc.property(designArb, (d) => {
      const r = decodeDesign(encodeDesign(d));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.design).toEqual(d);
    }), { numRuns: runs(300) });
  });

  it('survives surrounding whitespace', () => {
    fc.assert(fc.property(designArb, fc.constantFrom(' ', '\n', '\t', '\r\n  '), (d, ws) => {
      expect(decodeDesign(ws + encodeDesign(d) + ws).ok).toBe(true);
    }), { numRuns: runs(50) });
  });

  it('never throws on arbitrary strings', () => {
    const any = fc.oneof(fc.string(), fc.fullUnicodeString(), fc.fullUnicodeString().map((s) => 'GITLING1.' + s), fc.base64String().map((s) => 'GITLING1.' + s));
    fc.assert(fc.property(any, (s) => {
      const r = decodeDesign(s);
      if (r.ok) expect(Design.safeParse(r.design).success).toBe(true);
      else expect(typeof r.error).toBe('string');
    }), { numRuns: runs(1000) });
  });

  it('never throws on mutated codes; anything accepted is schema-valid', () => {
    const mutation = fc.record({ kind: fc.constantFrom('replace', 'insert', 'delete', 'truncate'), at: fc.nat(), ch: fc.fullUnicode() });
    fc.assert(fc.property(designArb, fc.array(mutation, { minLength: 1, maxLength: 4 }), (d, muts) => {
      let code = encodeDesign(d);
      for (const m of muts) {
        const i = code.length ? m.at % code.length : 0;
        if (m.kind === 'replace') code = code.slice(0, i) + m.ch + code.slice(i + 1);
        else if (m.kind === 'insert') code = code.slice(0, i) + m.ch + code.slice(i);
        else if (m.kind === 'delete') code = code.slice(0, i) + code.slice(i + 1);
        else code = code.slice(0, i);
      }
      const r = decodeDesign(code);
      if (r.ok) expect(Design.safeParse(r.design).success).toBe(true);
      else expect(typeof r.error).toBe('string');
    }), { numRuns: runs(300) });
  });

  it('JSON that does not match the schema is refused, not thrown', () => {
    const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    fc.assert(fc.property(fc.jsonValue(), (v) => {
      const r = decodeDesign('GITLING1.' + b64(JSON.stringify(v)));
      if (r.ok) expect(Design.safeParse(r.design).success).toBe(true);
    }), { numRuns: runs(300) });
  });
});

/* ─── isSafeLink ─── */

/** Independent oracle: the scheme the WHATWG URL parser would see (after the same trim + {query} substitution). */
function oracleScheme(s: string): string | null {
  const t = s.trim().replace(/\{query\}/g, 'q').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(t);
  return m ? m[1].toLowerCase() : null;
}

const junk = fc.constantFrom('\t', '\n', '\r', ' ', '\u0000', '\u0001', '\u001f', ' ', '​', '﻿', '%09', '%0a', '&#x09;', '\\', '{query}', ' ');
const scheme = fc.constantFrom('javascript', 'data', 'vbscript', 'file', 'blob', 'about', 'filesystem', 'http', 'https', 'mailto', 'jar', 'view-source', 'intent', 'obsidian', 'tel');
const caseMix = (s: string) => fc.array(fc.boolean(), { minLength: s.length, maxLength: s.length }).map((bs) => s.split('').map((c, i) => (bs[i] ? c.toUpperCase() : c)).join(''));
const sprinkle = (s: string) => fc.array(fc.tuple(fc.nat({ max: s.length }), junk), { maxLength: 4 })
  .map((ins) => { let out = s; for (const [i, j] of ins.sort((a, b) => b[0] - a[0])) out = out.slice(0, i) + j + out.slice(i); return out; });
const trickyUrl = fc.tuple(scheme.chain(caseMix).chain(sprinkle), fc.constantFrom(':', '%3a', '&colon;', ':'), fc.constantFrom('alert(1)', '//evil.com/', 'text/html,<script>', '//x', 'a@b.c', ''), fc.array(junk, { maxLength: 2 }), fc.array(junk, { maxLength: 2 }))
  .map(([sc, colon, rest, pre, post]) => pre.join('') + sc + colon + rest + post.join(''));

/** Schemes that run code or content in the opening page; isSafeLink must never let one through. */
const DANGEROUS = ['javascript', 'data', 'vbscript', 'blob', 'file', 'about', 'filesystem', 'view-source'];

describe('isSafeLink', () => {
  it('never true for a dangerous scheme (tricky schemes)', () => {
    fc.assert(fc.property(trickyUrl, (u) => {
      if (isSafeLink(u)) {
        expect(oracleScheme(u)).not.toBeNull();
        expect(DANGEROUS).not.toContain(oracleScheme(u));
        expect(DANGEROUS.map((d) => d + ':')).not.toContain(new URL(u.trim().replace(/\{query\}/g, 'q')).protocol);
      }
    }), { numRuns: runs(1000) });
  });

  it('never true for a dangerous scheme (arbitrary strings)', () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.fullUnicodeString(), fc.webUrl()), (u) => {
      if (isSafeLink(u)) expect(DANGEROUS).not.toContain(oracleScheme(u));
    }), { numRuns: runs(1000) });
  });

  it('a safe ask template stays safe after the app substitutes any query (ask.tsx: replace + encodeURIComponent)', () => {
    const tmpl = fc.tuple(trickyUrl, fc.nat(), fc.constantFrom('', '/', '?q=')).map(([u, i, mid]) => { const k = i % (u.length + 1); return u.slice(0, k) + mid + '{query}' + u.slice(k); });
    fc.assert(fc.property(fc.oneof(tmpl, fc.webUrl().map((u) => u + '{query}')), fc.fullUnicodeString(), (t, q) => {
      fc.pre(isSafeTemplate(t));
      const final = t.replace('{query}', encodeURIComponent(q));
      let proto: string | null = null;
      try { proto = new URL(final).protocol; } catch { /* unparseable is fine: nothing opens */ }
      if (proto) expect(DANGEROUS.map((d) => d + ':')).not.toContain(proto);
    }), { numRuns: runs(500) });
  });
});

/* ─── contrast / fit / resolveTokens ─── */

describe('contrast fitting', () => {
  it('contrast is symmetric and within [1, 21]', () => {
    fc.assert(fc.property(hexColor, hexColor, (a, b) => {
      const c = contrast(a, b);
      expect(c).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(c).toBeLessThanOrEqual(21 + 1e-9);
      expect(Math.abs(c - contrast(b, a))).toBeLessThan(1e-12);
    }), { numRuns: runs(1000) });
  });

  it('fit() reaches 4.5:1 on every built-in background', () => {
    const bg = fc.constantFrom(...Object.values(BACKGROUNDS).map((b) => b.palette.bg));
    fc.assert(fc.property(hexColor, bg, (c, b) => { expect(contrast(fit(c, b), b)).toBeGreaterThanOrEqual(4.5); }), { numRuns: runs(1000) });
  });

  it('fit() reaches the stated minimum (default 4.5) on arbitrary backgrounds', () => {
    fc.assert(fc.property(hexColor, hexColor, (c, b) => { expect(contrast(fit(c, b), b)).toBeGreaterThanOrEqual(4.5); }), { numRuns: runs(1000), examples: [['#000000', '#996b00']] });
  });

  it('fit() reaches min=3 on arbitrary backgrounds', () => {
    fc.assert(fc.property(hexColor, hexColor, (c, b) => { expect(contrast(fit(c, b, 3), b)).toBeGreaterThanOrEqual(3); }), { numRuns: runs(1000) });
  });

  it('fit() leaves an already-readable color alone and always returns #rrggbb', () => {
    fc.assert(fc.property(hexColor, hexColor, (c, b) => {
      const out = fit(c, b);
      expect(out).toMatch(/^#[0-9a-fA-F]{6}$/);
      if (contrast(c, b) >= 4.5) expect(out).toBe(c);
    }), { numRuns: runs(1000) });
  });

  it('inkOn picks the better of white / near-black', () => {
    fc.assert(fc.property(hexColor, (c) => {
      const ink = inkOn(c);
      expect(contrast(ink, c)).toBeGreaterThanOrEqual(Math.min(contrast('#FFFFFF', c), contrast('#111111', c)));
    }), { numRuns: runs(1000) });
  });

  it('resolveTokens never throws for valid designs and the accent reads on its background', () => {
    fc.assert(fc.property(designArb, (d) => {
      const t = resolveTokens(d);
      expect(contrast(t.c.acc, t.c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(Number.isFinite(t.rowPad) && Number.isFinite(t.gap)).toBe(true);
      expect(Number.isFinite(t.scale(14))).toBe(true);
    }), { numRuns: runs(300) });
  });
});
