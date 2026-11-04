import { applyPreset, decodeDesign, describeDesign, encodeDesign, PRESETS, presetOf, resolveTokens, ACCENTS, BACKGROUNDS, type Background, type Design, type SectionId, type TabId } from '@gitling/design';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { appUrl } from '@/config';
import { TokensScope, useDesign, useTokens } from '@/design/DesignProvider';
import { TileView } from '@/features/tiles/TileView';
import { pad2 } from '@/lib/format';
import { Icon } from '@/ui/Icon';
import { moveItem, ReorderList } from '@/ui/Reorder';
import { Button, Chips, Num, Panel, Screen, Seg, T, Ticks } from '@/ui/primitives';

type Tab = 'look' | 'home' | 'tabs' | 'tiles' | 'share';
const TABS: Tab[] = ['look', 'home', 'tabs', 'tiles', 'share'];
const SECTION_NAME: Record<SectionId, string> = { status: 'Status instrument', shortcuts: 'Shortcuts', needs: 'Needs you', feed: 'From your feed', inbox: 'Inbox preview', recent: 'Recent repositories' };
const TAB_NAME: Record<TabId, string> = { home: 'Home', feed: 'Feed', inbox: 'Inbox', repos: 'Repositories', studio: 'Studio' };
const ALL_TABS: TabId[] = ['home', 'feed', 'inbox', 'repos', 'studio'];

/** Share link that opens Studio with the design ready to preview. */
const shareLink = (code: string) => {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : appUrl;
  return origin ? `${origin}/studio?import=${encodeURIComponent(code)}` : '';
};

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderColor: t.c.line, gap: 12, ...(last ? { borderBottomWidth: 1 } : {}) }}>
      <T v="body">{label}</T>
      <View style={{ flexShrink: 1 }}>{children}</View>
    </View>
  );
}

/** A miniature home drawn with any design's tokens: yours, a preset, or a pasted share code. */
function Preview({ design, width = 272, tiles = true }: { design: Design; width?: number; tiles?: boolean }) {
  const tokens = useMemo(() => resolveTokens(design), [design]);
  const frame = useTokens();
  return (
    <View style={{ borderRadius: 24, backgroundColor: frame.mode === 'dark' ? '#15161A' : '#E7E7E3', borderWidth: 1, borderColor: frame.c.line, overflow: 'hidden', paddingTop: 14, alignItems: 'center' }}>
      <TokensScope tokens={tokens}>
        <View style={{ width, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: tokens.c.bg, borderWidth: 1, borderBottomWidth: 0, borderColor: tokens.c.line2, padding: 10, gap: 8 }}>
          <Panel style={{ padding: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Num value={pad2(3)} size={width > 200 ? 42 : 34} />
              {width > 200 ? <T v="monoS" c="mut" style={{ textAlign: 'right' }}>reviews 2{'\n'}assigned 6</T> : null}
            </View>
            <Ticks height={8} values={['ok', 'ok', 'ok', 'bad', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']} />
          </Panel>
          {tiles ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {design.tiles.slice(0, 2).map((tile) => <View key={tile.id} style={{ flex: 1 }}><TileView tile={{ ...tile, count: false }} preview /></View>)}
            </View>
          ) : <View style={{ height: 6, width: 60, borderRadius: 3, backgroundColor: tokens.c.acc }} />}
        </View>
      </TokensScope>
    </View>
  );
}

export default function Studio() {
  const { design, tokens: t, update, undo, canUndo, replace, reset } = useDesign();
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
  const th = design.theme;
  const active = presetOf(design);
  const incoming = code.trim() ? decodeDesign(code.trim()) : null;
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
      <View style={{ marginHorizontal: 14, marginTop: 6 }}><Preview design={design} /></View>
      <View style={{ paddingVertical: 14 }}>
        <Chips value={tab} onChange={setTab} options={[{ value: 'look', label: 'Look' }, { value: 'home', label: 'Home' }, { value: 'tabs', label: 'Tabs' }, { value: 'tiles', label: 'Tiles' }, { value: 'share', label: 'Share' }]} />
      </View>

      {tab === 'look' ? (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10 }}>
            <T v="label" c="mut">presets</T>
            <T v="monoS" c="dim">{active ? active.name : 'custom'}</T>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10, paddingBottom: 16 }}>
            {PRESETS.map((p) => {
              const on = active?.id === p.id;
              return (
                <Pressable key={p.id} onPress={() => update((d) => { d.theme = { ...p.theme }; })} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${p.name} preset. ${p.blurb}`}
                  style={({ pressed }) => ({ width: 168, gap: 8, opacity: pressed ? 0.75 : 1 })}>
                  <View style={{ borderRadius: 26, borderWidth: 2, borderColor: on ? t.c.acc : 'transparent' }}>
                    <Preview design={applyPreset(design, p)} width={140} tiles={false} />
                  </View>
                  <View style={{ paddingHorizontal: 4, gap: 2 }}>
                    <T v="bodyStrong">{p.name}</T>
                    <T v="monoS" c="mut" lines={2}>{p.blurb}</T>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <Row label="Accent">
            <View style={{ flexDirection: 'row', gap: 9 }}>
              {ACCENTS.map((a) => (
                <Pressable key={a} onPress={() => update((d) => { d.theme.accent = a; })} accessibilityLabel={`Accent ${a}`}
                  style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: a, borderWidth: 2, borderColor: th.accent.toLowerCase() === a.toLowerCase() ? t.c.fg : 'transparent' }} />
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
          <T v="sub" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 10 }}>Choose what Home shows. Drag the grip to change the order.</T>
          <ReorderList items={design.home.sections} keyOf={(s) => s.id} label={(s) => SECTION_NAME[s.id]}
            onMove={(from, to) => update((d) => moveItem(d.home.sections, from, to))}
            render={(s, i) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, gap: 10 }}>
                <T v="body" c={s.visible ? 'fg' : 'mut'} style={{ flex: 1 }}>{SECTION_NAME[s.id]}</T>
                <Switch value={s.visible} onValueChange={(v) => update((d) => { d.home.sections[i].visible = v; })} trackColor={{ true: t.c.acc, false: t.c.line2 }} thumbColor="#fff" accessibilityLabel={`Show ${SECTION_NAME[s.id]}`} />
              </View>
            )} />
        </View>
      ) : null}

      {tab === 'tabs' ? (
        <View>
          <T v="sub" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 10 }}>Your tab bar, left to right. Drag to reorder. Studio always stays so you can get back here.</T>
          <ReorderList items={design.nav.tabs} keyOf={(id) => id} label={(id) => TAB_NAME[id]}
            onMove={(from, to) => update((d) => moveItem(d.nav.tabs, from, to))}
            render={(id) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, gap: 6 }}>
                <T v="body" style={{ flex: 1 }}>{TAB_NAME[id]}</T>
                <Pressable disabled={id === 'studio' || design.nav.tabs.length <= 2} onPress={() => update((d) => { d.nav.tabs = d.nav.tabs.filter((x) => x !== id); })} hitSlop={6} accessibilityLabel={`Remove ${TAB_NAME[id]}`} style={{ padding: 6, opacity: id === 'studio' || design.nav.tabs.length <= 2 ? 0.25 : 1 }}>
                  <Icon name="x" size={17} color={t.c.mut} />
                </Pressable>
              </View>
            )} />
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

          <T v="label" c="mut" style={{ marginTop: 14 }}>{"try someone's design"}</T>
          <TextInput value={code} onChangeText={(v) => { setCode(v); setMsg(null); }} placeholder="Paste a GITLING1.… code or a share link" placeholderTextColor={t.c.dim} autoCapitalize="none" autoCorrect={false} multiline
            style={{ minHeight: 70, padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 13 }} />
          {(() => {
            const parsed = incoming ?? (code.includes('import=') ? decodeDesign(decodeURIComponent(code.split('import=')[1].split('&')[0])) : null);
            if (!code.trim() || !parsed) return null;
            if (!parsed.ok) return <T v="sub" c="bad">{parsed.error}</T>;
            return (
              <View style={{ gap: 10 }}>
                <Preview design={parsed.design} />
                <T v="monoS" c="mut">{describeDesign(parsed.design)}</T>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button style={{ flex: 1 }} label="Apply this design" onPress={() => { replace(parsed.design); setCode(''); flash(true, 'Design applied. Undo is available.'); if (params.import) router.setParams({ import: '' }); }} />
                  <Button kind="quiet" label="Only the look" onPress={() => { update((d) => { d.theme = { ...parsed.design.theme }; }); setCode(''); flash(true, 'Look applied; your tabs and shortcuts stayed. Undo is available.'); if (params.import) router.setParams({ import: '' }); }} />
                </View>
              </View>
            );
          })()}
          {msg ? <T v="sub" c={msg.ok ? 'ok' : 'bad'}>{msg.text}</T> : null}
          <Button kind="danger" label={armReset ? 'Tap again to reset' : 'Reset to default'} style={{ marginTop: 18 }} onPress={() => { if (!armReset) { setArmReset(true); setTimeout(() => setArmReset(false), 3500); return; } reset(); setArmReset(false); flash(true, 'Reset. Undo is available.'); }} />
        </View>
      ) : null}
    </Screen>
  );
}
