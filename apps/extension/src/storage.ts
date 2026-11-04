// Deep imports on purpose: the package index pulls in zod (~400 KB), and this file runs on every GitHub page.
// The popup validates designs with zod before saving, so here a light shape check is enough.
import type { Design } from '@gitling/design/src/schema';
import { BACKGROUNDS, DEFAULT_DESIGN } from '@gitling/design/src/signal';

export type Settings = { enabled: boolean; design: Design };
const KEY = 'gitling';

type ChromeLike = { storage: { sync: { get(k: string): Promise<Record<string, unknown>>; set(v: Record<string, unknown>): Promise<void> }; onChanged: { addListener(fn: (changes: Record<string, unknown>, area: string) => void): void } } };
export const ext = (globalThis as unknown as { browser?: ChromeLike; chrome: ChromeLike }).browser ?? (globalThis as unknown as { chrome: ChromeLike }).chrome;

const HEX = /^#[0-9a-f]{6}$/i;
/** Enough to render safely; anything off falls back to the default design. */
function looksValid(d: unknown): d is Design {
  const t = (d as Design | undefined)?.theme;
  return !!t && HEX.test(t.accent) && t.background in BACKGROUNDS && ['dot', 'mono', 'sans'].includes(t.numbers)
    && ['window', 'plain'].includes(t.tiles) && Number.isInteger(t.density) && t.density >= 1 && t.density <= 5;
}

export async function loadSettings(): Promise<Settings> {
  const raw = (await ext.storage.sync.get(KEY))[KEY] as Partial<Settings> | undefined;
  return { enabled: raw?.enabled ?? true, design: looksValid(raw?.design) ? raw!.design! : DEFAULT_DESIGN };
}

export async function saveSettings(s: Settings) {
  await ext.storage.sync.set({ [KEY]: s });
}

export function onSettingsChange(fn: () => void) {
  ext.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && KEY in changes) fn(); });
}
