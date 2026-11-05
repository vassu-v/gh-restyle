import { Tile, TINTS, type TileTarget } from '@gitling/design';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useDesign } from '@/design/DesignProvider';
import { TileView } from '@/features/tiles/TileView';
import { Icon, TILE_ICONS } from '@/ui/Icon';
import { Button, Chips, Screen, Seg, T } from '@/ui/primitives';

const TYPES: { value: TileTarget['type']; label: string }[] = [
  { value: 'search', label: 'Search' }, { value: 'repo', label: 'Repo' }, { value: 'user', label: 'Person' }, { value: 'file', label: 'File' },
  { value: 'inbox', label: 'Inbox filter' }, { value: 'link', label: 'Link' }, { value: 'ask', label: 'Ask first' },
];
const DEFAULT_TARGET: Record<TileTarget['type'], TileTarget> = {
  search: { type: 'search', q: 'is:open is:pr author:@me' }, repo: { type: 'repo', repo: '', tab: 'overview' }, user: { type: 'user', login: '' },
  file: { type: 'file', repo: '', path: '' }, inbox: { type: 'inbox', filter: 'mention' }, link: { type: 'link', url: 'https://' },
  ask: { type: 'ask', prompt: 'Search code for…', template: 'https://github.com/search?type=code&q={query}', dest: 'link' },
};

export default function TileEditor() {
  const { design, tokens: t, update } = useDesign();
  const { id, setup } = useLocalSearchParams<{ id: string; setup?: string }>();
  const existing = design.tiles.find((x) => x.id === id);
  const [d, setD] = useState<Tile>(() => existing ?? { id: `t-${Date.now().toString(36)}`, label: 'New shortcut', icon: 'eye', tint: '#F2C25B', count: true, size: 'half', target: DEFAULT_TARGET.search });
  const [armed, setArmed] = useState(false);
  const check = useMemo(() => Tile.safeParse(d), [d]);
  const set = (patch: Partial<Tile>) => setD((x) => ({ ...x, ...patch }));
  const setT = (patch: Record<string, unknown>) => setD((x) => ({ ...x, target: { ...x.target, ...patch } as TileTarget }));
  const tg = d.target;

  const field = (label: string, value: string, onChange: (v: string) => void, ph: string, mono = true) => (
    <View style={{ paddingHorizontal: 14, gap: 6, marginTop: 10 }}>
      <T v="label" c="mut">{label}</T>
      <TextInput value={value} onChangeText={onChange} placeholder={ph} placeholderTextColor={t.c.dim} autoCapitalize="none" autoCorrect={false}
        style={{ padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: mono ? t.font.mono.regular : t.font.ui.regular, fontSize: 14 }} />
    </View>
  );

  function save() {
    if (!check.success) return;
    update((des) => { const i = des.tiles.findIndex((x) => x.id === d.id); if (i >= 0) des.tiles[i] = check.data; else des.tiles.push(check.data); });
    router.back();
  }

  return (
    <Screen bottomSpace={40} header={
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}><T v="body" c="mut">Cancel</T></Pressable>
        <T v="bodyStrong" style={{ fontSize: 17 }}>{existing ? 'Edit shortcut' : 'New shortcut'}</T>
        <Pressable onPress={save} disabled={!check.success} hitSlop={10}><T v="bodyStrong" c={check.success ? 'acc' : 'dim'}>Save</T></Pressable>
      </View>
    }>
      <View style={{ marginHorizontal: 14, height: 190, borderRadius: 24, backgroundColor: t.mode === 'dark' ? '#15161A' : '#E7E7E3', borderWidth: 1, borderColor: t.c.line, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: d.size === 'full' ? 330 : 176 }}><TileView tile={{ ...d, count: false }} preview /></View>
      </View>
      {setup ? <T v="sub" c="mut" style={{ paddingHorizontal: 18, paddingTop: 10 }}>This shortcut points at the sample account. Choose one of your repos for it to open.</T> : null}
      {!check.success ? <T v="sub" c="bad" style={{ paddingHorizontal: 18, paddingTop: 8 }}>{check.error.issues[0]?.message === 'Invalid input' ? 'Fill in where it opens.' : check.error.issues[0]?.message}</T> : null}

      <T v="label" c="mut" style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 }}>what it opens</T>
      <View style={{ paddingHorizontal: 14 }}><Chips scroll={false} value={tg.type} onChange={(v) => set({ target: DEFAULT_TARGET[v], count: v === 'search' || v === 'inbox' ? d.count : false })} options={TYPES} /></View>
      {tg.type === 'search' ? field('search query', tg.q, (q) => setT({ q }), 'is:open is:pr review-requested:@me') : null}
      {tg.type === 'repo' ? <>{field('repository', tg.repo, (repo) => setT({ repo }), 'owner/name')}
        <View style={{ paddingHorizontal: 14, marginTop: 10 }}><Seg small value={tg.tab} onChange={(tab) => setT({ tab })} options={[{ value: 'overview', label: 'Open' }, { value: 'issues', label: 'Issues' }, { value: 'prs', label: 'PRs' }]} /></View></> : null}
      {tg.type === 'user' ? field('username', tg.login, (login) => setT({ login }), 'octocat') : null}
      {tg.type === 'file' ? <>{field('repository', tg.repo, (repo) => setT({ repo }), 'owner/name')}{field('path', tg.path, (path) => setT({ path }), 'src/index.ts')}</> : null}
      {tg.type === 'inbox' ? <View style={{ paddingHorizontal: 14, marginTop: 10 }}><Chips scroll={false} value={tg.filter} onChange={(filter) => setT({ filter })} options={[{ value: 'all', label: 'Everything' }, { value: 'review_requested', label: 'Reviews' }, { value: 'mention', label: 'Mentions' }, { value: 'assign', label: 'Assigned' }, { value: 'ci_activity', label: 'Checks' }]} /></View> : null}
      {tg.type === 'link' ? field('link', tg.url, (url) => setT({ url }), 'https://…') : null}
      {tg.type === 'ask' ? <>{field('question', tg.prompt, (prompt) => setT({ prompt }), 'Search code for…', false)}
        <View style={{ paddingHorizontal: 14, marginTop: 10 }}><Seg small value={tg.dest} onChange={(dest) => setT({ dest, template: dest === 'link' ? 'https://github.com/search?q={query}' : '{query}' })} options={[{ value: 'issues', label: 'Issue search' }, { value: 'repos', label: 'Repo search' }, { value: 'link', label: 'A link' }]} /></View>
        {field('template · {query} is what you type', tg.template, (template) => setT({ template }), 'is:open {query}')}</> : null}

      <T v="label" c="mut" style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 }}>icon</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14 }}>
        {TILE_ICONS.map((ic) => (
          <Pressable key={ic} onPress={() => set({ icon: ic })} accessibilityLabel={ic} style={{ width: 44, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: d.icon === ic ? t.c.fg : t.c.el2 }}>
            <Icon name={ic} size={18} color={d.icon === ic ? t.c.onFg : t.c.mut} />
          </Pressable>
        ))}
      </View>

      <View style={{ marginHorizontal: 14, marginTop: 18, borderRadius: 16, backgroundColor: t.c.el, borderWidth: 1, borderColor: t.c.line, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, gap: 10 }}>
          <T v="body">Label</T>
          <TextInput value={d.label} onChangeText={(label) => set({ label })} maxLength={40} style={{ flex: 1, textAlign: 'right', color: t.c.mut, fontFamily: t.font.ui.regular, fontSize: 15, paddingVertical: 8 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderColor: t.c.line }}>
          <T v="body">Tint</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {TINTS.map((c) => <Pressable key={c} onPress={() => set({ tint: c })} accessibilityLabel={`Tint ${c}`} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, borderWidth: 2, borderColor: d.tint === c ? t.c.fg : 'transparent' }} />)}
          </View>
        </View>
        {tg.type === 'search' || tg.type === 'inbox' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderColor: t.c.line }}>
            <T v="body">Live count</T><Seg small value={d.count ? 'on' : 'off'} onChange={(v) => set({ count: v === 'on' })} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderColor: t.c.line }}>
          <T v="body">Size</T><Seg small value={d.size} onChange={(size) => set({ size })} options={[{ value: 'half', label: 'Half' }, { value: 'full', label: 'Full' }]} />
        </View>
      </View>

      {existing ? (
        <Button kind="danger" label={armed ? 'Tap again to delete' : 'Delete shortcut'} style={{ margin: 14, marginTop: 22 }}
          onPress={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3500); return; } update((des) => { des.tiles = des.tiles.filter((x) => x.id !== d.id); }); router.back(); }} />
      ) : null}
    </Screen>
  );
}
