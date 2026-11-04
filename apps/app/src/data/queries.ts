import type { Comment, FeedEvent, Issue, Notification, PrFile, PullRequest, Repo, SearchResult, User } from '@gitling/github';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/session/SessionProvider';

const FULL = 'application/vnd.github.full+json';

/** Query keys include the session kind so sample data and real data never mix. */
function useApi() {
  const { client, isSample } = useSession();
  return { req: client.request, k: isSample ? 'sample' : 'live', client };
}

export function useMe() {
  const { req, k } = useApi();
  return useQuery({ queryKey: [k, 'me'], queryFn: () => req<User>('/user'), staleTime: 10 * 60e3 });
}

/** `@me` works in GitHub search, so queries stay portable between accounts. */
export function useSearchIssues(q: string, perPage = 20, enabled = true) {
  const { req, k } = useApi();
  return useQuery({
    queryKey: [k, 'search', q, perPage],
    queryFn: () => req<SearchResult<Issue>>(`/search/issues?sort=updated&per_page=${perPage}&q=${encodeURIComponent(q)}`),
    enabled,
    staleTime: 60e3,
  });
}

export function useSearchRepos(q: string, enabled = true) {
  const { req, k } = useApi();
  return useQuery({ queryKey: [k, 'search-repos', q], queryFn: () => req<SearchResult<Repo>>(`/search/repositories?per_page=30&q=${encodeURIComponent(q)}`), enabled, staleTime: 60e3 });
}

export function useNotifications(all = false) {
  const { req, k, client } = useApi();
  return useQuery({
    queryKey: [k, 'notifications', all],
    queryFn: () => req<Notification[]>(`/notifications?per_page=50${all ? '&all=true' : ''}`),
    refetchInterval: () => client.pollInterval() * 1000,
  });
}

export function useTriage() {
  const { req, k } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'done' | 'read' }) => req(`/notifications/threads/${id}`, { method: kind === 'done' ? 'DELETE' : 'PATCH' }),
    onSettled: () => qc.invalidateQueries({ queryKey: [k, 'notifications'] }),
  });
}

export function useFeed(login: string | undefined, mine = false) {
  const { req, k } = useApi();
  return useQuery({
    queryKey: [k, 'feed', login, mine],
    queryFn: () => req<FeedEvent[]>(`/users/${login}/${mine ? 'events' : 'received_events'}?per_page=60`),
    enabled: !!login,
    staleTime: 2 * 60e3,
  });
}

export function useMyRepos() {
  const { req, k } = useApi();
  return useQuery({ queryKey: [k, 'my-repos'], queryFn: () => req<Repo[]>('/user/repos?sort=pushed&per_page=50'), staleTime: 5 * 60e3 });
}
export function useStarred() {
  const { req, k } = useApi();
  return useQuery({ queryKey: [k, 'starred'], queryFn: () => req<Repo[]>('/user/starred?per_page=50'), staleTime: 5 * 60e3 });
}

export function useRuns(repo: string | undefined) {
  const { req, k } = useApi();
  return useQuery({
    queryKey: [k, 'runs', repo],
    queryFn: () => req<{ workflow_runs: { conclusion: string | null }[] }>(`/repos/${repo}/actions/runs?per_page=24`),
    enabled: !!repo,
    staleTime: 5 * 60e3,
  });
}

export function useThread(owner: string, repo: string, n: number) {
  const { req, k } = useApi();
  const base = `/repos/${owner}/${repo}`;
  const issue = useQuery({ queryKey: [k, 'issue', owner, repo, n], queryFn: () => req<Issue>(`${base}/issues/${n}`, { accept: FULL }) });
  const isPr = !!issue.data?.pull_request;
  const pr = useQuery({ queryKey: [k, 'pr', owner, repo, n], queryFn: () => req<PullRequest>(`${base}/pulls/${n}`), enabled: isPr });
  const comments = useQuery({ queryKey: [k, 'comments', owner, repo, n], queryFn: () => req<Comment[]>(`${base}/issues/${n}/comments?per_page=100`, { accept: FULL }) });
  return { issue, pr, comments, isPr };
}

export function usePrFiles(owner: string, repo: string, n: number, enabled: boolean) {
  const { req, k } = useApi();
  return useQuery({ queryKey: [k, 'files', owner, repo, n], queryFn: () => req<PrFile[]>(`/repos/${owner}/${repo}/pulls/${n}/files?per_page=100`), enabled });
}

export function useChecks(owner: string, repo: string, ref: string | undefined) {
  const { req, k } = useApi();
  return useQuery({
    queryKey: [k, 'checks', owner, repo, ref],
    queryFn: () => req<{ total_count: number; check_runs: { name: string; conclusion: string | null; status: string }[] }>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref!)}/check-runs`),
    enabled: !!ref,
  });
}

export function useThreadActions(owner: string, repo: string, n: number) {
  const { req, k } = useApi();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === k && [owner, repo].every((x) => q.queryKey.includes(x)) });
  return {
    comment: useMutation({ mutationFn: (body: string) => req(`/repos/${owner}/${repo}/issues/${n}/comments`, { method: 'POST', body: { body } }), onSuccess: refresh }),
    setState: useMutation({ mutationFn: (state: 'open' | 'closed') => req(`/repos/${owner}/${repo}/issues/${n}`, { method: 'PATCH', body: { state } }), onSuccess: refresh }),
    merge: useMutation({ mutationFn: () => req(`/repos/${owner}/${repo}/pulls/${n}/merge`, { method: 'PUT', body: {} }), onSuccess: refresh }),
  };
}
