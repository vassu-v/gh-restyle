import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { useMe } from '@/data/queries';
import { useSession } from '@/session/SessionProvider';
import { Icon } from '@/ui/Icon';
import { Avatar, Button, Panel, Screen, T } from '@/ui/primitives';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,notifications,read:user&description=Gitling';

export default function Account() {
  const t = useTokens(); const me = useMe(); const { isSample, signInWithToken, signOut } = useSession();
  const [token, setToken] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return (
    <Screen bottomSpace={40} header={
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back"><Icon name="chevron-left" size={26} /></Pressable>
      </View>
    }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingBottom: 18 }}>
        <Avatar login={me.data?.login ?? '?'} size={56} />
        <View style={{ flex: 1 }}>
          <T v="h2">{me.data?.name ?? me.data?.login ?? '…'}</T>
          <T v="mono" c="mut">@{me.data?.login}{isSample ? ' · sample data' : ''}</T>
        </View>
      </View>

      {isSample ? (
        <Panel style={{ marginHorizontal: 14, padding: 16, gap: 12 }}>
          <T v="bodyStrong" style={{ fontSize: 17 }}>Connect your GitHub account</T>
          <T v="sub" c="mut">{"There's no separate Gitling account. You sign in with GitHub and your GitHub account is your account."}</T>
          <Button label="Sign in with GitHub" icon="key-round" disabled />
          <T v="monoS" c="dim">one-tap sign-in arrives in the next milestone</T>
          <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: 4 }} />
          <T v="sub" c="mut">For now you can paste a classic personal access token with the repo, notifications and read:user scopes. It stays on this device and is only sent to api.github.com.</T>
          <Pressable onPress={() => Linking.openURL(TOKEN_URL)}><T v="bodyStrong" c="acc">Create a token on GitHub ↗</T></Pressable>
          <TextInput value={token} onChangeText={setToken} placeholder="ghp_…" placeholderTextColor={t.c.dim} secureTextEntry autoCapitalize="none" autoCorrect={false}
            style={{ padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 14 }} />
          <Button kind="quiet" label={busy ? 'Checking…' : 'Use this token'} disabled={!token.trim() || busy}
            onPress={async () => { setBusy(true); setErr(null); try { await signInWithToken(token); setToken(''); router.back(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }} />
          {err ? <T v="sub" c="bad">{err}</T> : null}
        </Panel>
      ) : (
        <View style={{ paddingHorizontal: 14, gap: 10 }}>
          <Button kind="quiet" icon="log-out" label="Sign out" onPress={async () => { await signOut(); router.back(); }} />
          <T v="sub" c="mut" style={{ paddingHorizontal: 4 }}>Signing out removes the token from this device. To revoke it everywhere, delete it in your GitHub settings.</T>
        </View>
      )}
    </Screen>
  );
}
