/**
 * Parses a GitHub unified-diff `patch` (from GET /pulls/{n}/files) into lines that know their file line numbers,
 * which is what review comments need: `{ path, line, side }` where side is RIGHT for new/unchanged lines and
 * LEFT for deleted ones.
 */
export type DiffLine =
  | { kind: 'hunk'; text: string }
  | { kind: 'add' | 'del' | 'ctx'; text: string; old: number | null; new: number | null };

export function parsePatch(patch: string | undefined): DiffLine[] {
  if (!patch) return [];
  const out: DiffLine[] = [];
  let o = 0, n = 0;
  for (const raw of patch.split('\n')) {
    const h = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { o = Number(h[1]); n = Number(h[2]); out.push({ kind: 'hunk', text: raw }); continue; }
    if (raw.startsWith('\\')) continue; // "\ No newline at end of file"
    const c = raw[0];
    if (c === '+') out.push({ kind: 'add', text: raw, old: null, new: n++ });
    else if (c === '-') out.push({ kind: 'del', text: raw, old: o++, new: null });
    else out.push({ kind: 'ctx', text: raw, old: o++, new: n++ });
  }
  return out;
}

/** Where a review comment on this diff line goes. Hunk headers can't be commented on. */
export function anchorFor(line: DiffLine): { line: number; side: 'LEFT' | 'RIGHT' } | null {
  if (line.kind === 'hunk') return null;
  if (line.kind === 'del') return { line: line.old!, side: 'LEFT' };
  return { line: line.new!, side: 'RIGHT' };
}
