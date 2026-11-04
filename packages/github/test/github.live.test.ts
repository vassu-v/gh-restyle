import { describe, expect, it } from 'vitest';
import { createApi } from '../src/api';
import { createClient } from '../src/client';

/**
 * Read-only checks against the real api.github.com. Run: `npm run test:live`
 *   GITHUB_TOKEN   optional; unauthenticated works within GitHub's 60 requests/hour
 *   LIVE_REPO      owner/name to read (default octocat/Spoon-Knife)
 *   LIVE_REPO_ONLY=1  skip user/search/feed checks (for sandboxes that only allow repo-scoped paths)
 */
const api = createApi(createClient({ kind: 'token', token: process.env.GITHUB_TOKEN ?? '' }));
const [owner, name] = (process.env.LIVE_REPO ?? 'octocat/Spoon-Knife').split('/');

describe(`live GitHub · ${owner}/${name}`, () => {
  it('repo, readme, tree, file', async () => {
    const r = await api.repo(owner, name);
    expect(r.full_name.toLowerCase()).toBe(`${owner}/${name}`.toLowerCase());
    const readme = await api.readme(owner, name);
    expect(readme === null || typeof readme === 'string').toBe(true);
    expect((await api.branches(owner, name)).some((b) => b.name === r.default_branch)).toBe(true);
    const root = await api.dir(owner, name, '');
    expect(root.length).toBeGreaterThan(0);
    const firstDir = root.find((x) => x.type === 'dir');
    if (firstDir) expect(root[0].type).toBe('dir'); // folders sort first
    const file = root.find((x) => x.type === 'file')!;
    const info = await api.fileInfo(owner, name, file.path);
    expect(info.size).toBe(file.size);
    const text = await api.fileText(owner, name, file.path);
    expect(typeof text).toBe('string');
    if (firstDir) expect((await api.dir(owner, name, firstDir.path)).length).toBeGreaterThan(0);
  });

  it('issues, pulls, and a thread with comments, files and checks', async () => {
    const issues = await api.issues(owner, name, 'open');
    expect(issues.items.every((i) => !i.pull_request)).toBe(true);
    const pulls = [...(await api.pulls(owner, name, 'open')).items, ...(await api.pulls(owner, name, 'closed')).items];
    if (!pulls.length) return; // repo has no PRs; list endpoints still passed
    const pr = await api.pull(owner, name, pulls[0].number);
    expect(pr.head.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(Array.isArray(await api.prFiles(owner, name, pr.number))).toBe(true);
    expect(Array.isArray(await api.comments(owner, name, pr.number))).toBe(true);
    expect((await api.checks(owner, name, pr.head.sha)).total_count).toBeGreaterThanOrEqual(0);
    expect((await api.issue(owner, name, pr.number)).pull_request).toBeTruthy();
  });

  it.skipIf(process.env.LIVE_REPO_ONLY === '1')('people, search, feed', async () => {
    expect((await api.user(owner)).login.toLowerCase()).toBe(owner.toLowerCase());
    expect((await api.searchRepos(`repo:${owner}/${name}`)).total_count).toBe(1);
    expect(Array.isArray(await api.feed(owner, true))).toBe(true);
    expect(Array.isArray((await api.searchIssues(`repo:${owner}/${name}`, 5)).items)).toBe(true);
  });
});
