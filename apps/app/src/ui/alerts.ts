// GitHub alert blockquotes: "> [!NOTE]" on the first line of a quote turns it into a labelled callout.
// Pure (no React Native) so it can be unit-tested.

export type AlertKind = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
export const ALERT_LABEL: Record<AlertKind, string> = { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' };

/**
 * If the quote's markdown starts with an alert marker, returns its kind and the rest of the quote's markdown.
 * Like GitHub: the marker must be alone on the first line (case-insensitive); anything else is a plain quote.
 */
export function alertOf(quoteText: string): { kind: AlertKind; rest: string } | null {
  const m = /^[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i.exec(quoteText);
  if (!m) return null;
  return { kind: m[1].toUpperCase() as AlertKind, rest: quoteText.slice(m[0].length) };
}
