import { CUSTOM_COLORS, CUSTOM_FONTS, type CustomColor, type CustomTheme, type Design } from './schema';
import { modeOf, resolveTokens } from './tokens';

/**
 * Wording and helpers for the "Custom theme" editor. The app's Studio and the extension's settings page both use
 * these, so the two editors show the same fields, in the same order, with the same words.
 */
export const CUSTOM_COLOR_LABELS: Record<CustomColor, { label: string; hint: string }> = {
  bg: { label: 'Background', hint: 'Behind everything.' },
  surface: { label: 'Panels', hint: 'Cards, menus, boxes.' },
  surfaceAlt: { label: 'Raised', hint: 'Buttons, inputs, counters.' },
  border: { label: 'Borders', hint: 'Lines between things.' },
  text: { label: 'Text', hint: 'Body text and titles.' },
  muted: { label: 'Muted text', hint: 'Times, hints, secondary text.' },
  accent: { label: 'Accent', hint: 'Links, selected tabs, focus.' },
  success: { label: 'Success', hint: 'Open, passing, merged checks.' },
  danger: { label: 'Danger', hint: 'Closed, failing, delete.' },
  warning: { label: 'Warning', hint: 'Pending, attention.' },
};
export const CUSTOM_FONT_LABELS: Record<keyof typeof CUSTOM_FONTS, string> = { body: 'Text font', mono: 'Code font', numbers: 'Numbers font' };
export const FONT_NAMES: Record<string, string> = { geist: 'Geist', 'geist-mono': 'Geist Mono', system: 'System', 'system-mono': 'System mono', doto: 'Doto (dots)' };
export const CUSTOM_CSS_NOTE = 'Applies on github.com only (the browser extension). The app ignores it.';
export const CUSTOM_CSS_NOTICE = 'This design includes custom CSS for github.com. It can change how any GitHub page looks. Apply it only if you trust where the design came from.';

/** The colours, fonts and radius this design shows now: where a new custom theme starts. */
export function startCustom(design: Design): CustomTheme {
  const t = resolveTokens(design);
  const c = t.c;
  const n = t.numbers;
  return {
    ...design.theme.custom,
    mode: modeOf(design),
    radius: t.r.md,
    colors: { bg: c.bg, surface: c.el, surfaceAlt: c.el2, border: c.line2, text: c.fg, muted: c.mut, accent: c.acc, success: c.ok, danger: c.bad, warning: c.wait, ...design.theme.custom?.colors },
    fonts: { body: 'geist', mono: 'geist-mono', numbers: n === 'dot' ? 'doto' : n === 'mono' ? 'geist-mono' : 'geist', ...design.theme.custom?.fonts },
  };
}

/** The value a field shows when the custom theme leaves it unset (what "reset" goes back to). */
export function derivedColor(design: Design, k: CustomColor): string {
  const without = { ...design, theme: { ...design.theme, custom: { ...design.theme.custom, colors: { ...design.theme.custom?.colors, [k]: undefined } } } };
  const c = resolveTokens(without).c;
  return { bg: c.bg, surface: c.el, surfaceAlt: c.el2, border: c.line2, text: c.fg, muted: c.mut, accent: c.acc, success: c.ok, danger: c.bad, warning: c.wait }[k];
}

/** Drops empty parts so a custom theme stays small in design codes; `undefined` when nothing is left. */
export function tidyCustom(c: CustomTheme | undefined): CustomTheme | undefined {
  if (!c) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v === undefined || v === '') continue;
    if (typeof v === 'object') {
      const inner = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== ''));
      if (Object.keys(inner).length) out[k] = inner;
    } else out[k] = v;
  }
  return Object.keys(out).length ? (out as CustomTheme) : undefined;
}

/** The design with its custom theme replaced (tidied; removed when empty). */
export function withCustom(design: Design, custom: CustomTheme | undefined): Design {
  const { custom: _old, ...theme } = design.theme;
  const tidy = tidyCustom(custom);
  return { ...design, theme: tidy ? { ...theme, custom: tidy } : theme };
}
