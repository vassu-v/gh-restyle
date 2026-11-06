import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/design/DesignProvider';
import { Icon } from '@/ui/Icon';
import { Button, glass, T } from '@/ui/primitives';
import { useInstall } from './useInstall';

/**
 * "Install Gitling" sheet for phones that opened the web app in a browser tab. Installed, it opens full screen
 * from the home screen, works offline and keeps its own window: a real app, not a bookmark or a saved page.
 *  - Android / Chrome / Edge: an Install button that opens the browser's own install dialog
 *  - iPhone / iPad: the two taps Safari needs (Share → Add to Home Screen); iOS has no install dialog to open
 *  - other mobile browsers: where the browser menu keeps "Install app" / "Add to Home screen"
 * Not shown on desktop, inside the installed app, during the welcome tour or sign-in, or for 14 days after
 * "Not now". Account → Install app stays available for anyone who dismissed it.
 */
const DISMISSED_KEY = 'gitling.install.dismissed';
const SNOOZE_MS = 14 * 24 * 3600e3;
const HIDDEN_ON = ['/welcome', '/auth/callback'];

type Kind = 'prompt' | 'ios' | 'menu';

/** A phone or tablet browser (not a desktop window made narrow). iPadOS reports itself as a Mac with touch. */
export function isMobileBrowser(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const uaData = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
const isIOS = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

export function InstallSheet() {
  const t = useTokens(); const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { state, prompt } = useInstall();
  // Desktop never asks, so start "snoozed" there without touching storage.
  const [snoozed, setSnoozed] = useState<boolean | null>(() => (isMobileBrowser() ? null : true));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isMobileBrowser()) return;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setSnoozed(!!v && Date.now() - Number(v) < SNOOZE_MS))
      .catch(() => setSnoozed(false));
    // Let the first screen settle (and the browser's install event arrive) before asking.
    const id = setTimeout(() => setReady(true), 1800);
    return () => clearTimeout(id);
  }, []);

  if (Platform.OS !== 'web' || !ready || snoozed !== false || state === 'installed' || HIDDEN_ON.includes(pathname)) return null;
  const kind: Kind = state === 'ready' ? 'prompt' : isIOS() ? 'ios' : 'menu';
  const dismiss = () => { setSnoozed(true); AsyncStorage.setItem(DISMISSED_KEY, String(Date.now())).catch(() => {}); };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View accessibilityRole="alert" accessibilityLabel="Install Gitling"
        style={[{ width: '100%', maxWidth: 520, margin: 10, marginBottom: Math.max(insets.bottom, 10) + 78, borderRadius: 22, padding: 16, gap: 12 }, glass(t), { backgroundColor: t.c.el }]}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: t.c.accSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="smartphone" size={20} color={t.c.acc} /></View>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">Install Gitling on this phone</T>
            <T v="sub" c="mut">Opens from your home screen, full screen, and works offline.</T>
          </View>
          <Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"><Icon name="x" size={18} color={t.c.mut} /></Pressable>
        </View>

        {kind === 'ios' ? (
          <View style={{ gap: 8 }}>
            <Step n="1">Tap <Icon name="share" size={15} color={t.c.acc} /> Share in Safari’s toolbar</Step>
            <Step n="2">Choose <T v="bodyStrong" style={{ fontSize: 14 }}>Add to Home Screen</T>, then Add</Step>
          </View>
        ) : kind === 'menu' ? (
          <View style={{ gap: 8 }}>
            <Step n="1">Open your browser’s menu <T v="bodyStrong" style={{ fontSize: 14 }}>⋮</T></Step>
            <Step n="2">Tap <T v="bodyStrong" style={{ fontSize: 14 }}>Install app</T> or <T v="bodyStrong" style={{ fontSize: 14 }}>Add to Home screen</T></Step>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {kind === 'prompt' ? <Button style={{ flex: 1, height: 44 }} icon="download" label="Install" onPress={() => { prompt(); dismiss(); }} /> : null}
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
