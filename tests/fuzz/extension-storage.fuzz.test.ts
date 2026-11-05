import { runs } from './runs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, Design } from '../../packages/design/src';
import { forSync, syncBytes } from '../../apps/extension/src/storage';

// storage.sync rejects any item over 8192 bytes (UTF-8 of key + JSON). Labels are counted in characters by the
// schema (max 40), but a character can be 4 bytes, so 24 tiles of emoji or CJK labels used to fail to save.
const label = fc.stringOf(fc.constantFrom('a', 'é', '漢', '😀', '\u{1F1EE}', '"', '\\'), { minLength: 1, maxLength: 40 });

describe('extension storage', () => {
  it('whatever the tiles say, the stored item fits in one sync item, and the theme is always kept', () => {
    fc.assert(fc.property(fc.array(label, { maxLength: 24 }), (labels) => {
      const design = { ...DEFAULT_DESIGN, tiles: labels.map((l, i) => ({ ...DEFAULT_DESIGN.tiles[0], id: `t${i}`, label: l })) };
      fc.pre(Design.safeParse(design).success);
      const stored = forSync({ enabled: true, design });
      expect(syncBytes(stored)).toBeLessThanOrEqual(8192);
      expect(stored.design.theme).toEqual(design.theme);
    }), { numRuns: runs(300) });
  });
  it('the worst case (24 tiles × 40 four-byte characters) is over the limit raw, so the check matters', () => {
    const design = { ...DEFAULT_DESIGN, tiles: Array.from({ length: 24 }, (_, i) => ({ ...DEFAULT_DESIGN.tiles[0], id: `t${i}`, label: '😀'.repeat(40) })) };
    expect(syncBytes({ enabled: true, design })).toBeGreaterThan(8192);
    expect(syncBytes(forSync({ enabled: true, design }))).toBeLessThanOrEqual(8192);
  });
});
