import { useState } from 'react';
import { View } from 'react-native';
import { useMyRepos, useStarred } from '@/data/queries';
import { RepoRow } from '@/features/rows';
import { Empty, ErrorNote, Loading, Screen, Seg, T } from '@/ui/primitives';

export default function Repos() {
  const [seg, setSeg] = useState<'mine' | 'starred'>('mine');
  const mine = useMyRepos(); const starred = useStarred();
  const q = seg === 'mine' ? mine : starred;
  return (
    <Screen header={
      <View style={{ paddingHorizontal: 18, paddingTop: 10, gap: 14, paddingBottom: 8 }}>
        <T v="h1">Repositories</T>
        <Seg value={seg} onChange={setSeg} options={[{ value: 'mine', label: 'Yours', n: mine.data?.length }, { value: 'starred', label: 'Starred', n: starred.data?.length }]} />
      </View>
    }>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <Empty title="✓ none yet" /> : q.data.map((r) => <RepoRow key={r.full_name} r={r} />)}
    </Screen>
  );
}
