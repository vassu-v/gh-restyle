import { mockRequest } from './mock';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** e.g. application/vnd.github.full+json for rendered markdown */
  accept?: string;
  text?: boolean;
};

export class GitHubError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export type Session = { kind: 'sample' } | { kind: 'token'; token: string };

export type GitHubClient = {
  session: Session;
  request<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
  /** Seconds GitHub asks clients to wait between notification polls. */
  pollInterval: () => number;
};

const API = 'https://api.github.com';

export function createClient(session: Session): GitHubClient {
  if (session.kind === 'sample') {
    return { session, request: (path, opts) => mockRequest(path, opts) as Promise<never>, pollInterval: () => 60 };
  }
  // ETag cache: a 304 answer is free against the rate limit.
  const etags = new Map<string, { etag: string; data: unknown }>();
  let poll = 60;
  return {
    session,
    pollInterval: () => poll,
    async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
      const method = opts.method ?? 'GET';
      const key = (opts.accept ?? '') + path;
      const cached = method === 'GET' ? etags.get(key) : undefined;
      let res: Response;
      try {
        res = await fetch(API + path, {
          method,
          headers: {
            Authorization: `Bearer ${session.token}`,
            Accept: opts.accept ?? 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
            ...(cached ? { 'If-None-Match': cached.etag } : {}),
          },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
      } catch {
        throw new GitHubError("Couldn't reach GitHub. Check your connection.", 0);
      }
      const pi = res.headers.get('X-Poll-Interval');
      if (pi) poll = Number(pi) || poll;
      if (res.status === 304 && cached) return cached.data as T;
      if (res.status === 204 || res.status === 205) return true as T;
      if (!res.ok) {
        let msg = res.statusText;
        try { msg = ((await res.json()) as { message?: string }).message ?? msg; } catch {}
        if (res.status === 401) msg = 'GitHub signed you out. Sign in again.';
        if (res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0') msg = 'GitHub rate limit reached. It resets within the hour.';
        throw new GitHubError(msg, res.status);
      }
      const data = opts.text ? await res.text() : await res.json();
      const etag = res.headers.get('ETag');
      if (method === 'GET' && etag) etags.set(key, { etag, data });
      return data as T;
    },
  };
}
