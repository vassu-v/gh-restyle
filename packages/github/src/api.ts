import { nextPage, type GitHubClient, type RequestOptions } from './client';
import type {
  CheckRuns, Comment, ContentFile, ContentItem, FeedEvent, Issue, MergeMethod, Notification, Page,
  PrFile, PullRequest, Repo, SearchResult, User, WorkflowRuns,
} from './types';

/**
 * Every GitHub endpoint Gitling uses, in one place. Screens and hooks call these, never raw paths,
 * so the sample-data router (mock.ts) and the tests can cover exactly this list.
 */

const RAW = 'application/vnd.github.raw+json';
const e = encodeURIComponent;
/** Encodes each segment of a file path but keeps the slashes. */
const ePath = (p: string) => p.split('/').filter(Boolean).map(e).join('/');
const contentsPath = (path: string, ref?: string) => `/contents${path ? '/' + ePath(path) : ''}${ref ? `?ref=${e(ref)}` : ''}`;

export function createApi(client: GitHubClient) {
  const get = <T,>(path: string, opts?: RequestOptions) => client.request<T>(path, opts);
  async function page<T>(path: string, p: number): Promise<Page<T>> {
    const r = await client.raw<T[]>(`${path}${path.includes('?') ? '&' : '?'}page=${p}`);
    return { items: r.data, next: nextPage(r.headers.get('Link')) };
  }
  /** Follows Link headers up to `max` pages. */
  async function all<T>(path: string, max = 5): Promise<T[]> {
    const out: T[] = []; let p: number | null = 1;
    for (let i = 0; p && i < max; i++) { const r: Page<T> = await page<T>(path, p); out.push(...r.items); p = r.next; }
    return out;
  }
  const repoPath = (owner: string, repo: string) => `/repos/${e(owner)}/${e(repo)}`;

  return {
    // ── people
    me: () => get<User>('/user'),
    user: (login: string) => get<User>(`/users/${e(login)}`),
    userRepos: (login: string) => get<Repo[]>(`/users/${e(login)}/repos?sort=pushed&per_page=30`),

    // ── search
    searchIssues: (q: string, perPage = 20) => get<SearchResult<Issue>>(`/search/issues?sort=updated&per_page=${perPage}&q=${e(q)}`),
    searchRepos: (q: string) => get<SearchResult<Repo>>(`/search/repositories?per_page=30&q=${e(q)}`),

    // ── inbox
    notifications: (all = false) => get<Notification[]>(`/notifications?per_page=50${all ? '&all=true' : ''}`),
    markThread: (id: string, kind: 'read' | 'done') => get<true>(`/notifications/threads/${e(id)}`, { method: kind === 'done' ? 'DELETE' : 'PATCH' }),

    // ── feed
    feed: (login: string, mine = false) => get<FeedEvent[]>(`/users/${e(login)}/${mine ? 'events' : 'received_events'}?per_page=60`),

    // ── repos
    myRepos: () => get<Repo[]>('/user/repos?sort=pushed&per_page=50'),
    starred: () => get<Repo[]>('/user/starred?per_page=50'),
    isStarred: (full: string) => get<true>(`/user/starred/${full}`).then(() => true, (err: { status?: number }) => { if (err.status === 404) return false; throw err; }),
    setStar: (full: string, on: boolean) => get<true>(`/user/starred/${full}`, { method: on ? 'PUT' : 'DELETE' }),
    repo: (owner: string, repo: string) => get<Repo>(repoPath(owner, repo)),
    /** README as markdown text. Resolves to null when the repo has none. */
    readme: (owner: string, repo: string) => get<string>(`${repoPath(owner, repo)}/readme`, { accept: RAW, text: true }).catch((err: { status?: number }) => { if (err.status === 404) return null; throw err; }),
    /** Directory listing, sorted folders first. */
    dir: async (owner: string, repo: string, path: string, ref?: string) => {
      const items = await get<ContentItem[] | ContentFile>(`${repoPath(owner, repo)}${contentsPath(path, ref)}`);
      if (!Array.isArray(items)) throw Object.assign(new Error('That path is a file.'), { status: 400 });
      return [...items].sort((a, b) => (a.type === 'dir') === (b.type === 'dir') ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
    },
    /** File metadata (size) without the content. */
    fileInfo: (owner: string, repo: string, path: string, ref?: string) => get<ContentFile>(`${repoPath(owner, repo)}${contentsPath(path, ref)}`),
    /** File text. Callers check size first (fileInfo) — GitHub serves raw files up to 100 MB. */
    fileText: (owner: string, repo: string, path: string, ref?: string) => get<string>(`${repoPath(owner, repo)}${contentsPath(path, ref)}`, { accept: RAW, text: true }),
    runs: (full: string) => get<WorkflowRuns>(`/repos/${full}/actions/runs?per_page=24`),
    /** Issues only (GitHub's /issues list also returns PRs; they're filtered out). */
    issues: async (owner: string, repo: string, state: 'open' | 'closed', p = 1) => {
      const r = await page<Issue>(`${repoPath(owner, repo)}/issues?state=${state}&per_page=30&sort=updated`, p);
      return { ...r, items: r.items.filter((i) => !i.pull_request) };
    },
    pulls: (owner: string, repo: string, state: 'open' | 'closed', p = 1) => page<PullRequest>(`${repoPath(owner, repo)}/pulls?state=${state}&per_page=30&sort=updated&direction=desc`, p),

    // ── threads (issues + PRs)
    issue: (owner: string, repo: string, n: number) => get<Issue>(`${repoPath(owner, repo)}/issues/${n}`),
    pull: (owner: string, repo: string, n: number) => get<PullRequest>(`${repoPath(owner, repo)}/pulls/${n}`),
    comments: (owner: string, repo: string, n: number) => all<Comment>(`${repoPath(owner, repo)}/issues/${n}/comments?per_page=100`),
    prFiles: (owner: string, repo: string, n: number) => all<PrFile>(`${repoPath(owner, repo)}/pulls/${n}/files?per_page=100`, 3),
    checks: (owner: string, repo: string, sha: string) => get<CheckRuns>(`${repoPath(owner, repo)}/commits/${e(sha)}/check-runs?per_page=100`),
    comment: (owner: string, repo: string, n: number, body: string) => get<Comment>(`${repoPath(owner, repo)}/issues/${n}/comments`, { method: 'POST', body: { body } }),
    setState: (owner: string, repo: string, n: number, state: 'open' | 'closed') => get<Issue>(`${repoPath(owner, repo)}/issues/${n}`, { method: 'PATCH', body: { state } }),
    merge: (owner: string, repo: string, n: number, method: MergeMethod) => get<{ merged: boolean; message?: string }>(`${repoPath(owner, repo)}/pulls/${n}/merge`, { method: 'PUT', body: { merge_method: method } }),
    approve: (owner: string, repo: string, n: number) => get<unknown>(`${repoPath(owner, repo)}/pulls/${n}/reviews`, { method: 'POST', body: { event: 'APPROVE' } }),
  };
}

export type Api = ReturnType<typeof createApi>;
