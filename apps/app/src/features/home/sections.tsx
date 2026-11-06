import { isSearchSection, type HomeSection, type SectionId } from '@gitling/design';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useDesign } from '@/design/DesignProvider';
import { useFeed, useMe, useMyRepos, useNotifications, useRuns, useSearchIssues, useStarred } from '@/data/queries';
import { FeedItem, groupFeed, IssueRow, RepoRow } from '@/features/rows';
import { TileView } from '@/features/tiles/TileView';
import { pad2, rel } from '@/lib/format';
import { openUrl } from '@/lib/links';
import { Icon } from '@/ui/Icon';
import { Empty, Loading, Num, Panel, Row, SectionLabel, T, Ticks } from '@/ui/primitives';

/**
 * Everything Home can show. Built-in sections appear at most once; "search" sections (any GitHub issue/PR search,
 * with your own title) can be added several times. Studio and the welcome tour list this catalog to add from.
 */
export type SectionInfo = { name: string; blurb: string; icon: string };
export const SECTIONS: Record<SectionId, SectionInfo> = {
  status: { name: 'Status instrument', blurb: 'what needs you, at a glance, plus recent checks', icon: 'zap' },
  shortcuts: { name: 'Shortcuts', blurb: 'your tiles: searches, repos, files, links', icon: 'sparkles' },
  needs: { name: 'Needs you', blurb: 'open issues and PRs you’re involved in', icon: 'circle-dot' },
  reviews: { name: 'Review requests', blurb: 'pull requests waiting for your review', icon: 'eye' },
  'my-prs': { name: 'Your pull requests', blurb: 'open PRs you wrote', icon: 'git-pull-request' },
  assigned: { name: 'Assigned to you', blurb: 'open issues and PRs assigned to you', icon: 'user' },
  mentions: { name: 'Mentions', blurb: 'open threads that mention you', icon: 'at-sign' },
  inbox: { name: 'Inbox preview', blurb: 'your latest unread notifications', icon: 'inbox' },
  feed: { name: 'From your feed', blurb: 'recent activity from people and repos you follow', icon: 'users' },
  recent: { name: 'Recent repositories', blurb: 'the repos you pushed to last', icon: 'book-marked' },
  starred: { name: 'Starred repositories', blurb: 'repos you starred', icon: 'star' },
  checks: { name: 'Recent checks', blurb: 'the latest workflow runs of your last-pushed repo', icon: 'activity' },
};
/** The order "Add to Home" lists built-ins in (grouped by kind, not schema order). */
export const SECTION_ORDER: SectionId[] = ['status', 'shortcuts', 'needs', 'reviews', 'my-prs', 'assigned', 'mentions', 'inbox', 'feed', 'recent', 'starred', 'checks'];

export const sectionName = (s: HomeSection) => (isSearchSection(s) ? s.title : SECTIONS[s.id].name);

/** Search presets for the custom section form: common searches people pin. */
export const SEARCH_IDEAS: { title: string; q: string }[] = [
  { title: 'Bugs I’m in', q: 'is:open label:bug involves:@me archived:false' },
  { title: 'Drafts I wrote', q: 'is:open is:pr draft:true author:@me' },
  { title: 'Good first issues', q: 'is:open is:issue label:"good first issue" archived:false' },
  { title: 'Merged this week', q: 'is:pr is:merged author:@me sort:updated-desc' },
];

function StatusPanel() {
  const reviews = useSearchIssues('is:open is:pr review-requested:@me archived:false', 1);
  const assigned = useSearchIssues('is:open assignee:@me archived:false', 1);
  const mentions = useSearchIssues('is:open mentions:@me archived:false', 1);
  const open = useSearchIssues('is:open involves:@me archived:false', 1);
  const repos = useMyRepos();
  const repo = repos.data?.[0]?.full_name;
  const runs = useRuns(repo);
  const n = (q: typeof reviews) => q.data?.total_count ?? 0;
  const need = n(reviews) + n(mentions);
  const ticks = (runs.data?.workflow_runs ?? []).slice(0, 24).reverse().map((r) => (r.conclusion === 'success' ? 'ok' : r.conclusion ? 'bad' : 'none') as 'ok' | 'bad' | 'none');
  while (ticks.length < 24) ticks.push('none');
  const done = ticks.filter((x) => x !== 'none');
  const pct = done.length ? Math.round((done.filter((x) => x === 'ok').length / done.length) * 100) : null;
  return (
    <Panel style={{ marginHorizontal: 14, marginTop: 6, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ gap: 10 }}>
          <Num value={pad2(need)} size={72} />
          <T v="title">need you <T v="title" c="mut">· {n(open)} open</T></T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {([['reviews', reviews], ['assigned', assigned], ['mentions', mentions]] as const).map(([l, q]) => (
            <T key={l} v="mono" c="mut">{l}  <T v="mono">{n(q)}</T></T>
          ))}
        </View>
      </View>
      <View style={{ gap: 7 }}>
        <Ticks values={ticks} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T v="monoS" c="mut" lines={1} style={{ flex: 1 }}>checks · {repo ? repo.split('/')[1] : '—'} · last 24 runs</T>
          <T v="monoS" c="mut">{pct == null ? 'no runs' : `${pct}% passing`}</T>
        </View>
      </View>
    </Panel>
  );
}

function Shortcuts() {
  const { design, tokens: t } = useDesign();
  return (
    <>
      <SectionLabel title="shortcuts" action="Edit" onAction={() => router.navigate({ pathname: '/studio', params: { tab: 'tiles' } })} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14 }}>
        {design.tiles.map((tile) => <TileView key={tile.id} tile={tile} onLongPress={() => router.push({ pathname: '/tile/[id]', params: { id: tile.id } })} />)}
        <Pressable onPress={() => router.push({ pathname: '/tile/[id]', params: { id: 'new' } })} accessibilityRole="button" accessibilityLabel="New shortcut"
          style={{ width: '48.6%', minHeight: 64, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.line2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
          <Icon name="plus" size={16} color={t.c.mut} /><T v="sub" c="mut">New shortcut</T>
        </Pressable>
      </View>
    </>
  );
}

/** Up to four results of a search, with "See all" opening the full search. Used by built-ins and search sections. */
export function SearchList({ title, q, empty = '✓ nothing here' }: { title: string; q: string; empty?: string }) {
  const r = useSearchIssues(q, 4);
  return (
    <>
      <SectionLabel title={title.toLowerCase()} action={r.data?.total_count ? `See all ${r.data.total_count}` : 'See all'}
        onAction={() => router.push({ pathname: '/search', params: { q, title, kind: 'issues' } })} />
      {r.isLoading ? <Loading rows={2} />
        : r.isError ? <Empty title="couldn’t load this search" body={(r.error as Error).message} />
          : r.data?.items.length ? r.data.items.map((it) => <IssueRow key={it.repository_url + it.number} it={it} />) : <Empty title={empty} />}
    </>
  );
}

const search = (title: string, q: string, empty?: string) => function Search() { return <SearchList title={title} q={q} empty={empty} />; };

function FeedPreview() {
  const me = useMe(); const q = useFeed(me.data?.login);
  return (
    <>
      <SectionLabel title="from your feed" action="Open" onAction={() => router.navigate('/feed')} />
      {groupFeed(q.data ?? []).slice(0, 3).map((g) => <FeedItem key={g.key} g={g} compact />)}
    </>
  );
}

function InboxPreview() {
  const q = useNotifications(false);
  return (
    <>
      <SectionLabel title="inbox" action={q.data?.length ? `${q.data.length} unread` : 'Open'} onAction={() => router.navigate('/inbox')} />
      {q.data && !q.data.length ? <Empty title="✓ inbox zero" /> : null}
      {(q.data ?? []).slice(0, 3).map((n) => (
        <View key={n.id} style={{ paddingHorizontal: 18, paddingVertical: 8 }}>
          <T v="title" lines={1}>{n.subject.title}</T><T v="monoS" c="mut">{n.repository.full_name}</T>
        </View>
      ))}
    </>
  );
}

function Recent() {
  const q = useMyRepos();
  return (
    <>
      <SectionLabel title="recent repositories" action="All" onAction={() => router.navigate('/repos')} />
      {(q.data ?? []).slice(0, 3).map((r) => <RepoRow key={r.full_name} r={r} />)}
    </>
  );
}

function Starred() {
  const q = useStarred();
  return (
    <>
      <SectionLabel title="starred" action="All" onAction={() => router.navigate('/repos')} />
      {q.isLoading ? <Loading rows={2} /> : q.data?.length ? q.data.slice(0, 3).map((r) => <RepoRow key={r.full_name} r={r} />) : <Empty title="no stars yet" />}
    </>
  );
}

function Checks() {
  const t = useDesign().tokens;
  const repos = useMyRepos();
  const repo = repos.data?.[0]?.full_name;
  const runs = useRuns(repo);
  const list = (runs.data?.workflow_runs ?? []).slice(0, 4);
  return (
    <>
      <SectionLabel title={`checks · ${repo ? repo.split('/')[1] : '—'}`} />
      {runs.isLoading || repos.isLoading ? <Loading rows={2} /> : list.length ? list.map((r, i) => {
        const ok = r.conclusion === 'success'; const running = !r.conclusion;
        return (
          <Row key={r.id ?? i} icon={running ? 'clock' : ok ? 'circle-check' : 'circle-x'} iconColor={running ? t.c.wait : ok ? t.c.ok : t.c.bad}
            title={r.name ?? 'Workflow run'} sub={[r.head_branch, r.created_at ? rel(r.created_at) : null].filter(Boolean).join(' · ')}
            trail={running ? 'running' : r.conclusion ?? undefined} mono onPress={r.html_url ? () => openUrl(r.html_url!) : undefined} />
        );
      }) : <Empty title="no workflow runs" />}
    </>
  );
}

const BUILT_IN: Record<SectionId, () => React.ReactNode> = {
  status: StatusPanel, shortcuts: Shortcuts, needs: search('needs you', 'is:open involves:@me archived:false', '✓ nothing waiting'),
  reviews: search('review requests', 'is:open is:pr review-requested:@me archived:false', '✓ no reviews waiting'),
  'my-prs': search('your pull requests', 'is:open is:pr author:@me archived:false', 'no open pull requests'),
  assigned: search('assigned to you', 'is:open assignee:@me archived:false', '✓ nothing assigned'),
  mentions: search('mentions', 'is:open mentions:@me archived:false', 'no open mentions'),
  feed: FeedPreview, inbox: InboxPreview, recent: Recent, starred: Starred, checks: Checks,
};

export function HomeSectionView({ section }: { section: HomeSection }) {
  if (isSearchSection(section)) return <SearchList title={section.title} q={section.q} />;
  const C = BUILT_IN[section.id];
  return <C />;
}
