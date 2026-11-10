// Deep imports keep zod out of the content script (see storage.ts).
import type { Design } from '@gitling/design/src/schema';
import { fit, mix, modeOf, numbersOf, resolveTokens } from '@gitling/design/src/tokens';

/** CSS font stacks for each font a design can choose (all bundled with the extension, or the computer's own). */
const SANS = '"Gitling Geist", -apple-system, "Segoe UI", sans-serif';
const MONO = '"Gitling Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SYSTEM_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export function fontStacks(design: Design) {
  const f = design.theme.custom?.fonts;
  const body = f?.body === 'geist-mono' ? MONO : f?.body === 'system' ? SYSTEM_SANS : SANS;
  const mono = f?.mono === 'system-mono' ? SYSTEM_MONO : MONO;
  const n = numbersOf(design);
  return { body, mono, num: n === 'dot' ? '"Gitling Doto"' : n === 'mono' ? '"Gitling Geist Mono"' : '"Gitling Geist"' };
}

/** The radius (px) GitHub's medium corners get: a custom theme's, else from the Corners setting. */
export const radiusOf = (design: Design) => design.theme.custom?.radius ?? (design.theme.tiles === 'plain' ? 12 : 10);

/** Custom CSS made safe to inject as text: no remote @import (or any @import), at most 20 KB. */
export function safeCss(css: string | undefined): string {
  if (!css) return '';
  return css.slice(0, 20 * 1024).replace(/@import\b[^;]*;?/gi, '/* @import removed */').replace(/<\/style/gi, '<\\/style');
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Map a Gitling design onto GitHub's own Primer design tokens.
 * Overriding tokens (not class names) keeps the skin working when GitHub changes its markup.
 */
export function primerVars(design: Design): Record<string, string> {
  const t = resolveTokens(design);
  const c = t.c;
  const radius = radiusOf(design);
  const fonts = fontStacks(design);
  const mode = modeOf(design);
  return {
    '--bgColor-default': c.bg,
    '--bgColor-muted': c.el,
    '--bgColor-inset': c.bg,
    '--bgColor-emphasis': c.line2,
    '--bgColor-neutral-muted': c.el2,
    '--bgColor-accent-muted': c.accSoft,
    // GitHub puts white text on accent-emphasis (skip link, badges, selected items). Our accents are pastel,
    // so deepen the same hue until white reads at 4.5:1.
    '--bgColor-accent-emphasis': fit(c.acc, '#FFFFFF', 4.5),
    '--overlay-bgColor': c.el,
    '--card-bgColor': c.el,
    '--fgColor-default': c.fg,
    '--fgColor-muted': c.mut,
    '--fgColor-accent': c.acc,
    '--fgColor-link': c.acc,
    '--fgColor-success': c.ok,
    '--fgColor-open': c.ok,
    '--fgColor-danger': c.bad,
    '--fgColor-closed': c.bad,
    '--fgColor-attention': c.wait,
    '--fgColor-done': c.merged,
    '--borderColor-default': c.line2,
    '--borderColor-muted': c.line,
    '--borderColor-accent-emphasis': c.acc,
    '--header-bgColor': c.glass,
    '--header-borderColor-divider': c.line,
    '--underlineNav-borderColor-active': c.acc,
    // Signal's primary action is a quiet white (or ink, on Paper) pill instead of green.
    '--button-primary-bgColor-rest': c.fg,
    '--button-primary-bgColor-hover': c.mut,
    '--button-primary-bgColor-active': c.mut,
    '--button-primary-fgColor-rest': c.onFg,
    '--button-primary-borderColor-rest': 'transparent',
    '--button-default-bgColor-rest': c.el2,
    '--button-default-bgColor-hover': mix(c.el2, c.fg, 0.08),
    '--button-default-bgColor-active': mix(c.el2, c.fg, 0.12),
    '--button-default-borderColor-rest': c.line2,
    '--button-default-fgColor-rest': c.fg,
    '--button-invisible-fgColor-rest': c.fg,
    '--control-fgColor-rest': c.fg,
    '--control-bgColor-rest': c.el2,
    '--control-bgColor-hover': mix(c.el2, c.fg, 0.08),
    '--fgColor-warning': c.wait,
    '--bgColor-success-emphasis': fit(c.ok, '#FFFFFF', 4.5),
    '--bgColor-danger-emphasis': fit(c.bad, '#FFFFFF', 4.5),
    '--fontStack-system': fonts.body,
    '--fontStack-sansSerif': fonts.body,
    '--fontStack-sansSerifDisplay': fonts.body,
    '--fontStack-monospace': fonts.mono,
    '--borderRadius-medium': `${radius / 16}rem`,
    '--borderRadius-large': `${(radius + 8) / 16}rem`,
    // Our own copies: some GitHub regions (the signed-out header) re-scope Primer tokens, so content.css uses these.
    '--gitling-bg': c.bg,
    '--gitling-el': c.el,
    '--gitling-fg': c.fg,
    '--gitling-line': c.line,
    '--gitling-line2': c.line2,
    '--gitling-el2': c.el2,
    '--gitling-mut': c.mut,
    '--gitling-acc': c.acc,
    '--gitling-acc-soft': c.accSoft,
    '--borderRadius-default': `${radius / 16}rem`,
    '--gitling-panel-radius': `${(radius + 8) / 16}rem`,
    '--gitling-num-font': fonts.num,
    '--gitling-font': fonts.body,
    '--gitling-mono-font': fonts.mono,
    '--gitling-ok': c.ok,
    '--gitling-bad': c.bad,
    '--gitling-wait': c.wait,
    '--gitling-radius': `${radius / 16}rem`,
    'color-scheme': mode,
    // Text size from Studio: the whole page scales evenly (CSS zoom, like the browser's own zoom). Scaling only
    // rem sizes broke GitHub's px-sized columns (cut-off times, squashed avatars). 100% leaves GitHub as it is.
    ...(design.theme.textScale !== 1 ? { zoom: String(round(design.theme.textScale)) } : {}),
  };
}
