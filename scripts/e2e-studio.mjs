// Browser test of Studio on the built web app (sample mode): presets, drag-to-reorder, share links.
// Run after `npm run build:web`:  npm run e2e:studio
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const dist = fileURLToPath(new URL('../apps/app/dist/', import.meta.url));
if (!existsSync(join(dist, 'index.html'))) { console.error('Build first: npm run build:web'); process.exit(1); }
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = join(dist, p);
  const target = p !== '/' && existsSync(f) && extname(f) ? f : join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream' }); res.end(readFileSync(target));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) process.exitCode = 1; };

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('gitling.design.v1') ?? 'null'));
const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('#root > div') ?? document.body).backgroundColor);

// Presets
await page.goto(`${base}/studio`, { waitUntil: 'networkidle' });
log(await page.getByText('presets').isVisible(), 'Look tab shows the preset gallery');
await page.getByLabel(/^Terminal preset/).click();
await page.waitForTimeout(400);
let d = await stored();
log(d?.theme.background === 'black' && d?.theme.numbers === 'mono', 'tapping Terminal applies its theme and saves it');
log(d?.tiles.length === 4 && d?.nav.tabs.length === 5, 'a preset keeps tabs and shortcuts');
await page.getByText('Undo', { exact: true }).click();
await page.waitForTimeout(300);
log((await stored())?.theme.background === 'graphite', 'Undo restores the previous look');

// Drag to reorder tiles
await page.getByRole('button', { name: 'Tiles', exact: true }).click();
const first = (await stored())?.tiles.map((x) => x.id) ?? (await page.evaluate(() => null));
const grip = page.getByTestId('grip-0');
const box = await grip.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + i * 13);
await page.mouse.up();
await page.waitForTimeout(400);
const after = (await stored())?.tiles.map((x) => x.id);
const before = first ?? ['t-review', 't-repo', 't-bugs', 't-actions'];
log(after && after[0] === before[1] && after[2] === before[0], `dragging the first tile down two rows reorders it (${after?.join(', ')})`);

// Share link → preview → apply
await page.getByRole('button', { name: 'Share', exact: true }).first().click();
await page.getByText('Copy share link').click();
const link = await page.evaluate(() => navigator.clipboard.readText());
log(link.startsWith(`${base}/studio?import=GITLING1.`), 'Copy share link gives a /studio?import= link');
// Someone else's design: Paper preset, 3 tabs
const theirs = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('gitling.design.v1'));
  d.theme = { accent: '#4C6EF5', background: 'paper', numbers: 'sans', tiles: 'window', density: 3, textScale: 1 };
  d.nav.tabs = ['home', 'inbox', 'studio'];
  return d;
});
const code = 'GITLING1.' + Buffer.from(JSON.stringify(theirs)).toString('base64url');
await page.goto(`${base}/studio?import=${encodeURIComponent(code)}`, { waitUntil: 'networkidle' });
log(await page.getByText(/^Paper · 3 tabs/).isVisible().catch(() => false), 'opening a share link shows a preview and summary before applying');
log((await stored())?.theme.background !== 'paper', 'nothing changes until you apply');
await page.getByText('Only the look', { exact: true }).click();
await page.waitForTimeout(400);
d = await stored();
log(d.theme.background === 'paper' && d.nav.tabs.length === 5, '"Only the look" takes the theme and keeps your tabs');
await page.getByText('Undo', { exact: true }).click();
await page.goto(`${base}/studio?import=${encodeURIComponent(code)}`, { waitUntil: 'networkidle' });
await page.getByText('Apply this design', { exact: true }).click();
await page.waitForTimeout(400);
d = await stored();
log(d.theme.background === 'paper' && d.nav.tabs.join() === 'home,inbox,studio', '"Apply this design" takes everything');

await page.goto(`${base}/studio?import=GITLING1.broken`, { waitUntil: 'networkidle' });
log(!(await page.getByText('Apply this design').isVisible().catch(() => false)), 'a broken code shows an error, not an Apply button');

log(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); server.close();
console.log(process.exitCode ? '\nstudio e2e FAILED' : '\nstudio e2e passed');
