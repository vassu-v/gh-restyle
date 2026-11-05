import { describeDesign, readDesignText, type Design } from '@gitling/design';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesign, useTokens } from '@/design/DesignProvider';
import { DesignPreview, HomeSectionsEditor, LookRows, PresetGallery, TabBarEditor } from '@/features/studio/controls';
import { canOpenFiles, openDesignFile } from '@/lib/designFile';
import { pad2 } from '@/lib/format';
import { useOnboarding } from '@/onboarding/OnboardingProvider';
import { useSession } from '@/session/SessionProvider';
import { Icon } from '@/ui/Icon';
import { Button, Num, Panel, T } from '@/ui/primitives';

/**
 * The welcome tour: shown once on first launch (OnboardingProvider), and again from Studio → Share → "Replay
 * the welcome tour". Every step edits the real design live (the whole screen re-themes as you pick), so there's
 * nothing to "apply" at the end, and Studio's Undo still works afterwards.
 *
 *   01 hello · 02 look · 03 home · 04 tab bar · 05 bring a design (file / code / link) · 06 how things work
 */
type Step = { key: string; label: string };
const STEPS: Step[] = [
  { key: 'hello', label: 'hello' }, { key: 'look', label: 'look' }, { key: 'home', label: 'home' },
  { key: 'tabs', label: 'tab bar' }, { key: 'bring', label: 'bring yours' }, { key: 'tips', label: 'how it works' },
];

export default function Welcome() {
  const t = useTokens(); const insets = useSafeAreaInsets();
  const { finish } = useOnboarding();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const done = (to: '/' | '/account' = '/') => { finish(); router.replace(to); };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top }}>
      <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="mono" c="mut">{pad2(i + 1)} / {pad2(STEPS.length)} · {step.label}</T>
          {last ? null : <Pressable onPress={() => done()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip setup"><T v="bodyStrong" c="mut">Skip</T></Pressable>}
        </View>
        {/* Progress: one segment per step, accent up to here. */}
        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: i + 1 }}>
          {STEPS.map((s, k) => <View key={s.key} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k <= i ? t.c.acc : t.c.line2 }} />)}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          {step.key === 'hello' ? <Hello /> : null}
          {step.key === 'look' ? <Look /> : null}
          {step.key === 'home' ? <HomeStep /> : null}
          {step.key === 'tabs' ? <TabsStep /> : null}
          {step.key === 'bring' ? <Bring onLoaded={() => setI(STEPS.length - 1)} /> : null}
          {step.key === 'tips' ? <Tips onSignIn={() => done('/account')} /> : null}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12) + 4, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 8, width: '100%', maxWidth: 520, paddingHorizontal: 14 }}>
          {i > 0 ? <Button kind="quiet" icon="chevron-left" accessibilityLabel="Back" onPress={() => setI(i - 1)} /> : null}
          <Button style={{ flex: 1 }} label={i === 0 ? 'Make it yours' : last ? 'Start using Gitling' : 'Next'} onPress={() => (last ? done() : setI(i + 1))} />
        </View>
      </View>
    </View>
  );
}

function Head({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 22, paddingBottom: 14, gap: 6 }}>
      <T v="h1">{title}</T>
      <T v="body" c="mut">{body}</T>
    </View>
  );
}

function Hello() {
  const t = useTokens();
  const { design } = useDesign();
  return (
    <View>
      <View style={{ paddingHorizontal: 18, paddingTop: 30, gap: 14 }}>
        <Num value="GITLING" size={56} c="acc" />
        <T v="h1">GitHub on your phone, laid out the way you want.</T>
        <T v="body" c="mut">Gitling shows your reviews, inbox, repos and code. You decide how it looks, what Home shows, which tabs you keep, and where your shortcuts go.</T>
      </View>
      <View style={{ paddingHorizontal: 14, paddingTop: 22 }}><DesignPreview design={design} /></View>
      <View style={{ paddingHorizontal: 18, paddingTop: 18, gap: 10 }}>
        {[
          ['palette', 'Pick a look', 'presets, accent and background'],
          ['house', 'Shape Home', 'the sections you care about, in your order'],
          ['download', 'Keep it', 'save your setup as a file and load it anywhere'],
        ].map(([icon, title, sub]) => (
          <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={17} color={t.c.acc} /></View>
            <View style={{ flex: 1 }}><T v="bodyStrong">{title}</T><T v="sub" c="mut">{sub}</T></View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Look() {
  return (
    <View>
      <Head title="Pick a look" body="Tap a preset; the whole app changes as you pick. You can fine-tune everything later in Studio." />
      <PresetGallery />
      <LookRows compact />
    </View>
  );
}

function HomeStep() {
  return (
    <View>
      <Head title="What should Home show?" body="Switch sections on or off and drag the grip to change their order." />
      <HomeSectionsEditor />
    </View>
  );
}

function TabsStep() {
  return (
    <View>
      <Head title="Your tab bar" body="Keep the tabs you use, in the order you reach for them. Studio always stays, so you can change your mind." />
      <TabBarEditor />
    </View>
  );
}

/** Load a design someone saved before: a .gitling.json file, a GITLING1 code, or a share link. */
function Bring({ onLoaded }: { onLoaded: () => void }) {
  const t = useTokens();
  const { replace } = useDesign();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const parsed = text.trim() ? readDesignText(text) : null;
  const use = (d: Design) => { replace(d); setText(''); onLoaded(); };
  return (
    <View>
      <Head title="Already have a setup?" body="Load a design file you saved, or paste a design code or share link from a friend. Otherwise, tap Next." />
      <View style={{ paddingHorizontal: 18, gap: 10 }}>
        {canOpenFiles ? (
          <Button kind="quiet" icon="folder-open" label="Open a design file" onPress={async () => {
            setErr(null);
            try { const s = await openDesignFile(); if (s != null) setText(s); } catch (e) { setErr((e as Error).message); }
          }} />
        ) : null}
        <TextInput value={text} onChangeText={(v) => { setText(v); setErr(null); }} placeholder="…or paste a GITLING1 code, share link or file text" placeholderTextColor={t.c.dim}
          autoCapitalize="none" autoCorrect={false} multiline accessibilityLabel="Design code or file text"
          style={{ minHeight: 70, padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 13 }} />
        {err ? <T v="sub" c="bad">{err}</T> : null}
        {parsed && !parsed.ok ? <T v="sub" c="bad">{parsed.error}</T> : null}
        {parsed && parsed.ok ? (
          <View style={{ gap: 10 }}>
            <DesignPreview design={parsed.design} />
            <T v="monoS" c="mut">{parsed.name ? `${parsed.name} · ` : ''}{describeDesign(parsed.design)}</T>
            {parsed.dropped.length ? <T v="sub" c="wait">{`Left out (not valid in this version): ${parsed.dropped.join(', ')}`}</T> : null}
            <Button label="Use this design" onPress={() => use(parsed.design)} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The short walkthrough: the few gestures and places that aren't obvious. */
function Tips({ onSignIn }: { onSignIn: () => void }) {
  const { isSample, canOAuth } = useSession();
  const tips: [string, string, ReactNode][] = [
    ['sparkles', 'Shortcuts are yours', 'Long-press a tile on Home to change what it opens: a search, a repo, a file, an inbox filter or any link.'],
    ['inbox', 'Triage with a swipe', 'In Inbox, swipe a row right when it’s done, left to mark it read.'],
    ['search', 'Paste any GitHub link', 'Search opens github.com links as Gitling screens: repos, files, issues and pull requests.'],
    ['git-pull-request', 'Review on the go', 'In a pull request’s Files, tap a line to comment, long-press to pick a range, and suggest changes.'],
    ['palette', 'Studio has the rest', 'Every setting from this tour, plus shortcuts, sharing and saving your setup as a file. Undo works everywhere.'],
  ];
  return (
    <View>
      <Head title="A few things worth knowing" body="That’s the setup done. Here’s how to get around." />
      <View style={{ paddingHorizontal: 14, gap: 10 }}>
        {tips.map(([icon, title, body]) => <Tip key={title as string} icon={icon} title={title} body={body} />)}
      </View>
      {isSample ? (
        <Panel style={{ marginHorizontal: 14, marginTop: 16, padding: 14, gap: 10 }}>
          <T v="bodyStrong">You’re looking at sample data</T>
          <T v="sub" c="mut">{canOAuth ? 'Sign in with GitHub to see your own reviews, inbox and repos. Your token stays on this device.' : 'Connect a GitHub token from Account to see your own data.'}</T>
          <Button kind="quiet" icon="key-round" label={canOAuth ? 'Sign in with GitHub' : 'Connect GitHub'} onPress={onSignIn} />
        </Panel>
      ) : null}
    </View>
  );
}

function Tip({ icon, title, body }: { icon: string; title: string; body: ReactNode }) {
  const t = useTokens();
  return (
    <Panel style={{ padding: 14, flexDirection: 'row', gap: 12 }}>
      <Icon name={icon} size={18} color={t.c.acc} />
      <View style={{ flex: 1, gap: 3 }}><T v="bodyStrong">{title}</T><T v="sub" c="mut">{body}</T></View>
    </Panel>
  );
}
