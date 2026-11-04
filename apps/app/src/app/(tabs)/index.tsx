import type { SectionId } from '@gitling/design';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useDesign } from '@/design/DesignProvider';
import { useFeed, useMe, useMyRepos, useNotifications, useRuns, useSearchIssues } from '@/data/queries';
import { FeedItem, groupFeed, IssueRow, RepoRow } from '@/features/rows';
import { TileView } from '@/features/tiles/TileView';
import { pad2 } from '@/lib/format';
import { useSession } from '@/session/SessionProvider';
import { Icon } from '@/ui/Icon';
import { Avatar, Empty, Loading, Num, Panel, Screen, SectionLabel, T, Ticks } from '@/ui/primitives';

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

function Needs() {
  const q = useSearchIssues('is:open involves:@me archived:false', 4);
  return (
    <>
      <SectionLabel title="needs you" action="See all" onAction={() => router.push({ pathname: '/search', params: { q: 'is:open involves:@me archived:false', title: 'Involves you', kind: 'issues' } })} />
      {q.isLoading ? <Loading rows={2} /> : q.data?.items.length ? q.data.items.map((it) => <IssueRow key={it.repository_url + it.number} it={it} />) : <Empty title="✓ nothing waiting" />}
    </>
  );
}

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

const SECTION: Record<SectionId, () => React.ReactNode> = { status: StatusPanel, shortcuts: Shortcuts, needs: Needs, feed: FeedPreview, inbox: InboxPreview, recent: Recent };

export default function Home() {
  const { design, tokens: t } = useDesign();
  const me = useMe(); const { isSample } = useSession();
  return (
    <Screen header={
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.push('/search')} style={{ flex: 1, height: 40, borderRadius: 13, backgroundColor: t.c.el2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <Icon name="search" size={17} color={t.c.mut} /><T v="body" c="mut">Search or jump to…</T>
        </Pressable>
        <Pressable onPress={() => router.push('/account')} accessibilityLabel="Account"><Avatar login={me.data?.login ?? '?'} size={32} /></Pressable>
      </View>
    }>
      {isSample ? (
        <Pressable onPress={() => router.push('/account')} style={{ marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: t.c.accSoft, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T v="sub">Showing sample data</T><T v="bodyStrong" c="acc" style={{ fontSize: 14 }}>Connect GitHub</T>
        </Pressable>
      ) : null}
      {design.home.sections.filter((s) => s.visible).map((s) => { const C = SECTION[s.id]; return <View key={s.id}><C /></View>; })}
      <Pressable onPress={() => router.navigate({ pathname: '/studio', params: { tab: 'home' } })} style={{ alignSelf: 'center', marginTop: 26, paddingHorizontal: 14, paddingVertical: 8 }}>
        <T v="mono" c="mut">edit home layout</T>
      </Pressable>
    </Screen>
  );
}
