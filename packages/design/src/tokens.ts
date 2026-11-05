import type { Design } from './schema';
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

export function resolveTokens(design: Design): Tokens {
  const bg = BACKGROUNDS[design.theme.background];
  const p = bg.palette;
  const acc = fit(design.theme.accent, p.bg, 4.5);
  const s = design.theme.textScale;
  const numFamily = design.theme.numbers === 'dot' ? FONT_FAMILIES.dot : design.theme.numbers === 'mono' ? FONT_FAMILIES.mono.medium : FONT_FAMILIES.ui.semibold;
  return {
    mode: bg.mode,
    c: { ...p, acc, onAcc: inkOn(acc), accSoft: mix(p.el, acc, bg.mode === 'dark' ? 0.16 : 0.12) },
    font: { ui: FONT_FAMILIES.ui, mono: FONT_FAMILIES.mono, num: numFamily },
    numbers: design.theme.numbers,
    tiles: design.theme.tiles,
    rowPad: [6, 8, 10, 12, 15][design.theme.density - 1],
    gap: [8, 9, 10, 12, 14][design.theme.density - 1],
    scale: (px) => Math.round(px * s * 10) / 10,
    r: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },
  };
}
