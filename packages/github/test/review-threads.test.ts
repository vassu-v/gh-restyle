import type { ReviewComment } from '../src/types';
import { describe, expect, it } from 'vitest';
import { createApi } from '../src/api';
import { applySuggestions, decodeSource, type ApplyDeps } from '../src/apply';
import { createClient } from '../src/client';
import { originalLines } from '../src/suggest';
import type { NewTreeEntry } from '../src/types';
import { groupThreads } from '../src/threads';

// Runs in order against one sample session: each step sees what the previous one changed.
const api = createApi(createClient({ kind: 'sample' }));
const O = 'you', R = 'trail-notes', N = 45;
const comments = () => api.reviewComments(O, R, N);
const byId = async (id: number) => (await comments()).find((c) => c.id === id)!;

describe('review threads against sample data', () => {
  it('has the sample threads A, B, C', async () => {
    const cs = await comments();
    expect(cs.map((c) => c.id)).toEqual([951, 952, 953, 955]);
    expect(cs.every((c) => c.diff_hunk && c.original_line && c.commit_id === 'a91f3c2e')).toBe(true);
    expect(originalLines(cs[0])).toEqual(['    return remote.updatedAt >= local.updatedAt ? remote : local;']);
    expect(originalLines(cs[2])).toEqual(['  private patches: Patch[] = [];']);
    expect(originalLines(cs[3])).toEqual(['      const merged = queue.merge(entry, local);', '      await db.put(merged);', '      await push(merged);']);
    expect(cs[0].user).toMatchObject({ login: 'mira', id: 101 });
    const files = await api.prFiles(O, R, N);
    expect(files[0].patch!.split('\n')[0]).toBe('@@ -0,0 +1,14 @@');
    const threads = groupThreads(cs, await api.reviewThreads(O, R, N));
    expect(threads.map((t) => [t.root.id, t.resolved, t.startLine])).toEqual([[955, true, 22], [951, false, null], [953, false, null]]);
    expect(threads[1]).toMatchObject({ threadId: 'RT_951', canResolve: true, canReply: true, replies: [{ id: 952 }] });
  });

  it('replies go to the thread root', async () => {
    const r = await api.replyToReviewComment(O, R, N, 952, 'Done in the next push.');
    expect(r).toMatchObject({ in_reply_to_id: 951, path: 'src/sync/queue.ts', line: 12, user: { login: 'you' } });
    const t = groupThreads(await comments());
    expect(t.find((x) => x.root.id === 951)!.replies.map((x) => x.body)).toEqual(["Good catch, I'll take it.", 'Done in the next push.']);
  });

  it('resolves and unresolves', async () => {
    const state = async (id: string) => (await api.reviewThreads(O, R, N)).find((s) => s.id === id)!.isResolved;
    expect(await api.resolveThread('RT_951')).toBe(true);
    expect(await state('RT_951')).toBe(true);
    expect(await api.unresolveThread('RT_955')).toBe(true);
    expect(await state('RT_955')).toBe(false);
    await api.unresolveThread('RT_951');
    await expect(api.resolveThread('RT_nope')).rejects.toMatchObject({ status: 422 });
  });

  it('stores multi-line review comments with their anchors', async () => {
    await api.submitReview('lin', 'tiny-sync', 33, { event: 'COMMENT', comments: [{ path: 'src/sync/initial.ts', start_line: 11, start_side: 'RIGHT', line: 13, side: 'RIGHT', body: 'hm' }] });
    const [c] = await api.reviewComments('lin', 'tiny-sync', 33);
    expect(c).toMatchObject({ start_line: 11, start_side: 'RIGHT', line: 13, original_start_line: 11, original_line: 13, commit_id: 'b47c0e19' });
    expect(originalLines(c)).toEqual(['  const BATCH = 500;', '  for (let i = 0; i < ops.length; i += BATCH) {', '    const batch = ops.slice(i, i + BATCH);']);
    expect((await api.reviewThreads('lin', 'tiny-sync', 33))[0]).toMatchObject({ rootId: c.id, viewerCanResolve: true });
  });

  it('applies one suggestion: the branch moves, the file changes, the thread goes outdated', async () => {
    const before = await api.pull(O, R, N);
    const res = await api.applySuggestions(O, R, N, [await byId(951)], { viewer: 'you' });
    expect(res.applied).toBe(1);
    const pr = await api.pull(O, R, N);
    expect(pr.head.sha).toBe(res.sha);
    expect(pr.head.sha).not.toBe(before.head.sha);
    const text = await api.fileText(O, R, 'src/sync/queue.ts', 'fix/offline-merge');
    expect(text.split('\n')[11]).toBe('    return remote.updatedAt > local.updatedAt ? remote : local;');
    expect(await api.fileText(O, R, 'src/sync/queue.ts', res.sha)).toBe(text);
    expect((await byId(951)).line).toBeNull();
    expect((await byId(953)).line).toBe(4); // untouched lines stay current
    expect((await api.reviewThreads(O, R, N)).find((s) => s.rootId === 951)!.isOutdated).toBe(true);
    // The diff shows the change.
    expect((await api.prFiles(O, R, N))[0].patch).toContain('+    return remote.updatedAt > local.updatedAt ? remote : local;');
    const commit = await api.gitCommit(O, R, res.sha);
    expect(commit.message).toBe('Apply suggestion from code review\n\nCo-authored-by: mira <101+mira@users.noreply.github.com>');
    expect(commit.parents).toEqual([{ sha: before.head.sha }]);
  });

  it('refuses an outdated suggestion', async () => {
    await expect(api.applySuggestions(O, R, N, [await byId(951)])).rejects.toMatchObject({ status: 422, message: "The code changed since this suggestion. It's outdated." });
    // Line still set, but the file no longer matches what the reviewer saw.
    const stale = { ...(await byId(953)), diff_hunk: '@@ -0,0 +1,4 @@\n+a\n+b\n+c\n+d' };
    await expect(api.applySuggestions(O, R, N, [stale])).rejects.toThrow("The code changed since this suggestion. It's outdated.");
  });

  it('applies a batch, including a suggestion written just now, in one commit', async () => {
    await api.submitReview(O, R, N, { event: 'COMMENT', comments: [{ path: 'src/sync/queue.ts', start_line: 6, start_side: 'RIGHT', line: 8, side: 'RIGHT', body: 'Shorter:\n\n```suggestion\n  push(entryId: string, field: keyof Entry, value: unknown) { this.patches.push({ entryId, field, value, at: Date.now() }); }\n```' }] });
    const fresh = (await comments()).at(-1)!;
    expect(fresh.commit_id).toBe((await api.pull(O, R, N)).head.sha);
    const head = (await api.pull(O, R, N)).head.sha;
    const res = await api.applySuggestions(O, R, N, [fresh, await byId(953)], { viewer: 'you' });
    expect(res.applied).toBe(2);
    const lines = (await api.fileText(O, R, 'src/sync/queue.ts', 'fix/offline-merge')).split('\n');
    expect(lines[3]).toBe('  private readonly patches: Patch[] = [];');
    expect(lines[5]).toMatch(/^ {2}push\(.*\); }$/);
    expect(lines).toHaveLength(13); // 14 lines − 2, plus the final ''
    const commit = await api.gitCommit(O, R, res.sha);
    expect(commit.parents).toEqual([{ sha: head }]);
    expect(commit.message).toBe('Apply suggestions from code review\n\nCo-authored-by: lin <102+lin@users.noreply.github.com>');
    expect((await byId(fresh.id)).line).toBeNull();
    expect((await byId(953)).line).toBeNull();
  });

  it('refuses to move the branch from a stale parent (fast-forward only)', async () => {
    const pr = await api.pull(O, R, N);
    const c = await api.gitCommit(O, R, pr.head.sha);
    const old = c.parents![0].sha;
    const tree = await api.createTree(O, R, { base_tree: c.tree.sha, tree: [{ path: 'x.txt', mode: '100644', type: 'blob', content: 'x' }] });
    const stale = await api.createCommit(O, R, { message: 'stale', tree: tree.sha, parents: [old] });
    await expect(api.updateBranch(O, R, 'fix/offline-merge', stale.sha)).rejects.toMatchObject({ status: 422 });
    expect((await api.pull(O, R, N)).head.sha).toBe(pr.head.sha);
  });

  it('reads trees one level at a time', async () => {
    const c = await api.gitCommit(O, R, (await api.pull(O, R, N)).head.sha);
    const root = await api.gitTree(O, R, c.tree.sha);
    const src = root.tree.find((e) => e.path === 'src')!;
    expect(src).toMatchObject({ type: 'tree', mode: '040000' });
    const sync = (await api.gitTree(O, R, src.sha)).tree.find((e) => e.path === 'sync')!;
    expect((await api.gitTree(O, R, sync.sha)).tree.map((e) => e.path).sort()).toEqual(['index.ts', 'queue.test.ts', 'queue.ts']);
  });

  it('refuses closed PRs and PRs you cannot write to', async () => {
    // A real sample comment, so it passes the "GitHub's copy matches" check and fails on write access.
    await api.submitReview('lin', 'tiny-sync', 33, { event: 'COMMENT', comments: [{ path: 'src/sync/initial.ts', line: 11, side: 'RIGHT', body: '```suggestion\n  const BATCH = 1000;\n```' }] });
    const withSuggestion = (await api.reviewComments('lin', 'tiny-sync', 33)).at(-1)!;
    await expect(api.applySuggestions('lin', 'tiny-sync', 33, [withSuggestion])).rejects.toThrow(/didn't let Gitling write|Not in the sample/);
  });
});

/** A fake GitHub that knows these comments, by id. */
const knownComments = (list: ReviewComment[]) => async (_o: string, _r: string, id: number) => list.find((c) => c.id === id) ?? null;

describe('applySuggestions guards (fake GitHub)', () => {
  const comment = { id: 7, user: { login: 'mira', id: 101, avatar_url: '' }, body: '```suggestion\nB\n```', path: 'f.txt', line: 2, side: 'RIGHT' as const, original_line: 2, diff_hunk: '@@ -1,2 +1,2 @@\n a\n+b', created_at: '' };
  const fake = (o: Partial<ApplyDeps> & { pr?: object } = {}): ApplyDeps => ({
    pull: async () => ({ state: 'open', head: { ref: 'f', sha: 'h1', repo: { full_name: 'me/r', owner: { login: 'me' } } }, ...o.pr }) as never,
    reviewComment: async (_o, _r, id) => (id === comment.id ? comment : null),
    fileSource: async () => ({ text: 'a\nb\n', bom: false }),
    gitCommit: async () => ({ sha: 'h1', tree: { sha: 't1' } }),
    gitTree: async () => ({ sha: 't1', tree: [{ path: 'f.txt', mode: '100755', type: 'blob', sha: 'b' }] }),
    createTree: async () => ({ sha: 't2' }),
    createCommit: async () => ({ sha: 'c2' }),
    updateBranch: async () => ({}),
    ...o,
  });
  it('maps git answers to plain sentences', async () => {
    await expect(applySuggestions(fake({ updateBranch: async () => { throw Object.assign(new Error('Update is not a fast forward'), { status: 422 }); } }), 'me', 'r', 1, [comment]))
      .rejects.toThrow('The branch changed while you were applying. Refresh and try again.');
    await expect(applySuggestions(fake({ updateBranch: async () => { throw Object.assign(new Error('nope'), { status: 403 }); } }), 'me', 'r', 1, [comment]))
      .rejects.toThrow("GitHub didn't let Gitling write to this branch.");
  });
  it('checks the PR and the fork', async () => {
    await expect(applySuggestions(fake({ pr: { state: 'closed' } }), 'me', 'r', 1, [comment])).rejects.toThrow('The pull request is closed.');
    await expect(applySuggestions(fake({ pr: { head: { ref: 'f', sha: 'h1', repo: null } } }), 'me', 'r', 1, [comment])).rejects.toThrow("The pull request's branch is gone.");
    const fork = { head: { ref: 'f', sha: 'h1', repo: { full_name: 'ann/r', owner: { login: 'ann' } } }, maintainer_can_modify: false };
    await expect(applySuggestions(fake({ pr: fork }), 'me', 'r', 1, [comment], { viewer: 'me' })).rejects.toThrow("doesn't allow edits from maintainers");
    expect(await applySuggestions(fake({ pr: fork }), 'me', 'r', 1, [comment], { viewer: 'ann' })).toEqual({ sha: 'c2', applied: 1 });
  });
  it('keeps the file mode and uses a custom message', async () => {
    const calls: unknown[] = [];
    await applySuggestions(fake({
      createTree: async (_o, _r, t) => { calls.push(t); return { sha: 't2' }; },
      createCommit: async (_o, _r, c) => { calls.push(c); return { sha: 'c2' }; },
    }), 'me', 'r', 1, [comment], { message: 'Use B', viewer: 'mira' });
    expect(calls).toEqual([
      { base_tree: 't1', tree: [{ path: 'f.txt', mode: '100755', type: 'blob', content: 'a\nB\n' }] },
      { message: 'Use B', tree: 't2', parents: ['h1'] },
    ]);
  });
  it('rejects overlapping suggestions in a batch', async () => {
    await expect(applySuggestions(fake({ reviewComment: knownComments([comment, { ...comment, id: 8 }]) }), 'me', 'r', 1, [comment, { ...comment, id: 8 }])).rejects.toThrow('Two suggestions change the same lines.');
  });
  it("refuses when GitHub's copy of a comment moved on (a push since the comments loaded)", async () => {
    await expect(applySuggestions(fake({ reviewComment: knownComments([{ ...comment, line: 5 }]) }), 'me', 'r', 1, [comment])).rejects.toThrow("It's outdated.");
    await expect(applySuggestions(fake({ reviewComment: knownComments([]) }), 'me', 'r', 1, [comment])).rejects.toThrow("It's outdated.");
  });
  const written = () => {
    const trees: NewTreeEntry[][] = [];
    return { trees, createTree: async (_o: string, _r: string, t: { tree: NewTreeEntry[] }) => { trees.push(t.tree); return { sha: 't2' }; } };
  };
  it('keeps a BOM and refuses files that are not UTF-8', async () => {
    expect(decodeSource(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x0a]))).toEqual({ text: 'a\n', bom: true });
    expect(() => decodeSource(new Uint8Array([0xe9, 0x0a]))).toThrow("isn't saved as UTF-8");
    const first = { ...comment, line: 1, original_line: 1, diff_hunk: '@@ -0,0 +1,2 @@\n+﻿a\n+b' };
    const w = written();
    await applySuggestions(fake({ reviewComment: knownComments([first]), fileSource: async () => ({ text: 'a\nb\n', bom: true }), createTree: w.createTree }), 'me', 'r', 1, [first]);
    expect(w.trees[0][0].content).toBe('﻿B\nb\n');
  });
  it('applies to CRLF files, whose hunks carry "\\r"', async () => {
    const crlf = { ...comment, diff_hunk: '@@ -1,2 +1,2 @@\r\n a\r\n+b\r' };
    const w = written();
    await applySuggestions(fake({ reviewComment: knownComments([crlf]), fileSource: async () => ({ text: 'a\r\nb\r\n', bom: false }), createTree: w.createTree }), 'me', 'r', 1, [crlf]);
    expect(w.trees[0][0].content).toBe('a\r\nB\r\n');
  });
  it('defaults the mode only when the tree is really missing, and stops on other errors', async () => {
    const w = written();
    const fail = (status: number) => async () => { throw Object.assign(new Error(`HTTP ${status}`), { status }); };
    await applySuggestions(fake({ gitTree: fail(404), createTree: w.createTree }), 'me', 'r', 1, [comment]);
    expect(w.trees[0][0].mode).toBe('100644');
    await expect(applySuggestions(fake({ gitTree: fail(502) }), 'me', 'r', 1, [comment])).rejects.toThrow('HTTP 502');
  });
});
