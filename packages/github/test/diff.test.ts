import { expect, it } from 'vitest';
import { anchorFor, parsePatch } from '../src/diff';

const patch = '@@ -18,4 +18,5 @@ export async function sync() {\n   const remote = await fetchRemote();\n-  await flush(local);\n+  const merged = merge(remote, local);\n+  await push(merged);\n   return done;\n\\ No newline at end of file\n@@ -40,2 +41,2 @@\n-a\n+b';

it('numbers lines per side across hunks', () => {
  const l = parsePatch(patch);
  expect(l.map((x) => x.kind)).toEqual(['hunk', 'ctx', 'del', 'add', 'add', 'ctx', 'hunk', 'del', 'add']);
  expect(l[1]).toMatchObject({ old: 18, new: 18 });
  expect(l[2]).toMatchObject({ old: 19, new: null });
  expect(l[3]).toMatchObject({ old: null, new: 19 });
  expect(l[4]).toMatchObject({ new: 20 });
  expect(l[5]).toMatchObject({ old: 20, new: 21 });
  expect(l[7]).toMatchObject({ old: 40 });
  expect(l[8]).toMatchObject({ new: 41 });
});

it('anchors comments: deletions LEFT, everything else RIGHT, hunks nowhere', () => {
  const l = parsePatch(patch);
  expect(anchorFor(l[0])).toBeNull();
  expect(anchorFor(l[2])).toEqual({ line: 19, side: 'LEFT' });
  expect(anchorFor(l[3])).toEqual({ line: 19, side: 'RIGHT' });
  expect(anchorFor(l[5])).toEqual({ line: 21, side: 'RIGHT' });
});

it('handles empty patches', () => { expect(parsePatch(undefined)).toEqual([]); });

it('drops the "\r" of CRLF patches and ignores a final newline', () => {
  const l = parsePatch('@@ -1,2 +1,2 @@\r\n a\r\n-b\r\n+c\r\n');
  expect(l.map((x) => x.text)).toEqual(['@@ -1,2 +1,2 @@', ' a', '-b', '+c']);
  expect(l.at(-1)).toMatchObject({ kind: 'add', new: 2 });
});
