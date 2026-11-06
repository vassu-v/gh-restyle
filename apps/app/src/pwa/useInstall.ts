import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { pwa } from './register';

/**
 * Which browser the web app is open in, for install help:
 *  inapp       — a social/mail app's built-in browser (Instagram, Facebook, LinkedIn, Android WebView…): can't install
 *  ios-safari  — Safari on iPhone/iPad: Share → Add to Home Screen
 *  ios-other   — Chrome, Firefox, Edge on iPhone/iPad: Share (in the address bar or menu) → Add to Home Screen
 *  other       — everything else (Android/desktop browsers: their own install prompt or menu)
 */
export type BrowserKind = 'inapp' | 'ios-safari' | 'ios-other' | 'other';
export function browserKind(): BrowserKind {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Line\/|Twitter|MicroMessenger|GSA\/|; wv\)/i.test(ua)) return 'inapp';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPadOS reports a Mac
  if (!ios) return 'other';
  return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
}

/**
 * Install state for the Account screen and the install sheet.
 *  ready       — the browser offered an install prompt (Chrome, Edge, Android)
 *  ios         — iPhone/iPad: install is manual (Share → Add to Home Screen)
 *  installed   — already running as the installed app
 *  unavailable — native app, an in-app browser, or a browser with no install support
 */
export function useInstall() {
  const snapshot = useSyncExternalStore(pwa.subscribe, () => `${pwa.installed()}|${pwa.canPrompt()}`, () => 'false|false');
  const [installed, ready] = snapshot.split('|').map((x) => x === 'true');
  let state: 'ready' | 'ios' | 'installed' | 'unavailable' = 'unavailable';
  if (Platform.OS === 'web') {
    const kind = browserKind();
    state = installed ? 'installed' : ready ? 'ready' : kind === 'ios-safari' || kind === 'ios-other' ? 'ios' : 'unavailable';
  }
  return { state, prompt: () => pwa.prompt() };
}
