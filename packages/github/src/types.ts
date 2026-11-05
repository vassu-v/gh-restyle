/** The subset of GitHub REST shapes Gitling reads. Keep fields optional when GitHub omits them in some responses. */

export type User = {
  /** Numeric id; used for co-author lines (`{id}+{login}@users.noreply.github.com`). */
  id?: number;
  login: string; avatar_url: string; name?: string | null; bio?: string | null;
  followers?: number; following?: number; public_repos?: number; location?: string | null;
  html_url?: string; type?: 'User' | 'Organization' | 'Bot' | string; blog?: string | null; company?: string | null;
};

export type Repo = {
  name: string; full_name: string; owner: User; description: string | null; language: string | null;
  stargazers_count: number; forks_count: number; open_issues_count: number;
  pushed_at: string; updated_at: string; default_branch: string; private: boolean; html_url: string; topics?: string[];
  fork?: boolean; archived?: boolean; homepage?: string | null; license?: { spdx_id: string | null; name: string } | null;
  /** Only present when the viewer has push access. */
  permissions?: { admin: boolean; push: boolean; pull: boolean };
  allow_merge_commit?: boolean; allow_squash_merge?: boolean; allow_rebase_merge?: boolean;
};

export type Label = { name: string; color: string };

export type Issue = {
  number: number; title: string; user: User; state: 'open' | 'closed';
  created_at: string; updated_at: string; closed_at: string | null;
  /** Markdown source. Gitling renders markdown itself (see apps/app/src/ui/Markdown.tsx). */
  body?: string | null;
  comments: number; labels: Label[];
  repository_url: string; html_url: string;
  pull_request?: { url?: string; merged_at?: string | null };
  draft?: boolean;
};

export type PullRequest = Issue & {
  draft: boolean; merged: boolean; merged_at: string | null;
  /** null while GitHub is still computing it — poll again shortly. */
  mergeable: boolean | null;
  mergeable_state?: string;
  /** head.repo is where the branch lives — a fork for outside PRs; null when that fork was deleted. */
  head: { ref: string; sha: string; repo?: { full_name: string; owner?: { login: string } } | null };
  base: { ref: string; sha?: string };
  /** Fork PRs only: whether the author lets maintainers push to the branch. */
  maintainer_can_modify?: boolean;
  additions: number; deletions: number; changed_files: number; commits: number;
};

export type Comment = { id: number; user: User; created_at: string; body?: string | null; html_url?: string };

export type PrFile = { filename: string; status: string; additions: number; deletions: number; changes?: number; patch?: string; blob_url?: string };

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
/** GET /pulls/{n}/reviews */
export type Review = { id: number; user: User; state: ReviewState; body: string | null; submitted_at?: string; html_url?: string };
/**
 * GET /pulls/{n}/comments — comments on diff lines. `line` is null when the code moved on (outdated).
 * Multi-line comments cover `start_line..line`. `original_*` and `diff_hunk` describe the lines as they were at
 * `commit_id`, which is what a suggestion was written against.
 */
export type ReviewComment = {
  id: number; user: User; body: string; path: string;
  line: number | null;
  side?: 'LEFT' | 'RIGHT';
  start_line?: number | null;
  start_side?: 'LEFT' | 'RIGHT' | null;
  original_line?: number | null; original_start_line?: number | null;
  /** The diff hunk ending at the commented line, at commit_id. */
  diff_hunk?: string;
  commit_id?: string;
  created_at: string; in_reply_to_id?: number; html_url?: string;
};
/** A line comment waiting to be sent with a review. */
export type DraftComment = { path: string; line: number; side: 'LEFT' | 'RIGHT'; start_line?: number; start_side?: 'LEFT' | 'RIGHT'; body: string };

/** From GraphQL reviewThreads. rootId = databaseId of the thread's first comment (= REST id). */
export type ThreadState = { id: string; rootId: number; isResolved: boolean; isOutdated: boolean; viewerCanResolve: boolean; viewerCanUnresolve: boolean; viewerCanReply: boolean };

/** A review thread as the app shows it (made by groupThreads). */
export type ReviewThread = {
  root: ReviewComment; replies: ReviewComment[];
  path: string; line: number | null; side: 'LEFT' | 'RIGHT'; startLine: number | null;
  outdated: boolean; resolved: boolean;
  /** null when GraphQL state is unavailable (then it can't be resolved from here). */
  threadId: string | null;
  canResolve: boolean; canUnresolve: boolean; canReply: boolean;
};

/** A ```suggestion block in a review comment: replace lines startLine..endLine of `path` with `lines`. */
export type Suggestion = { commentId: number; path: string; startLine: number; endLine: number; lines: string[]; author: User };
export type SuggestionCheck = { ok: true; suggestion: Suggestion } | { ok: false; reason: string };
export type ApplyResult = { sha: string; applied: number };

/** Git Data API shapes (only the fields Gitling reads). */
export type GitCommit = { sha: string; tree: { sha: string }; message?: string; parents?: { sha: string }[] };
export type GitTreeEntry = { path: string; mode: string; type: 'blob' | 'tree' | 'commit'; sha: string };
export type GitTree = { sha: string; tree: GitTreeEntry[] };
export type NewTreeEntry = { path: string; mode: string; type: 'blob'; content: string };

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export type Notification = {
  id: string; unread: boolean; reason: string; updated_at: string;
  repository: Repo;
  subject: { type: 'PullRequest' | 'Issue' | 'Release' | 'CheckSuite' | 'Discussion' | 'Commit' | string; title: string; url: string | null; latest_comment_url?: string | null };
};

export type CheckRun = { name: string; status: string; conclusion: string | null; started_at?: string; completed_at?: string | null; html_url?: string };
export type CheckRuns = { total_count: number; check_runs: CheckRun[] };
export type WorkflowRuns = { total_count: number; workflow_runs: { conclusion: string | null; created_at?: string }[] };

/** One entry of GET /repos/{o}/{r}/contents/{path} when path is a directory. */
export type ContentItem = { type: 'file' | 'dir' | 'symlink' | 'submodule'; name: string; path: string; size: number; sha: string; html_url?: string };
/** GET /repos/{o}/{r}/contents/{path} when path is a file (content is base64; Gitling fetches raw text instead). */
export type ContentFile = ContentItem & { type: 'file'; encoding?: string; content?: string; download_url?: string | null };

/** Events from /users/{u}/received_events — the Feed. */
export type FeedEvent = {
  id: string;
  type: 'WatchEvent' | 'ReleaseEvent' | 'PushEvent' | 'CreateEvent' | 'ForkEvent' | 'PublicEvent' | 'IssuesEvent' | 'PullRequestEvent' | 'IssueCommentEvent' | string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  created_at: string;
  payload: {
    action?: string;
    ref?: string | null;
    ref_type?: string;
    release?: { tag_name: string; name: string | null; body: string | null; html_url: string };
    commits?: { sha: string; message: string }[];
    size?: number;
    forkee?: { full_name: string };
    issue?: { number: number; title: string };
    pull_request?: { number: number; title: string };
    comment?: { body: string };
    description?: string | null;
  };
};

/** GET /repos/{o}/{r}/branches */
export type Branch = { name: string; protected?: boolean; commit: { sha: string } };

export type SearchResult<T> = { total_count: number; items: T[] };

/** A page of a list endpoint. `next` is the page number to ask for next, or null on the last page. */
export type Page<T> = { items: T[]; next: number | null };
