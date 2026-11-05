import { describe, expect, it } from 'vitest';
import { groupThreads } from '../src/threads';
import type { ReviewComment, ThreadState } from '../src/types';

const c = (id: number, min: number, o: Partial<ReviewComment> = {}): ReviewComment => ({
  id, user: { login: 'u', avatar_url: '' }, body: `#${id}`, path: 'a.ts', line: 5, side: 'RIGHT', created_at: `2026-01-01T00:${String(min).padStart(2, '0')}:00Z`, ...o,
});
const st = (rootId: number, o: Partial<ThreadState> = {}): ThreadState => ({
  id: `RT_${rootId}`, rootId, isResolved: false, isOutdated: false, viewerCanResolve: true, viewerCanUnresolve: true, viewerCanReply: true, ...o,
});

describe('groupThreads', () => {
  const comments = [
    c(3, 3, { in_reply_to_id: 1 }),
    c(1, 1),
    c(2, 2, { path: 'b.ts', line: null, start_line: 1 }),
    c(4, 4, { in_reply_to_id: 3 }), // reply to a reply: follows the chain to 1
    c(5, 5, { in_reply_to_id: 99 }), // orphan: its root isn't in the list, so it is a root
  ];
  it('groups roots, replies and chains, ordered by time', () => {
    const t = groupThreads(comments);
    expect(t.map((x) => x.root.id)).toEqual([1, 2, 5]);
    expect(t[0].replies.map((r) => r.id)).toEqual([3, 4]);
    expect(t[1]).toMatchObject({ path: 'b.ts', line: null, startLine: 1, outdated: true, side: 'RIGHT' });
    expect(t[2].replies).toEqual([]);
  });
  it('without states: open, replyable, not resolvable', () => {
    for (const x of groupThreads(comments, null)) expect(x).toMatchObject({ resolved: false, threadId: null, canResolve: false, canUnresolve: false, canReply: true });
  });
  it('merges GraphQL states by root id', () => {
    const t = groupThreads(comments, [st(1, { isResolved: true, viewerCanReply: false }), st(5, { isOutdated: true, viewerCanResolve: false })]);
    expect(t[0]).toMatchObject({ resolved: true, threadId: 'RT_1', canResolve: true, canReply: false, outdated: false });
    expect(t[1]).toMatchObject({ resolved: false, threadId: null, outdated: true });
    expect(t[2]).toMatchObject({ outdated: true, canResolve: false, threadId: 'RT_5' });
  });
});
