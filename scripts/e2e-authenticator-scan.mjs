// Browser test of adding two-factor accounts by QR code (screenshot + camera) and the encrypted backup, on the
// built web app. Written from the promised behaviour only (not from the implementation).
// Run after `npm run build:web`:  npm run e2e:authenticator:scan
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');
const { chromium } = require('playwright');

const dist = fileURLToPath(new URL('../apps/app/dist/', import.meta.url));
if (!existsSync(join(dist, 'index.html'))) { console.error('Build first: npm run build:web'); process.exit(1); }
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };
const distReal = realpathSync(dist);
const inside = (f) => { try { const r = realpathSync(f); return (r === distReal || r.startsWith(distReal + sep)) && statSync(r).isFile() ? r : null; } catch { return null; } };
const server = createServer((req, res) => {
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  const f = p !== '/' && extname(p) ? inside(resolve(distReal, '.' + p)) : null;
  const target = f ?? join(distReal, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream' }); res.end(readFileSync(target));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const tmp = mkdtempSync(join(tmpdir(), 'gitling-scan-'));

let passed = 0, failed = 0;
const log = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (ok) passed++; else failed++; };

// Independent RFC 6238 reference
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const out = []; for (const ch of s) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); };
const totp = (secret, ms) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(ms / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
const okCode = (secret, code) => { const n = Date.now(); return [n - 30000, n, n + 30000].some((t) => totp(secret, t) === code); };
log(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000) === '287082', 'reference TOTP matches RFC vector');

const link = (secret, label, extra = '') => `otpauth://totp/GitHub:${label}?secret=${secret}&issuer=GitHub&algorithm=SHA1&digits=6&period=30${extra}`;
const S = { a: 'JBSWY3DPEHPK3PXPJBSWY3DP', b: 'KRSXG5CTMVRXEZLUKRSXG5CT', c: 'MFRGGZDFMZTWQ2LKMFRGGZDF', d: 'ONSWG4TFOQYTEMZUONSWG4TF', e: 'GEZDGNBVGY3TQOJQGEZDGNBV', f: 'NBSWY3DPO5XXE3DENBSWY3DP' };
const ALL = Object.values(S);

const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });

// Image helpers: draw the QR into a canvas in the browser for composites/JPEG
const imgCtx = await browser.newContext(); const imgPage = await imgCtx.newPage(); await imgPage.setContent('<body></body>');
const qrPng = async (text, opts = {}) => QRCode.toBuffer(text, { type: 'png', width: 300, margin: 4, ...opts });
const compose = async (png, { w, h, bg = '#ffffff', type = 'image/png', size = 300, transparent = false }) => {
  const url = await imgPage.evaluate(async ({ d, w, h, bg, type, size, transparent }) => {
    const img = new Image(); img.src = d; await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    if (!transparent) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
    x.imageSmoothingEnabled = false; x.drawImage(img, (w - size) / 2, (h - size) / 2, size, size);
    return c.toDataURL(type, 0.92);
  }, { d: 'data:image/png;base64,' + png.toString('base64'), w, h, bg, type, size, transparent });
  return Buffer.from(url.split(',')[1], 'base64');
};
const save = (name, buf) => { const p = join(tmp, name); writeFileSync(p, buf); return p; };

const files = {
  a: save('a.png', await qrPng(link(S.a, 'alice'))),
  phone: save('phone.png', await compose(await qrPng(link(S.b, 'bob')), { w: 1170, h: 2532, size: 500 })),
  transparent: save('t.png', await qrPng(link(S.c, 'carol'), { color: { dark: '#000000ff', light: '#00000000' } })),
  jpeg: save('j.jpg', await compose(await qrPng(link(S.d, 'dave')), { w: 800, h: 800, bg: '#f4f4f0', type: 'image/jpeg', size: 400 })),
  blank: save('blank.png', await compose(await qrPng('x'), { w: 400, h: 400, size: 0 })),
  url: save('url.png', await qrPng('https://example.com/hello')),
  text: save('text.png', await qrPng('just some plain text')),
  sha256: save('sha.png', await qrPng(`otpauth://totp/GitHub:eve?secret=${S.e}&issuer=GitHub&algorithm=SHA256&digits=6&period=30`)),
};
const camJpeg = await compose(await qrPng(link(S.f, 'frank')), { w: 640, h: 480, type: 'image/jpeg', size: 400 });
const mjpeg = save('cam.mjpeg', Buffer.concat(Array(30).fill(camJpeg)));

const foreign = [];
const newCtx = async (b = browser, opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts });
  await ctx.addInitScript(() => localStorage.setItem('gitling.onboarded.v1', 'e2e'));
  ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !/^(data|blob):/.test(u)) foreign.push(u); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${base}/authenticator`, { waitUntil: 'networkidle' });
  await page.getByText('Nothing is sent anywhere', { exact: false }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  return { ctx, page };
};
const count = (page) => page.getByTestId('otp-account').count();
const btn = (page, name) => page.getByRole('button', { name, exact: true }).or(page.getByText(name, { exact: true })).first();
const vis = (l) => l.isVisible().catch(() => false);
const pick = async (page, file) => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), btn(page, 'From a screenshot').click()]);
  await fc.setFiles(file);
};
const found = async (page) => { const f = page.getByTestId('otp-found'); try { await f.waitFor({ timeout: 6000 }); return await f.innerText(); } catch { return null; } };
const firstCode = (txt) => (txt?.match(/First code:\s*([\d\s]{6,8})/) ?? [])[1]?.replace(/\s/g, '');
const errShown = async (page, re) => { try { await page.getByText(re).first().waitFor({ timeout: 6000 }); return true; } catch { return false; } };
const cardCodes = async (page) => (await page.getByTestId('otp-code').allInnerTexts()).map((s) => s.replace(/\s/g, ''));

// ---- 1. screenshot happy path, cancel, add
{
  const { ctx, page } = await newCtx();
  const noCamApi = await page.evaluate(() => !navigator.mediaDevices?.getUserMedia);
  log(await vis(btn(page, 'From a screenshot')), '"From a screenshot" button is shown');
  log(noCamApi || await vis(btn(page, 'Scan QR code')), '"Scan QR code" is shown when the browser has a camera API');
  await pick(page, files.a);
  let t = await found(page);
  log(!!t, 'a GitHub QR screenshot shows the otp-found confirmation');
  log(!!t && /Found GitHub · alice/.test(t), `confirmation reads "Found GitHub · alice" (${JSON.stringify(t)})`);
  log(okCode(S.a, firstCode(t)), `First code is the correct TOTP (${firstCode(t)})`);
  log(await vis(btn(page, 'Add this account')) && await vis(btn(page, 'Cancel')), 'Add this account and Cancel buttons shown');
  log(await count(page) === 0, 'nothing is added before "Add this account"');
  await btn(page, 'Cancel').click(); await page.waitForTimeout(400);
  log(await count(page) === 0 && !(await vis(page.getByTestId('otp-found'))), 'Cancel closes the confirmation and adds nothing');
  await pick(page, files.a); await found(page);
  await btn(page, 'Add this account').click(); await page.waitForTimeout(500);
  log(await count(page) === 1, '"Add this account" adds one account card');
  log(okCode(S.a, (await cardCodes(page))[0]), 'the account card shows the right code');
  log(await vis(page.getByText('Added. Type the code above into GitHub to finish.', { exact: false })), 'shows "Added. Type the code above into GitHub to finish."');

  // ---- 2. errors
  await pick(page, files.blank);
  log(await errShown(page, /No QR code found/), 'picture without a QR code: "No QR code found"');
  await pick(page, files.url);
  log(await errShown(page, /That QR code isn.t a two-factor setup code/), 'https URL QR: "That QR code isn\'t a two-factor setup code"');
  await pick(page, files.text); await page.waitForTimeout(1500); console.log("  [text QR screen]", JSON.stringify((await page.locator("body").innerText()).slice(0, 600)));
  log(await errShown(page, /That QR code isn.t a two-factor setup code/), 'plain text QR: same refusal');
  log(await count(page) === 1 && !(await vis(page.getByTestId('otp-found'))), 'non-2FA QR codes add nothing');
  await pick(page, files.sha256); await page.waitForTimeout(1500);
  const shaFound = await vis(page.getByTestId('otp-found'));
  if (shaFound) await btn(page, 'Add this account').click().catch(() => {});
  await page.waitForTimeout(400);
  log(!shaFound && await count(page) === 1, `algorithm=SHA256 is refused with no confirmation and nothing added${shaFound ? ' (confirmation appeared)' : ''}`);
  log(await vis(page.locator('text=/SHA|algorithm|isn.t|can.t|not supported|unsupported/i').first()), 'SHA256 refusal shows an error message');
  await pick(page, files.a);
  const dupFound = await vis(page.getByTestId('otp-found')) || !!(await found(page).catch(() => null));
  let dupErr = await errShown(page, /already here/);
  if (!dupErr && await vis(page.getByTestId('otp-found'))) { await btn(page, 'Add this account').click(); dupErr = await errShown(page, /already here/); }
  log(dupErr && await count(page) === 1, `scanning the same secret again: "already here" and no duplicate${dupFound ? ' (shown after confirming)' : ''}`);

  // ---- 3. screenshot variants
  for (const [f, s, label, what] of [[files.phone, S.b, 'bob', '1170x2532 screenshot with QR in the middle'], [files.transparent, S.c, 'carol', 'transparent-background PNG'], [files.jpeg, S.d, 'dave', 'dark-on-light JPEG']]) {
    await pick(page, f); t = await found(page);
    const ok = !!t && t.includes(label) && okCode(s, firstCode(t));
    log(ok, `${what} is read (${JSON.stringify(t)})`);
    if (t) { await btn(page, 'Add this account').click(); await page.waitForTimeout(400); }
  }
  log(await count(page) === 4, `four accounts after the screenshot variants (${await count(page)})`);

  // ---- 7. storage has no plaintext
  const dump = await page.evaluate(async () => {
    const parts = []; const text = (v) => { if (v == null) return ''; if (typeof v === 'string') return v; if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) { const b = new Uint8Array(v instanceof ArrayBuffer ? v : v.buffer); return Array.from(b, (x) => String.fromCharCode(x)).join(''); } if (typeof CryptoKey !== 'undefined' && v instanceof CryptoKey) return '[key]'; if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}:${text(x)}`).join('|'); return String(v); };
    for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) { const k = s.key(i); parts.push(k, s.getItem(k)); }
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const st of db.objectStoreNames) parts.push(...await new Promise((res) => { const out = []; const c = db.transaction(st).objectStore(st).openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); out.push(text(cur.key), text(cur.value)); cur.continue(); }; c.onerror = () => res(out); }));
      db.close();
    }
    return parts.join('\n');
  });
  const leaks = ALL.flatMap((s) => [s, s.toLowerCase()]).filter((s) => dump.includes(s));
  log(leaks.length === 0, `no plaintext secret in localStorage/sessionStorage/IndexedDB after scanning${leaks.length ? ' · found ' + leaks.join(',') : ''}`);

  // ---- 6. backup
  const pass = page.getByLabel('Backup passphrase');
  log(await vis(page.getByText(/encrypted backup/i).first()), 'an "encrypted backup" section is shown');
  log(await pass.getAttribute('type').catch(() => null) === 'password', 'the passphrase field is masked');
  const saveBtn = page.getByRole('button', { name: 'Save backup' });
  const disabled = async () => (await saveBtn.isDisabled().catch(() => false)) || (await saveBtn.getAttribute('aria-disabled')) === 'true';
  await pass.fill('short');
  log(await disabled(), 'Save backup is disabled with a passphrase under 10 characters');
  const PASS = 'correct horse battery';
  await pass.fill(PASS);
  log(!(await disabled()), 'Save backup is enabled with 4 accounts and a long passphrase');
  let backupPath = null, backupText = '';
  try {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), saveBtn.click()]);
    log(dl.suggestedFilename() === 'gitling-authenticator.backup.json', `download is named gitling-authenticator.backup.json (${dl.suggestedFilename()})`);
    backupPath = join(tmp, 'backup.json'); await dl.saveAs(backupPath); backupText = readFileSync(backupPath, 'utf8');
  } catch (e) { log(false, 'Save backup downloads a file: ' + e.message); }
  let parsed = null; try { parsed = JSON.parse(backupText); } catch {}
  log(parsed?.kind === 'gitling-authenticator-backup', 'backup is JSON with kind "gitling-authenticator-backup"');
  const spaced = (s) => s.replace(/(.{4})/g, '$1 ').trim();
  const plain = [...ALL.flatMap((s) => [s, s.toLowerCase(), spaced(s), spaced(s.toLowerCase())]), 'alice', 'bob', 'carol', 'dave', 'GitHub'].filter((s) => backupText.includes(s));
  log(!!backupText && plain.length === 0, `backup contains no secret, label or issuer in plain text${plain.length ? ' · found ' + plain.join(',') : ''}`);
  await ctx.close();

  // Empty profile: Save disabled; restore
  if (backupPath) {
    const { ctx: c2, page: p2 } = await newCtx();
    await p2.getByLabel('Backup passphrase').fill(PASS);
    const sb = p2.getByRole('button', { name: 'Save backup' });
    log((await sb.isDisabled().catch(() => false)) || (await sb.getAttribute('aria-disabled')) === 'true', 'Save backup is disabled with no accounts');
    const restore = async (p, file, pw) => {
      await p.getByLabel('Backup passphrase').fill(pw);
      const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), btn(p, 'Restore').click()]);
      await fc.setFiles(file); await p.waitForTimeout(1500);
    };
    await restore(p2, backupPath, 'wrong passphrase!!');
    log(await errShown(p2, /Wrong passphrase, or the backup is damaged\./) && await count(p2) === 0, 'wrong passphrase: refused, nothing added');
    const obj = JSON.parse(backupText); let tampered = false;
    const flip = (o) => { for (const k of Object.keys(o)) { if (tampered) return; const v = o[k]; if (typeof v === 'string' && v.length > 40 && k !== 'kind') { const i = Math.floor(v.length / 2); o[k] = v.slice(0, i) + (v[i] === 'A' ? 'B' : 'A') + v.slice(i + 1); tampered = true; } else if (v && typeof v === 'object') flip(v); } };
    flip(obj);
    const tp = save('tampered.json', JSON.stringify(obj));
    await restore(p2, tp, PASS);
    log(tampered && await errShown(p2, /Wrong passphrase, or the backup is damaged\./) && await count(p2) === 0, 'tampered backup: refused, nothing added');
    await restore(p2, save('random.json', JSON.stringify({ hello: 'world', items: [1, 2] })), PASS);
    log(await errShown(p2, /That isn.t a Gitling authenticator backup\./) && await count(p2) === 0, 'random JSON: "That isn\'t a Gitling authenticator backup."');
    await restore(p2, backupPath, PASS);
    log(await errShown(p2, /Restored 4 account/) && await count(p2) === 4, `right passphrase on a fresh profile restores 4 accounts (${await count(p2)})`);
    const codes = await cardCodes(p2);
    const expected = [S.a, S.b, S.c, S.d];
    log(expected.every((s) => codes.some((c) => okCode(s, c))), 'restored accounts show the correct codes');
    await restore(p2, backupPath, PASS);
    console.log('  [restore again]', JSON.stringify((await p2.locator('body').innerText()).match(/Restored[^\n]*|[^\n]*(skip|already)[^\n]*/gi)));
    log(await errShown(p2, /skipped/i) && await count(p2) === 4, 'restoring again reports skipped and adds no duplicates');
    await c2.close();
  }
}

// ---- 4. camera
{
  const camBrowser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${mjpeg}`] });
  const { ctx, page } = await newCtx(camBrowser, { permissions: ['camera'] });
  const scan = btn(page, 'Scan QR code');
  log(await vis(scan), '"Scan QR code" is shown with a camera API');
  await scan.click();
  let preview = false; try { await page.getByTestId('otp-camera').waitFor({ timeout: 5000 }); preview = true; } catch {}
  log(preview, 'the camera preview (otp-camera) appears');
  const t = await found(page).then((x) => x ?? page.getByTestId('otp-found').waitFor({ timeout: 10000 }).then(() => page.getByTestId('otp-found').innerText()).catch(() => null));
  log(!!t && t.includes('frank') && okCode(S.f, firstCode(t)), `the camera reads the QR code and shows the confirmation (${JSON.stringify(t)})`);
  await page.waitForTimeout(500);
  const live = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.srcObject && v.srcObject.getVideoTracks().some((t) => t.readyState === 'live')).length);
  log(live === 0 && !(await vis(page.getByTestId('otp-camera'))), `after reading, the camera stops and the preview is gone (live videos: ${live})`);
  if (t) { await btn(page, 'Add this account').click(); await page.waitForTimeout(400); }
  log(await count(page) === 1, 'the scanned account is added');
  await ctx.close();
  // Stop camera: use a camera showing no QR code
  const blankJpeg = await compose(await qrPng('x'), { w: 640, h: 480, type: 'image/jpeg', size: 0 });
  const b2 = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${save('blank.mjpeg', Buffer.concat(Array(10).fill(blankJpeg)))}`] });
  const s = await newCtx(b2, { permissions: ['camera'] });
  await btn(s.page, 'Scan QR code').click();
  let pv = false; try { await s.page.getByTestId('otp-camera').waitFor({ timeout: 5000 }); pv = true; } catch {}
  await s.page.waitForTimeout(800);
  await btn(s.page, 'Stop camera').click().catch(() => {}); await s.page.waitForTimeout(500);
  const live2 = await s.page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.srcObject && v.srcObject.getVideoTracks().some((t) => t.readyState === 'live')).length);
  log(pv && !(await vis(s.page.getByTestId('otp-camera'))) && live2 === 0, '"Stop camera" hides the preview and stops the camera');
  await b2.close(); await camBrowser.close();
  // Denied
  const b3 = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--deny-permission-prompts'] });
  const d = await newCtx(b3);
  await btn(d.page, 'Scan QR code').click();
  log(await errShown(d.page, /allow.*camera|camera.*allow|from a screenshot/i), 'camera permission denied: error mentions allowing the camera or adding from a screenshot');
  await b3.close();
}

log(foreign.length === 0, `no requests to any host but the local server${foreign.length ? ' · ' + [...new Set(foreign)].slice(0, 5).join(', ') : ''}`);
await browser.close(); server.close();
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
