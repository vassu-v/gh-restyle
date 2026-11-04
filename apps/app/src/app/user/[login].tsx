import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { useUser, useUserRepos } from '@/data/queries';
import { RepoRow } from '@/features/rows';
import { Icon } from '@/ui/Icon';
import { Avatar, BackHeader, Empty, ErrorNote, Loading, Num, Screen, SectionLabel, T } from '@/ui/primitives';

/** A person or organization: profile and their recently pushed repositories. */
export default function UserScreen() {
  const t = useTokens();
  const { login } = useLocalSearchParams<{ login: string }>();
  const user = useUser(login);
  const repos = useUserRepos(login);
  const u = user.data;
  const header = <BackHeader right={<Pressable onPress={() => Linking.openURL(`https://github.com/${login}`)} hitSlop={10} accessibilityLabel="Open on GitHub"><Icon name="arrow-up-right" size={20} color={t.c.mut} /></Pressable>} />;
  if (user.isLoading) return <Screen header={header}><Loading /></Screen>;
  if (user.error || !u) return <Screen header={header}><ErrorNote error={user.error} onRetry={() => user.refetch()} /></Screen>;
  return (
    <Screen header={header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }}>
        <Avatar login={u.login} size={60} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="h2" lines={1}>{u.name ?? u.login}</T>
          <T v="mono" c="mut">@{u.login}{u.type === 'Organization' ? ' · org' : ''}</T>
        </View>
      </View>
      {u.bio ? <T v="body" style={{ paddingHorizontal: 18, marginTop: 12 }}>{u.bio}</T> : null}
      {u.location || u.company ? <T v="monoS" c="mut" style={{ paddingHorizontal: 18, marginTop: 6 }}>{[u.company, u.location].filter(Boolean).join(' · ')}</T> : null}
      <View style={{ flexDirection: 'row', gap: 28, paddingHorizontal: 18, marginTop: 16 }}>
        {[['repos', u.public_repos], ['followers', u.followers], ['following', u.following]].map(([k, v]) => v !== undefined ? (
          <View key={k as string}><Num value={v as number} size={26} /><T v="monoS" c="mut">{k}</T></View>
        ) : null)}
      </View>
      <SectionLabel title="Repositories" />
      {repos.isLoading ? <Loading rows={3} /> : repos.error ? <ErrorNote error={repos.error} onRetry={() => repos.refetch()} /> : !repos.data?.length ? <Empty title="no public repositories" /> : repos.data.map((r) => <RepoRow key={r.full_name} r={r} />)}
    </Screen>
  );
}
