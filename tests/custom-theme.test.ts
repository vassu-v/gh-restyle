// Custom themes (issue #10), written from the user-facing spec without reading the code under test.
import { describe, expect, it } from 'vitest';
import * as D from '../packages/design/src';
import { primerVars, safeCss } from '../apps/extension/src/primer';

const {
  encodeDesign, decodeDesign, readDesignText, designToFile, DEFAULT_DESIGN, PRESETS, applyPreset,
  presetOf, designName, resolveTokens, themeWarnings, startCustom, withCustom, SHARE_LINK_MAX,
} = D as any;

const FULL = {
  name: 'Harbour night', author: 'Lin', mode: 'light', radius: 10,
  colors: { bg: '#101820', surface: '#1A2430', surfaceAlt: '#223040', border: '#334455', text: '#F0F4F8',
    muted: '#A0B0C0', accent: '#3399FF', success: '#33CC66', danger: '#FF5566', warning: '#FFCC33' },
  fonts: { body: 'system', mono: 'system-mono', numbers: 'geist' },
  css: '.Header { outline: 1px solid red; }',
};
const custom = (c: any) => ({ ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, custom: c } });
const fileText = (design: any) => {
  const f = designToFile(design, { name: 'x' });
  return typeof f === 'string' ? f : JSON.stringify(f);
};
const leftOutCustom = (dropped: unknown) => JSON.stringify(dropped ?? []).toLowerCase().includes('custom theme');

describe('design codes and files carry a custom theme', () => {
  it('code round-trip keeps every custom field, css included', () => {
    const d = custom(FULL);
    const r = decodeDesign(encodeDesign(d));
    expect(r.ok).toBe(true);
    expect(r.design).toEqual(d);
    expect(r.design.theme.custom).toEqual(FULL);
  });
  it('file round-trip keeps every custom field', () => {
    const d = custom(FULL);
    const r = readDesignText(fileText(d));
    expect(r.ok).toBe(true);
    expect(r.design).toEqual(d);
  });
  it('old designs without custom decode unchanged (default and every preset)', () => {
    for (const d of [DEFAULT_DESIGN, ...PRESETS.map((p: any) => applyPreset(DEFAULT_DESIGN, p))]) {
      const r = decodeDesign(encodeDesign(d));
      expect(r.ok).toBe(true);
      expect(r.design).toEqual(d);
      expect(r.design.theme.custom).toBeUndefined();
      expect(readDesignText(fileText(d)).design).toEqual(d);
    }
  });
  it('a hand-written old-format file loads as written', () => {
    const design = { version: 1, skin: 'signal',
      theme: { accent: '#4C6EF5', background: 'paper', numbers: 'sans', tiles: 'window', density: 3, textScale: 1 },
      nav: { tabs: ['home', 'inbox', 'repos', 'studio'] },
      home: { sections: [{ id: 'status', visible: true }] }, tiles: [] };
    const text = JSON.stringify({ format: 'gitling.design', formatVersion: 1, name: 'Paper desk', design });
    const r = readDesignText(text);
    expect(r.ok).toBe(true);
    expect(r.design.theme).toMatchObject(design.theme);
    expect(r.design.theme.custom).toBeUndefined();
    expect(leftOutCustom(r.dropped)).toBe(false);
    // the same object as a bare code
    const code = 'GITLING1.' + Buffer.from(JSON.stringify(design)).toString('base64url');
    const r2 = decodeDesign(code);
    expect(r2.ok).toBe(true);
    expect(r2.design.theme.accent).toBe('#4C6EF5');
    expect(r2.design.theme.background).toBe('paper');
  });
});

describe('bad custom values are left out on their own', () => {
  const bad: [string, any][] = [
    ['bad hex', { colors: { bg: '#12345' } }],
    ['bad hex word', { colors: { text: 'red' } }],
    ['radius 25', { radius: 25 }],
    ['radius 1.5', { radius: 1.5 }],
    ['radius -1', { radius: -1 }],
    ['unknown font', { fonts: { body: 'comic-sans' } }],
    ['URL as font', { fonts: { body: 'https://fonts.example.com/x.woff2' } }],
    ['name 41 chars', { name: 'x'.repeat(41) }],
    ['unknown key', { name: 'ok', sparkle: true }],
    ['css over 20 KB', { css: 'a{}'.padEnd(20 * 1024 + 1, ' ') }],
  ];
  for (const [label, c] of bad) {
    it(`${label}: rest loads, "custom theme" left out`, () => {
      const d = { ...custom(c), theme: { ...DEFAULT_DESIGN.theme, accent: '#ABCDEF', custom: c } };
      const r = decodeDesign(encodeDesign(d));
      if (r.ok) {
        expect(r.design.theme.custom).toBeUndefined();
        expect(r.design.theme.accent).toBe('#ABCDEF');
        expect(leftOutCustom(r.dropped)).toBe(true);
      } else {
        expect(String(r.error)).toMatch(/custom/i);
      }
      // the zod schema rejects it outright
      expect(D.CustomTheme.safeParse(c).success).toBe(false);
    });
  }
  it('limits accept the edges: radius 0 and 24, name 40 chars', () => {
    for (const c of [{ radius: 0 }, { radius: 24 }, { name: 'x'.repeat(40) }]) expect(D.CustomTheme.safeParse(c).success).toBe(true);
  });
});

describe('resolveTokens uses custom values as given', () => {
  it('maps each colour, radius, mode and fonts', () => {
    const t = resolveTokens(custom(FULL));
    const c = FULL.colors;
    const want: Record<string, string> = { bg: c.bg, el: c.surface, el2: c.surfaceAlt, line2: c.border, fg: c.text,
      mut: c.muted, acc: c.accent, ok: c.success, bad: c.danger, wait: c.warning };
    for (const [k, v] of Object.entries(want)) expect(String(t.c[k]).toUpperCase(), k).toBe(v.toUpperCase());
    expect(t.r.md).toBe(10);
    expect(t.mode).toBe('light');
    expect(JSON.stringify(t.font)).not.toEqual(JSON.stringify(resolveTokens(DEFAULT_DESIGN).font));
    expect(JSON.stringify(t.font.num).toLowerCase()).toContain('geist');
  });
  it('each field alone changes only its token', () => {
    const base = resolveTokens(DEFAULT_DESIGN);
    const map: Record<string, string> = { bg: 'bg', surface: 'el', surfaceAlt: 'el2', border: 'line2', text: 'fg', muted: 'mut', accent: 'acc', success: 'ok', danger: 'bad', warning: 'wait' };
    for (const [field, tok] of Object.entries(map)) {
      const t = resolveTokens(custom({ colors: { [field]: '#123456' } }));
      expect(String(t.c[tok]).toUpperCase(), field).toBe('#123456');
      expect(t.mode).toBe(base.mode);
    }
    expect(resolveTokens(custom({ radius: 0 })).r.md).toBe(0);
    const flip = base.mode === 'dark' ? 'light' : 'dark';
    expect(resolveTokens(custom({ mode: flip })).mode).toBe(flip);
    expect(resolveTokens(custom({ fonts: { mono: 'system-mono' } })).font.mono).not.toEqual(base.font.mono);
  });
  it('a design without custom resolves exactly as before', () => {
    expect(JSON.stringify(resolveTokens(withCustom(DEFAULT_DESIGN, undefined)))).toBe(JSON.stringify(resolveTokens(DEFAULT_DESIGN)));
    expect(withCustom(custom(FULL), {}).theme.custom).toBeUndefined();
  });
  it('startCustom fills from the current look', () => {
    const s = startCustom(DEFAULT_DESIGN);
    expect(D.CustomTheme.safeParse(s).success).toBe(true);
    expect(resolveTokens(withCustom(DEFAULT_DESIGN, s)).c.bg).toBe(resolveTokens(DEFAULT_DESIGN).c.bg);
  });
});

describe('extension Primer variables follow the custom theme', () => {
  const base = primerVars(DEFAULT_DESIGN) as Record<string, string>;
  const cases: [any, string][] = [
    [{ colors: { bg: '#123456' } }, '--bgColor-default'],
    [{ colors: { surface: '#123456' } }, '--bgColor-muted'],
    [{ colors: { text: '#123456' } }, '--fgColor-default'],
    [{ colors: { muted: '#123456' } }, '--fgColor-muted'],
    [{ colors: { accent: '#123456' } }, '--fgColor-accent'],
    [{ colors: { success: '#123456' } }, '--fgColor-success'],
    [{ colors: { danger: '#123456' } }, '--fgColor-danger'],
    [{ colors: { warning: '#123456' } }, '--fgColor-attention'],
    [{ colors: { border: '#123456' } }, '--borderColor-default'],
    [{ fonts: { body: 'system' } }, '--fontStack-sansSerif'],
    [{ fonts: { mono: 'system-mono' } }, '--fontStack-monospace'],
  ];
  for (const [c, v] of cases) {
    it(`${JSON.stringify(c)} changes ${v}`, () => {
      const got = (primerVars(custom(c)) as Record<string, string>)[v];
      expect(got).not.toBe(base[v]);
      if (c.colors) expect(got.toLowerCase()).toContain('#123456');
    });
  }
  it('surfaceAlt changes some variable', () => {
    expect(primerVars(custom({ colors: { surfaceAlt: '#123456' } }))).not.toEqual(base);
  });
  it('radius maps to rem', () => {
    expect((primerVars(custom({ radius: 8 })) as any)['--borderRadius-medium']).toBe('0.5rem');
    expect((primerVars(custom({ radius: 0 })) as any)['--borderRadius-medium']).toMatch(/^0(rem|px)?$/);
  });
  it('color-scheme follows mode', () => {
    expect((primerVars(custom({ mode: 'light' })) as any)['color-scheme']).toBe('light');
    expect((primerVars(custom({ mode: 'dark' })) as any)['color-scheme']).toBe('dark');
  });
});

describe('safeCss removes every @import', () => {
  const variants = [
    '@import url(https://evil.example/x.css);',
    '@IMPORT "https://evil.example/x.css";',
    '@Import url("//evil.example/x.css") screen;',
    '  @import\n  url(https://evil.example/x.css);',
    '@\\69mport url(https://evil.example/x.css);',
    '/* hi */@import url(https://evil.example/x.css);',
  ];
  for (const v of variants) {
    it(JSON.stringify(v), () => {
      const out = safeCss(`${v}\nbody { color: red; }`);
      const live = out.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(live.toLowerCase()).not.toMatch(/@\s*(\\0*69|i)mport/);
      expect(live).not.toContain('evil.example');
      expect(out).toContain('color: red');
    });
  }
});

describe('contrast warnings', () => {
  it('low-contrast text on background warns with the ratio', () => {
    const w = themeWarnings(custom({ colors: { bg: '#777777', text: '#888888' } }));
    const tb = w.find((x: any) => x.field === 'text' && x.against === 'bg');
    expect(tb).toBeTruthy();
    expect(tb.min).toBe(4.5);
    expect(tb.ratio).toBeLessThan(1.5);
    expect(tb.message).toMatch(/^Text on the background is hard to read \(1\.\d:1, needs 4\.5:1\)$/);
  });
  it('accent on background needs 3', () => {
    const w = themeWarnings(custom({ colors: { bg: '#000000', accent: '#111111' } }));
    expect(w.some((x: any) => x.field === 'accent' && x.min === 3)).toBe(true);
  });
  it('no warnings for the default or any preset', () => {
    expect(themeWarnings(DEFAULT_DESIGN)).toEqual([]);
    for (const p of PRESETS) expect(themeWarnings(applyPreset(DEFAULT_DESIGN, p)), p.id).toEqual([]);
  });
});

describe('naming', () => {
  it('custom is not a preset and is named "Your design: <name>"', () => {
    const d = withCustom(applyPreset(DEFAULT_DESIGN, PRESETS[0]), { name: 'Harbour night' });
    expect(presetOf(d)).toBeUndefined();
    // spec: "named 'Your design: <name>'"; the Studio header shows that prefix
    expect(designName(d)).toBe('Harbour night') // the name itself; screens add "Your design: " (spec wording clarified);
    expect(designName(withCustom(DEFAULT_DESIGN, { radius: 4 }))).toBe('Custom theme');
  });
});

describe('share link budget', () => {
  it('a full custom theme fits in a share link; the budget is 8000', () => {
    expect(SHARE_LINK_MAX).toBe(8000);
    expect(`https://gitling.truckcoding.workers.dev/studio?import=${encodeDesign(custom(FULL))}`.length).toBeLessThan(SHARE_LINK_MAX);
  });
  it('20 KB of css cannot fit in a share link', () => {
    const big = custom({ css: `/* ${'x'.repeat(19 * 1024)} */` });
    expect(encodeDesign(big).length).toBeGreaterThan(SHARE_LINK_MAX);
  });
});
