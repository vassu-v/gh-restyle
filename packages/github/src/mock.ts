/* Sample data with the same shapes as the GitHub API, so every screen works before sign-in. */
import type { Comment, FeedEvent, Issue, Notification, PrFile, PullRequest, Repo, User } from './types';
import type { RequestOptions } from './client';

export const SAMPLE_LOGIN = 'you';
const API = 'https://api.github.com';
const now = Date.now();
const ago = (h: number) => new Date(now - h * 3600e3).toISOString();
const u = (login: string): User => ({ login, avatar_url: '' });
const NAMES: Record<string, string> = { mira: 'Mira Okafor', devansh: 'Devansh Rao', lin: 'Lin Zhou', you: 'Sample User' };
const ME: User = { login: 'you', name: 'Sample User', bio: 'Building small tools for big trips.', avatar_url: '', public_repos: 6, followers: 48, following: 31, location: 'Bengaluru' };

const repo = (o: string, r: string, d: string, lang: string | null, stars: number, forks: number, open: number, h: number, extra: Partial<Repo> = {}): Repo => ({
  name: r, full_name: `${o}/${r}`, owner: u(o), description: d, language: lang, stargazers_count: stars, forks_count: forks,
  open_issues_count: open, pushed_at: ago(h), updated_at: ago(h), default_branch: 'main', private: false, html_url: `https://github.com/${o}/${r}`, topics: [], ...extra,
});
const REPOS = [
  repo('you', 'trail-notes', 'Offline-first field journal for hikers. Syncs when you get signal.', 'TypeScript', 412, 37, 9, 2, { topics: ['offline-first', 'pwa'] }),
  repo('you', 'pocket-ledger', 'Tiny double-entry ledger that runs on a phone.', 'Rust', 1290, 88, 14, 20),
  repo('you', 'weather-cli', 'Forecasts in your terminal with sparkline charts.', 'Go', 233, 12, 3, 70),
  repo('you', 'dotfiles', 'Shell, editor and terminal config.', 'Shell', 41, 6, 0, 140),
  repo('you', 'label-maker', 'Generate printable labels for storage boxes.', 'Python', 19, 2, 2, 600),
];
const OTHER = [
  repo('openmaps', 'tilekit', 'Vector tile toolkit for small devices.', 'C++', 5400, 610, 120, 5),
  repo('lin', 'tiny-sync', 'CRDT sync engine in 3kb.', 'TypeScript', 2210, 140, 31, 30),
  repo('devansh', 'gpx-tools', 'Merge, trim and simplify GPX tracks from the CLI.', 'Go', 14, 1, 0, 26),
];
const ALL = [...REPOS, ...OTHER];
const starred = new Set(['openmaps/tilekit', 'lin/tiny-sync']);

type PrExtra = Pick<PullRequest, 'draft' | 'merged' | 'merged_at' | 'mergeable' | 'head' | 'base' | 'additions' | 'deletions' | 'changed_files' | 'commits'>;
type Stored = Issue & { _comments: Comment[]; _pr?: PrExtra };
const ISSUES: Record<string, Stored[]> = {};
let cid = 1;
function add(full: string, n: number, title: string, who: string, state: 'open' | 'closed', h: number, body: string, labels: [string, string][] = [], pr?: Partial<PrExtra>) {
  const it: Stored = {
    number: n, title, user: u(who), state, created_at: ago(h + 30), updated_at: ago(h), closed_at: state === 'closed' ? ago(h) : null,
    body, comments: 0, labels: labels.map(([name, color]) => ({ name, color })), repository_url: `${API}/repos/${full}`,
    html_url: `https://github.com/${full}/issues/${n}`, _comments: [],
  };
  if (pr) {
    it.pull_request = { url: `${API}/repos/${full}/pulls/${n}`, merged_at: pr.merged ? ago(h) : null };
    it.draft = !!pr.draft;
    it._pr = { draft: false, merged: false, merged_at: null, mergeable: true, head: { ref: 'feature', sha: 'f00dfeed' }, base: { ref: 'main' }, additions: 20, deletions: 4, changed_files: 1, commits: 1, ...pr };
  }
  (ISSUES[full] ??= []).push(it);
  return it;
}
const comment = (it: Stored, who: string, h: number, md: string) => { it._comments.push({ id: cid++, user: u(who), created_at: ago(h), body: md }); it.comments = it._comments.length; };

const i42 = add('you/trail-notes', 42, 'Offline sync drops edits made in airplane mode', 'mira', 'open', 3,
  'When I edit an entry with **airplane mode** on, then reconnect, the edit is gone. The server copy wins.\n\n1. Open an existing entry\n2. Turn on airplane mode, change the title\n3. Turn airplane mode off\n\nSeen on iOS 18.4 and Pixel 8. cc @devansh',
  [['bug', 'd73a4a'], ['sync', '1d76db']]);
comment(i42, 'you', 2.5, 'Reproduced. The queue flushes before the merge step reads the local version. Working on a fix in #45.\n\n```ts\nawait flush(local); // runs before merge()\n```');
comment(i42, 'devansh', 1, 'Same here on Android. Happy to test the branch.');
const p45 = add('you/trail-notes', 45, 'Merge offline edits instead of overwriting them', 'you', 'open', 1,
  'Fixes #42. Offline edits are stored as a patch queue and merged field by field on reconnect.\n\n- [x] Patch queue\n- [x] Field-level merge\n- [ ] Conflict UI\n\n| Case | Before | After |\n|---|---|---|\n| Title edit offline | lost | kept |\n| Both sides edit | server wins | newest wins |', [['sync', '1d76db']],
  { head: { ref: 'fix/offline-merge', sha: 'a91f3c2e' }, base: { ref: 'main' }, additions: 184, deletions: 37, changed_files: 3, commits: 4, mergeable: true });
comment(p45, 'mira', 0.5, 'Tested on my phone, the title edit survives now. One nit on the timestamp comparison:\n\n> newer timestamp wins\n\nShould be `>=` so ties keep the local edit.');
add('you/trail-notes', 44, 'Export a trip as GPX', 'devansh', 'open', 26, 'Would love to bring my routes into other map apps.', [['enhancement', 'a2eeef']]);
add('you/trail-notes', 39, 'Tag chips are hard to read in dark mode', 'lin', 'closed', 50, 'The grey chips almost vanish.', [['design', 'c5def5']]);
add('you/pocket-ledger', 88, 'Rounding error when splitting 3 ways', 'mira', 'open', 8, 'Splitting ₹100 three ways gives ₹99.99 total.', [['bug', 'd73a4a']]);
add('you/pocket-ledger', 90, 'Add CSV import for bank statements', 'you', 'open', 12, 'First pass at importing statement formats.', [['enhancement', 'a2eeef']], { draft: true, head: { ref: 'feat/csv-import', sha: 'c5f1d2aa' }, additions: 402, deletions: 3, changed_files: 6, commits: 9 });
add('lin/tiny-sync', 33, 'Batch writes during initial sync', 'lin', 'open', 5, 'Cuts first-sync time roughly in half on large docs.', [], { head: { ref: 'perf/batch', sha: 'b47c0e19' }, additions: 96, deletions: 41, changed_files: 4, commits: 3 });

const FILES: Record<string, PrFile[]> = {
  'you/trail-notes#45': [
    { filename: 'src/sync/queue.ts', status: 'added', additions: 22, deletions: 0, patch: "@@ -0,0 +1,12 @@\n+import { Entry, Patch } from '../types';\n+\n+export class PatchQueue {\n+  private patches: Patch[] = [];\n+\n+  push(entryId: string, field: keyof Entry, value: unknown) {\n+    this.patches.push({ entryId, field, value, at: Date.now() });\n+  }\n+\n+  merge(remote: Entry, local: Entry): Entry {\n+    // newer timestamp wins, the other value goes to history\n+  }" },
    { filename: 'src/sync/index.ts', status: 'modified', additions: 8, deletions: 4, patch: '@@ -18,9 +18,13 @@ export async function syncEntries(db: Db) {\n   const remote = await fetchRemote();\n   for (const entry of remote) {\n     const local = await db.get(entry.id);\n-    if (local && local.dirty) {\n-      await flush(local);\n-    }\n-    await db.put(entry);\n+    if (local && local.dirty) {\n+      const merged = queue.merge(entry, local);\n+      await db.put(merged);\n+      await push(merged);\n+    } else {\n+      await db.put(entry);\n+    }\n   }' },
    { filename: 'src/sync/queue.test.ts', status: 'added', additions: 154, deletions: 0, patch: "@@ -0,0 +1,4 @@\n+import { PatchQueue } from './queue';\n+\n+test('local edit wins when newer', () => {\n+});" },
  ],
};

const NOTIFS: Notification[] = [
  { id: 'n1', unread: true, reason: 'comment', updated_at: ago(0.5), repository: REPOS[0], subject: { type: 'PullRequest', title: p45.title, url: `${API}/repos/you/trail-notes/pulls/45` } },
  { id: 'n2', unread: true, reason: 'author', updated_at: ago(1), repository: REPOS[0], subject: { type: 'Issue', title: i42.title, url: `${API}/repos/you/trail-notes/issues/42` } },
  { id: 'n3', unread: true, reason: 'review_requested', updated_at: ago(5), repository: OTHER[1], subject: { type: 'PullRequest', title: 'Batch writes during initial sync', url: `${API}/repos/lin/tiny-sync/pulls/33` } },
  { id: 'n4', unread: true, reason: 'mention', updated_at: ago(8), repository: REPOS[1], subject: { type: 'Issue', title: 'Rounding error when splitting 3 ways', url: `${API}/repos/you/pocket-ledger/issues/88` } },
  { id: 'n5', unread: false, reason: 'ci_activity', updated_at: ago(20), repository: REPOS[2], subject: { type: 'CheckSuite', title: 'Check failed on main: lint', url: null } },
  { id: 'n6', unread: false, reason: 'subscribed', updated_at: ago(30), repository: OTHER[0], subject: { type: 'Release', title: 'tilekit v3.2.0', url: null } },
];
// Who triggered each notification (GitHub only gives this via latest_comment_url; sample data keeps it simple).
export const SAMPLE_NOTIFICATION_ACTORS: Record<string, { login: string; snippet: string }> = {
  n1: { login: 'mira', snippet: 'Mira: Tested on my phone, the title edit survives now. One nit on the timestamp.' },
  n2: { login: 'devansh', snippet: 'Devansh: Same here on Android. Happy to test the branch.' },
  n3: { login: 'lin', snippet: 'Lin asked for your review · lin/tiny-sync #33' },
  n4: { login: 'mira', snippet: 'Mira mentioned you · you/pocket-ledger #88' },
};

const ev = (id: string, type: string, actor: string, repoName: string, h: number, payload: FeedEvent['payload']): FeedEvent =>
  ({ id, type, actor: { login: actor, avatar_url: '' }, repo: { name: repoName }, created_at: ago(h), payload });
const EVENTS: FeedEvent[] = [
  ev('e1', 'ReleaseEvent', 'openmaps', 'openmaps/tilekit', 2, { action: 'published', release: { tag_name: 'v3.2.0', name: 'tilekit 3.2.0', body: 'Vector tiles are 40% smaller on device. New offline style packs.\n\n12 changes', html_url: 'https://github.com/openmaps/tilekit/releases/tag/v3.2.0' } }),
  ev('e2', 'WatchEvent', 'lin', 'tursodatabase/limbo', 4, { action: 'started' }),
  ev('e3', 'WatchEvent', 'lin', 'yjs/yjs', 4.1, { action: 'started' }),
  ev('e4', 'WatchEvent', 'lin', 'automerge/automerge', 4.2, { action: 'started' }),
  ev('e5', 'PushEvent', 'mira', 'you/trail-notes', 6, { size: 4, commits: [
    { sha: 'a91f3c2e', message: 'Merge field-level patches on reconnect' }, { sha: '77be019d', message: 'Add PatchQueue with tests' },
    { sha: 'c03d8e11', message: 'Fix tag chip contrast' }, { sha: '5e2a9b40', message: 'Tidy sync logs' }] }),
  ev('e6', 'CreateEvent', 'devansh', 'devansh/gpx-tools', 26, { ref_type: 'repository', description: 'Merge, trim and simplify GPX tracks from the CLI.' }),
  ev('e7', 'ForkEvent', 'mira', 'lin/tiny-sync', 30, { forkee: { full_name: 'mira/tiny-sync' } }),
  ev('e8', 'ReleaseEvent', 'lin', 'lin/tiny-sync', 50, { action: 'published', release: { tag_name: 'v0.9.0', name: null, body: 'Pluggable conflict resolvers.', html_url: '' } }),
];
const MY_EVENTS: FeedEvent[] = [
  ev('m1', 'PullRequestEvent', 'you', 'you/trail-notes', 1, { action: 'opened', pull_request: { number: 45, title: p45.title } }),
  ev('m2', 'PushEvent', 'you', 'you/trail-notes', 1.2, { size: 2, commits: [{ sha: 'a91f3c2e', message: 'Merge field-level patches on reconnect' }, { sha: '77be019d', message: 'Add PatchQueue with tests' }] }),
];

// 24 most recent CI runs for the home instrument.
const RUNS = Array.from({ length: 24 }, (_, i) => ({ conclusion: i === 5 ? 'failure' : 'success', created_at: ago(i * 3) }));

const strip = ({ _comments, _pr, ...rest }: Stored): Issue => rest;
const asPr = (s: Stored): PullRequest => ({ ...strip(s), ...(s._pr as PrExtra) });
const notFound = (): never => { throw Object.assign(new Error('Not in the sample data.'), { status: 404 }); };
const find = (full: string, n: string) => (ISSUES[full] ?? []).find((i) => i.number === +n) ?? notFound();
const param = (q: string, k: string) => decodeURIComponent((q.match(new RegExp(`(?:^|&)${k}=([^&]*)`)) ?? [])[1] ?? '').replace(/\+/g, ' ');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* A tiny file tree per repo, so the code browser works offline. */
const readme = (r: Repo) => `# ${r.name}\n\n${r.description ?? ''}\n\n![build](https://img.shields.io/badge/build-passing-brightgreen)\n\n## Install\n\n\`\`\`sh\nnpm install ${r.name}\n\`\`\`\n\n## Usage\n\n- Works **offline** first\n- Syncs when you get signal\n- See [the docs](docs/guide.md) or open an [issue](https://github.com/${r.full_name}/issues/42)\n\n> This README is sample data.\n`;
const TREE: Record<string, string> = {
  'README.md': '', 'package.json': '{\n  "name": "sample",\n  "version": "1.4.0",\n  "type": "module"\n}\n',
  'docs/guide.md': '# Guide\n\nStart with `npm install`, then run `npm start`.\n',
  'src/index.ts': "export { syncEntries } from './sync';\nexport type { Entry } from './types';\n",
  'src/sync/queue.ts': "import { Entry, Patch } from '../types';\n\nexport class PatchQueue {\n  private patches: Patch[] = [];\n\n  push(entryId: string, field: keyof Entry, value: unknown) {\n    this.patches.push({ entryId, field, value, at: Date.now() });\n  }\n}\n",
  'src/types.ts': 'export type Entry = { id: string; title: string; body: string; updatedAt: number };\n',
};
function contents(r: Repo, path: string) {
  const files = Object.keys(TREE);
  if (files.includes(path)) {
    const text = path === 'README.md' ? readme(r) : TREE[path];
    return { file: { type: 'file' as const, name: path.split('/').pop()!, path, size: text.length, sha: 'f' + path.length }, text };
  }
  const prefix = path ? path + '/' : '';
  const kids = new Map<string, 'file' | 'dir'>();
  for (const f of files) if (f.startsWith(prefix)) { const rest = f.slice(prefix.length); const [head, ...more] = rest.split('/'); kids.set(head, more.length ? 'dir' : 'file'); }
  if (!kids.size) return notFound();
  return { dir: [...kids].map(([name, type]) => ({ type, name, path: prefix + name, size: type === 'file' ? (TREE[prefix + name] || readme(r)).length : 0, sha: 's' + name.length })) };
}

export type MockResponse = { data: unknown; link?: string };

/** Answers the same paths as api.ts, from in-memory sample data. Mutations change the data for the session. */
export async function mockRequest(path: string, o: RequestOptions = {}): Promise<MockResponse> {
  await sleep(60 + Math.random() * 100);
  return { data: route(path, o) };
}

function route(path: string, o: RequestOptions): unknown {
  const m = o.method ?? 'GET';
  const [p, q = ''] = path.split('?');
  let r: RegExpMatchArray | null;
  if (p === '/user') return ME;
  if (p === '/user/repos') return REPOS;
  if (p === '/user/starred') return ALL.filter((x) => starred.has(x.full_name));
  if ((r = p.match(/^\/user\/starred\/(.+)$/))) {
    if (m === 'PUT') { starred.add(r[1]); return true; }
    if (m === 'DELETE') { starred.delete(r[1]); return true; }
    return starred.has(r[1]) ? true : notFound();
  }
  if ((r = p.match(/^\/users\/([^/]+)\/received_events$/))) return EVENTS;
  if ((r = p.match(/^\/users\/([^/]+)\/events$/))) return MY_EVENTS;
  if ((r = p.match(/^\/users\/([^/]+)\/repos$/))) return ALL.filter((x) => x.owner.login === r![1]);
  if ((r = p.match(/^\/users\/([^/]+)$/))) return r[1] === 'you' ? ME : { ...ME, login: r[1], name: NAMES[r[1]] ?? r[1], bio: null, public_repos: ALL.filter((x) => x.owner.login === r![1]).length };
  if (p === '/notifications') {
    if (m === 'PUT') { NOTIFS.forEach((n) => (n.unread = false)); return true; }
    return /all=true/.test(q) ? NOTIFS : NOTIFS.filter((n) => n.unread);
  }
  if ((r = p.match(/^\/notifications\/threads\/(.+)$/))) { const i = NOTIFS.findIndex((x) => x.id === r![1]); if (i >= 0) { if (m === 'DELETE') NOTIFS.splice(i, 1); else NOTIFS[i].unread = false; } return true; }
  if (p === '/search/issues') {
    const s = param(q, 'q'); const isPr = /is:pr/.test(s), isIssue = /is:issue/.test(s), open = /is:open/.test(s);
    const label = (s.match(/label:(\S+)/) ?? [])[1];
    const inRepo = (s.match(/repo:(\S+)/) ?? [])[1];
    let items = Object.entries(ISSUES).filter(([full]) => !inRepo || full === inRepo).flatMap(([, v]) => v)
      .filter((i) => (!isPr || i.pull_request) && (!isIssue || !i.pull_request) && (!open || i.state === 'open') && (!label || i.labels.some((l) => l.name === label)));
    if (/review-requested/.test(s)) items = items.filter((i) => i.pull_request && i.user.login !== 'you');
    if (/assignee/.test(s)) items = items.filter((i) => !i.pull_request);
    if (/mentions/.test(s)) items = items.filter((i) => i.number === 88);
    const words = s.split(' ').filter((w) => w && !w.includes(':')).join(' ').toLowerCase();
    if (words) items = items.filter((i) => i.title.toLowerCase().includes(words));
    return { total_count: items.length, items: items.map(strip) };
  }
  if (p === '/search/repositories') { const s = param(q, 'q').toLowerCase(); const items = ALL.filter((x) => `${x.full_name} ${x.description}`.toLowerCase().includes(s)); return { total_count: items.length, items }; }
  if ((r = p.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/))) {
    const full = `${decodeURIComponent(r[1])}/${decodeURIComponent(r[2])}`; const rest = r[3] ?? '';
    const rp = ALL.find((x) => x.full_name === full);
    if (!rest) return rp ? { ...rp, permissions: { admin: rp.owner.login === 'you', push: rp.owner.login === 'you', pull: true }, allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false } : notFound();
    if (rest === '/actions/runs') return { total_count: RUNS.length, workflow_runs: RUNS };
    if (rest === '/branches') return ['main', 'fix/offline-merge', 'feat/csv-import', 'docs/guide'].map((name, i) => ({ name, protected: name === 'main', commit: { sha: 'b' + i + 'c0ffee' } }));
    if (rest === '/readme') return rp ? readme(rp) : notFound();
    if (rest === '/contents' || rest.startsWith('/contents/')) {
      const c = contents(rp ?? notFound(), decodeURIComponent(rest.slice('/contents/'.length)));
      if ('dir' in c) return c.dir;
      return o.text ? c.text : c.file;
    }
    if (rest === '/issues' && m === 'GET') { const st = param(q, 'state') || 'open'; return (ISSUES[full] ?? []).filter((i) => st === 'all' || i.state === st).map(strip); }
    if (rest === '/pulls') { const st = param(q, 'state') || 'open'; return (ISSUES[full] ?? []).filter((i) => i.pull_request && (st === 'all' || i.state === st)).map(asPr); }
    if ((r = rest.match(/^\/issues\/(\d+)$/))) { const it = find(full, r[1]); if (m === 'PATCH') Object.assign(it, o.body as object); return strip(it); }
    if ((r = rest.match(/^\/issues\/(\d+)\/comments$/))) {
      const it = find(full, r[1]);
      if (m === 'POST') { comment(it, 'you', 0, String((o.body as { body: string }).body)); return it._comments[it._comments.length - 1]; }
      return it._comments;
    }
    if ((r = rest.match(/^\/pulls\/(\d+)$/))) return asPr(find(full, r[1]));
    if ((r = rest.match(/^\/pulls\/(\d+)\/files$/))) return FILES[`${full}#${r[1]}`] ?? [];
    if ((r = rest.match(/^\/pulls\/(\d+)\/reviews$/))) { find(full, r[1]); return { id: 1, state: 'APPROVED' }; }
    if ((r = rest.match(/^\/pulls\/(\d+)\/merge$/))) { const it = find(full, r[1]); it.state = 'closed'; it.closed_at = new Date().toISOString(); if (it._pr) { it._pr.merged = true; it._pr.merged_at = it.closed_at; } if (it.pull_request) it.pull_request.merged_at = it.closed_at; return { merged: true }; }
    if ((r = rest.match(/^\/commits\/[^/]+\/check-runs$/))) return { total_count: 3, check_runs: ['build / node-22', 'test / vitest', 'lint'].map((name) => ({ name, status: 'completed', conclusion: 'success', started_at: ago(1.1), completed_at: ago(1) })) };
  }
  return notFound();
}
