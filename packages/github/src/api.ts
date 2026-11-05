import { applySuggestions, decodeSource } from './apply';
import { base64Decode } from './bytes';
import { GitHubError, nextPage, type GitHubClient, type RequestOptions } from './client';
import type {
  ApplyResult, Branch, CheckRuns, Comment, DraftComment, GitCommit, GitTree, NewTreeEntry, Review, ReviewComment, ReviewEvent, ContentFile, ContentItem, FeedEvent,
  Issue, MergeMethod, Notification, Page, PrFile, PullRequest, Repo, SearchResult, ThreadState, User, WorkflowRuns,
} from './types';

/**
 * Every GitHub endpoint Gitling uses, in one place. Screens and hooks call these, never raw paths,
 * so the sample-data router (mock.ts) and the tests can cover exactly this list.
 */

const RAW = 'application/vnd.github.raw+json';
const e = encodeURIComponent;
/**
 * One URL path segment. "." and ".." are refused: encodeURIComponent leaves them alone, and the URL parser would
 * then climb out of the intended path (a crafted /repo/x/..%2F..%2F… link could aim an authenticated request at
 * any API path).
 */
const seg = (s: string) => {
  if (s === '' || s === '.' || s === '..') throw new GitHubError('Not found.', 404);
  return encodeURIComponent(s);
};
/** Encodes each segment of a file path but keeps the slashes. */
const ePath = (p: string) => p.split('/').filter(Boolean).map(seg).join('/');
const contentsPath = (path: string, ref?: string) => `/contents${path ? '/' + ePath(path) : ''}${ref ? `?ref=${e(ref)}` : ''}`;

// The databaseId of a thread's first comment is the REST id of its root, which is how threads.ts joins the two.
const THREADS_QUERY = `query($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) { pullRequest(number: $number) { reviewThreads(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id isResolved isOutdated viewerCanResolve viewerCanUnresolve viewerCanReply comments(first: 1) { nodes { databaseId } } }
  } } }
}`;
type ThreadsAnswer = { repository: { pullRequest: { reviewThreads: {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: (Omit<ThreadState, 'rootId'> & { comments: { nodes: { databaseId: number | null }[] } })[];
} } | null } | null };
const RESOLVE = (verb: 'resolveReviewThread' | 'unresolveReviewThread') =>
  `mutation($threadId: ID!) { ${verb}(input: { threadId: $threadId }) { thread { id isResolved } } }`;

/** Every api function returns a promise, even when it fails before any request (e.g. a refused path segment). */
function promised<T extends Record<string, unknown>>(o: T): T {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'function') (o as Record<string, unknown>)[k] = (...a: unknown[]) => { try { return (v as (...x: unknown[]) => unknown)(...a); } catch (err) { return Promise.reject(err); } };
  }
  return o;
}

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
  /** "owner/name" → two safe segments (repo names from links, tiles and API data all go through here). */
  const fullPath = (full: string) => { const [o, n, ...rest] = full.split('/'); if (!o || !n || rest.length) throw new GitHubError('Not found.', 404); return `${seg(o)}/${seg(n)}`; };
  const repoPath = (owner: string, repo: string) => `/repos/${seg(owner)}/${seg(repo)}`;

  const api = {
    // ── people
    me: () => get<User>('/user'),
    user: (login: string) => get<User>(`/users/${seg(login)}`),
    userRepos: (login: string) => get<Repo[]>(`/users/${seg(login)}/repos?sort=pushed&per_page=30`),

    // ── search
    searchIssues: (q: string, perPage = 20) => get<SearchResult<Issue>>(`/search/issues?sort=updated&per_page=${perPage}&q=${e(q)}`),
    searchRepos: (q: string) => get<SearchResult<Repo>>(`/search/repositories?per_page=30&q=${e(q)}`),

    // ── inbox
    notifications: (all = false) => get<Notification[]>(`/notifications?per_page=50${all ? '&all=true' : ''}`),
    markThread: (id: string, kind: 'read' | 'done') => get<true>(`/notifications/threads/${seg(id)}`, { method: kind === 'done' ? 'DELETE' : 'PATCH' }),

    // ── feed
    feed: (login: string, mine = false) => get<FeedEvent[]>(`/users/${seg(login)}/${mine ? 'events' : 'received_events'}?per_page=60`),

    // ── repos
    myRepos: () => get<Repo[]>('/user/repos?sort=pushed&per_page=50'),
    starred: () => get<Repo[]>('/user/starred?per_page=50'),
    isStarred: (full: string) => get<true>(`/user/starred/${fullPath(full)}`).then(() => true, (err: { status?: number }) => { if (err.status === 404) return false; throw err; }),
    setStar: (full: string, on: boolean) => get<true>(`/user/starred/${fullPath(full)}`, { method: on ? 'PUT' : 'DELETE' }),
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
    /** File text for rewriting it byte-exact (strict UTF-8, BOM kept apart); 422 for other encodings. fileText is for showing. */
    /** A file's exact bytes for rewriting it. The JSON form (base64) works with plain `res.json()` everywhere,
     *  including React Native; GitHub only inlines files up to 1 MB. */
    fileSource: async (owner: string, repo: string, path: string, ref?: string) => {
      const f = await get<{ content?: string; encoding?: string }>(`${repoPath(owner, repo)}${contentsPath(path, ref)}`);
      if (f.encoding !== 'base64' || typeof f.content !== 'string') throw new GitHubError('This file is too big for Gitling to change. Apply the suggestion on GitHub.', 422);
      return decodeSource(base64Decode(f.content));
    },
    /** Up to 300 branches, for the branch picker. */
    branches: (owner: string, repo: string) => all<Branch>(`${repoPath(owner, repo)}/branches?per_page=100`, 3),
    runs: (full: string) => get<WorkflowRuns>(`/repos/${fullPath(full)}/actions/runs?per_page=24`),
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
    checks: (owner: string, repo: string, sha: string) => get<CheckRuns>(`${repoPath(owner, repo)}/commits/${seg(sha)}/check-runs?per_page=100`),
    comment: (owner: string, repo: string, n: number, body: string) => get<Comment>(`${repoPath(owner, repo)}/issues/${n}/comments`, { method: 'POST', body: { body } }),
    setState: (owner: string, repo: string, n: number, state: 'open' | 'closed') => get<Issue>(`${repoPath(owner, repo)}/issues/${n}`, { method: 'PATCH', body: { state } }),
    merge: (owner: string, repo: string, n: number, method: MergeMethod) => get<{ merged: boolean; message?: string }>(`${repoPath(owner, repo)}/pulls/${n}/merge`, { method: 'PUT', body: { merge_method: method } }),
    reviews: (owner: string, repo: string, n: number) => all<Review>(`${repoPath(owner, repo)}/pulls/${n}/reviews?per_page=100`, 3),
    reviewComment: (owner: string, repo: string, id: number) =>
      get<ReviewComment>(`${repoPath(owner, repo)}/pulls/comments/${id}`).catch((e: unknown) => { if ((e as { status?: number })?.status === 404) return null; throw e; }),
    reviewComments: (owner: string, repo: string, n: number) => all<ReviewComment>(`${repoPath(owner, repo)}/pulls/${n}/comments?per_page=100`, 5),
    /** Submits a review in one call: the verdict, an optional summary and any line comments. */
    /** `commitId`: the head sha the comments' line numbers were read from (GitHub defaults to the current head). */
    submitReview: (owner: string, repo: string, n: number, r: { event: ReviewEvent; body?: string; comments?: DraftComment[]; commitId?: string }) =>
      get<Review>(`${repoPath(owner, repo)}/pulls/${n}/reviews`, { method: 'POST', body: { event: r.event, ...(r.commitId ? { commit_id: r.commitId } : {}), ...(r.body ? { body: r.body } : {}), ...(r.comments?.length ? { comments: r.comments } : {}) } }),
    /** GitHub only takes replies to a thread's root comment, so pass the root's id. */
    replyToReviewComment: (owner: string, repo: string, n: number, rootId: number, body: string) =>
      get<ReviewComment>(`${repoPath(owner, repo)}/pulls/${n}/comments/${rootId}/replies`, { method: 'POST', body: { body } }),
    /** Resolved state and permissions per thread (GraphQL only; REST has neither). */
    reviewThreads: async (owner: string, repo: string, n: number): Promise<ThreadState[]> => {
      const out: ThreadState[] = [];
      let after: string | null = null;
      for (let i = 0; i < 5; i++) {
        const d: ThreadsAnswer = await client.graphql<ThreadsAnswer>(THREADS_QUERY, { owner, repo, number: n, after });
        const rt = d.repository?.pullRequest?.reviewThreads;
        if (!rt) break;
        for (const { comments, ...t } of rt.nodes) {
          const rootId = comments.nodes[0]?.databaseId;
          if (rootId != null) out.push({ ...t, rootId });
        }
        if (!rt.pageInfo.hasNextPage) break;
        after = rt.pageInfo.endCursor;
      }
      return out;
    },
    resolveThread: (threadId: string) => client.graphql(RESOLVE('resolveReviewThread'), { threadId }).then(() => true as const),
    unresolveThread: (threadId: string) => client.graphql(RESOLVE('unresolveReviewThread'), { threadId }).then(() => true as const),

    // ── git data (on the PR's HEAD repo, which may be a fork), for applying suggestions
    gitCommit: (owner: string, repo: string, sha: string) => get<GitCommit>(`${repoPath(owner, repo)}/git/commits/${seg(sha)}`),
    /** One level of a tree (not recursive). */
    gitTree: (owner: string, repo: string, treeSha: string) => get<GitTree>(`${repoPath(owner, repo)}/git/trees/${seg(treeSha)}`),
    createTree: (owner: string, repo: string, t: { base_tree: string; tree: NewTreeEntry[] }) => get<{ sha: string }>(`${repoPath(owner, repo)}/git/trees`, { method: 'POST', body: t }),
    createCommit: (owner: string, repo: string, c: { message: string; tree: string; parents: string[] }) => get<{ sha: string }>(`${repoPath(owner, repo)}/git/commits`, { method: 'POST', body: c }),
    /** Fast-forward only: GitHub answers 422 if the branch moved since `sha`'s parent. */
    updateBranch: (owner: string, repo: string, branch: string, sha: string) => get<unknown>(`${repoPath(owner, repo)}/git/refs/heads/${ePath(branch)}`, { method: 'PATCH', body: { sha, force: false } }),
  };
  return promised({
    ...api,
    /** Commits the comments' suggestions to the PR branch in one commit. See apply.ts. */
    applySuggestions: (owner: string, repo: string, n: number, comments: ReviewComment[], opts?: { message?: string; viewer?: string }): Promise<ApplyResult> =>
      applySuggestions(api, owner, repo, n, comments, opts),
  });
}

export type Api = ReturnType<typeof createApi>;
