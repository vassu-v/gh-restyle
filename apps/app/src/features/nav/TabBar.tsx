import type { TabId } from '@gitling/design';
import { router } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesign } from '@/design/DesignProvider';
import { useNotifications } from '@/data/queries';
import { Icon } from '@/ui/Icon';
import { glass } from '@/ui/primitives';

const TAB_ICON: Record<TabId, string> = { home: 'house', feed: 'activity', inbox: 'inbox', repos: 'book-marked', studio: 'palette' };
const TAB_ROUTE: Record<TabId, string> = { home: 'index', feed: 'feed', inbox: 'inbox', repos: 'repos', studio: 'studio' };
const TAB_LABEL: Record<TabId, string> = { home: 'Home', feed: 'Feed', inbox: 'Inbox', repos: 'Repositories', studio: 'Studio' };

type Props = { state: { index: number; routes: { name: string; key: string }[] }; navigateToTab: (routeKey: string) => void };

/** Floating glass capsule + separate search button. Tabs and their order come from the user's Design. */
export function TabBar({ state, navigateToTab }: Props) {
  const { design, tokens: t } = useDesign();
  const insets = useSafeAreaInsets();
  const unread = useNotifications(false).data?.length ?? 0;
  const current = state.routes[state.index]?.name;
  const bottom = Math.max(insets.bottom, 12) + 4;
  return (
    <>
    {/* Web: rows scrolling under the floating bar fade out behind it instead of sitting half-covered beneath it. */}
    {Platform.OS === 'web' ? (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bottom + 58 + 26, ...({ backgroundImage: `linear-gradient(to bottom, ${t.c.bg}00, ${t.c.bg}E6 55%, ${t.c.bg})` } as object) }} />
    ) : null}
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 10, width: '100%', maxWidth: 520, paddingHorizontal: 16 }}>
        <View style={[{ flex: 1, height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6 }, glass(t)]}>
          {design.nav.tabs.map((id) => {
            const on = current === TAB_ROUTE[id];
            return (
              <Pressable key={id} onPress={() => { const r = state.routes.find((x) => x.name === TAB_ROUTE[id]); if (r) navigateToTab(r.key); }} accessibilityRole="tab" accessibilityLabel={TAB_LABEL[id]} accessibilityState={{ selected: on }}
                style={{ width: 54, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (t.mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)') : 'transparent' }}>
                <Icon name={TAB_ICON[id]} size={22} color={on ? t.c.fg : t.c.mut} />
                {id === 'inbox' && unread > 0 && !on ? <View style={{ position: 'absolute', top: 9, right: 13, width: 7, height: 7, borderRadius: 4, backgroundColor: t.c.acc }} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search"
          style={[{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }, glass(t)]}>
          <Icon name="search" size={22} color={t.c.fg} />
        </Pressable>
      </View>
    </View>
    </>
  );
}
