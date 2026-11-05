import { describeDesign, designFileName, designToFile, encodeDesign, presetOf, readDesignText } from '@gitling/design';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { appUrl } from '@/config';
import { useDesign } from '@/design/DesignProvider';
import { DesignPreview, HomeSectionsEditor, LookRows, PresetGallery, TabBarEditor } from '@/features/studio/controls';
import { canOpenFiles, openDesignFile, saveDesignFile } from '@/lib/designFile';
import { Icon } from '@/ui/Icon';
import { moveItem, ReorderList } from '@/ui/Reorder';
import { Button, Chips, Screen, T } from '@/ui/primitives';

type Tab = 'look' | 'home' | 'tabs' | 'tiles' | 'share';
const TABS: Tab[] = ['look', 'home', 'tabs', 'tiles', 'share'];
/** Share link that opens Studio with the design ready to preview. */
const shareLink = (code: string) => {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : appUrl;
  return origin ? `${origin}/studio?import=${encodeURIComponent(code)}` : '';
};

export default function Studio() {
  const { design, tokens: t, update, undo, canUndo, replace, reset, dropped, dismissDropped } = useDesign();
  const params = useLocalSearchParams<{ tab?: string; import?: string }>();
  const [tab, setTab] = useState<Tab>('look');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [armReset, setArmReset] = useState(false);
  // React to ?tab= and ?import= (share links) whenever they change; the "seen" pattern avoids effects.
  const [seen, setSeen] = useState<string | undefined>(undefined);
  const paramKey = `${params.tab ?? ''}|${params.import ?? ''}`;
  if (paramKey !== seen) {
    setSeen(paramKey);
    if (params.import) { setTab('share'); setCode(params.import); setMsg(null); }
    else if (params.tab && (TABS as string[]).includes(params.tab)) setTab(params.tab as Tab);
  }
  const active = presetOf(design);
  // The paste box takes anything readDesignText reads: a design file's text, a code, or a share link.
  const incoming = code.trim() ? readDesignText(code) : null;
  const flash = (ok: boolean, text: string) => setMsg({ ok, text });

  return (
    <Screen header={
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10 }}>
        <T v="h2">Studio</T>
        <Pressable onPress={undo} disabled={!canUndo} hitSlop={10} accessibilityRole="button" style={{ flexDirection: 'row', gap: 6, alignItems: 'center', opacity: canUndo ? 1 : 0.35 }}>
          <Icon name="undo-2" size={16} color={t.c.acc} /><T v="bodyStrong" c="acc">Undo</T>
        </Pressable>
      </View>
    }>
      {dropped.length ? (
        <View style={{ marginHorizontal: 14, marginTop: 6, padding: 12, borderRadius: 13, backgroundColor: t.c.el2, gap: 6 }}>
          <T v="bodyStrong">Part of your saved design couldn’t be loaded</T>
          <T v="sub" c="mut">{`Kept everything else. Left out: ${dropped.join(', ')}. The original is saved on this device.`}</T>
          <Pressable onPress={dismissDropped} accessibilityRole="button" hitSlop={8}><T v="bodyStrong" c="acc">OK</T></Pressable>
        </View>
      ) : null}
      <View style={{ marginHorizontal: 14, marginTop: 6 }}><DesignPreview design={design} /></View>
      <View style={{ paddingVertical: 14 }}>
        <Chips value={tab} onChange={setTab} options={[{ value: 'look', label: 'Look' }, { value: 'home', label: 'Home' }, { value: 'tabs', label: 'Tabs' }, { value: 'tiles', label: 'Tiles' }, { value: 'share', label: 'Share' }]} />
      </View>

      {tab === 'look' ? (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10 }}>
            <T v="label" c="mut">presets</T>
            <T v="monoS" c="dim">{active ? active.name : 'custom'}</T>
          </View>
          <PresetGallery />
          <LookRows />
        </View>
      ) : null}

      {tab === 'home' ? (
        <View>
          <T v="sub" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 10 }}>Choose what Home shows. Drag the grip to change the order.</T>
          <HomeSectionsEditor />
        </View>
      ) : null}

      {tab === 'tabs' ? (
        <View>
          <T v="sub" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 10 }}>Your tab bar, left to right. Drag to reorder. Studio always stays so you can get back here.</T>
          <TabBarEditor />
        </View>
      ) : null}

      {tab === 'tiles' ? (
        <View>
          <T v="sub" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 10 }}>Tap a shortcut to edit it. Drag the grip to reorder; Home follows this order.</T>
          <ReorderList items={design.tiles} keyOf={(x) => x.id} label={(x) => x.label} rowHeight={60}
            onMove={(from, to) => update((d) => moveItem(d.tiles, from, to))}
            render={(tile) => (
              <Pressable onPress={() => router.push({ pathname: '/tile/[id]', params: { id: tile.id } })} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}><Icon name={tile.icon} size={16} color={tile.tint} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T v="title" lines={1}>{tile.label}</T>
                  <T v="monoS" c="mut" lines={1}>{tile.size === 'full' ? 'wide · ' : ''}{tile.target.type}{tile.target.type === 'search' ? ` · ${tile.target.q}` : tile.target.type === 'repo' ? ` · ${tile.target.repo}` : ''}</T>
                </View>
              </Pressable>
            )} />
          <Button label="New shortcut" icon="plus" style={{ margin: 18 }} onPress={() => router.push({ pathname: '/tile/[id]', params: { id: 'new' } })} />
          <T v="monoS" c="dim" style={{ textAlign: 'center' }}>long-press a tile on Home to edit it</T>
        </View>
      ) : null}

      {tab === 'share' ? (
        <View style={{ paddingHorizontal: 18, gap: 10 }}>
          <T v="sub" c="mut">Share your look, tabs, home layout and shortcuts. A link opens Gitling with your design ready to preview; the code also works in the desktop extension.</T>
          <T v="monoS" c="dim">{describeDesign(design)}</T>
          {shareLink('x') ? (
            <Button label="Copy share link" icon="link" onPress={async () => { await Clipboard.setStringAsync(shareLink(encodeDesign(design))); flash(true, 'Link copied. Anyone with Gitling can preview and apply it.'); }} />
          ) : null}
          <Button kind="quiet" label="Copy design code" icon="copy" onPress={async () => { await Clipboard.setStringAsync(encodeDesign(design)); flash(true, 'Code copied.'); }} />
          <Button kind="quiet" label={Platform.OS === 'web' ? 'Save as file' : 'Share as file'} icon="download" onPress={async () => {
            const name = active?.name;
            try { await saveDesignFile(designToFile(design, { name }), designFileName(name)); flash(true, 'Saved. Open it later here or in Welcome to bring this setup back.'); }
            catch { flash(false, "Couldn't save the file."); }
          }} />

          <T v="label" c="mut" style={{ marginTop: 14 }}>{"try someone's design"}</T>
          {canOpenFiles ? (
            <Button kind="quiet" label="Open a design file" icon="folder-open" onPress={async () => {
              try { const text = await openDesignFile(); if (text != null) { setCode(text); setMsg(null); } }
              catch (e) { flash(false, (e as Error).message); }
            }} />
          ) : null}
          <TextInput value={code} onChangeText={(v) => { setCode(v); setMsg(null); }} placeholder="Paste a GITLING1.… code, a share link or a design file's text" placeholderTextColor={t.c.dim} autoCapitalize="none" autoCorrect={false} multiline
            style={{ minHeight: 70, padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 13 }} />
          {(() => {
            const parsed = incoming;
            if (!code.trim() || !parsed) return null;
            if (!parsed.ok) return <T v="sub" c="bad">{parsed.error}</T>;
            return (
              <View style={{ gap: 10 }}>
                <DesignPreview design={parsed.design} />
                <T v="monoS" c="mut">{parsed.name ? `${parsed.name} · ` : ''}{describeDesign(parsed.design)}</T>
                {parsed.dropped.length ? <T v="sub" c="wait">{`Left out (not valid in this version): ${parsed.dropped.join(', ')}`}</T> : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button style={{ flex: 1 }} label="Apply this design" onPress={() => { replace(parsed.design); setCode(''); flash(true, 'Design applied. Undo is available.'); if (params.import) router.setParams({ import: '' }); }} />
                  <Button kind="quiet" label="Only the look" onPress={() => { update((d) => { d.theme = { ...parsed.design.theme }; }); setCode(''); flash(true, 'Look applied; your tabs and shortcuts stayed. Undo is available.'); if (params.import) router.setParams({ import: '' }); }} />
                </View>
              </View>
            );
          })()}
          {msg ? <T v="sub" c={msg.ok ? 'ok' : 'bad'}>{msg.text}</T> : null}
          <Button kind="quiet" label="Replay the welcome tour" icon="sparkles" style={{ marginTop: 18 }} onPress={() => router.push('/welcome')} />
          <Button kind="danger" label={armReset ? 'Tap again to reset' : 'Reset to default'} onPress={() => { if (!armReset) { setArmReset(true); setTimeout(() => setArmReset(false), 3500); return; } reset(); setArmReset(false); flash(true, 'Reset. Undo is available.'); }} />
        </View>
      ) : null}
    </Screen>
  );
}
