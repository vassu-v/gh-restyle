import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the GitHub token lives. It never leaves the device except in requests to api.github.com.
 *   native → iOS Keychain / Android Keystore (expo-secure-store)
 *   web    → IndexedDB, AES-GCM encrypted with a non-extractable WebCrypto key that is also kept in
 *            IndexedDB. Script on the page can still *use* the key, but can't export it, so a copied
 *            database or a dumped localStorage doesn't reveal the token.
 */

const KEY = 'gitling.token';
const LEGACY_WEB_KEY = 'gitling.token'; // M1 kept it in localStorage in plain text

export const tokenStore = Platform.OS === 'web' ? webStore() : {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

function webStore() {
  const DB = 'gitling', STORE = 'vault';
  let memory: string | null = null; // used if IndexedDB is unavailable (some private modes)

  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await open();
    try {
      return await new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(r ? r.result : undefined);
        t.onerror = () => reject(t.error);
      });
    } finally { db.close(); }
  }
  async function key(): Promise<CryptoKey> {
    const existing = await tx<CryptoKey>('readonly', (s) => s.get('key'));
    if (existing) return existing;
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await tx('readwrite', (s) => { s.put(k, 'key'); });
    return k;
  }

  const api = {
    async get(): Promise<string | null> {
      try {
        const legacy = localStorage.getItem(LEGACY_WEB_KEY);
        if (legacy) { await api.set(legacy); localStorage.removeItem(LEGACY_WEB_KEY); return legacy; }
      } catch { /* storage blocked */ }
      try {
        const box = await tx<{ iv: Uint8Array; data: ArrayBuffer }>('readonly', (s) => s.get('token'));
        if (!box) return memory;
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.iv as BufferSource }, await key(), box.data);
        return new TextDecoder().decode(plain);
      } catch { return memory; }
    },
    async set(token: string) {
      memory = token;
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(token));
        await tx('readwrite', (s) => { s.put({ iv, data }, 'token'); });
      } catch { /* keep the in-memory copy for this tab */ }
    },
    async clear() {
      memory = null;
      try { localStorage.removeItem(LEGACY_WEB_KEY); } catch { /* ignore */ }
      try { await tx('readwrite', (s) => { s.delete('token'); s.delete('key'); }); } catch { /* ignore */ }
    },
  };
  return api;
}
