import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { Platform } from 'react-native';

/**
 * Saved query cache: the app opens showing what you saw last time, then refreshes it in the background.
 *  - Only signed-in ("live") data, only what lists and screens show; never file contents or PR diffs (they can be
 *    megabytes) or review threads (they change while you work). Sample data is instant anyway.
 *  - Kept for a day (MAX_AGE), and removed on sign-out (clearSavedCache) so the next person never sees it.
 *  - On the web it's in IndexedDB (localStorage is ~5 MB and blocks the page); on phones, AsyncStorage.
 *  - Not encrypted (the token is, in tokenStore). It holds what the screens show, including private repo data.
 */
export const MAX_AGE = 24 * 3600e3;
const KEY = 'gitling.query-cache.v1';

export { shouldSave } from './cachePolicy';

/** A tiny IndexedDB key-value store with AsyncStorage's three methods. */
function idbStorage() {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('gitling-cache', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) =>
    db.then((d) => new Promise<T>((resolve, reject) => { const q = fn(d.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => resolve(q.result as T); q.onerror = () => reject(q.error); }));
  return {
    getItem: (k: string) => run<string | undefined>('readonly', (s) => s.get(k)).then((v) => v ?? null),
    setItem: (k: string, v: string) => run<void>('readwrite', (s) => s.put(v, k)),
    removeItem: (k: string) => run<void>('readwrite', (s) => s.delete(k)),
  };
}

const storage = Platform.OS === 'web' && typeof indexedDB !== 'undefined' ? idbStorage() : AsyncStorage;

export const persister = createAsyncStoragePersister({ storage, key: KEY, throttleTime: 1500 });

/** Sign-out: forget everything saved, so a signed-out app (or the next account) never shows it. */
export async function clearSavedCache() {
  try { await persister.removeClient(); } catch { /* storage unavailable: nothing was saved */ }
}
