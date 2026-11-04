import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { useReadme, useRepo, useStar } from '@/data/queries';
import { LANG, rel, short } from '@/lib/format';
import { routes } from '@/lib/links';
import { Icon } from '@/ui/Icon';
import { Markdown } from '@/ui/Markdown';
import { BackHeader, ErrorNote, Loading, Panel, Row, Screen, T } from '@/ui/primitives';

/** Repository home: header, stats, Code / Issues / Pull requests, README. */
export default function RepoScreen() {
  const t = useTokens();
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const repo = useRepo(owner, name);
  const readme = useReadme(owner, name);
  const star = useStar(`${owner}/${name}`);
  const r = repo.data;

  const header = <BackHeader title={`${owner}/${name}`} right={r ? <Pressable onPress={() => Linking.openURL(r.html_url)} hitSlop={10} accessibilityLabel="Open on GitHub"><Icon name="arrow-up-right" size={20} color={t.c.mut} /></Pressable> : null} />;
  if (repo.isLoading) return <Screen header={header}><Loading /></Screen>;
  if (repo.error || !r) return <Screen header={header}><ErrorNote error={repo.error} onRetry={() => repo.refetch()} /></Screen>;

  return (
    <Screen header={header}>
      <View style={{ paddingHorizontal: 18, gap: 8 }}>
        <Pressable onPress={() => router.push(routes.user(r.owner.login))}><T v="mono" c="mut">{r.owner.login}</T></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T v="h2" style={{ flexShrink: 1 }}>{r.name}</T>
          {r.private ? <Icon name="lock" size={16} color={t.c.mut} /> : null}
        </View>
        {r.description ? <T v="body" c="mut">{r.description}</T> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 2 }}>
          {r.language ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: LANG[r.language] ?? t.c.mut }} /><T v="monoS" c="mut">{r.language}</T></View> : null}
          <T v="monoS" c="mut">★ {short(r.stargazers_count)}</T>
          <T v="monoS" c="mut">⑂ {short(r.forks_count)}</T>
          <T v="monoS" c="mut">pushed {rel(r.pushed_at)}</T>
          {r.archived ? <T v="monoS" c="wait">archived</T> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable onPress={star.toggle} disabled={!star.known} accessibilityRole="button" accessibilityState={{ selected: star.starred }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: star.starred ? t.c.fg : t.c.el2, opacity: pressed ? 0.7 : 1 })}>
            <Icon name="star" size={16} color={star.starred ? t.c.bg : t.c.fg} />
            <T v="bodyStrong" style={{ fontSize: 14, color: star.starred ? t.c.bg : t.c.fg }}>{star.starred ? 'Starred' : 'Star'}</T>
          </Pressable>
        </View>
        {star.error ? <T v="sub" c="bad">{(star.error as Error).message}</T> : null}
      </View>

      <Panel style={{ marginHorizontal: 14, marginTop: 16, paddingVertical: 4 }}>
        <Row icon="code" title="Code" sub={r.default_branch} onPress={() => router.push(routes.tree(owner, name, '', r.default_branch))} />
        <Row icon="circle-dot" iconColor={t.c.ok} title="Issues" onPress={() => router.push(routes.list(owner, name, 'issues'))} />
        <Row icon="git-pull-request" iconColor={t.c.ok} title="Pull requests" onPress={() => router.push(routes.list(owner, name, 'pulls'))} />
      </Panel>

      <View style={{ paddingHorizontal: 18, marginTop: 22 }}>
        {readme.isLoading ? <Loading rows={2} /> : readme.data ? (
          <View style={{ gap: 10 }}>
            <T v="label" c="mut">README</T>
            <Markdown source={readme.data} base={{ owner, repo: name, ref: r.default_branch }} />
          </View>
        ) : readme.error ? <ErrorNote error={readme.error} onRetry={() => readme.refetch()} /> : <T v="sub" c="mut">No README.</T>}
      </View>
    </Screen>
  );
}
