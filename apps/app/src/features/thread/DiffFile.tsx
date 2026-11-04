import { anchorFor, parsePatch, type DiffLine, type DraftComment, type PrFile, type ReviewComment } from '@gitling/github';
import { router } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { rel } from '@/lib/format';
import { routes } from '@/lib/links';
import { Avatar, Button, Panel, T } from '@/ui/primitives';
import { Markdown } from '@/ui/Markdown';

/**
 * One changed file of a PR. Tap a line to add a comment to your pending review; existing review comments
 * and your drafts show under the line they belong to. Comments whose code has since changed are listed as
 * "outdated" at the end of the file.
 */
export function DiffFile({ file, owner, repo, existing, drafts, onDraft, onRemoveDraft, canComment }: {
  file: PrFile; owner: string; repo: string;
  existing: ReviewComment[]; drafts: DraftComment[];
  onDraft: (d: DraftComment) => void; onRemoveDraft: (d: DraftComment) => void;
  canComment: boolean;
}) {
  const t = useTokens();
  const lines = useMemo(() => parsePatch(file.patch), [file.patch]);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [text, setText] = useState('');
  const keyOf = (a: { line: number; side: string }) => `${a.side}:${a.line}`;
  const outdated = existing.filter((c) => c.line == null);
  const mono = { fontFamily: t.font.mono.regular, fontSize: 12.5, lineHeight: 19 } as const;

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
            const k = a ? keyOf(a) : null;
            const here = a ? existing.filter((c) => c.line === a.line && (c.side ?? 'RIGHT') === a.side) : [];
            const mine = a ? drafts.filter((d) => d.line === a.line && d.side === a.side) : [];
            return (
              <Fragment key={i}>
                <Pressable disabled={!canComment || !a} onPress={() => { setOpenAt(openAt === k ? null : k); setText(''); }}
                  accessibilityRole={a && canComment ? 'button' : undefined} accessibilityLabel={a && canComment ? `Comment on line ${a.line}` : undefined}>
                  <LineView ln={ln} mono={mono} active={openAt === k} />
                </Pressable>
                {here.map((c) => <InlineComment key={c.id} c={c} owner={owner} repo={repo} />)}
                {mine.map((d, j) => (
                  <View key={`d${j}`} style={{ marginHorizontal: 10, marginVertical: 4, padding: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.acc, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <T v="monoS" c="acc">pending · line {d.line}</T>
                      <Pressable onPress={() => onRemoveDraft(d)} hitSlop={8} accessibilityLabel="Remove pending comment"><T v="monoS" c="mut">remove</T></Pressable>
                    </View>
                    <T v="sub">{d.body}</T>
                  </View>
                ))}
                {a && openAt === k ? (
                  <View style={{ marginHorizontal: 10, marginVertical: 6, gap: 8 }}>
                    <TextInput autoFocus value={text} onChangeText={setText} multiline placeholder={`Comment on line ${a.line}`} placeholderTextColor={t.c.dim}
                      style={{ minHeight: 70, padding: 10, borderRadius: 10, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.ui.regular, fontSize: 14, textAlignVertical: 'top' }} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button label="Add to review" disabled={!text.trim()} onPress={() => { onDraft({ path: file.filename, line: a.line, side: a.side, body: text.trim() }); setOpenAt(null); setText(''); }} />
                      <Button kind="quiet" label="Cancel" onPress={() => setOpenAt(null)} />
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
          {outdated.map((c) => <InlineComment key={c.id} c={c} owner={owner} repo={repo} />)}
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

function InlineComment({ c, owner, repo }: { c: ReviewComment; owner: string; repo: string }) {
  const t = useTokens();
  return (
    <View style={{ marginHorizontal: 10, marginVertical: 4, padding: 10, borderRadius: 10, backgroundColor: t.c.el2, gap: 6, flexDirection: 'row' }}>
      <Pressable onPress={() => router.push(routes.user(c.user.login))}><Avatar login={c.user.login} size={22} /></Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <T v="monoS" c="mut"><T v="bodyStrong" style={{ fontSize: 13 }}>{c.user.login}</T>  {rel(c.created_at)}</T>
        <Markdown source={c.body} base={{ owner, repo }} />
      </View>
    </View>
  );
}
