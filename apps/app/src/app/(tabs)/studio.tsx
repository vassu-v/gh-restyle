import { ACCENTS, BACKGROUNDS, decodeDesign, encodeDesign, type Background, type SectionId, type TabId } from '@gitling/design';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';
import { useDesign } from '@/design/DesignProvider';
import { TileView } from '@/features/tiles/TileView';
import { pad2 } from '@/lib/format';
import { Icon } from '@/ui/Icon';
import { Button, Chips, Num, Panel, Screen, Seg, T, Ticks } from '@/ui/primitives';

type Tab = 'look' | 'home' | 'tabs' | 'tiles' | 'share';
const SECTION_NAME: Record<SectionId, string> = { status: 'Status instrument', shortcuts: 'Shortcuts', needs: 'Needs you', feed: 'From your feed', inbox: 'Inbox preview', recent: 'Recent repositories' };
const TAB_NAME: Record<TabId, string> = { home: 'Home', feed: 'Feed', inbox: 'Inbox', repos: 'Repositories', studio: 'Studio' };
const ALL_TABS: TabId[] = ['home', 'feed', 'inbox', 'repos', 'studio'];

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  const { tokens: t } = useDesign();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderColor: t.c.line, gap: 12, ...(last ? { borderBottomWidth: 1 } : {}) }}>
      <T v="body">{label}</T>
      <View style={{ flexShrink: 1 }}>{children}</View>
    </View>
  );
}

/** A live miniature of the user's own home, so every change is visible as it happens. */
function Preview() {
  const { design, tokens: t } = useDesign();
  return (
    <View style={{ marginHorizontal: 14, marginTop: 6, borderRadius: 24, backgroundColor: t.mode === 'dark' ? '#15161A' : '#E7E7E3', borderWidth: 1, borderColor: t.c.line, overflow: 'hidden', paddingTop: 16, alignItems: 'center' }}>
      <View style={{ width: 272, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: t.c.bg, borderWidth: 1, borderBottomWidth: 0, borderColor: t.c.line2, padding: 10, gap: 8 }}>
        <Panel style={{ padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Num value={pad2(3)} size={42} />
            <T v="monoS" c="mut" style={{ textAlign: 'right' }}>reviews 2{'\n'}assigned 6</T>
          </View>
          <Ticks height={8} values={['ok', 'ok', 'ok', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']} />
        </Panel>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {design.tiles.slice(0, 2).map((tile) => <View key={tile.id} style={{ flex: 1 }}><TileView tile={{ ...tile, count: false }} preview /></View>)}
        </View>
      </View>
    </View>
  );
}

export default function Studio() {
  const { design, tokens: t, update, undo, canUndo, replace, reset } = useDesign();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>('look');
  const [seenTab, setSeenTab] = useState<string | undefined>(undefined);
  if (params.tab !== seenTab) {
    setSeenTab(params.tab);
    if (params.tab && ['look', 'home', 'tabs', 'tiles', 'share'].includes(params.tab)) setTab(params.tab as Tab);
  }
  const [code, setCode] = useState(''); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [armReset, setArmReset] = useState(false);
  const th = design.theme;

  const move = <T,>(arr: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

  return (
    <Screen header={
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10 }}>
        <T v="h2">Studio</T>
        <Pressable onPress={undo} disabled={!canUndo} hitSlop={10} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', opacity: canUndo ? 1 : 0.35 }}>
          <Icon name="undo-2" size={16} color={t.c.acc} /><T v="bodyStrong" c="acc">Undo</T>
        </Pressable>
      </View>
    }>
      <Preview />
      <View style={{ paddingVertical: 14 }}>
        <Chips value={tab} onChange={setTab} options={[{ value: 'look', label: 'Look' }, { value: 'home', label: 'Home' }, { value: 'tabs', label: 'Tabs' }, { value: 'tiles', label: 'Tiles' }, { value: 'share', label: 'Share' }]} />
      </View>

      {tab === 'look' ? (
        <View>
          <Row label="Accent">
            <View style={{ flexDirection: 'row', gap: 9 }}>
              {ACCENTS.map((a) => (
                <Pressable key={a} onPress={() => update((d) => { d.theme.accent = a; })} accessibilityLabel={`Accent ${a}`}
                  style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: a, borderWidth: 2, borderColor: th.accent === a ? t.c.fg : 'transparent' }} />
              ))}
            </View>
          </Row>
          <Row label="Background"><Seg small value={th.background} onChange={(v: Background) => update((d) => { d.theme.background = v; })} options={(Object.keys(BACKGROUNDS) as Background[]).map((b) => ({ value: b, label: BACKGROUNDS[b].label }))} /></Row>
          <Row label="Numbers"><Seg small value={th.numbers} onChange={(v) => update((d) => { d.theme.numbers = v; })} options={[{ value: 'dot', label: 'Dot' }, { value: 'mono', label: 'Mono' }, { value: 'sans', label: 'Sans' }]} /></Row>
          <Row label="Tiles"><Seg small value={th.tiles} onChange={(v) => update((d) => { d.theme.tiles = v; })} options={[{ value: 'window', label: 'Window' }, { value: 'plain', label: 'Plain' }]} /></Row>
          <Row label="Density">
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => update((d) => { d.theme.density = n; })} accessibilityLabel={`Density ${n}`} hitSlop={4} style={{ width: 22, height: 16, borderRadius: 3, backgroundColor: n <= th.density ? t.c.fg : t.c.line2 }} />)}
            </View>
          </Row>
          <Row label="Text size" last><Seg small value={String(th.textScale)} onChange={(v) => update((d) => { d.theme.textScale = Number(v); })} options={[{ value: '0.9', label: 'S' }, { value: '1', label: 'M' }, { value: '1.12', label: 'L' }, { value: '1.25', label: 'XL' }]} /></Row>
        </View>
      ) : null}

      {tab === 'home' ? (
        <View>
          <T v="sub" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 10 }}>Choose what Home shows and in what order.</T>
          {design.home.sections.map((s, i) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderColor: t.c.line, gap: 6 }}>
              <T v="body" c={s.visible ? 'fg' : 'mut'} style={{ flex: 1 }}>{SECTION_NAME[s.id]}</T>
              <Pressable onPress={() => update((d) => move(d.home.sections, i, -1))} hitSlop={6} accessibilityLabel="Move up" style={{ padding: 6, opacity: i ? 1 : 0.3 }}><Icon name="arrow-up" size={17} color={t.c.mut} /></Pressable>
              <Pressable onPress={() => update((d) => move(d.home.sections, i, 1))} hitSlop={6} accessibilityLabel="Move down" style={{ padding: 6, opacity: i < design.home.sections.length - 1 ? 1 : 0.3 }}><Icon name="arrow-down" size={17} color={t.c.mut} /></Pressable>
              <Switch value={s.visible} onValueChange={(v) => update((d) => { d.home.sections[i].visible = v; })} trackColor={{ true: t.c.acc, false: t.c.line2 }} thumbColor="#fff" />
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'tabs' ? (
        <View>
          <T v="sub" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 10 }}>Pick the tabs in your bar. Studio always stays so you can get back here.</T>
          {design.nav.tabs.map((id, i) => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderColor: t.c.line, gap: 6 }}>
              <T v="body" style={{ flex: 1 }}>{TAB_NAME[id]}</T>
              <Pressable onPress={() => update((d) => move(d.nav.tabs, i, -1))} hitSlop={6} accessibilityLabel="Move left" style={{ padding: 6, opacity: i ? 1 : 0.3 }}><Icon name="arrow-up" size={17} color={t.c.mut} /></Pressable>
              <Pressable onPress={() => update((d) => move(d.nav.tabs, i, 1))} hitSlop={6} accessibilityLabel="Move right" style={{ padding: 6, opacity: i < design.nav.tabs.length - 1 ? 1 : 0.3 }}><Icon name="arrow-down" size={17} color={t.c.mut} /></Pressable>
              <Pressable disabled={id === 'studio' || design.nav.tabs.length <= 2} onPress={() => update((d) => { d.nav.tabs = d.nav.tabs.filter((x) => x !== id); })} hitSlop={6} accessibilityLabel={`Remove ${TAB_NAME[id]}`} style={{ padding: 6, opacity: id === 'studio' ? 0.25 : 1 }}>
                <Icon name="x" size={17} color={t.c.mut} />
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, padding: 18, flexWrap: 'wrap' }}>
            {ALL_TABS.filter((x) => !design.nav.tabs.includes(x)).map((id) => (
              <Pressable key={id} onPress={() => update((d) => { d.nav.tabs.splice(d.nav.tabs.length - 1, 0, id); })} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: t.c.el2 }}>
                <Icon name="plus" size={15} color={t.c.fg} /><T v="sub">{TAB_NAME[id]}</T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {tab === 'tiles' ? (
        <View>
          {design.tiles.map((tile, i) => (
            <View key={tile.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderColor: t.c.line, gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}><Icon name={tile.icon} size={16} color={tile.tint} /></View>
              <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/tile/[id]', params: { id: tile.id } })}>
                <T v="title" lines={1}>{tile.label}</T>
                <T v="monoS" c="mut" lines={1}>{tile.target.type}{tile.target.type === 'search' ? ` · ${tile.target.q}` : tile.target.type === 'repo' ? ` · ${tile.target.repo}` : ''}</T>
              </Pressable>
              <Pressable onPress={() => update((d) => move(d.tiles, i, -1))} hitSlop={6} accessibilityLabel="Move up" style={{ padding: 6, opacity: i ? 1 : 0.3 }}><Icon name="arrow-up" size={17} color={t.c.mut} /></Pressable>
              <Pressable onPress={() => update((d) => move(d.tiles, i, 1))} hitSlop={6} accessibilityLabel="Move down" style={{ padding: 6, opacity: i < design.tiles.length - 1 ? 1 : 0.3 }}><Icon name="arrow-down" size={17} color={t.c.mut} /></Pressable>
            </View>
          ))}
          <Button label="New shortcut" icon="plus" style={{ margin: 18 }} onPress={() => router.push({ pathname: '/tile/[id]', params: { id: 'new' } })} />
          <T v="monoS" c="dim" style={{ textAlign: 'center' }}>long-press a tile on Home to edit it</T>
        </View>
      ) : null}

      {tab === 'share' ? (
        <View style={{ paddingHorizontal: 18, gap: 10 }}>
          <T v="sub" c="mut">Your design code holds your look, tabs, home layout and shortcuts. Paste it on another device, or into the desktop extension.</T>
          <Panel style={{ padding: 12 }}><T v="monoS" lines={3}>{encodeDesign(design)}</T></Panel>
          <Button label="Copy design code" icon="copy" onPress={async () => { await Clipboard.setStringAsync(encodeDesign(design)); setMsg({ ok: true, text: 'Copied.' }); }} />
          <T v="label" c="mut" style={{ marginTop: 14 }}>import a design</T>
          <TextInput value={code} onChangeText={setCode} placeholder="GITLING1.…" placeholderTextColor={t.c.dim} autoCapitalize="none" autoCorrect={false} multiline
            style={{ minHeight: 70, padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 13 }} />
          <Button kind="quiet" label="Apply design" onPress={() => { const r = decodeDesign(code); if (r.ok) { replace(r.design); setMsg({ ok: true, text: 'Design applied. Undo is available.' }); setCode(''); } else setMsg({ ok: false, text: r.error }); }} />
          {msg ? <T v="sub" c={msg.ok ? 'ok' : 'bad'}>{msg.text}</T> : null}
          <Button kind="danger" label={armReset ? 'Tap again to reset' : 'Reset to default'} style={{ marginTop: 18 }} onPress={() => { if (!armReset) { setArmReset(true); setTimeout(() => setArmReset(false), 3500); return; } reset(); setArmReset(false); setMsg({ ok: true, text: 'Reset. Undo is available.' }); }} />
        </View>
      ) : null}
    </Screen>
  );
}
