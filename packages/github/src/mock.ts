/* Sample data with the same shapes as the GitHub API, so every screen works before sign-in. */
import type { Comment, DraftComment, FeedEvent, Issue, NewTreeEntry, Notification, PrFile, PullRequest, Repo, Review, ReviewComment, ReviewEvent, User } from './types';
import type { RequestOptions } from './client';
import { base64Encode, utf8Encode } from './bytes';
import { parsePatch } from './diff';
import { originalLines } from './suggest';

export const SAMPLE_LOGIN = 'you';
const API = 'https://api.github.com';
const now = Date.now();
const ago = (h: number) => new Date(now - h * 3600e3).toISOString();
const IDS: Record<string, number> = { you: 100, mira: 101, lin: 102, devansh: 103 };
const u = (login: string): User => ({ id: IDS[login], login, avatar_url: '' });
const NAMES: Record<string, string> = { mira: 'Mira Okafor', devansh: 'Devansh Rao', lin: 'Lin Zhou', you: 'Sample User' };
const ME: User = { id: 100, login: 'you', name: 'Sample User', bio: 'Building small tools for big trips.', avatar_url: '', public_repos: 6, followers: 48, following: 31, location: 'Bengaluru' };

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

type PrExtra = Pick<PullRequest, 'draft' | 'merged' | 'merged_at' | 'mergeable' | 'head' | 'base' | 'additions' | 'deletions' | 'changed_files' | 'commits' | 'maintainer_can_modify'>;
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
    it._pr = { draft: false, merged: false, merged_at: null, mergeable: true, head: { ref: 'feature', sha: 'f00dfeed' }, base: { ref: 'main' }, additions: 20, deletions: 4, changed_files: 1, commits: 1, maintainer_can_modify: false, ...pr };
    // Every sample PR comes from a branch in the same repo (no forks).
    it._pr.head.repo ??= { full_name: full, owner: { login: full.split('/')[0] } };
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
comment(p45, 'mira', 0.5, 'Tested on my phone, the title edit survives now. One nit on the timestamp comparison:\n\n> newer timestamp wins\n\nShould be `>` so ties keep the local edit.');
add('you/trail-notes', 44, 'Export a trip as GPX', 'devansh', 'open', 26, 'Would love to bring my routes into other map apps.', [['enhancement', 'a2eeef']]);
add('you/trail-notes', 39, 'Tag chips are hard to read in dark mode', 'lin', 'closed', 50, 'The grey chips almost vanish.', [['design', 'c5def5']]);
add('you/pocket-ledger', 88, 'Rounding error when splitting 3 ways', 'mira', 'open', 8, 'Splitting ₹100 three ways gives ₹99.99 total.', [['bug', 'd73a4a']]);
add('you/pocket-ledger', 90, 'Add CSV import for bank statements', 'you', 'open', 12, 'First pass at importing statement formats.', [['enhancement', 'a2eeef']], { draft: true, head: { ref: 'feat/csv-import', sha: 'c5f1d2aa' }, additions: 402, deletions: 3, changed_files: 6, commits: 9 });
add('lin/tiny-sync', 33, 'Batch writes during initial sync', 'lin', 'open', 5, 'Cuts first-sync time roughly in half on large docs.', [], { head: { ref: 'perf/batch', sha: 'b47c0e19' }, additions: 96, deletions: 41, changed_files: 4, commits: 3 });

/* The head branch of #45 (fix/offline-merge) and the base versions of the files it changes. The PR patches,
   the review comments' diff_hunks and the git store below are all built from these, so they agree. */
const QUEUE_TS = `import { Entry, Patch } from '../types';

export class PatchQueue {
  private patches: Patch[] = [];

  push(entryId: string, field: keyof Entry, value: unknown) {
    this.patches.push({ entryId, field, value, at: Date.now() });
  }

  merge(remote: Entry, local: Entry): Entry {
    // newer timestamp wins, the other value goes to history
    return remote.updatedAt >= local.updatedAt ? remote : local;
  }
}
`;
const INDEX_HEAD_TOP = `import type { Db } from '../db';
import { fetchRemote, flush, push } from './remote';
import { PatchQueue } from './queue';

/** One queue per app run: edits made offline wait here until we reconnect. */
const queue = new PatchQueue();

export function queuedEdits(): PatchQueue {
  return queue;
}

/**
 * Pulls remote entries and stores them locally.
 * Entries edited offline are merged instead of overwritten.
 */
export async function syncEntries(db: Db) {
  await db.ready();
  const remote = await fetchRemote();
  for (const entry of remote) {
    const local = await db.get(entry.id);
`;
const INDEX_BASE = INDEX_HEAD_TOP + `    if (local && local.dirty) {
      await flush(local);
    }
    await db.put(entry);
  }
  return remote.length;
}
`;
const INDEX_HEAD = INDEX_HEAD_TOP + `    if (local && local.dirty) {
      const merged = queue.merge(entry, local);
      await db.put(merged);
      await push(merged);
    } else {
      await db.put(entry);
    }
  }
  return remote.length;
}
`;
const QUEUE_TEST = "import { PatchQueue } from './queue';\n\ntest('local edit wins when newer', () => {\n});\n";
const HEAD_45: Record<string, string> = { 'src/sync/queue.ts': QUEUE_TS, 'src/sync/index.ts': INDEX_HEAD, 'src/sync/queue.test.ts': QUEUE_TEST };
/** Base (main) text of each file a PR changes; missing = the PR adds the file. Used to redo patches after a push. */
const BASE: Record<string, Record<string, string>> = { 'you/trail-notes#45': { 'src/sync/index.ts': INDEX_BASE } };

/** A small LCS diff → unified patch with 3 lines of context, like GET /pulls/{n}/files returns. Sample files are tiny. */
function unifiedDiff(a: string, b: string): string {
  const split = (t: string) => (t ? t.replace(/\n$/, '').split('\n') : []);
  const A = split(a), B = split(b), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops: { t: ' ' | '-' | '+'; s: string; o: number; n: number }[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { ops.push({ t: ' ', s: A[i], o: i + 1, n: j + 1 }); i++; j++; }
    else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { ops.push({ t: '-', s: A[i], o: i + 1, n: j + 1 }); i++; }
    else { ops.push({ t: '+', s: B[j], o: i + 1, n: j + 1 }); j++; }
  }
  const ranges: [number, number][] = [];
  ops.forEach((op, k) => {
    if (op.t === ' ') return;
    const lo = Math.max(0, k - 3), hi = Math.min(ops.length - 1, k + 3), last = ranges[ranges.length - 1];
    if (last && lo <= last[1] + 1) last[1] = hi; else ranges.push([lo, hi]);
  });
  return ranges.map(([lo, hi]) => {
    const h = ops.slice(lo, hi + 1);
    const oLen = h.filter((x) => x.t !== '+').length, nLen = h.filter((x) => x.t !== '-').length;
    const oStart = oLen ? h[0].o : h[0].o - 1, nStart = nLen ? h[0].n : h[0].n - 1;
    return [`@@ -${oStart},${oLen} +${nStart},${nLen} @@`, ...h.map((x) => x.t + x.s)].join('\n');
  }).join('\n');
}
const counts = (patch: string) => ({ additions: (patch.match(/^\+/gm) ?? []).length, deletions: (patch.match(/^-/gm) ?? []).length });

/** GitHub's diff_hunk for a comment: the hunk header through the commented line. */
function hunkTo(patch: string, line: number, side: 'LEFT' | 'RIGHT'): string | undefined {
  const l = parsePatch(patch);
  const k = l.findIndex((x) => x.kind !== 'hunk' && (side === 'LEFT' ? x.kind === 'del' && x.old === line : x.kind !== 'del' && x.new === line));
  if (k < 0) return undefined;
  let h = k; while (h > 0 && l[h].kind !== 'hunk') h--;
  return l.slice(h, k + 1).map((x) => x.text).join('\n');
}

const INDEX_PATCH = '@@ -18,8 +18,11 @@ export async function syncEntries(db: Db) {\n   const remote = await fetchRemote();\n   for (const entry of remote) {\n     const local = await db.get(entry.id);\n-    if (local && local.dirty) {\n-      await flush(local);\n-    }\n-    await db.put(entry);\n+    if (local && local.dirty) {\n+      const merged = queue.merge(entry, local);\n+      await db.put(merged);\n+      await push(merged);\n+    } else {\n+      await db.put(entry);\n+    }\n   }';
const FILES: Record<string, PrFile[]> = {
  'you/trail-notes#45': [
    { filename: 'src/sync/queue.ts', status: 'added', additions: 14, deletions: 0, patch: unifiedDiff('', QUEUE_TS) },
    { filename: 'src/sync/index.ts', status: 'modified', additions: 7, deletions: 4, patch: INDEX_PATCH },
    { filename: 'src/sync/queue.test.ts', status: 'added', additions: 154, deletions: 0, patch: unifiedDiff('', QUEUE_TEST) },
  ],
};

FILES['lin/tiny-sync#33'] = [
  { filename: 'src/sync/initial.ts', status: 'modified', additions: 6, deletions: 2, patch: '@@ -10,6 +10,10 @@ export async function initialSync(doc: Doc) {\n   const ops = await fetchOps(doc.id);\n-  for (const op of ops) {\n-    await apply(doc, op);\n+  const BATCH = 500;\n+  for (let i = 0; i < ops.length; i += BATCH) {\n+    const batch = ops.slice(i, i + BATCH);\n+    await applyMany(doc, batch);\n+    await yieldToUi();\n+    report(i + batch.length, ops.length);\n   }\n   return doc;' },
];

const REVIEWS: Record<string, Review[]> = {
  'you/trail-notes#45': [{ id: 901, user: u('mira'), state: 'COMMENTED', body: 'Looks close. One question inline.', submitted_at: ago(0.6) }],
};
/** A review comment anchored like GitHub does it: current line(s) plus the original ones and the hunk at the head commit. */
function anchored(key: string, path: string, line: number, side: 'LEFT' | 'RIGHT', startLine?: number | null, startSide?: 'LEFT' | 'RIGHT' | null) {
  const pr = key.split('#');
  const patch = FILES[key]?.find((f) => f.filename === path)?.patch;
  const hunk = patch ? hunkTo(patch, line, side) : undefined;
  const sha = (ISSUES[pr[0]] ?? []).find((i) => i.number === +pr[1])?._pr?.head.sha;
  return {
    path, line, side, start_line: startLine ?? null, start_side: startLine != null ? startSide ?? side : null,
    original_line: line, original_start_line: startLine ?? null, ...(hunk ? { diff_hunk: hunk } : {}), ...(sha ? { commit_id: sha } : {}),
  };
}
const K45 = 'you/trail-notes#45';
const REVIEW_COMMENTS: Record<string, ReviewComment[]> = {
  [K45]: [
    { id: 951, user: u('mira'), body: 'Ties should keep the local edit:\n\n```suggestion\n    return remote.updatedAt > local.updatedAt ? remote : local;\n```', ...anchored(K45, 'src/sync/queue.ts', 12, 'RIGHT'), created_at: ago(0.6) },
    { id: 952, user: u('you'), body: "Good catch, I'll take it.", ...anchored(K45, 'src/sync/queue.ts', 12, 'RIGHT'), in_reply_to_id: 951, created_at: ago(0.5) },
    { id: 953, user: u('lin'), body: 'Nothing reassigns this:\n\n```suggestion\n  private readonly patches: Patch[] = [];\n```', ...anchored(K45, 'src/sync/queue.ts', 4, 'RIGHT'), created_at: ago(0.55) },
    { id: 955, user: u('devansh'), body: 'Could `push(merged)` fail offline? Maybe queue it.', ...anchored(K45, 'src/sync/index.ts', 24, 'RIGHT', 22, 'RIGHT'), created_at: ago(0.9) },
  ],
};
let rid = 1000;

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
/** A file or folder listing. `files` is the tree at a ref: main's sample tree unless a git store has that ref. */
function contents(r: Repo, path: string, files: Record<string, string> = { ...TREE, 'README.md': readme(r) }) {
  const names = Object.keys(files);
  if (names.includes(path)) {
    const text = files[path];
    // Like GitHub's JSON form: base64 of the UTF-8 bytes, wrapped at 60 characters.
    const content = (base64Encode(utf8Encode(text)).match(/.{1,60}/g) ?? []).join('\n');
    return { file: { type: 'file' as const, name: path.split('/').pop()!, path, size: text.length, sha: 'f' + path.length, encoding: 'base64', content }, text };
  }
  const prefix = path ? path + '/' : '';
  const kids = new Map<string, 'file' | 'dir'>();
  for (const f of names) if (f.startsWith(prefix)) { const rest = f.slice(prefix.length); const [head, ...more] = rest.split('/'); kids.set(head, more.length ? 'dir' : 'file'); }
  if (!kids.size) return notFound();
  return { dir: [...kids].map(([name, type]) => ({ type, name, path: prefix + name, size: type === 'file' ? files[prefix + name].length : 0, sha: 's' + name.length })) };
}

/* A tiny git object store (commits, trees, branch refs) for repos you can push to, so applying a suggestion
   makes a real sample commit: the Git Data endpoints, contents at a ref, and the PR all see it. */
type Snap = Record<string, { content: string; mode: string }>;
type GitStore = { commits: Record<string, { sha: string; tree: string; parents: string[]; message: string }>; trees: Record<string, { root: string; prefix: string }>; snaps: Record<string, Snap>; refs: Record<string, string> };
function fakeSha(seed: string) {
  let h = 0x811c9dc5, out = '';
  for (let k = 0; out.length < 40; k++) { for (const ch of `${seed}#${k}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; out += h.toString(16).padStart(8, '0'); }
  return out.slice(0, 40);
}
function putTree(st: GitStore, snap: Snap) {
  const sha = fakeSha('tree:' + JSON.stringify(Object.entries(snap).sort(([a], [b]) => a.localeCompare(b))));
  st.snaps[sha] = snap; st.trees[sha] = { root: sha, prefix: '' };
  return sha;
}
const GIT: Record<string, GitStore> = {};
{
  const st: GitStore = { commits: {}, trees: {}, snaps: {}, refs: {} };
  const files: Record<string, string> = { ...TREE, 'README.md': readme(REPOS[0]), ...HEAD_45 };
  const snap: Snap = Object.fromEntries(Object.entries(files).map(([path, content]) => [path, { content, mode: '100644' }]));
  const tree = putTree(st, snap);
  st.commits.a91f3c2e = { sha: 'a91f3c2e', tree, parents: ['77be019d'], message: 'Merge field-level patches on reconnect' };
  st.refs['fix/offline-merge'] = 'a91f3c2e';
  GIT['you/trail-notes'] = st;
}
let commitSeq = 0;
/** The files at a branch name or commit sha, or null when the store doesn't know the ref (then main's sample tree serves). */
function filesAt(full: string, ref: string): Record<string, string> | null {
  const st = GIT[full]; if (!st || !ref) return null;
  const c = st.commits[st.refs[ref] ?? ref];
  return c ? Object.fromEntries(Object.entries(st.snaps[c.tree]).map(([k, v]) => [k, v.content])) : null;
}
const unprocessable = (msg: string): never => { throw Object.assign(new Error(msg), { status: 422 }); };

function git(full: string, rest: string, m: string, body: unknown): unknown {
  const st = GIT[full] ?? notFound(); // no store = no push access; GitHub answers 404 then too
  let r: RegExpMatchArray | null;
  if (m === 'GET' && (r = rest.match(/^\/git\/commits\/([^/]+)$/))) {
    const c = st.commits[decodeURIComponent(r[1])] ?? notFound();
    return { sha: c.sha, tree: { sha: c.tree }, message: c.message, parents: c.parents.map((sha) => ({ sha })) };
  }
  if (m === 'GET' && (r = rest.match(/^\/git\/trees\/([^/]+)$/))) {
    const sha = decodeURIComponent(r[1]); const t = st.trees[sha] ?? notFound(); const snap = st.snaps[t.root];
    const kids = new Map<string, { path: string; mode: string; type: 'blob' | 'tree'; sha: string }>();
    for (const [path, f] of Object.entries(snap)) {
      if (!path.startsWith(t.prefix)) continue;
      const [name, ...more] = path.slice(t.prefix.length).split('/');
      if (!more.length) { kids.set(name, { path: name, mode: f.mode, type: 'blob', sha: fakeSha('blob:' + f.content) }); continue; }
      const prefix = t.prefix + name + '/', sub = fakeSha(`${t.root}:${prefix}`);
      st.trees[sub] = { root: t.root, prefix };
      kids.set(name, { path: name, mode: '040000', type: 'tree', sha: sub });
    }
    return { sha, tree: [...kids.values()] };
  }
  if (m === 'POST' && rest === '/git/trees') {
    const b = body as { base_tree: string; tree: NewTreeEntry[] };
    const snap: Snap = { ...(st.snaps[b.base_tree] ?? unprocessable('base_tree is not a valid tree')) };
    for (const f of b.tree) snap[f.path] = { content: f.content, mode: f.mode };
    return { sha: putTree(st, snap) };
  }
  if (m === 'POST' && rest === '/git/commits') {
    const b = body as { message: string; tree: string; parents: string[] };
    if (!st.snaps[b.tree]) unprocessable('Tree SHA does not exist');
    const sha = fakeSha(`commit:${b.tree}:${b.parents.join(',')}:${b.message}:${commitSeq++}`);
    st.commits[sha] = { sha, tree: b.tree, parents: b.parents, message: b.message };
    return { sha, tree: { sha: b.tree }, message: b.message, parents: b.parents.map((p) => ({ sha: p })) };
  }
  if (m === 'PATCH' && (r = rest.match(/^\/git\/refs\/heads\/(.+)$/))) {
    const branch = decodeURIComponent(r[1]); const cur = st.refs[branch] ?? notFound();
    const b = body as { sha: string; force?: boolean };
    const c = st.commits[b.sha] ?? unprocessable('Object does not exist');
    if (!b.force && !c.parents.includes(cur)) unprocessable('Update is not a fast forward');
    st.refs[branch] = b.sha;
    afterPush(full, branch, st.snaps[st.commits[cur].tree], st.snaps[c.tree], b.sha);
    return { ref: `refs/heads/${branch}`, object: { sha: b.sha, type: 'commit' } };
  }
  return notFound();
}

/** What GitHub does after a push to a PR branch: new head sha, fresh patches, and comments on changed lines go outdated. */
function afterPush(full: string, branch: string, before: Snap, after: Snap, sha: string) {
  for (const it of ISSUES[full] ?? []) {
    const pr = it._pr;
    if (!pr || it.state !== 'open' || pr.head.ref !== branch || pr.head.repo?.full_name !== full) continue;
    const key = `${full}#${it.number}`;
    pr.head.sha = sha; pr.commits++; it.updated_at = new Date().toISOString();
    for (const f of FILES[key] ?? []) {
      const was = before[f.filename]?.content, now = after[f.filename]?.content;
      if (now === undefined || was === now) continue;
      f.patch = unifiedDiff(BASE[key]?.[f.filename] ?? '', now);
      Object.assign(f, counts(f.patch));
    }
    for (const c of REVIEW_COMMENTS[key] ?? []) {
      if (c.line == null || c.side === 'LEFT') continue;
      const text = after[c.path]?.content;
      const want = originalLines(c);
      if (text !== undefined && !want) continue; // nothing to compare against; leave it
      const have = text?.split(/\r?\n/).slice((c.start_line ?? c.line) - 1, c.line);
      if (!have || !want || have.length !== want.length || have.some((l, i) => l !== want[i])) { c.line = null; c.start_line = null; }
    }
  }
}

/* GraphQL: only the review-thread query and the resolve/unresolve mutations Gitling sends. Thread id = RT_<root id>. */
const RESOLVED = new Set(['RT_955']);
const CAN_RESOLVE = new Set(['you/trail-notes#45', 'lin/tiny-sync#33']);
function graphql(b: { query: string; variables?: Record<string, unknown> }) {
  const v = b.variables ?? {};
  const fail = (message: string) => ({ data: null, errors: [{ message }] });
  const un = /\bunresolveReviewThread\b/.test(b.query);
  if (un || /\bresolveReviewThread\b/.test(b.query)) {
    const id = String(v.threadId);
    const key = Object.keys(REVIEW_COMMENTS).find((k) => REVIEW_COMMENTS[k].some((c) => c.in_reply_to_id == null && `RT_${c.id}` === id));
    if (!key) return fail(`Could not resolve to a node with the global id of '${id}'`);
    if (!CAN_RESOLVE.has(key)) return fail('Resource not accessible by integration');
    if (un) RESOLVED.delete(id); else RESOLVED.add(id);
    return { data: { [un ? 'unresolveReviewThread' : 'resolveReviewThread']: { thread: { id, isResolved: !un } } } };
  }
  if (/\breviewThreads\b/.test(b.query)) {
    const full = `${v.owner}/${v.repo}`, key = `${full}#${v.number}`;
    if (!(ISSUES[full] ?? []).some((i) => i.number === Number(v.number) && i._pr)) return fail(`Could not resolve to a PullRequest with the number of ${v.number}.`);
    const can = CAN_RESOLVE.has(key);
    const nodes = (REVIEW_COMMENTS[key] ?? []).filter((c) => c.in_reply_to_id == null).map((c) => ({
      id: `RT_${c.id}`, isResolved: RESOLVED.has(`RT_${c.id}`), isOutdated: c.line == null,
      viewerCanResolve: can, viewerCanUnresolve: can, viewerCanReply: true, comments: { nodes: [{ databaseId: c.id }] },
    }));
    return { data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } } };
  }
  return fail('Sample data only answers review thread queries.');
}

export type MockResponse = { data: unknown; link?: string };

/** Answers the same paths as api.ts, from in-memory sample data. Mutations change the data for the session. */
export async function mockRequest(path: string, o: RequestOptions = {}): Promise<MockResponse> {
  await sleep(60 + Math.random() * 100);
  // A copy, like JSON off the wire: later sample mutations (a push moving head.sha) must not change answers already given.
  const data = route(path, o);
  return { data: data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data };
}

function route(path: string, o: RequestOptions): unknown {
  const m = o.method ?? 'GET';
  const [p, q = ''] = path.split('?');
  let r: RegExpMatchArray | null;
  if (p === '/graphql' && m === 'POST') return graphql(o.body as { query: string; variables?: Record<string, unknown> });
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
    if (rest.startsWith('/git/')) return git(full, rest, m, o.body);
    if (rest === '/actions/runs') return { total_count: RUNS.length, workflow_runs: RUNS };
    if (rest === '/branches') return ['main', 'fix/offline-merge', 'feat/csv-import', 'docs/guide'].map((name, i) => ({ name, protected: name === 'main', commit: { sha: 'b' + i + 'c0ffee' } }));
    if (rest === '/readme') return rp ? readme(rp) : notFound();
    if (rest === '/contents' || rest.startsWith('/contents/')) {
      const c = contents(rp ?? notFound(), decodeURIComponent(rest.slice('/contents/'.length)), filesAt(full, param(q, 'ref')) ?? undefined);
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
    if ((r = rest.match(/^\/pulls\/(\d+)\/reviews$/))) {
      const it = find(full, r[1]); const key = `${full}#${r[1]}`;
      if (m !== 'POST') return REVIEWS[key] ?? [];
      const b = o.body as { event: ReviewEvent; body?: string; comments?: DraftComment[] };
      if (b.event !== 'COMMENT' && it.user.login === 'you') throw Object.assign(new Error(b.event === 'APPROVE' ? "Can't approve your own pull request" : "Can't request changes on your own pull request"), { status: 422 });
      const state = ({ APPROVE: 'APPROVED', REQUEST_CHANGES: 'CHANGES_REQUESTED', COMMENT: 'COMMENTED' } as const)[b.event];
      const review: Review = { id: rid++, user: u('you'), state, body: b.body ?? '', submitted_at: new Date().toISOString() };
      (REVIEWS[key] ??= []).push(review);
      // Anchored against the PR's current patch and head, so a suggestion written here can be applied in sample mode.
      for (const c of b.comments ?? []) (REVIEW_COMMENTS[key] ??= []).push({ id: rid++, user: u('you'), body: c.body, ...anchored(key, c.path, c.line, c.side, c.start_line, c.start_side), created_at: review.submitted_at! });
      return review;
    }
    if (m === 'GET' && (r = rest.match(/^\/pulls\/comments\/(\d+)$/))) {
      const c = Object.entries(REVIEW_COMMENTS).filter(([k]) => k.startsWith(full + '#')).flatMap(([, v]) => v).find((x) => x.id === Number(r![1]));
      return c ?? notFound();
    }
    if (m === 'POST' && (r = rest.match(/^\/pulls\/(\d+)\/comments\/(\d+)\/replies$/))) {
      find(full, r[1]);
      const list = REVIEW_COMMENTS[`${full}#${r[1]}`] ?? [];
      // GitHub threads a reply under the root, so follow any chain up first.
      let root = list.find((c) => c.id === +r![2]) ?? notFound();
      for (let i = 0; i < 50 && root.in_reply_to_id != null; i++) root = list.find((c) => c.id === root.in_reply_to_id) ?? root;
      const { id: _id, user: _u, body: _b, created_at: _at, in_reply_to_id: _r, html_url: _h, ...anchor } = root;
      const reply: ReviewComment = { id: rid++, user: u('you'), body: String((o.body as { body: string }).body), ...anchor, in_reply_to_id: root.id, created_at: new Date().toISOString() };
      list.push(reply);
      return reply;
    }
    if ((r = rest.match(/^\/pulls\/(\d+)\/comments$/))) { find(full, r[1]); return REVIEW_COMMENTS[`${full}#${r[1]}`] ?? []; }
    if ((r = rest.match(/^\/pulls\/(\d+)\/merge$/))) { const it = find(full, r[1]); it.state = 'closed'; it.closed_at = new Date().toISOString(); if (it._pr) { it._pr.merged = true; it._pr.merged_at = it.closed_at; } if (it.pull_request) it.pull_request.merged_at = it.closed_at; return { merged: true }; }
    if ((r = rest.match(/^\/commits\/[^/]+\/check-runs$/))) return { total_count: 3, check_runs: ['build / node-22', 'test / vitest', 'lint'].map((name) => ({ name, status: 'completed', conclusion: 'success', started_at: ago(1.1), completed_at: ago(1) })) };
  }
  return notFound();
}
