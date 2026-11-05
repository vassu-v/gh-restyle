import type { ReviewComment, ReviewThread, ThreadState } from './types';

/**
 * Groups REST review comments into threads and merges GraphQL thread state (resolved, permissions).
 * REST has the comments but no thread id or resolved flag; GraphQL has those, keyed by the root's databaseId.
 * Without states (GraphQL failed or not loaded) threads still show and can take replies, but can't be resolved.
 */
export function groupThreads(comments: ReviewComment[], states?: ThreadState[] | null): ReviewThread[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: ReviewComment) => {
    // GitHub stores replies against the root, but follow chains anyway; stop on unknown ids (orphans) and cycles.
    const seen = new Set<number>();
    let cur = c;
    while (cur.in_reply_to_id != null && byId.has(cur.in_reply_to_id) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.in_reply_to_id)!; }
    return cur;
  };
  const byTime = (a: ReviewComment, b: ReviewComment) => a.created_at.localeCompare(b.created_at) || a.id - b.id;
  // When a thread's first comment is deleted, its replies still point at it. They stay one thread, rooted at the
  // oldest of them, which is also the comment GraphQL now reports first (so the thread keeps its state and id).
  const members = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const top = rootOf(c);
    const key = top.in_reply_to_id != null ? `gone:${top.in_reply_to_id}` : String(top.id);
    members.set(key, [...(members.get(key) ?? []), c]);
  }
  const groups = [...members.values()].map((list) => {
    const [root, ...replies] = [...list].sort(byTime);
    return { root, replies };
  });
  const stateOf = new Map((states ?? []).map((s) => [s.rootId, s]));
  return groups.sort((a, b) => byTime(a.root, b.root)).map(({ root, replies }) => {
    const s = stateOf.get(root.id);
    return {
      root, replies: replies.sort(byTime),
      path: root.path, line: root.line, side: root.side ?? 'RIGHT', startLine: root.start_line ?? null,
      outdated: root.line == null || !!s?.isOutdated,
      resolved: s?.isResolved ?? false,
      threadId: s?.id ?? null,
      canResolve: s?.viewerCanResolve ?? false,
      canUnresolve: s?.viewerCanUnresolve ?? false,
      canReply: s?.viewerCanReply ?? true,
    };
  });
}
