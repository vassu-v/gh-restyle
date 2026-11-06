import { applyPreset, isSearchSection, presetOf, resolveTokens, ACCENTS, BACKGROUNDS, MAX_SEARCH_SECTIONS, PRESETS, SearchSection, type Background, type Design, type TabId } from '@gitling/design';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { TokensScope, useDesign, useTokens } from '@/design/DesignProvider';
import { SEARCH_IDEAS, SECTION_ORDER, SECTIONS, sectionName } from '@/features/home/sections';
import { TileView } from '@/features/tiles/TileView';
import { pad2 } from '@/lib/format';
import { Icon } from '@/ui/Icon';
import { moveItem, ReorderList } from '@/ui/Reorder';
import { Button, Num, Panel, Seg, T, Ticks } from '@/ui/primitives';

/**
 * The design controls shared by Studio and the welcome tour (src/app/welcome.tsx), so both edit the Design the
 * same way. Each control edits the live design through useDesign().update, which keeps undo working.
 */

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

/**
 * Presets; tapping one applies its look (tabs, home and tiles stay). A sideways-scrolling row on phones; a wrapping
 * grid on wide screens, where a mouse can't scroll sideways and the last presets would be out of reach.
 */
export function PresetGallery() {
  const { design, update } = useDesign();
  const t = useTokens();
  const active = presetOf(design);
  const wide = useWindowDimensions().width >= 600;
  const cards = PRESETS.map((p) => {
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
  });
  return wide
    ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, paddingBottom: 16 }}>{cards}</View>
    : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10, paddingBottom: 16 }}>{cards}</ScrollView>;
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

/**
 * Home's sections: what's on Home (drag to reorder, remove) and everything that can be added, built-in sections
 * plus your own searches. Home always keeps at least one section.
 */
export function HomeSectionsEditor({ compact }: { compact?: boolean }) {
  const { design, update } = useDesign();
  const t = useTokens();
  const all = design.home.sections;
  const shown = all.filter((s) => s.visible);
  const hidden = SECTION_ORDER.filter((id) => all.some((s) => s.id === id && !s.visible));
  const searches = all.filter(isSearchSection).length;
  const last = shown.length <= 1;
  return (
    <View>
      <T v="label" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 6 }}>on home · {shown.length}</T>
      <ReorderList items={shown} keyOf={(s) => s.id} label={sectionName}
        onMove={(from, to) => update((d) => {
          const vis = d.home.sections.filter((s) => s.visible);
          moveItem(vis, from, to);
          d.home.sections = [...vis, ...d.home.sections.filter((s) => !s.visible)];
        })}
        render={(s) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, gap: 10 }}>
            <Icon name={isSearchSection(s) ? 'search' : SECTIONS[s.id].icon} size={16} color={t.c.acc} />
            <View style={{ flex: 1 }}>
              <T v="body" lines={1}>{sectionName(s)}</T>
              {isSearchSection(s) ? <T v="monoS" c="mut" lines={1}>{s.q}</T> : null}
            </View>
            <Pressable disabled={last} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove ${sectionName(s)} from Home`} style={{ padding: 6, opacity: last ? 0.25 : 1 }}
              onPress={() => update((d) => {
                if (d.home.sections.filter((x) => x.visible).length <= 1) return;
                d.home.sections = isSearchSection(s) ? d.home.sections.filter((x) => x.id !== s.id) : d.home.sections.map((x) => (x.id === s.id ? { ...x, visible: false } : x));
              })}>
              <Icon name="x" size={17} color={t.c.mut} />
            </Pressable>
          </View>
        )} />
      {last ? <T v="monoS" c="mut" style={{ paddingHorizontal: 18, paddingTop: 6 }}>Home keeps at least one section.</T> : null}

      <T v="label" c="mut" style={{ paddingHorizontal: 18, paddingTop: 22, paddingBottom: 6 }}>add to home</T>
      {hidden.length ? hidden.map((id) => (
        <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Add ${SECTIONS[id].name}`}
          onPress={() => update((d) => {
            const sec = d.home.sections.find((x) => x.id === id);
            if (!sec) return;
            d.home.sections = [...d.home.sections.filter((x) => x.visible), { ...sec, visible: true }, ...d.home.sections.filter((x) => !x.visible && x.id !== id)];
          })}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}><Icon name={SECTIONS[id].icon} size={16} color={t.c.mut} /></View>
          <View style={{ flex: 1 }}>
            <T v="body">{SECTIONS[id].name}</T>
            {compact ? null : <T v="sub" c="mut" lines={1}>{SECTIONS[id].blurb}</T>}
          </View>
          <Icon name="plus" size={18} color={t.c.acc} />
        </Pressable>
      )) : <T v="sub" c="mut" style={{ paddingHorizontal: 18 }}>Every built-in section is on Home.</T>}

      <SearchSectionForm full={searches >= MAX_SEARCH_SECTIONS} />
    </View>
  );
}

/** Add a section that lists any GitHub issue/PR search, under your own title. */
function SearchSectionForm({ full }: { full: boolean }) {
  const { update } = useDesign();
  const t = useTokens();
  const [title, setTitle] = useState('');
  const [q, setQ] = useState('');
  const fields = { visible: true, title: title.trim(), q: q.trim() };
  const ok = !full && SearchSection.safeParse({ id: 'q-check', ...fields }).success;
  const input = { padding: 11, borderRadius: 12, backgroundColor: t.c.el2, color: t.c.fg, fontSize: 14 } as const;
  const add = () => {
    if (!ok) return;
    const sec = { id: `q-${Date.now().toString(36)}`, ...fields };
    update((d) => { d.home.sections = [...d.home.sections.filter((x) => x.visible), sec, ...d.home.sections.filter((x) => !x.visible)]; });
    setTitle(''); setQ('');
  };
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 22, gap: 8 }}>
      <T v="label" c="mut">your own search</T>
      <T v="sub" c="mut">Any GitHub search can be a Home section: a label you watch, a repo’s open PRs, your drafts.</T>
      <TextInput value={title} onChangeText={setTitle} placeholder="Title, e.g. Bugs I’m in" placeholderTextColor={t.c.dim} maxLength={40} accessibilityLabel="Section title"
        style={[input, { fontFamily: t.font.ui.regular }]} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search, e.g. is:open label:bug repo:owner/name" placeholderTextColor={t.c.dim} maxLength={256} autoCapitalize="none" autoCorrect={false}
        accessibilityLabel="Search query" onSubmitEditing={add} style={[input, { fontFamily: t.font.mono.regular, fontSize: 13 }]} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {SEARCH_IDEAS.map((idea) => (
          <Pressable key={idea.title} onPress={() => { setTitle(idea.title); setQ(idea.q); }} accessibilityRole="button" accessibilityLabel={`Use idea: ${idea.title}`}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: t.c.el2 }}>
            <T v="sub">{idea.title}</T>
          </Pressable>
        ))}
      </ScrollView>
      <Button kind="quiet" icon="plus" label={full ? `Up to ${MAX_SEARCH_SECTIONS} searches` : 'Add search to Home'} disabled={!ok} onPress={add} />
    </View>
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
