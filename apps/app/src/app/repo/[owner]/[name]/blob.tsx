import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { MAX_FILE_BYTES, useFile } from '@/data/queries';
import { Icon } from '@/ui/Icon';
import { Markdown } from '@/ui/Markdown';
import { BackHeader, Button, ErrorNote, Loading, Panel, Screen, Seg, T } from '@/ui/primitives';

const MAX_LINES = 4000;

/** File viewer: line-numbered source, or rendered markdown for .md files (toggle to source). */
export default function Blob() {
  const t = useTokens();
  const { owner, name, path, ref } = useLocalSearchParams<{ owner: string; name: string; path: string; ref?: string }>();
  const { info, text, tooBig } = useFile(owner, name, path, ref);
  const isMd = /\.(md|markdown|mdx)$/i.test(path);
  const [view, setView] = useState<'rendered' | 'source'>('rendered');
  const ghUrl = `https://github.com/${owner}/${name}/blob/${ref ?? 'HEAD'}/${path}`;
  const fileName = path.split('/').pop() ?? path;
  const dir = path.split('/').slice(0, -1).join('/');
  const binary = typeof text.data === 'string' && text.data.slice(0, 8000).includes('\u0000');

  const header = <BackHeader title={`${owner}/${name}`} right={<Pressable onPress={() => Linking.openURL(ghUrl)} hitSlop={10} accessibilityLabel="Open on GitHub"><Icon name="arrow-up-right" size={20} color={t.c.mut} /></Pressable>} />;
  const err = info.error ?? text.error;
  return (
    <Screen header={header}>
      <View style={{ paddingHorizontal: 18, gap: 4, paddingBottom: 12 }}>
        <T v="h2" lines={2}>{fileName}</T>
        {dir ? <T v="monoS" c="mut" lines={1}>{dir}</T> : null}
      </View>
      {isMd && text.data ? <View style={{ marginHorizontal: 14, marginBottom: 12 }}><Seg small value={view} onChange={setView} options={[{ value: 'rendered', label: 'Preview' }, { value: 'source', label: 'Source' }]} /></View> : null}
      {err ? <ErrorNote error={err} onRetry={() => { info.refetch(); text.refetch(); }} />
        : tooBig || binary ? (
          <Panel style={{ marginHorizontal: 14, padding: 16, gap: 10 }}>
            <T v="body">{binary ? "This file isn't text." : `This file is over ${MAX_FILE_BYTES / 1024} KB, too big to show here.`}</T>
            <Button kind="quiet" icon="arrow-up-right" label="Open on GitHub" onPress={() => Linking.openURL(ghUrl)} />
          </Panel>
        ) : text.isLoading || info.isLoading ? <Loading rows={6} />
        : isMd && view === 'rendered' ? <View style={{ paddingHorizontal: 18 }}><Markdown source={text.data} base={{ owner, repo: name, ref, dir }} /></View>
        : <Source text={text.data ?? ''} />}
    </Screen>
  );
}

function Source({ text }: { text: string }) {
  const t = useTokens();
  const all = text.replace(/\n$/, '').split('\n');
  const lines = all.slice(0, MAX_LINES);
  const w = String(lines.length).length;
  const style = { fontFamily: t.font.mono.regular, fontSize: 12.5, lineHeight: 19 } as const;
  return (
    <Panel style={{ marginHorizontal: 14 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', paddingVertical: 10 }}>
          <Text style={{ ...style, color: t.c.dim, textAlign: 'right', paddingHorizontal: 10, minWidth: w * 8 + 20 }}>{lines.map((_, i) => i + 1).join('\n')}</Text>
          <Text selectable style={{ ...style, color: t.c.fg, paddingRight: 16 }}>{lines.join('\n')}</Text>
        </View>
      </ScrollView>
      {all.length > MAX_LINES ? <T v="monoS" c="mut" style={{ padding: 12 }}>Showing the first {MAX_LINES} of {all.length} lines.</T> : null}
    </Panel>
  );
}
