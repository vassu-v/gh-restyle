import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/design/DesignProvider';
import type { MergeMethod } from '@gitling/github';
import { useChecks, useMe, usePrFiles, useRepo, useThread, useThreadActions } from '@/data/queries';
import { stateOf } from '@/features/rows';
import { rel } from '@/lib/format';
import { routes } from '@/lib/links';
import { Markdown } from '@/ui/Markdown';
import { Icon } from '@/ui/Icon';
import { Avatar, Button, ErrorNote, glass, Loading, Panel, Screen, Seg, T, Ticks } from '@/ui/primitives';

export default function Thread() {
  const t = useTokens(); const insets = useSafeAreaInsets();
  const { owner, repo, number } = useLocalSearchParams<{ owner: string; repo: string; number: string }>();
  const n = Number(number);
  const { issue, pr, comments, isPr } = useThread(owner, repo, n);
  const checks = useChecks(owner, repo, pr.data?.head.sha);
  const repoInfo = useRepo(owner, repo);
  const [seg, setSeg] = useState<'conv' | 'files'>('conv');
  const files = usePrFiles(owner, repo, n, isPr && seg === 'files');
  const actions = useThreadActions(owner, repo, n);
  const me = useMe();
  const [draft, setDraft] = useState(''); const [composing, setComposing] = useState(false);
  const [armed, setArmed] = useState(false);
  const methods = mergeMethods(repoInfo.data);
  const [method, setMethod] = useState<MergeMethod | null>(null);
  const chosen = method && methods.includes(method) ? method : methods[0];
  // Write actions only when GitHub says you can push (permissions is absent on repos you can't write to).
  const canWrite = !!repoInfo.data?.permissions?.push;

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
          <Pressable onPress={() => router.push(routes.repo(owner, repo))}><T v="mono" c="mut">{owner}/{repo} · #{n}</T></Pressable>
          <T v="h2">{it.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: (t.c[st.k] as string) + '22' }}>
              <Icon name={st.icon} size={15} color={t.c[st.k]} /><T v="bodyStrong" c={st.k} style={{ fontSize: 13 }}>{st.label}</T>
            </View>
            {p ? <T v="monoS" c="mut">{p.base.ref} ← {p.head.ref}</T> : <T v="monoS" c="mut">{it.user.login} · {rel(it.created_at)}</T>}
            {it.labels.map((l) => <View key={l.name} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: '#' + l.color + '88' }}><T v="monoS" style={{ color: t.mode === 'dark' ? '#' + l.color : t.c.fg }}>{l.name}</T></View>)}
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
              open ? { icon: 'git-merge', col: 'mut', text: p.mergeable === false ? 'Has conflicts with ' + p.base.ref : p.draft ? 'Draft, not ready to merge' : p.mergeable === null ? 'Checking if it can merge…' : 'Ready to merge, no conflicts', meta: p.base.ref } : null,
            ].filter(Boolean).map((r) => (
              <View key={r!.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderColor: t.c.line }}>
                <Icon name={r!.icon} size={18} color={t.c[r!.col as 'ok']} /><T v="body" style={{ flex: 1 }}>{r!.text}</T><T v="monoS" c="mut">{r!.meta}</T>
              </View>
            ))}
          </Panel>
        ) : null}

        {p ? <View style={{ marginHorizontal: 14, marginTop: 14 }}><Seg value={seg} onChange={setSeg} options={[{ value: 'conv', label: 'Conversation', n: (comments.data?.length ?? 0) + 1 }, { value: 'files', label: 'Files', n: p.changed_files }]} /></View> : null}

        {seg === 'files' && p ? (
          files.isLoading ? <Loading rows={3} /> : files.error ? <ErrorNote error={files.error} onRetry={() => files.refetch()} /> : (files.data ?? []).map((f) => (
            <Panel key={f.filename} style={{ marginHorizontal: 14, marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderColor: t.c.line, gap: 8 }}>
                <T v="mono" lines={1} style={{ flex: 1 }}>{f.filename}</T>
                <T v="monoS"><T v="monoS" c="ok">+{f.additions}</T> <T v="monoS" c="bad">−{f.deletions}</T></T>
              </View>
              {f.patch === undefined ? <T v="sub" c="mut" style={{ padding: 12 }}>{f.status === 'renamed' ? 'Renamed, no content changes.' : 'Diff too large or binary. Open the PR on GitHub to see it.'}</T> : (
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
              )}
            </Panel>
          ))
        ) : (
          <View style={{ paddingTop: 8 }}>
            {[{ id: 0, user: it.user, created_at: it.created_at, body: it.body }, ...(comments.data ?? [])].map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 12 }}>
                <Pressable onPress={() => router.push(routes.user(c.user.login))}><Avatar login={c.user.login} size={28} /></Pressable>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <T v="monoS" c="mut"><T v="bodyStrong" style={{ fontSize: 14 }}>{c.user.login}</T>  {rel(c.created_at)}</T>
                  {c.body?.trim() ? <Markdown source={c.body} base={{ owner, repo }} /> : <T v="sub" c="mut">No description provided.</T>}
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
        {p && open && canWrite && armed && methods.length > 1 ? (
          <View style={{ width: '100%', maxWidth: 520, paddingHorizontal: 14, marginBottom: 8 }}>
            <View style={[{ borderRadius: 14, padding: 4 }, glass(t)]}>
              <Seg small value={chosen} onChange={(m) => { setMethod(m); setArmed(true); }} options={methods.map((m) => ({ value: m, label: MERGE_LABEL[m] }))} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, width: '100%', maxWidth: 520, paddingHorizontal: 14 }}>
          <Button kind="quiet" icon="message-square" style={glass(t)} onPress={() => { setSeg('conv'); setComposing(true); }} />
          {p && open && canWrite ? (
            <Button style={{ flex: 1 }} icon="git-merge" disabled={p.mergeable === false || p.draft || actions.merge.isPending}
              label={actions.merge.isPending ? 'Merging…' : armed ? `Tap again to ${MERGE_VERB[chosen]}` : 'Merge'}
              onPress={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 6000); return; } setArmed(false); actions.merge.mutate(chosen); }} />
          ) : p && open && !canWrite ? (
            <Button style={{ flex: 1 }} kind="quiet" icon="check" label={actions.approve.isSuccess ? 'Approved' : actions.approve.isPending ? 'Approving…' : 'Approve'}
              disabled={actions.approve.isPending || actions.approve.isSuccess || it.user.login === me.data?.login} onPress={() => actions.approve.mutate()} />
          ) : canWrite ? (
            <Button style={{ flex: 1 }} kind="quiet" label={open ? `Close ${isPr ? 'pull request' : 'issue'}` : 'Reopen'} disabled={actions.setState.isPending} onPress={() => actions.setState.mutate(open ? 'closed' : 'open')} />
          ) : <View style={{ flex: 1 }} />}
          {p && open && canWrite ? <Button kind="quiet" icon="x" style={glass(t)} onPress={() => actions.setState.mutate('closed')} /> : null}
        </View>
        {[actions.merge.error, actions.setState.error, actions.approve.error].filter(Boolean).slice(0, 1).map((e) => <T key="e" v="sub" c="bad" style={{ marginTop: 6 }}>{(e as Error).message}</T>)}
      </View>
    </View>
  );
}

const MERGE_LABEL: Record<MergeMethod, string> = { merge: 'Merge commit', squash: 'Squash', rebase: 'Rebase' };
const MERGE_VERB: Record<MergeMethod, string> = { merge: 'merge', squash: 'squash and merge', rebase: 'rebase and merge' };
/** Merge methods the repo allows, in GitHub's order. The flags are only returned to people who can push. */
function mergeMethods(r?: { allow_merge_commit?: boolean; allow_squash_merge?: boolean; allow_rebase_merge?: boolean }): MergeMethod[] {
  const out: MergeMethod[] = [];
  if (r?.allow_merge_commit !== false) out.push('merge');
  if (r?.allow_squash_merge) out.push('squash');
  if (r?.allow_rebase_merge) out.push('rebase');
  return out.length ? out : ['merge'];
}
