import { useState } from 'react';
import { View } from 'react-native';
import { useFeed, useMe } from '@/data/queries';
import { FeedItem, groupFeed } from '@/features/rows';
import { dayGroup } from '@/lib/format';
import { Chips, Empty, ErrorNote, Loading, Screen, T } from '@/ui/primitives';

type F = 'following' | 'releases' | 'stars' | 'you';

export default function Feed() {
  const me = useMe();
  const [f, setF] = useState<F>('following');
  const q = useFeed(me.data?.login, f === 'you');
  const events = (q.data ?? []).filter((e) => (f === 'releases' ? e.type === 'ReleaseEvent' : f === 'stars' ? e.type === 'WatchEvent' : true));
  const groups = groupFeed(events);
  let lastDay = '';
  return (
    <Screen header={
      <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 18, paddingTop: 10 }}>
          <T v="h1">Feed</T>
          <T v="monoS" c="mut" style={{ textAlign: 'right' }}>following {me.data?.following ?? '–'}</T>
        </View>
        <View style={{ paddingTop: 12, paddingBottom: 4 }}>
          <Chips value={f} onChange={setF} options={[{ value: 'following', label: 'Following' }, { value: 'releases', label: 'Releases' }, { value: 'stars', label: 'Stars' }, { value: 'you', label: 'You' }]} />
        </View>
      </>
    }>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={() => q.refetch()} /> : !groups.length ? (
        <Empty title="✓ quiet" body={f === 'following' ? 'Follow people or watch repositories on GitHub to fill your feed.' : 'Nothing here in the last 90 days.'} />
      ) : groups.map((g) => {
        const d = dayGroup(g.events[0].created_at); const show = d !== lastDay; lastDay = d;
        return (
          <View key={g.key}>
            {show ? <T v="monoS" c="dim" style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 }}>{d}</T> : null}
            <FeedItem g={g} />
          </View>
        );
      })}
    </Screen>
  );
}
