import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAVED_QUERIES, shouldSave } from '../apps/app/src/data/cachePolicy';

const q = (key: unknown[], status = 'success') => ({ queryKey: key, state: { status } });

describe('saved query cache policy', () => {
  it('saves loaded, signed-in lists and screens', () => {
    for (const k of ['me', 'my-repos', 'notifications', 'feed', 'issue', 'pr']) expect(shouldSave(q(['live', k])), k).toBe(true);
  });
  it('never saves sample data, failed or loading queries, file contents, diffs or review threads', () => {
    expect(shouldSave(q(['sample', 'me']))).toBe(false);
    expect(shouldSave(q(['live', 'me'], 'error'))).toBe(false);
    expect(shouldSave(q(['live', 'me'], 'pending'))).toBe(false);
    for (const k of ['file', 'file-info', 'files', 'review-threads', 'review-comments']) expect(shouldSave(q(['live', k])), k).toBe(false);
  });
  it('every saved name is a real query key (a renamed key would silently stop being saved)', () => {
    const src = readFileSync(new URL('../apps/app/src/data/queries.ts', import.meta.url), 'utf8');
    const keys = new Set([...src.matchAll(/queryKey: \[k, '([a-z-]+)'/g)].map((m) => m[1]));
    for (const name of SAVED_QUERIES) expect(keys.has(name), name).toBe(true);
  });
});
