// Browser test of the welcome tour and design files on the built web app (sample mode).
// Run after `npm run build:web`:  npm run e2e:onboarding
//   - first launch on / goes to the tour; each step edits the real design; Skip and Finish both end it for good
//   - closing the app midway brings the tour back; returning users (a saved design) never see it
//   - "Bring yours" loads a .gitling.json file's text; Studio saves a file and opens one through the file picker
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'apps/app/dist');
if (!existsSync(join(dist, 'index.html'))) { console.error('Build first: npm run build:web'); process.exit(1); }
// The same Content-Security-Policy (with Trusted Types) Cloudflare serves, so file save/open are tested under it.
const CSP = (() => { try { return /Content-Security-Policy: (.+)/.exec(readFileSync(join(dist, '_headers'), 'utf8'))?.[1]; } catch { return undefined; } })();
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = join(dist, p);
  const target = p !== '/' && existsSync(f) && extname(f) ? f : join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream', ...(CSP && extname(target) === '.html' ? { 'Content-Security-Policy': CSP } : {}) }); res.end(readFileSync(target));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) process.exitCode = 1; };
const visible = (loc, timeout = 4000) => loc.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);

// The real design-file code, so the test writes files exactly like the app does.
const work = mkdtempSync(join(tmpdir(), 'gitling-e2e-onb-'));
await build({
  stdin: { contents: `export { designToFile, readDesignText, DEFAULT_DESIGN, PRESETS, applyPreset } from '@gitling/design';`, resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: join(work, 'design.mjs'), logLevel: 'silent',
});
const { designToFile, readDesignText, DEFAULT_DESIGN, PRESETS, applyPreset } = await import(pathToFileURL(join(work, 'design.mjs')).href);

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const errors = [];
const fresh = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page };
};
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('gitling.design.v1') ?? 'null'));
const next = (page) => page.getByRole('button', { name: 'Next', exact: true }).click();

// 1. First launch: the tour, step by step, editing the real design.
{
  const { ctx, page } = await fresh();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(page.url().endsWith('/welcome') && await visible(page.getByText('01 / 06 · hello')), 'first launch on / opens the welcome tour');
  await page.getByRole('button', { name: 'Make it yours' }).click();

  log(await visible(page.getByText('Pick a look')), 'step 2: pick a look');
  const paper = PRESETS.find((p) => p.id === 'paper') ?? PRESETS[2];
  await page.getByRole('button', { name: new RegExp(`^${paper.name} preset`) }).click();
  await page.waitForTimeout(300);
  log((await stored(page))?.theme.background === paper.theme.background, `choosing ${paper.name} changes the saved design (background ${paper.theme.background})`);
  await next(page);

  log(await visible(page.getByText('What should Home show?')), 'step 3: home sections');
  const feedSwitch = page.getByLabel('Show From your feed');
  await feedSwitch.click();
  await page.waitForTimeout(200);
  log((await stored(page))?.home.sections.find((s) => s.id === 'feed')?.visible === true, 'switching on "From your feed" is saved');
  await next(page);

  log(await visible(page.getByText('Your tab bar')), 'step 4: tab bar');
  await page.getByLabel('Remove Feed').click();
  await page.waitForTimeout(200);
  log(!(await stored(page))?.nav.tabs.includes('feed'), 'removing the Feed tab is saved');
  await next(page);

  log(await visible(page.getByText('Already have a setup?')), 'step 5: bring a design');
  await page.getByLabel('Design code or file text').fill('{"format":"gitling.design","formatVersion":9,"design":{}}');
  log(await visible(page.getByText('newer Gitling')), 'a file from a newer version is refused with a plain reason');
  await page.getByLabel('Design code or file text').fill('');
  await next(page);

  log(await visible(page.getByText('A few things worth knowing')), 'step 6: how it works (walkthrough tips)');
  log(await visible(page.getByText('Long-press a tile on Home', { exact: false })), 'tips explain the hidden gestures');
  await page.getByRole('button', { name: 'Start using Gitling' }).click();
  log(await visible(page.getByText('need you')), 'finishing lands on Home');
  log(await visible(page.getByText('from your feed', { exact: false })), 'Home shows the section switched on in the tour');
  await page.reload({ waitUntil: 'networkidle' });
  log(!page.url().endsWith('/welcome') && await visible(page.getByText('need you')), 'after finishing, the tour never comes back on its own');

  // 2. Studio: save as a file, then open a file (another design) through the browser's file picker.
  await page.goto(base + '/studio?tab=share', { waitUntil: 'networkidle' });
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as file' }).click();
  const download = await dl;
  const name = download.suggestedFilename();
  const saved = readFileSync(await download.path(), 'utf8');
  const back = readDesignText(saved);
  log(/^gitling-.*\d{4}-\d{2}-\d{2}\.gitling\.json$/.test(name), `"Save as file" downloads ${name}`);
  log(back.ok && JSON.stringify(back.design) === JSON.stringify(await stored(page)), 'the saved file holds exactly the current design, in the documented format');
  log(JSON.parse(saved).format === 'gitling.design' && JSON.parse(saved).formatVersion === 1, 'file says format gitling.design, version 1');

  const terminal = PRESETS.find((p) => p.id === 'terminal') ?? PRESETS[1];
  const otherFile = join(work, 'friend.gitling.json');
  writeFileSync(otherFile, designToFile(applyPreset(DEFAULT_DESIGN, terminal), { name: 'Friend setup' }));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a design file' }).click();
  await (await chooser).setFiles(otherFile);
  log(await visible(page.getByText('Friend setup ·', { exact: false })), 'opening a file shows its name and a preview');
  await page.getByRole('button', { name: 'Apply this design' }).click();
  await page.waitForTimeout(300);
  log((await stored(page))?.theme.accent === terminal.theme.accent, 'applying the file replaces the design');
  log((await stored(page))?.nav.tabs.includes('feed'), 'the whole setup came from the file (its tab bar too)');

  // 3. Replay from Studio.
  await page.getByRole('button', { name: 'Replay the welcome tour' }).click();
  log(await visible(page.getByText('01 / 06 · hello')), 'Studio → "Replay the welcome tour" opens it again');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  log(await visible(page.getByRole('button', { name: 'Replay the welcome tour' })), 'Skip on a replay goes back to Studio');
  await ctx.close();
}

// 4. "Bring yours" with a design file's text jumps to the end with that design in place.
{
  const { ctx, page } = await fresh();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  for (let k = 0; k < 4; k++) await (k === 0 ? page.getByRole('button', { name: 'Make it yours' }) : page.getByRole('button', { name: 'Next', exact: true })).click();
  const ink = PRESETS.find((p) => p.id === 'ink') ?? PRESETS[PRESETS.length - 1];
  await page.getByLabel('Design code or file text').fill(designToFile(applyPreset(DEFAULT_DESIGN, ink), { name: 'Ink at night' }));
  log(await visible(page.getByText('Ink at night ·', { exact: false })), 'pasted file text shows a preview with its name');
  await page.getByRole('button', { name: 'Use this design' }).click();
  log(await visible(page.getByText('A few things worth knowing')), '"Use this design" skips ahead to the last step');
  log((await stored(page))?.theme.accent === ink.theme.accent, 'and the design is in place');
  await ctx.close();
}

// 5. Closing the app midway brings the tour back; Skip ends it for good.
{
  const { ctx, page } = await fresh();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.goto(base + '/', { waitUntil: 'networkidle' }); // reload mid-tour (the default design is saved by now)
  log(page.url().endsWith('/welcome'), 'reloading before finishing shows the tour again');
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(!page.url().endsWith('/welcome') && await visible(page.getByText('need you')), 'after Skip, / stays on Home');
  await ctx.close();
}

// 6. Returning users (a design saved before the tour existed) and deep links skip it.
{
  const { ctx, page } = await fresh();
  await page.addInitScript((d) => { if (!localStorage.getItem('gitling.design.v1')) localStorage.setItem('gitling.design.v1', d); }, JSON.stringify(DEFAULT_DESIGN));
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(!page.url().endsWith('/welcome') && await visible(page.getByText('need you')), 'someone with a saved design goes straight to Home');
  await ctx.close();
  const b = await fresh();
  await b.page.goto(base + '/repo/you/trail-notes', { waitUntil: 'networkidle' });
  log(await visible(b.page.getByText('README')), 'a deep link on first launch opens that screen, not the tour');
  await b.ctx.close();
}

// 7. A share-link recipient who applies the design has set Gitling up: no tour on their first Home.
{
  const { ctx, page } = await fresh();
  await page.goto(base + '/studio?tab=share', { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Paste a GITLING1/).fill(designToFile(applyPreset(DEFAULT_DESIGN, PRESETS[1]), { name: 'Shared' }));
  await page.getByRole('button', { name: 'Apply this design' }).click();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(!page.url().endsWith('/welcome') && await visible(page.getByText('need you')), 'applying a shared design ends the tour (first Home is Home)');
  await ctx.close();
}

// 8. The tour's tip is true: a github.com link pasted into Search opens its Gitling screen.
{
  const { ctx, page } = await fresh();
  await page.addInitScript((d) => { localStorage.setItem('gitling.design.v1', d); }, JSON.stringify(DEFAULT_DESIGN));
  await page.goto(base + '/search', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Search GitHub').fill('github.com/you/trail-notes/issues/42');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  log(page.url().includes('/thread/you/trail-notes/42'), 'Search opens a pasted github.com link as a Gitling screen');
  await ctx.close();
}

log(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); server.close();
console.log(process.exitCode ? '\nonboarding e2e FAILED' : '\nonboarding e2e passed');
