import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSession } from '@/session/SessionProvider';
import { Button, Screen, T } from '@/ui/primitives';

/**
 * Where the auth worker sends the browser back after GitHub (web), with ?code&state or ?error.
 * Native normally finishes inside startSignIn(); if the OS also routes the deep link here, the pending
 * sign-in is already consumed and we just go home.
 */
export default function AuthCallback() {
  const { code, state, error } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const { finishGitHubSignIn, isSample } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The address holds a one-time code: take it out of the address bar and history right away.
    if (Platform.OS === 'web') window.history.replaceState(null, '', '/auth/callback');
    if (!code && !error && !isSample) { router.replace('/'); return; }
    finishGitHubSignIn({ code, state, error })
      .then(() => router.replace('/'))
      .catch((e: Error) => setErr(e.message));
  }, [code, state, error, finishGitHubSignIn, isSample]);

  return (
    <Screen>
      <View style={{ padding: 24, gap: 14, marginTop: 60 }}>
        <T v="h2">{err ? "Couldn't sign in" : 'Signing you in…'}</T>
        {err ? (
          <>
            <T v="body" c="mut">{err}</T>
            <Button label="Back to Gitling" onPress={() => router.replace('/account')} />
          </>
        ) : <T v="sub" c="mut">Talking to GitHub.</T>}
      </View>
    </Screen>
  );
}
