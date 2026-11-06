// Per-weight imports: the package index pulls in every weight (~60 font files) on web.
import { Doto_800ExtraBold } from '@expo-google-fonts/doto/800ExtraBold';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MAX_AGE, persister, shouldSave } from '@/data/persist';
import { DesignProvider, useDesign } from '@/design/DesignProvider';
import { OnboardingProvider } from '@/onboarding/OnboardingProvider';
import { InstallSheet } from '@/pwa/InstallSheet';
import { SessionProvider } from '@/session/SessionProvider';
import '@/pwa/register';

function Shell() {
  const { tokens: t } = useDesign();
  return (
    <>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="search" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="tile/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ask" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      </Stack>
      <InstallSheet />
    </>
  );
}

/**
 * Last line of defence: an error while rendering any screen shows this instead of a blank page. It renders outside
 * the providers (they may be what failed), so it uses fixed colors (the app shell's own background) and system fonts.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const btn = { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22, borderWidth: 1, borderColor: '#3A3D44' } as const;
  return (
    <View style={{ flex: 1, backgroundColor: '#0E0F11', padding: 28, justifyContent: 'center', gap: 14 }}>
      <Text style={{ color: '#ECECEE', fontSize: 20, fontWeight: '600' }}>Something went wrong on this screen</Text>
      <Text style={{ color: '#9A9CA3', fontSize: 14 }}>{error?.message || 'Unknown error'}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={retry} accessibilityRole="button" style={btn}><Text style={{ color: '#ECECEE' }}>Try again</Text></Pressable>
        <Pressable onPress={() => { try { router.replace('/'); } catch { /* the router may be what failed */ } retry(); }} accessibilityRole="button" style={btn}><Text style={{ color: '#ECECEE' }}>Go to Home</Text></Pressable>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular, GeistMono_500Medium, Doto_800ExtraBold });
  // gcTime as long as the saved cache lives, or data would be dropped from memory (and the save) before it's reused.
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, gcTime: MAX_AGE } } }));
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      {/* Saved cache (src/data/persist.ts): last session's lists show at once on open, then refresh. */}
      <PersistQueryClientProvider client={qc} persistOptions={{ persister, maxAge: MAX_AGE, buster: 'v1', dehydrateOptions: { shouldDehydrateQuery: shouldSave } }}>
        {/* Outside DesignProvider: it must read storage before DesignProvider saves the default design. */}
        <OnboardingProvider>
          <DesignProvider>
            <SessionProvider>
              <Shell />
            </SessionProvider>
          </DesignProvider>
        </OnboardingProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
