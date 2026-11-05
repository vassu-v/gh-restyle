import { groupThreads, type DraftComment, type MergeMethod, type ReviewComment, type ReviewEvent } from '@gitling/github';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSession } from '@/session/SessionProvider';

/**
 * Data hooks. The only place screens get GitHub data from.
 * Rules (see docs/ARCHITECTURE.md § Data):
 *  - every hook calls a function on `api` (packages/github/src/api.ts), never a raw path
 *  - query keys start with the session kind, so sample data and live data never mix in the cache
 *  - mutations invalidate exactly the keys they affect
 */

function useApi() {
  const { api, client, isSample } = useSession();
  return { api, client, k: isSample ? 'sample' : 'live' } as const;
}

// ── people
export function useMe() {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'me'], queryFn: api.me, staleTime: 10 * 60e3 });
}
export function useUser(login: string) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'user', login], queryFn: () => api.user(login), staleTime: 10 * 60e3 });
}
export function useUserRepos(login: string) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'user-repos', login], queryFn: () => api.userRepos(login), staleTime: 5 * 60e3 });
}

// ── search
/** `@me` works in GitHub search, so queries stay portable between accounts. */
export function useSearchIssues(q: string, perPage = 20, enabled = true) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'search', q, perPage], queryFn: () => api.searchIssues(q, perPage), enabled, staleTime: 60e3 });
}
export function useSearchRepos(q: string, enabled = true) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'search-repos', q], queryFn: () => api.searchRepos(q), enabled, staleTime: 60e3 });
}

// ── inbox
export function useNotifications(all = false) {
  const { api, k, client } = useApi();
  return useQuery({ queryKey: [k, 'notifications', all], queryFn: () => api.notifications(all), refetchInterval: () => client.pollInterval() * 1000 });
}
export function useTriage() {
  const { api, k } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'done' | 'read' }) => api.markThread(id, kind),
    onSettled: () => qc.invalidateQueries({ queryKey: [k, 'notifications'] }),
  });
}

// ── feed
export function useFeed(login: string | undefined, mine = false) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'feed', login, mine], queryFn: () => api.feed(login!, mine), enabled: !!login, staleTime: 2 * 60e3 });
}

// ── repos
export function useMyRepos() {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'my-repos'], queryFn: api.myRepos, staleTime: 5 * 60e3 });
}
export function useStarred() {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'starred'], queryFn: api.starred, staleTime: 5 * 60e3 });
}
export function useRuns(repo: string | undefined) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'runs', repo], queryFn: () => api.runs(repo!), enabled: !!repo, staleTime: 5 * 60e3 });
}
export function useRepo(owner: string, name: string) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'repo', owner, name], queryFn: () => api.repo(owner, name), staleTime: 5 * 60e3 });
}
export function useReadme(owner: string, name: string) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'readme', owner, name], queryFn: () => api.readme(owner, name), staleTime: 10 * 60e3 });
}
export function useStar(full: string) {
  const { api, k } = useApi();
  const qc = useQueryClient();
  const key = [k, 'starred?', full];
  const q = useQuery({ queryKey: key, queryFn: () => api.isStarred(full), staleTime: 5 * 60e3 });
  const m = useMutation({
    mutationFn: (on: boolean) => api.setStar(full, on),
    onMutate: (on) => { qc.setQueryData(key, on); },
    onError: (_e, on) => { qc.setQueryData(key, !on); },
    onSettled: () => qc.invalidateQueries({ queryKey: [k, 'starred'] }),
  });
  return { starred: q.data ?? false, known: q.isSuccess, toggle: () => m.mutate(!q.data), error: m.error };
}
export function useBranches(owner: string, name: string, enabled = true) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'branches', owner, name], queryFn: () => api.branches(owner, name), enabled, staleTime: 5 * 60e3 });
}
export function useDir(owner: string, name: string, path: string, ref?: string) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'dir', owner, name, ref, path], queryFn: () => api.dir(owner, name, path, ref), staleTime: 5 * 60e3 });
}
/** Max bytes shown in the file viewer; bigger files open on GitHub. */
export const MAX_FILE_BYTES = 512 * 1024;
export function useFile(owner: string, name: string, path: string, ref?: string) {
  const { api, k } = useApi();
  const info = useQuery({ queryKey: [k, 'file-info', owner, name, ref, path], queryFn: () => api.fileInfo(owner, name, path, ref), staleTime: 5 * 60e3 });
  const small = !!info.data && info.data.size <= MAX_FILE_BYTES;
  const text = useQuery({ queryKey: [k, 'file', owner, name, ref, path], queryFn: () => api.fileText(owner, name, path, ref), enabled: small, staleTime: 5 * 60e3 });
  return { info, text, tooBig: !!info.data && !small };
}
export function useRepoList(owner: string, name: string, kind: 'issues' | 'pulls', state: 'open' | 'closed') {
  const { api, k } = useApi();
  return useInfiniteQuery({
    queryKey: [k, 'repo-list', owner, name, kind, state],
    queryFn: ({ pageParam }) => (kind === 'issues' ? api.issues(owner, name, state, pageParam) : api.pulls(owner, name, state, pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next,
    staleTime: 60e3,
  });
}

// ── threads
export function useThread(owner: string, repo: string, n: number) {
  const { api, k } = useApi();
  const issue = useQuery({ queryKey: [k, 'issue', owner, repo, n], queryFn: () => api.issue(owner, repo, n) });
  const isPr = !!issue.data?.pull_request;
  const pr = useQuery({
    queryKey: [k, 'pr', owner, repo, n],
    queryFn: () => api.pull(owner, repo, n),
    enabled: isPr,
    // GitHub computes mergeability in the background and returns null until it's ready.
    refetchInterval: (q) => (q.state.data && q.state.data.state === 'open' && q.state.data.mergeable === null && q.state.dataUpdateCount < 6 ? 2500 : false),
  });
  const comments = useQuery({ queryKey: [k, 'comments', owner, repo, n], queryFn: () => api.comments(owner, repo, n) });
  return { issue, pr, comments, isPr };
}
export function usePrFiles(owner: string, repo: string, n: number, enabled: boolean) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'files', owner, repo, n], queryFn: () => api.prFiles(owner, repo, n), enabled });
}
export function useReviews(owner: string, repo: string, n: number, enabled: boolean) {
  const { api, k } = useApi();
  const reviews = useQuery({ queryKey: [k, 'reviews', owner, repo, n], queryFn: () => api.reviews(owner, repo, n), enabled });
  const comments = useQuery({ queryKey: [k, 'review-comments', owner, repo, n], queryFn: () => api.reviewComments(owner, repo, n), enabled });
  return { reviews, comments };
}
/**
 * Review comments grouped into threads. REST gives the comments; GraphQL adds resolved state, thread ids and
 * what you may do. If GraphQL fails (scopes, rate limit), threads still show, just without Resolve.
 */
export function useReviewThreads(owner: string, repo: string, n: number, enabled: boolean) {
  const { api, k } = useApi();
  const comments = useQuery({ queryKey: [k, 'review-comments', owner, repo, n], queryFn: () => api.reviewComments(owner, repo, n), enabled });
  const states = useQuery({
    queryKey: [k, 'review-threads', owner, repo, n],
    queryFn: () => api.reviewThreads(owner, repo, n).catch(() => null),
    enabled, retry: false,
  });
  const threads = useMemo(() => groupThreads(comments.data ?? [], states.data ?? null), [comments.data, states.data]);
  return {
    threads,
    isLoading: comments.isLoading || states.isLoading,
    error: comments.error,
    refetch: () => Promise.all([comments.refetch(), states.refetch()]),
  };
}
export function useChecks(owner: string, repo: string, sha: string | undefined) {
  const { api, k } = useApi();
  return useQuery({ queryKey: [k, 'checks', owner, repo, sha], queryFn: () => api.checks(owner, repo, sha!), enabled: !!sha, staleTime: 30e3 });
}
export function useThreadActions(owner: string, repo: string, n: number) {
  const { api, k } = useApi();
  const me = useMe();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === k && q.queryKey.includes(owner) && q.queryKey.includes(repo) });
  const refreshLists = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === k && (q.queryKey[1] === 'search' || q.queryKey[1] === 'notifications') });
  const after = () => Promise.all([refresh(), refreshLists()]);
  return {
    comment: useMutation({ mutationFn: (body: string) => api.comment(owner, repo, n, body), onSuccess: refresh }),
    setState: useMutation({ mutationFn: (state: 'open' | 'closed') => api.setState(owner, repo, n, state), onSuccess: after }),
    merge: useMutation({ mutationFn: (method: MergeMethod) => api.merge(owner, repo, n, method), onSuccess: after }),
    review: useMutation({ mutationFn: (r: { event: ReviewEvent; body?: string; comments?: DraftComment[] }) => api.submitReview(owner, repo, n, r), onSuccess: refresh }),
    reply: useMutation({ mutationFn: (r: { rootId: number; body: string }) => api.replyToReviewComment(owner, repo, n, r.rootId, r.body), onSuccess: refresh }),
    resolve: useMutation({ mutationFn: (r: { threadId: string; resolved: boolean }) => (r.resolved ? api.resolveThread(r.threadId) : api.unresolveThread(r.threadId)), onSuccess: refresh }),
    // A new commit on the PR branch: the files, checks and comment positions all change.
    applySuggestions: useMutation({
      mutationFn: (r: { comments: ReviewComment[]; message?: string }) => api.applySuggestions(owner, repo, n, r.comments, { message: r.message, viewer: me.data?.login }),
      onSuccess: refresh,
    }),
  };
}
