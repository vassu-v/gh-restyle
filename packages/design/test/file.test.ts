import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_DESIGN, Design, designFileName, designToFile, encodeDesign, PRESETS, applyPreset, readDesignText } from '../src';

const now = new Date('2026-11-05T12:00:00Z');

/**
 * zod's refinements don't reach JSON Schema. Add the ones an editor can check (Studio in the tab bar, each tab once)
 * and drop zod's non-standard "includes" format. The app's own checks (e.g. unsafe link schemes) stay stricter.
 */
function tighten(s: unknown): never {
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (!n || typeof n !== 'object') return n;
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) if (!(k === 'format' && v === 'includes')) o[k] = walk(v);
    return o;
  };
  const out = walk(s) as { properties: { nav: { properties: { tabs: Record<string, unknown> } } } };
  Object.assign(out.properties.nav.properties.tabs, { uniqueItems: true, contains: { const: 'studio' } });
  // Home keeps at least one section (zod's refine has no JSON Schema form).
  const home = (out as unknown as { properties: { home: { properties: { sections: Record<string, unknown> } } } }).properties.home.properties.sections;
  Object.assign(home, { contains: { type: 'object', properties: { visible: { const: true } }, required: ['visible'] } });
  return out as never;
}

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
        design: tighten(z.toJSONSchema(Design, { unrepresentable: 'any', target: 'draft-2020-12', io: 'input' })) // what a file may contain: defaults may be left out,
      },
    };
    const text = JSON.stringify(schema, null, 2) + '\n';
    if (process.env.UPDATE_DESIGN_SCHEMA || !existsSync(path)) writeFileSync(path, text);
    // Line endings aside: Windows checkouts turn LF into CRLF.
    expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).toBe(text);
  });
});

describe('design file: hostile and odd input (PR #3 QA)', () => {
  const file = (design: unknown) => JSON.stringify({ format: 'gitling.design', formatVersion: 1, design });
  it('a tile label that is an object never throws', () => {
    const r = readDesignText(file({ ...DEFAULT_DESIGN, theme: 5, tiles: [{ label: { toString: 1, valueOf: 1 } }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dropped).toContain('tile “?”');
  });
  it('duplicate tabs or sections are left out, and missing sections come back switched off', () => {
    const r = readDesignText(file({ ...DEFAULT_DESIGN, nav: { tabs: ['studio', 'studio'] }, home: { sections: [{ id: 'feed', visible: true }] } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dropped).toContain('nav');
    expect(new Set(r.design.nav.tabs).size).toBe(r.design.nav.tabs.length);
    expect(r.design.home.sections.map((s) => s.id).sort()).toEqual(DEFAULT_DESIGN.home.sections.map((s) => s.id).sort());
    expect(r.design.home.sections.filter((s) => s.visible).map((s) => s.id)).toEqual(['feed']);
  });
  it('a Home with no section on it is left out (Home keeps at least one)', () => {
    for (const sections of [[], DEFAULT_DESIGN.home.sections.map((s) => ({ ...s, visible: false }))]) {
      const r = readDesignText(file({ ...DEFAULT_DESIGN, theme: { ...DEFAULT_DESIGN.theme, accent: '#123456' }, home: { sections } }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.dropped).toEqual(['home']);
      expect(r.design.home).toEqual(DEFAULT_DESIGN.home);
    }
  });
  it('search sections: any search under your own title, kept in order; bad ones are left out', () => {
    const mine = { id: 'q-abc1', visible: true, title: 'Bugs I’m in', q: 'is:open label:bug involves:@me' };
    const ok = readDesignText(file({ ...DEFAULT_DESIGN, home: { sections: [mine, ...DEFAULT_DESIGN.home.sections] } }));
    expect(ok.ok && ok.design.home.sections[0]).toEqual(mine);
    for (const bad of [{ ...mine, id: 'Q-ABC' }, { ...mine, title: '' }, { ...mine, q: 'x'.repeat(257) }, { ...mine, id: 'status' }]) {
      const r = readDesignText(file({ ...DEFAULT_DESIGN, home: { sections: [bad, ...DEFAULT_DESIGN.home.sections] } }));
      expect(r.ok && r.dropped, JSON.stringify(bad)).toEqual(['home']);
    }
  });
  it('refuses input where nothing is valid instead of offering the default design', () => {
    expect(readDesignText('{"theme":1}').ok).toBe(false);
    expect(readDesignText(file({})).ok).toBe(false);
  });
  it('a share code with an unsafe tile is salvaged, like a file', () => {
    const code = 'GITLING1.' + Buffer.from(JSON.stringify({ ...DEFAULT_DESIGN, tiles: [{ ...DEFAULT_DESIGN.tiles[0], target: { type: 'link', url: 'javascript:alert(1)' } }] })).toString('base64url');
    const r = readDesignText(code);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.design.tiles).toHaveLength(0); expect(r.dropped.length).toBe(1); }
  });
  it('non-JSON text that is not a code or link gets a message for files, and size counts bytes', () => {
    const r = readDesignText('\u0000\u0001binary junk');
    expect(r).toEqual({ ok: false, error: "That isn't a Gitling design file, code or share link." });
    expect(readDesignText('😀'.repeat(70_000)).ok).toBe(false); // 140k chars, 280 KB
  });
});
