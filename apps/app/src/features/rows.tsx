import type { FeedEvent, Issue, Repo } from '@gitling/github';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { rel, repoOf, short } from '@/lib/format';
import { openUrl, routes } from '@/lib/links';
import { Icon } from '@/ui/Icon';
import { Avatar, Num, Panel, T } from '@/ui/primitives';

export function stateOf(it: Issue) {
  const isPr = !!it.pull_request;
  if (isPr && it.pull_request?.merged_at) return { k: 'merged', label: 'Merged', icon: 'git-merge' } as const;
  if (it.state === 'closed') return { k: isPr ? 'bad' : 'merged', label: 'Closed', icon: isPr ? 'circle-x' : 'circle-check' } as const;
  if (isPr && it.draft) return { k: 'mut', label: 'Draft', icon: 'git-pull-request' } as const;
  return { k: 'ok', label: 'Open', icon: isPr ? 'git-pull-request' : 'circle-dot' } as const;
}

export function openIssue(it: Issue) {
  const [owner, repo] = repoOf(it.repository_url).split('/');
  router.push(routes.thread(owner, repo, it.number));
}

export function IssueRow({ it, note }: { it: Issue; note?: string }) {
  const t = useTokens(); const st = stateOf(it);
  return (
    <Pressable onPress={() => openIssue(it)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: t.rowPad, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={st.icon} size={17} color={t.c[st.k]} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <T v="title" lines={1}>{it.title}</T>
        <T v="monoS" c="mut" lines={1}>{repoOf(it.repository_url)} #{it.number}{note ? ` · ${note}` : ''}</T>
      </View>
      <T v="mono" c="mut">{rel(it.updated_at)}</T>
    </Pressable>
  );
}

export function RepoRow({ r }: { r: Repo }) {
  const t = useTokens();
  return (
    <Pressable onPress={() => { const [o, n] = r.full_name.split('/'); router.push(routes.repo(o, n)); }}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: t.rowPad, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={r.private ? 'lock' : 'book-marked'} size={17} color={t.c.mut} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <T v="title" lines={1}>{r.name}</T>
        <T v="monoS" c="mut" lines={1}>{r.language ? `${r.language} · ` : ''}★ {short(r.stargazers_count)} · {r.open_issues_count} open</T>
      </View>
      <T v="mono" c="mut">{rel(r.pushed_at)}</T>
    </Pressable>
  );
}

/* ---------- feed ---------- */
const EVENT_BADGE: Record<string, [string, 'acc' | 'wait' | 'ok' | 'fg' | 'mut' | 'merged']> = {
  ReleaseEvent: ['tag', 'acc'], WatchEvent: ['star', 'wait'], PushEvent: ['git-commit-horizontal', 'ok'], CreateEvent: ['book-plus', 'fg'],
  ForkEvent: ['git-fork', 'mut'], PullRequestEvent: ['git-pull-request', 'ok'], IssuesEvent: ['circle-dot', 'ok'],
};

/** Opens what a feed event is about: the PR/issue, the release, the fork, or the repo. */
function openFeedEvent(e: FeedEvent) {
  const [owner, name] = e.repo.name.split('/');
  const n = e.payload.pull_request?.number ?? e.payload.issue?.number;
  if (n) return router.push(routes.thread(owner, name, n));
  if (e.payload.release?.html_url) return openUrl(e.payload.release.html_url);
  if (e.payload.forkee) { const [fo, fn] = e.payload.forkee.full_name.split('/'); return router.push(routes.repo(fo, fn)); }
  router.push(routes.repo(owner, name));
}

/** Consecutive events of the same type by the same person collapse into one item. */
export type FeedGroup = { key: string; type: string; actor: string; events: FeedEvent[] };
export function groupFeed(events: FeedEvent[]): FeedGroup[] {
  const out: FeedGroup[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && last.type === e.type && last.actor === e.actor.login && e.type === 'WatchEvent') last.events.push(e);
    else out.push({ key: e.id, type: e.type, actor: e.actor.login, events: [e] });
  }
  return out;
}

function Head({ g, children }: { g: FeedGroup; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <T v="sub" c="mut" style={{ flex: 1 }}>{children}</T>
      <T v="mono" c="mut">{rel(g.events[0].created_at)}</T>
    </View>
  );
}
function B({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return <T v="sub" style={{ fontFamily: t.font.ui.semibold }}>{children}</T>;
}

export function FeedItem({ g, compact }: { g: FeedGroup; compact?: boolean }) {
  const t = useTokens(); const e = g.events[0]; const [icon, col] = EVENT_BADGE[g.type] ?? ['activity', 'mut'];
  let head: React.ReactNode; let body: React.ReactNode = null;
  switch (g.type) {
    case 'ReleaseEvent': {
      const rel_ = e.payload.release!;
      head = <><B>{e.repo.name}</B> published a release</>;
      if (!compact) body = (
        <Panel style={{ marginTop: 9 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 11, paddingVertical: 8, borderBottomWidth: 1, borderColor: t.c.line }}><T v="monoS" c="mut">release</T><T v="monoS" c="mut">{rel_.tag_name}</T></View>
          <View style={{ padding: 12, gap: 8 }}>
            <Num value={rel_.tag_name.replace(/^v/, '')} size={32} />
            {rel_.body ? <T v="sub" c="mut" lines={2}>{rel_.body.split('\n')[0]}</T> : null}
          </View>
        </Panel>
      );
      break;
    }
    case 'WatchEvent':
      head = g.events.length > 1 ? <><B>{g.actor}</B> starred {g.events.length} repositories</> : <><B>{g.actor}</B> starred <B>{e.repo.name}</B></>;
      if (!compact && g.events.length > 1) body = (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 9 }}>
          {g.events.map((x) => <View key={x.id} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: t.c.el, borderWidth: 1, borderColor: t.c.line }}><T v="mono">{x.repo.name}</T></View>)}
        </ScrollView>
      );
      break;
    case 'PushEvent': {
      // Since 2025 GitHub's events API leaves commits and size out of push events: say where, not "0 commits".
      const commits = e.payload.commits ?? []; const n = e.payload.size ?? commits.length;
      const branch = e.payload.ref?.replace(/^refs\/heads\//, '');
      const where = <><B>{e.repo.name.split('/')[1]}</B>{branch ? <> · {branch}</> : null}</>;
      head = n > 0 ? <><B>{g.actor}</B> pushed {n} commit{n === 1 ? '' : 's'} to {where}</> : <><B>{g.actor}</B> pushed to {where}</>;
      if (!compact) body = (
        <View style={{ marginTop: 9, borderLeftWidth: 2, borderColor: t.c.line2, paddingLeft: 11, gap: 6 }}>
          {commits.slice(0, 2).map((c) => <T key={c.sha} v="sub" lines={1}><T v="monoS" c="ok">{c.sha.slice(0, 7)}  </T>{c.message.split('\n')[0]}</T>)}
          {n > 2 ? <T v="monoS" c="mut">{n - 2} more</T> : null}
        </View>
      );
      break;
    }
    case 'CreateEvent':
      head = e.payload.ref_type === 'repository'
        ? <><B>{g.actor}</B> created a repository</>
        : <><B>{g.actor}</B> created {e.payload.ref_type ?? 'branch'} {e.payload.ref ? <B>{e.payload.ref}</B> : null} in <B>{e.repo.name}</B></>;
      if (!compact && e.payload.ref_type === 'repository') body = (
        <Panel style={{ marginTop: 9, padding: 12, gap: 4 }}>
          <T v="bodyStrong">{e.repo.name.split('/')[1]}</T>
          {e.payload.description ? <T v="sub" c="mut">{e.payload.description}</T> : null}
        </Panel>
      );
      break;
    case 'IssueCommentEvent': head = <><B>{g.actor}</B> commented in <B>{e.repo.name}</B></>;
      if (!compact && e.payload.issue) body = <T v="sub" style={{ marginTop: 6 }} lines={2}>{e.payload.issue.title}</T>; break;
    case 'ForkEvent': head = <><B>{g.actor}</B> forked <B>{e.repo.name}</B></>; break;
    case 'PullRequestEvent': head = <><B>{g.actor}</B> {e.payload.action} a pull request in <B>{e.repo.name}</B></>;
      if (!compact && e.payload.pull_request) body = <T v="sub" style={{ marginTop: 6 }}>{e.payload.pull_request.title}</T>; break;
    case 'IssuesEvent': head = <><B>{g.actor}</B> {e.payload.action} an issue in <B>{e.repo.name}</B></>;
      if (!compact && e.payload.issue) body = <T v="sub" style={{ marginTop: 6 }}>{e.payload.issue.title}</T>; break;
    case 'DeleteEvent': head = <><B>{g.actor}</B> deleted {e.payload.ref_type === 'tag' ? 'tag' : 'branch'} {e.payload.ref ? <B>{e.payload.ref}</B> : null} in <B>{e.repo.name}</B></>; break;
    default: head = <><B>{g.actor}</B> {g.type.replace(/Event$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} in <B>{e.repo.name}</B></>;
  }
  return (
    <Pressable onPress={() => openFeedEvent(e)}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: t.rowPad + 2, opacity: pressed ? 0.7 : 1 })}>
      <Avatar login={g.actor} size={36} badge={icon} badgeColor={t.c[col]} />
      <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
        <Head g={g}>{head}</Head>
        {body}
      </View>
    </Pressable>
  );
}
