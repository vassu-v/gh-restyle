import { describe, expect, it, vi } from 'vitest';
import { createClient, GitHubError, nextPage } from '../src/client';

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 304 || status === 204 ? null : JSON.stringify(body), { status, headers });

describe('client', () => {
  it('sends the token and reuses ETag data on 304', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(200, { login: 'a' }, { ETag: 'W/"1"', 'X-RateLimit-Limit': '5000', 'X-RateLimit-Remaining': '4999' }))
      .mockResolvedValueOnce(res(304, null));
    const c = createClient({ kind: 'token', token: 'tok' }, { fetch: f });
    expect(await c.request('/user')).toEqual({ login: 'a' });
    expect(await c.request('/user')).toEqual({ login: 'a' });
    const h2 = f.mock.calls[1][1].headers;
    expect(h2.Authorization).toBe('Bearer tok');
    expect(h2['If-None-Match']).toBe('W/"1"');
    expect(c.rateLimit()).toMatchObject({ limit: 5000, remaining: 4999 });
  });
  it('keeps the ETag cache bounded', async () => {
    let n = 0;
    const f = vi.fn(async () => res(200, { n: n++ }, { ETag: `"${n}"` }));
    const c = createClient({ kind: 'token', token: 't' }, { fetch: f as unknown as typeof fetch, etagCacheSize: 2 });
    await c.request('/a'); await c.request('/b'); await c.request('/c'); await c.request('/a');
    expect(f.mock.calls.at(-1)![1].headers['If-None-Match']).toBeUndefined();
  });
  it('maps 401 and rate limits to friendly errors', async () => {
    const c401 = createClient({ kind: 'token', token: 't' }, { fetch: async () => res(401, { message: 'Bad credentials' }) });
    await expect(c401.request('/user')).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/signed you out/) });
    const reset = String(Math.floor(Date.now() / 1000) + 600);
    const c403 = createClient({ kind: 'token', token: 't' }, { fetch: async () => res(403, { message: 'API rate limit exceeded' }, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': reset }) });
    await expect(c403.request('/user')).rejects.toThrow(/rate limit.*10 min/);
  });
  it('maps network failure', async () => {
    const c = createClient({ kind: 'token', token: 't' }, { fetch: async () => { throw new TypeError('x'); } });
    await expect(c.request('/user')).rejects.toBeInstanceOf(GitHubError);
  });
  it('returns true for 204', async () => {
    const c = createClient({ kind: 'token', token: 't' }, { fetch: async () => res(204, null) });
    expect(await c.request('/notifications/threads/1', { method: 'PATCH' })).toBe(true);
  });
  it('tracks X-Poll-Interval', async () => {
    const c = createClient({ kind: 'token', token: 't' }, { fetch: async () => res(200, [], { 'X-Poll-Interval': '120' }) });
    await c.request('/notifications');
    expect(c.pollInterval()).toBe(120);
  });
});

it('parses Link headers', () => {
  expect(nextPage('<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"')).toBe(2);
  expect(nextPage('<https://api.github.com/x?per_page=30&page=1>; rel="prev"')).toBeNull();
  expect(nextPage(null)).toBeNull();
});
