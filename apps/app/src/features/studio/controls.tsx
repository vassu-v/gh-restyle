import { applyPreset, presetOf, resolveTokens, ACCENTS, BACKGROUNDS, PRESETS, type Background, type Design, type SectionId, type TabId } from '@gitling/design';
import { useMemo } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { TokensScope, useDesign, useTokens } from '@/design/DesignProvider';
import { TileView } from '@/features/tiles/TileView';
import { pad2 } from '@/lib/format';
import { Icon } from '@/ui/Icon';
import { moveItem, ReorderList } from '@/ui/Reorder';
import { Num, Panel, Seg, T, Ticks } from '@/ui/primitives';

/**
 * The design controls shared by Studio and the welcome tour (src/app/welcome.tsx), so both edit the Design the
 * same way. Each control edits the live design through useDesign().update, which keeps undo working.
 */

export const SECTION_NAME: Record<SectionId, string> = { status: 'Status instrument', shortcuts: 'Shortcuts', needs: 'Needs you', feed: 'From your feed', inbox: 'Inbox preview', recent: 'Recent repositories' };
export const TAB_NAME: Record<TabId, string> = { home: 'Home', feed: 'Feed', inbox: 'Inbox', repos: 'Repositories', studio: 'Studio' };
const ALL_TABS: TabId[] = ['home', 'feed', 'inbox', 'repos', 'studio'];

export function SettingRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderColor: t.c.line, gap: 12, ...(last ? { borderBottomWidth: 1 } : {}) }}>
      <T v="body">{label}</T>
      <View style={{ flexShrink: 1 }}>{children}</View>
    </View>
  );
}

/** A miniature home drawn with any design's tokens: yours, a preset, or an imported design. */
export function DesignPreview({ design, width = 272, tiles = true }: { design: Design; width?: number; tiles?: boolean }) {
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

/** Horizontal gallery of presets; tapping one applies its look (tabs, home and tiles stay). */
export function PresetGallery() {
  const { design, update } = useDesign();
  const t = useTokens();
  const active = presetOf(design);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10, paddingBottom: 16 }}>
      {PRESETS.map((p) => {
        const on = active?.id === p.id;
        return (
          <Pressable key={p.id} onPress={() => update((d) => { d.theme = { ...p.theme }; })} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${p.name} preset. ${p.blurb}`}
            style={({ pressed }) => ({ width: 168, gap: 8, opacity: pressed ? 0.75 : 1 })}>
            <View style={{ borderRadius: 26, borderWidth: 2, borderColor: on ? t.c.acc : 'transparent' }}>
              <DesignPreview design={applyPreset(design, p)} width={140} tiles={false} />
            </View>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <T v="bodyStrong">{p.name}</T>
              <T v="monoS" c="mut" lines={2}>{p.blurb}</T>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Accent, background, numbers, tiles, density, text size. `compact` shows only accent and background (welcome tour). */
export function LookRows({ compact }: { compact?: boolean }) {
  const { design, update } = useDesign();
  const t = useTokens();
  const th = design.theme;
  return (
    <View>
      <SettingRow label="Accent">
        <View style={{ flexDirection: 'row', gap: 9, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {ACCENTS.map((a) => (
            <Pressable key={a} onPress={() => update((d) => { d.theme.accent = a; })} accessibilityLabel={`Accent ${a}`} accessibilityState={{ selected: th.accent.toLowerCase() === a.toLowerCase() }}
              style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: a, borderWidth: 2, borderColor: th.accent.toLowerCase() === a.toLowerCase() ? t.c.fg : 'transparent' }} />
          ))}
        </View>
      </SettingRow>
      <SettingRow label="Background" last={compact}><Seg small value={th.background} onChange={(v: Background) => update((d) => { d.theme.background = v; })} options={(Object.keys(BACKGROUNDS) as Background[]).map((b) => ({ value: b, label: BACKGROUNDS[b].label }))} /></SettingRow>
      {compact ? null : (
        <>
          <SettingRow label="Numbers"><Seg small value={th.numbers} onChange={(v) => update((d) => { d.theme.numbers = v; })} options={[{ value: 'dot', label: 'Dot' }, { value: 'mono', label: 'Mono' }, { value: 'sans', label: 'Sans' }]} /></SettingRow>
          <SettingRow label="Tiles"><Seg small value={th.tiles} onChange={(v) => update((d) => { d.theme.tiles = v; })} options={[{ value: 'window', label: 'Window' }, { value: 'plain', label: 'Plain' }]} /></SettingRow>
          <SettingRow label="Density">
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => update((d) => { d.theme.density = n; })} accessibilityLabel={`Density ${n}`} hitSlop={4} style={{ width: 22, height: 16, borderRadius: 3, backgroundColor: n <= th.density ? t.c.fg : t.c.line2 }} />)}
            </View>
          </SettingRow>
          <SettingRow label="Text size" last><Seg small value={String(th.textScale)} onChange={(v) => update((d) => { d.theme.textScale = Number(v); })} options={[{ value: '0.9', label: 'S' }, { value: '1', label: 'M' }, { value: '1.12', label: 'L' }, { value: '1.25', label: 'XL' }]} /></SettingRow>
        </>
      )}
    </View>
  );
}

/** Which Home sections show, in what order (drag the grip). */
export function HomeSectionsEditor() {
  const { design, update } = useDesign();
  const t = useTokens();
  return (
    <ReorderList items={design.home.sections} keyOf={(s) => s.id} label={(s) => SECTION_NAME[s.id]}
      onMove={(from, to) => update((d) => moveItem(d.home.sections, from, to))}
      render={(s, i) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, gap: 10 }}>
          <T v="body" c={s.visible ? 'fg' : 'mut'} style={{ flex: 1 }}>{SECTION_NAME[s.id]}</T>
          <Switch value={s.visible} onValueChange={(v) => update((d) => { d.home.sections[i].visible = v; })} trackColor={{ true: t.c.acc, false: t.c.line2 }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} accessibilityLabel={`Show ${SECTION_NAME[s.id]}`} />
        </View>
      )} />
  );
}

/** The tab bar, left to right: drag to reorder, remove, add back. Studio always stays. */
export function TabBarEditor() {
  const { design, update } = useDesign();
  const t = useTokens();
  return (
    <View>
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
          <Pressable key={id} onPress={() => update((d) => { d.nav.tabs.splice(d.nav.tabs.length - 1, 0, id); })} accessibilityRole="button" accessibilityLabel={`Add ${TAB_NAME[id]}`} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: t.c.el2 }}>
            <Icon name="plus" size={15} color={t.c.fg} /><T v="sub">{TAB_NAME[id]}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
