import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { useBranches, useRepo } from '@/data/queries';
import { routes } from '@/lib/links';
import { Icon } from '@/ui/Icon';
import { ErrorNote, Loading, Panel, T } from '@/ui/primitives';

/**
 * Branch chip for the code browser. Tap to open a filterable list; picking a branch reopens the same folder or
 * file on that branch (replacing the screen, so Back still goes to where you came from).
 */
export function BranchPicker({ owner, name, path, ref, kind }: { owner: string; name: string; path: string; ref?: string; kind: 'tree' | 'blob' }) {
  const t = useTokens();
  const repo = useRepo(owner, name);
  const current = ref || repo.data?.default_branch || '…';
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const branches = useBranches(owner, name, open);
  const list = (branches.data ?? []).filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()));

  const pick = (b: string) => {
    setOpen(false); setQ('');
    if (b === current) return;
    router.replace(kind === 'tree' ? routes.tree(owner, name, path, b) : routes.blob(owner, name, path, b));
  };

  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 10, gap: 8 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={`Branch ${current}. Change branch`} accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: t.c.el2, opacity: pressed ? 0.7 : 1 })}>
        <Icon name="git-branch" size={15} color={t.c.mut} />
        <T v="mono" style={{ maxWidth: 220 }} lines={1}>{current}</T>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={t.c.mut} />
      </Pressable>
      {open ? (
        <Panel style={{ paddingVertical: 6, maxHeight: 360 }}>
          <TextInput value={q} onChangeText={setQ} placeholder="Find a branch" placeholderTextColor={t.c.dim} autoCapitalize="none" autoCorrect={false} autoFocus
            style={{ marginHorizontal: 10, marginVertical: 4, padding: 10, borderRadius: 10, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 14 }} />
          {branches.isLoading ? <Loading rows={3} /> : branches.error ? <ErrorNote error={branches.error} onRetry={() => branches.refetch()} /> : (
            <View>
              {list.slice(0, 60).map((b) => (
                <Pressable key={b.name} onPress={() => pick(b.name)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
                  <View style={{ width: 16 }}>{b.name === current ? <Icon name="check" size={15} color={t.c.acc} /> : null}</View>
                  <T v="mono" style={{ flex: 1, fontSize: 14 }} lines={1}>{b.name}</T>
                  {b.name === repo.data?.default_branch ? <T v="monoS" c="mut">default</T> : b.protected ? <Icon name="lock" size={13} color={t.c.dim} /> : null}
                </Pressable>
              ))}
              {!list.length ? <T v="sub" c="mut" style={{ padding: 14 }}>No branch matches.</T> : null}
            </View>
          )}
        </Panel>
      ) : null}
    </View>
  );
}
