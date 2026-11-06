import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/design/DesignProvider';
import type { DraftComment, MergeMethod, ReviewComment, ReviewState } from '@gitling/github';
import { useChecks, useMe, usePrFiles, useRepo, useReviews, useReviewThreads, useThread, useThreadActions } from '@/data/queries';
import { DiffFile } from '@/features/thread/DiffFile';
import type { ThreadCtx } from '@/features/thread/ThreadView';
import { ReviewPanel } from '@/features/thread/ReviewPanel';
import { stateOf } from '@/features/rows';
import { rel } from '@/lib/format';
import { routes } from '@/lib/links';
import { Markdown } from '@/ui/Markdown';
import { reveal } from '@/ui/reveal';
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
  // One disarm timer at a time: an older timer must not disarm a button re-armed (or a method picked) since.
  const disarm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(disarm.current), []);
  // Closing also takes two taps (a lone ✕ next to Merge was easy to hit by accident): "Close", then "Tap again to close".
  const [closeArmed, setCloseArmed] = useState(false);
  const closeDisarm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeDisarm.current), []);
  const close = () => {
    clearTimeout(closeDisarm.current);
    if (!closeArmed) { setArmed(false); setCloseArmed(true); closeDisarm.current = setTimeout(() => setCloseArmed(false), 6000); return; }
    setCloseArmed(false); actions.setState.mutate('closed');
  };
  const review = useReviews(owner, repo, n, isPr);
  const threads = useReviewThreads(owner, repo, n, isPr && seg === 'files');
  // Suggestions collected for one commit, and the note after a commit (kept here: applied threads re-mount as outdated).
  const [batch, setBatch] = useState<ReviewComment[]>([]);
  const [applied, setApplied] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftComment[]>([]);
  // The head commit the pending comments' line numbers refer to: the one the diff on screen was read at (not the
  // PR's current head, which may have moved). Sent as commit_id so GitHub places them on that diff.
  const [draftSha, setDraftSha] = useState<string | undefined>(undefined);
  // Pending comments belong to one head commit. If the PR moved on since, a new comment would be on a different
  // diff, and one commit_id can't place both: send or discard the old ones first.
  const draftsStale = drafts.length > 0 && !!files.data && files.data.sha !== draftSha;
  const [reviewing, setReviewing] = useState(false);
  const [reviewDone, setReviewDone] = useState<string | null>(null);
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
  const ctx: ThreadCtx = {
    owner, repo, prOpen: open && !!p,
    // GitHub lets people with push access, and the PR's author, commit to its branch.
    canApply: open && (canWrite || (!!me.data?.login && it.user.login === me.data.login)),
    batch,
    onToggleBatch: (c) => { setApplied(null); setBatch((b) => (b.some((x) => x.id === c.id) ? b.filter((x) => x.id !== c.id) : [...b, c])); },
    onApply: (c, message) => actions.applySuggestions.mutateAsync({ comments: [c], message }).then(() => {
      setBatch((b) => b.filter((x) => x.id !== c.id)); setApplied('Suggestion applied.');
    }),
    onReply: (rootId, body) => actions.reply.mutateAsync({ rootId, body }),
    onResolve: (threadId, resolved) => actions.resolve.mutateAsync({ threadId, resolved }),
  };
  const commitBatch = () => actions.applySuggestions.mutate({ comments: batch }, { onSuccess: () => { setBatch([]); setApplied('Suggestions applied.'); } });

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
          files.isLoading || threads.isLoading ? <Loading rows={3} /> : files.error || threads.error ? <ErrorNote error={files.error ?? threads.error} onRetry={() => { files.refetch(); threads.refetch(); }} /> : (
            <>
              {batch.length ? (
                <Panel style={{ marginHorizontal: 14, marginTop: 12, padding: 12, gap: 10 }} tint={t.c.acc}>
                  <T v="bodyStrong">{batch.length} suggestion{batch.length === 1 ? '' : 's'} in batch</T>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button style={{ flex: 1 }} label={actions.applySuggestions.isPending ? 'Committing…' : 'Commit batch'} accessibilityLabel="Commit batch" disabled={actions.applySuggestions.isPending} onPress={commitBatch} />
                    <Button kind="quiet" label="Clear" onPress={() => setBatch([])} />
                  </View>
                  {actions.applySuggestions.error ? <T v="sub" c="bad">{(actions.applySuggestions.error as Error).message}</T> : null}
                </Panel>
              ) : null}
              {draftsStale ? (
                <Panel style={{ marginHorizontal: 14, marginTop: 12, padding: 12, gap: 10 }} tint={t.c.wait}>
                  <T v="sub">New commits arrived after your {drafts.length} pending comment{drafts.length === 1 ? '' : 's'}. Send the review (they stay on the lines you picked) or discard them before commenting on the new code.</T>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button style={{ flex: 1 }} label="Send review" onPress={() => setReviewing(true)} />
                    <Button kind="quiet" label="Discard" onPress={() => setDrafts([])} />
                  </View>
                </Panel>
              ) : null}
              {applied ? <T v="sub" c="ok" style={{ paddingHorizontal: 18, paddingTop: 10 }}>{applied}</T> : null}
              {open ? <T v="monoS" c="dim" style={{ paddingHorizontal: 18, paddingTop: 10 }}>tap a line to comment on it, long-press to pick a range</T> : null}
              {(files.data?.files ?? []).map((f) => (
                <DiffFile key={f.filename} file={f} canComment={open} ctx={ctx}
                  threads={threads.threads.filter((th) => th.path === f.filename)}
                  drafts={drafts.filter((d) => d.path === f.filename)}
                  onDraft={(d) => { if (draftsStale) return false; setDraftSha((s) => (drafts.length ? s : files.data?.sha)); setDrafts((x) => [...x, d]); setReviewDone(null); }}
                  onRemoveDraft={(d) => setDrafts((x) => x.filter((y) => y !== d))} />
              ))}
            </>
          )
        ) : (
          <View style={{ paddingTop: 8 }}>
            {reviewing && p ? (
              <View ref={reveal}><ReviewPanel ownPr={it.user.login === me.data?.login} drafts={drafts} pending={actions.review.isPending} error={actions.review.error}
                onCancel={() => setReviewing(false)}
                onSubmit={(r) => actions.review.mutate({ ...r, comments: drafts, commitId: drafts.length ? draftSha : undefined }, { onSuccess: () => { setDrafts([]); setReviewing(false); setReviewDone(REVIEW_DONE[r.event]); } })} /></View>
            ) : null}
            {reviewDone ? <T v="sub" c="ok" style={{ paddingHorizontal: 18, paddingTop: 10 }}>{reviewDone}</T> : null}
            {timeline(it, comments.data ?? [], review.reviews.data ?? []).map((c) => c.kind === 'review' ? (
              <View key={c.key} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 28, alignItems: 'center', paddingTop: 2 }}><Icon name={REVIEW_LOOK[c.state].icon} size={18} color={t.c[REVIEW_LOOK[c.state].col]} /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <T v="sub"><T v="bodyStrong" style={{ fontSize: 14 }}>{c.user.login}</T> <T v="sub" c="mut">{REVIEW_LOOK[c.state].text} · {rel(c.created_at)}</T></T>
                  {c.body?.trim() ? <Markdown source={c.body} base={{ owner, repo }} /> : null}
                </View>
              </View>
            ) : (
              <View key={c.key} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 12 }}>
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
                <View ref={reveal} style={{ flexDirection: 'row', gap: 8 }}>
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
              <Seg small value={chosen} onChange={(m) => { setMethod(m); setArmed(true); clearTimeout(disarm.current); disarm.current = setTimeout(() => setArmed(false), 6000); }} options={methods.map((m) => ({ value: m, label: MERGE_LABEL[m] }))} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, width: '100%', maxWidth: 520, paddingHorizontal: 14 }}>
          <Button kind="quiet" icon="message-square" style={glass(t)} accessibilityLabel="Write a comment" onPress={() => { setSeg('conv'); setComposing(true); }} />
          {p && open ? (
            <Button kind="quiet" icon="list-checks" style={[glass(t), canWrite ? {} : { flex: 1 }]} label={`Review${drafts.length ? ` · ${drafts.length}` : ''}`}
              onPress={() => { setSeg('conv'); setReviewing(true); setReviewDone(null); }} />
          ) : null}
          {p && open && canWrite && !closeArmed ? (
            <Button style={{ flex: 1 }} icon="git-merge" disabled={p.mergeable === false || p.draft || actions.merge.isPending}
              label={actions.merge.isPending ? 'Merging…' : armed ? `Tap again to ${MERGE_VERB[chosen]}` : 'Merge'}
              onPress={() => { clearTimeout(disarm.current); setCloseArmed(false); if (!armed) { setArmed(true); disarm.current = setTimeout(() => setArmed(false), 6000); return; } setArmed(false); actions.merge.mutate(chosen); }} />
          ) : !p && canWrite ? (
            <Button style={{ flex: 1 }} kind={open && closeArmed ? 'danger' : 'quiet'} label={open ? (closeArmed ? 'Tap again to close' : 'Close issue') : 'Reopen'} disabled={actions.setState.isPending} onPress={() => (open ? close() : actions.setState.mutate('open'))} />
          ) : p && !open && canWrite && !p.merged ? (
            <Button style={{ flex: 1 }} kind="quiet" label="Reopen" disabled={actions.setState.isPending} onPress={() => actions.setState.mutate('open')} />
          ) : !(p && open) ? <View style={{ flex: 1 }} /> : null}
          {p && open && canWrite && !armed ? (
            <Button kind={closeArmed ? 'danger' : 'quiet'} icon="x" style={[glass(t), closeArmed ? { flex: 1 } : {}]} disabled={actions.setState.isPending}
              label={closeArmed ? 'Tap again to close' : 'Close'} accessibilityLabel={closeArmed ? 'Tap again to close the pull request' : 'Close pull request'} onPress={close} />
          ) : null}
        </View>
        {[actions.merge.error, actions.setState.error].filter(Boolean).slice(0, 1).map((e) => <T key="e" v="sub" c="bad" style={{ marginTop: 6 }}>{(e as Error).message}</T>)}
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

const REVIEW_DONE = { APPROVE: 'You approved this pull request.', REQUEST_CHANGES: 'You requested changes.', COMMENT: 'Review sent.' } as const;
const REVIEW_LOOK: Record<ReviewState, { icon: string; col: 'ok' | 'bad' | 'mut' | 'wait'; text: string }> = {
  APPROVED: { icon: 'circle-check', col: 'ok', text: 'approved these changes' },
  CHANGES_REQUESTED: { icon: 'circle-x', col: 'bad', text: 'requested changes' },
  COMMENTED: { icon: 'message-circle', col: 'mut', text: 'reviewed' },
  DISMISSED: { icon: 'circle-x', col: 'mut', text: 'review dismissed' },
  PENDING: { icon: 'clock', col: 'wait', text: 'review pending' },
};
type Entry =
  | { kind: 'comment'; key: string; user: { login: string }; created_at: string; body?: string | null }
  | { kind: 'review'; key: string; user: { login: string }; created_at: string; body?: string | null; state: ReviewState };
/** The opening post, comments and reviews in date order. Reviews still pending (yours, unsent) are skipped. */
function timeline(it: { user: { login: string }; created_at: string; body?: string | null }, comments: { id: number; user: { login: string }; created_at: string; body?: string | null }[], reviews: { id: number; user: { login: string }; submitted_at?: string; body: string | null; state: ReviewState }[]): Entry[] {
  const out: Entry[] = [
    ...comments.map((c) => ({ kind: 'comment' as const, key: `c${c.id}`, user: c.user, created_at: c.created_at, body: c.body })),
    ...reviews.filter((r) => r.state !== 'PENDING' && r.submitted_at).map((r) => ({ kind: 'review' as const, key: `r${r.id}`, user: r.user, created_at: r.submitted_at!, body: r.body, state: r.state })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return [{ kind: 'comment', key: 'op', user: it.user, created_at: it.created_at, body: it.body }, ...out];
}
