import { checkSuggestion, originalLines, type ReviewComment } from '@gitling/github';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { Button, T } from '@/ui/primitives';
import type { ThreadCtx } from './ThreadView';

export const DEFAULT_APPLY_MESSAGE = 'Apply suggestion from code review';

/**
 * A ```suggestion block as a before/after card. The "before" lines come from the comment's diff hunk; when
 * they can't be found there the card shows only the new lines. Apply commits it on its own; Add to batch
 * collects several for one commit (the batch bar sits at the top of Files).
 */
export function SuggestionCard({ c, lines, ctx }: { c: ReviewComment; lines: string[]; ctx: ThreadCtx }) {
  const t = useTokens();
  const before = originalLines(c);
  const check = checkSuggestion(c, { prOpen: ctx.prOpen, canWrite: ctx.canApply });
  const inBatch = ctx.batch.some((b) => b.id === c.id);
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState(DEFAULT_APPLY_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mono = { fontFamily: t.font.mono.regular, fontSize: 12, lineHeight: 18 } as const;

  const commit = async () => {
    setBusy(true); setError(null);
    try { await ctx.onApply(c, message.trim() || DEFAULT_APPLY_MESSAGE); setCommitting(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const row = (text: string, kind: 'del' | 'add', i: number) => (
    <View key={`${kind}${i}`} style={{ flexDirection: 'row', backgroundColor: (kind === 'add' ? t.c.ok : t.c.bad) + '1F', borderLeftWidth: 2, borderColor: kind === 'add' ? t.c.ok : t.c.bad }}>
      <Text style={{ ...mono, width: 18, textAlign: 'center', color: kind === 'add' ? t.c.ok : t.c.bad }}>{kind === 'add' ? '+' : '−'}</Text>
      <Text style={{ ...mono, flex: 1, paddingRight: 8, color: t.c.fg }}>{text || ' '}</Text>
    </View>
  );

  return (
    <View style={{ borderRadius: 10, borderWidth: 1, borderColor: inBatch ? t.c.acc : t.c.line, backgroundColor: t.c.el, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: t.c.line }}>
        <T v="monoS" c="mut">Suggested change</T>
        {inBatch ? <T v="monoS" c="acc">in batch</T> : null}
      </View>
      <View style={{ paddingVertical: 4 }}>
        {before ? before.map((l, i) => row(l, 'del', i)) : null}
        {lines.map((l, i) => row(l, 'add', i))}
        {!lines.length ? <T v="monoS" c="dim" style={{ paddingHorizontal: 10, paddingVertical: 2 }}>deletes these lines</T> : null}
      </View>
      <View style={{ padding: 10, paddingTop: 6, gap: 8, borderTopWidth: 1, borderColor: t.c.line }}>
        {!check.ok ? (
          <T v="sub" c="mut" style={{ fontSize: 13 }}>{check.reason}</T>
        ) : committing ? (
          <>
            <TextInput value={message} onChangeText={setMessage} accessibilityLabel="Commit message" placeholder="Commit message" placeholderTextColor={t.c.dim}
              style={{ padding: 10, borderRadius: 10, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.ui.regular, fontSize: 14 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label={busy ? 'Committing…' : 'Commit'} accessibilityLabel="Commit" disabled={busy} onPress={commit} />
              <Button kind="quiet" label="Cancel" onPress={() => setCommitting(false)} />
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Act label="Apply" onPress={() => { setCommitting(true); setError(null); }} />
            <Act label={inBatch ? 'Remove from batch' : 'Add to batch'} tone={inBatch ? 'acc' : 'fg'} onPress={() => ctx.onToggleBatch(c)} />
          </View>
        )}
        {error ? <T v="sub" c="bad" style={{ fontSize: 13 }}>{error}</T> : null}
      </View>
    </View>
  );
}

/** A compact action button for inside the diff (the full-size Button is too tall between code lines). */
export function Act({ label, a11y, onPress, disabled, tone = 'fg' }: { label: string; a11y?: string; onPress: () => void; disabled?: boolean; tone?: 'fg' | 'acc' | 'bad' }) {
  const t = useTokens();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ disabled: !!disabled }} hitSlop={4}
      style={({ pressed }) => ({ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', borderWidth: 1, borderColor: t.c.line2, backgroundColor: t.c.el, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
      <T v="sub" c={tone} style={{ fontFamily: t.font.ui.medium, fontSize: 13 }}>{label}</T>
    </Pressable>
  );
}
