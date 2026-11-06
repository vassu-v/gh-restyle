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
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
let writes: Promise<unknown> = Promise.resolve(); // changes run one at a time, in order

function emit(next: OtpAccount[]) {
  accounts = next;
  listeners.forEach((l) => l());
}

const normalSecret = (s: string) => s.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');

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

/** Stored JSON → accounts. Anything unreadable becomes an empty list (or is skipped), never a crash. */
function parse(text: string | null): OtpAccount[] {
  if (!text) return [];
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return [];
    return v.map(clean).filter((a): a is OtpAccount => a !== null).slice(0, MAX_ACCOUNTS);
  } catch { return []; }
}

/** The device's secure storage couldn't be read (not the same as "nothing saved"): changes are refused until a
 *  later read works, so a save can never overwrite accounts we failed to read. */
let readFailed = false;
class ReadFailed extends Error {}

function load(): Promise<void> {
  if (readFailed) { readFailed = false; loading = null; } // try again
  loading ??= vault.get().then(parse, () => { readFailed = true; return []; }).then((list) => { if (accounts === null || !readFailed) emit(list); });
  return loading;
}

function newId(): string {
  const bytes = new Uint8Array(12);
  try { globalThis.crypto.getRandomValues(bytes); } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Runs a change after the list is loaded and after earlier changes, saving the result. */
function change<T>(fn: (list: OtpAccount[]) => { next: OtpAccount[] | null; result: T }): Promise<T> {
  const run = writes.then(async () => {
    await load();
    if (readFailed) throw new ReadFailed();
    const before = accounts ?? [];
    const { next, result } = fn(before);
    if (next) {
      emit(next);
      try { await vault.set(JSON.stringify(next)); } catch (e) { emit(before); throw e; }
    }
    return result;
  });
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
