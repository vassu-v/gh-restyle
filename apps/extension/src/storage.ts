import { DEFAULT_DESIGN, Design } from '@gitling/design';

export type Settings = { enabled: boolean; design: Design };
const KEY = 'gitling';

type ChromeLike = { storage: { sync: { get(k: string): Promise<Record<string, unknown>>; set(v: Record<string, unknown>): Promise<void> }; onChanged: { addListener(fn: (changes: Record<string, unknown>, area: string) => void): void } } };
export const ext = (globalThis as unknown as { browser?: ChromeLike; chrome: ChromeLike }).browser ?? (globalThis as unknown as { chrome: ChromeLike }).chrome;

export async function loadSettings(): Promise<Settings> {
  const raw = (await ext.storage.sync.get(KEY))[KEY] as Partial<Settings> | undefined;
  const parsed = Design.safeParse(raw?.design);
  return { enabled: raw?.enabled ?? true, design: parsed.success ? parsed.data : DEFAULT_DESIGN };
}

export async function saveSettings(s: Settings) {
  await ext.storage.sync.set({ [KEY]: s });
}

export function onSettingsChange(fn: () => void) {
  ext.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && KEY in changes) fn(); });
}
