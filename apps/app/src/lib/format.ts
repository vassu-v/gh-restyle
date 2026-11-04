export function rel(t: string) {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dayGroup(t: string): 'today' | 'yesterday' | 'this week' | 'earlier' {
  const d = new Date(t).getTime(); const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (d >= start) return 'today';
  if (d >= start - 86400e3) return 'yesterday';
  if (d >= start - 6 * 86400e3) return 'this week';
  return 'earlier';
}

export function groupBy<T>(items: T[], key: (t: T) => string) {
  const out: { key: string; items: T[] }[] = [];
  for (const it of items) {
    const k = key(it); const last = out[out.length - 1];
    if (last && last.key === k) last.items.push(it); else out.push({ key: k, items: [it] });
  }
  return out;
}

export const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
export const repoOf = (url: string) => url.split('/repos/')[1] ?? '';
export const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n));

/** Turn GitHub's rendered HTML into plain paragraphs. M3 replaces this with a markdown renderer. */
export function htmlToText(html?: string | null) {
  if (!html) return '';
  return html
    .replace(/<\/(p|li|h\d|pre|blockquote)>/g, '\n')
    .replace(/<li>/g, '• ')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const LANG: Record<string, string> = { TypeScript: '#3178C6', JavaScript: '#E6C62F', Rust: '#DEA584', Go: '#00ADD8', Python: '#3572A5', Shell: '#89E051', 'C++': '#F34B7D', Swift: '#F05138', Kotlin: '#A97BFF', Ruby: '#CC342D' };
