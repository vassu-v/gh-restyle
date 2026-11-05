import { z } from 'zod';

/** Everything a user can customize lives in one versioned, validated document. */

export const TabId = z.enum(['home', 'feed', 'inbox', 'repos', 'studio']);
export type TabId = z.infer<typeof TabId>;

export const SectionId = z.enum(['status', 'shortcuts', 'needs', 'feed', 'inbox', 'recent']);
export type SectionId = z.infer<typeof SectionId>;

export const InboxFilter = z.enum(['all', 'review_requested', 'mention', 'assign', 'author', 'comment', 'ci_activity']);
export type InboxFilter = z.infer<typeof InboxFilter>;

/**
 * Schemes that run code or content inside the page that opens them. On web, a shared design or a crafted /ask
 * link could otherwise hand one to window.open, and script on Gitling's origin could read the token vault.
 * Everything else may open, including app links people put in tiles (obsidian://, tel:, sms:, slack://…):
 * those only hand off to another app.
 */
const DANGEROUS_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'blob:', 'file:', 'about:', 'filesystem:', 'view-source:']);

/** True when Gitling may open this link. Parsed with URL, so "java\tscript:", case and leading spaces normalize. */
export function isSafeLink(url: string): boolean {
  try { return !DANGEROUS_SCHEMES.has(new URL(url.trim().replace(/\{query\}/g, 'q')).protocol); } catch { return false; }
}

/**
 * An ask-tile link template: safe, and its scheme is written out before any {query}, so what someone types can't
 * change it ("{query}script:…" + "java" would otherwise become javascript:).
 */
export function isSafeTemplate(t: string): boolean {
  return /^\s*[a-z][a-z0-9+.-]*:/i.test(t) && isSafeLink(t);
}

export const TileTarget = z.discriminatedUnion('type', [
  z.object({ type: z.literal('search'), q: z.string().min(1) }),
  z.object({
    type: z.literal('repo'),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Use owner/name'),
    tab: z.enum(['overview', 'issues', 'prs', 'code', 'commits']).default('overview'),
  }),
  z.object({ type: z.literal('user'), login: z.string().min(1) }),
  z.object({ type: z.literal('file'), repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), path: z.string() }),
  z.object({ type: z.literal('inbox'), filter: InboxFilter }),
  z.object({ type: z.literal('link'), url: z.string().url().refine(isSafeLink, 'This kind of link can run code, so Gitling won’t open it') }),
  z.object({
    type: z.literal('ask'),
    prompt: z.string().min(1),
    template: z.string().includes('{query}'),
    dest: z.enum(['issues', 'repos', 'link']),
  }).refine((a) => a.dest !== 'link' || isSafeTemplate(a.template), { message: 'This kind of link can run code, so Gitling won’t open it', path: ['template'] }),
]);
export type TileTarget = z.infer<typeof TileTarget>;
export type TileTargetType = TileTarget['type'];

/**
 * The default design's sample tiles point at the sample account "you" (you/trail-notes). Signed in, those
 * don't exist, so the app opens the tile's editor instead of a "Not found" screen.
 */
export function isSampleTarget(t: TileTarget): boolean {
  if (t.type === 'repo' || t.type === 'file') return t.repo.split('/')[0] === 'you';
  if (t.type === 'user') return t.login === 'you';
  if (t.type === 'link') { try { const u = new URL(t.url); return u.hostname === 'github.com' && u.pathname.split('/')[1] === 'you'; } catch { return false; } }
  return false;
}

export const Tile = z.object({
  id: z.string(),
  label: z.string().min(1).max(40),
  /** icon name from the app's icon set */
  icon: z.string(),
  tint: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  count: z.boolean(),
  size: z.enum(['half', 'full']),
  target: TileTarget,
});
export type Tile = z.infer<typeof Tile>;

export const Background = z.enum(['graphite', 'black', 'paper']);
export type Background = z.infer<typeof Background>;

export const Design = z.object({
  version: z.literal(1),
  skin: z.literal('signal'),
  theme: z.object({
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    background: Background,
    numbers: z.enum(['dot', 'mono', 'sans']),
    tiles: z.enum(['window', 'plain']),
    density: z.number().int().min(1).max(5),
    textScale: z.number().min(0.85).max(1.3),
  }),
  nav: z.object({
    tabs: z.array(TabId).min(2).max(5).refine((t) => t.includes('studio'), 'Studio must stay in the tab bar'),
  }),
  home: z.object({
    sections: z.array(z.object({ id: SectionId, visible: z.boolean() })),
  }),
  tiles: z.array(Tile).max(24),
});
export type Design = z.infer<typeof Design>;

/**
 * Loads a stored design as fully as possible. A design saved by an older version (or edited by hand) may have a
 * tile or a section a newer schema rejects; dropping the whole design for that would wipe someone's setup.
 * Keeps every part that validates, falls back to `fallback` for the parts that don't, and says what was dropped.
 */
export function salvageDesign(input: unknown, fallback: Design): { design: Design; dropped: string[] } | null {
  const whole = Design.safeParse(input);
  if (whole.success) return { design: whole.data, dropped: [] };
  if (!input || typeof input !== 'object') return null;
  const src = input as Record<string, unknown>;
  const dropped: string[] = [];
  const part = <K extends keyof Design>(k: K): Design[K] => {
    const r = Design.shape[k].safeParse(src[k]);
    if (r.success) return r.data as Design[K];
    if (k !== 'tiles') dropped.push(String(k));
    return fallback[k];
  };
  const tiles = Array.isArray(src.tiles)
    ? src.tiles.flatMap((t) => { const r = Tile.safeParse(t); if (r.success) return [r.data]; dropped.push(`tile “${(t as { label?: unknown })?.label ?? '?'}”`); return []; })
    : (dropped.push('tiles'), fallback.tiles);
  if (tiles.length > 24) dropped.push(`${tiles.length - 24} tile${tiles.length - 24 === 1 ? '' : 's'} over the 24-tile limit`);
  tiles.splice(24);
  const out = Design.safeParse({ ...fallback, theme: part('theme'), nav: part('nav'), home: part('home'), tiles });
  return out.success ? { design: out.data, dropped } : null;
}
