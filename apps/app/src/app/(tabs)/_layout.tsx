import { Tabs } from 'expo-router';
import { useTokens } from '@/design/DesignProvider';
import { TabBar } from '@/features/nav/TabBar';

export default function TabsLayout() {
  const t = useTokens();
  return (
    <Tabs tabBar={(props) => <TabBar state={props.state as never} navigateToTab={props.navigateToTab} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.c.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox' }} />
      <Tabs.Screen name="repos" options={{ title: 'Repositories' }} />
      <Tabs.Screen name="studio" options={{ title: 'Studio' }} />
    </Tabs>
  );
}
