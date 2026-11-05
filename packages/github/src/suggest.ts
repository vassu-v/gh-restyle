import { parsePatch } from './diff';
import type { ReviewComment, SuggestionCheck, User } from './types';

/**
 * Suggested changes: a ```suggestion fence in a review comment replaces the commented lines (start_line..line,
 * RIGHT side) with the block's lines. GitHub has no API to apply one, so Gitling does it itself (apply.ts);
 * these are the pure parts.
 */

type Segment = { kind: 'md'; text: string } | { kind: 'suggestion'; lines: string[] };

// CommonMark fences: 3+ backticks or tildes, up to 3 spaces of indent. A backtick fence's info can't hold backticks.
const OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/** Splits a comment body into markdown text and suggestion blocks, in order (for rendering the card in place). */
export function splitSuggestionBody(body: string): Segment[] {
  const lines = body.split(/\r?\n/);
  const out: Segment[] = [];
  let md: string[] = [];
  const flushMd = () => { const text = md.join('\n').replace(/^\n+|\n+$/g, ''); if (text.trim()) out.push({ kind: 'md', text }); md = []; };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPEN);
    if (!m || (m[2][0] === '`' && m[3].includes('`'))) { md.push(lines[i]); continue; }
    const indent = m[1].length, fence = m[2], info = m[3].trim().split(/\s+/)[0];
    // Find the closing fence: same character, at least as long, nothing else on the line.
    const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    if (info === 'suggestion') {
      flushMd();
      // CommonMark: content lines lose up to the opening fence's indent (a fence inside a list item, say).
      const dedent = new RegExp(`^ {0,${indent}}`);
      out.push({ kind: 'suggestion', lines: lines.slice(i + 1, j).map((l) => l.replace(dedent, '')) });
    } else {
      // Any other code block (even one that shows a ```suggestion example inside it) stays markdown.
      md.push(...lines.slice(i, Math.min(j + 1, lines.length)));
    }
    i = j; // an unclosed fence runs to the end of the body, as in CommonMark
  }
  flushMd();
  return out;
}

/** Each suggestion block's lines. An empty block is `[]`, which deletes the commented lines. */
export function parseSuggestions(body: string): string[][] {
  return splitSuggestionBody(body).flatMap((s) => (s.kind === 'suggestion' ? [s.lines] : []));
}

/**
 * The RIGHT-side lines the comment was written against (original_start_line..original_line), read from its
 * diff_hunk. null when they aren't all in the hunk, so the caller can't confirm the code is unchanged.
 */
export function originalLines(c: ReviewComment): string[] | null {
  const end = c.original_line;
  if (end == null || !c.diff_hunk) return null;
  const start = c.original_start_line ?? end;
  const byLine = new Map<number, string>();
  for (const l of parsePatch(c.diff_hunk)) if (l.kind !== 'hunk' && l.new != null) byLine.set(l.new, l.text.slice(1));
  const out: string[] = [];
  for (let n = start; n <= end; n++) { const t = byLine.get(n); if (t === undefined) return null; out.push(t); }
  return out;
}

export const REASONS = {
  count: 'This comment has more than one suggestion. Apply it on GitHub.',
  left: "Suggestions on deleted lines can't be applied.",
  outdated: "The code changed since this suggestion. It's outdated.",
  closed: 'The pull request is closed.',
  workflow: "Workflow files can't be changed from Gitling.",
  write: 'You need write access to apply suggestions.',
} as const;

/** Whether Gitling can apply this comment's suggestion, and if not, the reason to show (UI text). */
export function checkSuggestion(c: ReviewComment, ctx: { prOpen: boolean; canWrite: boolean }): SuggestionCheck {
  const blocks = parseSuggestions(c.body ?? '');
  if (blocks.length !== 1) return { ok: false, reason: REASONS.count };
  if (c.side === 'LEFT' || c.start_side === 'LEFT') return { ok: false, reason: REASONS.left };
  if (c.line == null) return { ok: false, reason: REASONS.outdated };
  if (!ctx.prOpen) return { ok: false, reason: REASONS.closed };
  if (c.path.startsWith('.github/workflows/')) return { ok: false, reason: REASONS.workflow }; // needs the `workflow` scope
  if (!ctx.canWrite) return { ok: false, reason: REASONS.write };
  return { ok: true, suggestion: { commentId: c.id, path: c.path, startLine: c.start_line ?? c.line, endLine: c.line, lines: blocks[0], author: c.user } };
}

export type Edit = { startLine: number; endLine: number; lines: string[] };

/**
 * Replaces 1-based inclusive line ranges. Each line keeps its own ending (CRLF or LF, so files with mixed endings
 * stay byte-identical outside the edits), and the file keeps whether it ends with a newline. Line numbers match
 * `text.split(/\r?\n/)`, which is how apply.ts checks the original lines.
 */
export function applyEdits(text: string, edits: Edit[]): string {
  const lines = (text.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((raw) => {
    const m = raw.match(/\r?\n$/);
    return { content: m ? raw.slice(0, -m[0].length) : raw, eol: m ? m[0] : '' };
  });
  const sorted = [...edits].sort((a, b) => a.startLine - b.startLine);
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.startLine < 1 || e.endLine < e.startLine || e.endLine > lines.length) throw new Error('A suggestion points past the end of the file.');
    if (i > 0 && sorted[i - 1].endLine >= e.startLine) throw new Error('Two suggestions change the same lines.');
  }
  // Bottom-up, so earlier ranges keep their line numbers. New lines take the replaced lines' endings: the first
  // replaced line's inside the block, the last one's at its end (empty at the end of a file without a final newline).
  // The file's last line may have no ending; new lines placed before it take the file's usual one.
  const crlf = (text.match(/\r\n/g) ?? []).length, lf = (text.match(/\n/g) ?? []).length - crlf;
  const usual = crlf > lf ? '\r\n' : '\n';
  for (const e of sorted.reverse()) {
    const inner = lines[e.startLine - 1].eol || usual;
    const last = lines[e.endLine - 1].eol;
    const repl = e.lines.map((content, i) => ({ content, eol: i === e.lines.length - 1 ? last : inner }));
    lines.splice(e.startLine - 1, e.endLine - e.startLine + 1, ...repl);
  }
  // Deleting the last lines of a file without a final newline must not leave one behind.
  if (lines.length && !/\n$/.test(text)) lines[lines.length - 1].eol = '';
  return lines.map((l) => l.content + l.eol).join('');
}

/** The trailer GitHub uses to credit a suggestion's author on the commit. */
export function coAuthorLine(u: User): string {
  return `Co-authored-by: ${u.login} <${u.id != null ? `${u.id}+` : ''}${u.login}@users.noreply.github.com>`;
}
