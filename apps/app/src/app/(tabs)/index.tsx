import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useDesign } from '@/design/DesignProvider';
import { useMe } from '@/data/queries';
import { HomeSectionView } from '@/features/home/sections';
import { useFirstRun } from '@/onboarding/OnboardingProvider';
import { useSession } from '@/session/SessionProvider';
import { Icon } from '@/ui/Icon';
import { Avatar, Screen, T } from '@/ui/primitives';

const TAB_ROUTE = { home: '/', feed: '/feed', inbox: '/inbox', repos: '/repos', studio: '/studio' } as const;

export default function Home() {
  const { design, tokens: t } = useDesign();
  const me = useMe(); const { isSample } = useSession();
  // First launch (install → sign in → tour) only starts from Home; deep links to other screens never trigger it.
  const firstRun = useFirstRun();
  if (firstRun) return <Redirect href="/welcome" />;
  // Home was taken out of the tab bar: the app (and the end of the tour) opens the first tab instead.
  if (!design.nav.tabs.includes('home')) return <Redirect href={TAB_ROUTE[design.nav.tabs[0]]} />;
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
      {design.home.sections.filter((s) => s.visible).map((s) => <View key={s.id}><HomeSectionView section={s} /></View>)}
      <Pressable onPress={() => router.navigate({ pathname: '/studio', params: { tab: 'home' } })} style={{ alignSelf: 'center', marginTop: 26, paddingHorizontal: 14, paddingVertical: 8 }}>
        <T v="mono" c="mut">edit home layout</T>
      </Pressable>
    </Screen>
  );
}
