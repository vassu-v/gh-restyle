import { describe, expect, it } from 'vitest';
import { applyEdits, checkSuggestion, coAuthorLine, originalLines, parseSuggestions, splitSuggestionBody } from '../src/suggest';
import type { ReviewComment } from '../src/types';

const F = '```';

describe('parseSuggestions', () => {
  it('reads one or many blocks', () => {
    expect(parseSuggestions(`Try:\n\n${F}suggestion\n  a();\n  b();\n${F}`)).toEqual([['  a();', '  b();']]);
    expect(parseSuggestions(`${F}suggestion\nx\n${F}\nand\n${F}suggestion\ny\n${F}`)).toEqual([['x'], ['y']]);
    expect(parseSuggestions('no blocks here')).toEqual([]);
  });
  it('an empty block deletes lines', () => {
    expect(parseSuggestions(`Drop it:\n${F}suggestion\n${F}`)).toEqual([[]]);
  });
  it('handles tildes, longer fences and nested fences', () => {
    expect(parseSuggestions('~~~suggestion\nx = 1\n~~~')).toEqual([['x = 1']]);
    expect(parseSuggestions(`\`\`\`\`suggestion\n/**\n${F}ts\nexample()\n${F}\n*/\n\`\`\`\``)).toEqual([['/**', `${F}ts`, 'example()', F, '*/']]);
    // A suggestion shown inside another code block is an example, not a suggestion.
    expect(parseSuggestions(`\`\`\`\`md\n${F}suggestion\nx\n${F}\n\`\`\`\``)).toEqual([]);
    // Closing fence must use the same character.
    expect(parseSuggestions(`~~~suggestion\n${F}\n~~~`)).toEqual([[F]]);
    expect(parseSuggestions(`${F}suggestion\r\na\r\n${F}`)).toEqual([['a']]);
  });
});

describe('splitSuggestionBody', () => {
  it('keeps markdown around the blocks in order', () => {
    expect(splitSuggestionBody(`Ties:\n\n${F}suggestion\nx\n${F}\n\nThanks!`)).toEqual([
      { kind: 'md', text: 'Ties:' }, { kind: 'suggestion', lines: ['x'] }, { kind: 'md', text: 'Thanks!' },
    ]);
    expect(splitSuggestionBody(`hi\n${F}js\ncode\n${F}`)).toEqual([{ kind: 'md', text: `hi\n${F}js\ncode\n${F}` }]);
  });
});

const hunk = '@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n d';
const rc = (o: Partial<ReviewComment> = {}): ReviewComment => ({
  id: 1, user: { login: 'mira', id: 101, avatar_url: '' }, body: `${F}suggestion\nX\n${F}`, path: 'src/a.ts',
  line: 3, side: 'RIGHT', original_line: 3, original_start_line: 2, start_line: 2, diff_hunk: hunk, created_at: '2026-01-01T00:00:00Z', ...o,
});

describe('originalLines', () => {
  it('reads RIGHT lines from the hunk', () => {
    expect(originalLines(rc())).toEqual(['B', 'C']);
    expect(originalLines(rc({ original_start_line: null, original_line: 4 }))).toEqual(['d']);
  });
  it('is null when lines are missing', () => {
    expect(originalLines(rc({ original_line: 9, original_start_line: null }))).toBeNull();
    expect(originalLines(rc({ diff_hunk: undefined }))).toBeNull();
    expect(originalLines(rc({ original_line: null }))).toBeNull();
  });
});

describe('checkSuggestion', () => {
  const ok = { prOpen: true, canWrite: true };
  it('passes a good one', () => {
    expect(checkSuggestion(rc(), ok)).toEqual({ ok: true, suggestion: { commentId: 1, path: 'src/a.ts', startLine: 2, endLine: 3, lines: ['X'], author: rc().user } });
    expect(checkSuggestion(rc({ start_line: null }), ok)).toMatchObject({ ok: true, suggestion: { startLine: 3, endLine: 3 } });
  });
  it('explains each block', () => {
    const reason = (c: ReviewComment, ctx = ok) => { const r = checkSuggestion(c, ctx); return r.ok ? null : r.reason; };
    expect(reason(rc({ body: `${F}suggestion\na\n${F}\n${F}suggestion\nb\n${F}` }))).toBe('This comment has more than one suggestion. Apply it on GitHub.');
    expect(reason(rc({ side: 'LEFT' }))).toBe("Suggestions on deleted lines can't be applied.");
    expect(reason(rc({ start_side: 'LEFT' }))).toBe("Suggestions on deleted lines can't be applied.");
    expect(reason(rc({ line: null }))).toBe("The code changed since this suggestion. It's outdated.");
    expect(reason(rc(), { prOpen: false, canWrite: true })).toBe('The pull request is closed.');
    expect(reason(rc({ path: '.github/workflows/ci.yml' }))).toBe("Workflow files can't be changed from Gitling.");
    expect(reason(rc(), { prOpen: true, canWrite: false })).toBe('You need write access to apply suggestions.');
  });
});

describe('applyEdits', () => {
  const t = 'a\nb\nc\nd\n';
  it('single, multi-line, delete', () => {
    expect(applyEdits(t, [{ startLine: 2, endLine: 2, lines: ['B'] }])).toBe('a\nB\nc\nd\n');
    expect(applyEdits(t, [{ startLine: 2, endLine: 3, lines: ['X', 'Y', 'Z'] }])).toBe('a\nX\nY\nZ\nd\n');
    expect(applyEdits(t, [{ startLine: 1, endLine: 2, lines: [] }])).toBe('c\nd\n');
  });
  it('applies a batch whatever the order', () => {
    expect(applyEdits(t, [{ startLine: 4, endLine: 4, lines: ['D1', 'D2'] }, { startLine: 1, endLine: 1, lines: [] }, { startLine: 2, endLine: 2, lines: ['B'] }])).toBe('B\nc\nD1\nD2\n');
  });
  it('refuses overlaps and ranges past the end', () => {
    expect(() => applyEdits(t, [{ startLine: 1, endLine: 2, lines: [] }, { startLine: 2, endLine: 3, lines: [] }])).toThrow('Two suggestions change the same lines.');
    expect(() => applyEdits(t, [{ startLine: 4, endLine: 5, lines: [] }])).toThrow('A suggestion points past the end of the file.');
  });
  it('keeps CRLF and a missing final newline', () => {
    expect(applyEdits('a\r\nb\r\n', [{ startLine: 2, endLine: 2, lines: ['B'] }])).toBe('a\r\nB\r\n');
    expect(applyEdits('a\nb', [{ startLine: 2, endLine: 2, lines: ['B', 'C'] }])).toBe('a\nB\nC');
    expect(applyEdits('a\r\nb', [{ startLine: 1, endLine: 1, lines: ['A'] }])).toBe('A\r\nb');
  });
});

it('coAuthorLine', () => {
  expect(coAuthorLine({ login: 'mira', id: 101, avatar_url: '' })).toBe('Co-authored-by: mira <101+mira@users.noreply.github.com>');
  expect(coAuthorLine({ login: 'ghost', avatar_url: '' })).toBe('Co-authored-by: ghost <ghost@users.noreply.github.com>');
});

describe('applyEdits with mixed line endings', () => {
  it('keeps every untouched line byte-identical and numbers lines like split(/\\r?\\n/)', () => {
    const text = 'a\nb\r\nc\nd\n';
    expect(applyEdits(text, [{ startLine: 3, endLine: 3, lines: ['C'] }])).toBe('a\nb\r\nC\nd\n');
    expect(applyEdits(text, [{ startLine: 2, endLine: 2, lines: ['B1', 'B2'] }])).toBe('a\nB1\r\nB2\r\nc\nd\n');
    expect(applyEdits(text, [{ startLine: 4, endLine: 4, lines: ['D'] }])).toBe('a\nb\r\nc\nD\n');
  });
  it('deleting the last lines of a file without a final newline adds none', () => {
    expect(applyEdits('a\nb\nc', [{ startLine: 2, endLine: 3, lines: [] }])).toBe('a');
  });
});

describe('review fixes', () => {
  it('strips the fence indent from suggestion lines (CommonMark)', () => {
    expect(parseSuggestions('- note\n  ```suggestion\n  foo\n    bar\n baz\n  ```')).toEqual([['foo', '  bar', 'baz']]);
  });
  it('gives new lines before a final line without an ending the file\'s usual ending', () => {
    expect(applyEdits('a\r\nb', [{ startLine: 2, endLine: 2, lines: ['x', 'y'] }])).toBe('a\r\nx\r\ny');
    expect(applyEdits('b', [{ startLine: 1, endLine: 1, lines: ['x', 'y'] }])).toBe('x\ny');
  });
  it('reads original lines from CRLF hunks', () => {
    const c = { id: 1, user: { login: 'u', avatar_url: '' }, body: '', path: 'p', line: 2, original_line: 2, diff_hunk: '@@ -1,2 +1,2 @@\r\n a\r\n-b\r\n+c\r', created_at: '' };
    expect(originalLines(c)).toEqual(['c']);
  });
});
