import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * A small encrypted place for one secret string on this device. Nothing here goes over the network.
 *   native → iOS Keychain / Android Keystore (expo-secure-store), under `gitling.<name>`
 *   web    → IndexedDB database "gitling", store "vault": the value AES-GCM encrypted under `<name>`, with a
 *            non-extractable WebCrypto key under `key:<name>`. Script on the page can still *use* the key, but
 *            can't export it, so a copied database or a dumped localStorage doesn't reveal the value.
 *            If IndexedDB is unavailable (some private modes) the value is kept in memory for this tab only.
 *
 * Strict vaults (`{ strict: true }`) never pretend: get() throws when something is saved but can't be read, and
 * set() throws when the value couldn't be kept on the device (the in-memory fallback doesn't count). The
 * authenticator uses one, because losing a two-factor secret quietly is worse than an error. The token vault
 * isn't strict: a token kept in memory for the tab is still useful, and it can always be entered again.
 *
 * Every vault has its own key, so clearing one (e.g. signing out clears the token vault) never touches another.
 * The token vault is the exception to the naming above: it keeps the names it had before vaults existed
 * ('token' / 'key' on web, 'gitling.token' on native) so nobody is signed out by an update.
 */
export type Vault = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
};

const DB = 'gitling', STORE = 'vault';

export function createVault(name: string, opts: { strict?: boolean } = {}): Vault {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Vault names are letters, digits, - and _ ("${name}" isn't).`);
  const isToken = name === 'token';
  if (Platform.OS !== 'web') {
    const key = `gitling.${name}`; // 'gitling.token' for the token vault, as before
    return {
      get: () => SecureStore.getItemAsync(key),
      set: (value: string) => SecureStore.setItemAsync(key, value),
      clear: () => SecureStore.deleteItemAsync(key),
    };
  }
  return webVault({
    dataKey: name,
    cryptoKey: isToken ? 'key' : `key:${name}`,
    legacyLocalStorageKey: isToken ? 'gitling.token' : null, // M1 kept the token in localStorage in plain text
    strict: !!opts.strict,
  });
}

function webVault(o: { dataKey: string; cryptoKey: string; legacyLocalStorageKey: string | null; strict: boolean }): Vault {
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
    const existing = await tx<CryptoKey>('readonly', (s) => s.get(o.cryptoKey));
    if (existing) return existing;
    const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // Store it only if nobody else did meanwhile (another call or tab), and use whichever key won, so two
    // writes racing on first use can't encrypt under a key that is then overwritten.
    let winner: CryptoKey = fresh;
    await tx('readwrite', (s) => {
      const r = s.get(o.cryptoKey);
      r.onsuccess = () => {
        if (r.result) winner = r.result as CryptoKey;
        else s.put(fresh, o.cryptoKey);
      };
    });
    return winner;
  }

  const api: Vault = {
    async get() {
      if (o.legacyLocalStorageKey) {
        try {
          const legacy = localStorage.getItem(o.legacyLocalStorageKey);
          if (legacy) { await api.set(legacy); localStorage.removeItem(o.legacyLocalStorageKey); return legacy; }
        } catch { /* storage blocked */ }
      }
      try {
        const box = await tx<{ iv: Uint8Array; data: ArrayBuffer }>('readonly', (s) => s.get(o.dataKey));
        if (!box) return memory;
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.iv as BufferSource }, await key(), box.data);
        return new TextDecoder().decode(plain);
      } catch (e) {
        if (o.strict && memory === null) throw e; // saved but unreadable: say so, so nothing overwrites it
        return memory;
      }
    },
    async set(value: string) {
      memory = value;
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(value));
        await tx('readwrite', (s) => { s.put({ iv, data }, o.dataKey); });
      } catch (e) {
        if (o.strict) { memory = null; throw e; } // not kept on the device: the caller must know
        /* keep the in-memory copy for this tab */
      }
    },
    async clear() {
      memory = null;
      if (o.legacyLocalStorageKey) { try { localStorage.removeItem(o.legacyLocalStorageKey); } catch { /* ignore */ } }
      try { await tx('readwrite', (s) => { s.delete(o.dataKey); s.delete(o.cryptoKey); }); } catch { /* ignore */ }
    },
  };
  return api;
}
