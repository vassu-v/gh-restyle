import { beforeEach, describe, expect, it, vi } from 'vitest';
import { totp, type OtpAccount } from '../packages/github/src/totp';

// The authenticator's store (apps/app/src/authenticator/store.ts) against a stand-in vault that can be told to
// fail. Each test gets a fresh copy of the module (its state is module-level).
const disk = { value: null as string | null, failGet: false, failSet: false, sets: 0 };
vi.mock('@/session/vault', () => ({
  createVault: (_name: string, opts?: { strict?: boolean }) => {
    if (!opts?.strict) throw new Error('the authenticator must use a strict vault');
    return {
      get: async () => { if (disk.failGet) throw new Error('keychain locked'); return disk.value; },
      set: async (v: string) => { if (disk.failSet) throw new Error('quota'); disk.value = v; disk.sets++; },
      clear: async () => { disk.value = null; },
    };
  },
}));

const KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const KEY2 = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const acct = (over: Partial<OtpAccount> = {}): Omit<OtpAccount, 'id'> => ({ issuer: 'GitHub', label: 'octocat', secret: KEY, digits: 6, period: 30, ...over });
const fresh = async () => { vi.resetModules(); return (await import('../apps/app/src/authenticator/store')).otpStore; };
const saved = () => JSON.parse(disk.value ?? '[]') as OtpAccount[];

beforeEach(() => { Object.assign(disk, { value: null, failGet: false, failSet: false, sets: 0 }); });

describe('authenticator store', () => {
  it('adds an account, saves it, and reads it back after a restart', async () => {
    const s = await fresh();
    const r = await s.add(acct({ secret: 'gezd gnbv-gy3t qojq gezd gnbv gy3t qojq==' }));
    expect(r.ok).toBe(true);
    expect(s.current()).toEqual([{ id: (r as { id: string }).id, issuer: 'GitHub', label: 'octocat', secret: KEY, digits: 6, period: 30 }]);
    const again = await fresh();
    await again.load();
    expect(again.current()).toEqual(s.current());
    expect(totp(again.current()![0], 59_000).code).toBe('287082');
  });

  it('refuses a duplicate secret (in any spelling), an empty or long name, and a bad key or format', async () => {
    const s = await fresh();
    await s.add(acct());
    expect(await s.add(acct({ secret: KEY.toLowerCase(), label: 'other' }))).toEqual({ ok: false, error: 'GitHub (octocat) is already here.' });
    expect(await s.add(acct({ secret: KEY2, label: '   ' }))).toMatchObject({ ok: false, error: expect.stringMatching(/name/) });
    expect(await s.add(acct({ secret: KEY2, label: 'x'.repeat(61) }))).toMatchObject({ ok: false });
    expect(await s.add(acct({ secret: 'NOT-A-KEY-0189!' }))).toMatchObject({ ok: false });
    expect(await s.add(acct({ secret: KEY2, digits: 9 as 6 }))).toMatchObject({ ok: false });
    expect(await s.add(acct({ secret: KEY2, period: 5 }))).toMatchObject({ ok: false });
    expect(s.current()).toHaveLength(1);
    expect(saved()).toHaveLength(1);
  });

  it('caps the list at 50 accounts', async () => {
    const s = await fresh();
    // 50 distinct valid secrets: vary the first characters of a base32 key.
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    for (let i = 0; i < 50; i++) expect((await s.add(acct({ secret: A[i % 32] + A[Math.floor(i / 32)] + KEY.slice(2), label: `a${i}` }))).ok).toBe(true);
    expect(await s.add(acct({ secret: KEY2 }))).toMatchObject({ ok: false, error: expect.stringMatching(/up to 50/) });
  });

  it('renames (trimmed, capped) and removes; an empty name changes nothing', async () => {
    const s = await fresh();
    const { id } = (await s.add(acct())) as { id: string };
    await s.rename(id, '  work laptop  ');
    expect(s.current()![0].label).toBe('work laptop');
    const writes = disk.sets;
    await s.rename(id, '   ');
    expect(disk.sets).toBe(writes);
    await s.rename(id, 'y'.repeat(80));
    expect(s.current()![0].label).toBe('y'.repeat(60));
    await s.remove(id);
    expect(s.current()).toEqual([]);
    expect(saved()).toEqual([]);
  });

  it('changes made at the same time all land, in order', async () => {
    const s = await fresh();
    const rs = await Promise.all([s.add(acct()), s.add(acct({ secret: KEY2, label: 'two' })), s.add(acct({ label: 'dupe' }))]);
    expect(rs.map((r) => r.ok)).toEqual([true, true, false]);
    expect(saved().map((a) => a.label)).toEqual(['octocat', 'two']);
  });

  it('corrupt or hand-edited storage never crashes: bad entries are dropped, good ones kept', async () => {
    disk.value = '{not json';
    let s = await fresh(); await s.load();
    expect(s.current()).toEqual([]);
    disk.value = JSON.stringify({ not: 'a list' });
    s = await fresh(); await s.load();
    expect(s.current()).toEqual([]);
    disk.value = JSON.stringify([
      { id: 'ok', issuer: '  ', label: ' me ', secret: KEY, digits: 6, period: 30 },
      { id: '', issuer: 'GitHub', label: 'x', secret: KEY, digits: 6, period: 30 },
      { id: 'b', issuer: 'GitHub', label: 'x', secret: 'short', digits: 6, period: 30 },
      { id: 'c', issuer: 'GitHub', label: 'x', secret: KEY, digits: 6, period: 0 },
      { id: 'd', issuer: 'GitHub', label: 'x', secret: KEY, digits: '6', period: 30 },
      { id: 'e', issuer: 'GitHub', label: '', secret: KEY, digits: 6, period: 30 },
      null, 42, 'text',
    ]);
    s = await fresh(); await s.load();
    expect(s.current()).toEqual([{ id: 'ok', issuer: 'GitHub', label: 'me', secret: KEY, digits: 6, period: 30 }]);
  });

  it('a failed save is reported and rolled back, never a quiet loss', async () => {
    const s = await fresh();
    await s.add(acct());
    disk.failSet = true;
    expect(await s.add(acct({ secret: KEY2, label: 'two' }))).toMatchObject({ ok: false, error: expect.stringMatching(/Couldn't save/) });
    expect(s.current()!.map((a) => a.label)).toEqual(['octocat']);
    await expect(s.remove(s.current()![0].id)).rejects.toThrow();
    expect(s.current()).toHaveLength(1);
    disk.failSet = false;
    expect((await s.add(acct({ secret: KEY2, label: 'two' }))).ok).toBe(true);
  });

  it("when saved accounts can't be read, nothing overwrites them; a later read that works restores them", async () => {
    disk.value = JSON.stringify([{ id: 'keep', issuer: 'GitHub', label: 'me', secret: KEY, digits: 6, period: 30 }]);
    disk.failGet = true;
    const s = await fresh();
    await s.load();
    expect(s.current()).toEqual([]);
    expect(await s.add(acct({ secret: KEY2 }))).toMatchObject({ ok: false, error: expect.stringMatching(/Couldn't read/) });
    expect(saved().map((a) => a.id)).toEqual(['keep']);
    disk.failGet = false;
    expect((await s.add(acct({ secret: KEY2, label: 'two' }))).ok).toBe(true);
    expect(saved().map((a) => a.label)).toEqual(['me', 'two']);
    expect(s.current()!.map((a) => a.label)).toEqual(['me', 'two']);
  });

  it('notifies subscribers on every change', async () => {
    const s = await fresh();
    const seen: number[] = [];
    s.subscribe(() => seen.push(s.current()?.length ?? -1));
    await s.load();
    await s.add(acct());
    expect(seen).toEqual([0, 1]);
  });

  it('a partly unreadable saved list is never saved over (the unreadable accounts would be lost)', async () => {
    const good = { id: 'ok', issuer: 'GitHub', label: 'me', secret: KEY, digits: 6, period: 30 };
    for (const raw of [JSON.stringify([good, { id: 'future', format: 'v2' }]), '{not json', JSON.stringify({ v: 2 })]) {
      disk.value = raw;
      const s = await fresh();
      await s.load();
      expect(await s.add(acct({ secret: KEY2, label: 'two' }))).toMatchObject({ ok: false, error: expect.stringMatching(/can't be read/) });
      if (raw.startsWith('[')) await expect(s.remove('ok')).rejects.toThrow();
      expect(disk.value).toBe(raw);
    }
  });

  it('each change reads what is saved now, so a retry racing a failed read cannot save over unread accounts', async () => {
    disk.value = JSON.stringify([{ id: 'keep', issuer: 'GitHub', label: 'me', secret: KEY, digits: 6, period: 30 }]);
    disk.failGet = true;
    const s = await fresh();
    s.subscribe(() => { void s.load(); }); // a subscriber retrying the read on every notification
    await s.load();
    const pending = s.add(acct({ secret: KEY2, label: 'two' }));
    void s.load();
    expect(await pending).toMatchObject({ ok: false, error: expect.stringMatching(/Couldn't read/) });
    expect(saved().map((a) => a.id)).toEqual(['keep']);
  });

  it('two tabs: a tab with a stale list adds without losing what the other tab added', async () => {
    const tabA = await fresh(); await tabA.load();
    const tabB = await fresh(); await tabB.load();
    expect((await tabA.add(acct({ label: 'from A' }))).ok).toBe(true);
    expect(tabB.current()).toEqual([]); // B hasn't re-read yet
    expect((await tabB.add(acct({ secret: KEY2, label: 'from B' }))).ok).toBe(true);
    expect(saved().map((a) => a.label)).toEqual(['from A', 'from B']);
    expect(tabB.current()!.map((a) => a.label)).toEqual(['from A', 'from B']);
    expect(await tabB.add(acct({ label: 'dupe of A' }))).toMatchObject({ ok: false, error: 'GitHub (from A) is already here.' });
  });

  it('look-alike letters (dotless ı, long ſ) are not turned into key letters', async () => {
    const s = await fresh();
    expect(await s.add(acct({ secret: 'ıııı' + KEY.slice(4) }))).toMatchObject({ ok: false });
    expect(await s.add(acct({ secret: 'ſſſſ' + KEY.slice(4) }))).toMatchObject({ ok: false });
    expect(disk.value).toBeNull();
  });
});

