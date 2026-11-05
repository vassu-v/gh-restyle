import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { isSafeLink } from '@gitling/design';
import { useTokens } from '@/design/DesignProvider';
import { Button, T } from '@/ui/primitives';

/** "Ask first" tiles: type something, then go to a search or a link built from it. */
export default function Ask() {
  const t = useTokens();
  const { prompt, template, dest } = useLocalSearchParams<{ prompt: string; template: string; dest: 'issues' | 'repos' | 'link' }>();
  const [v, setV] = useState('');
  function go() {
    const q = v.trim(); if (!q) return;
    if (dest === 'link') {
      // template comes from the URL (/ask?template=…), so only http(s) may be opened.
      const url = template.replace('{query}', encodeURIComponent(q));
      if (isSafeLink(url)) Linking.openURL(url);
      router.back(); return;
    }
    router.replace({ pathname: '/search', params: { q: template.replace('{query}', q), kind: dest === 'repos' ? 'repos' : 'issues', title: q } });
  }
  return (
    <Pressable onPress={() => router.back()} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', paddingTop: 120, paddingHorizontal: 16 }}>
      <Pressable onPress={() => {}} style={{ alignSelf: 'center', width: '100%', maxWidth: 480, backgroundColor: t.c.el, borderRadius: 22, borderWidth: 1, borderColor: t.c.line2, padding: 16, gap: 12 }}>
        <T v="bodyStrong" style={{ fontSize: 17 }}>{prompt}</T>
        <TextInput autoFocus value={v} onChangeText={setV} onSubmitEditing={go} returnKeyType="go" autoCapitalize="none" autoCorrect={false} placeholder="Type here"
          placeholderTextColor={t.c.dim} style={{ padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.ui.regular, fontSize: 15 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label={dest === 'link' ? 'Open' : 'Search'} disabled={!v.trim()} onPress={go} style={{ flex: 1 }} />
          <Button kind="quiet" label="Cancel" onPress={() => router.back()} />
        </View>
      </Pressable>
    </Pressable>
  );
}
