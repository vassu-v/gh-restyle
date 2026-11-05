// Browser smoke test of the built web app (sample-data mode). Run after `npm run build:web`.
// Opens every screen at phone size and fails on a blank screen, an error state or a console error.
// Needs Playwright with Chromium (`npx playwright install chromium` if missing).
// SMOKE_URL=https://… checks a deployed site instead of the local build.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const dist = fileURLToPath(new URL('../apps/app/dist/', import.meta.url));
if (!existsSync(join(dist, 'index.html'))) { console.error('Build first: npm run build:web'); process.exit(1); }
let chromium;
// createRequire also honours NODE_PATH (global installs), which ESM import() ignores.
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.error('Playwright not installed: npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(dist, path);
  const target = path !== '/' && existsSync(file) && !file.endsWith('/') ? file : join(dist, 'index.html'); // SPA fallback, like vercel.json
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream' });
  res.end(readFileSync(target));
}).listen(0);
const base = (process.env.SMOKE_URL ?? '').replace(/\/+$/, '') || `http://127.0.0.1:${server.address().port}`;

// [path, text that must appear]
const SCREENS = [
  ['/', 'need you'], ['/feed', 'Following'], ['/inbox', 'Inbox'], ['/repos', 'Repositories'], ['/studio', 'Studio'],
  ['/search', 'search'], ['/account', 'Connect your GitHub account'],
  ['/repo/you/trail-notes', 'README'], ['/repo/you/trail-notes/tree?path=src', 'sync'], ['/repo/you/trail-notes/blob?path=src%2Ftypes.ts', 'export type Entry'],
  ['/repo/you/trail-notes/blob?path=README.md', 'Install'], ['/repo/you/trail-notes/list?kind=issues', 'Issues'], ['/repo/you/trail-notes/list?kind=pulls', 'Pull requests'],
  ['/thread/you/trail-notes/45', 'Conflict UI'], ['/thread/you/trail-notes/42', 'airplane mode'], ['/user/lin', 'tiny-sync'],
];

const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
// Broken files on our own origin (fonts, bundles, icons) count as failures; GitHub images etc. don't.
page.on('requestfailed', (r) => { if (r.url().startsWith(base)) errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
let failed = 0;
for (const [path, expect] of SCREENS) {
  const before = errors.length;
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForFunction((s) => document.body.innerText.includes(s), expect, { timeout: 8000 }).catch(() => {});
  const text = await page.innerText('body');
  const ok = text.includes(expect) && !text.includes("Couldn't load this") && errors.length === before;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${path.padEnd(48)} ${ok ? '' : `expected "${expect}" · ${text.replace(/\s+/g, ' ').slice(0, 80)} ${errors.slice(before).join(' | ')}`}`);
}
// Service worker registers, and the app shell opens offline afterwards.
await page.goto(base + '/', { waitUntil: 'networkidle' });
const swOk = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))]));
let offlineOk = false;
if (swOk) {
  await page.reload({ waitUntil: 'networkidle' }); // let the worker take control and fill its cache
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  offlineOk = await page.waitForFunction(() => document.body.innerText.includes('need you'), null, { timeout: 8000 }).then(() => true, () => false);
  await page.context().setOffline(false);
}
console.log(`${swOk ? '✓' : '✗'} service worker registers`);
console.log(`${offlineOk ? '✓' : '✗'} app opens offline`);
if (!swOk || !offlineOk) failed++;
const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
const sw = await (await fetch(base + '/sw.js')).text();
const head = await (await fetch(base + '/')).text();
const pwaOk = manifest.icons?.length >= 4 && sw.includes('PRECACHE') && head.includes('rel="manifest"');
console.log(`${pwaOk ? '✓' : '✗'} PWA manifest, service worker and head tags`);
if (!pwaOk) failed++;
await browser.close(); server.close();
console.log(failed ? `\n${failed} failed` : '\nall screens ok');
process.exit(failed ? 1 : 0);
