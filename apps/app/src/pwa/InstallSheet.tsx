import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/design/DesignProvider';
import { Icon } from '@/ui/Icon';
import { Button, glass, T } from '@/ui/primitives';
import { browserKind, useInstall } from './useInstall';

/**
 * "Install Gitling" sheet for phones that opened the web app in a browser tab. Installed, it opens full screen
 * from the home screen, works offline and keeps its own window: a real app, not a bookmark or a saved page.
 *  - Android / Chrome / Edge: an Install button that opens the browser's own install dialog
 *  - iPhone / iPad: Share → Add to Home Screen (Safari's toolbar, or the address bar in Chrome/Firefox/Edge)
 *  - in-app browsers (Instagram, Facebook…): they can't install, so it says to open the page in the real browser
 *  - other mobile browsers: where the browser menu keeps "Install app" / "Add to Home screen"
 * Only on the main tabs (never over a screen where you write or act: threads, search, Studio, editors), never while
 * a text field has focus, not on desktop or inside the installed app, and not for 14 days after it's closed.
 * Account → Install Gitling shows the same help any time.
 */
const DISMISSED_KEY = 'gitling.install.dismissed';
const SNOOZE_MS = 14 * 24 * 3600e3;
const SHOWN_ON = ['/', '/feed', '/inbox', '/repos'];

type Kind = 'prompt' | 'ios-safari' | 'ios-other' | 'inapp' | 'menu';

/** A phone or tablet browser (not a desktop window made narrow). iPadOS reports itself as a Mac with touch. */
export function isMobileBrowser(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const uaData = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** True while a text field has focus: the sheet must never sit on top of what someone is typing into. */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const check = () => { const el = document.activeElement; setTyping(!!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)); };
    const later = () => setTimeout(check, 0); // focus has moved on by the next tick
    document.addEventListener('focusin', check); document.addEventListener('focusout', later);
    return () => { document.removeEventListener('focusin', check); document.removeEventListener('focusout', later); };
  }, []);
  return typing;
}

export function InstallSheet() {
  const t = useTokens(); const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { state, prompt } = useInstall();
  const typing = useTyping();
  const onMainTab = SHOWN_ON.includes(pathname);
  // Desktop never asks, so start "snoozed" there without touching storage.
  const [snoozed, setSnoozed] = useState<boolean | null>(() => (isMobileBrowser() ? null : true));
  // The main tab the sheet has waited on (it shows only there, after a short settle).
  const [readyOn, setReadyOn] = useState<string | null>(null);
  const ready = readyOn === pathname;

  useEffect(() => {
    if (!isMobileBrowser()) return;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => { const at = Number(v); setSnoozed(!!v && at <= Date.now() && Date.now() - at < SNOOZE_MS); }) // a future time doesn't snooze forever
      .catch(() => setSnoozed(false));
  }, []);
  // Let each main screen settle (and the browser's install event arrive) before asking, including right after the tour.
  useEffect(() => {
    if (!onMainTab) return;
    const id = setTimeout(() => setReadyOn(pathname), 1800);
    return () => clearTimeout(id);
  }, [onMainTab, pathname]);

  if (Platform.OS !== 'web' || !ready || !onMainTab || typing || snoozed !== false || state === 'installed') return null;
  const b = browserKind();
  const kind: Kind = state === 'ready' ? 'prompt' : b === 'inapp' ? 'inapp' : b === 'ios-safari' ? 'ios-safari' : b === 'ios-other' ? 'ios-other' : 'menu';
  const dismiss = () => { setSnoozed(true); AsyncStorage.setItem(DISMISSED_KEY, String(Date.now())).catch(() => {}); };
  // Only snooze after the dialog was answered with "install"; cancelling it leaves the sheet for another day.
  const install = async () => { const outcome = await prompt(); if (outcome === 'accepted') dismiss(); else setSnoozed(true); };
  const ios = /iPhone|iPod/.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const strong = (s: string) => <T v="bodyStrong" style={{ fontSize: 14 }}>{s}</T>;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 10 }}>
      <View accessibilityRole="alert" accessibilityLabel="Install Gitling"
        style={[{ width: '100%', maxWidth: 520, marginBottom: Math.max(insets.bottom, 10) + 78, borderRadius: 22, padding: 16, gap: 12 }, glass(t), { backgroundColor: t.c.el }]}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: t.c.accSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="smartphone" size={20} color={t.c.acc} /></View>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">Add Gitling to your home screen</T>
            <T v="sub" c="mut">{kind === 'inapp' ? 'This app’s built-in browser can’t install it.' : 'Opens full screen, like an app, and works offline.'}</T>
          </View>
          <Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"><Icon name="x" size={18} color={t.c.mut} /></Pressable>
        </View>

        {kind === 'ios-safari' ? (
          <View style={{ gap: 8 }}>
            <Step n="1">Tap <Icon name="share" size={15} color={t.c.acc} /> Share in Safari’s toolbar</Step>
            <Step n="2">Choose {strong('Add to Home Screen')}, then Add</Step>
          </View>
        ) : kind === 'ios-other' ? (
          <View style={{ gap: 8 }}>
            <Step n="1">Tap <Icon name="share" size={15} color={t.c.acc} /> Share (in the address bar or the menu)</Step>
            <Step n="2">Choose {strong('Add to Home Screen')}, then Add</Step>
          </View>
        ) : kind === 'inapp' ? (
          <View style={{ gap: 8 }}>
            <Step n="1">Open the menu ({strong('⋯')} or {strong('⋮')}) of this screen</Step>
            <Step n="2">Choose {strong(ios ? 'Open in Safari' : 'Open in Chrome')} (or “Open in browser”), then install from there</Step>
          </View>
        ) : kind === 'menu' ? (
          <View style={{ gap: 8 }}>
            <Step n="1">Open your browser’s menu {strong('⋮')}</Step>
            <Step n="2">Tap {strong('Install app')} or {strong('Add to Home screen')}</Step>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {kind === 'prompt' ? <Button style={{ flex: 1, height: 44 }} icon="download" label="Install" onPress={install} /> : null}
          <Button kind="quiet" style={[{ height: 44 }, kind === 'prompt' ? {} : { flex: 1 }]} label={kind === 'prompt' ? 'Not now' : 'Got it'} onPress={dismiss} />
        </View>
      </View>
    </View>
  );
}

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.c.el2, alignItems: 'center', justifyContent: 'center' }}><T v="monoS">{n}</T></View>
      <T v="sub" style={{ flex: 1 }}>{children}</T>
    </View>
  );
}
