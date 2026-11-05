import { anchorFor, parsePatch, type DiffLine, type DraftComment, type PrFile, type ReviewThread } from '@gitling/github';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { Button, Panel, T } from '@/ui/primitives';
import { Act } from './Suggestion';
import { ThreadView, type ThreadCtx } from './ThreadView';

type Anchor = { line: number; side: 'LEFT' | 'RIGHT' };
type Pick = { idx: number; a: Anchor };

/**
 * One changed file of a PR. Tap a line to add a comment to your pending review; long-press a line, then tap a
 * later line of the same hunk, to comment on a range. Review threads and your drafts show under the line they
 * end on. Threads whose code has since changed are listed as "outdated" at the end of the file.
 */
export function DiffFile({ file, threads, drafts, onDraft, onRemoveDraft, canComment, ctx }: {
  file: PrFile;
  threads: ReviewThread[]; drafts: DraftComment[];
  onDraft: (d: DraftComment) => void; onRemoveDraft: (d: DraftComment) => void;
  canComment: boolean;
  ctx: ThreadCtx;
}) {
  const t = useTokens();
  const lines = useMemo(() => parsePatch(file.patch), [file.patch]);
  // The composer covers lines start.idx..end.idx (one line when they're equal) and sits under the end line.
  const [open, setOpen] = useState<{ start: Pick; end: Pick } | null>(null);
  const [rangeStart, setRangeStart] = useState<Pick | null>(null);
  const [text, setText] = useState('');
  const outdated = threads.filter((th) => th.outdated);
  const current = threads.filter((th) => !th.outdated);
  const mono = { fontFamily: t.font.mono.regular, fontSize: 12.5, lineHeight: 19 } as const;

  const sameHunk = (i: number, j: number) => !lines.slice(Math.min(i, j), Math.max(i, j) + 1).some((l) => l.kind === 'hunk');
  const tap = (p: Pick) => {
    setText('');
    if (rangeStart) {
      setRangeStart(null);
      if (rangeStart.idx !== p.idx && sameHunk(rangeStart.idx, p.idx)) {
        const [start, end] = rangeStart.idx < p.idx ? [rangeStart, p] : [p, rangeStart];
        setOpen({ start, end });
        return;
      }
    }
    setOpen(open && open.end.idx === p.idx && open.start.idx === p.idx ? null : { start: p, end: p });
  };
  const longPress = (p: Pick) => { setOpen(null); setRangeStart(p); };

  const lo = open?.start.idx ?? rangeStart?.idx ?? -1;
  const hi = open?.end.idx ?? rangeStart?.idx ?? -1;
  const isRange = !!open && open.start.idx !== open.end.idx;
  // Suggestions replace RIGHT-side (new) lines only, so Suggest needs every selected line to be one.
  const selected = open ? lines.slice(open.start.idx, open.end.idx + 1) : [];
  const canSuggest = selected.length > 0 && selected.every((l) => l.kind === 'add' || l.kind === 'ctx');
  const suggest = () => {
    const block = '```suggestion\n' + selected.map((l) => l.text.slice(1)).join('\n') + '\n```';
    setText((x) => (x.trim() ? x.replace(/\s*$/, '') + '\n' + block : block));
  };

  return (
    <Panel style={{ marginHorizontal: 14, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderColor: t.c.line, gap: 8 }}>
        <T v="mono" lines={1} style={{ flex: 1 }}>{file.filename}</T>
        <T v="monoS"><T v="monoS" c="ok">+{file.additions}</T> <T v="monoS" c="bad">−{file.deletions}</T></T>
      </View>
      {file.patch === undefined ? (
        <T v="sub" c="mut" style={{ padding: 12 }}>{file.status === 'renamed' ? 'Renamed, no content changes.' : 'Diff too large or binary. Open the PR on GitHub to see it.'}</T>
      ) : (
        <View style={{ paddingVertical: 6 }}>
          {lines.map((ln, i) => {
            const a = anchorFor(ln);
            const at = (x: { line: number | null; side: string }) => !!a && x.line === a.line && x.side === a.side;
            const here = a ? current.filter(at) : [];
            const mine = a ? drafts.filter(at) : [];
            const p = a ? { idx: i, a } : null;
            const live = !!p && canComment;
            return (
              <Fragment key={i}>
                <Pressable disabled={!live} onPress={() => p && tap(p)} onLongPress={() => p && longPress(p)}
                  accessibilityRole={live ? 'button' : undefined} accessibilityLabel={live ? `Comment on line ${a!.line}` : undefined}
                  accessibilityHint={live ? 'Long-press to start a range' : undefined}
                  accessibilityActions={live ? [{ name: 'longpress', label: `Start a range at line ${a!.line}` }] : undefined}
                  onAccessibilityAction={(e) => { if (p && e.nativeEvent.actionName === 'longpress') longPress(p); }}>
                  <LineView ln={ln} mono={mono} active={i >= lo && i <= hi} />
                </Pressable>
                {rangeStart && rangeStart.idx === i ? (
                  <View style={{ marginHorizontal: 10, marginVertical: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: t.c.accSoft, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T v="sub" c="acc" style={{ flex: 1, fontSize: 13 }}>Tap the last line of the range</T>
                    <Act label="Cancel" onPress={() => setRangeStart(null)} />
                  </View>
                ) : null}
                {here.map((th) => <ThreadView key={th.root.id} th={th} ctx={ctx} />)}
                {mine.map((d, j) => (
                  <View key={`d${j}`} style={{ marginHorizontal: 10, marginVertical: 4, padding: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.acc, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <T v="monoS" c="acc">{d.start_line != null && d.start_line !== d.line ? `pending · lines ${d.start_line}–${d.line}` : `pending · line ${d.line}`}</T>
                      <Pressable onPress={() => onRemoveDraft(d)} hitSlop={8} accessibilityLabel="Remove pending comment"><T v="monoS" c="mut">remove</T></Pressable>
                    </View>
                    <T v="sub">{d.body}</T>
                  </View>
                ))}
                {open && open.end.idx === i ? (
                  <View style={{ marginHorizontal: 10, marginVertical: 6, gap: 8 }}>
                    <TextInput autoFocus value={text} onChangeText={setText} multiline placeholderTextColor={t.c.dim}
                      placeholder={isRange ? `Comment on lines ${open.start.a.line}–${open.end.a.line}` : `Comment on line ${open.end.a.line}`}
                      style={{ minHeight: 70, padding: 10, borderRadius: 10, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.ui.regular, fontSize: 14, textAlignVertical: 'top' }} />
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <Button label="Add to review" disabled={!text.trim()} onPress={() => {
                        const { start, end } = open;
                        onDraft({ path: file.filename, line: end.a.line, side: end.a.side, ...(isRange ? { start_line: start.a.line, start_side: start.a.side } : {}), body: text.trim() });
                        setOpen(null); setText('');
                      }} />
                      {canSuggest ? <Button kind="quiet" label="Suggest" accessibilityLabel="Suggest" onPress={suggest} /> : null}
                      <Button kind="quiet" label="Cancel" onPress={() => setOpen(null)} />
                    </View>
                  </View>
                ) : null}
              </Fragment>
            );
          })}
        </View>
      )}
      {outdated.length ? (
        <View style={{ borderTopWidth: 1, borderColor: t.c.line, paddingVertical: 6 }}>
          <T v="monoS" c="mut" style={{ paddingHorizontal: 12, paddingTop: 4 }}>outdated comments</T>
          {outdated.map((th) => <ThreadView key={th.root.id} th={th} ctx={ctx} />)}
        </View>
      ) : null}
    </Panel>
  );
}

function LineView({ ln, mono, active }: { ln: DiffLine; mono: object; active: boolean }) {
  const t = useTokens();
  const kind = ln.kind;
  const num = kind === 'hunk' ? '' : String(kind === 'del' ? ln.old : ln.new);
  return (
    <View style={{ flexDirection: 'row', backgroundColor: active ? t.c.accSoft : kind === 'add' ? t.c.ok + '1F' : kind === 'del' ? t.c.bad + '1F' : 'transparent', borderLeftWidth: 2, borderColor: kind === 'add' ? t.c.ok : kind === 'del' ? t.c.bad : 'transparent' }}>
      <Text style={{ ...mono, width: 40, textAlign: 'right', paddingRight: 8, color: t.c.dim }}>{num}</Text>
      {/* Long lines wrap (like GitHub's mobile diff) so comments stay in view without sideways scrolling. */}
      <Text style={{ ...mono, flex: 1, paddingRight: 12, color: kind === 'hunk' ? t.c.mut : t.c.fg }}>{ln.text || ' '}</Text>
    </View>
  );
}
