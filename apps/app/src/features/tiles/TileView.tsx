import { fit, type Tile, type TileTarget } from '@gitling/design';
import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { useSearchIssues, useNotifications } from '@/data/queries';
import { Icon } from '@/ui/Icon';
import { Num, T } from '@/ui/primitives';

const KIND: Record<TileTarget['type'], string> = { search: 'search', repo: 'repo', user: 'person', file: 'file', inbox: 'inbox', link: 'link', ask: 'ask' };

/** A tile's live count, if it has one. */
function useTileCount(tile: Tile) {
  const tg = tile.target;
  const search = useSearchIssues(tg.type === 'search' ? tg.q : '', 1, tile.count && tg.type === 'search');
  const inbox = useNotifications(false);
  if (!tile.count) return null;
  if (tg.type === 'search') return search.data?.total_count ?? null;
  if (tg.type === 'inbox') return inbox.data?.filter((n) => tg.filter === 'all' || n.reason === tg.filter).length ?? null;
  return null;
}

export function openTarget(target: TileTarget, label: string) {
  switch (target.type) {
    case 'search': return router.push({ pathname: '/search', params: { q: target.q, title: label, kind: 'issues' } });
    case 'repo': return router.push({ pathname: '/search', params: { q: `repo:${target.repo} is:open ${target.tab === 'prs' ? 'is:pr' : target.tab === 'issues' ? 'is:issue' : ''}`.trim(), title: target.repo, kind: 'issues' } });
    case 'user': return router.push({ pathname: '/search', params: { q: `involves:${target.login} is:open`, title: `@${target.login}`, kind: 'issues' } });
    case 'file': return Linking.openURL(`https://github.com/${target.repo}/blob/HEAD/${target.path}`);
    case 'inbox': return router.navigate({ pathname: '/inbox', params: { filter: target.filter } });
    case 'link': return Linking.openURL(target.url);
    case 'ask': return router.push({ pathname: '/ask', params: { prompt: target.prompt, template: target.template, dest: target.dest } });
  }
}

export function TileView({ tile, preview, onLongPress }: { tile: Tile; preview?: boolean; onLongPress?: () => void }) {
  const t = useTokens();
  const count = useTileCount(tile);
  const tinted = tile.tint !== '#8D8F96';
  const ink = fit(tile.tint, t.c.el, 3.2); // readable on light and dark backgrounds
  const window = t.tiles === 'window';
  const inner = (
    <View style={{ backgroundColor: t.c.el, borderWidth: 1, borderColor: tinted ? tile.tint + '5C' : t.c.line, borderRadius: 16, overflow: 'hidden', flex: 1 }}>
      {window ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8, borderBottomWidth: 1, borderColor: t.c.line }}>
          <T v="monoS" style={{ color: tinted ? ink : t.c.mut }}>{KIND[tile.target.type]}</T>
          <Icon name={tile.icon} size={14} color={tinted ? ink : t.c.mut} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: 12, minHeight: window ? 66 : 92, gap: 8 }}>
        <View style={{ flex: 1, gap: 8 }}>
          {!window ? <Icon name={tile.icon} size={22} color={tinted ? ink : t.c.fg} /> : null}
          <T v="bodyStrong" lines={2}>{tile.label}</T>
        </View>
        {count != null ? <Num value={count} size={34} /> : null}
      </View>
    </View>
  );
  if (preview) return inner;
  return (
    <Pressable onPress={() => openTarget(tile.target, tile.label)} onLongPress={onLongPress} delayLongPress={450}
      accessibilityRole="button" accessibilityLabel={tile.label} accessibilityHint="Long press to edit"
      style={({ pressed }) => [{ width: tile.size === 'full' ? '100%' : '48.6%', transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      {inner}
    </Pressable>
  );
}
