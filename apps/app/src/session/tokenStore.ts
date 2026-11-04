import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'gitling.token';

/**
 * Native: iOS Keychain / Android Keystore.
 * Web: localStorage for now. M2 moves this to IndexedDB with a non-extractable WebCrypto key.
 */
export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') { try { return localStorage.getItem(KEY); } catch { return null; } }
    return SecureStore.getItemAsync(KEY);
  },
  async set(token: string) {
    if (Platform.OS === 'web') { localStorage.setItem(KEY, token); return; }
    await SecureStore.setItemAsync(KEY, token);
  },
  async clear() {
    if (Platform.OS === 'web') { try { localStorage.removeItem(KEY); } catch {} return; }
    await SecureStore.deleteItemAsync(KEY);
  },
};
