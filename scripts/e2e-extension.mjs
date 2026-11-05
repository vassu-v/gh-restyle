// End-to-end test of the desktop extension, used the way a person uses it, on live github.com (signed out).
// Loads apps/extension/dist unpacked in Chromium, drives the real popup in its own tab while a GitHub tab stays
// open, and checks that every control changes the page live, that design codes (and share links) from the app's
// Studio apply, that "off" restores GitHub exactly, that settings survive reloads, new tabs and a browser restart,
// that GitHub's in-site (Turbo) navigation keeps the style, and that the extension causes no errors.
// Run: npm run build:extension && npm run e2e:extension   (prints PASS/FAIL lines, exits 1 on any FAIL)
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, 'apps/extension/dist');
if (!existsSync(join(ext, 'manifest.json'))) { console.error('Build the extension first: npm run build:extension'); process.exit(1); }
const { chromium } = createRequire(import.meta.url)('playwright');
const extId = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const EXT_ORIGIN = `chrome-extension://${extId}`;

// The same code the app's Studio and the extension use: share-code encoder and the Primer variable mapping.
const work = mkdtempSync(join(tmpdir(), 'gitling-e2e-ext-'));
await build({
  stdin: {
    contents: `export { encodeDesign, DEFAULT_DESIGN, BACKGROUNDS, PRESETS, applyPreset } from '@gitling/design';
               export { primerVars } from './apps/extension/src/primer';`,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: join(work, 'design.mjs'), logLevel: 'silent',
});
const { encodeDesign, DEFAULT_DESIGN, BACKGROUNDS, PRESETS, applyPreset, primerVars } = await import(pathToFileURL(join(work, 'design.mjs')).href);

const REPO = 'https://github.com/react/react';
const OTHER = 'https://github.com/vercel/next.js';
const GIST = 'https://gist.github.com/discover';
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const info = (s) => console.log(`info  ${s}`);
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const goto = async (page, url) => { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {}); };
const waitFor = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

/** What the page looks like right now. */
const snap = (page) => page.evaluate(() => {
  const h = document.documentElement, cs = getComputedStyle(h);
  const counter = document.querySelector('.Counter, [class*="CounterLabel"]');
  return {
    on: h.classList.contains('gitling-on'),
    mode: h.getAttribute('data-color-mode'), light: h.getAttribute('data-light-theme'), dark: h.getAttribute('data-dark-theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    accent: cs.getPropertyValue('--fgColor-accent').trim(),
    accentEmphasis: cs.getPropertyValue('--bgColor-accent-emphasis').trim(),
    numFont: cs.getPropertyValue('--gitling-num-font').trim(),
    counterFont: counter ? getComputedStyle(counter).fontFamily : null,
    inlineVars: [...h.style].filter((p) => p.startsWith('--')).length,
    marker: window.__gitlingE2E ?? null,
    path: location.pathname,
  };
});
/** True when the page shows `design` (and the page wasn't reloaded, if a marker was set). */
const shows = (page, design, marker) => {
  const want = { bg: rgb(BACKGROUNDS[design.theme.background].palette.bg), mode: BACKGROUNDS[design.theme.background].mode, accent: primerVars(design)['--fgColor-accent'].toLowerCase(), marker: marker ?? null };
  return waitFor(page, (w) => {
    const h = document.documentElement;
    return h.classList.contains('gitling-on') && h.getAttribute('data-color-mode') === w.mode
      && getComputedStyle(document.body).backgroundColor === w.bg
      && getComputedStyle(h).getPropertyValue('--fgColor-accent').trim().toLowerCase() === w.accent
      && (w.marker === null || window.__gitlingE2E === w.marker);
  }, want);
};
const describe = (s) => `on=${s.on} mode=${s.mode} bg=${s.bodyBg} accent=${s.accent} reloaded=${s.marker === null}`;

// Errors: anything thrown on a page whose stack points into the extension, plus everything in the popup.
const extErrors = [];
const otherErrors = new Set();
function watchErrors(page, label) {
  page.on('pageerror', (e) => {
    const where = `${e.message}\n${e.stack ?? ''}`;
    if (page.url().startsWith(EXT_ORIGIN) || where.includes(EXT_ORIGIN) || where.includes('gitling')) extErrors.push(`${label}: ${e.message.slice(0, 160)}`);
    else otherErrors.add(e.message.slice(0, 100));
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url ?? '';
    if (page.url().startsWith(EXT_ORIGIN) || loc.startsWith(EXT_ORIGIN)) extErrors.push(`${label} console: ${m.text().slice(0, 160)}`);
  });
}

const profile = join(work, 'profile');
const launch = () => chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, proxy,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
async function openPopup(ctx) {
  const pop = await ctx.newPage();
  watchErrors(pop, 'popup');
  await pop.goto(`${EXT_ORIGIN}/popup.html`);
  await pop.waitForFunction(() => document.querySelector('#bg button[aria-pressed="true"]'), null, { timeout: 5000 });
  return pop;
}

let exitCode = 0;
try {
  // 0. Baseline: GitHub's own attributes and background on the same page, without the extension.
  const plain = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, proxy });
  const pp = await plain.newPage();
  await goto(pp, REPO);
  const base = await snap(pp);
  await plain.close();
  info(`GitHub without the extension: data-color-mode=${base.mode} light=${base.light} dark=${base.dark} body bg=${base.bodyBg}`);

  // 1. Install: the unpacked extension loads, the popup opens without errors.
  let ctx = await launch();
  const gh = await ctx.newPage();
  watchErrors(gh, 'github');
  await goto(gh, REPO);
  let pop = await openPopup(ctx);
  const popState = await pop.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    enabled: document.getElementById('enabled').checked,
    bg: document.querySelector('#bg button[aria-pressed="true"]')?.dataset.v,
    num: document.querySelector('#num button[aria-pressed="true"]')?.dataset.v,
  }));
  check('extension loads and the popup opens', popState.title === 'Gitling', `id ${extId}`);
  check('popup shows the default settings (on, Graphite, Dot)', popState.enabled && popState.bg === 'graphite' && popState.num === 'dot', JSON.stringify(popState));

  // 2. Default state on a repo page (wait for the content script's async settings read first).
  await shows(gh, DEFAULT_DESIGN);
  let s = await snap(gh);
  check('default: html has class gitling-on', s.on);
  check('default: page background is the design background (Graphite #0E0F11)', s.bodyBg === rgb(BACKGROUNDS.graphite.palette.bg), s.bodyBg);
  check('default: GitHub switched to dark color mode to match', s.mode === 'dark' && s.dark === 'dark', `data-color-mode=${s.mode}`);
  const defVars = primerVars(DEFAULT_DESIGN);
  check('default: accent tokens set (--fgColor-accent, deepened --bgColor-accent-emphasis)', s.accent.toLowerCase() === DEFAULT_DESIGN.theme.accent.toLowerCase() && s.accentEmphasis.toLowerCase() === defVars['--bgColor-accent-emphasis'].toLowerCase(), `${s.accent} / ${s.accentEmphasis}`);

  // 3. Every popup control changes the open GitHub tab live (a marker on window proves no reload).
  await gh.evaluate(() => { window.__gitlingE2E = 'live'; });
  let design = clone(DEFAULT_DESIGN);
  for (const bg of ['black', 'paper', 'graphite']) {
    await pop.click(`#bg button[data-v="${bg}"]`);
    design.theme.background = bg;
    const ok = await shows(gh, design, 'live');
    s = await snap(gh);
    check(`popup Background → ${BACKGROUNDS[bg].label}: page changes live`, ok, describe(s));
  }
  for (const [num, font] of [['mono', 'Gitling Geist Mono'], ['sans', 'Gitling Geist'], ['dot', 'Gitling Doto']]) {
    await pop.click(`#num button[data-v="${num}"]`);
    const ok = await waitFor(gh, (f) => getComputedStyle(document.documentElement).getPropertyValue('--gitling-num-font').includes(f) && window.__gitlingE2E === 'live', font);
    s = await snap(gh);
    const counterOk = s.counterFont === null || s.counterFont.includes(font);
    check(`popup Counters → ${num}: counter font changes live`, ok && counterOk, `--gitling-num-font=${s.numFont}; counter font=${s.counterFont ?? 'no counter on page'}`);
  }

  // 4. Bring a design over from the app: a Studio design code, then a Studio share link.
  const terminal = applyPreset(clone(DEFAULT_DESIGN), PRESETS.find((p) => p.id === 'terminal'));
  await pop.fill('#code', encodeDesign(terminal));
  await pop.click('#apply');
  let okMsg = await waitFor(pop, () => document.getElementById('msg').className.includes('ok'));
  let ok = await shows(gh, terminal, 'live');
  s = await snap(gh);
  const wantEmph = primerVars(terminal)['--bgColor-accent-emphasis'].toLowerCase();
  check('import a design code (Terminal preset): applied live', okMsg && ok, describe(s));
  check('imported accent reaches GitHub tokens (--fgColor-accent, --bgColor-accent-emphasis)', s.accent.toLowerCase() === primerVars(terminal)['--fgColor-accent'].toLowerCase() && s.accentEmphasis.toLowerCase() === wantEmph, `${s.accent} / ${s.accentEmphasis}, want ${terminal.theme.accent} / ${wantEmph}`);
  const pState = await pop.evaluate(() => ({ bg: document.querySelector('#bg button[aria-pressed="true"]')?.dataset.v, num: document.querySelector('#num button[aria-pressed="true"]')?.dataset.v, code: document.getElementById('code').value }));
  check('popup reflects the imported design and clears the box', pState.bg === 'black' && pState.num === 'mono' && pState.code === '', JSON.stringify(pState));

  const paper = applyPreset(clone(DEFAULT_DESIGN), PRESETS.find((p) => p.id === 'paper'));
  await pop.fill('#code', `https://gitling.truckcoding.workers.dev/studio?import=${encodeURIComponent(encodeDesign(paper))}`);
  await pop.click('#apply');
  okMsg = await waitFor(pop, () => document.getElementById('msg').className.includes('ok'));
  ok = await shows(gh, paper, 'live');
  s = await snap(gh);
  check('import a Studio share link (Paper preset, custom accent #4C6EF5): applied live', okMsg && ok, `${describe(s)}; popup says "${await pop.textContent('#msg')}"`);

  await pop.fill('#code', 'GITLING1.not-a-real-code');
  await pop.click('#apply');
  const bad = await waitFor(pop, () => document.getElementById('msg').className.includes('bad'));
  await gh.waitForTimeout(600);
  ok = await shows(gh, paper, 'live');
  check('a broken code shows an error and leaves the design alone', bad && ok, `popup says "${await pop.textContent('#msg')}"`);

  // 5. Turning it off restores GitHub exactly; turning it on brings the design back.
  await pop.uncheck('#enabled');
  ok = await waitFor(gh, () => !document.documentElement.classList.contains('gitling-on'));
  await gh.waitForTimeout(300);
  s = await snap(gh);
  check('off: gitling-on removed live', ok && s.marker === 'live');
  check("off: GitHub's data-color-mode / data-light-theme / data-dark-theme restored", s.mode === base.mode && s.light === base.light && s.dark === base.dark, `now ${s.mode}/${s.light}/${s.dark}, GitHub's ${base.mode}/${base.light}/${base.dark}`);
  check("off: no Gitling variables left; page background is GitHub's own", s.inlineVars === 0 && s.bodyBg === base.bodyBg, `${s.inlineVars} vars, bg ${s.bodyBg} vs ${base.bodyBg}`);
  await gh.reload({ waitUntil: 'domcontentloaded' });
  await gh.waitForLoadState('load').catch(() => {});
  s = await snap(gh);
  check('off: stays off after a reload', !s.on && s.mode === base.mode && s.bodyBg === base.bodyBg, describe(s));
  await gh.evaluate(() => { window.__gitlingE2E = 'live2'; });
  await pop.check('#enabled');
  ok = await shows(gh, paper, 'live2');
  check('on again: design comes back live', ok, describe(await snap(gh)));

  // 6. Settings persist: reload, a new tab, a reopened popup, and a full browser restart.
  await gh.reload({ waitUntil: 'domcontentloaded' });
  check('persists across a reload', await shows(gh, paper), describe(await snap(gh)));
  const tab2 = await ctx.newPage();
  watchErrors(tab2, 'github tab 2');
  await goto(tab2, OTHER);
  check('persists in a new tab (another repo)', await shows(tab2, paper), describe(await snap(tab2)));
  await tab2.close();
  await pop.close();
  pop = await openPopup(ctx);
  const reopened = await pop.evaluate(() => ({ enabled: document.getElementById('enabled').checked, bg: document.querySelector('#bg button[aria-pressed="true"]')?.dataset.v, num: document.querySelector('#num button[aria-pressed="true"]')?.dataset.v }));
  check('reopened popup shows the saved settings', reopened.enabled && reopened.bg === 'paper' && reopened.num === 'sans', JSON.stringify(reopened));
  await ctx.close();
  ctx = await launch();
  const gh2 = await ctx.newPage();
  watchErrors(gh2, 'github after restart');
  await goto(gh2, REPO);
  check('persists across a browser restart', await shows(gh2, paper), describe(await snap(gh2)));

  // 7. In-site navigation (GitHub's Turbo / React router, no full page load) keeps the style.
  pop = await openPopup(ctx);
  await pop.click('#bg button[data-v="graphite"]');
  const graphitePaper = clone(paper); graphitePaper.theme.background = 'graphite';
  await shows(gh2, graphitePaper);
  await pop.close();
  await gh2.evaluate(() => { window.__gitlingE2E = 'nav'; });
  // GitHub may redirect (facebook/react → react/react), so build the links from where we actually are.
  const rp = new URL(gh2.url()).pathname.replace(/\/$/, '');
  const hops = [
    ['repo → Issues tab', `a[href="${rp}/issues"]`],
    ['Issues → Pull requests tab', `a[href="${rp}/pulls"]`],
    ['Pull requests → Code tab', `a[href="${rp}"]`],
    ['repo home → packages folder', `a[href="${rp}/tree/main/packages"]`],
  ];
  for (const [label, sel] of hops) {
    const before = gh2.url();
    const link = gh2.locator(sel).filter({ visible: true }).first();
    if (!(await link.count())) { check(`in-site navigation: ${label}`, false, `no link matching ${sel}`); continue; }
    await link.click();
    await gh2.waitForURL((u) => u.toString() !== before, { timeout: 30000 }).catch(() => {});
    await gh2.waitForLoadState('load').catch(() => {});
    await gh2.waitForTimeout(1500);
    const soft = (await gh2.evaluate(() => window.__gitlingE2E)) === 'nav';
    ok = await shows(gh2, graphitePaper);
    s = await snap(gh2);
    // Only a soft (no reload) navigation proves the style survives GitHub's in-site navigation.
    check(`in-site navigation: ${label} keeps the style`, soft && ok && s.inlineVars > 0, `${soft ? 'soft' : 'full'} navigation to ${s.path}; ${describe(s)}`);
  }
  await gh2.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await gh2.waitForTimeout(1500);
  check('in-site navigation: browser Back keeps the style', await shows(gh2, graphitePaper), describe(await snap(gh2)));

  // Turning off after in-site navigation still restores GitHub's attributes (GitHub may rewrite <html> on navigation).
  pop = await openPopup(ctx);
  await pop.uncheck('#enabled');
  ok = await waitFor(gh2, () => !document.documentElement.classList.contains('gitling-on'));
  s = await snap(gh2);
  check("off after in-site navigation: GitHub's attributes and background restored", ok && s.mode === base.mode && s.light === base.light && s.dark === base.dark && s.inlineVars === 0 && s.bodyBg === base.bodyBg, describe(s));
  await pop.check('#enabled');
  await shows(gh2, graphitePaper);
  await pop.close();

  // 8. Gist (the other site in the manifest).
  const gist = await ctx.newPage();
  watchErrors(gist, 'gist');
  await goto(gist, GIST);
  check('gist.github.com is styled too', await shows(gist, graphitePaper), describe(await snap(gist)));

  // 9. Errors.
  check('no errors from the extension (pages and popup)', extErrors.length === 0, extErrors.join(' | '));
  if (otherErrors.size) info(`GitHub's own page errors (not from the extension): ${[...otherErrors].join(' | ')}`);
  await ctx.close();
} catch (e) {
  check('test ran to the end', false, e.message.split('\n')[0]);
  exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ''}.`);
process.exit(failed || exitCode ? 1 : 0);
