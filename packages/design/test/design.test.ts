import { describe, expect, it } from 'vitest';
import { contrast, decodeDesign, DEFAULT_DESIGN, encodeDesign, fit, resolveTokens } from '../src';

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
});
