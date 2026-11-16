import type { OtpAccount } from '@gitling/github';

/**
 * Encrypted backups of the authenticator's accounts, so a lost or reset phone doesn't lock anyone out.
 * The file is encrypted on this device with a passphrase the person chooses (PBKDF2-SHA-256, 600,000 rounds,
 * then AES-256-GCM); without the passphrase it's random bytes. The passphrase is never stored or sent.
 */

export const BACKUP_KIND = 'gitling-authenticator-backup';
const ROUNDS = 600_000;
export const MIN_PASSPHRASE = 10;

type BackupFile = { kind: typeof BACKUP_KIND; v: 1; kdf: 'PBKDF2-SHA256'; rounds: number; salt: string; iv: string; data: string };

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(passphrase: string, salt: Uint8Array, rounds: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: rounds }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const canBackup = () => typeof crypto !== 'undefined' && !!crypto.subtle;

/** The accounts, encrypted with the passphrase, as the text of a backup file. */
export async function makeBackup(accounts: OtpAccount[], passphrase: string): Promise<string> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(passphrase, salt, ROUNDS);
  const plain = new TextEncoder().encode(JSON.stringify(accounts.map(({ issuer, label, secret, digits, period }) => ({ issuer, label, secret, digits, period }))));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(BACKUP_KIND) }, key, plain));
  plain.fill(0);
  const file: BackupFile = { kind: BACKUP_KIND, v: 1, kdf: 'PBKDF2-SHA256', rounds: ROUNDS, salt: b64(salt), iv: b64(iv), data: b64(data) };
  return JSON.stringify(file, null, 2);
}

export type RestoreResult = { ok: true; accounts: Omit<OtpAccount, 'id'>[] } | { ok: false; error: string };

/** A backup file's text + passphrase → its accounts (still to be checked and added by the store). */
export async function openBackup(text: string, passphrase: string): Promise<RestoreResult> {
  let f: BackupFile;
  try { f = JSON.parse(text); } catch { return { ok: false, error: "That isn't a Gitling authenticator backup." }; }
  if (!f || f.kind !== BACKUP_KIND || f.v !== 1 || f.kdf !== 'PBKDF2-SHA256') return { ok: false, error: "That isn't a Gitling authenticator backup." };
  if (!Number.isInteger(f.rounds) || f.rounds < 100_000 || f.rounds > 10_000_000) return { ok: false, error: 'That backup looks damaged.' };
  let plain: Uint8Array;
  try {
    const key = await keyFrom(passphrase, unb64(f.salt), f.rounds);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) as BufferSource, additionalData: new TextEncoder().encode(BACKUP_KIND) }, key, unb64(f.data) as BufferSource));
  } catch { return { ok: false, error: 'Wrong passphrase, or the backup is damaged.' }; }
  try {
    const list: unknown = JSON.parse(new TextDecoder().decode(plain));
    plain.fill(0);
    if (!Array.isArray(list)) throw new Error();
    return { ok: true, accounts: list as Omit<OtpAccount, 'id'>[] };
  } catch { return { ok: false, error: 'That backup looks damaged.' }; }
}
