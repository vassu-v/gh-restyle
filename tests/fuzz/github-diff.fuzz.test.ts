import { runs } from './runs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anchorFor, parsePatch } from '../../packages/github/src/diff';

/* A tiny unified-diff generator: file A + random ops (keep / delete / insert) → file B and a patch with hunks. */

type Op = { t: 'ctx' | 'del' | 'add'; text: string; old?: number; new?: number };

// Line text: anything but line breaks. Includes characters that look like diff syntax.
const lineText = fc.oneof(
  fc.fullUnicodeString({ maxLength: 12 }).map((s) => s.replace(/[\r\n]/g, '')),
  fc.constantFrom('', ' ', '+', '-', '\\ No newline at end of file', '@@ -1,2 +3,4 @@', '@@', '--- a/x', '+++ b/x', '\t', ' ', ' '),
);

const scenario = fc.record({
  a: fc.array(lineText, { maxLength: 40 }),
  steps: fc.array(fc.record({ kind: fc.constantFrom('keep', 'keep', 'keep', 'del', 'add', 'replace'), text: lineText }), { maxLength: 60 }),
  context: fc.integer({ min: 0, max: 3 }),
  crlf: fc.boolean(),
  noFinalNewline: fc.boolean(),
});

function build({ a, steps, context, crlf, noFinalNewline }: fc.RecordValue<typeof scenario> extends infer R ? R : never) {
  const ops: Op[] = [];
  let i = 0;
  for (const s of steps) {
    if (s.kind === 'add') { ops.push({ t: 'add', text: s.text }); continue; }
    if (i >= a.length) continue;
    if (s.kind === 'keep') ops.push({ t: 'ctx', text: a[i++] });
    else if (s.kind === 'del') ops.push({ t: 'del', text: a[i++] });
    else { ops.push({ t: 'del', text: a[i++] }); ops.push({ t: 'add', text: s.text }); }
  }
  while (i < a.length) ops.push({ t: 'ctx', text: a[i++] });
  let o = 1, n = 1;
  for (const op of ops) { if (op.t !== 'add') op.old = o++; if (op.t !== 'del') op.new = n++; }
  const b = ops.filter((x) => x.t !== 'del').map((x) => x.text);

  // Hunks: every change plus `context` unchanged lines either side; overlapping windows merge.
  const keep = ops.map(() => false);
  ops.forEach((op, k) => { if (op.t !== 'ctx') for (let j = Math.max(0, k - context); j <= Math.min(ops.length - 1, k + context); j++) keep[j] = true; });
  const eol = crlf ? '\r\n' : '\n';
  const rows: string[] = [];
  let pos = { o: 0, n: 0 }; // last line number seen on each side
  for (let k = 0; k < ops.length;) {
    if (!keep[k]) { if (ops[k].old) pos.o = ops[k].old!; if (ops[k].new) pos.n = ops[k].new!; k++; continue; }
    let e = k; while (e < ops.length && keep[e]) e++;
    const hunk = ops.slice(k, e);
    const oc = hunk.filter((x) => x.t !== 'add').length, nc = hunk.filter((x) => x.t !== 'del').length;
    const os = oc ? hunk.find((x) => x.old)!.old! : pos.o, ns = nc ? hunk.find((x) => x.new)!.new! : pos.n;
    rows.push(`@@ -${os},${oc} +${ns},${nc} @@ ctx`);
    for (const x of hunk) rows.push((x.t === 'add' ? '+' : x.t === 'del' ? '-' : ' ') + x.text);
    for (const x of hunk) { if (x.old) pos.o = x.old; if (x.new) pos.n = x.new; }
    k = e;
  }
  let patch = rows.map((r) => r + (crlf && !r.startsWith('@@') ? '\r' : '')).join('\n');
  if (noFinalNewline && rows.length) patch += '\n\\ No newline at end of file';
  return { a, b, ops, patch, eol };
}

describe('parsePatch line mapping', () => {
  it('every RIGHT line maps to the new file, every LEFT line to the old file', () => {
    fc.assert(fc.property(scenario, (sc) => {
      const { a, b, ops, patch } = build(sc);
      const lines = parsePatch(patch);
      const changes = ops.filter((x) => x.t !== 'ctx').length;
      expect(lines.filter((l) => l.kind === 'add' || l.kind === 'del').length).toBe(changes);
      for (const l of lines) {
        const anchor = anchorFor(l);
        if (l.kind === 'hunk') { expect(anchor).toBeNull(); continue; }
        expect(anchor).not.toBeNull();
        const body = l.text.slice(1);
        if (anchor!.side === 'RIGHT') {
          expect(l.kind).not.toBe('del');
          expect(b[anchor!.line - 1], `RIGHT ${anchor!.line}`).toBe(body);
        } else {
          expect(l.kind).toBe('del');
          expect(a[anchor!.line - 1], `LEFT ${anchor!.line}`).toBe(body);
        }
        if (l.kind === 'ctx') expect(a[l.old! - 1]).toBe(body);
      }
    }), { numRuns: runs(500) });
  });

  it('the whole new file is recovered when the hunk covers everything', () => {
    fc.assert(fc.property(scenario, (sc) => {
      const { b, patch } = build({ ...sc, context: 1000 });
      const right = parsePatch(patch).filter((l) => l.kind !== 'hunk' && l.kind !== 'del');
      if (right.length) expect(right.map((l) => (l as { text: string }).text.slice(1))).toEqual(b);
    }), { numRuns: runs(300) });
  });

  it('never throws on arbitrary input', () => {
    fc.assert(fc.property(fc.option(fc.fullUnicodeString({ maxLength: 300 }), { nil: undefined }), (p) => {
      for (const l of parsePatch(p)) if (l.kind !== 'hunk') anchorFor(l);
    }), { numRuns: runs(1000) });
  });
});
