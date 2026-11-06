import { describeDesign, readDesignText, type Design } from '@gitling/design';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesign, useTokens } from '@/design/DesignProvider';
import { DesignPreview, HomeSectionsEditor, LookRows, PresetGallery, TabBarEditor } from '@/features/studio/controls';
import { canOpenFiles, openDesignFile } from '@/lib/designFile';
import { pad2 } from '@/lib/format';
import { useFirstRun, useOnboarding } from '@/onboarding/OnboardingProvider';
import { installKind, InstallSteps } from '@/pwa/InstallSheet';
import { browserKind, useInstall } from '@/pwa/useInstall';
import { useSession } from '@/session/SessionProvider';
import { Icon } from '@/ui/Icon';
import { Button, Num, Panel, T } from '@/ui/primitives';

/**
 * First run (OnboardingProvider has the rules): install → sign in → tour.
 *  - install: phone browsers only. Installing first means signing in once, inside the installed app.
 *  - sign in: GitHub, or "Look around first" with sample data (the tour then waits until they sign in).
 *  - tour: three steps, once signed in: look, Home, tab bar. Every step edits the real design live, so there's
 *    nothing to "apply" at the end and Studio's Undo still works afterwards.
 * Studio → Share → "Replay the welcome tour" opens the tour alone (?replay=1).
 */
export default function Welcome() {
  const step = useFirstRun();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  if (replay) return <Tour replay />;
  if (step === 'install') return <InstallStep />;
  if (step === 'signin') return <SignInStep />;
  if (step === 'tour') return <Tour />;
  return <Redirect href="/" />;
}

/** A full-screen first-run page: scrolling content, with the actions pinned to the bottom. */
function Page({ top, children, actions }: { top?: ReactNode; children: ReactNode; actions: ReactNode }) {
  const t = useTokens(); const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top }}>
      {top ? <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, gap: 10 }}>{top}</View> : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 170 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>{children}</View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12) + 4, alignItems: 'center' }}>
        <View style={{ gap: 8, width: '100%', maxWidth: 520, paddingHorizontal: 14 }}>{actions}</View>
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

function Brand({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 34, gap: 14 }}>
      <Num value="GITLING" size={56} c="acc" />
      <T v="h1">{title}</T>
      <T v="body" c="mut">{body}</T>
    </View>
  );
}

/** Step 1 (phone browsers): add Gitling to the home screen, or carry on in the browser. */
function InstallStep() {
  const t = useTokens();
  const { passInstall } = useOnboarding();
  const { state, prompt } = useInstall();
  const kind = installKind(state);
  const [msg, setMsg] = useState<string | null>(null);
  const ios = browserKind() === 'ios-safari' || browserKind() === 'ios-other';
  const install = async () => {
    const outcome = await prompt();
    if (outcome === 'accepted') passInstall();
    else setMsg(outcome === 'dismissed' ? 'No problem. You can install later from Account.' : 'This browser didn’t offer to install. Use its menu instead.');
  };
  return (
    <Page actions={
      <>
        {kind === 'prompt' ? <Button icon="download" label="Install Gitling" onPress={install} /> : null}
        <Button kind="quiet" label={kind === 'inapp' ? 'Continue here anyway' : 'Continue in the browser'} onPress={passInstall} />
      </>
    }>
      <Brand title="Add Gitling to your home screen" body={kind === 'inapp'
        ? 'This app’s built-in browser can’t install Gitling. Open the page in your phone’s browser to install it.'
        : 'It opens full screen like an app, works offline and keeps your setup.'} />
      <View style={{ paddingHorizontal: 18, paddingTop: 22, gap: 12 }}>
        {kind === 'prompt' ? null : <Panel style={{ padding: 14, gap: 10 }}><InstallSteps kind={kind} /></Panel>}
        {ios && kind !== 'inapp' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Icon name="smartphone" size={16} color={t.c.acc} />
            <T v="sub" c="mut" style={{ flex: 1 }}>Then open Gitling from your home screen and sign in there: on iPhone the installed app keeps its own sign-in, separate from Safari.</T>
          </View>
        ) : null}
        {msg ? <T v="sub" c="wait">{msg}</T> : null}
      </View>
    </Page>
  );
}

/** Step 2: sign in with GitHub, or look around with sample data first. */
function SignInStep() {
  const { design } = useDesign();
  const { skipSignIn } = useOnboarding();
  const { canOAuth, signInWithGitHub } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signIn = async () => {
    if (!canOAuth) { router.push('/account'); return; }
    setBusy(true); setErr(null);
    // Web leaves for github.com here and comes back signed in; native finishes in place (the tour then opens).
    try { await signInWithGitHub(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Page actions={
      <>
        <Button icon="key-round" label={busy ? 'Opening GitHub…' : canOAuth ? 'Sign in with GitHub' : 'Connect GitHub'} disabled={busy} onPress={signIn} />
        <Button kind="quiet" label="Look around first" onPress={() => { skipSignIn(); router.replace('/'); }} />
      </>
    }>
      <Brand title="GitHub on your phone, laid out the way you want." body="Your reviews, inbox, repos and code. You decide how it looks, what Home shows and which tabs you keep." />
      <View style={{ paddingHorizontal: 14, paddingTop: 22 }}><DesignPreview design={design} /></View>
      <View style={{ paddingHorizontal: 18, paddingTop: 18, gap: 10 }}>
        <Point icon="lock" title="Your token stays on this device" sub="Gitling talks to GitHub directly. Nothing is stored on a server." />
        <Point icon="eye" title="Or look around first" sub="Sample data shows every screen. Sign in from Account any time; the setup tour starts then." />
        {err ? <T v="sub" c="bad">{err}</T> : null}
      </View>
    </Page>
  );
}

function Point({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ width: 34, height: 34, borderRadius: t.r.md, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={17} color={t.c.acc} /></View>
      <View style={{ flex: 1 }}><T v="bodyStrong">{title}</T><T v="sub" c="mut">{sub}</T></View>
    </View>
  );
}

type Step = { key: 'look' | 'home' | 'tabs'; label: string };
const STEPS: Step[] = [{ key: 'look', label: 'look' }, { key: 'home', label: 'home' }, { key: 'tabs', label: 'tab bar' }];

/** Step 3, once signed in (or replayed from Studio): look, Home sections, tab bar. */
function Tour({ replay }: { replay?: boolean }) {
  const t = useTokens();
  const { finish } = useOnboarding();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const done = () => {
    finish();
    // A replay goes back to Studio (after a reload there's no history); the first-run tour lands on Home.
    if (replay) { if (router.canGoBack()) router.back(); else router.replace({ pathname: '/studio', params: { tab: 'share' } }); }
    else router.replace('/');
  };
  return (
    <Page
      top={
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="mono" c="mut">{pad2(i + 1)} / {pad2(STEPS.length)} · {step.label}</T>
            {last ? null : <Pressable onPress={done} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip setup"><T v="bodyStrong" c="mut">Skip</T></Pressable>}
          </View>
          {/* Progress: one segment per step, accent up to here. */}
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: i + 1 }}>
            {STEPS.map((s, k) => <View key={s.key} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k <= i ? t.c.acc : t.c.line2 }} />)}
          </View>
        </>
      }
      actions={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {i > 0 ? <Button kind="quiet" icon="chevron-left" accessibilityLabel="Back" onPress={() => setI(i - 1)} /> : null}
          <Button style={{ flex: 1 }} label={last ? 'Start using Gitling' : 'Next'} onPress={() => (last ? done() : setI(i + 1))} />
        </View>
      }>
      {step.key === 'look' ? <Look /> : null}
      {step.key === 'home' ? <HomeStep /> : null}
      {step.key === 'tabs' ? <TabsStep /> : null}
    </Page>
  );
}

function Look() {
  return (
    <View>
      <Head title="Pick a look" body="Tap a preset; the whole app changes as you pick. You can fine-tune everything later in Studio." />
      <PresetGallery />
      <LookRows compact />
      <Bring />
    </View>
  );
}

function HomeStep() {
  return (
    <View>
      <Head title="What should Home show?" body="Add the sections you want, remove the rest, and drag the grip to change the order. Any GitHub search can be a section too." />
      <HomeSectionsEditor compact />
    </View>
  );
}

function TabsStep() {
  return (
    <View>
      <Head title="Your tab bar" body="Keep the tabs you use, in the order you reach for them. Studio always stays, so you can change your mind." />
      <TabBarEditor />
      <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10 }}>
        <T v="label" c="mut" style={{ paddingHorizontal: 4 }}>good to know</T>
        <Tip icon="sparkles" title="Shortcuts are yours" body="Long-press a tile on Home to change what it opens: a search, a repo, a file or any link." />
        <Tip icon="inbox" title="Triage with a swipe" body="In Inbox, swipe a row right when it’s done, left to mark it read." />
        <Tip icon="search" title="Paste any GitHub link" body="Search opens github.com links as Gitling screens." />
      </View>
    </View>
  );
}

/** Load a design someone saved before: a .gitling.json file, a GITLING1 code, or a share link. Collapsed until asked for. */
function Bring() {
  const t = useTokens();
  const { replace } = useDesign();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const parsed = text.trim() ? readDesignText(text) : null;
  const use = (d: Design) => { replace(d); setText(''); setLoaded(true); setOpen(false); };
  if (!open) {
    return (
      <Pressable onPress={() => { setOpen(true); setLoaded(false); }} accessibilityRole="button" style={{ marginHorizontal: 18, marginTop: 18, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="folder-open" size={16} color={t.c.acc} />
        <T v="bodyStrong" c="acc" style={{ fontSize: 14 }}>{loaded ? 'Design loaded. Load another?' : 'Already have a setup? Load it'}</T>
      </Pressable>
    );
  }
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 18, gap: 10 }}>
      <T v="bodyStrong">Already have a setup?</T>
      <T v="sub" c="mut">Load a design file you saved, or paste a design code or share link from a friend.</T>
      {canOpenFiles ? (
        <Button kind="quiet" icon="folder-open" label="Open a design file" onPress={async () => {
          setErr(null);
          try { const s = await openDesignFile(); if (s != null) setText(s); } catch (e) { setErr((e as Error).message); }
        }} />
      ) : null}
      <TextInput value={text} onChangeText={(v) => { setText(v); setErr(null); }} placeholder="…or paste a GITLING1 code, share link or file text" placeholderTextColor={t.c.dim}
        autoCapitalize="none" autoCorrect={false} multiline accessibilityLabel="Design code or file text"
        style={{ minHeight: 70, padding: 12, borderRadius: t.r.md, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: t.scale(13) }} />
      {err ? <T v="sub" c="bad">{err}</T> : null}
      {parsed && !parsed.ok ? <T v="sub" c="bad">{parsed.error}</T> : null}
      {parsed && parsed.ok ? (
        <View style={{ gap: 10 }}>
          <DesignPreview design={parsed.design} />
          <T v="monoS" c="mut">{parsed.name && !describeDesign(parsed.design).startsWith(parsed.name) ? `${parsed.name} · ` : ''}{describeDesign(parsed.design)}</T>
          {parsed.dropped.length ? <T v="sub" c="wait">{`Left out (not valid in this version): ${parsed.dropped.join(', ')}`}</T> : null}
          <Button label="Use this design" onPress={() => use(parsed.design)} />
        </View>
      ) : null}
      {Platform.OS === 'web' ? null : <T v="monoS" c="mut">Tip: paste the file’s text if your phone can’t open it here.</T>}
    </View>
  );
}

function Tip({ icon, title, body }: { icon: string; title: string; body: string }) {
  const t = useTokens();
  return (
    <Panel style={{ padding: 14, flexDirection: 'row', gap: 12 }}>
      <Icon name={icon} size={18} color={t.c.acc} />
      <View style={{ flex: 1, gap: 3 }}><T v="bodyStrong">{title}</T><T v="sub" c="mut">{body}</T></View>
    </Panel>
  );
}
