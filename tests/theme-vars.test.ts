// Theme variables (the extension's "variables" box and `theme.custom.vars`), written from the user-facing spec
// (docs/EXTENSION.md § Variables, docs/DESIGN-FILE.md `theme.custom`) without reading the code under test.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as D from '../packages/design/src';
import { primerVars } from '../apps/extension/src/primer';

const {
  isVarName, varValueProblem, VARS_MAX, VAR_VALUE_MAX, tidyVars, formatVars, parseVars, effectiveVars,
  readDesignText, designToFile, encodeDesign, decodeDesign, DEFAULT_DESIGN, withCustom, resolveTokens, BACKGROUNDS,
} = D as any;

const BASE = primerVars(DEFAULT_DESIGN) as Record<string, string>;
const custom = (c: any) => ({ ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, custom: c } });
const fileText = (design: any) => { const f = designToFile(design, { name: 'x' }); return typeof f === 'string' ? f : JSON.stringify(f); };
// A code built by hand, so the encoder can't clean anything up first (like a code from another/older version).
const rawCode = (design: any) => 'GITLING1.' + Buffer.from(JSON.stringify(design)).toString('base64url');
const rawFile = (design: any) => JSON.stringify({ format: 'gitling.design', formatVersion: 1, name: 'Hand made', design });
const lines = (text: string) => text.split('\n');
const lineOf = (text: string, needle: string) => lines(text).findIndex((l) => l.includes(needle)) + 1;
const ownLines = (n: number) => Array.from({ length: n }, (_, i) => `--mine-${i}: ${i}px;`).join('\n');

describe('limits', () => {
  it('are 150 lines and 200 characters', () => {
    expect(VARS_MAX).toBe(150);
    expect(VAR_VALUE_MAX).toBe(200);
  });
});

describe('names: only --names, zoom and color-scheme', () => {
  const ok = ['--a', '--bgColor-default', '--fgColor-accent', '--borderRadius-medium', '--fontStack-monospace', '--gitling-acc',
    '--my_var', '--x1', '--button-primary-bgColor-rest', 'zoom', 'color-scheme'];
  const bad = ['', 'color', 'background', 'background-image', 'display', 'content', 'filter', 'behavior', '-x', '-webkit-x', 'zoom ',
    ' --a', '--a b', '--a;', '--a:', '--a{', '--a}', '--a(', '--a/*', '--a\\62', '--a<', '--a>', '--a\n', '--a@x', '__proto__',
    'constructor', 'toString', 'zoom:', 'color-scheme;'];
  for (const n of ok) it(`accepts ${JSON.stringify(n)}`, () => expect(isVarName(n)).toBe(true));
  for (const n of bad) it(`refuses ${JSON.stringify(n)}`, () => expect(isVarName(n)).toBe(false));
});

describe('values: allowed in any unit', () => {
  const ok = ['2px', '0.5rem', '1.1', '50%', '1.2em', '100vw', '#fff', '#A8B8FF', 'rgb(255 120 0)', 'rgb(255, 120, 0)',
    'rgba(0,0,0,.5)', 'hsl(200 50% 40%)', 'transparent', 'dark', 'light dark', 'Georgia, serif', '"Gitling Geist", sans-serif',
    "'Courier New', monospace", 'Curlz MT, cursive', 'calc(1rem + 2px)', 'var(--fgColor-accent)', 'color-mix(in srgb, red 20%, blue)',
    'x'.repeat(200)];
  for (const v of ok) it(`allows ${JSON.stringify(v.length > 40 ? `${v.slice(0, 10)}…(${v.length})` : v)}`, () => expect(varValueProblem(v)).toBeNull());
});

describe('values: refused if they could load or run anything', () => {
  const bad = [
    'url(x.png)', 'URL(x)', 'Url(x)', 'url (x)', 'URL (x)', 'url( "https://evil.example/a.png" )', 'rgb(0 0 0), url(https://evil.example/)',
    'image-set("a.png" 1x)', 'Image-Set("a.png" 1x)', 'IMAGE-SET("a.png" 1x)', 'image-set ("a.png" 1x)', '-webkit-image-set("a.png" 1x)',
    'image("a.png")', 'cross-fade(url(a), url(b))', 'element(#x)',
    '@import', '@import url(x)', '@media', 'a@b', '@',
    'javascript:alert(1)', 'JavaScript:alert(1)', 'JAVASCRIPT:x', 'x javascript:y',
    '1px;', '1px; color: red', 'a{', 'a}', '} body { background: red', '<', '>', '</style><script>alert(1)</script>',
    '\\75rl(x)', 'u\\72l(x)', '\\', 'a\\b',
    '1px\ncolor: red', '1px\r--x: 2px', '\n',
    'x'.repeat(201), 'x'.repeat(1000),
  ];
  for (const v of bad) it(`refuses ${JSON.stringify(v.length > 40 ? `${v.slice(0, 10)}…(${v.length})` : v)}`, () => {
    const p = varValueProblem(v);
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(0);
  });
});

describe('tidyVars keeps only valid entries', () => {
  it('drops bad names, bad values and non-strings', () => {
    expect(tidyVars({ '--a': '1px', color: 'red', '--b': 'url(x)', '--c': 3, '--d': null, zoom: '1.1', 'color-scheme': 'light', '--e': 'x'.repeat(201) }))
      .toEqual({ '--a': '1px', zoom: '1.1', 'color-scheme': 'light' });
  });
  it('nothing valid → undefined', () => {
    for (const x of [undefined, null, {}, 'x', 5, [], ['--a'], { color: 'red' }]) expect(tidyVars(x as any)).toBeUndefined();
  });
  it('keeps at most 150', () => {
    const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`--v${i}`, `${i}px`]));
    const t = tidyVars(many)!;
    expect(Object.keys(t).length).toBeLessThanOrEqual(150);
    expect(Object.keys(t).length).toBeGreaterThan(0);
  });
  it('a JSON __proto__ key does not pollute or survive', () => {
    const o = JSON.parse('{"__proto__": {"polluted": "yes"}, "--a": "1px"}');
    const t = tidyVars(o)!;
    expect(t).toEqual({ '--a': '1px' });
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(t, '__proto__')).toBe(false);
  });
});

describe('the box text (formatVars)', () => {
  it('lists every value Gitling writes, with its current value', () => {
    const text = formatVars(BASE, {});
    for (const [k, v] of Object.entries(BASE)) expect(text, k).toContain(`${k}: ${v};`);
    expect(Object.keys(BASE).length).toBeGreaterThan(40); // "about 65 lines"
  });
  it('base names appear once each (yours not repeated in the groups)', () => {
    const ov = { '--borderRadius-medium': '2px', '--fgColor-accent': 'rgb(255 120 0)' };
    const text = formatVars(BASE, ov);
    for (const k of Object.keys(BASE)) {
      const n = lines(text).filter((l) => l.trimStart().startsWith(`${k}:`)).length;
      expect(n, k).toBe(1);
    }
  });
  it('yours come first under /* yours */, the controls after', () => {
    const ov = { '--borderRadius-medium': '2px', '--my-own': '3px' };
    const text = formatVars(BASE, ov);
    const yours = lineOf(text, '/* yours */');
    expect(yours).toBeGreaterThan(0);
    const firstBase = Math.min(...Object.keys(BASE).filter((k) => !(k in ov)).map((k) => lineOf(text, `${k}:`)));
    expect(lineOf(text, '--borderRadius-medium: 2px;')).toBeGreaterThan(yours);
    expect(lineOf(text, '--my-own: 3px;')).toBeGreaterThan(yours);
    expect(lineOf(text, '--borderRadius-medium: 2px;')).toBeLessThan(firstBase);
    expect(lineOf(text, '--my-own: 3px;')).toBeLessThan(firstBase);
    expect(text).not.toContain(`--borderRadius-medium: ${BASE['--borderRadius-medium']};`);
  });
  it('the groups from the spec are there', () => {
    const text = formatVars(BASE, {}).toLowerCase();
    for (const g of ['page', 'type', 'shape', 'buttons and controls', 'text and links', 'backgrounds', 'borders and lines']) expect(text, g).toContain(g);
  });
  it('a bad override passed in never comes back out of the box as an override', () => {
    const text = formatVars(BASE, { '--x': 'url(https://evil.example/a)', color: 'red', '--ok': '1px' } as any);
    const r = parseVars(text, BASE);
    expect(r.overrides).toEqual({ '--ok': '1px' });
  });
});

describe('round trips (formatVars → edit → parseVars)', () => {
  const OV = { '--borderRadius-medium': '2px', '--fgColor-accent': 'rgb(255 120 0)', zoom: '1.1', '--fontStack-system': 'Georgia, serif',
    '--my-own-var': '3px', '--overlay-shadow': '0 0 0 1px #000' };
  it('unchanged text gives the same overrides and no errors', () => {
    expect(parseVars(formatVars(BASE, OV), BASE)).toEqual({ overrides: OV, errors: [] });
    expect(parseVars(formatVars(BASE, {}), BASE)).toEqual({ overrides: {}, errors: [] });
  });
  it('round trip is stable for any valid overrides (property)', () => {
    const name = fc.oneof(fc.constantFrom(...Object.keys(BASE)), fc.stringMatching(/^--[a-zA-Z][a-zA-Z0-9_-]{0,20}$/));
    const value = fc.oneof(fc.constantFrom('2px', '0.5rem', '50%', 'rgb(1 2 3)', 'Georgia, serif', '#123456', 'calc(1px + 1em)'),
      fc.integer({ min: 0, max: 999 }).map((n) => `${n}px`));
    fc.assert(fc.property(fc.dictionary(name, value, { maxKeys: 20 }), (ov) => {
      const want = Object.fromEntries(Object.entries(ov).filter(([k, v]) => BASE[k] !== v));
      const r = parseVars(formatVars(BASE, ov), BASE);
      expect(r.errors).toEqual([]);
      expect(r.overrides).toEqual(want);
    }), { numRuns: 200 });
  });
  it('changing a control line makes it yours', () => {
    const text = formatVars(BASE, {}).replace(`--bgColor-default: ${BASE['--bgColor-default']};`, '--bgColor-default: #102030;');
    expect(parseVars(text, BASE).overrides).toEqual({ '--bgColor-default': '#102030' });
  });
  it('setting a line back to the base value hands it back', () => {
    const text = formatVars(BASE, OV).replace('--fgColor-accent: rgb(255 120 0);', `--fgColor-accent: ${BASE['--fgColor-accent']};`);
    const r = parseVars(text, BASE);
    expect(r.overrides).not.toHaveProperty('--fgColor-accent');
    expect(Object.keys(r.overrides).length).toBe(Object.keys(OV).length - 1);
  });
  it('deleting your line hands it back', () => {
    const text = lines(formatVars(BASE, OV)).filter((l) => !l.startsWith('--borderRadius-medium: 2px')).join('\n');
    expect(parseVars(text, BASE).overrides).not.toHaveProperty('--borderRadius-medium');
  });
  it('an added line for a name Gitling never sets is kept', () => {
    const text = formatVars(BASE, {}) + '\n--diffBlob-addition-bgColor-num: #003300;\n';
    expect(parseVars(text, BASE).overrides).toEqual({ '--diffBlob-addition-bgColor-num': '#003300' });
  });
  it('the box text with only my lines (everything else deleted) parses to my lines', () => {
    expect(parseVars('--a: 1px;\nzoom: 1.25;\ncolor-scheme: light;', BASE).overrides).toEqual({ '--a': '1px', zoom: '1.25', 'color-scheme': 'light' });
  });
  it('empty values are a mistake', () => {
    for (const l of ['--a: ;', '--a:;', '--a:    ;']) expect(parseVars(l, BASE).errors.map((e: any) => e.line), l).toEqual([1]);
  });
  it('whitespace around name and value does not matter', () => {
    expect(parseVars('   --a   :    1px    ;   \n\t--b:2px;', BASE).overrides).toEqual({ '--a': '1px', '--b': '2px' });
  });
  it('empty text gives no overrides and no errors', () => {
    expect(parseVars('', BASE)).toEqual({ overrides: {}, errors: [] });
    expect(parseVars('\n\n   \n', BASE)).toEqual({ overrides: {}, errors: [] });
  });
  it('Windows line endings are fine', () => {
    expect(parseVars('--a: 1px;\r\n--b: 2px;\r\n', BASE)).toEqual({ overrides: { '--a': '1px', '--b': '2px' }, errors: [] });
  });
});

describe('mistakes are named by line', () => {
  it('a line that is not --name: value; is named with its number', () => {
    const r = parseVars('--a: 1px;\n\nhello there\n--b: 2px;', BASE);
    expect(r.errors.map((e: any) => e.line)).toEqual([3]);
    expect(r.errors[0].message).toMatch(/\S/);
  });
  it('a property that is not a --name, zoom or color-scheme is refused on its line', () => {
    for (const bad of ['color: red;', 'background: red;', 'display: none;', 'content: "x";', 'background-image: none;', '-webkit-x: 1;']) {
      const r = parseVars(`--a: 1px;\n${bad}`, BASE);
      expect(r.errors.map((e: any) => e.line), bad).toEqual([2]);
      expect(r.overrides, bad).toEqual({ '--a': '1px' });
    }
  });
  it('a refused value is named on its line and not taken', () => {
    const vals = ['url(https://evil.example/a.png)', 'URL (x)', 'Image-Set("a.png" 1x)', '@import', 'javascript:alert(1)', 'a\\62', '<b>', 'x'.repeat(201)];
    for (const v of vals) {
      const r = parseVars(`/* hi */\n--ok: 1px;\n--bad: ${v};`, BASE);
      expect(r.errors.map((e: any) => e.line), v).toEqual([3]);
      expect(r.overrides, v).toEqual({ '--ok': '1px' });
    }
  });
  it('a 200-character value is fine, 201 is not', () => {
    expect(parseVars(`--a: ${'x'.repeat(200)};`, BASE).errors).toEqual([]);
    expect(parseVars(`--a: ${'x'.repeat(201)};`, BASE).errors.length).toBe(1);
  });
  it('braces, extra semicolons and a second declaration on a line are not let through', () => {
    for (const l of ['--a: 1px; color: red;', '--a: 1px }', '--a: { x }', '} body { color: red; } --a: 1px;', '--a: 1px;;']) {
      const r = parseVars(l, BASE);
      for (const v of Object.values(r.overrides)) expect(varValueProblem(v as string), `${l} → ${v}`).toBeNull();
      expect(r.overrides, l).not.toHaveProperty('color');
    }
  });
  it('line numbers count the comment and blank lines in the real box text', () => {
    const text = formatVars(BASE, { '--a': '1px' });
    const broken = text.replace('--a: 1px;', '--a: url(x);');
    const r = parseVars(broken, BASE);
    expect(r.errors.map((e: any) => e.line)).toEqual([lineOf(broken, '--a: url(x);')]);
  });
  it('every bad line is named, in order', () => {
    const r = parseVars('nope\n--a: 1px;\ncolor: red;\n--b: url(x);\n--c: 2px;\n{', BASE);
    expect(r.errors.map((e: any) => e.line)).toEqual([1, 3, 4, 6]);
    expect(r.overrides).toEqual({ '--a': '1px', '--c': '2px' });
  });
  it('up to 150 lines of your own; 151 is a mistake', () => {
    expect(parseVars(ownLines(150), BASE).errors).toEqual([]);
    expect(Object.keys(parseVars(ownLines(150), BASE).overrides).length).toBe(150);
    const r = parseVars(ownLines(151), BASE);
    expect(r.errors.length).toBeGreaterThan(0);
    // "Mistakes are named by line": the error should point at a real line (1-based), e.g. the 151st
    for (const e of r.errors) expect(e.line, e.message).toBeGreaterThanOrEqual(1);
  });
  it('lines equal to the controls do not count toward 150', () => {
    const text = formatVars(BASE, {}) + '\n' + ownLines(150);
    expect(parseVars(text, BASE).errors).toEqual([]);
  });
});

describe('comments are ignored', () => {
  it('a whole-line comment, a trailing comment and a commented-out declaration', () => {
    const r = parseVars('/* note */\n--a: 1px; /* why */\n/* --b: 2px; */\n// not css', BASE);
    expect(r.overrides).toMatchObject({ '--a': '1px' });
    expect(r.overrides).not.toHaveProperty('--b');
  });
  it('a multi-line comment (with declarations inside) is skipped and line numbers stay right', () => {
    const r = parseVars('/* start\n--b: 2px;\ncolor: red;\nend */\n--a: 1px;\nbad line', BASE);
    expect(r.overrides).toEqual({ '--a': '1px' });
    expect(r.errors.map((e: any) => e.line)).toEqual([6]);
  });
  it('two comments on one line and a comment before the declaration', () => {
    expect(parseVars('/* a */ /* b */ --a: 1px;', BASE).overrides).toEqual({ '--a': '1px' });
  });
  it('an unclosed comment does not crash and does not quietly apply what follows', () => {
    const r = parseVars('--a: 1px;\n/* never closed\n--b: 2px;\ncolor: red;', BASE);
    expect(r.overrides).not.toHaveProperty('color');
    if ('--b' in r.overrides) expect(r.errors.length).toBeGreaterThan(0);
  });
  it('comments cannot be used to smuggle url( together', () => {
    for (const l of ['--a: ur/**/l(https://evil.example/x);', '--a: url/**/(https://evil.example/x);', '--a: image/* */-set("x" 1x);',
      '--a: java/**/script:alert(1);', '--a: /* x */url(x);']) {
      const r = parseVars(l, BASE);
      for (const v of Object.values(r.overrides)) {
        expect(String(v).toLowerCase(), l).not.toMatch(/url\s*\(|image-set|javascript:/);
        expect(varValueProblem(v as string), l).toBeNull();
      }
    }
  });
});

describe('parseVars never lets an unsafe override through (fuzz)', () => {
  const piece = fc.constantFrom('--a', '--fgColor-accent', 'zoom', 'color-scheme', 'color', ':', ';', ' ', '\t', '\n', '/*', '*/', 'url(', 'URL (',
    'image-set(', '@', 'javascript:', '{', '}', '<', '>', '\\', '"', "'", ')', '(', '1px', 'red', '#fff', 'rgb(1 2 3)', ',', '\r', ' ', '-', 'x');
  it('every override has an allowed name and value; errors point at real lines', () => {
    fc.assert(fc.property(fc.array(piece, { maxLength: 60 }), (parts) => {
      const text = parts.join('');
      const r = parseVars(text, BASE);
      for (const [k, v] of Object.entries(r.overrides)) {
        expect(isVarName(k), JSON.stringify(text)).toBe(true);
        expect(varValueProblem(v as string), JSON.stringify(text)).toBeNull();
      }
      const n = text.split(/\r\n|\r|\n/).length;
      for (const e of r.errors) { expect(Number.isInteger(e.line)).toBe(true); expect(e.line).toBeGreaterThanOrEqual(1); expect(e.line).toBeLessThanOrEqual(n + 1); }
      expect(Object.keys(r.overrides).length).toBeLessThanOrEqual(150);
    }), { numRuns: 2000 });
  });
  it('huge or pathological input stays fast', () => {
    const t = Date.now();
    parseVars('/*'.repeat(50000), BASE);
    parseVars('--a: ' + '('.repeat(100000) + ';', BASE);
    parseVars(('--a: ' + 'x '.repeat(5000) + ';\n').repeat(50), BASE);
    parseVars('url'.repeat(100000), BASE);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});

describe('effectiveVars', () => {
  it('base with valid overrides on top, new names added, bad ones ignored', () => {
    const e = effectiveVars(BASE, { '--fgColor-accent': '#ff7800', '--new-one': '4px', '--bad': 'url(x)', color: 'red' } as any);
    expect(e['--fgColor-accent']).toBe('#ff7800');
    expect(e['--new-one']).toBe('4px');
    expect(e).not.toHaveProperty('--bad');
    expect(e).not.toHaveProperty('color');
    for (const k of Object.keys(BASE)) if (k !== '--fgColor-accent') expect(e[k], k).toBe(BASE[k]);
  });
  it('no overrides → the base', () => {
    expect(effectiveVars(BASE, {})).toEqual(BASE);
    expect(effectiveVars(BASE, undefined as any)).toEqual(BASE);
  });
});

describe('variables travel with the design', () => {
  const VARS = { '--borderRadius-medium': '2px', '--fgColor-accent': 'rgb(255 120 0)', zoom: '1.1', '--fontStack-system': 'Georgia, serif' };
  const THEME = { name: 'Harbour', radius: 6, colors: { bg: '#102030', accent: '#FF8800' }, css: 'a{color:red}', vars: VARS };
  it('withCustom sets vars and keeps them valid', () => {
    expect(withCustom(DEFAULT_DESIGN, { vars: VARS }).theme.custom.vars).toEqual(VARS);
  });
  it('design code round-trip keeps theme.custom.vars', () => {
    const r = decodeDesign(encodeDesign(custom(THEME)));
    expect(r.ok).toBe(true);
    expect(r.design.theme.custom).toEqual(THEME);
  });
  it('design file round-trip keeps theme.custom.vars', () => {
    const r = readDesignText(fileText(custom(THEME)));
    expect(r.ok).toBe(true);
    expect(r.design.theme.custom.vars).toEqual(VARS);
  });
  it('vars-only custom theme round-trips', () => {
    expect(decodeDesign(encodeDesign(custom({ vars: { '--a': '1px' } }))).design.theme.custom).toEqual({ vars: { '--a': '1px' } });
  });
  it('150 vars fit in a code', () => {
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`--v${i}`, `${i}px`]));
    expect(decodeDesign(encodeDesign(custom({ vars: many }))).design.theme.custom.vars).toEqual(many);
  });
  for (const [label, read] of [['file', (d: any) => readDesignText(rawFile(d))], ['code', (d: any) => decodeDesign(rawCode(d))]] as const) {
    it(`${label}: one bad variable is left out on its own; the rest of the theme and the other vars load, and it is named`, () => {
      const d = { ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, accent: '#ABCDEF',
        custom: { ...THEME, vars: { ...VARS, '--evil': 'url(https://evil.example/x.png)' } } } };
      const r = read(d);
      expect(r.ok).toBe(true);
      expect(r.design.theme.accent).toBe('#ABCDEF');
      expect(r.design.theme.custom.name).toBe('Harbour');
      expect(r.design.theme.custom.radius).toBe(6);
      expect(r.design.theme.custom.colors).toEqual(THEME.colors);
      expect(r.design.theme.custom.css).toBe(THEME.css);
      expect(r.design.theme.custom.vars).toEqual(VARS);
      expect(JSON.stringify(r.dropped ?? [])).toContain('variable --evil');
      expect(JSON.stringify(r.design)).not.toContain('evil.example');
    });
    it(`${label}: a bad name (not a --name) is left out on its own and named`, () => {
      const r = read(custom({ name: 'N', vars: { '--a': '1px', 'background-image': 'none', zoom: '1.2' } }));
      expect(r.ok).toBe(true);
      expect(r.design.theme.custom).toEqual({ name: 'N', vars: { '--a': '1px', zoom: '1.2' } });
      expect(JSON.stringify(r.dropped ?? [])).toContain('variable background-image');
    });
    it(`${label}: several bad variables are each named; values with ; { } < > \\ @ are all refused`, () => {
      const bad = { '--s': 'a;b', '--b1': 'a{', '--b2': 'a}', '--lt': '<', '--gt': '>', '--bs': '\\75rl(x)', '--at': '@import', '--js': 'JavaScript:x', '--long': 'x'.repeat(201), '--nl': 'a\nb' };
      const r = read(custom({ vars: { '--ok': '1px', ...bad } }));
      expect(r.ok).toBe(true);
      expect(r.design.theme.custom?.vars).toEqual({ '--ok': '1px' });
      const dropped = JSON.stringify(r.dropped ?? []);
      for (const k of Object.keys(bad)) expect(dropped, k).toContain(`variable ${k}`);
    });
    it(`${label}: vars that are not an object do not stop the design loading`, () => {
      for (const vars of ['--a: 1px', 5, ['--a'], null]) {
        const r = read({ ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, accent: '#ABCDEF', custom: { name: 'N', radius: 3, vars } } });
        expect(r.ok, JSON.stringify(vars)).toBe(true);
        expect(r.design.theme.accent).toBe('#ABCDEF');
        expect(r.design.theme.custom?.vars).toBeUndefined();
      }
    });
    it(`${label}: more than 150 vars still loads, with at most 150`, () => {
      const many = Object.fromEntries(Array.from({ length: 160 }, (_, i) => [`--v${i}`, `${i}px`]));
      const r = read(custom({ name: 'Big', vars: many }));
      expect(r.ok).toBe(true);
      expect(Object.keys(r.design.theme.custom?.vars ?? {}).length).toBeLessThanOrEqual(150);
    });
  }
  it('old designs (no vars) are unchanged', () => {
    for (const bg of Object.keys(BACKGROUNDS)) {
      const d = { ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, background: bg } };
      expect(decodeDesign(encodeDesign(d)).design).toEqual(d);
      expect(readDesignText(fileText(d)).design).toEqual(d);
      expect(decodeDesign(rawCode(d)).design).toEqual(d);
    }
    const r = readDesignText(rawFile(custom({ name: 'Old', radius: 4 })));
    expect(r.design.theme.custom).toEqual({ name: 'Old', radius: 4 });
    expect(JSON.stringify(r.dropped ?? [])).not.toMatch(/variable/);
  });
  it('the app keeps vars in the design but ignores them', () => {
    const plain = custom({ name: 'X', colors: { bg: '#102030' } });
    const withVars = custom({ name: 'X', colors: { bg: '#102030' }, vars: { '--bgColor-default': '#ff0000', zoom: '2', '--fontStack-system': 'serif' } });
    expect(JSON.stringify(resolveTokens(withVars))).toBe(JSON.stringify(resolveTokens(plain)));
    expect(JSON.stringify(resolveTokens(custom({ vars: { zoom: '2' } })))).toBe(JSON.stringify(resolveTokens(DEFAULT_DESIGN)));
  });
  it('the zod schema refuses a bad variable', () => {
    expect(D.CustomTheme.safeParse({ vars: { '--a': '1px' } }).success).toBe(true);
    expect(D.CustomTheme.safeParse({ vars: { '--a': 'url(x)' } }).success).toBe(false);
    expect(D.CustomTheme.safeParse({ vars: { color: 'red' } }).success).toBe(false);
  });
});
