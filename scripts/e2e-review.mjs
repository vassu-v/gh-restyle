// Browser test of PR reviews on the built web app (sample mode): line comments, verdicts, timeline.
// Run after `npm run build:web`:  npm run e2e:review
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const dist = new URL('../apps/app/dist/', import.meta.url).pathname;
if (!existsSync(join(dist, 'index.html'))) { console.error('Build first: npm run build:web'); process.exit(1); }
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = join(dist, p);
  const target = p !== '/' && existsSync(f) && extname(f) ? f : join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream' }); res.end(readFileSync(target));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) process.exitCode = 1; };
// Waits up to 3 s for the element (data loads asynchronously); resolves false if it never shows.
const visible = (loc) => loc.first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false);

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));

// Someone else's PR: comment on a line, then request changes.
await page.goto(`${base}/thread/lin/tiny-sync/33`, { waitUntil: 'networkidle' });
await page.getByText('Files', { exact: true }).click();
await page.getByLabel('Comment on line 13').click();
await page.getByPlaceholder('Comment on line 13').fill('500 feels arbitrary; make it a setting?');
await page.getByText('Add to review', { exact: true }).click();
log(await visible(page.getByText('pending · line 13')), 'a line comment shows as pending under its line');
log(await visible(page.getByText('Review · 1')), 'the Review button counts pending comments');
await page.getByText('Review · 1').click();
log(await visible(page.getByText('Your review')), 'Review opens the review panel');
log(await visible(page.getByText('1 line comment will be sent with this review')), 'the panel says which line comments go with it');
await page.getByText('Changes', { exact: true }).click();
const submit = page.getByRole('button', { name: 'Request changes', exact: true });
log(await submit.isDisabled(), '"Request changes" needs a summary first');
await page.getByPlaceholder('Summary').fill('Batching works, one question inline.');
await submit.click();
await page.waitForTimeout(600);
log(await visible(page.getByText('You requested changes.')), 'submitting confirms the verdict');
log(await visible(page.getByText('requested changes', { exact: false })), 'the timeline shows the review');
await page.getByText('Files', { exact: true }).click();
log(await visible(page.getByText('500 feels arbitrary; make it a setting?')), 'the sent comment now shows under its line');
log(!(await visible(page.getByText(/^pending/))), 'no pending comments are left');

// Your own PR: existing review + inline comment visible, approve not offered.
await page.goto(`${base}/thread/you/trail-notes/45`, { waitUntil: 'networkidle' });
log(await visible(page.getByText('Looks close. One question inline.')), "a teammate's review shows in the timeline");
await page.getByText('Files', { exact: true }).click();
log(await visible(page.getByText('Should ties keep the local edit?', { exact: false })), 'existing review comments show under their line');
await page.getByText('Review', { exact: true }).click();
log(await visible(page.getByText('This is your pull request, so you can comment but not approve it.')), 'you cannot approve your own PR');

log(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); server.close();
console.log(process.exitCode ? '\nreview e2e FAILED' : '\nreview e2e passed');
