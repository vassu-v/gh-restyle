import { runs } from './runs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nextPage } from '../../packages/github/src/client';
import { applyEdits, parseSuggestions, splitSuggestionBody, type Edit } from '../../packages/github/src/suggest';

/* ─── applyEdits ─── */

const content = fc.oneof(fc.fullUnicodeString({ maxLength: 10 }), fc.constantFrom('', ' ', '\t', '}', 'x y')).map((s) => s.replace(/[\r\n]/g, ''));
const fileArb = fc.record({
  lines: fc.array(fc.tuple(content, fc.constantFrom('\n', '\r\n')), { maxLength: 25 }),
  finalNewline: fc.boolean(),
}).map(({ lines, finalNewline }) => {
  // Lines + an empty last line without a newline is the same text as the lines with a final newline: keep one spelling.
  if (!finalNewline && lines.length && lines[lines.length - 1][0] === '') { lines = lines.slice(0, -1); finalNewline = true; }
  const text = lines.map(([c, e], i) => c + (i === lines.length - 1 && !finalNewline ? '' : e)).join('');
  return { text, contents: lines.map(([c]) => c), eols: lines.map(([, e], i) => (i === lines.length - 1 && !finalNewline ? '' : e)) };
});

/** Picks sorted non-overlapping 1-based ranges inside n lines, each with new content, then shuffles them. */
const editsFor = (n: number) => fc.array(fc.tuple(fc.integer({ min: 1, max: Math.max(1, n) }), fc.integer({ min: 1, max: Math.max(1, n) }), fc.array(content, { maxLength: 4 })), { maxLength: 5 })
  .map((raw) => {
    if (!n) return [] as Edit[];
    const cuts = raw.map(([x, y, lines]) => ({ startLine: Math.min(x, y), endLine: Math.max(x, y), lines })).sort((p, q) => p.startLine - q.startLine);
    const out: Edit[] = [];
    for (const e of cuts) if (!out.length || out[out.length - 1].endLine < e.startLine) out.push(e);
    return out;
  })
  .chain((es) => fc.shuffledSubarray(es, { minLength: es.length, maxLength: es.length }));

const scenario = fileArb.chain((f) => editsFor(f.contents.length).map((edits) => ({ ...f, edits })));

/** Naive reference on line contents only: splice bottom-up. */
function reference(contents: string[], edits: Edit[]): string[] {
  const out = [...contents];
  for (const e of [...edits].sort((a, b) => b.startLine - a.startLine)) out.splice(e.startLine - 1, e.endLine - e.startLine + 1, ...e.lines);
  return out;
}
/** Byte offset where 1-based line k starts. */
const offsetOf = (contents: string[], eols: string[], k: number) => contents.slice(0, k - 1).reduce((s, c, i) => s + c.length + eols[i].length, 0);

describe('applyEdits', () => {
  it('equals a naive splice of line contents and keeps the final-newline state', () => {
    fc.assert(fc.property(scenario, ({ text, contents, edits }) => {
      const out = applyEdits(text, edits);
      const want = reference(contents, edits);
      const finalNl = /\n$/.test(text);
      expect(out.replace(/\r\n/g, '\n')).toBe(want.join('\n') + (finalNl && want.length ? '\n' : ''));
    }), { numRuns: runs(1000) });
  });

  it('bytes before the first edit and after the last edit are untouched (CRLF/LF mixes, no final newline)', () => {
    fc.assert(fc.property(scenario, ({ text, contents, eols, edits }) => {
      fc.pre(edits.length > 0);
      const out = applyEdits(text, edits);
      const first = Math.min(...edits.map((e) => e.startLine)), last = Math.max(...edits.map((e) => e.endLine));
      let head = text.slice(0, offsetOf(contents, eols, first));
      const tail = text.slice(offsetOf(contents, eols, last + 1));
      // Documented: deleting a no-final-newline file's last lines strips the new last line's ending.
      // Also when the deletion is split into contiguous edits (e.g. lines 2-4 and line 5): same text, same result.
      const sorted = [...edits].sort((a, b) => a.startLine - b.startLine);
      const deletesToEnd = sorted.every((e, j) => e.lines.length === 0 && (j === 0 || sorted[j - 1].endLine + 1 === e.startLine)) && sorted[sorted.length - 1].endLine === contents.length;
      const firstHitsEnd = deletesToEnd || edits.some((e) => e.startLine === first && e.endLine === contents.length);
      if (firstHitsEnd && !/\n$/.test(text)) head = head.replace(/\r?\n$/, '');
      expect(out.startsWith(head)).toBe(true);
      if (last < contents.length) expect(out.endsWith(tail)).toBe(true);
    }), { numRuns: runs(1000) });
  });

  it('every untouched line between edits keeps its bytes, in order', () => {
    fc.assert(fc.property(scenario, ({ text, contents, eols, edits }) => {
      const out = applyEdits(text, edits);
      const sorted = [...edits].sort((a, b) => a.startLine - b.startLine);
      let pos = 0;
      for (let k = 0; k <= sorted.length; k++) {
        const from = k === 0 ? 1 : sorted[k - 1].endLine + 1, to = k === sorted.length ? contents.length : sorted[k].startLine - 1;
        if (from > to) continue;
        let gap = text.slice(offsetOf(contents, eols, from), offsetOf(contents, eols, to + 1));
        // Documented: deleting/replacing a no-final-newline file's last lines leaves no ending on the new last line.
        // That happens when every edit after this gap is a deletion and together they run to the end of the file.
        const rest = sorted.slice(k);
        const deletesToEnd = rest.length > 0 && rest.every((e, j) => e.lines.length === 0 && (j === 0 || rest[j - 1].endLine + 1 === e.startLine)) && rest[rest.length - 1].endLine === contents.length;
        if ((deletesToEnd || (rest.length && rest[rest.length - 1].endLine === contents.length && rest.length === 1)) && !/\n$/.test(text)) gap = gap.replace(/\r?\n$/, '');
        const at = out.indexOf(gap, pos);
        expect(at, JSON.stringify({ gap, out })).toBeGreaterThanOrEqual(0);
        pos = at + gap.length;
      }
    }), { numRuns: runs(1000) });
  });

  it('no edits returns the text unchanged; identity edits on uniform-ending files too', () => {
    fc.assert(fc.property(fileArb, fc.constantFrom('\n', '\r\n'), fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 30 }), ({ contents }, eol, x, y) => {
      const text = contents.join(eol) + (contents.length ? eol : '');
      expect(applyEdits(text, [])).toBe(text);
      if (!contents.length) return;
      const s = Math.min(x, y, contents.length), e = Math.min(Math.max(x, y), contents.length);
      expect(applyEdits(text, [{ startLine: s, endLine: e, lines: contents.slice(s - 1, e) }])).toBe(text);
      const noNl = contents.join(eol);
      if (contents[contents.length - 1] === '') return; // "a\n" + "" has no last line to edit without a newline
      expect(applyEdits(noNl, [{ startLine: s, endLine: e, lines: contents.slice(s - 1, e) }])).toBe(noNl);
    }), { numRuns: runs(500) });
  });

  it('overlapping or out-of-range edits throw a plain Error, never something else', () => {
    fc.assert(fc.property(fileArb, fc.array(fc.record({ startLine: fc.integer({ min: -2, max: 30 }), endLine: fc.integer({ min: -2, max: 30 }), lines: fc.array(content, { maxLength: 2 }) }), { maxLength: 4 }), ({ text }, edits) => {
      try { expect(typeof applyEdits(text, edits)).toBe('string'); } catch (err) { expect(err).toBeInstanceOf(Error); }
    }), { numRuns: runs(500) });
  });
});

/* ─── suggestion parsing ─── */

const fenceish = fc.constantFrom('```suggestion', '```', '~~~suggestion', '~~~', '````suggestion', '   ```suggestion', '    ```suggestion', '```suggestion extra', '``` suggestion', '```js', '``` `x`', '\r', '');
const body = fc.oneof(
  fc.fullUnicodeString({ maxLength: 400 }),
  fc.array(fc.oneof(fenceish, fc.fullUnicodeString({ maxLength: 20 })), { maxLength: 30 }).map((ls) => ls.join('\n')),
  fc.array(fc.oneof(fenceish, fc.string({ maxLength: 20 })), { maxLength: 30 }).map((ls) => ls.join('\r\n')),
);

describe('suggestion parsing', () => {
  it('never throws; output is well-formed', () => {
    fc.assert(fc.property(body, (b) => {
      const segs = splitSuggestionBody(b);
      for (const s of segs) {
        if (s.kind === 'md') expect(s.text.trim()).not.toBe('');
        else expect(s.lines.every((l) => typeof l === 'string' && !l.includes('\n'))).toBe(true);
      }
      expect(parseSuggestions(b)).toEqual(segs.flatMap((s) => (s.kind === 'suggestion' ? [s.lines] : [])));
    }), { numRuns: runs(1000) });
  });

  it('a lone suggestion block round-trips its lines', () => {
    const line = fc.fullUnicodeString({ maxLength: 15 }).map((s) => s.replace(/[\r\n]/g, '')).filter((s) => !/^ {0,3}(`{3,}|~{3,})/.test(s));
    fc.assert(fc.property(fc.array(line, { maxLength: 8 }), fc.constantFrom('\n', '\r\n'), (lines, eol) => {
      expect(parseSuggestions(['```suggestion', ...lines, '```'].join(eol))).toEqual([lines]);
    }), { numRuns: runs(500) });
  });
});

/* ─── Link header ─── */

describe('nextPage', () => {
  it('never throws on arbitrary headers', () => {
    fc.assert(fc.property(fc.option(fc.fullUnicodeString({ maxLength: 300 }), { nil: undefined }), (h) => {
      const p = nextPage(h);
      expect(p === null || (Number.isInteger(p) && p >= 0)).toBe(true);
    }), { numRuns: runs(1000) });
  });

  it('finds the next page in generated Link headers', () => {
    const rel = fc.constantFrom('prev', 'last', 'first');
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), fc.array(fc.tuple(rel, fc.integer({ min: 1, max: 99 })), { maxLength: 3 }), fc.nat(), (n, others, at) => {
      const parts = others.map(([r, p]) => `<https://api.github.com/x?per_page=50&page=${p}>; rel="${r}"`);
      parts.splice(at % (parts.length + 1), 0, `<https://api.github.com/x?per_page=50&page=${n}>; rel="next"`);
      expect(nextPage(parts.join(', '))).toBe(n);
    }), { numRuns: runs(500) });
  });
});
