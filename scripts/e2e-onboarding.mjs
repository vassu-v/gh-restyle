// Browser test of first run, the setup tour, Home sections and design files on the built web app (sample mode).
// Run after `npm run build:web`:  npm run e2e:onboarding
//   - first launch: the install step on phones, then sign in or "Look around first"; returning users never see it
//     (signing in and the tour that follows are covered by npm run e2e:signin, which can sign in)
//   - the tour (replayed from Studio) edits the real design: look, Home sections (add, remove, your own search,
//     at least one kept), tab bar; "Already have a setup?" loads a file's text
//   - Studio saves a design file and opens one through the file picker
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

// 1. First launch on desktop: no install step; sign in, or look around with sample data first.
{
  const { ctx, page } = await fresh();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(page.url().endsWith('/welcome') && await visible(page.getByRole('button', { name: /^(Sign in with|Connect) GitHub$/ })), 'first launch on / asks to sign in (desktop: no install step)');
  log(!(await visible(page.getByText('01 / 03', { exact: false }), 500)), 'the setup tour waits until someone is signed in');
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(page.url().endsWith('/welcome'), 'reloading before answering shows the sign-in step again');
  await page.getByRole('button', { name: 'Look around first' }).click();
  log(await visible(page.getByText('need you')) && await visible(page.getByText('Showing sample data')), '"Look around first" opens Home with sample data');
  await page.reload({ waitUntil: 'networkidle' });
  log(!page.url().endsWith('/welcome') && await visible(page.getByText('need you')), 'and first run doesn\'t come back on its own');
  await ctx.close();
}

// 2. The tour (replayed from Studio), step by step, editing the real design; then design files.
{
  const { ctx, page } = await fresh();
  await page.addInitScript((d) => { if (!localStorage.getItem('gitling.design.v1')) localStorage.setItem('gitling.design.v1', d); }, JSON.stringify(DEFAULT_DESIGN));
  await page.goto(base + '/studio?tab=share', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Replay the welcome tour' }).click();
  log(await visible(page.getByText('01 / 03 · look')), 'Studio → "Replay the welcome tour" opens the three-step tour');

  const paper = PRESETS.find((p) => p.id === 'paper') ?? PRESETS[2];
  await page.getByRole('button', { name: new RegExp(`^${paper.name} preset`) }).click();
  await page.waitForTimeout(300);
  log((await stored(page))?.theme.background === paper.theme.background, `step 1: choosing ${paper.name} changes the saved design (background ${paper.theme.background})`);
  await page.getByRole('button', { name: 'Already have a setup? Load it' }).click();
  await page.getByLabel('Design code or file text').fill('{"format":"gitling.design","formatVersion":9,"design":{}}');
  log(await visible(page.getByText('newer Gitling')), '"Already have a setup?": a file from a newer version is refused with a plain reason');
  const ink = PRESETS.find((p) => p.id === 'ink') ?? PRESETS[PRESETS.length - 1];
  await page.getByLabel('Design code or file text').fill(designToFile(applyPreset(DEFAULT_DESIGN, ink), { name: 'Ink at night' }));
  log(await visible(page.getByText('Ink at night ·', { exact: false })), 'pasted file text shows a preview with its name');
  await page.getByRole('button', { name: 'Use this design' }).click();
  await page.waitForTimeout(300);
  log((await stored(page))?.theme.accent === ink.theme.accent && await visible(page.getByText('Design loaded', { exact: false })), '"Use this design" puts it in place');
  await next(page);

  log(await visible(page.getByText('What should Home show?')), 'step 2: Home sections');
  await page.getByRole('button', { name: 'Add Review requests' }).click();
  await page.getByRole('button', { name: 'Add Starred repositories' }).click();
  await page.waitForTimeout(200);
  let secs = (await stored(page))?.home.sections ?? [];
  const on = secs.filter((x) => x.visible).map((x) => x.id);
  log(on.includes('reviews') && on.at(-1) === 'starred', 'adding built-in sections puts them on Home, at the end');
  await page.getByLabel('Section title').fill('Bugs I’m in');
  await page.getByLabel('Search query').fill('is:open label:bug involves:@me');
  await page.getByRole('button', { name: 'Add search to Home' }).click();
  await page.waitForTimeout(200);
  secs = (await stored(page))?.home.sections ?? [];
  log(secs.some((x) => x.visible && x.title === 'Bugs I’m in' && x.q === 'is:open label:bug involves:@me'), 'any search can be added as a section under your own title');
  // Remove everything but one: the last one can't go.
  for (let k = 0; k < 20; k++) {
    const btns = page.getByRole('button', { name: /^Remove .* from Home$/ });
    const n = (await stored(page))?.home.sections.filter((x) => x.visible).length ?? 0;
    if (n <= 1) break;
    await btns.first().click();
    await page.waitForTimeout(80);
  }
  secs = (await stored(page))?.home.sections ?? [];
  log(secs.filter((x) => x.visible).length === 1 && await visible(page.getByText('Home keeps at least one section.')), 'sections can be removed down to one, and Home keeps that one');
  log(!secs.some((x) => x.id.startsWith('q-')) || secs.filter((x) => x.id.startsWith('q-')).every((x) => x.visible), 'a removed search section is deleted (built-ins go back to "add to home")');
  await page.getByRole('button', { name: 'Add From your feed' }).click();
  await page.getByRole('button', { name: 'Add Needs you' }).click();
  await page.waitForTimeout(200);
  await next(page);

  log(await visible(page.getByText('Your tab bar')), 'step 3: tab bar');
  await page.getByLabel('Remove Feed').click();
  await page.waitForTimeout(200);
  log(!(await stored(page))?.nav.tabs.includes('feed'), 'removing the Feed tab is saved');
  log(await visible(page.getByText('Long-press a tile on Home', { exact: false })), 'the last step explains the hidden gestures');
  await page.getByRole('button', { name: 'Start using Gitling' }).click();
  log(await visible(page.getByRole('button', { name: 'Replay the welcome tour' })), 'finishing a replay goes back to Studio');
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(await visible(page.getByText('from your feed', { exact: false })) && await visible(page.getByText('needs you', { exact: false })), 'Home shows the sections picked in the tour');

  // Design files: save as a file, then open a file (another design) through the browser's file picker.
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
  const withSearch = applyPreset(DEFAULT_DESIGN, terminal);
  withSearch.home = { sections: [{ id: 'q-team', visible: true, title: 'Team bugs', q: 'is:open label:bug' }, ...DEFAULT_DESIGN.home.sections] };
  const otherFile = join(work, 'friend.gitling.json');
  writeFileSync(otherFile, designToFile(withSearch, { name: 'Friend setup' }));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a design file' }).click();
  await (await chooser).setFiles(otherFile);
  log(await visible(page.getByText('Friend setup ·', { exact: false })), 'opening a file shows its name and a preview');
  await page.getByRole('button', { name: 'Apply this design' }).click();
  await page.waitForTimeout(300);
  log((await stored(page))?.theme.accent === terminal.theme.accent, 'applying the file replaces the design');
  log((await stored(page))?.nav.tabs.includes('feed'), 'the whole setup came from the file (its tab bar too)');
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(await visible(page.getByText('team bugs')), 'a search section from a design file shows on Home');
  await ctx.close();
}

// 3. Skip on the tour ends a replay too, back in Studio.
{
  const { ctx, page } = await fresh();
  await page.addInitScript(() => localStorage.setItem('gitling.onboarded.v1', 'e2e'));
  await page.goto(base + '/welcome?replay=1', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Skip setup' }).click();
  log(await visible(page.getByRole('button', { name: 'Replay the welcome tour' })), 'Skip on a replay goes back to Studio (even after a reload, with no history)');
  await ctx.close();
}

// 4. Returning users (a design saved before the tour existed) and deep links skip it.
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

// 5. A share-link recipient who applies the design has set Gitling up: no tour on their first Home.
{
  const { ctx, page } = await fresh();
  await page.goto(base + '/studio?tab=share', { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Paste a GITLING1/).fill(designToFile(applyPreset(DEFAULT_DESIGN, PRESETS[1]), { name: 'Shared' }));
  await page.getByRole('button', { name: 'Apply this design' }).click();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  log(!page.url().endsWith('/welcome') && await visible(page.getByText('need you')), 'applying a shared design ends the tour (first Home is Home)');
  await ctx.close();
}

// 6. The tour's tip is true: a github.com link pasted into Search opens its Gitling screen.
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

// 7. "Install Gitling" sheet on phones: Android gets the browser's install dialog, iPhone gets the two Safari
// taps; desktop, the tour and the installed app never show it; "Not now" keeps it away.
{
  const { devices } = createRequire(import.meta.url)('playwright');
  const phone = async (device, init) => {
    const ctx = await browser.newContext({ ...devices[device], defaultBrowserType: undefined });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('gitling.onboarded.v1', 'e2e'));
    if (init) await page.addInitScript(init);
    return { ctx, page };
  };
  // Android: a stand-in for Chrome's beforeinstallprompt, so the test can see the app call prompt().
  const fakePrompt = () => {
    window.__prompted = 0;
    addEventListener('load', () => setTimeout(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = async () => { window.__prompted++; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      dispatchEvent(e);
    }, 200));
  };
  const a = await phone('Pixel 7', fakePrompt);
  await a.page.goto(base + '/', { waitUntil: 'networkidle' });
  log(await visible(a.page.getByText('Add Gitling to your home screen'), 6000), 'Android phone: the install sheet appears on Home');
  await a.page.getByRole('button', { name: 'Install', exact: true }).click();
  await a.page.waitForTimeout(300);
  log(await a.page.evaluate(() => window.__prompted) === 1, '"Install" opens the browser\'s own install dialog');
  log(!(await visible(a.page.getByText('Add Gitling to your home screen'), 800)), 'and the sheet goes away');
  await a.ctx.close();

  const i = await phone('iPhone 14');
  await i.page.goto(base + '/', { waitUntil: 'networkidle' });
  log(await visible(i.page.getByText('Add to Home Screen', { exact: false }), 6000), 'iPhone: the sheet shows the Safari steps (Share → Add to Home Screen)');
  await i.page.getByRole('button', { name: 'Got it' }).click();
  await i.page.reload({ waitUntil: 'networkidle' });
  await i.page.waitForTimeout(2500);
  log(!(await visible(i.page.getByText('Add Gitling to your home screen'), 500)), 'after dismissing, it stays away on the next visit');
  await i.ctx.close();

  // First run on a phone: the install step comes first, before sign-in.
  const newPhone = async (device, init) => {
    const ctx = await browser.newContext({ ...devices[device], defaultBrowserType: undefined });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    if (init) await page.addInitScript(init);
    return { ctx, page };
  };
  const fi = await newPhone('iPhone 14');
  await fi.page.goto(base + '/', { waitUntil: 'networkidle' });
  log(fi.page.url().endsWith('/welcome') && await visible(fi.page.getByRole('button', { name: 'Continue in the browser' })), 'iPhone first run: install step first');
  log(await visible(fi.page.getByText('Add to Home Screen', { exact: false })) && await visible(fi.page.getByText('sign in there', { exact: false })), 'with the Safari steps, and why to install before signing in');
  await fi.page.getByRole('button', { name: 'Continue in the browser' }).click();
  log(await visible(fi.page.getByRole('button', { name: /^(Sign in with|Connect) GitHub$/ })), 'then the sign-in step');
  await fi.page.getByRole('button', { name: 'Look around first' }).click();
  await fi.page.waitForTimeout(2500);
  log(await visible(fi.page.getByText('need you')) && !(await visible(fi.page.getByText('Opens full screen, like an app', { exact: false }), 500)), 'Home after it, without the install card asking again');
  await fi.page.reload({ waitUntil: 'networkidle' });
  await fi.page.waitForTimeout(2500);
  log(!fi.page.url().endsWith('/welcome') && !(await visible(fi.page.getByText('Opens full screen, like an app', { exact: false }), 500)), 'the install card stays snoozed after a reload');
  await fi.ctx.close();

  const fa = await newPhone('Pixel 7', fakePrompt);
  await fa.page.goto(base + '/', { waitUntil: 'networkidle' });
  await fa.page.getByRole('button', { name: 'Install Gitling' }).waitFor({ timeout: 6000 }).catch(() => {});
  await fa.page.getByRole('button', { name: 'Install Gitling' }).click().catch(() => {});
  await fa.page.waitForTimeout(300);
  log(await fa.page.evaluate(() => window.__prompted) === 1, 'Android first run: "Install Gitling" opens the browser\'s install dialog');
  log(await visible(fa.page.getByRole('button', { name: /^(Sign in with|Connect) GitHub$/ })), 'once installed, the sign-in step follows');
  await fa.ctx.close();

  const desk = await fresh();
  await desk.page.addInitScript(() => localStorage.setItem('gitling.onboarded.v1', 'e2e'));
  await desk.page.goto(base + '/', { waitUntil: 'networkidle' });
  await desk.page.waitForTimeout(2500);
  log(!(await visible(desk.page.getByText('Add Gitling to your home screen'), 500)), 'desktop browsers never see it');
  await desk.ctx.close();

  // Only on the main tabs, and never over a text field someone is typing into.
  const th = await phone('iPhone 14');
  await th.page.goto(base + '/thread/you/trail-notes/45', { waitUntil: 'networkidle' });
  await th.page.waitForTimeout(2500);
  log(!(await visible(th.page.getByText('Add Gitling to your home screen'), 500)), 'not over a pull request (only on the main tabs)');
  await th.page.goto(base + '/search', { waitUntil: 'networkidle' });
  await th.page.waitForTimeout(2500);
  log(!(await visible(th.page.getByText('Add Gitling to your home screen'), 500)), 'not over Search while typing');
  await th.ctx.close();

  // In-app browsers can't install: the sheet says to open the page in the real browser.
  const ig = await browser.newContext({ ...devices['iPhone 14'], defaultBrowserType: undefined, userAgent: devices['iPhone 14'].userAgent + ' Instagram 300.0.0.0' });
  await ig.addInitScript(() => localStorage.setItem('gitling.onboarded.v1', 'e2e'));
  const igp = await ig.newPage();
  await igp.goto(base + '/', { waitUntil: 'networkidle' });
  log(await visible(igp.getByText('Open in Safari', { exact: false }), 6000), 'in-app browser: says to open in Safari instead of Safari steps');
  await ig.close();

  const inst = await phone('Pixel 7', () => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('standalone') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q)); });
  await inst.page.goto(base + '/', { waitUntil: 'networkidle' });
  await inst.page.waitForTimeout(2500);
  log(!(await visible(inst.page.getByText('Add Gitling to your home screen'), 500)), 'not inside the installed app');
  await inst.ctx.close();
}

log(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); server.close();
console.log(process.exitCode ? '\nonboarding e2e FAILED' : '\nonboarding e2e passed');
