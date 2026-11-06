import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, PRESETS, applyPreset } from '../packages/design/src';
import { primerVars } from '../apps/extension/src/primer';
import { presetOf } from '../apps/extension/src/presetOf';

// A fake chrome.storage.sync holding whatever an older (or newer) version saved.
let stored: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { sync: { get: async (k: string) => ({ [k]: stored[k] }), set: async (v: Record<string, unknown>) => { Object.assign(stored, v); } }, onChanged: { addListener() {} } },
};
const { loadSettings, CLEAN_OFF } = await import('../apps/extension/src/storage');

describe('extension settings', () => {
  it('settings saved before developer mode existed load with every part off', async () => {
    stored = { gitling: { enabled: true, design: DEFAULT_DESIGN } };
    expect((await loadSettings()).clean).toEqual(CLEAN_OFF);
  });

  it('developer mode keeps only real true values (no strings, no unknown parts)', async () => {
    stored = { gitling: { enabled: true, design: DEFAULT_DESIGN, clean: { sales: true, copilot: 'yes', footer: false, nope: true } } };
    expect((await loadSettings()).clean).toEqual({ ...CLEAN_OFF, sales: true });
  });

  it('nothing saved yet: on, default design, developer mode off', async () => {
    stored = {};
    expect(await loadSettings()).toEqual({ enabled: true, design: DEFAULT_DESIGN, clean: CLEAN_OFF });
  });

  it('text size: 100% leaves GitHub alone, anything else zooms the page evenly', () => {
    expect(primerVars(DEFAULT_DESIGN)).not.toHaveProperty('zoom');
    expect(primerVars({ ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, textScale: 1.15 } }).zoom).toBe('1.15');
  });

  it('names the preset a design matches, and none once its look is changed', () => {
    for (const p of PRESETS) expect(presetOf(applyPreset(DEFAULT_DESIGN, p))?.id).toBe(p.id);
    expect(presetOf({ ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, accent: '#123456' } })).toBeUndefined();
  });
});
