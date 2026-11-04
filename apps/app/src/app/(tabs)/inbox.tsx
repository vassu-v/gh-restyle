import { SAMPLE_NOTIFICATION_ACTORS, type Notification } from '@gitling/github';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { useNotifications, useTriage } from '@/data/queries';
import { SwipeRow } from '@/features/inbox/SwipeRow';
import { dayGroup, pad2, rel } from '@/lib/format';
import { useSession } from '@/session/SessionProvider';
import { Avatar, Chips, Empty, ErrorNote, Loading, Num, Screen, T } from '@/ui/primitives';

type F = 'all' | 'review_requested' | 'mention' | 'ci_activity';
const BADGE: Record<string, [string, 'fg' | 'ok' | 'wait' | 'acc' | 'bad' | 'mut']> = {
  comment: ['message-circle', 'fg'], author: ['circle-dot', 'ok'], review_requested: ['git-pull-request', 'wait'], mention: ['at-sign', 'acc'],
  team_mention: ['at-sign', 'acc'], assign: ['circle-dot', 'ok'], ci_activity: ['circle-x', 'bad'], subscribed: ['tag', 'mut'], state_change: ['git-merge', 'mut'],
};
const REASON_TEXT: Record<string, string> = { comment: 'New comment', author: 'Activity on your thread', review_requested: 'Review requested', mention: 'You were mentioned', assign: 'Assigned to you', ci_activity: 'Check run', subscribed: 'Watching', state_change: 'State changed' };

function open(n: Notification) {
  const m = n.subject.url?.match(/\/repos\/([^/]+)\/([^/]+)\/(issues|pulls)\/(\d+)/);
  if (m) router.push({ pathname: '/thread/[owner]/[repo]/[number]', params: { owner: m[1], repo: m[2], number: m[4] } });
}

export default function Inbox() {
  const t = useTokens(); const { isSample } = useSession();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [f, setF] = useState<F>('all');
  // A tile can open the inbox on a filter: follow the param when it changes.
  const [seenFilter, setSeenFilter] = useState(params.filter);
  if (params.filter !== seenFilter) {
    setSeenFilter(params.filter);
    if (params.filter && ['all', 'review_requested', 'mention', 'ci_activity'].includes(params.filter)) setF(params.filter as F);
  }
  const q = useNotifications(true);
  const triage = useTriage();
  const [hidden, setHidden] = useState<Record<string, 'done' | 'read'>>({});
  const [toast, setToast] = useState<{ id: string; kind: 'done' | 'read' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function act(id: string, kind: 'done' | 'read') {
    if (timer.current && toast) triage.mutate(toast); // commit the previous one right away
    setHidden((h) => ({ ...h, [id]: kind })); setToast({ id, kind });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { triage.mutate({ id, kind }); setToast(null); timer.current = null; }, 4000);
  }
  function undoLast() {
    if (!toast) return; if (timer.current) clearTimeout(timer.current); timer.current = null;
    setHidden(({ [toast.id]: _, ...rest }) => rest); setToast(null);
  }

  const list = (q.data ?? []).filter((n) => hidden[n.id] !== 'done').map((n) => (hidden[n.id] === 'read' ? { ...n, unread: false } : n)).filter((n) => f === 'all' || n.reason === f);
  const unread = list.filter((n) => n.unread).length;
  let lastDay = '';
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Screen header={
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 18, paddingTop: 10 }}>
            <T v="h1">Inbox</T>
            <View style={{ alignItems: 'flex-end', gap: 4 }}><Num value={pad2(unread)} size={38} /><T v="monoS" c="mut">unread</T></View>
          </View>
          <View style={{ paddingTop: 12, paddingBottom: 4 }}>
            <Chips value={f} onChange={setF} options={[{ value: 'all', label: 'Focused' }, { value: 'review_requested', label: 'Reviews' }, { value: 'mention', label: 'Mentions' }, { value: 'ci_activity', label: 'Checks' }]} />
          </View>
        </>
      }>
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={() => q.refetch()} /> : !list.length ? <Empty title="✓ 0 unread" body="You're all caught up." /> : list.map((n) => {
          const d = dayGroup(n.updated_at); const show = d !== lastDay; lastDay = d;
          const [badge, col] = BADGE[n.reason] ?? ['bell', 'mut'];
          const actor = isSample ? SAMPLE_NOTIFICATION_ACTORS[n.id] : undefined;
          return (
            <View key={n.id}>
              {show ? <T v="monoS" c="dim" style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 }}>{d === 'today' || d === 'yesterday' ? d : 'earlier'}</T> : null}
              <SwipeRow onDone={() => act(n.id, 'done')} onRead={() => act(n.id, 'read')}>
                <Pressable onPress={() => { if (n.unread) act(n.id, 'read'); open(n); }} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 8, paddingVertical: t.rowPad }}>
                  <Avatar login={actor?.login ?? n.repository.owner.login} size={38} badge={badge} badgeColor={t.c[col]} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      {n.unread ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.c.acc }} /> : null}
                      <T v="title" c={n.unread ? 'fg' : 'mut'} lines={1} style={{ flex: 1 }}>{n.subject.title}</T>
                    </View>
                    <T v="sub" c="mut" lines={2}>{actor?.snippet ?? `${REASON_TEXT[n.reason] ?? n.reason} · ${n.repository.full_name}`}</T>
                  </View>
                  <T v="mono" c="mut">{rel(n.updated_at)}</T>
                </Pressable>
              </SwipeRow>
            </View>
          );
        })}
        {list.length ? <T v="monoS" c="dim" style={{ textAlign: 'center', paddingTop: 18 }}>swipe right for done · left to mark read</T> : null}
      </Screen>
      {toast ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center', backgroundColor: t.c.fg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 }}>
            <T v="bodyStrong" style={{ color: t.c.onFg }}>{toast.kind === 'done' ? 'Marked done' : 'Marked read'}</T>
            <Pressable onPress={undoLast} hitSlop={10}><T v="bodyStrong" style={{ color: t.c.onFg, textDecorationLine: 'underline' }}>Undo</T></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
