import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/design/DesignProvider';
import { useChecks, useMe, usePrFiles, useThread, useThreadActions } from '@/data/queries';
import { stateOf } from '@/features/rows';
import { htmlToText, rel } from '@/lib/format';
import { Icon } from '@/ui/Icon';
import { Avatar, Button, ErrorNote, glass, Loading, Panel, Screen, Seg, T, Ticks } from '@/ui/primitives';

export default function Thread() {
  const t = useTokens(); const insets = useSafeAreaInsets();
  const { owner, repo, number } = useLocalSearchParams<{ owner: string; repo: string; number: string }>();
  const n = Number(number);
  const { issue, pr, comments, isPr } = useThread(owner, repo, n);
  const checks = useChecks(owner, repo, pr.data?.head.ref);
  const [seg, setSeg] = useState<'conv' | 'files'>('conv');
  const files = usePrFiles(owner, repo, n, isPr && seg === 'files');
  const actions = useThreadActions(owner, repo, n);
  const me = useMe();
  const [draft, setDraft] = useState(''); const [composing, setComposing] = useState(false);
  const [armed, setArmed] = useState(false);

  const it = issue.data;
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 14 }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} accessibilityLabel="Back"><Icon name="chevron-left" size={26} /></Pressable>
      <View style={{ flex: 1 }} />
      {it ? <Pressable onPress={() => Linking.openURL(it.html_url)} hitSlop={10} accessibilityLabel="Open on GitHub"><Icon name="arrow-up-right" size={20} color={t.c.mut} /></Pressable> : null}
    </View>
  );
  if (issue.isLoading) return <Screen header={header}><Loading /></Screen>;
  if (issue.error || !it) return <Screen header={header}><ErrorNote error={issue.error} onRetry={() => issue.refetch()} /></Screen>;

  const st = stateOf({ ...it, pull_request: it.pull_request ? { ...it.pull_request, merged_at: pr.data?.merged_at ?? it.pull_request.merged_at } : undefined, draft: pr.data?.draft });
  const p = pr.data;
  const runs = checks.data?.check_runs ?? [];
  const failed = runs.filter((r) => r.conclusion && !['success', 'skipped', 'neutral'].includes(r.conclusion)).length;
  const diffTicks = p ? (() => { const total = Math.max(1, p.additions + p.deletions); const g = Math.round((p.additions / total) * 18); const r = Math.max(p.deletions ? 1 : 0, Math.round((p.deletions / total) * 18)); return [...Array(g).fill('ok'), ...Array(r).fill('bad'), ...Array(Math.max(0, 20 - g - r)).fill('none')] as ('ok' | 'bad' | 'none')[]; })() : [];
  const open = it.state === 'open';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Screen header={header} bottomSpace={120}>
        <View style={{ paddingHorizontal: 18, gap: 8 }}>
          <T v="mono" c="mut">{owner}/{repo} · #{n}</T>
          <T v="h2">{it.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: (t.c[st.k] as string) + '22' }}>
              <Icon name={st.icon} size={15} color={t.c[st.k]} /><T v="bodyStrong" c={st.k} style={{ fontSize: 13 }}>{st.label}</T>
            </View>
            {p ? <T v="monoS" c="mut">{p.base.ref} ← {p.head.ref}</T> : <T v="monoS" c="mut">{it.user.login} · {rel(it.created_at)}</T>}
          </View>
        </View>

        {p ? (
          <Panel style={{ marginHorizontal: 14, marginTop: 14 }}>
            <View style={{ padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="monoS" c="mut">{p.changed_files} files · {p.commits} commits</T>
                <T v="mono"><T v="mono" c="ok">+{p.additions}</T>  <T v="mono" c="bad">−{p.deletions}</T></T>
              </View>
              <Ticks values={diffTicks} height={12} />
            </View>
            {[
              runs.length ? { icon: failed ? 'circle-x' : 'circle-check', col: failed ? 'bad' : 'ok', text: failed ? `${failed} check${failed > 1 ? 's' : ''} failed` : 'All checks passed', meta: `${runs.length - failed}/${runs.length}` } : null,
              comments.data?.length ? { icon: 'message-circle', col: 'wait', text: `${comments.data.length} comment${comments.data.length > 1 ? 's' : ''}`, meta: rel(comments.data[comments.data.length - 1].created_at) } : null,
              open ? { icon: 'git-merge', col: 'mut', text: p.mergeable === false ? 'Has conflicts with ' + p.base.ref : p.draft ? 'Draft, not ready to merge' : 'Ready to merge, no conflicts', meta: p.base.ref } : null,
            ].filter(Boolean).map((r) => (
              <View key={r!.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderColor: t.c.line }}>
                <Icon name={r!.icon} size={18} color={t.c[r!.col as 'ok']} /><T v="body" style={{ flex: 1 }}>{r!.text}</T><T v="monoS" c="mut">{r!.meta}</T>
              </View>
            ))}
          </Panel>
        ) : null}

        {p ? <View style={{ marginHorizontal: 14, marginTop: 14 }}><Seg value={seg} onChange={setSeg} options={[{ value: 'conv', label: 'Conversation', n: (comments.data?.length ?? 0) + 1 }, { value: 'files', label: 'Files', n: p.changed_files }]} /></View> : null}

        {seg === 'files' && p ? (
          files.isLoading ? <Loading rows={3} /> : (files.data ?? []).map((f) => (
            <Panel key={f.filename} style={{ marginHorizontal: 14, marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderColor: t.c.line, gap: 8 }}>
                <T v="mono" lines={1} style={{ flex: 1 }}>{f.filename}</T>
                <T v="monoS"><T v="monoS" c="ok">+{f.additions}</T> <T v="monoS" c="bad">−{f.deletions}</T></T>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ paddingVertical: 6 }}>
                  {(f.patch ?? '').split('\n').map((ln, i) => {
                    const k = ln.startsWith('@@') ? 'hunk' : ln[0] === '+' ? 'add' : ln[0] === '-' ? 'del' : 'ctx';
                    return (
                      <Text key={i} style={{ fontFamily: t.font.mono.regular, fontSize: 12.5, lineHeight: 19, paddingHorizontal: 12, color: k === 'hunk' ? t.c.mut : t.c.fg,
                        backgroundColor: k === 'add' ? t.c.ok + '1F' : k === 'del' ? t.c.bad + '1F' : 'transparent', borderLeftWidth: 2, borderColor: k === 'add' ? t.c.ok : k === 'del' ? t.c.bad : 'transparent' }}>
                        {ln || ' '}
                      </Text>
                    );
                  })}
                </View>
              </ScrollView>
            </Panel>
          ))
        ) : (
          <View style={{ paddingTop: 8 }}>
            {[{ id: 0, user: it.user, created_at: it.created_at, body_html: it.body_html }, ...(comments.data ?? [])].map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 12 }}>
                <Avatar login={c.user.login} size={28} />
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="monoS" c="mut"><T v="bodyStrong" style={{ fontSize: 14 }}>{c.user.login}</T>  {rel(c.created_at)}</T>
                  <T v="body">{htmlToText(c.body_html) || 'No description provided.'}</T>
                </View>
              </View>
            ))}
            {composing ? (
              <View style={{ paddingHorizontal: 14, gap: 8 }}>
                <TextInput autoFocus value={draft} onChangeText={setDraft} multiline placeholder={`Comment as ${me.data?.login ?? 'you'}`} placeholderTextColor={t.c.dim}
                  style={{ minHeight: 96, padding: 12, borderRadius: 14, backgroundColor: t.c.el, borderWidth: 1, borderColor: t.c.line, color: t.c.fg, fontFamily: t.font.ui.regular, fontSize: 15, textAlignVertical: 'top' }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label={actions.comment.isPending ? 'Posting…' : 'Comment'} disabled={!draft.trim() || actions.comment.isPending} onPress={() => actions.comment.mutate(draft.trim(), { onSuccess: () => { setDraft(''); setComposing(false); } })} />
                  <Button kind="quiet" label="Cancel" onPress={() => setComposing(false)} />
                </View>
                {actions.comment.error ? <T v="sub" c="bad">{(actions.comment.error as Error).message}</T> : null}
              </View>
            ) : null}
          </View>
        )}
      </Screen>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12) + 4, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 8, width: '100%', maxWidth: 520, paddingHorizontal: 14 }}>
          <Button kind="quiet" icon="message-square" style={glass(t)} onPress={() => { setSeg('conv'); setComposing(true); }} />
          {p && open ? (
            <Button style={{ flex: 1 }} icon="git-merge" disabled={p.mergeable === false || p.draft || actions.merge.isPending}
              label={actions.merge.isPending ? 'Merging…' : armed ? 'Tap again to merge' : 'Merge'}
              onPress={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3500); return; } setArmed(false); actions.merge.mutate(); }} />
          ) : (
            <Button style={{ flex: 1 }} kind="quiet" label={open ? `Close ${isPr ? 'pull request' : 'issue'}` : 'Reopen'} onPress={() => actions.setState.mutate(open ? 'closed' : 'open')} />
          )}
          {p && open ? <Button kind="quiet" icon="x" style={glass(t)} onPress={() => actions.setState.mutate('closed')} /> : null}
        </View>
        {actions.merge.error ? <T v="sub" c="bad" style={{ marginTop: 6 }}>{(actions.merge.error as Error).message}</T> : null}
      </View>
    </View>
  );
}
