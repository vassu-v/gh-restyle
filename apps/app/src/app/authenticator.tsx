import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { parseOtpInput, type OtpAccount } from '@gitling/github';
import { useOtpAccounts, useTotp } from '@/authenticator/store';
import { useTokens } from '@/design/DesignProvider';
import { useMe } from '@/data/queries';
import { openUrl } from '@/lib/links';
import { useSession } from '@/session/SessionProvider';
import { BackHeader, Button, Loading, Num, Panel, Screen, SectionLabel, T } from '@/ui/primitives';

const SECURITY_URL = 'https://github.com/settings/security';
const SAVE_FAILED = "Couldn't save that change on this device. Try again.";

/** "123456" → "123 456", "12345678" → "1234 5678". */
const groupCode = (code: string) => {
  if (!code) return '——— ———'; // a stored account that can't make a code; shouldn't happen, never crash
  const half = Math.floor(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
};

export default function Authenticator() {
  const t = useTokens();
  const { accounts, add, remove, rename } = useOtpAccounts();
  const { isSample } = useSession();
  const me = useMe();
  const defaultName = (!isSample && me.data?.login) || 'GitHub';
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  // Kept here, not in the card: a failed remove drops the card and brings it back as a new one (rollback).
  const [cardErr, setCardErr] = useState<{ id: string; text: string } | null>(null);
  const guard = (id: string, fn: () => Promise<void>) => { setCardErr(null); return fn().catch(() => { setCardErr({ id, text: SAVE_FAILED }); throw new Error(SAVE_FAILED); }); };
  const empty = accounts?.length === 0;

  const onAdd = async () => {
    setErr(null); setAdded(false);
    const parsed = parseOtpInput(input, name.trim() || defaultName);
    if (!parsed.ok) { setErr(parsed.error); return; }
    const account = name.trim() ? { ...parsed.account, label: name.trim().slice(0, 60) } : parsed.account;
    setBusy(true);
    try {
      const r = await add(account);
      if (!r.ok) { setErr(r.error); return; }
      setInput(''); setName(''); setAdded(true);
    } catch (e) { setErr((e as Error).message || "Couldn't save this account."); }
    finally { setBusy(false); }
  };

  const field = { padding: 12, borderRadius: 13, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 14 } as const;

  return (
    <Screen bottomSpace={40} header={<BackHeader title="Authenticator" />}>
      <View style={{ paddingHorizontal: 18, paddingBottom: 14, gap: 6 }}>
        <T v="h2">Authenticator</T>
        <T v="sub" c="mut">Two-factor codes for GitHub, made on this phone. Nothing is sent anywhere.</T>
      </View>

      {accounts === null ? <Loading rows={1} /> : (
        <View style={{ paddingHorizontal: 14, gap: 12 }}>
          {accounts.map((a) => <AccountCard key={a.id} account={a} error={cardErr?.id === a.id ? cardErr.text : null}
            onRemove={() => guard(a.id, () => remove(a.id))} onRename={(label) => guard(a.id, () => rename(a.id, label))} />)}
        </View>
      )}

      <SectionLabel title={empty ? 'set up github' : 'add another'} />
      <Panel style={{ marginHorizontal: 14, padding: 16, gap: 12 }}>
        {empty ? (
          <View style={{ gap: 6 }}>
            <T v="sub" c="mut">1. On GitHub, open Settings → Password and authentication, and choose to set up an authenticator app.</T>
            <T v="sub" c="mut">{'2. Under the QR code, tap the “setup key” link and copy the key.'}</T>
            <T v="sub" c="mut">3. Paste it here and tap Add.</T>
            <T v="sub" c="mut">4. Type the code Gitling shows into GitHub to finish.</T>
          </View>
        ) : (
          <T v="sub" c="mut">{'Paste the setup key GitHub shows under the QR code, or the whole otpauth:// link.'}</T>
        )}
        <Pressable onPress={() => openUrl(SECURITY_URL)} accessibilityRole="link"><T v="bodyStrong" c="acc">Open GitHub security settings ↗</T></Pressable>
        <TextInput value={input} onChangeText={(v) => { setInput(v); setErr(null); setAdded(false); }} placeholder="Setup key or otpauth:// link" placeholderTextColor={t.c.dim}
          autoCapitalize="none" autoCorrect={false} spellCheck={false} accessibilityLabel="Setup key or otpauth link" style={field} />
        <TextInput value={name} onChangeText={setName} placeholder={`Name (optional, ${defaultName})`} placeholderTextColor={t.c.dim}
          autoCapitalize="none" autoCorrect={false} accessibilityLabel="Name" style={field} />
        <Button label={busy ? 'Adding…' : 'Add'} icon="plus" disabled={!input.trim() || busy} onPress={onAdd} />
        {err ? <T v="sub" c="bad">{err}</T> : null}
        {added ? <T v="sub" c="ok">Added. Type the code above into GitHub to finish.</T> : null}
      </Panel>

      <View style={{ paddingHorizontal: 18, paddingTop: 22, gap: 8 }}>
        <T v="label" c="mut">good to know</T>
        <T v="sub" c="mut">With these codes and your GitHub session on the same phone, this phone is both of your sign-in factors. Keep GitHub’s recovery codes somewhere else, like a password manager or on paper.</T>
        <T v="sub" c="mut">{'Signing out of Gitling doesn’t remove these. To remove one, tap Remove twice.'}</T>
      </View>
    </Screen>
  );
}

function AccountCard({ account, error, onRemove, onRename }: { account: OtpAccount; error: string | null; onRemove: () => Promise<void>; onRename: (label: string) => Promise<void> }) {
  const t = useTokens();
  const { code, remaining } = useTotp(account);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.label);
  const [armed, setArmed] = useState(false);
  const [copyErr, setCopyErr] = useState<string | null>(null);
  const err = error ?? copyErr;
  const disarm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const uncopy = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(disarm.current); clearTimeout(uncopy.current); }, []);

  const low = remaining <= 5;
  const copy = async () => {
    if (!code) return;
    try { await Clipboard.setStringAsync(code); } catch { setCopyErr("Couldn't copy the code. Type it in instead."); return; }
    setCopyErr(null); setCopied(true); clearTimeout(uncopy.current);
    uncopy.current = setTimeout(() => setCopied(false), 2000);
  };
  const pressRemove = () => {
    clearTimeout(disarm.current);
    if (!armed) { setArmed(true); disarm.current = setTimeout(() => setArmed(false), 6000); return; }
    setArmed(false);
    onRemove().catch(() => {}); // the screen shows the error
  };
  const saveName = async () => {
    const label = draft.trim();
    if (label && label !== account.label) {
      try { await onRename(label.slice(0, 60)); } catch { return; } // stay in edit mode; the screen shows the error
    }
    setEditing(false);
  };

  return (
    <View testID="otp-account">
      <Panel style={{ padding: 16, gap: 12 }}>
        {editing ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput value={draft} onChangeText={setDraft} autoFocus autoCapitalize="none" autoCorrect={false} accessibilityLabel="New name" onSubmitEditing={saveName}
              style={{ flex: 1, padding: 10, borderRadius: 11, backgroundColor: t.c.el2, color: t.c.fg, fontFamily: t.font.mono.regular, fontSize: 14 }} />
            <Pressable onPress={saveName} accessibilityRole="button" hitSlop={8}><T v="bodyStrong" c="acc">Save</T></Pressable>
            <Pressable onPress={() => { setDraft(account.label); setEditing(false); }} accessibilityRole="button" hitSlop={8}><T v="bodyStrong" c="mut">Cancel</T></Pressable>
          </View>
        ) : (
          <T v="mono" c="mut" lines={1}>{account.label.toLowerCase() === account.issuer.toLowerCase() ? account.issuer : `${account.issuer} · ${account.label}`}</T>
        )}

        <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={`Copy code for ${account.label}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', opacity: pressed ? 0.7 : 1 })}>
          <View testID="otp-code"><Num value={groupCode(code)} size={46} c={low ? 'wait' : 'fg'} /></View>
          <T v="mono" c={low ? 'wait' : 'mut'} style={{ paddingBottom: 4 }}>{remaining}s</T>
        </Pressable>

        <View testID="otp-countdown" accessibilityLabel={`${remaining} seconds left`} style={{ height: 3, borderRadius: 2, backgroundColor: t.c.line2, overflow: 'hidden' }}>
          <View style={{ height: 3, width: `${Math.max(0, Math.min(1, remaining / account.period)) * 100}%`, backgroundColor: low ? t.c.wait : t.c.acc }} />
        </View>

        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
          <Pressable onPress={copy} accessibilityRole="button" hitSlop={8}><T v="bodyStrong" c="acc">{copied ? 'Copied' : 'Copy'}</T></Pressable>
          {!editing ? <Pressable onPress={() => { setDraft(account.label); setEditing(true); }} accessibilityRole="button" hitSlop={8}><T v="bodyStrong" c="mut">Rename</T></Pressable> : null}
          <View style={{ flex: 1 }} />
          <Pressable onPress={pressRemove} accessibilityRole="button" hitSlop={8}><T v="bodyStrong" c="bad">{armed ? 'Tap again to remove' : 'Remove'}</T></Pressable>
        </View>
        {err ? <T v="sub" c="bad">{err}</T> : null}
      </Panel>
    </View>
  );
}
