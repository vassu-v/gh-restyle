import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useDir } from '@/data/queries';
import { bytes } from '@/lib/format';
import { routes } from '@/lib/links';
import { BackHeader, Empty, ErrorNote, Loading, Row, Screen, T } from '@/ui/primitives';

/** Code browser: one directory. Tapping a folder pushes another tree; a file opens the blob viewer. */
export default function Tree() {
  const { owner, name, path = '', ref } = useLocalSearchParams<{ owner: string; name: string; path?: string; ref?: string }>();
  const dir = useDir(owner, name, path, ref);
  const crumbs = path ? path.split('/') : [];
  return (
    <Screen header={<BackHeader title={`${owner}/${name}${ref ? ` @ ${ref}` : ''}`} />}>
      <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
        <T v="h2" lines={2}>{crumbs.length ? crumbs[crumbs.length - 1] : name}</T>
        {crumbs.length > 1 ? <T v="monoS" c="mut" lines={1}>{crumbs.slice(0, -1).join(' / ')}</T> : null}
      </View>
      {dir.isLoading ? <Loading /> : dir.error ? <ErrorNote error={dir.error} onRetry={() => dir.refetch()} /> : !dir.data?.length ? <Empty title="empty folder" /> : dir.data.map((it) => (
        <Row key={it.path} mono icon={it.type === 'dir' ? 'folder' : it.type === 'submodule' ? 'package' : 'file'} title={it.name}
          trail={it.type === 'file' ? bytes(it.size) : undefined}
          onPress={() => it.type === 'dir' ? router.push(routes.tree(owner, name, it.path, ref)) : it.type === 'file' ? router.push(routes.blob(owner, name, it.path, ref)) : undefined} />
      ))}
    </Screen>
  );
}
