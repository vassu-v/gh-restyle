import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { useSearchIssues, useSearchRepos } from '@/data/queries';
import { IssueRow, RepoRow } from '@/features/rows';
import { routeForUrl } from '@/lib/links';
import { Icon } from '@/ui/Icon';
import { Empty, ErrorNote, Loading, Screen, Seg, T } from '@/ui/primitives';

type Kind = 'repos' | 'issues' | 'prs';

export default function Search() {
  const t = useTokens();
  const p = useLocalSearchParams<{ q?: string; title?: string; kind?: Kind; exact?: string }>();
  const [input, setInput] = useState(p.q ?? '');
  const [q, setQ] = useState(p.q ?? '');
  const [kind, setKind] = useState<Kind>(p.kind ?? 'repos');
  // From a Home section (exact=1): run the search as written, so it matches the section's preview and count.
  const issueQ = p.exact === '1' && kind === 'issues' && q === p.q ? q : kind === 'prs' && !/is:pr/.test(q) ? `${q} is:pr` : kind === 'issues' && !/is:(pr|issue)/.test(q) && !/repo:|involves:|label:/.test(q) ? `${q} is:issue` : q;
  const issues = useSearchIssues(issueQ, 40, !!q && kind !== 'repos');
  const repos = useSearchRepos(q, !!q && kind === 'repos');
  const active = kind === 'repos' ? repos : issues;
  // A pasted github.com link opens its Gitling screen (repo, file, issue, PR, profile) instead of searching for it.
  const submit = () => {
    const s = input.trim();
    const route = /^(https?:\/\/)?(www\.)?github\.com\//i.test(s) ? routeForUrl(/^https?:/i.test(s) ? s : `https://${s}`) : null;
    if (route) router.push(route); else setQ(s);
  };
  return (
    <Screen header={
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, height: 42, borderRadius: 13, backgroundColor: t.c.el2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
            <Icon name="search" size={17} color={t.c.mut} />
            <TextInput autoFocus={!p.q} value={input} onChangeText={setInput} onSubmitEditing={submit} returnKeyType="search" placeholder="Search GitHub"
              placeholderTextColor={t.c.mut} autoCapitalize="none" autoCorrect={false}
              style={{ flex: 1, color: t.c.fg, fontFamily: /:/.test(input) ? t.font.mono.regular : t.font.ui.regular, fontSize: 15, height: '100%' }} />
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10}><T v="bodyStrong" c="acc">Close</T></Pressable>
        </View>
        {p.title ? <T v="h2">{p.title}</T> : null}
        <Seg value={kind} onChange={setKind} options={[{ value: 'repos', label: 'Repos' }, { value: 'issues', label: 'Issues' }, { value: 'prs', label: 'Pull requests' }]} />
      </View>
    } bottomSpace={40}>
      {!q ? <Empty title="search" body="GitHub qualifiers work here, like is:open, label:bug, repo:owner/name and review-requested:@me." />
        : active.isLoading ? <Loading /> : active.error ? <ErrorNote error={active.error} onRetry={() => active.refetch()} />
        : kind === 'repos' ? (repos.data?.items.length ? repos.data.items.map((r) => <RepoRow key={r.full_name} r={r} />) : <Empty title="no results" />)
        : (issues.data?.items.length ? <>
            <T v="monoS" c="mut" style={{ paddingHorizontal: 18, paddingBottom: 6 }}>{issues.data.total_count} results</T>
            {issues.data.items.map((it) => <IssueRow key={it.repository_url + it.number} it={it} />)}
          </> : <Empty title="✓ nothing matches" />)}
    </Screen>
  );
}
