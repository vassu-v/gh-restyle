// Browser test of PR reviews on the built web app (sample mode): line comments, verdicts, timeline,
// review threads (reply, resolve), suggestions (apply, batch) and multi-line comments.
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
const hidden = (loc) => loc.first().waitFor({ state: 'hidden', timeout: 3000 }).then(() => true, () => false);
const shots = process.env.E2E_SHOTS;
const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `review-${name}.png`), fullPage: true }); };
const btn = (name) => page.getByRole('button', { name, exact: true });
// Sample data lives in memory per page load, so moving between screens without losing it must go through the
// app's router (history API), never page.goto.
const navigate = async (path) => {
  await page.evaluate((p) => { window.history.pushState(null, '', p); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); }, path);
  await page.waitForTimeout(500);
};
const bodyText = () => page.evaluate(() => document.body.innerText);

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
log(await visible(page.getByText('Ties should keep the local edit:', { exact: false })), 'existing review comments show under their line');
await page.getByText('Review', { exact: true }).click();
log(await visible(page.getByText('This is your pull request, so you can comment but not approve it.')), 'you cannot approve your own PR');

// Threads on your own PR: suggestion card, reply, resolve / unresolve.
await page.goto(`${base}/thread/you/trail-notes/45`, { waitUntil: 'networkidle' });
await page.getByText('Files', { exact: true }).click();
log(await visible(page.getByText('Ties should keep the local edit:', { exact: false })), "thread A shows Mira's comment");
log((await page.getByText('Suggested change', { exact: true }).count()) >= 2, 'suggestions render as "Suggested change" cards (threads A and B)');
log(await visible(page.getByText("Good catch, I'll take it.")), "thread A shows the reply under Mira's comment");
await btn('Reply to thread').first().click();
await page.getByPlaceholder('Write a reply').fill('Pushed a fix for ties.');
await btn('Send reply').click();
log(await visible(page.getByText('Pushed a fix for ties.')), 'a reply appears in the thread after sending');

log(await visible(page.getByText('Resolved · 1 comment')), 'a resolved thread is collapsed to "Resolved · 1 comment"');
log(!(await visible(page.getByText('fail offline', { exact: false }))), "the resolved thread hides Devansh's comment");
await btn('Show resolved thread').click();
log(await visible(page.getByText('fail offline', { exact: false })), 'expanding the resolved thread shows its comment');
log(await visible(btn('Unresolve')), 'an expanded resolved thread offers Unresolve');
await btn('Unresolve').click();
// Threads A and B offer Resolve too; take the first one after thread C's comment.
const resolveC = page.getByText('fail offline', { exact: false }).locator('visible=true').first().locator('xpath=following::*[@role="button"][@aria-label="Resolve"][1]');
log(await visible(resolveC), 'after Unresolve the thread offers Resolve');
await resolveC.click();
log(await visible(page.getByText('Resolved · 1 comment')), 'Resolve collapses the thread again');
log(await hidden(page.getByText('fail offline', { exact: false })), "the re-resolved thread hides Devansh's comment again");

// Batch: threads A and B in one commit.
const addBtns = btn('Add to batch');
log((await addBtns.count()) === 2, 'threads A and B each offer "Add to batch"');
await addBtns.first().click();
await btn('Add to batch').first().click();
log(await visible(page.getByText('2 suggestions in batch')), 'the batch bar counts "2 suggestions in batch"');
log((await btn('Remove from batch').count()) === 2, 'batched suggestions offer "Remove from batch"');
await btn('Commit batch').click();
log(await visible(page.getByText('Suggestions applied.')), 'committing the batch confirms "Suggestions applied."');
await shot('after-batch');
await page.waitForTimeout(500);
log(await visible(page.getByText('outdated comments')), 'applied threads move under "outdated comments"');
log((await page.getByText("The code changed since this suggestion. It's outdated.").count()) === 2, 'both applied suggestions show the outdated reason');
log((await btn('Apply').count()) === 0, 'no Apply button is left on the applied suggestions');
// The code browser sees the new commit on the head branch (same page load, in-app navigation).
await navigate('/repo/you/trail-notes/blob?path=src%2Fsync%2Fqueue.ts&ref=fix%2Foffline-merge');
log(page.url().includes('/blob?') && await visible(page.getByText('queue.ts', { exact: true })), 'in-app navigation opens the code browser on the head branch');
log(!(await visible(page.getByText('Suggested change', { exact: true }))), 'the code browser shows the file, not the PR');
await page.waitForTimeout(800);
const code = await bodyText();
await shot('blob-after-batch');
log(code.includes('remote.updatedAt > local.updatedAt'), 'the branch file has thread A\'s suggestion (code browser)');
log(code.includes('private readonly patches'), 'the branch file has thread B\'s suggestion (code browser)');
await page.evaluate(() => window.history.back());
await page.waitForTimeout(800);
if (!(await visible(page.getByText('outdated comments')))) await page.getByText('Files', { exact: true }).click().catch(() => {});
log(await visible(page.getByText('outdated comments')), 'back on Files, the applied threads are still under "outdated comments"');

// Single apply (fresh sample data).
await page.goto(`${base}/thread/you/trail-notes/45`, { waitUntil: 'networkidle' });
await page.getByText('Files', { exact: true }).click();
await btn('Apply').first().click();
const msg = page.getByLabel('Commit message', { exact: true });
log(await visible(msg) && (await msg.inputValue()) === 'Apply suggestion from code review', 'Apply opens a commit box prefilled with the default message');
await btn('Commit').click();
log(await visible(page.getByText('Suggestion applied.')), 'committing one suggestion confirms "Suggestion applied."');

// Multi-line suggestion on someone else's PR (no push access).
await page.goto(`${base}/thread/lin/tiny-sync/33`, { waitUntil: 'networkidle' });
await page.getByText('Files', { exact: true }).click();
// The hunk deletes old lines 11–12, so "line 11" names two rows; the new (RIGHT-side) one comes last.
const l11 = page.getByLabel('Comment on line 11', { exact: true }).last();
await l11.scrollIntoViewIfNeeded();
const bb = await l11.boundingBox();
await page.mouse.move(bb.x + 60, bb.y + 5); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
log(await visible(page.getByText('Tap the last line of the range')), 'long-pressing a line starts a range');
await page.getByLabel('Comment on line 13', { exact: true }).last().click();
const box = page.getByPlaceholder('Comment on lines 11–13');
log(await visible(box), 'tapping a later line opens the composer for "lines 11–13"');
await btn('Suggest').click();
log((await box.inputValue()).includes('```suggestion'), 'Suggest inserts a ```suggestion block');
await box.fill((await box.inputValue()).replace('```suggestion\n', 'Fold these into one call:\n```suggestion\n'));
await page.getByText('Add to review', { exact: true }).click();
log(await visible(page.getByText('pending · lines 11–13')), 'the range comment shows as "pending · lines 11–13"');
await page.getByText('Review · 1').click();
await page.getByText('Comment', { exact: true }).click(); // the panel starts on Approve for someone else's PR
await page.getByPlaceholder('Summary').fill('One idea inline.');
await btn('Send review').click();
await page.waitForTimeout(600);
await page.getByText('Files', { exact: true }).click();
log(await visible(page.getByText('Fold these into one call:', { exact: false })), 'the sent range comment shows as a thread');
log(await visible(page.getByText('lines 11–13', { exact: true })), 'the thread header says "lines 11–13"');
log(await visible(page.getByText('Suggested change', { exact: true })), 'the thread shows a "Suggested change" card');
log((await btn('Apply').count()) === 0, 'no Apply button without write access');
log(await visible(page.getByText('You need write access to apply suggestions.')), 'the card says "You need write access to apply suggestions."');
await shot('multiline');

log(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); server.close();
console.log(process.exitCode ? '\nreview e2e FAILED' : '\nreview e2e passed');
