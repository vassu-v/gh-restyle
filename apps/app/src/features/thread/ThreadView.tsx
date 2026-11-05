import { splitSuggestionBody, type ReviewComment, type ReviewThread } from '@gitling/github';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { rel } from '@/lib/format';
import { routes } from '@/lib/links';
import { Avatar, Button, T } from '@/ui/primitives';
import { Markdown } from '@/ui/Markdown';
import { Act, SuggestionCard } from './Suggestion';

/**
 * What a thread needs from the screen. The screen owns the mutations and the suggestion batch, so a thread
 * that re-mounts (e.g. it turns outdated after an apply) loses nothing.
 */
export type ThreadCtx = {
  owner: string; repo: string;
  /** PR open and you may write to its branch (push access, or it's your PR). */
  prOpen: boolean; canApply: boolean;
  batch: ReviewComment[];
  onToggleBatch: (c: ReviewComment) => void;
  onApply: (c: ReviewComment, message: string) => Promise<unknown>;
  onReply: (rootId: number, body: string) => Promise<unknown>;
  onResolve: (threadId: string, resolved: boolean) => Promise<unknown>;
};

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

/** One review thread: the root comment and its replies, a Reply box, Resolve/Unresolve. Resolved threads start folded. */
export function ThreadView({ th, ctx }: { th: ReviewThread; ctx: ThreadCtx }) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'reply' | 'resolve' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const all = [th.root, ...th.replies];
  const multi = th.startLine != null && th.line != null && th.startLine !== th.line;

  const run = async (kind: 'reply' | 'resolve', f: () => Promise<unknown>, done?: () => void) => {
    setBusy(kind); setError(null);
    try { await f(); done?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  if (th.resolved && !open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Show resolved thread"
        style={{ marginHorizontal: 10, marginVertical: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: t.c.line, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v="monoS" c="ok">✓</T>
        <T v="monoS" c="mut" style={{ flex: 1 }}>Resolved · {plural(all.length, 'comment')}</T>
        {multi ? <T v="monoS" c="dim">lines {th.startLine}–{th.line}</T> : null}
      </Pressable>
    );
  }

  return (
    <View style={{ marginHorizontal: 10, marginVertical: 4, borderRadius: 10, backgroundColor: t.c.el2, overflow: 'hidden' }}>
      {multi || th.resolved ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 8 }}>
          {multi ? <T v="monoS" c="mut">lines {th.startLine}–{th.line}</T> : null}
          <View style={{ flex: 1 }} />
          {th.resolved ? (
            <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide resolved thread"><T v="monoS" c="ok">resolved · hide</T></Pressable>
          ) : null}
        </View>
      ) : null}
      {all.map((c, i) => (
        <View key={c.id} style={i ? { borderTopWidth: 1, borderColor: t.c.line } : undefined}>
          <CommentView c={c} ctx={ctx} />
        </View>
      ))}
      {replying ? (
        <View style={{ padding: 10, gap: 8, borderTopWidth: 1, borderColor: t.c.line }}>
          <TextInput autoFocus value={text} onChangeText={setText} multiline placeholder="Write a reply" placeholderTextColor={t.c.dim}
            style={{ minHeight: 64, padding: 10, borderRadius: 10, backgroundColor: t.c.el, color: t.c.fg, fontFamily: t.font.ui.regular, fontSize: 14, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={busy === 'reply' ? 'Sending…' : 'Send reply'} accessibilityLabel="Send reply" disabled={!text.trim() || !!busy}
              onPress={() => run('reply', () => ctx.onReply(th.root.id, text.trim()), () => { setText(''); setReplying(false); })} />
            <Button kind="quiet" label="Cancel" onPress={() => setReplying(false)} />
          </View>
        </View>
      ) : th.canReply || (th.threadId && (th.resolved ? th.canUnresolve : th.canResolve)) ? (
        <View style={{ flexDirection: 'row', gap: 8, padding: 10, paddingTop: 2 }}>
          {th.canReply ? <Act label="Reply" a11y="Reply to thread" onPress={() => setReplying(true)} /> : null}
          {th.threadId && !th.resolved && th.canResolve ? (
            <Act label={busy === 'resolve' ? 'Resolving…' : 'Resolve'} a11y="Resolve" disabled={!!busy} onPress={() => run('resolve', () => ctx.onResolve(th.threadId!, true))} />
          ) : null}
          {th.threadId && th.resolved && th.canUnresolve ? (
            <Act label={busy === 'resolve' ? 'Unresolving…' : 'Unresolve'} a11y="Unresolve" disabled={!!busy} onPress={() => run('resolve', () => ctx.onResolve(th.threadId!, false), () => setOpen(false))} />
          ) : null}
        </View>
      ) : null}
      {error ? <T v="sub" c="bad" style={{ paddingHorizontal: 10, paddingBottom: 8 }}>{error}</T> : null}
    </View>
  );
}

/** One review comment. Markdown parts render as usual; ```suggestion blocks become before/after cards. */
function CommentView({ c, ctx }: { c: ReviewComment; ctx: ThreadCtx }) {
  const parts = splitSuggestionBody(c.body);
  return (
    <View style={{ padding: 10, gap: 6, flexDirection: 'row' }}>
      <Pressable onPress={() => router.push(routes.user(c.user.login))} accessibilityLabel={c.user.login}><Avatar login={c.user.login} size={22} /></Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <T v="monoS" c="mut"><T v="bodyStrong" style={{ fontSize: 13 }}>{c.user.login}</T>  {rel(c.created_at)}</T>
        {parts.map((p, i) => p.kind === 'md'
          ? (p.text.trim() ? <Markdown key={i} source={p.text} base={{ owner: ctx.owner, repo: ctx.repo }} /> : null)
          : <SuggestionCard key={i} c={c} lines={p.lines} ctx={ctx} />)}
      </View>
    </View>
  );
}
