import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_DESIGN, Design, designFileName, designToFile, encodeDesign, PRESETS, applyPreset, readDesignText } from '../src';

const now = new Date('2026-11-05T12:00:00Z');

describe('design file', () => {
  it('round-trips a design through the file format', () => {
    const d = applyPreset(DEFAULT_DESIGN, PRESETS[2]);
    const text = designToFile(d, { name: 'Paper desk', now });
    expect(text.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ format: 'gitling.design', formatVersion: 1, name: 'Paper desk', exportedAt: now.toISOString() });
    const r = readDesignText(text);
    expect(r).toEqual({ ok: true, design: d, name: 'Paper desk', dropped: [] });
  });

  it('accepts a bare design, a share code, a share link and a BOM', () => {
    expect(readDesignText(JSON.stringify(DEFAULT_DESIGN))).toMatchObject({ ok: true, design: DEFAULT_DESIGN });
    const code = encodeDesign(DEFAULT_DESIGN);
    expect(readDesignText(code)).toMatchObject({ ok: true, design: DEFAULT_DESIGN });
    expect(readDesignText(`https://gitling.example/studio?import=${encodeURIComponent(code)}&x=1`)).toMatchObject({ ok: true, design: DEFAULT_DESIGN });
    expect(readDesignText('﻿' + designToFile(DEFAULT_DESIGN, { now }))).toMatchObject({ ok: true });
  });

  it('keeps the valid parts of a partly broken file and names what it left out', () => {
    const bad = { ...DEFAULT_DESIGN.tiles[0], id: 'x', label: 'Evil', target: { type: 'link', url: 'javascript:alert(1)' } };
    const text = JSON.stringify({ format: 'gitling.design', formatVersion: 1, design: { ...DEFAULT_DESIGN, tiles: [DEFAULT_DESIGN.tiles[0], bad] } });
    const r = readDesignText(text);
    expect(r.ok && r.design.tiles.map((t) => t.id)).toEqual([DEFAULT_DESIGN.tiles[0].id]);
    expect(r.ok && r.dropped).toEqual(['tile “Evil”']);
  });

  it('refuses things that are not designs, with a sentence a person can act on', () => {
    for (const [text, msg] of [
      ['', /empty/], ['{', /valid JSON/], ['[1,2]', /isn't a Gitling design/], ['{"hello":1}', /isn't a Gitling design/],
      ['{"format":"other","design":{}}', /format isn't gitling.design/], ['{"format":"gitling.design","design":{}}', /no format version/],
      ['{"format":"gitling.design","formatVersion":2,"design":{}}', /newer Gitling/], ['GITLING1.@@@', /incomplete|not a Gitling/],
      ['x'.repeat(300 * 1024), /too big/],
    ] as const) {
      const r = readDesignText(text);
      expect(r.ok, text.slice(0, 40)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(msg);
    }
  });

  it('file names are safe and dated', () => {
    expect(designFileName('My Setup!! 2', now)).toBe('gitling-my-setup-2-2026-11-05.gitling.json');
    expect(designFileName(undefined, now)).toBe('gitling-2026-11-05.gitling.json');
  });

  // The published JSON Schema (for editors and other tools) must match the zod schema. Regenerate with
  // UPDATE_DESIGN_SCHEMA=1 npx vitest run packages/design/test/file.test.ts
  it('apps/app/public/design.schema.json is up to date', () => {
    const path = fileURLToPath(new URL('../../../apps/app/public/design.schema.json', import.meta.url));
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://gitling.truckcoding.workers.dev/design.schema.json',
      title: 'Gitling design file',
      description: 'A Gitling setup: look, tab bar, home layout and shortcuts. See docs/DESIGN-FILE.md.',
      type: 'object',
      required: ['format', 'formatVersion', 'design'],
      properties: {
        $schema: { type: 'string' },
        format: { const: 'gitling.design' },
        formatVersion: { const: 1 },
        name: { type: 'string', maxLength: 80 },
        exportedAt: { type: 'string', format: 'date-time' },
        design: z.toJSONSchema(Design, { unrepresentable: 'any', target: 'draft-2020-12' }),
      },
    };
    const text = JSON.stringify(schema, null, 2) + '\n';
    if (process.env.UPDATE_DESIGN_SCHEMA || !existsSync(path)) writeFileSync(path, text);
    // Line endings aside: Windows checkouts turn LF into CRLF.
    expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).toBe(text);
  });
});
