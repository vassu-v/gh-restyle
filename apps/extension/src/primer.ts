import { resolveTokens, type Design } from '@gitling/design';

/**
 * Map a Gitling design onto GitHub's own Primer design tokens.
 * Overriding tokens (not class names) keeps the skin working when GitHub changes its markup.
 */
export function primerVars(design: Design): Record<string, string> {
  const t = resolveTokens(design);
  const c = t.c;
  const radius = design.theme.tiles === 'plain' ? 12 : 10;
  return {
    '--bgColor-default': c.bg,
    '--bgColor-muted': c.el,
    '--bgColor-inset': c.bg,
    '--bgColor-emphasis': c.line2,
    '--bgColor-neutral-muted': c.el2,
    '--bgColor-accent-muted': c.accSoft,
    '--bgColor-accent-emphasis': c.acc,
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
    '--button-default-borderColor-rest': c.line2,
    '--fontStack-system': '"Gitling Geist", -apple-system, "Segoe UI", sans-serif',
    '--fontStack-sansSerif': '"Gitling Geist", -apple-system, "Segoe UI", sans-serif',
    '--fontStack-monospace': '"Gitling Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    '--borderRadius-medium': `${radius / 16}rem`,
    '--borderRadius-large': `${(radius + 4) / 16}rem`,
    '--gitling-num-font': t.numbers === 'dot' ? '"Gitling Doto"' : t.numbers === 'mono' ? '"Gitling Geist Mono"' : '"Gitling Geist"',
    'color-scheme': t.mode,
  };
}
