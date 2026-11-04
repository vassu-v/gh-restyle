/** The subset of GitHub REST shapes Gitling reads. */

export type User = { login: string; avatar_url: string; name?: string | null; bio?: string | null; followers?: number; following?: number; public_repos?: number; location?: string | null };

export type Repo = {
  name: string; full_name: string; owner: User; description: string | null; language: string | null;
  stargazers_count: number; forks_count: number; open_issues_count: number;
  pushed_at: string; updated_at: string; default_branch: string; private: boolean; html_url: string; topics?: string[];
};

export type Label = { name: string; color: string };

export type Issue = {
  number: number; title: string; user: User; state: 'open' | 'closed';
  created_at: string; updated_at: string; closed_at: string | null;
  body_html?: string; body?: string | null; comments: number; labels: Label[];
  repository_url: string; html_url: string;
  pull_request?: { url?: string; merged_at?: string | null };
  draft?: boolean;
};

export type PullRequest = Issue & {
  draft: boolean; merged: boolean; merged_at: string | null; mergeable: boolean | null;
  head: { ref: string }; base: { ref: string };
  additions: number; deletions: number; changed_files: number; commits: number;
};

export type Comment = { id: number; user: User; created_at: string; body_html?: string; body?: string };

export type PrFile = { filename: string; status: string; additions: number; deletions: number; patch?: string };

export type Notification = {
  id: string; unread: boolean; reason: string; updated_at: string;
  repository: Repo;
  subject: { type: 'PullRequest' | 'Issue' | 'Release' | 'CheckSuite' | 'Discussion' | 'Commit' | string; title: string; url: string | null; latest_comment_url?: string | null };
};

export type CheckRun = { name: string; status: string; conclusion: string | null; started_at: string; completed_at: string | null };

/** Events from /users/{u}/received_events — the Feed. */
export type FeedEvent = {
  id: string;
  type: 'WatchEvent' | 'ReleaseEvent' | 'PushEvent' | 'CreateEvent' | 'ForkEvent' | 'PublicEvent' | 'IssuesEvent' | 'PullRequestEvent' | string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  created_at: string;
  payload: {
    action?: string;
    ref_type?: string;
    release?: { tag_name: string; name: string | null; body: string | null; html_url: string };
    commits?: { sha: string; message: string }[];
    size?: number;
    forkee?: { full_name: string };
    issue?: { number: number; title: string };
    pull_request?: { number: number; title: string };
    description?: string | null;
  };
};

export type SearchResult<T> = { total_count: number; items: T[] };
