import { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { parseOtpInput, totp, type OtpAccount } from '@gitling/github';
import { otpStore } from '@/authenticator/store';
import { canBackup, makeBackup, MIN_PASSPHRASE, openBackup } from '@/authenticator/backup';
import { canUseCamera, readQrFromFile, scanWithCamera } from '@/authenticator/scan';
import { useTokens } from '@/design/DesignProvider';
import { Button, Panel, SectionLabel, T } from '@/ui/primitives';

const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_BACKUP = 512 * 1024;

/** Opens the file picker (web). Resolves with the file, or null when nothing was picked. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

type Pending = Omit<OtpAccount, 'id'>;

/**
 * Add an account by scanning GitHub's QR code (camera) or reading it from a screenshot, then confirm it.
 * Everything happens on this device; the secret only ever goes into the encrypted vault.
 */
export function AddByScan({ defaultName, onAdded }: { defaultName: string; onAdded: () => void }) {
  const t = useTokens();
  const [pending, setPending] = useState<Pending | null>(null);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  if (Platform.OS !== 'web') return null;

  const found = (text: string) => {
    // Setup QR codes always hold an otpauth:// link; anything else (a URL, plain words) isn't one.
    const link = /^otpauth:\/\//i.test(text.trim());
    const p = link ? parseOtpInput(text.trim(), defaultName) : null;
    if (!p?.ok) { setErr(p ? p.error : "That QR code isn't a two-factor setup code. Use the one GitHub shows when you set up an authenticator app."); return; }
    setErr(null); setPending(p.account);
  };

  const startCamera = async () => {
    setErr(null); setPending(null); setScanning(true);
    await new Promise((r) => setTimeout(r, 0)); // let the preview box render
    const host = box.current;
    if (!host) { setScanning(false); return; }
    const video = document.createElement('video');
    video.setAttribute('aria-label', 'Camera preview');
    Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '13px' });
    host.replaceChildren(video);
    try {
      stopRef.current = await scanWithCamera(video, (text) => { stopRef.current = null; setScanning(false); found(text); });
    } catch (e) {
      setScanning(false);
      const name = (e as Error).name;
      setErr(name === 'NotAllowedError' ? 'Gitling wasn’t allowed to use the camera. Allow it in your browser’s site settings, or add from a screenshot.'
        : 'Couldn’t open the camera. Add from a screenshot instead.');
    }
  };
  const stopCamera = () => { stopRef.current?.(); stopRef.current = null; setScanning(false); };

  const fromPicture = async () => {
    setErr(null); setPending(null);
    const f = await pickFile('image/*');
    if (!f) return;
    if (f.size > MAX_IMAGE) { setErr('That picture is too big. Try a screenshot of just the QR code.'); return; }
    try {
      const text = await readQrFromFile(f);
      if (!text) { setErr('No QR code found in that picture. Try a clearer screenshot with the whole code in it.'); return; }
      found(text);
    } catch { setErr("Couldn't open that picture."); }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await otpStore.add(pending);
      if (!r.ok) { setErr(r.error); return; }
      setPending(null); onAdded();
    } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {canUseCamera() ? (scanning
          ? <Button kind="quiet" label="Stop camera" onPress={stopCamera} />
          : <Button kind="quiet" icon="eye" label="Scan QR code" onPress={startCamera} />) : null}
        <Button kind="quiet" icon="folder-open" label="From a screenshot" onPress={fromPicture} />
      </View>
      {scanning ? <View ref={box as never} testID="otp-camera" style={{ height: 260, borderRadius: 13, overflow: 'hidden', backgroundColor: t.c.el2 }} /> : null}
      {pending ? (
        <View testID="otp-found" style={{ gap: 8, padding: 12, borderRadius: 13, backgroundColor: t.c.el2 }}>
          <T v="bodyStrong">Found {pending.issuer} · {pending.label}</T>
          <T v="sub" c="mut">First code: {totp(pending).code}. Add it, then type the code Gitling shows into GitHub.</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={busy ? 'Adding…' : 'Add this account'} icon="plus" disabled={busy} onPress={confirm} />
            <Button kind="quiet" label="Cancel" onPress={() => setPending(null)} />
          </View>
        </View>
      ) : null}
      {err ? <T v="sub" c="bad">{err}</T> : null}
    </View>
  );
}

/** Encrypted backup: save every account to a file locked with a passphrase, or restore one. */
export function BackupPanel({ count }: { count: number }) {
  const t = useTokens();
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (Platform.OS !== 'web' || !canBackup()) return null;
  const field = { padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 14 } as const;
  const short = pass.length < MIN_PASSPHRASE;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const text = await makeBackup(otpStore.current() ?? [], pass);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'gitling-authenticator.backup.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setPass(''); setMsg({ ok: true, text: 'Saved an encrypted backup. Keep it somewhere other than this phone, and remember the passphrase: without it the file can’t be opened.' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message || "Couldn't make the backup." }); }
    finally { setBusy(false); }
  };

  const restore = async () => {
    setMsg(null);
    const f = await pickFile('.json,application/json');
    if (!f) return;
    if (f.size > MAX_BACKUP) { setMsg({ ok: false, text: "That file is too big to be a Gitling backup." }); return; }
    setBusy(true);
    try {
      const r = await openBackup(await f.text(), pass);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      let added = 0; let skipped = 0;
      for (const a of r.accounts) { const x = await otpStore.add(a); if (x.ok) added++; else skipped++; }
      setPass('');
      setMsg({ ok: true, text: `Restored ${added} account${added === 1 ? '' : 's'}${skipped ? ` (${skipped} already here or not usable)` : ''}.` });
    } catch { setMsg({ ok: false, text: "Couldn't read that file." }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <SectionLabel title="encrypted backup" />
      <Panel style={{ marginHorizontal: 14, padding: 16, gap: 12 }}>
        <T v="sub" c="mut">{`Save your accounts to a file locked with a passphrase, so a lost phone doesn't lock you out. It's encrypted on this phone (AES-256); the passphrase is never saved or sent.`}</T>
        <TextInput value={pass} onChangeText={(v) => { setPass(v); setMsg(null); }} secureTextEntry placeholder={`Passphrase (${MIN_PASSPHRASE}+ characters)`} placeholderTextColor={t.c.dim}
          autoCapitalize="none" autoCorrect={false} accessibilityLabel="Backup passphrase" style={field} />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button kind="quiet" icon="download" label="Save backup" disabled={busy || short || count === 0} onPress={save} />
          <Button kind="quiet" icon="folder-open" label="Restore" disabled={busy || !pass} onPress={restore} />
        </View>
        {msg ? <T v="sub" c={msg.ok ? 'ok' : 'bad'}>{msg.text}</T> : null}
      </Panel>
    </>
  );
}
