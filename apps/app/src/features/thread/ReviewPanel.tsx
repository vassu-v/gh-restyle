import type { DraftComment, ReviewEvent } from '@gitling/github';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { Button, Panel, Seg, T } from '@/ui/primitives';

/**
 * Finish a review: pick a verdict, write an optional summary, send it with your pending line comments.
 * GitHub's rules, enforced here so the button explains itself:
 *  - you can't approve or request changes on your own pull request (only comment)
 *  - "Request changes" needs a summary; "Comment" needs a summary or at least one line comment
 */
export function ReviewPanel({ ownPr, drafts, pending, error, onSubmit, onCancel }: {
  ownPr: boolean; drafts: DraftComment[]; pending: boolean; error: unknown;
  onSubmit: (r: { event: ReviewEvent; body: string }) => void; onCancel: () => void;
}) {
  const t = useTokens();
  const [event, setEvent] = useState<ReviewEvent>(ownPr ? 'COMMENT' : 'APPROVE');
  const [body, setBody] = useState('');
  const options = ownPr
    ? [{ value: 'COMMENT' as const, label: 'Comment' }]
    : [{ value: 'COMMENT' as const, label: 'Comment' }, { value: 'APPROVE' as const, label: 'Approve' }, { value: 'REQUEST_CHANGES' as const, label: 'Changes' }];
  const missing = event === 'REQUEST_CHANGES' && !body.trim() ? 'Say what needs to change.'
    : event === 'COMMENT' && !body.trim() && !drafts.length ? 'Write a summary or add line comments in Files.' : null;
  const label = pending ? 'Sending…' : event === 'APPROVE' ? 'Approve' : event === 'REQUEST_CHANGES' ? 'Request changes' : 'Send review';

  return (
    <Panel style={{ marginHorizontal: 14, marginTop: 12, padding: 14, gap: 10 }} tint={t.c.acc}>
      <T v="bodyStrong">Your review</T>
      {options.length > 1 ? <Seg small value={event} onChange={setEvent} options={options} /> : <T v="sub" c="mut">{"This is your pull request, so you can comment but not approve it."}</T>}
      <TextInput value={body} onChangeText={setBody} multiline placeholder={event === 'APPROVE' ? 'Optional note, e.g. "Looks good"' : 'Summary'} placeholderTextColor={t.c.dim}
        style={{ minHeight: 80, padding: 12, borderRadius: 12, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.ui.regular, fontSize: 15, textAlignVertical: 'top' }} />
      <T v="monoS" c="mut">{drafts.length ? `${drafts.length} line comment${drafts.length > 1 ? 's' : ''} will be sent with this review` : 'Tip: tap a line in Files to comment on it'}</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} kind={event === 'REQUEST_CHANGES' ? 'danger' : 'primary'} label={label} disabled={pending || !!missing} onPress={() => onSubmit({ event, body: body.trim() })} />
        <Button kind="quiet" label="Cancel" onPress={onCancel} />
      </View>
      {missing && (body || drafts.length) ? <T v="sub" c="mut">{missing}</T> : null}
      {error ? <T v="sub" c="bad">{(error as Error).message}</T> : null}
    </Panel>
  );
}
