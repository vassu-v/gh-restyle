import { z } from 'zod';

/** Everything a user can customize lives in one versioned, validated document. */

export const TabId = z.enum(['home', 'feed', 'inbox', 'repos', 'studio']);
export type TabId = z.infer<typeof TabId>;

export const SectionId = z.enum(['status', 'shortcuts', 'needs', 'feed', 'inbox', 'recent']);
export type SectionId = z.infer<typeof SectionId>;

export const InboxFilter = z.enum(['all', 'review_requested', 'mention', 'assign', 'author', 'comment', 'ci_activity']);
export type InboxFilter = z.infer<typeof InboxFilter>;

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
  z.object({ type: z.literal('link'), url: z.string().url() }),
  z.object({
    type: z.literal('ask'),
    prompt: z.string().min(1),
    template: z.string().includes('{query}'),
    dest: z.enum(['issues', 'repos', 'link']),
  }),
]);
export type TileTarget = z.infer<typeof TileTarget>;
export type TileTargetType = TileTarget['type'];

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
