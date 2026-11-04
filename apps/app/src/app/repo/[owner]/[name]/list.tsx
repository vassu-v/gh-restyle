import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useRepoList } from '@/data/queries';
import { IssueRow } from '@/features/rows';
import { BackHeader, Button, Empty, ErrorNote, Loading, Screen, Seg, T } from '@/ui/primitives';

/** Issues or pull requests of one repo, open/closed, paged ("Load more"). */
export default function RepoList() {
  const { owner, name, kind = 'issues' } = useLocalSearchParams<{ owner: string; name: string; kind?: 'issues' | 'pulls' }>();
  const [state, setState] = useState<'open' | 'closed'>('open');
  const q = useRepoList(owner, name, kind === 'pulls' ? 'pulls' : 'issues', state);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Screen header={<BackHeader title={`${owner}/${name}`} />}>
      <View style={{ paddingHorizontal: 18, gap: 14, paddingBottom: 8 }}>
        <T v="h1">{kind === 'pulls' ? 'Pull requests' : 'Issues'}</T>
        <Seg value={state} onChange={setState} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />
      </View>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={() => q.refetch()} /> : !items.length ? <Empty title={`no ${state} ${kind === 'pulls' ? 'pull requests' : 'issues'}`} /> : (
        <>
          {items.map((it) => <IssueRow key={it.number} it={it} />)}
          {q.hasNextPage ? <View style={{ padding: 14 }}><Button kind="quiet" label={q.isFetchingNextPage ? 'Loading…' : 'Load more'} disabled={q.isFetchingNextPage} onPress={() => q.fetchNextPage()} /></View> : null}
        </>
      )}
    </Screen>
  );
}
