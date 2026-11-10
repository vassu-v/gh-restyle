import type { CustomColor, CustomTheme, Design } from './schema';
import { BACKGROUNDS, type Palette } from './signal';

export type Tokens = {
  mode: 'dark' | 'light';
  c: Palette & { acc: string; onAcc: string; accSoft: string };
  font: {
    ui: { regular: string; medium: string; semibold: string; bold: string };
    mono: { regular: string; medium: string };
    /** family for big instrument numbers */
    num: string;
  };
  numbers: Design['theme']['numbers'];
  tiles: Design['theme']['tiles'];
  /** vertical padding for list rows, from density */
  rowPad: number;
  gap: number;
  scale: (px: number) => number;
  r: { sm: number; md: number; lg: number; xl: number; pill: number };
};

export const FONT_FAMILIES = {
  ui: { regular: 'Geist_400Regular', medium: 'Geist_500Medium', semibold: 'Geist_600SemiBold', bold: 'Geist_700Bold' },
  mono: { regular: 'GeistMono_400Regular', medium: 'GeistMono_500Medium' },
  dot: 'Doto_800ExtraBold',
};

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (a: number[]) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = (h: string) => { const c = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Nudge a user-picked color until it reads on the background. */
export const fit = (c: string, bg: string, min = 4.5) => {
  // Head for whichever extreme reads better on this background (the white/black crossover is at luminance
  // ~0.179, not 0.2), and allow going all the way: every background reaches at least ~4.58 against one of them.
  const toward = contrast('#FFFFFF', bg) >= contrast('#000000', bg) ? '#FFFFFF' : '#000000';
  let out = c; let t = 0;
  while (contrast(out, bg) < min && t < 1) { t = Math.min(1, t + 0.04); out = mix(c, toward, t); }
  return out;
};
export const inkOn = (c: string) => (contrast(c, '#FFFFFF') >= contrast(c, '#111111') ? '#FFFFFF' : '#111111');

/** The device's own fonts, for the "system" choices of a custom theme. */
export const SYSTEM_FONTS = { ui: 'system-ui', mono: 'ui-monospace' } as const;

/** The number style a custom theme's numbers font stands for (content.css and the app size each one). */
export const numbersOf = (design: Design): Design['theme']['numbers'] => {
  const f = design.theme.custom?.fonts?.numbers;
  return f === 'doto' ? 'dot' : f === 'geist-mono' ? 'mono' : f === 'geist' ? 'sans' : design.theme.numbers;
};

/** Dark or light: the custom theme's mode, else what its background reads as, else the preset background's. */
export const modeOf = (design: Design): 'dark' | 'light' => {
  const c = design.theme.custom;
  if (c?.mode) return c.mode;
  if (c?.colors?.bg) return lum(c.colors.bg) > 0.18 ? 'light' : 'dark';
  return BACKGROUNDS[design.theme.background].mode;
};

const rgba = (h: string, a: number) => `rgba(${hex(h).join(',')},${a})`;

/** The palette with every custom colour applied. Custom colours are used as given: never nudged (see themeWarnings). */
function customPalette(p: Palette, mode: 'dark' | 'light', colors: NonNullable<CustomTheme['colors']>): Palette {
  const bg = colors.bg ?? p.bg;
  const el = colors.surface ?? (colors.bg ? mix(bg, mode === 'dark' ? '#FFFFFF' : '#000000', mode === 'dark' ? 0.04 : 0) : p.el);
  const el2 = colors.surfaceAlt ?? (colors.bg || colors.surface ? mix(el, mode === 'dark' ? '#FFFFFF' : '#000000', 0.05) : p.el2);
  const line2 = colors.border ?? (colors.bg || colors.surface ? mix(el, mode === 'dark' ? '#FFFFFF' : '#000000', 0.12) : p.line2);
  const line = colors.border ? mix(bg, colors.border, 0.7) : colors.bg || colors.surface ? mix(el, mode === 'dark' ? '#FFFFFF' : '#000000', 0.08) : p.line;
  const fg = colors.text ?? p.fg;
  const mut = colors.muted ?? (colors.text ? mix(fg, bg, 0.4) : p.mut);
  const touched = !!(colors.bg || colors.surface || colors.surfaceAlt);
  return {
    ...p, bg, el, el2, line, line2, fg, mut,
    dim: colors.muted || colors.text || colors.bg ? mix(mut, bg, 0.35) : p.dim,
    ok: colors.success ?? p.ok, bad: colors.danger ?? p.bad, wait: colors.warning ?? p.wait,
    glass: touched ? rgba(mix(el, el2, 0.5), 0.8) : p.glass,
    glassBorder: touched ? rgba(mode === 'dark' ? '#FFFFFF' : '#000000', 0.08) : p.glassBorder,
    onFg: colors.text || colors.bg ? (contrast(bg, fg) >= 4.5 ? bg : inkOn(fg)) : p.onFg,
  };
}

export function resolveTokens(design: Design): Tokens {
  const bg = BACKGROUNDS[design.theme.background];
  const custom = design.theme.custom;
  const mode = modeOf(design);
  const p = custom?.colors ? customPalette(bg.palette, mode, custom.colors) : bg.palette;
  // A preset accent is fitted to the background; an accent the person picked in a custom theme is kept as is.
  const acc = custom?.colors?.accent ?? fit(design.theme.accent, p.bg, 4.5);
  const s = design.theme.textScale;
  const numbers = numbersOf(design);
  const numFamily = numbers === 'dot' ? FONT_FAMILIES.dot : numbers === 'mono' ? FONT_FAMILIES.mono.medium : FONT_FAMILIES.ui.semibold;
  const body = custom?.fonts?.body;
  const ui = body === 'geist-mono' ? { regular: FONT_FAMILIES.mono.regular, medium: FONT_FAMILIES.mono.medium, semibold: FONT_FAMILIES.mono.medium, bold: FONT_FAMILIES.mono.medium }
    : body === 'system' ? { regular: SYSTEM_FONTS.ui, medium: SYSTEM_FONTS.ui, semibold: SYSTEM_FONTS.ui, bold: SYSTEM_FONTS.ui } : FONT_FAMILIES.ui;
  const mono = custom?.fonts?.mono === 'system-mono' ? { regular: SYSTEM_FONTS.mono, medium: SYSTEM_FONTS.mono } : FONT_FAMILIES.mono;
  const R = custom?.radius;
  return {
    mode,
    c: { ...p, acc, onAcc: inkOn(acc), accSoft: mix(p.el, acc, mode === 'dark' ? 0.16 : 0.12) },
    font: { ui, mono, num: numFamily },
    numbers,
    tiles: design.theme.tiles,
    rowPad: [6, 8, 10, 12, 15][design.theme.density - 1],
    gap: [8, 9, 10, 12, 14][design.theme.density - 1],
    scale: (px) => Math.round(px * s * 10) / 10,
    r: R === undefined ? { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } : { sm: Math.max(0, R - 4), md: R, lg: R + 4, xl: R + 8, pill: 999 },
  };
}

/** Minimum contrast for each readable pair a custom theme can set. */
const CHECKS: { fg: CustomColor; on: CustomColor; min: number; what: string }[] = [
  { fg: 'text', on: 'bg', min: 4.5, what: 'Text on the background' },
  { fg: 'text', on: 'surface', min: 4.5, what: 'Text on panels' },
  { fg: 'muted', on: 'bg', min: 3, what: 'Muted text on the background' },
  { fg: 'accent', on: 'bg', min: 3, what: 'Accent on the background' },
  { fg: 'success', on: 'bg', min: 3, what: 'Success on the background' },
  { fg: 'danger', on: 'bg', min: 3, what: 'Danger on the background' },
  { fg: 'warning', on: 'bg', min: 3, what: 'Warning on the background' },
];
export type ThemeWarning = { field: CustomColor; against: CustomColor; ratio: number; min: number; message: string };

/**
 * Pairs in a custom theme that are hard to read. Shown in the editors; the colours stay as the person picked them.
 * Only pairs where at least one side is a custom colour are checked (presets are already readable).
 */
export function themeWarnings(design: Design): ThemeWarning[] {
  const colors = design.theme.custom?.colors;
  if (!colors) return [];
  const t = resolveTokens(design);
  const value: Record<CustomColor, string> = { bg: t.c.bg, surface: t.c.el, surfaceAlt: t.c.el2, border: t.c.line2, text: t.c.fg, muted: t.c.mut, accent: t.c.acc, success: t.c.ok, danger: t.c.bad, warning: t.c.wait };
  return CHECKS.flatMap(({ fg, on, min, what }) => {
    if (!colors[fg] && !colors[on]) return [];
    const ratio = Math.round(contrast(value[fg], value[on]) * 100) / 100;
    return ratio < min ? [{ field: fg, against: on, ratio, min, message: `${what} is hard to read (${ratio.toFixed(1)}:1, needs ${min}:1)` }] : [];
  });
}
