// Deep imports on purpose: the package index pulls in zod (~400 KB), and this file runs on every GitHub page.
// The popup validates designs with zod before saving, so here a light shape check is enough.
import type { Design } from '@gitling/design/src/schema';
import { BACKGROUNDS, DEFAULT_DESIGN } from '@gitling/design/src/signal';

/** Developer mode: parts of GitHub to leave out (each one separately), plus a wider page. */
export type Clean = { sales: boolean; copilot: boolean; footer: boolean; wide: boolean };
export const CLEAN_OFF: Clean = { sales: false, copilot: false, footer: false, wide: false };
export const CLEAN_KEYS = Object.keys(CLEAN_OFF) as (keyof Clean)[];
export type Settings = { enabled: boolean; design: Design; clean: Clean };
const KEY = 'gitling';

type Area = { get(k: string): Promise<Record<string, unknown>>; set(v: Record<string, unknown>): Promise<void> };
type ChromeLike = { storage: { local?: Area; sync: { get(k: string): Promise<Record<string, unknown>>; set(v: Record<string, unknown>): Promise<void> }; onChanged: { addListener(fn: (changes: Record<string, unknown>, area: string) => void): void } } };
export const ext = (globalThis as unknown as { browser?: ChromeLike; chrome: ChromeLike }).browser ?? (globalThis as unknown as { chrome: ChromeLike }).chrome;

const HEX = /^#[0-9a-f]{6}$/i;
/** Enough to render safely; anything off falls back to the default design. */
const FONTS: Record<string, string[]> = { body: ['geist', 'geist-mono', 'system'], mono: ['geist-mono', 'system-mono'], numbers: ['doto', 'geist-mono', 'geist'] };
/** A custom theme's values are used in CSS, so each must be what the schema allows (or absent). */
function customOk(c: unknown): boolean {
  if (c === undefined) return true;
  if (!c || typeof c !== 'object') return false;
  const x = c as Record<string, unknown>;
  if (x.mode !== undefined && x.mode !== 'dark' && x.mode !== 'light') return false;
  if (x.radius !== undefined && !(Number.isInteger(x.radius) && (x.radius as number) >= 0 && (x.radius as number) <= 24)) return false;
  if (x.colors !== undefined && (!x.colors || typeof x.colors !== 'object' || !Object.values(x.colors).every((v) => typeof v === 'string' && HEX.test(v)))) return false;
  if (x.fonts !== undefined && (!x.fonts || typeof x.fonts !== 'object' || !Object.entries(x.fonts).every(([k, v]) => FONTS[k]?.includes(v as string)))) return false;
  return true;
}
function looksValid(d: unknown): d is Design {
  const t = (d as Design | undefined)?.theme;
  return !!t && customOk(t.custom) && HEX.test(t.accent) && Object.prototype.hasOwnProperty.call(BACKGROUNDS, t.background) && ['dot', 'mono', 'sans'].includes(t.numbers)
    && ['window', 'plain'].includes(t.tiles) && Number.isInteger(t.density) && t.density >= 1 && t.density <= 5;
}

export async function loadSettings(): Promise<Settings> {
  const raw = (await ext.storage.sync.get(KEY))[KEY] as Partial<Settings> | undefined;
  const c = (raw?.clean ?? {}) as Partial<Clean>;
  const clean = Object.fromEntries(CLEAN_KEYS.map((k) => [k, c[k] === true])) as Clean;
  return { enabled: raw?.enabled ?? true, design: looksValid(raw?.design) ? raw!.design! : DEFAULT_DESIGN, clean };
}

/** storage.sync allows 8192 bytes per item, counted as UTF-8 bytes of the key plus the JSON value. */
const SYNC_ITEM_BYTES = 8192;
export const syncBytes = (s: Settings) => new TextEncoder().encode(KEY + JSON.stringify(s)).length;

/** The extension only renders the theme, so a design too big for one sync item (many tiles, long or
 *  non-English labels: 2–4 bytes a character) is stored without its tiles rather than failing to save. */
export function forSync(s: Settings): Settings {
  const limit = SYNC_ITEM_BYTES - 256;
  if (syncBytes(s) <= limit) return s;
  const noTiles = { ...s, design: { ...s.design, tiles: [] } };
  if (syncBytes(noTiles) <= limit) return noTiles;
  // Still too big (home.sections has no length cap): keep only the theme, which is all the extension renders.
  return { ...s, design: { ...DEFAULT_DESIGN, theme: s.design.theme, tiles: [] } };
}

/** A design without its custom CSS: the CSS (up to 20 KB) lives in storage.local, see CustomCss. */
const withoutCss = (d: Design): Design => {
  if (d.theme.custom?.css === undefined) return d;
  const { css: _css, ...custom } = d.theme.custom;
  return { ...d, theme: { ...d.theme, custom } };
};

export async function saveSettings(s: Settings) {
  await ext.storage.sync.set({ [KEY]: forSync({ ...s, design: withoutCss(s.design) }) });
}

export function onSettingsChange(fn: () => void) {
  ext.storage.onChanged.addListener((changes, area) => { if ((area === 'sync' && KEY in changes) || (area === 'local' && CSS_KEY in changes)) fn(); });
}

/**
 * Extension-only custom CSS for github.com. Too big for storage.sync, so it stays on this computer.
 * `on`: the toggle on the settings page. `accepted`: the person saw this CSS (wrote it, or confirmed the notice
 * after importing a design that had it); CSS from an import is never applied before that.
 */
export type CustomCss = { css: string; on: boolean; accepted: boolean };
const CSS_KEY = 'gitling-css';
export const CSS_OFF: CustomCss = { css: '', on: false, accepted: false };

export async function loadCss(): Promise<CustomCss> {
  const raw = ext.storage.local ? ((await ext.storage.local.get(CSS_KEY))[CSS_KEY] as Partial<CustomCss> | undefined) : undefined;
  return { css: typeof raw?.css === 'string' ? raw.css.slice(0, 20 * 1024) : '', on: raw?.on === true, accepted: raw?.accepted === true };
}

export async function saveCss(c: CustomCss) {
  await ext.storage.local?.set({ [CSS_KEY]: c });
}
