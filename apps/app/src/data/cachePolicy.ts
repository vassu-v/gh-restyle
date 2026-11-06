// Which queries the saved cache keeps (src/data/persist.ts). Pure, so it's unit-tested (tests/cache-policy.test.ts).

/** Lists and screens worth showing at once on the next open. Not here on purpose: file contents and PR diffs
 *  ('file', 'file-info', 'files': can be megabytes) and review threads (they change while you work). */
export const SAVED_QUERIES = new Set(['me', 'my-repos', 'starred', 'notifications', 'feed', 'search', 'search-repos', 'repo',
  'readme', 'repo-list', 'dir', 'branches', 'issue', 'pr', 'comments', 'runs', 'checks', 'user', 'user-repos']);

/** Saved: signed-in ("live") data that loaded, from the list above. Sample data is instant anyway. */
export function shouldSave(q: { queryKey: readonly unknown[]; state: { status: string } }): boolean {
  const [kind, name] = q.queryKey;
  return kind === 'live' && typeof name === 'string' && SAVED_QUERIES.has(name) && q.state.status === 'success';
}
