import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { useMe } from '@/data/queries';
import { useInstall } from '@/pwa/useInstall';
import { useSession } from '@/session/SessionProvider';
import { Avatar, BackHeader, Button, Panel, Screen, T } from '@/ui/primitives';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,notifications,read:user&description=Gitling';
const APPS_URL = 'https://github.com/settings/applications';

export default function Account() {
  const t = useTokens(); const me = useMe();
  const { isSample, canOAuth, notice, signInWithGitHub, signInWithToken, signOut } = useSession();
  const install = useInstall();
  const [token, setToken] = useState(''); const [busy, setBusy] = useState<'oauth' | 'token' | null>(null); const [err, setErr] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(!canOAuth);

  const run = async (kind: 'oauth' | 'token', fn: () => Promise<unknown>) => {
    setBusy(kind); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <Screen bottomSpace={40} header={<BackHeader />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingBottom: 18 }}>
        <Avatar login={me.data?.login ?? '?'} size={56} />
        <View style={{ flex: 1 }}>
          <T v="h2">{me.data?.name ?? me.data?.login ?? '…'}</T>
          <T v="mono" c="mut">@{me.data?.login}{isSample ? ' · sample data' : ''}</T>
        </View>
      </View>

      {notice ? <T v="sub" c="wait" style={{ paddingHorizontal: 18, paddingBottom: 12 }}>{notice}</T> : null}

      {isSample ? (
        <Panel style={{ marginHorizontal: 14, padding: 16, gap: 12 }}>
          <T v="bodyStrong" style={{ fontSize: 17 }}>Connect your GitHub account</T>
          <T v="sub" c="mut">{"There's no separate Gitling account. You sign in with GitHub, and your token stays on this device."}</T>
          {canOAuth ? (
            <Button label={busy === 'oauth' ? 'Opening GitHub…' : 'Sign in with GitHub'} icon="key-round" disabled={!!busy}
              onPress={() => run('oauth', async () => { await signInWithGitHub(); if (router.canGoBack()) router.back(); })} />
          ) : (
            <T v="monoS" c="dim">{"One-tap sign-in isn't set up for this build yet (see docs/SETUP-SIGNIN.md). Use a token below."}</T>
          )}
          {canOAuth && !showToken ? (
            <Pressable onPress={() => setShowToken(true)}><T v="sub" c="mut" style={{ textDecorationLine: 'underline' }}>Use a personal access token instead</T></Pressable>
          ) : null}
          {showToken ? (
            <>
              <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: 4 }} />
              <T v="sub" c="mut">Paste a classic personal access token with the repo, notifications and read:user scopes. It is only sent to api.github.com.</T>
              <Pressable onPress={() => Linking.openURL(TOKEN_URL)}><T v="bodyStrong" c="acc">Create a token on GitHub ↗</T></Pressable>
              <TextInput value={token} onChangeText={setToken} placeholder="ghp_…" placeholderTextColor={t.c.dim} secureTextEntry autoCapitalize="none" autoCorrect={false}
                style={{ padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 14 }} />
              <Button kind="quiet" label={busy === 'token' ? 'Checking…' : 'Use this token'} disabled={!token.trim() || !!busy}
                onPress={() => run('token', async () => { await signInWithToken(token); setToken(''); if (router.canGoBack()) router.back(); })} />
            </>
          ) : null}
          {err ? <T v="sub" c="bad">{err}</T> : null}
        </Panel>
      ) : (
        <View style={{ paddingHorizontal: 14, gap: 10 }}>
          <Button kind="quiet" icon="log-out" label="Sign out" onPress={async () => { await signOut(); if (router.canGoBack()) router.back(); }} />
          <T v="sub" c="mut" style={{ paddingHorizontal: 4 }}>Signing out removes the token from this device.</T>
          <Pressable onPress={() => Linking.openURL(APPS_URL)} style={{ paddingHorizontal: 4 }}><T v="sub" c="acc">{"Revoke Gitling's access on GitHub ↗"}</T></Pressable>
        </View>
      )}

      {install.state !== 'unavailable' ? (
        <Panel style={{ marginHorizontal: 14, marginTop: 14, padding: 16, gap: 10 }}>
          <T v="bodyStrong" style={{ fontSize: 17 }}>Install Gitling</T>
          {install.state === 'installed' ? <T v="sub" c="mut">{"You're using the installed app."}</T>
            : install.state === 'ios' ? <T v="sub" c="mut">In Safari, tap Share, then “Add to Home Screen”. Gitling then opens full-screen like an app.</T>
            : <>
                <T v="sub" c="mut">Add it to your home screen. It opens full-screen and keeps working on a bad connection.</T>
                <Button kind="quiet" icon="download" label="Install app" onPress={install.prompt} />
              </>}
        </Panel>
      ) : null}
    </Screen>
  );
}
