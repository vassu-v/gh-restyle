import { Doto_800ExtraBold } from '@expo-google-fonts/doto';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DesignProvider, useDesign } from '@/design/DesignProvider';
import { SessionProvider } from '@/session/SessionProvider';

function Shell() {
  const { tokens: t } = useDesign();
  return (
    <>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="tile/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ask" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular, GeistMono_500Medium, Doto_800ExtraBold });
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } }));
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <DesignProvider>
          <SessionProvider>
            <Shell />
          </SessionProvider>
        </DesignProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
