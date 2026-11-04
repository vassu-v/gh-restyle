/* Gitling data layer: GitHub REST client + sample-data mock with the same shape. */
(function () {
  const API = 'https://api.github.com';

  async function live(path, o = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method: o.method || 'GET',
        headers: {
          Authorization: 'Bearer ' + o.token,
          Accept: o.accept || 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(o.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: o.body ? JSON.stringify(o.body) : undefined,
      });
    } catch (e) {
      const err = new Error("Couldn't reach api.github.com. Check your connection. If you're viewing this inside a preview frame, open the hosted copy instead.");
      err.status = 0; throw err;
    }
    if (res.status === 204 || res.status === 205) return true;
    if (!res.ok) {
      let m = res.statusText;
      try { m = (await res.json()).message || m; } catch (_) {}
      if (res.status === 401) m = 'Your token was rejected. Sign in again with a valid token.';
      const err = new Error(m); err.status = res.status; throw err;
    }
    return o.text ? res.text() : res.json();
  }

  /* ---------- sample data ---------- */
  const now = Date.now();
  const ago = (h) => new Date(now - h * 3600e3).toISOString();
  const u = (login) => ({ login, avatar_url: '', type: 'User' });
  const ME = { login: 'you', name: 'Sample User', bio: 'Building small tools for big trips. This is sample data.', avatar_url: '', public_repos: 6, followers: 48, following: 31, location: 'Bengaluru', company: null, blog: '', created_at: ago(24 * 900) };
  const PEOPLE = { mira: 'Mira Okafor', devansh: 'Devansh Rao', lin: 'Lin Zhou' };

  const mkRepo = (o, r, d, lang, stars, forks, open, pushedH, extra = {}) => ({
    name: r, full_name: o + '/' + r, owner: u(o), description: d, language: lang,
    stargazers_count: stars, forks_count: forks, open_issues_count: open, watchers_count: stars,
    pushed_at: ago(pushedH), updated_at: ago(pushedH), default_branch: 'main', private: !!extra.private,
    html_url: 'https://github.com/' + o + '/' + r, topics: extra.topics || [], fork: false, ...extra,
  });
  const REPOS = [
    mkRepo('you', 'trail-notes', 'Offline-first field journal for hikers. Syncs when you get signal.', 'TypeScript', 412, 37, 9, 2, { topics: ['offline-first', 'pwa', 'hiking'] }),
    mkRepo('you', 'pocket-ledger', 'Tiny double-entry ledger that runs on a phone.', 'Rust', 1290, 88, 14, 20, { topics: ['finance', 'cli'] }),
    mkRepo('you', 'weather-cli', 'Forecasts in your terminal with sparkline charts.', 'Go', 233, 12, 3, 70),
    mkRepo('you', 'dotfiles', 'Shell, editor and terminal config.', 'Shell', 41, 6, 0, 140),
    mkRepo('you', 'site', 'Personal site and notes.', 'Astro', 8, 1, 1, 300, { private: true }),
    mkRepo('you', 'label-maker', 'Generate printable labels for storage boxes.', 'Python', 19, 2, 2, 600),
  ];
  const OTHER = [
    mkRepo('openmaps', 'tilekit', 'Vector tile toolkit for small devices.', 'C++', 5400, 610, 120, 5),
    mkRepo('lin', 'tiny-sync', 'CRDT sync engine in 3kb.', 'TypeScript', 2210, 140, 31, 30),
  ];
  const ALL_REPOS = REPOS.concat(OTHER);
  const starred = new Set(['openmaps/tilekit', 'lin/tiny-sync']);

  const md = (s) => s; // fixtures are already HTML
  const ISSUES = {}; // key "o/r" -> array
  const add = (repo, n, title, user, state, h, body, labels, extra = {}) => {
    const key = repo; (ISSUES[key] = ISSUES[key] || []);
    const it = {
      number: n, title, user: u(user), state, created_at: ago(h + 30), updated_at: ago(h), closed_at: state === 'closed' ? ago(h) : null,
      body_html: md(body), comments: 0, labels: (labels || []).map(([name, color]) => ({ name, color })),
      repository_url: API + '/repos/' + repo, html_url: 'https://github.com/' + repo + '/issues/' + n, _comments: [], ...extra,
    };
    if (extra.pr) it.pull_request = { url: API + '/repos/' + repo + '/pulls/' + n };
    ISSUES[key].push(it); return it;
  };
  const cm = (it, user, h, body) => { it._comments.push({ id: Math.random(), user: u(user), created_at: ago(h), body_html: body }); it.comments = it._comments.length; };

  const i42 = add('you/trail-notes', 42, 'Offline sync drops edits made in airplane mode', 'mira', 'open', 3,
    '<p>When I edit an entry with airplane mode on, then reconnect, the edit is gone. The server copy wins.</p><p><strong>Steps</strong></p><ol><li>Open an existing entry</li><li>Turn on airplane mode, change the title</li><li>Turn airplane mode off</li></ol><p>Expected the local edit to survive. Seen on iOS 18.4 and Pixel 8.</p>',
    [['bug', 'd73a4a'], ['sync', '1d76db'], ['priority: high', 'b60205']]);
  cm(i42, 'you', 2.5, '<p>Reproduced. The queue flushes before the merge step reads the local version. Working on a fix in #45.</p>');
  cm(i42, 'devansh', 1, '<p>Same here on Android. Happy to test the branch.</p>');
  const p45 = add('you/trail-notes', 45, 'Merge offline edits instead of overwriting them', 'you', 'open', 1,
    '<p>Fixes #42.</p><p>Edits made offline are now stored as a patch queue and merged field by field on reconnect. When both sides changed the same field, the newer timestamp wins and the other value is kept in history.</p><ul><li>New <code>PatchQueue</code> in <code>src/sync/queue.ts</code></li><li>Merge logic with tests</li></ul>',
    [['sync', '1d76db']], { pr: true });
  cm(p45, 'mira', 0.5, '<p>Tested on my phone, the title edit survives now. One nit on the timestamp comparison.</p>');
  add('you/trail-notes', 39, 'Tag chips are hard to read in dark mode', 'lin', 'closed', 50, '<p>The grey chips almost vanish on the dark background.</p>', [['design', 'c5def5']]);
  add('you/trail-notes', 44, 'Export a trip as GPX', 'devansh', 'open', 26, '<p>Would love to bring my routes into other map apps.</p>', [['enhancement', 'a2eeef']]);
  add('you/trail-notes', 41, 'Upgrade to Vite 6', 'lin', 'closed', 90, '<p>Bumps the build tooling.</p>', [], { pr: true, _merged: true });
  add('you/pocket-ledger', 88, 'Rounding error when splitting 3 ways', 'mira', 'open', 8, '<p>Splitting ₹100 three ways gives ₹99.99 total.</p>', [['bug', 'd73a4a']]);
  add('you/pocket-ledger', 90, 'Add CSV import for bank statements', 'you', 'open', 12, '<p>First pass at importing HDFC and SBI statement formats.</p>', [['enhancement', 'a2eeef']], { pr: true, _draft: true });
  add('lin/tiny-sync', 31, 'Expose a hook for custom conflict resolution', 'you', 'open', 30, '<p>I need field-level merge for my app. Could the resolver be pluggable?</p>', [['question', 'd876e3']]);

  const PR_META = {
    'you/trail-notes#45': { head: 'fix/offline-merge', base: 'main', additions: 184, deletions: 37, changed_files: 3, commits: 4, mergeable: true },
    'you/trail-notes#41': { head: 'chore/vite-6', base: 'main', additions: 12, deletions: 14, changed_files: 2, commits: 1, mergeable: null },
    'you/pocket-ledger#90': { head: 'feat/csv-import', base: 'main', additions: 402, deletions: 3, changed_files: 6, commits: 9, mergeable: true },
  };
  const PATCH_QUEUE = `@@ -0,0 +1,22 @@
+import { Entry, Patch } from '../types';
+
+export class PatchQueue {
+  private patches: Patch[] = [];
+
+  push(entryId: string, field: keyof Entry, value: unknown) {
+    this.patches.push({ entryId, field, value, at: Date.now() });
+  }
+
+  merge(remote: Entry, local: Entry): Entry {
+    const out = { ...remote };
+    for (const p of this.patches.filter((x) => x.entryId === local.id)) {
+      const remoteAt = remote.updatedAt[p.field] ?? 0;
+      if (p.at >= remoteAt) out[p.field] = p.value as never;
+      else out.history.push({ field: p.field, value: p.value });
+    }
+    return out;
+  }
+
+  clear() { this.patches = []; }
+}`;
  const PATCH_SYNC = `@@ -18,11 +18,14 @@ export async function syncEntries(db: Db) {
   const remote = await fetchRemote();
   for (const entry of remote) {
     const local = await db.get(entry.id);
-    if (local && local.dirty) {
-      await flush(local);
-    }
-    await db.put(entry);
+    if (local && local.dirty) {
+      const merged = queue.merge(entry, local);
+      await db.put(merged);
+      await push(merged);
+    } else {
+      await db.put(entry);
+    }
   }
+  queue.clear();
 }`;
  const FILES = {
    'you/trail-notes#45': [
      { filename: 'src/sync/queue.ts', status: 'added', additions: 22, deletions: 0, patch: PATCH_QUEUE },
      { filename: 'src/sync/index.ts', status: 'modified', additions: 8, deletions: 4, patch: PATCH_SYNC },
      { filename: 'src/sync/queue.test.ts', status: 'added', additions: 154, deletions: 0, patch: '@@ -0,0 +1,6 @@\n+import { PatchQueue } from \'./queue\';\n+\n+test(\'local edit wins when newer\', () => {\n+  const q = new PatchQueue();\n+  // ...\n+});' },
    ],
  };

  const NOTIFS = [
    { id: 'n1', unread: true, reason: 'comment', updated_at: ago(0.5), repository: REPOS[0], subject: { type: 'PullRequest', title: p45.title, url: API + '/repos/you/trail-notes/pulls/45' } },
    { id: 'n2', unread: true, reason: 'author', updated_at: ago(1), repository: REPOS[0], subject: { type: 'Issue', title: i42.title, url: API + '/repos/you/trail-notes/issues/42' } },
    { id: 'n3', unread: true, reason: 'review_requested', updated_at: ago(5), repository: OTHER[1], subject: { type: 'PullRequest', title: 'Batch writes during initial sync', url: API + '/repos/lin/tiny-sync/pulls/33' } },
    { id: 'n4', unread: true, reason: 'mention', updated_at: ago(8), repository: REPOS[1], subject: { type: 'Issue', title: 'Rounding error when splitting 3 ways', url: API + '/repos/you/pocket-ledger/issues/88' } },
    { id: 'n5', unread: false, reason: 'ci_activity', updated_at: ago(20), repository: REPOS[2], subject: { type: 'CheckSuite', title: 'CI failed on main: lint', url: null } },
    { id: 'n6', unread: false, reason: 'subscribed', updated_at: ago(40), repository: OTHER[0], subject: { type: 'Release', title: 'tilekit v3.2.0', url: null } },
  ];

  const TREE = {
    'you/trail-notes': {
      '': [['src', 'dir'], ['public', 'dir'], ['README.md', 'file', 1840], ['package.json', 'file', 712], ['tsconfig.json', 'file', 302], ['LICENSE', 'file', 1067]],
      'src': [['sync', 'dir'], ['ui', 'dir'], ['main.ts', 'file', 640], ['types.ts', 'file', 410]],
      'src/sync': [['index.ts', 'file', 1210], ['queue.ts', 'file', 690]],
      'src/ui': [['entry-card.ts', 'file', 2100], ['theme.css', 'file', 880]],
      'public': [['icon.svg', 'file', 420]],
    },
  };
  const FILE_TEXT = {
    'package.json': '{\n  "name": "trail-notes",\n  "version": "0.9.2",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "test": "vitest"\n  },\n  "dependencies": {\n    "idb": "^8.0.0"\n  }\n}\n',
    'src/types.ts': "export interface Entry {\n  id: string;\n  title: string;\n  body: string;\n  tags: string[];\n  updatedAt: Partial<Record<keyof Entry, number>>;\n  history: { field: keyof Entry; value: unknown }[];\n}\n\nexport interface Patch {\n  entryId: string;\n  field: keyof Entry;\n  value: unknown;\n  at: number;\n}\n",
    'src/main.ts': "import { syncEntries } from './sync';\nimport { openDb } from './db';\n\nconst db = await openDb();\nwindow.addEventListener('online', () => syncEntries(db));\n",
  };
  const README = '<h1>trail-notes</h1><p>An offline-first field journal for hikers. Write notes, tag sightings and log routes with no signal; everything syncs when you reconnect.</p><h2>Features</h2><ul><li>Works fully offline as an installable PWA</li><li>Field-level merge of offline edits</li><li>Tags, photos and GPS breadcrumbs</li></ul><h2>Getting started</h2><pre><code>npm install\nnpm run dev</code></pre><p>This README is sample data.</p>';

  const COMMITS = [
    ['a91f3c2', 'Merge field-level patches on reconnect', 'you', 1],
    ['77be019', 'Add PatchQueue with tests', 'you', 3],
    ['c03d8e1', 'Fix tag chip contrast in dark mode', 'lin', 48],
    ['5e2a9b4', 'Upgrade to Vite 6', 'lin', 90],
    ['1bd7f60', 'Store GPS breadcrumbs per entry', 'you', 140],
  ].map(([sha, msg, who, h]) => ({ sha: sha + '0'.repeat(33), commit: { message: msg, author: { name: PEOPLE[who] || 'Sample User', date: ago(h) } }, author: u(who), html_url: '#' }));

  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const notFound = () => { const e = new Error('Not found in the sample data.'); e.status = 404; throw e; };
  const findIssue = (repo, n) => (ISSUES[repo] || []).find((i) => i.number === +n) || notFound();
  const strip = (i) => { const { _comments, ...rest } = i; return rest; };
  const searchQ = (q) => decodeURIComponent((q.match(/q=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ');

  async function mock(path, o = {}) {
    await sleep(120 + Math.random() * 160);
    const m = o.method || 'GET';
    const [p, q = ''] = path.split('?');
    let r;
    if (p === '/user') return ME;
    if (p === '/user/repos') return REPOS;
    if (p === '/user/starred') return ALL_REPOS.filter((x) => starred.has(x.full_name));
    if ((r = p.match(/^\/user\/starred\/([^/]+)\/([^/]+)$/))) {
      const k = r[1] + '/' + r[2];
      if (m === 'PUT') { starred.add(k); return true; }
      if (m === 'DELETE') { starred.delete(k); return true; }
      return starred.has(k) ? true : notFound();
    }
    if ((r = p.match(/^\/users\/([^/]+)\/repos$/))) return ALL_REPOS.filter((x) => x.owner.login === r[1]);
    if ((r = p.match(/^\/users\/([^/]+)$/))) return r[1] === 'you' ? ME : { ...ME, login: r[1], name: PEOPLE[r[1]] || r[1], bio: 'Sample collaborator.', public_repos: 3 };
    if (p === '/notifications') {
      if (m === 'PUT') { NOTIFS.forEach((n) => (n.unread = false)); return true; }
      return /all=true/.test(q) ? NOTIFS : NOTIFS.filter((n) => n.unread);
    }
    if ((r = p.match(/^\/notifications\/threads\/(.+)$/))) { const n = NOTIFS.find((x) => x.id === r[1]); if (n) n.unread = false; return true; }
    if (p === '/search/issues') {
      const s = searchQ(q); const wantPr = /is:pr/.test(s); const wantOpen = /is:open/.test(s);
      const words = s.split(' ').filter((w) => w && !w.includes(':')).join(' ').toLowerCase();
      const items = Object.values(ISSUES).flat().filter((i) => (!/is:(pr|issue)/.test(s) || !!i.pull_request === wantPr) && (!wantOpen || i.state === 'open') && (!words || i.title.toLowerCase().includes(words)));
      return { total_count: items.length, items: items.map(strip) };
    }
    if (p === '/search/repositories') { const s = searchQ(q).toLowerCase(); const items = ALL_REPOS.filter((x) => (x.full_name + ' ' + (x.description || '')).toLowerCase().includes(s)); return { total_count: items.length, items }; }
    if (p === '/search/users') { const s = searchQ(q).toLowerCase(); const items = ['you', 'mira', 'devansh', 'lin'].filter((l) => l.includes(s) || (PEOPLE[l] || '').toLowerCase().includes(s)).map(u); return { total_count: items.length, items }; }

    if ((r = p.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/))) {
      const full = r[1] + '/' + r[2]; const rest = r[3] || '';
      const repo = ALL_REPOS.find((x) => x.full_name === full);
      if (!rest) return repo || notFound();
      if (rest === '/readme') return full === 'you/trail-notes' ? README : '<p>' + ((repo && repo.description) || '') + '</p><p>This README is sample data.</p>';
      if (rest === '/issues' && m === 'GET') { const st = (q.match(/state=(\w+)/) || [])[1] || 'open'; return (ISSUES[full] || []).filter((i) => st === 'all' || i.state === st).map(strip); }
      if (rest === '/pulls') { const st = (q.match(/state=(\w+)/) || [])[1] || 'open'; return (ISSUES[full] || []).filter((i) => i.pull_request && (st === 'all' || i.state === st)).map((i) => ({ ...strip(i), draft: !!i._draft, merged_at: i._merged ? i.closed_at : null, head: { ref: (PR_META[full + '#' + i.number] || {}).head || 'feature' }, base: { ref: 'main' } })); }
      if ((r = rest.match(/^\/issues\/(\d+)$/))) {
        const it = findIssue(full, r[1]);
        if (m === 'PATCH') { Object.assign(it, o.body, { closed_at: o.body.state === 'closed' ? new Date().toISOString() : null }); }
        return strip(it);
      }
      if ((r = rest.match(/^\/issues\/(\d+)\/comments$/))) {
        const it = findIssue(full, r[1]);
        if (m === 'POST') { const esc = o.body.body.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); cm(it, 'you', 0, '<p>' + esc.replace(/\n/g, '<br>') + '</p>'); return true; }
        return it._comments;
      }
      if ((r = rest.match(/^\/pulls\/(\d+)$/))) {
        const it = findIssue(full, r[1]); const meta = PR_META[full + '#' + r[1]] || { head: 'feature', base: 'main', additions: 20, deletions: 4, changed_files: 1, commits: 1, mergeable: true };
        return { ...strip(it), draft: !!it._draft, merged: !!it._merged, merged_at: it._merged ? it.closed_at : null, mergeable: meta.mergeable, head: { ref: meta.head }, base: { ref: meta.base }, additions: meta.additions, deletions: meta.deletions, changed_files: meta.changed_files, commits: meta.commits };
      }
      if ((r = rest.match(/^\/pulls\/(\d+)\/files$/))) return FILES[full + '#' + r[1]] || [{ filename: 'README.md', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1,3 +1,3 @@\n # Project\n-Old line in the sample data\n+New line in the sample data\n ' }];
      if ((r = rest.match(/^\/pulls\/(\d+)\/merge$/))) { const it = findIssue(full, r[1]); it._merged = true; it.state = 'closed'; it.closed_at = new Date().toISOString(); return { merged: true }; }
      if (rest.startsWith('/contents')) {
        const fp = decodeURIComponent(rest.replace(/^\/contents\/?/, ''));
        const tree = TREE[full] || { '': [['README.md', 'file', 400]] };
        if (tree[fp]) return tree[fp].map(([name, type, size]) => ({ name, type, size: size || 0, path: (fp ? fp + '/' : '') + name }));
        const name = fp.split('/').pop();
        const text = fp === 'README.md' ? '# ' + r[2] + '\n\nSample README contents.\n' : FILE_TEXT[fp] || '// ' + fp + '\n// File contents are sample data.\n';
        return { type: 'file', name, path: fp, size: text.length, encoding: 'base64', content: b64(text) };
      }
      if (rest === '/commits') return COMMITS;
      if ((r = rest.match(/^\/commits\/(\w+)$/))) { const c = COMMITS.find((x) => x.sha === r[1]) || COMMITS[0]; return { ...c, stats: { additions: 30, deletions: 4 }, files: FILES['you/trail-notes#45'].slice(0, 2) }; }
      if (rest === '/languages') return { TypeScript: 82000, CSS: 9000, HTML: 3000 };
    }
    return notFound();
  }

  window.GH = {
    request(path, o = {}, session) {
      return session.demo ? mock(path, o) : live(path, { ...o, token: session.token });
    },
  };
})();
