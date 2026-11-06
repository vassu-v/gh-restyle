import { describe, expect, it } from 'vitest';
import { createApi } from '../src/api';
import { createClient } from '../src/client';

// Every endpoint in api.ts must work against sample data, so the app never shows an error before sign-in.
const api = createApi(createClient({ kind: 'sample' }));

describe('api against sample data', () => {
  it('people, search, inbox, feed', async () => {
    expect((await api.me()).login).toBe('you');
    expect((await api.user('lin')).login).toBe('lin');
    expect((await api.userRepos('lin')).length).toBeGreaterThan(0);
    expect((await api.searchIssues('is:open is:pr')).items.length).toBeGreaterThan(0);
    expect((await api.searchIssues('repo:you/trail-notes is:open is:issue')).items.every((i) => !i.pull_request)).toBe(true);
    expect((await api.searchRepos('sync')).items.length).toBeGreaterThan(0);
    expect((await api.notifications()).length).toBeGreaterThan(0);
    expect(await api.markThread('n6', 'read')).toBe(true);
    expect((await api.feed('you')).length).toBeGreaterThan(0);
    expect((await api.feed('you', true)).length).toBeGreaterThan(0);
  });
  it('repos and code', async () => {
    const r = await api.repo('you', 'trail-notes');
    expect(r.permissions?.push).toBe(true);
    expect(await api.readme('you', 'trail-notes')).toMatch(/^# trail-notes/);
    const root = await api.dir('you', 'trail-notes', '');
    expect(root[0].type).toBe('dir');
    expect(root.map((x) => x.name)).toContain('README.md');
    expect((await api.dir('you', 'trail-notes', 'src/sync')).map((x) => x.name)).toEqual(['queue.ts']);
    expect((await api.fileInfo('you', 'trail-notes', 'src/types.ts')).size).toBeGreaterThan(10);
    expect(await api.fileText('you', 'trail-notes', 'src/types.ts')).toMatch(/export type Entry/);
    await expect(api.dir('you', 'trail-notes', 'src/types.ts')).rejects.toThrow(/file/);
    expect(await api.isStarred('lin/tiny-sync')).toBe(true);
    await api.setStar('lin/tiny-sync', false);
    expect(await api.isStarred('lin/tiny-sync')).toBe(false);
    expect((await api.issues('you', 'trail-notes', 'open')).items.every((i) => !i.pull_request)).toBe(true);
    expect((await api.pulls('you', 'trail-notes', 'open')).items[0].head.sha).toBeTruthy();
    expect((await api.runs('you/trail-notes')).workflow_runs.length).toBe(24);
    expect((await api.branches('you', 'trail-notes')).map((b) => b.name)).toContain('main');
  });
  it('threads and actions', async () => {
    expect((await api.issue('you', 'trail-notes', 42)).body).toMatch(/airplane mode/);
    const pr = await api.pull('you', 'trail-notes', 45);
    expect(pr.head.sha).toBe('a91f3c2e');
    expect((await api.comments('you', 'trail-notes', 42)).length).toBe(2);
    expect((await api.prFiles('you', 'trail-notes', 45)).length).toBe(3);
    expect((await api.checks('you', 'trail-notes', pr.head.sha)).check_runs.length).toBe(3);
    expect((await api.comment('you', 'trail-notes', 42, 'hi **there**')).body).toBe('hi **there**');
    expect((await api.reviews('you', 'trail-notes', 45))[0].state).toBe('COMMENTED');
    expect((await api.reviewComments('you', 'trail-notes', 45))[0].path).toBe('src/sync/queue.ts');
    const rv = await api.submitReview('lin', 'tiny-sync', 33, { event: 'REQUEST_CHANGES', body: 'see inline', comments: [{ path: 'a.ts', line: 3, side: 'RIGHT', body: 'nit' }] });
    expect(rv.state).toBe('CHANGES_REQUESTED');
    expect((await api.reviewComments('lin', 'tiny-sync', 33)).map((c) => c.body)).toEqual(['nit']);
    await expect(api.submitReview('you', 'trail-notes', 45, { event: 'APPROVE' })).rejects.toMatchObject({ status: 422 });
    expect((await api.merge('you', 'trail-notes', 45, 'squash')).merged).toBe(true);
    expect((await api.pull('you', 'trail-notes', 45)).merged).toBe(true);
    await api.setState('you', 'trail-notes', 42, 'closed');
    expect((await api.issue('you', 'trail-notes', 42)).state).toBe('closed');
  });
  it('404s on unknown things like the real API', async () => {
    await expect(api.issue('acme', 'rocket', 1)).rejects.toMatchObject({ status: 404 });
    expect(await api.readme('acme', 'rocket')).toBeNull(); // no README is not an error
  });
});

describe('request shapes (fake fetch)', () => {
  it('sends commit_id with a review; fileSource decodes the base64 JSON form, BOM kept apart', async () => {
    const calls: { url: string; body?: string; accept?: string }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body as string | undefined, accept: (init.headers as Record<string, string>).Accept });
      if (url.includes('/contents/')) return new Response(JSON.stringify({ encoding: 'base64', content: '77u/\neA==' }));
      if (url.includes('/pulls/comments/404')) return new Response('{"message":"Not Found"}', { status: 404 });
      return new Response('{}');
    }) as unknown as typeof fetch;
    const live = createApi(createClient({ kind: 'token', token: 't' }, { fetch: f }));
    await live.submitReview('o', 'r', 1, { event: 'COMMENT', commitId: 'abc', comments: [{ path: 'a', line: 1, side: 'RIGHT', body: 'x' }] });
    expect(JSON.parse(calls[0].body!)).toMatchObject({ event: 'COMMENT', commit_id: 'abc' });
    await live.submitReview('o', 'r', 1, { event: 'COMMENT' });
    expect(JSON.parse(calls[1].body!)).not.toHaveProperty('commit_id');
    expect(await live.fileSource('o', 'r', 'dir/a b.txt', 'feat/x#1')).toEqual({ text: 'x', bom: true });
    expect(calls[2].url).toBe('https://api.github.com/repos/o/r/contents/dir/a%20b.txt?ref=feat%2Fx%231');
    expect(calls[2].accept).not.toMatch(/raw/);
    expect(await live.reviewComment('o', 'r', 404)).toBeNull(); // a deleted comment is "gone", not an error
  });
  it('a file GitHub doesn’t inline (over 1 MB) is refused with a clear message', async () => {
    const f = (async () => new Response(JSON.stringify({ encoding: 'none', content: '' }))) as unknown as typeof fetch;
    const live = createApi(createClient({ kind: 'token', token: 't' }, { fetch: f }));
    await expect(live.fileSource('o', 'r', 'big.bin')).rejects.toThrow(/too big/);
  });
  it('fileSource and reviewComment work on sample data', async () => {
    expect((await api.fileSource('you', 'trail-notes', 'src/sync/queue.ts', 'a91f3c2e')).text).toMatch(/^import/);
    const [c] = await api.reviewComments('you', 'trail-notes', 45);
    expect((await api.reviewComment('you', 'trail-notes', c.id))?.body).toBe(c.body);
  });
});

describe('path segments', () => {
  it('"." and ".." are refused before any request (no climbing out of the intended API path)', async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response('{}'); }) as unknown as typeof fetch;
    const live = createApi(createClient({ kind: 'token', token: 't' }, { fetch: f }));
    await expect(live.isStarred('x/..')).rejects.toMatchObject({ status: 404 });
    await expect(live.setStar('../../../repos/v/s/collaborators/a', true)).rejects.toMatchObject({ status: 404 });
    await expect(live.repo('..', 'x')).rejects.toMatchObject({ status: 404 });
    await expect(live.fileText('o', 'r', 'a/../../../../user')).rejects.toMatchObject({ status: 404 });
    expect(urls).toEqual([]);
    await live.isStarred('o/r');
    expect(urls).toEqual(['https://api.github.com/user/starred/o/r']);
  });
});


describe('lists that span several pages', () => {
  it('your repos and stars follow every Link page (there were people with more than 50)', async () => {
    const pages = (path: string) => {
      const p = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1);
      const items = Array.from({ length: p < 3 ? 100 : 7 }, (_, i) => ({ full_name: `me/r${p}-${i}` }));
      const link = p < 3 ? `<https://api.github.com${path.replace(/([?&])page=\d+/, `$1page=${p + 1}`)}>; rel="next"` : null;
      return new Response(JSON.stringify(items), { headers: link ? { Link: link } : {} });
    };
    const seen: string[] = [];
    const f = (async (u: string) => { seen.push(u); return pages(u); }) as unknown as typeof fetch;
    const live = createApi(createClient({ kind: 'token', token: 't' }, { fetch: f }));
    expect((await live.myRepos()).length).toBe(207);
    expect(seen.every((u) => u.includes('per_page=100'))).toBe(true);
    expect((await live.starred()).length).toBe(207);
  });
});
