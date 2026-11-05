import { mockRequest } from './mock';

/**
 * Transport layer: auth header, ETag cache, error mapping, rate-limit and poll-interval tracking.
 * Screens never call this directly — they go through `createApi()` in ./api.ts, which owns every path.
 */

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** e.g. application/vnd.github.raw+json for raw file text */
  accept?: string;
  /** Return the body as text instead of JSON. */
  text?: boolean;
};

export type Response<T> = { data: T; status: number; headers: { get(name: string): string | null } };

export class GitHubError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'GitHubError'; }
}

export type Session = { kind: 'sample' } | { kind: 'token'; token: string };

export type RateLimit = { limit: number; remaining: number; reset: number };

export type GitHubClient = {
  session: Session;
  request<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
  /** Like request, but also returns status and headers (for pagination). */
  raw<T = unknown>(path: string, opts?: RequestOptions): Promise<Response<T>>;
  /** POST /graphql with the same auth. GraphQL errors (which arrive with HTTP 200) throw a GitHubError 422. */
  graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
  /** Seconds GitHub asks clients to wait between notification polls. */
  pollInterval: () => number;
  /** Last rate-limit headers seen, or null before the first live call. */
  rateLimit: () => RateLimit | null;
};

export type ClientDeps = { fetch?: typeof fetch; baseUrl?: string; etagCacheSize?: number };

export const API = 'https://api.github.com';
const NO_HEADERS = { get: () => null };

export function createClient(session: Session, deps: ClientDeps = {}): GitHubClient {
  if (session.kind === 'sample') {
    const raw = async <T,>(path: string, opts?: RequestOptions) => {
      const r = await mockRequest(path, opts);
      const data = r.data;
      return { data: data as T, status: 200, headers: { get: (n: string) => (n.toLowerCase() === 'link' ? r.link ?? null : null) } };
    };
    return {
      session,
      raw,
      request: async (path, opts) => (await raw(path, opts)).data as never,
      graphql: graphqlOver(raw),
      pollInterval: () => 60,
      rateLimit: () => null,
    };
  }

  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = deps.baseUrl ?? API;
  const maxEtags = deps.etagCacheSize ?? 300;
  // ETag cache: a 304 answer is free against the rate limit. Map keeps insertion order, so it doubles as an LRU.
  const etags = new Map<string, { etag: string; data: unknown; link: string | null }>();
  let poll = 60;
  let rate: RateLimit | null = null;

  async function raw<T>(path: string, opts: RequestOptions = {}): Promise<Response<T>> {
    const method = opts.method ?? 'GET';
    const key = `${opts.accept ?? ''}|${opts.text ? 't' : 'j'}|${path}`;
    const cached = method === 'GET' ? etags.get(key) : undefined;
    let res: globalThis.Response;
    try {
      res = await doFetch(path.startsWith('http') ? path : base + path, {
        method,
        headers: {
          ...(session.kind === 'token' && session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          Accept: opts.accept ?? 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(cached ? { 'If-None-Match': cached.etag } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw new GitHubError("Couldn't reach GitHub. Check your connection.", 0);
    }
    const h = res.headers;
    const pi = h.get('X-Poll-Interval');
    if (pi) poll = Number(pi) || poll;
    const lim = h.get('X-RateLimit-Limit');
    if (lim) rate = { limit: Number(lim), remaining: Number(h.get('X-RateLimit-Remaining') ?? 0), reset: Number(h.get('X-RateLimit-Reset') ?? 0) };

    if (res.status === 304 && cached) {
      etags.delete(key); etags.set(key, cached);
      return { data: cached.data as T, status: 200, headers: { get: (n) => (n.toLowerCase() === 'link' ? cached.link : h.get(n)) } };
    }
    if (res.status === 204 || res.status === 205) return { data: true as T, status: res.status, headers: h };
    if (!res.ok) throw await toError(res);

    const data = (opts.text ? await res.text() : await res.json()) as T;
    const etag = h.get('ETag');
    if (method === 'GET' && etag) {
      etags.delete(key);
      etags.set(key, { etag, data, link: h.get('Link') });
      if (etags.size > maxEtags) etags.delete(etags.keys().next().value!);
    }
    return { data, status: res.status, headers: h ?? NO_HEADERS };
  }

  return {
    session,
    raw,
    request: async <T,>(path: string, opts?: RequestOptions) => (await raw<T>(path, opts)).data,
    graphql: graphqlOver(raw),
    pollInterval: () => poll,
    rateLimit: () => rate,
  };
}

type GraphqlAnswer<T> = { data?: T | null; errors?: { message: string }[] };
/** GraphQL rides on the same transport (auth, error mapping) as REST, so sample mode answers it from mock.ts too. */
function graphqlOver(raw: GitHubClient['raw']) {
  return async <T,>(query: string, variables?: Record<string, unknown>): Promise<T> => {
    const r = await raw<GraphqlAnswer<T>>('/graphql', { method: 'POST', body: { query, variables: variables ?? {} } });
    if (r.data.errors?.length) throw new GitHubError(r.data.errors[0].message, 422);
    return r.data.data as T;
  };
}

async function toError(res: globalThis.Response): Promise<GitHubError> {
  let msg = res.statusText || `GitHub answered ${res.status}`;
  try { msg = ((await res.json()) as { message?: string }).message ?? msg; } catch { /* not JSON */ }
  if (res.status === 401) msg = 'GitHub signed you out. Sign in again.';
  if ((res.status === 403 || res.status === 429) && res.headers.get('X-RateLimit-Remaining') === '0') {
    const reset = Number(res.headers.get('X-RateLimit-Reset') ?? 0) * 1000;
    const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60e3)) : 60;
    msg = `GitHub rate limit reached. It resets in about ${mins} min.`;
  }
  if (res.status === 404) msg = msg === 'Not Found' ? "Not found, or you don't have access." : msg;
  return new GitHubError(msg, res.status);
}

/** Parses `<…?page=3>; rel="next"` from a Link header into 3. */
export function nextPage(link: string | null | undefined): number | null {
  if (!link) return null;
  const m = link.split(',').find((p) => /rel="next"/.test(p))?.match(/[?&]page=(\d+)/);
  return m ? Number(m[1]) : null;
}
