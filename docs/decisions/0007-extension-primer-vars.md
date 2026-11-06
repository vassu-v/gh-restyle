# 0007: Desktop extension styles GitHub through Primer CSS variables

**Decision.** Override GitHub's Primer design tokens (`--bgColor-*`, `--fgColor-*`, `--fontStack-*`)
through CSSOM `setProperty` on `<html>`, plus a small static `content.css` (fonts, counters, pill buttons).
Avoid selectors on GitHub's generated class names.

**Why.** GitHub renames classes often, but its tokens are a public contract. CSSOM writes aren't blocked
by github.com's Content-Security-Policy.

**Consequences.** Pages that don't use Primer tokens keep GitHub's colors. One known case is the signed-out
marketing header.
