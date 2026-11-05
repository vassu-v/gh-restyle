import { describe, expect, it } from 'vitest';
import { contrast, decodeDesign, DEFAULT_DESIGN, encodeDesign, fit, isSafeLink, resolveTokens, salvageDesign, type Design } from '../src';

describe('design', () => {
  it('share codes round-trip', () => {
    const code = encodeDesign(DEFAULT_DESIGN);
    expect(code.startsWith('GITLING1.')).toBe(true);
    const r = decodeDesign(code);
    expect(r.ok && r.design).toEqual(DEFAULT_DESIGN);
  });
  it('rejects broken codes without throwing', () => {
    expect(decodeDesign('GITLING1.!!!').ok).toBe(false);
    expect(decodeDesign('hello').ok).toBe(false);
  });
  it('fit() always reaches the requested contrast', () => {
    for (const bg of ['#0E0F11', '#FFFFFF', '#F4F1EA']) for (const c of ['#F2C25B', '#5BD69A', '#7AA2FF', '#FF7A5C']) {
      expect(contrast(fit(c, bg, 3.2), bg)).toBeGreaterThanOrEqual(3.2);
    }
  });
  it('resolves tokens for every background', () => {
    for (const background of ['graphite', 'black', 'paper'] as const) {
      const t = resolveTokens({ ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, background } });
      expect(contrast(t.c.fg, t.c.bg)).toBeGreaterThan(7);
    }
  });
});

import { applyPreset, Design, describeDesign, PRESETS, presetOf } from '../src';

describe('presets', () => {
  it('are all valid, distinct and readable', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      const d = applyPreset(DEFAULT_DESIGN, p);
      expect(Design.safeParse(d).success).toBe(true);
      const t = resolveTokens(d);
      expect(contrast(t.c.acc, t.c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.c.fg, t.c.bg)).toBeGreaterThan(7);
    }
  });
  it('only change the theme', () => {
    const d = applyPreset(DEFAULT_DESIGN, PRESETS[1]);
    expect(d.tiles).toEqual(DEFAULT_DESIGN.tiles);
    expect(d.nav).toEqual(DEFAULT_DESIGN.nav);
    expect(presetOf(d)?.id).toBe('terminal');
  });
  it('the default design is the Signal preset', () => {
    expect(presetOf(DEFAULT_DESIGN)?.id).toBe('signal');
    expect(describeDesign(DEFAULT_DESIGN)).toMatch(/^Signal · 5 tabs/);
  });
  it('app links open; schemes that run code in the page do not', () => {
    for (const ok of ['https://github.com/x', 'http://a.b/?q={query}', 'mailto:a@b.c', 'obsidian://open?vault=x', 'tel:+15551234', 'sms:123', 'slack://open', 'gitling://repo/a/b']) expect(isSafeLink(ok)).toBe(true);
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java	script:alert(1)', 'data:text/html,<b>', 'vbscript:x', 'blob:https://x.y/1', 'file:///etc/passwd', 'about:blank', 'not a url', 'javascript:alert({query})'])
      expect(isSafeLink(bad), bad).toBe(false);
  });
  it('share codes carrying javascript: link or ask tiles are rejected', () => {
    const tile = (target: unknown) => ({ ...DEFAULT_DESIGN, tiles: [{ ...DEFAULT_DESIGN.tiles[0], id: 'x', target }] }) as unknown as Design;
    expect(decodeDesign(encodeDesign(tile({ type: 'link', url: 'javascript:alert(1)' }))).ok).toBe(false);
    expect(decodeDesign(encodeDesign(tile({ type: 'ask', prompt: 'p', template: 'javascript:x({query})', dest: 'link' }))).ok).toBe(false);
    expect(decodeDesign(encodeDesign(tile({ type: 'link', url: 'https://github.com' }))).ok).toBe(true);
  });
  it('ask templates must spell out their scheme before {query}', async () => {
    const { isSafeTemplate } = await import('../src');
    expect(isSafeTemplate('https://x.y/search?q={query}')).toBe(true);
    expect(isSafeTemplate('obsidian://search?q={query}')).toBe(true);
    for (const bad of ['{query}script:alert(1)', '{query}', ' {query}:x', 'javascript:{query}']) expect(isSafeTemplate(bad), bad).toBe(false);
  });
  it('salvage keeps every valid part of a saved design and names what it dropped', () => {
    const good = { ...DEFAULT_DESIGN.tiles[0], id: 'ok', label: 'Notes', target: { type: 'link', url: 'obsidian://open' } };
    const bad = { ...DEFAULT_DESIGN.tiles[0], id: 'bad', label: 'Evil', target: { type: 'link', url: 'javascript:alert(1)' } };
    const saved = { ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, accent: '#123456' }, tiles: [good, bad] };
    const r = salvageDesign(saved, DEFAULT_DESIGN)!;
    expect(r.design.theme.accent).toBe('#123456');
    expect(r.design.tiles.map((t) => t.id)).toEqual(['ok']);
    expect(r.dropped).toEqual(['tile “Evil”']);
    expect(salvageDesign(DEFAULT_DESIGN, DEFAULT_DESIGN)).toEqual({ design: DEFAULT_DESIGN, dropped: [] });
    const brokenTheme = salvageDesign({ ...DEFAULT_DESIGN, theme: { accent: 'red' } }, DEFAULT_DESIGN)!;
    expect(brokenTheme.design.theme).toEqual(DEFAULT_DESIGN.theme);
    expect(brokenTheme.dropped).toEqual(['theme']);
    expect(salvageDesign('junk', DEFAULT_DESIGN)).toBeNull();
  });
});

describe('sample tiles', () => {
  it('spots targets on the sample account and nothing else', async () => {
    const { isSampleTarget, DEFAULT_DESIGN } = await import('../src');
    expect(DEFAULT_DESIGN.tiles.filter((t) => isSampleTarget(t.target)).map((t) => t.id)).toEqual(['t-repo', 't-actions']);
    expect(isSampleTarget({ type: 'repo', repo: 'youth/x', tab: 'overview' })).toBe(false);
    expect(isSampleTarget({ type: 'link', url: 'https://github.com/young/x' })).toBe(false);
    expect(isSampleTarget({ type: 'link', url: 'https://example.com/you/x' })).toBe(false);
    expect(isSampleTarget({ type: 'user', login: 'you' })).toBe(true);
  });
});
