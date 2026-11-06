import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { base32Decode, totp, type OtpAccount } from '@gitling/github';
import { createVault } from '@/session/vault';

/**
 * The authenticator's accounts (two-factor setup keys), kept on this device only, as JSON in their own vault
 * ('otp'): Keychain / Keystore on phones, AES-GCM in IndexedDB on the web, with a key separate from the GitHub
 * token's. Signing out clears the token vault and the saved query cache, never this.
 *
 * One module-level store shared by every component that uses the hook, so no provider is needed.
 * Secrets are never logged, and never go into design files, share codes or the query cache.
 */

const MAX_ACCOUNTS = 50;
const vault = createVault('otp', { strict: true }); // a failed save or read is an error, never a quiet loss

let accounts: OtpAccount[] | null = null; // null until the vault has been read
const listeners = new Set<() => void>();
let writes: Promise<unknown> = Promise.resolve(); // changes run one at a time, in order

function emit(next: OtpAccount[]) {
  accounts = next;
  listeners.forEach((l) => l());
}

// Checked before upper-casing: some non-ASCII letters (ı, ſ) upper-case into valid base32 letters.
const BASE32_INPUT = /^[A-Za-z2-7\s=-]*$/;
const normalSecret = (s: string) => (BASE32_INPUT.test(s) ? s.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '') : '');

const validSecret = (s: string) => s.length >= 16 && s.length <= 256 && base32Decode(s) !== null;
const validFormat = (digits: unknown, period: unknown) =>
  (digits === 6 || digits === 7 || digits === 8)
  && typeof period === 'number' && Number.isInteger(period) && period >= 10 && period <= 300;

/**
 * One stored entry → a clean account, or null to drop it. totp() trusts its inputs, so this is the guard
 * against corrupted or hand-edited storage.
 */
function clean(a: unknown): OtpAccount | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as Record<string, unknown>;
  if (typeof x.id !== 'string' || !x.id || typeof x.issuer !== 'string' || typeof x.label !== 'string'
    || typeof x.secret !== 'string') return null;
  const secret = normalSecret(x.secret);
  const issuer = x.issuer.trim().slice(0, 40) || 'GitHub';
  const label = x.label.trim().slice(0, 60);
  if (!label || !validSecret(secret) || !validFormat(x.digits, x.period)) return null;
  return { id: x.id, issuer, label, secret, digits: x.digits as 6 | 7 | 8, period: x.period as number };
}

/** Stored JSON → accounts, and whether anything stored couldn't be read (`lossy`): then nothing may be saved
 *  over it, or the unreadable accounts would be gone for good. Never throws. */
type Read = { list: OtpAccount[]; lossy: boolean };
function parse(text: string | null): Read {
  if (!text) return { list: [], lossy: false };
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return { list: [], lossy: true };
    const list = v.map(clean).filter((a): a is OtpAccount => a !== null);
    return { list: list.slice(0, MAX_ACCOUNTS), lossy: list.length !== v.length || list.length > MAX_ACCOUNTS };
  } catch { return { list: [], lossy: true }; }
}

/** Saved accounts couldn't be read at all, or only partly: changes are refused so nothing is overwritten. */
class ReadFailed extends Error {}
class PartlyUnreadable extends Error {}

/** Reads the vault now (strict: throws when something is saved but unreadable). */
const readNow = async (): Promise<Read> => parse(await vault.get());

/** Fills the shared list for display. A failed read shows an empty list and is tried again next time. */
let loaded: Promise<void> | null = null;
function load(): Promise<void> {
  loaded ??= readNow().then(({ list }) => emit(list), () => { loaded = null; if (accounts === null) emit([]); });
  return loaded;
}

// Other tabs (web): saves are serialised across tabs with a Web Lock, and every save tells the other tabs to
// re-read, so a stale tab can't save over an account another tab added.
const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gitling-otp') : null;
if (channel) channel.onmessage = () => { loaded = null; void load(); };
type Locks = { request<T>(name: string, fn: () => Promise<T>): Promise<T> };
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: Locks } | undefined)?.locks;
  return locks?.request ? locks.request('gitling-otp', fn) : fn();
}

function newId(): string {
  const bytes = new Uint8Array(12);
  try { globalThis.crypto.getRandomValues(bytes); } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Runs a change: inside the cross-tab lock it reads what's saved *now* (never a cached copy), refuses if that
 * can't be read in full, applies the change and saves it. The list on screen updates only once the save has
 * reached the device. Changes in this tab also run one at a time, in order.
 */
function change<T>(fn: (list: OtpAccount[]) => { next: OtpAccount[] | null; result: T }): Promise<T> {
  const run = writes.then(() => withLock(async () => {
    let read: Read;
    try { read = await readNow(); } catch { throw new ReadFailed(); }
    if (read.lossy) throw new PartlyUnreadable();
    if (JSON.stringify(read.list) !== JSON.stringify(accounts)) emit(read.list); // another tab may have changed it
    const { next, result } = fn(read.list);
    if (next) {
      await vault.set(JSON.stringify(next));
      emit(next);
      channel?.postMessage('changed');
    }
    return result;
  }));
  writes = run.catch(() => undefined);
  return run;
}

type AddResult = { ok: true; id: string } | { ok: false; error: string };

async function add(a: Omit<OtpAccount, 'id'>): Promise<AddResult> {
  const secret = normalSecret(a.secret ?? '');
  const label = (a.label ?? '').trim();
  const issuer = (a.issuer ?? '').trim().slice(0, 40) || 'GitHub';
  if (!validSecret(secret)) return { ok: false, error: "That setup key isn't valid. Copy it again from GitHub." };
  if (!label) return { ok: false, error: 'Give this account a name.' };
  if (label.length > 60) return { ok: false, error: 'Keep the name to 60 characters or fewer.' };
  if (!validFormat(a.digits, a.period)) {
    return { ok: false, error: 'This account asks for an unusual code format that Gitling does not support.' };
  }
  try {
    return await change<AddResult>((list) => {
      const twin = list.find((x) => normalSecret(x.secret) === secret);
      if (twin) return { next: null, result: { ok: false, error: `${twin.issuer} (${twin.label}) is already here.` } };
      if (list.length >= MAX_ACCOUNTS) return { next: null, result: { ok: false, error: `You can keep up to ${MAX_ACCOUNTS} accounts here. Remove one to add another.` } };
      const id = newId();
      return { next: [...list, { id, issuer, label, secret, digits: a.digits, period: a.period }], result: { ok: true, id } };
    });
  } catch (e) {
    if (e instanceof PartlyUnreadable) return { ok: false, error: "Some accounts saved on this device can't be read, so Gitling won't change the list (that could lose them). Update Gitling and try again." };
    if (e instanceof ReadFailed) return { ok: false, error: "Couldn't read the accounts already saved on this device, so nothing was changed. Close and reopen Gitling, then try again." };
    return { ok: false, error: "Couldn't save this account on this device. Try again." };
  }
}

const remove = (id: string): Promise<void> => change((list) =>
  ({ next: list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : null, result: undefined }));

/** Renames an account. Names are trimmed and cut to 60 characters; an empty name leaves it unchanged. */
const rename = (id: string, label: string): Promise<void> => change((list) => {
  const name = label.trim().slice(0, 60);
  if (!name || !list.some((x) => x.id === id && x.label !== name)) return { next: null, result: undefined };
  return { next: list.map((x) => (x.id === id ? { ...x, label: name } : x)), result: undefined };
});

function subscribe(l: () => void) {
  listeners.add(l);
  void load();
  return () => { listeners.delete(l); };
}

/** The same store outside React (tests; anything that isn't a component). */
export const otpStore = { load, current: () => accounts, add, remove, rename, subscribe };

/** The saved authenticator accounts (null while loading), and the ways to change them. */
export function useOtpAccounts(): {
  accounts: OtpAccount[] | null;
  add(a: Omit<OtpAccount, 'id'>): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  remove(id: string): Promise<void>;
  rename(id: string, label: string): Promise<void>;
} {
  const list = useSyncExternalStore(subscribe, () => accounts, () => null);
  return { accounts: list, add, remove, rename };
}

/** The current code for an account and the seconds it stays valid, updated on each new second. */
export function useTotp(account: OtpAccount): { code: string; remaining: number } {
  const [second, setSecond] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setSecond(Math.floor(Date.now() / 1000));
      timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => clearTimeout(timer);
  }, []);
  const { secret, digits, period } = account;
  return useMemo(() => {
    try { return totp({ secret, digits, period }, second * 1000); }
    catch { return { code: '', remaining: period - (second % period) }; }
  }, [secret, digits, period, second]);
}
