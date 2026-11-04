import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { pwa } from './register';

/**
 * Install state for the Account screen.
 *  ready       — the browser offered an install prompt (Chrome, Edge, Android)
 *  ios         — iPhone/iPad Safari: install is manual (Share → Add to Home Screen)
 *  installed   — already running as the installed app
 *  unavailable — native app, or a browser with no install support
 */
export function useInstall() {
  const snapshot = useSyncExternalStore(pwa.subscribe, () => `${pwa.installed()}|${pwa.canPrompt()}`, () => 'false|false');
  const [installed, ready] = snapshot.split('|').map((x) => x === 'true');
  let state: 'ready' | 'ios' | 'installed' | 'unavailable' = 'unavailable';
  if (Platform.OS === 'web') {
    const ios = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    state = installed ? 'installed' : ready ? 'ready' : ios ? 'ios' : 'unavailable';
  }
  return { state, prompt: () => { void pwa.prompt(); } };
}
