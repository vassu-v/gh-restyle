// Browser test of the Authenticator screen on the built web app: add from a setup key and from an otpauth://
// link, codes match an independent HMAC-SHA1 (node:crypto), countdown, copy, rename, two-tap remove, survives a
// reload, no plaintext secret in any browser storage, and signing out of GitHub leaves the accounts alone.
// Run after `npm run build:web`:  npm run e2e:authenticator
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../apps/app/dist/', import.meta.url));
if (!existsSync(join(dist, 'index.html'))) { console.error('Build first: npm run build:web'); process.exit(1); }
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = join(dist, p);
  const target = p !== '/' && existsSync(f) && extname(f) ? f : join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream' }); res.end(readFileSync(target));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
let passed = 0, failed = 0;
const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (ok) passed++; else { failed++; process.exitCode = 1; } };

// Independent reference: RFC 6238 with node:crypto, not the app's own code.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const out = []; for (const ch of s) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); };
const totp = (secret, ms, digits = 6, period = 30) => {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(ms / 1000 / period)));
  const h = createHmac('sha1', b32(secret)).update(msg).digest(); const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
};
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890", the RFC 4226/6238 test key
const LINK_SECRET = 'JBSWY3DPEHPK3PXP';
const LINK = `otpauth://totp/GitHub:sample-user?secret=${LINK_SECRET}&issuer=GitHub`;
log(totp(RFC_SECRET, 59_000, 8) === '94287082', 'reference implementation matches the RFC 6238 vector (T=59 s → 94287082)');

const T0 = Date.parse('2026-11-06T12:00:10Z'); // 20 s left in its 30 s window

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.addInitScript(() => localStorage.setItem('gitling.onboarded.v1', 'e2e'));
// Fake api.github.com for the sign-in/sign-out part (a pasted token, so no OAuth worker needed).
await ctx.route('https://api.github.com/**', (route) => {
  const path = new URL(route.request().url()).pathname;
  const body = path === '/user' ? { login: 'e2e-user', name: 'E2E User', avatar_url: '', public_repos: 0, followers: 0, following: 0 } : [];
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify(body) });
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.clock.setFixedTime(T0);

const codes = async () => (await page.getByTestId('otp-code').allInnerTexts()).map((s) => s.replace(/\s+/g, ''));
const count = () => page.getByTestId('otp-account').count();
const keyBox = () => page.getByLabel('Setup key or otpauth link');
const addBtn = () => page.getByRole('button', { name: 'Add', exact: true });
const settle = (ms = 400) => page.waitForTimeout(ms);
const open = async () => { await page.goto(`${base}/authenticator`, { waitUntil: 'networkidle' }); await page.getByText('Nothing is sent anywhere', { exact: false }).waitFor({ timeout: 8000 }); await settle(); };

// Entry point
await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
const row = page.getByText('Two-factor codes for GitHub');
log(await row.isVisible().catch(() => false), 'Account shows an Authenticator row when signed out');
await row.click();
await page.getByText('Nothing is sent anywhere', { exact: false }).waitFor({ timeout: 8000 }).catch(() => {});
log(new URL(page.url()).pathname === '/authenticator', 'the row opens /authenticator');
await settle();
log(await count() === 0 && await page.getByText('setup key', { exact: false }).first().isVisible(), 'empty screen explains how to set it up');

// Bad key: error, nothing added
await keyBox().fill('this is not a key!');
await addBtn().click(); await settle();
log(await page.getByText("That isn't a setup key", { exact: false }).isVisible().catch(() => false), 'a bad key shows a plain error');
log(await count() === 0, 'a bad key adds nothing');

// Bare key
await keyBox().fill(RFC_SECRET.toLowerCase().replace(/(.{4})/g, '$1 ').trim());
await addBtn().click(); await settle();
log(await count() === 1, 'adding a setup key (lower case, with spaces) adds one account');
let shown = await codes();
log(shown[0] === totp(RFC_SECRET, T0), `the code on screen matches RFC 6238 (${shown[0]} vs ${totp(RFC_SECRET, T0)})`);
log(/^\d{3} \d{3}$/.test((await page.getByTestId('otp-code').first().innerText()).trim()), 'the code is grouped as "123 456"');
log(await page.getByText('GitHub', { exact: true }).first().isVisible().catch(() => false) && !(await page.getByText('GitHub · GitHub', { exact: true }).count()), 'a bare key signed out is named "GitHub", shown once (not "GitHub · GitHub")');
log(await page.getByTestId('otp-countdown').first().isVisible() && await page.getByText('20s', { exact: true }).isVisible().catch(() => false), 'the countdown shows 20 s left');
log(await keyBox().inputValue() === '', 'the key box is cleared after adding');

// The clock moves: the code follows it
await page.clock.setFixedTime(T0 + 17_000); await settle(1300);
log(await page.getByText('3s', { exact: true }).isVisible().catch(() => false), 'the countdown ticks (3 s left)');
await page.clock.setFixedTime(T0 + 21_000); await settle(1300);
shown = await codes();
log(shown[0] === totp(RFC_SECRET, T0 + 21_000) && shown[0] !== totp(RFC_SECRET, T0), 'a new window gives the next code');
const T1 = T0 + 21_000;

// otpauth link
await keyBox().fill(LINK);
await addBtn().click(); await settle();
log(await count() === 2, 'an otpauth:// link adds a second account');
log(await page.getByText('GitHub · sample-user', { exact: true }).isVisible().catch(() => false), 'the link’s label is used');
shown = await codes();
log(shown[1] === totp(LINK_SECRET, T1), `the second code matches (${shown[1]})`);

// Duplicate
await keyBox().fill(RFC_SECRET);
await addBtn().click(); await settle();
const dupError = await page.locator('text=/already/i').first().isVisible().catch(() => false);
log(await count() === 2 && dupError, 'adding the same key again is refused with a message');
await keyBox().fill('');

// Rename
const first = page.getByTestId('otp-account').first();
await first.getByText('Rename', { exact: true }).click();
await page.getByLabel('New name').fill('work laptop');
await first.getByText('Save', { exact: true }).click(); await settle();
log(await page.getByText('GitHub · work laptop', { exact: true }).isVisible().catch(() => false), 'rename changes the label');

// Copy
await page.evaluate(() => navigator.clipboard.writeText(''));
await first.getByText('Copy', { exact: true }).click(); await settle();
const clip = await page.evaluate(() => navigator.clipboard.readText());
log(clip === totp(RFC_SECRET, T1), `Copy puts the code on the clipboard (${clip})`);
log(await first.getByText('Copied', { exact: true }).isVisible().catch(() => false), 'Copy says "Copied"');

// A failed save (IndexedDB writes refused) says so and changes nothing
await page.evaluate(() => { const put = IDBObjectStore.prototype.put; window.__put = put; IDBObjectStore.prototype.put = function () { throw new DOMException('refused by test', 'QuotaExceededError'); }; });
await first.getByText('Rename', { exact: true }).click();
await page.getByLabel('New name').fill('should not stick');
await first.getByText('Save', { exact: true }).click(); await settle();
log(await page.getByText("Couldn't save that change on this device", { exact: false }).isVisible().catch(() => false), 'a rename that can\'t be saved shows a plain error');
await first.getByText('Cancel', { exact: true }).click(); await settle();
log(await page.getByText('GitHub · work laptop', { exact: true }).isVisible().catch(() => false), 'and the old name stays');
await first.getByText('Remove', { exact: true }).click(); await first.getByText('Tap again to remove').click(); await settle();
log(await count() === 2 && await page.getByText("Couldn't save that change on this device", { exact: false }).isVisible().catch(() => false), 'a remove that can\'t be saved shows a plain error and keeps the account');
await page.evaluate(() => { IDBObjectStore.prototype.put = window.__put; });

// Survives a reload
await open();
log(await count() === 2, 'both accounts are still there after a reload');
log(await page.getByText('GitHub · work laptop', { exact: true }).isVisible().catch(() => false), 'the new name is still there after a reload');

// No plaintext secret anywhere in storage
const dump = await page.evaluate(async () => {
  const parts = [];
  const text = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) { const b = new Uint8Array(v instanceof ArrayBuffer ? v : v.buffer); return Array.from(b, (x) => String.fromCharCode(x)).join(''); }
    if (typeof CryptoKey !== 'undefined' && v instanceof CryptoKey) return '[CryptoKey]';
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}:${text(x)}`).join('|');
    return String(v);
  };
  for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) { const k = s.key(i); parts.push(k, s.getItem(k)); }
  parts.push(document.cookie);
  const dbs = await indexedDB.databases();
  for (const { name } of dbs) {
    const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    for (const store of db.objectStoreNames) {
      const rows = await new Promise((res) => { const tx = db.transaction(store, 'readonly'); const os = tx.objectStore(store); const out = []; const c = os.openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); out.push(text(cur.key), text(cur.value)); cur.continue(); }; c.onerror = () => res(out); });
      parts.push(...rows);
    }
    db.close();
  }
  return { all: parts.join('\n'), dbs: dbs.map((d) => d.name) };
});
const leaks = [RFC_SECRET, LINK_SECRET, RFC_SECRET.toLowerCase(), LINK_SECRET.toLowerCase(), 'GEZD GNBV', '12345678901234567890'].filter((s) => dump.all.includes(s));
log(leaks.length === 0, `no plaintext secret in localStorage, sessionStorage, cookies or IndexedDB (${dump.dbs.join(', ') || 'no databases'})${leaks.length ? ' · found: ' + leaks.join(', ') : ''}`);

// Signing in and out of GitHub doesn't remove them
await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
const pat = page.getByText('Use a personal access token instead');
if (await pat.isVisible().catch(() => false)) await pat.click();
await page.getByPlaceholder('ghp_…').fill('ghp_e2e_fake_token');
await page.getByText('Use this token', { exact: true }).click();
await settle(1000);
await page.goto(`${base}/authenticator`, { waitUntil: 'networkidle' }); await settle();
log(await count() === 2, 'signing in keeps the accounts');
log(await page.getByPlaceholder(/Name \(optional, e2e-user\)/).isVisible().catch(() => false), 'signed in, a new account is named after your GitHub login by default');
await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
const signOut = page.getByText('Sign out', { exact: true });
const signedIn = await signOut.isVisible().catch(() => false);
log(signedIn, 'the fake token signs in (Sign out is shown)');
if (signedIn) {
  log(await page.getByText('Two-factor codes for GitHub').isVisible().catch(() => false), 'Account shows the Authenticator row when signed in');
  await signOut.click(); await settle(1000);
}
await open();
log(await count() === 2, 'signing out of Gitling leaves both accounts');

// Remove needs two taps
const second = page.getByTestId('otp-account').nth(1);
await second.getByText('Remove', { exact: true }).click(); await page.waitForTimeout(6400);
log(await second.getByText('Remove', { exact: true }).isVisible().catch(() => false) && await count() === 2, 'an unconfirmed Remove resets after 6 s');
await second.getByText('Remove', { exact: true }).click(); await settle();
log(await count() === 2 && await second.getByText('Tap again to remove').isVisible().catch(() => false), 'one tap on Remove only asks for confirmation');
await second.getByText('Tap again to remove').click(); await settle();
log(await count() === 1, 'the second tap removes it');
await open();
log(await count() === 1 && await page.getByText('GitHub · work laptop', { exact: true }).isVisible().catch(() => false), 'the removal sticks after a reload, the other account stays');

log(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); server.close();
console.log(`\n${passed}/${passed + failed} passed`);
console.log(failed ? 'authenticator e2e FAILED' : 'authenticator e2e passed');
