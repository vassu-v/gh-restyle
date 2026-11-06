// Black-box, user-level end-to-end checks for the "Gitling for GitHub" extension.
// Written from the user-facing spec only. Hits live https://github.com signed out.
// Usage: node scripts/e2e-extension-user.mjs
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(join(here, '..', 'apps', 'extension', 'dist'));
const REPO = 'https://github.com/react/react';
const ISSUES = 'https://github.com/react/react/issues';
const VIEW = { width: 1280, height: 900 };
const WIDE_VIEW = { width: 1700, height: 900 };

function extensionId(p) {
  const abs = p.replace(/^([a-z]):/, (_, d) => d.toUpperCase() + ':');
  const hex = createHash('sha256').update(Buffer.from(abs, 'utf16le')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
const ID = extensionId(DIST);
const OPTIONS = `chrome-extension://${ID}/options.html`;
const POPUP = `chrome-extension://${ID}/popup.html`;

// ---------- reporting ----------
const results = [];
function check(name, ok, details = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${details ? `  (${details})` : ''}`);
  return !!ok;
}
async function guarded(name, fn) {
  try { await fn(); } catch (e) { check(name, false, `threw: ${String(e && e.message || e).split('\n')[0]}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- colour helpers ----------
function parseRgb(s) {
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function hexRgb(h) {
  const x = h.replace('#', '');
  return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: 1 };
}
function lum(s) {
  const c = typeof s === 'string' ? parseRgb(s) : s;
  if (!c) return NaN;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function colorDist(a, b) {
  const x = typeof a === 'string' ? parseRgb(a) : a;
  const y = typeof b === 'string' ? parseRgb(b) : b;
  if (!x || !y) return Infinity;
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b), Math.abs((x.a - y.a) * 255));
}

// ---------- page probes ----------
async function waitFor(page, fn, arg, pred, timeout = 4000, every = 200) {
  const end = Date.now() + timeout;
  let v;
  while (true) {
    try { v = await page.evaluate(fn, arg); } catch (e) { v = { error: String(e.message || e) }; }
    if (pred(v)) return { ok: true, v };
    if (Date.now() > end) return { ok: false, v };
    await sleep(every);
  }
}

// What a user "sees" of GitHub's overall look.
const lookProbe = () => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const body = cs(document.body);
  const link = document.querySelector('article.markdown-body a[href^="http"], .markdown-body a[href]');
  const para = document.querySelector('article.markdown-body p, .markdown-body p');
  const counters = [...document.querySelectorAll('[class*="CounterLabel"], .Counter')]
    .filter((e) => e.getBoundingClientRect().width > 0 && /\d/.test(e.textContent));
  const html = document.documentElement;
  const attrs = {};
  for (const a of html.attributes) attrs[a.name] = a.value;
  const footer = document.querySelector('footer');
  const fr = footer && footer.getBoundingClientRect();
  const pricing = [...document.querySelectorAll('header a, header button')].find((e) => /^\s*Pricing\s*$/.test(e.textContent));
  const pr = pricing && pricing.getBoundingClientRect();
  const main = document.querySelector('#repo-content-pjax-container, #repo-content-turbo-frame, main');
  const radiusEls = [...document.querySelectorAll('.Box, [class*="Button-ButtonBase"], .btn, [class*="Box-"], .border.rounded-2')].slice(0, 40);
  return {
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    bodyFont: body.fontFamily,
    linkColor: link ? cs(link).color : null,
    // rendered size the user sees: computed size times any CSS zoom on the way up
    paraSize: para ? parseFloat(cs(para).fontSize) * (para.currentCSSZoom || 1) : null,
    counterFont: counters[0] ? cs(counters[0]).fontFamily : null,
    counters: counters.map((c) => ({ text: c.textContent.trim(), font: cs(c).fontFamily, size: Math.round(parseFloat(cs(c).fontSize) * (c.currentCSSZoom || 1) * 100) / 100, id: c.id || '', inHeader: !!c.closest('#repository-container-header, .pagehead, nav, header') })),
    htmlAttrs: attrs,
    footerVisible: !!(footer && fr.width > 0 && fr.height > 0 && cs(footer).visibility !== 'hidden'),
    pricingVisible: !!(pricing && pr.width > 0 && pr.height > 0 && cs(pricing).visibility !== 'hidden'),
    mainWidth: main ? main.getBoundingClientRect().width : null,
    // width of the centred page column (GitHub caps it at 1280px on wide windows)
    contentWidth: (() => { const c = [...document.querySelectorAll('main .container-xl, .container-xl')].find((e) => e.getBoundingClientRect().width > 0); return c ? Math.round(c.getBoundingClientRect().width) : null; })(),
    radii: radiusEls.map((e) => cs(e).borderTopLeftRadius).join(','),
    bodyTextLen: document.body.innerText.length,
    fonts: [...document.fonts].map((f) => ({ family: f.family.replace(/^"|"$/g, ''), status: f.status })),
  };
};

async function look(page) { return page.evaluate(lookProbe); }

async function gotoGitHub(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
      await page.waitForSelector('[class*="CounterLabel"], .Counter', { timeout: 30000 }).catch(() => {});
      await sleep(2500);
      return;
    } catch (e) {
      if (i === 2) throw e;
      await sleep(3000);
    }
  }
}

function firstFamily(ff) { return String(ff || '').split(',')[0].trim().replace(/^["']|["']$/g, ''); }

// ---------- settings page helpers ----------
async function openSettings(ctx) {
  const p = await ctx.newPage();
  for (let i = 0; ; i++) {
    try { await p.goto(OPTIONS, { waitUntil: 'domcontentloaded' }); break; }
    catch (e) { if (i >= 15) throw e; await sleep(1000); } // extension may still be coming back after a reload
  }
  await p.waitForSelector('#enabled', { timeout: 15000 });
  await sleep(1000);
  return p;
}
async function settle(page) {
  await page.mouse.move(2, 2).catch(() => {});
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()).catch(() => {});
  await sleep(700);
}
async function setSwitch(page, loc, desired) {
  if ((await loc.isChecked()) === desired) return;
  try { await loc.setChecked(desired, { timeout: 2500 }); }
  catch {
    // native input may be visually hidden behind a styled track: click its label like a user would
    await loc.evaluate((e) => { const l = e.closest('label'); (l || e).click(); });
  }
  await sleep(300);
}

// Visual signature of a control, as a user would perceive selection.
const sigProbe = (els, opts) => els.map((e) => {
  const c = getComputedStyle(e);
  return {
    v: e.dataset.v || e.textContent.trim().slice(0, 20),
    bg: c.backgroundColor, color: c.color, border: c.borderTopColor, bw: c.borderTopWidth,
    shadow: c.boxShadow, outline: c.outlineStyle === 'none' ? 'none' : `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`,
    weight: c.fontWeight, transform: c.transform, opacity: c.opacity,
    ignoreBg: !!(opts && opts.ignoreBg),
  };
});
function sigDiff(a, b) {
  const reasons = [];
  if (!a.ignoreBg && colorDist(a.bg, b.bg) >= 20) reasons.push(`bg ${a.bg} vs ${b.bg}`);
  if (colorDist(a.color, b.color) >= 40) reasons.push(`color ${a.color} vs ${b.color}`);
  if (parseFloat(a.bw) > 0 || parseFloat(b.bw) > 0) {
    if (colorDist(a.border, b.border) >= 40 || Math.abs(parseFloat(a.bw) - parseFloat(b.bw)) >= 1) reasons.push(`border ${a.bw} ${a.border} vs ${b.bw} ${b.border}`);
  }
  if (a.shadow !== b.shadow) reasons.push(`shadow ${a.shadow} vs ${b.shadow}`);
  if (a.outline !== b.outline) reasons.push(`outline ${a.outline} vs ${b.outline}`);
  if (a.transform !== b.transform) reasons.push('transform');
  if (Math.abs(parseFloat(a.opacity) - parseFloat(b.opacity)) >= 0.25) reasons.push(`opacity ${a.opacity} vs ${b.opacity}`);
  return reasons;
}
// Returns { selected: [values that look different from the majority], sigs }
async function visuallySelected(page, selector, opts) {
  await settle(page);
  const sigs = await page.$$eval(selector, sigProbe, opts || {});
  // An option "looks selected" if it differs from the majority-look of the group.
  const key = (s) => JSON.stringify([s.ignoreBg ? '' : s.bg, s.color, s.border, s.bw, s.shadow, s.outline, s.transform, s.opacity]);
  const counts = {};
  for (const s of sigs) counts[key(s)] = (counts[key(s)] || 0) + 1;
  const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const ref = sigs.find((s) => key(s) === majority);
  const selected = sigs.filter((s) => key(s) !== majority && sigDiff(s, ref).length > 0).map((s) => s.v);
  // Two-option groups: majority is ambiguous; compare both directions.
  if (sigs.length === 2) {
    const d = sigDiff(sigs[0], sigs[1]);
    return { selected: d.length ? null : [], sigs, twoDiff: d };
  }
  return { selected, sigs, diffs: sigs.map((s) => sigDiff(s, ref)) };
}
// Check that exactly `expected` looks selected in its group.
async function expectSelectedLook(page, name, selector, expected, opts) {
  const r = await visuallySelected(page, selector, opts);
  if (r.selected === null) {
    // two options that differ: decide which one is the "selected" by aria/class is not allowed for look;
    // use: the expected one must differ from the other noticeably AND it must be the one that changed after clicking.
    const exp = r.sigs.find((s) => s.v === expected);
    const other = r.sigs.find((s) => s.v !== expected);
    return check(name, exp && other && r.twoDiff.length > 0, `looks different: ${r.twoDiff.join('; ')}`);
  }
  return check(name, r.selected.length === 1 && r.selected[0] === expected,
    `visually distinct: [${r.selected.join(', ')}], expected [${expected}]${r.selected.length === 0 ? `; sample sig ${JSON.stringify(r.sigs[0])}` : ''}`);
}
// For a 2-option group, verify the look swaps when selection swaps.
async function twoOptionSig(page, selector) {
  await settle(page);
  return page.$$eval(selector, sigProbe, {});
}

// ---------- copilot fixture ----------
const COPILOT_FIXTURE = `<!DOCTYPE html>
<html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
<head><meta charset="utf-8"><title>GitHub</title><meta name="user-login" content="octotester"></head>
<body class="logged-in env-production page-responsive">
<div class="logged-in env-production">
<header class="AppHeader"><a class="prc-Button-ButtonBase-9n-Xk" href="/copilot"><svg class="octicon octicon-copilot" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16"/></svg></a><button class="prc-Button-ButtonBase-9n-Xk" aria-label="Open Copilot…"><span><span><svg class="octicon octicon-copilot" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16"/></svg></span></span></button></header>
<div class="application-main"><main>
<div id="dashboard" class="dashboard"><div class="news">
<div class="copilotPreview__container"><react-partial partial-name="copilot-chat-input-partial" class="loaded"><div data-target="react-partial.reactRoot"><div class="inputContainer__n-FaU6"><div class="inputSection__dwz_LW"><form class="chatForm__S3rNdI"><textarea id="copilot-chat-textarea" aria-label="Ask anything or type @ to add context with Copilot" placeholder="Ask anything or type @ to add context"></textarea></form></div><div class="container__XV5lTK"><ul class="list__vCph0B"><li><button class="prc-Button-ButtonBase-9n-Xk Pill__CRQNhA">Debug</button></li><li><button class="prc-Button-ButtonBase-9n-Xk">Agent</button></li><li><button class="prc-Button-ButtonBase-9n-Xk">Write code</button></li></ul></div></div></div></react-partial></div>
<feed-container><h2 id="feed-heading" class="f5 text-bold">Feed</h2><div class="feed-item">octocat starred react/react</div></feed-container>
</div></div>
</main></div>
</div>
</body></html>`;

async function copilotVisibility(page) {
  const vis = async (loc) => {
    if ((await loc.count()) === 0) return 'missing';
    const l = loc.first();
    const v = await l.isVisible();
    const box = await l.boundingBox();
    const shown = v && box && box.width > 0 && box.height > 0;
    return shown ? 'visible' : 'hidden';
  };
  return {
    textarea: await vis(page.locator('#copilot-chat-textarea')),
    debug: await vis(page.getByRole('button', { name: 'Debug', exact: true })),
    agent: await vis(page.getByRole('button', { name: 'Agent', exact: true })),
    writeCode: await vis(page.getByRole('button', { name: 'Write code', exact: true })),
    headerLink: await vis(page.locator('header a[href="/copilot"]')),
    headerButton: await vis(page.locator('header button[aria-label^="Open Copilot"]')),
    feed: await vis(page.getByRole('heading', { name: 'Feed' })),
  };
}

// ======================================================================
const tmpRoot = mkdtempSync(join(tmpdir(), 'gitling-user-e2e-'));
let ctx, plain;
try {
  // ---------- baseline: GitHub's own look, no extension ----------
  plain = await chromium.launch({ channel: 'chromium', headless: true });
  const bctx = await plain.newContext({ viewport: WIDE_VIEW });
  const bp = await bctx.newPage();
  await gotoGitHub(bp, REPO);
  const base = await look(bp);
  await bp.close();
  // baseline for the fixture page
  await bctx.route('https://github.com/', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: COPILOT_FIXTURE }));
  const bf = await bctx.newPage();
  await bf.goto('https://github.com/', { waitUntil: 'domcontentloaded' });
  await sleep(500);
  const baseCopilot = await copilotVisibility(bf);
  await plain.close(); plain = null;
  console.log(`# baseline: body bg ${base.bodyBg}, font ${firstFamily(base.bodyFont)}, counter font ${firstFamily(base.counterFont)}, ${base.counters.length} counters, footer ${base.footerVisible}, pricing ${base.pricingVisible}, width ${base.contentWidth}`);
  const baseFonts = new Set(base.fonts.map((f) => f.family));

  // ---------- launch with extension ----------
  ctx = await chromium.launchPersistentContext(join(tmpRoot, 'profile'), {
    channel: 'chromium', headless: true, viewport: VIEW,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  await sleep(3000);
  // A user who loads an unpacked build has chrome://extensions "Developer mode" on; without it Chromium
  // disables an unpacked extension when it reloads (harness setting only, not product behaviour).
  {
    const ex = await ctx.newPage();
    await ex.goto('chrome://extensions');
    await ex.evaluate(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
    await ex.close();
  }

  const isStyled = (l) => colorDist(l.bodyBg, base.bodyBg) > 8 || l.bodyFont !== base.bodyFont;
  // Visual pristine: everything a user can see matches GitHub's own look.
  const isPristine = (l) => visualDiffs(l);
  const leftoverAttrs = (l) => Object.keys(l.htmlAttrs).filter((k) => !(k in base.htmlAttrs) && String(l.htmlAttrs[k]).trim() !== '').map((k) => `<html ${k}="${String(l.htmlAttrs[k]).slice(0, 50)}">`);
  const visualDiffs = (l) => {
    const diffs = [];
    if (colorDist(l.bodyBg, base.bodyBg) > 2) diffs.push(`bodyBg ${l.bodyBg}≠${base.bodyBg}`);
    if (colorDist(l.bodyColor, base.bodyColor) > 2) diffs.push(`bodyColor ${l.bodyColor}≠${base.bodyColor}`);
    if (l.bodyFont !== base.bodyFont) diffs.push(`bodyFont ${firstFamily(l.bodyFont)}≠${firstFamily(base.bodyFont)}`);
    if (base.counterFont && l.counterFont !== base.counterFont) diffs.push(`counterFont ${firstFamily(l.counterFont)}≠${firstFamily(base.counterFont)}`);
    if (base.linkColor && l.linkColor && colorDist(l.linkColor, base.linkColor) > 2) diffs.push(`linkColor ${l.linkColor}≠${base.linkColor}`);
    if (base.paraSize && l.paraSize && Math.abs(l.paraSize - base.paraSize) > 0.1) diffs.push(`paraSize ${l.paraSize}≠${base.paraSize}`);
    for (const k of new Set([...Object.keys(base.htmlAttrs), ...Object.keys(l.htmlAttrs)])) {
      if (k === 'class') {
        const a = new Set(String(base.htmlAttrs[k] || '').split(/\s+/).filter(Boolean));
        const b = new Set(String(l.htmlAttrs[k] || '').split(/\s+/).filter(Boolean));
        const extra = [...b].filter((x) => !a.has(x)); const miss = [...a].filter((x) => !b.has(x));
        if (extra.length || miss.length) diffs.push(`<html class> +[${extra}] -[${miss}]`);
      } else if (k in base.htmlAttrs || k === 'style') {
        if ((base.htmlAttrs[k] || '') === (l.htmlAttrs[k] || '')) continue;
        diffs.push(`<html ${k}> "${String(l.htmlAttrs[k] ?? '(none)').slice(0, 60)}" vs github "${String(base.htmlAttrs[k] ?? '(none)').slice(0, 60)}"`);
      }
    }
    if (base.footerVisible && !l.footerVisible) diffs.push('footer hidden');
    if (base.pricingVisible && !l.pricingVisible) diffs.push('Pricing hidden');
    if (base.contentWidth && l.contentWidth && Math.abs(base.contentWidth - l.contentWidth) > 2) diffs.push(`content width ${l.contentWidth}≠${base.contentWidth}`);
    return diffs;
  };

  const gh = await ctx.newPage();
  await gh.setViewportSize(WIDE_VIEW);
  await gotoGitHub(gh, REPO);
  let L = await look(gh);
  check('GitHub is restyled by default after install', isStyled(L), `body bg ${L.bodyBg} vs github ${base.bodyBg}; font ${firstFamily(L.bodyFont)}`);

  // ======================= Popup =======================
  await guarded('popup', async () => {
    const pp = await ctx.newPage();
    await pp.goto(POPUP, { waitUntil: 'domcontentloaded' });
    await sleep(1200);
    const sw = pp.getByRole('switch');
    check('popup: has an on/off switch', (await sw.count()) === 1, `${await sw.count()} switch(es)`);
    check('popup: switch shows ON (saved state)', await sw.first().isChecked());
    const settingsBtn = pp.getByRole('button', { name: /settings/i });
    check('popup: has a Settings button', (await settingsBtn.count()) >= 1 && (await settingsBtn.first().isVisible()));

    await setSwitch(pp, sw.first(), false);
    let r = await waitFor(gh, lookProbe, null, (l) => !l.error && isPristine(l).length === 0, 4000);
    check('popup OFF: open GitHub tab returns to GitHub look live (no reload)', r.ok, r.ok ? '' : isPristine(r.v).join('; '));
    const pp2 = await ctx.newPage();
    await pp2.goto(POPUP, { waitUntil: 'domcontentloaded' }); await sleep(1000);
    check('popup: freshly opened popup shows OFF after turning off', !(await pp2.getByRole('switch').first().isChecked()));
    await pp2.close();
    const s = await openSettings(ctx);
    check('settings: Restyle switch shows OFF after turning off in popup', !(await s.locator('#enabled').isChecked()));
    await s.close();

    await setSwitch(pp, sw.first(), true);
    r = await waitFor(gh, lookProbe, null, (l) => !l.error && colorDist(l.bodyBg, L.bodyBg) <= 2 && l.bodyFont === L.bodyFont, 4000);
    check('popup ON: design comes back in open GitHub tab live', r.ok, `bg ${r.v.bodyBg} (design ${L.bodyBg})`);

    const [np] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null),
      settingsBtn.first().click(),
    ]);
    let opened = np ? np.url() : '';
    if (np) { await np.waitForLoadState('domcontentloaded').catch(() => {}); opened = np.url(); }
    check('popup: Settings button opens the settings page', /options\.html/.test(opened), opened || 'no page opened');
    if (np) await np.close().catch(() => {});
    await pp.close().catch(() => {});
  });

  // ======================= Settings page contents =======================
  const S = await openSettings(ctx);
  await guarded('settings contents', async () => {
    const text = await S.evaluate(() => document.body.innerText);
    const want = ['Signal', 'Terminal', 'Paper', 'Dense', 'Calm', 'Ink', 'Graphite', 'Black', 'Dot', 'Mono', 'Sans',
      'Hide sales menus', 'Hide Copilot', 'Hide the footer', 'Wide layout'];
    const miss = want.filter((w) => !text.includes(w));
    check('settings: shows presets, backgrounds, counters, developer options', miss.length === 0, miss.length ? `missing: ${miss.join(', ')}` : '');
    const has = async (re) => new RegExp(re, 'i').test(text);
    check('settings: has Background / Accent / Counters / Corners / Text size / Developer sections',
      (await has('Background')) && (await has('Accent')) && (await has('Counter')) && (await has('Corner')) && (await has('Text size')) && (await has('Developer')),
      'section labels');
    check('settings: has text size slider', (await S.locator('input[type=range]').count()) === 1);
    check('settings: has custom accent colour input', (await S.locator('input[type=color]').count()) === 1);
    check('settings: has "your design" box', (await S.locator('textarea').count()) >= 1 && /design/i.test(text));
  });

  // selectors for groups (structure discovered at runtime)
  const G = {
    preset: 'button.preset[data-v]',
    bg: 'button[data-v="graphite"], button[data-v="black"], button:not(.preset)[data-v="paper"]',
    accent: 'button[data-v^="#"]',
    num: 'button[data-v="dot"], button[data-v="mono"], button[data-v="sans"]',
    corners: null, // discovered below
  };
  G.corners = await S.evaluate(() => {
    const dot = document.querySelector('button[data-v="dot"]');
    const all = [...document.querySelectorAll('button[data-v]')].filter((b) => !b.classList.contains('preset'));
    const known = new Set(['graphite', 'black', 'paper', 'dot', 'mono', 'sans']);
    const rest = all.filter((b) => !known.has(b.dataset.v) && !b.dataset.v.startsWith('#'));
    return rest.map((b) => `button[data-v="${b.dataset.v}"]:not(.preset)`).join(', ');
  });
  const cornerVals = await S.$$eval(G.corners, (els) => els.map((e) => e.dataset.v));

  // ======================= Initial selected look =======================
  await guarded('initial selection look', async () => {
    await expectSelectedLook(S, 'settings look: default preset (Signal) is visibly selected', G.preset, 'signal');
    await expectSelectedLook(S, 'settings look: default Background (Graphite) is visibly selected', G.bg, 'graphite');
    await expectSelectedLook(S, 'settings look: default accent swatch is visibly selected', G.accent, (await S.$$eval(G.accent, (e) => e[0].dataset.v)), { ignoreBg: true });
    await expectSelectedLook(S, 'settings look: default Counters (Dot) is visibly selected', G.num, 'dot');
  });

  // ======================= Dot counters =======================
  let dotFamily = null;
  await guarded('dot counters', async () => {
    L = await look(gh);
    const extFaces = [...new Set(L.fonts.map((f) => f.family))].filter((f) => !baseFonts.has(f));
    dotFamily = extFaces.find((f) => /dot|pixel|matrix|led/i.test(f)) || null;
    check('dot counters: extension provides a dot-matrix font face', !!dotFamily, `extension faces: [${extFaces.join(', ')}]`);
    const fam = dotFamily || '__none__';
    const loaded = await gh.evaluate(async (f) => {
      await document.fonts.ready;
      const faces = [...document.fonts].filter((x) => x.family.replace(/^"|"$/g, '') === f);
      return { statuses: faces.map((x) => x.status), check: document.fonts.check(`16px "${f}"`) };
    }, fam);
    check('dot counters: dot-matrix face is actually loaded', loaded.statuses.includes('loaded') && loaded.check, `status [${loaded.statuses}], fonts.check=${loaded.check}`);
    const cs = L.counters;
    check('dot counters: repo page has visible counters to test', cs.length >= 3, `${cs.length} counters`);
    const wrongFont = cs.filter((c) => firstFamily(c.font) !== fam);
    check('dot counters: every visible counter on repo page uses the dot-matrix font', cs.length > 0 && wrongFont.length === 0,
      wrongFont.length ? `${wrongFont.length}/${cs.length} not dot: ${wrongFont.slice(0, 4).map((c) => `"${c.text}"→${firstFamily(c.font)}`).join(', ')}` : `${cs.length} counters on ${fam}`);
    const small = cs.filter((c) => c.size < 13);
    check('dot counters: repo-page counters are >= 13px (pixel font readable)', cs.length > 0 && small.length === 0,
      `sizes: ${[...new Set(cs.map((c) => c.size + 'px'))].join(', ')}${small.length ? `; ${small.length} below 13px e.g. "${small[0].text}" ${small[0].size}px` : ''}`);

    const gi = await ctx.newPage();
    await gi.setViewportSize(WIDE_VIEW);
    await gotoGitHub(gi, ISSUES);
    const LI = await look(gi);
    const wf = LI.counters.filter((c) => firstFamily(c.font) !== fam);
    const sm = LI.counters.filter((c) => c.size < 13);
    check('dot counters: issues page counters use dot font and are >= 13px', LI.counters.length > 0 && wf.length === 0 && sm.length === 0,
      `${LI.counters.length} counters; not dot: ${wf.length}; sizes ${[...new Set(LI.counters.map((c) => c.size + 'px'))].join(', ')}`);
    await gi.close();

    // Mono / Sans
    await S.locator(G.num.split(', ')[1]).click();
    let r = await waitFor(gh, lookProbe, null, (l) => l.counterFont && firstFamily(l.counterFont) !== fam, 3000);
    const monoFont = r.v.counterFont;
    check('counters Mono: counters switch away from dot font live', r.ok && /mono|code|courier|consol|menlo/i.test(monoFont || ''), `counter font ${monoFont}`);
    await expectSelectedLook(S, 'settings look: Mono becomes the visibly selected counter style', G.num, 'mono');
    await S.locator(G.num.split(', ')[2]).click();
    r = await waitFor(gh, lookProbe, null, (l) => l.counterFont && l.counterFont !== monoFont && firstFamily(l.counterFont) !== fam, 3000);
    check('counters Sans: counters change to a sans face live', r.ok && !/mono/i.test(firstFamily(r.v.counterFont)), `counter font ${r.v.counterFont}`);
    await expectSelectedLook(S, 'settings look: Sans becomes the visibly selected counter style', G.num, 'sans');
    await S.locator(G.num.split(', ')[0]).click();
    r = await waitFor(gh, lookProbe, null, (l) => firstFamily(l.counterFont) === fam, 3000);
    check('counters Dot: switching back restores dot font live', r.ok, `counter font ${r.v.counterFont}`);
  });

  // ======================= Background =======================
  await guarded('background', async () => {
    const before = (await look(gh)).bodyBg;
    await S.getByRole('button', { name: 'Paper', exact: true }).click();
    let r = await waitFor(gh, lookProbe, null, (l) => lum(l.bodyBg) > 0.6, 3000);
    check('Background Paper: open GitHub tab turns light live', r.ok, `bg ${r.v.bodyBg}`);
    await expectSelectedLook(S, 'settings look: Paper becomes the visibly selected background', G.bg, 'paper');
    await S.getByRole('button', { name: 'Black', exact: true }).click();
    r = await waitFor(gh, lookProbe, null, (l) => lum(l.bodyBg) < 0.01 && colorDist(l.bodyBg, before) > 3, 3000);
    check('Background Black: open GitHub tab turns black live (darker than Graphite)', r.ok, `bg ${r.v.bodyBg}, graphite was ${before}`);
    await expectSelectedLook(S, 'settings look: Black becomes the visibly selected background', G.bg, 'black');
    await S.getByRole('button', { name: 'Graphite', exact: true }).click();
    r = await waitFor(gh, lookProbe, null, (l) => colorDist(l.bodyBg, before) <= 2, 3000);
    check('Background Graphite: back to graphite live', r.ok, `bg ${r.v.bodyBg}`);
  });

  // ======================= Accent =======================
  await guarded('accent', async () => {
    const sw = await S.$$eval(G.accent, (e) => e.map((x) => x.dataset.v));
    const target = sw[1];
    await S.locator(`button[data-v="${target}"]`).click();
    let r = await waitFor(gh, lookProbe, null, (l) => l.linkColor && colorDist(l.linkColor, hexRgb(target)) <= 12, 3000);
    check(`Accent swatch ${target}: links on open GitHub tab take the accent live`, r.ok, `link colour ${r.v.linkColor}`);
    await expectSelectedLook(S, `settings look: swatch ${target} becomes the visibly selected accent`, G.accent, target, { ignoreBg: true });
    await S.locator('input[type=color]').fill('#ff3366');
    r = await waitFor(gh, lookProbe, null, (l) => l.linkColor && colorDist(l.linkColor, hexRgb('#ff3366')) <= 12, 3000);
    check('Accent custom colour #ff3366: applied live', r.ok, `link colour ${r.v.linkColor}`);
    const vs = await visuallySelected(S, G.accent, { ignoreBg: true });
    check('settings look: no preset swatch still looks selected after choosing a custom colour', vs.selected && vs.selected.length === 0, `visually selected swatches: [${vs.selected}]`);
    await S.locator(`button[data-v="${sw[0]}"]`).click();
    await sleep(800);
  });

  // ======================= Corners =======================
  await guarded('corners', async () => {
    check('settings: Corners has at least 2 options', cornerVals.length >= 2, `[${cornerVals}]`);
    const sel0 = await twoOptionSig(S, G.corners);
    const before = (await look(gh)).radii;
    await S.locator(`button[data-v="${cornerVals[1]}"]:not(.preset)`).click();
    const r = await waitFor(gh, lookProbe, null, (l) => l.radii !== before, 3000);
    check(`Corners ${cornerVals[1]}: corner radius on GitHub changes live`, r.ok, r.ok ? '' : `radii unchanged: ${before.slice(0, 80)}`);
    const sel1 = await twoOptionSig(S, G.corners);
    const swapped = sigDiff(sel0[0], sel1[0]).length > 0 && sigDiff(sel0[1], sel1[1]).length > 0 && sigDiff(sel1[0], sel1[1]).length > 0;
    check('settings look: Corners selection visibly moves to the clicked option', swapped,
      `before ${sigDiff(sel0[0], sel0[1]).join(';') || 'identical'}; after ${sigDiff(sel1[0], sel1[1]).join(';') || 'identical'}`);
    await S.locator(`button[data-v="${cornerVals[0]}"]:not(.preset)`).click();
    await waitFor(gh, lookProbe, null, (l) => l.radii === before, 3000);
  });

  // ======================= Text size =======================
  await guarded('text size', async () => {
    const range = S.locator('input[type=range]');
    const [min, max, cur] = await range.evaluate((e) => [e.min, e.max, e.value]);
    const before = (await look(gh)).paraSize;
    await range.fill(String(max));
    let r = await waitFor(gh, lookProbe, null, (l) => l.paraSize > before + 0.5, 3000);
    check('Text size slider max: README text gets bigger live', r.ok, `${before}px -> ${r.v.paraSize}px (slider ${min}..${max})`);
    await range.fill(String(min));
    r = await waitFor(gh, lookProbe, null, (l) => l.paraSize < before - 0.5, 3000);
    check('Text size slider min: README text gets smaller live', r.ok, `${before}px -> ${r.v.paraSize}px`);
    await range.fill(String(cur));
    await waitFor(gh, lookProbe, null, (l) => Math.abs(l.paraSize - before) < 0.1, 3000);
  });

  // ======================= Developer mode =======================
  await guarded('developer mode', async () => {
    const master = S.locator('#clean-all');
    const sub = (k) => S.locator(`input[data-k="${k}"]`);
    const effects = {
      footer: { name: 'Hide the footer: footer', on: (l) => !l.footerVisible, off: (l) => l.footerVisible, show: (l) => `footer visible=${l.footerVisible}` },
      sales: { name: 'Hide sales menus: signed-out header Pricing menu', on: (l) => !l.pricingVisible, off: (l) => l.pricingVisible, show: (l) => `Pricing visible=${l.pricingVisible}` },
      wide: { name: 'Wide layout: page column (GitHub caps at ' + base.contentWidth + 'px)', on: (l) => l.contentWidth > base.contentWidth + 50, off: (l) => Math.abs(l.contentWidth - base.contentWidth) < 3, show: (l) => `column ${l.contentWidth}px` },
    };
    check('fixture sanity: live repo page has a footer, a Pricing menu and a capped column', base.footerVisible && base.pricingVisible && base.contentWidth < WIDE_VIEW.width - 100,
      `footer ${base.footerVisible}, pricing ${base.pricingVisible}, column ${base.contentWidth}px`);
    await setSwitch(S, master, true);
    check('Developer mode: master switch shows ON after turning it on', await master.isChecked());
    const states = await Promise.all(['sales', 'copilot', 'footer', 'wide'].map((k) => sub(k).isChecked()));
    let r = await waitFor(gh, lookProbe, null, (l) => Object.values(effects).every((e) => e.on(l)), 3000);
    // The switches must match what actually happened on the page.
    const actual = { footer: effects.footer.on(r.v), sales: effects.sales.on(r.v), wide: effects.wide.on(r.v) };
    const mismatch = ['sales', 'footer', 'wide'].filter((k, i) => states[['sales', 'copilot', 'footer', 'wide'].indexOf(k)] !== actual[k]);
    check('Developer mode ON: sub-switches show exactly what is applied on GitHub', mismatch.length === 0,
      `switches sales,copilot,footer,wide=${states}; on page: ${Object.entries(actual).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    for (const k of ['footer', 'sales', 'wide']) {
      const e = effects[k];
      await setSwitch(S, sub(k), false);
      r = await waitFor(gh, lookProbe, null, e.off, 3000);
      check(`${e.name} comes back when its switch is turned off (live)`, r.ok, e.show(r.v));
      await setSwitch(S, sub(k), true);
      r = await waitFor(gh, lookProbe, null, e.on, 3000);
      check(`${e.name} hidden/applied when its switch is turned on (live)`, r.ok, e.show(r.v));
    }
    // Partial developer mode: one sub-switch off, others still active on the page.
    await setSwitch(S, sub('copilot'), false);
    await sleep(800);
    const partialPage = await look(gh);
    const Sp = await openSettings(ctx);
    const m = await Sp.locator('#clean-all').evaluate((e) => ({ checked: e.checked, indeterminate: e.indeterminate, ariaChecked: e.getAttribute('aria-checked') }));
    await Sp.close();
    check('Developer mode master does not read OFF while developer features are still active (1 of 4 turned off)',
      partialPage.footerVisible || m.checked || m.indeterminate || m.ariaChecked === 'mixed',
      `master checked=${m.checked} indeterminate=${m.indeterminate} aria-checked=${m.ariaChecked}; page footer hidden=${!partialPage.footerVisible}, Pricing hidden=${!partialPage.pricingVisible}`);
    await setSwitch(S, sub('copilot'), true);
    await sleep(1500);
    const LC = await look(gh);
    const headerVisible = await gh.locator('header').first().isVisible().catch(() => false);
    const repoHeaderVisible = await gh.locator('#repository-container-header, [itemprop="name"]').first().isVisible().catch(() => false);
    check('Hide Copilot on live repo page: page content still visible', LC.bodyTextLen > 1000 && headerVisible && repoHeaderVisible && LC.mainWidth > 300,
      `text ${LC.bodyTextLen} chars, header ${headerVisible}, repo header ${repoHeaderVisible}, main ${LC.mainWidth}px`);
    await setSwitch(S, master, false);
    r = await waitFor(gh, lookProbe, null, (l) => Object.values(effects).every((e) => e.off(l)), 3000);
    check('Developer mode OFF: footer, sales menu and normal width come back live', r.ok, `footer ${r.v.footerVisible}, pricing ${r.v.pricingVisible}, column ${r.v.contentWidth}px`);
    const after = await Promise.all(['sales', 'copilot', 'footer', 'wide'].map((k) => sub(k).isChecked()));
    check('Developer mode OFF: sub-switches no longer show as active', after.every((x) => !x) || (await sub('footer').isDisabled()),
      `sales,copilot,footer,wide=${after}`);
  });

  // ======================= Presets =======================
  await guarded('presets', async () => {
    const presets = await S.$$eval(G.preset, (e) => e.map((x) => x.dataset.v));
    let prev = await look(gh);
    const sig = (l) => JSON.stringify([l.bodyBg, l.bodyColor, l.linkColor, l.counterFont, l.paraSize, l.bodyFont, l.radii]);
    for (const p of presets.filter((x) => x !== 'signal').concat('signal')) {
      await S.locator(`button.preset[data-v="${p}"]`).click();
      const r = await waitFor(gh, lookProbe, null, (l) => !l.error && sig(l) !== sig(prev), 3000);
      check(`Preset ${p}: open GitHub tab changes live`, r.ok, `bg ${r.v.bodyBg}, counters ${firstFamily(r.v.counterFont)}, text ${r.v.paraSize}px`);
      await expectSelectedLook(S, `settings look: preset ${p} becomes the visibly selected preset`, G.preset, p);
      // The Background control must show what the page actually has now.
      const bgSel = await visuallySelected(S, G.bg);
      const L2 = r.v;
      const expectBg = lum(L2.bodyBg) > 0.5 ? 'paper' : (lum(L2.bodyBg) < 0.004 ? 'black' : 'graphite');
      check(`settings look: after preset ${p}, Background control shows ${expectBg} (page bg ${L2.bodyBg})`,
        bgSel.selected && bgSel.selected.length === 1 && bgSel.selected[0] === expectBg, `visually selected: [${bgSel.selected}]`);
      prev = await look(gh);
    }
  });

  // ======================= Persistence =======================
  await guarded('persistence', async () => {
    await S.getByRole('button', { name: 'Paper', exact: true }).click();
    await S.getByRole('button', { name: 'Mono', exact: true }).click();
    const acc = (await S.$$eval(G.accent, (e) => e.map((x) => x.dataset.v)))[2];
    await S.locator(`button[data-v="${acc}"]`).click();
    await S.locator(`button[data-v="${cornerVals[1]}"]:not(.preset)`).click();
    const range = S.locator('input[type=range]');
    const [min, max] = await range.evaluate((e) => [Number(e.min), Number(e.max)]);
    const step = await range.evaluate((e) => Number(e.step) || 0.01);
    const want = (Math.round((min + (max - min) * 0.75) / step) * step).toFixed(2);
    await range.fill(String(Number(want)));
    const wantStr = await range.evaluate((e) => e.value);
    await setSwitch(S, S.locator('#clean-all'), true);
    await setSwitch(S, S.locator('input[data-k="footer"]'), true);
    await sleep(1200);
    const live = await look(gh);
    const corner1 = await twoOptionSig(S, G.corners);

    const S2 = await openSettings(ctx);
    await expectSelectedLook(S2, 'reopened settings: Background shows Paper', G.bg, 'paper');
    await expectSelectedLook(S2, 'reopened settings: Counters shows Mono', G.num, 'mono');
    await expectSelectedLook(S2, `reopened settings: accent swatch ${acc} selected`, G.accent, acc, { ignoreBg: true });
    const corner2 = await twoOptionSig(S2, G.corners);
    check('reopened settings: Corners shows the saved option', sigDiff(corner1[0], corner2[0]).length === 0 && sigDiff(corner1[1], corner2[1]).length === 0,
      `${sigDiff(corner1[0], corner2[0]).join(';')} ${sigDiff(corner1[1], corner2[1]).join(';')}`);
    const v2 = await S2.locator('input[type=range]').evaluate((e) => e.value);
    check('reopened settings: Text size slider shows saved value', v2 === wantStr, `slider ${v2}, saved ${wantStr}`);
    check('reopened settings: Developer mode switch shows ON', await S2.locator('#clean-all').isChecked());
    check('reopened settings: Hide the footer shows ON', await S2.locator('input[data-k="footer"]').isChecked());
    check('reopened settings: Restyle switch shows ON', await S2.locator('#enabled').isChecked());
    await S2.close();

    const gr = await ctx.newPage();
    await gr.setViewportSize(WIDE_VIEW);
    await gotoGitHub(gr, REPO);
    const LR = await look(gr);
    check('saved design applies to a newly loaded GitHub page', colorDist(LR.bodyBg, live.bodyBg) <= 2 && LR.counterFont === live.counterFont && !LR.footerVisible && Math.abs(LR.paraSize - live.paraSize) < 0.2,
      `bg ${LR.bodyBg} vs ${live.bodyBg}; counters ${firstFamily(LR.counterFont)}; footer ${LR.footerVisible}; text ${LR.paraSize} vs ${live.paraSize}`);
    await gr.close();
  });

  // ======================= Off restores exactly / On restores design =======================
  await guarded('off/on', async () => {
    const design = await look(gh);
    await setSwitch(S, S.locator('#enabled'), false);
    let r = await waitFor(gh, lookProbe, null, (l) => !l.error && isPristine(l).length === 0, 4000);
    check('Restyle OFF (settings): open GitHub tab is exactly GitHub again', r.ok, r.ok ? '' : isPristine(r.v).join('; '));
    await sleep(2000);
    const later = await look(gh);
    check('Restyle OFF: stays off (nothing re-applied after 2s)', isPristine(later).length === 0, isPristine(later).join('; '));
    check('Restyle OFF: no extension attributes left on <html>', leftoverAttrs(later).length === 0, leftoverAttrs(later).join(' '));
    await setSwitch(S, S.locator('#enabled'), true);
    r = await waitFor(gh, lookProbe, null, (l) => colorDist(l.bodyBg, design.bodyBg) <= 2 && l.counterFont === design.counterFont && l.footerVisible === design.footerVisible && Math.abs((l.paraSize || 0) - (design.paraSize || 0)) < 0.2, 4000);
    check('Restyle ON: the same design comes back live', r.ok, `bg ${r.v.bodyBg} vs ${design.bodyBg}; counters ${firstFamily(r.v.counterFont)}; footer ${r.v.footerVisible}`);
  });

  // ======================= Hide Copilot (signed-in home fixture) =======================
  await guarded('copilot fixture', async () => {
    check('fixture sanity: without extension the Copilot box, chips and header buttons are visible',
      Object.values(baseCopilot).every((v) => v === 'visible'), JSON.stringify(baseCopilot));
    await ctx.route('https://github.com/', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: COPILOT_FIXTURE }));
    const home = await ctx.newPage();
    await home.goto('https://github.com/', { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    await setSwitch(S, S.locator('#clean-all'), true);
    await setSwitch(S, S.locator('input[data-k="copilot"]'), false);
    await sleep(1200);
    let v = await copilotVisibility(home);
    check('Hide Copilot OFF: home Copilot box visible', v.textarea === 'visible' && v.debug === 'visible' && v.headerLink === 'visible', JSON.stringify(v));
    await setSwitch(S, S.locator('input[data-k="copilot"]'), true);
    let ok = false;
    for (let i = 0; i < 15 && !ok; i++) {
      await sleep(250);
      v = await copilotVisibility(home);
      ok = ['textarea', 'debug', 'agent', 'writeCode', 'headerLink', 'headerButton'].every((k) => v[k] !== 'visible');
    }
    const shown = ['textarea', 'debug', 'agent', 'writeCode', 'headerLink', 'headerButton'].filter((k) => v[k] === 'visible');
    check('Hide Copilot ON: home "Ask anything" box textarea hidden live', v.textarea !== 'visible', `textarea ${v.textarea}`);
    check('Hide Copilot ON: home Debug / Agent / Write code buttons hidden live', [v.debug, v.agent, v.writeCode].every((x) => x !== 'visible'), `debug ${v.debug}, agent ${v.agent}, write code ${v.writeCode}`);
    check('Hide Copilot ON: header Copilot link and "Open Copilot" button hidden live', v.headerLink !== 'visible' && v.headerButton !== 'visible', `link ${v.headerLink}, button ${v.headerButton}`);
    check('Hide Copilot ON: Feed stays visible', v.feed === 'visible', `feed ${v.feed}; still visible: [${shown}]`);
    // reload: hidden from first paint too
    await home.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2000);
    v = await copilotVisibility(home);
    check('Hide Copilot ON: still hidden after loading the home page fresh', ['textarea', 'debug', 'agent', 'writeCode', 'headerLink', 'headerButton'].every((k) => v[k] !== 'visible') && v.feed === 'visible', JSON.stringify(v));
    await setSwitch(S, S.locator('input[data-k="copilot"]'), false);
    ok = false;
    for (let i = 0; i < 15 && !ok; i++) {
      await sleep(250);
      v = await copilotVisibility(home);
      ok = Object.values(v).every((x) => x === 'visible');
    }
    check('Hide Copilot OFF again: all Copilot controls visible again live', ok, JSON.stringify(v));
    await home.close();
    await ctx.unroute('https://github.com/');
  });

  // ======================= Extension reload / update =======================
  await guarded('extension reload', async () => {
    // Known starting point: default design, developer mode off.
    await S.locator('button.preset[data-v="signal"]').click();
    await S.getByRole('button', { name: 'Graphite', exact: true }).click();
    await setSwitch(S, S.locator('#clean-all'), true);
    await setSwitch(S, S.locator('#clean-all'), false);
    for (const k of ['sales', 'copilot', 'footer', 'wide']) await setSwitch(S, S.locator(`input[data-k="${k}"]`), false);
    await setSwitch(S, S.locator('#enabled'), true);
    const old = await ctx.newPage();
    await old.setViewportSize(WIDE_VIEW);
    await gotoGitHub(old, REPO);
    const L0 = await look(old);
    check('reload setup: GitHub tab is styled (graphite, developer mode off) before extension reload', isStyled(L0) && lum(L0.bodyBg) < 0.2 && L0.footerVisible, `bg ${L0.bodyBg}, footer visible ${L0.footerVisible}`);

    await S.evaluate(() => chrome.runtime.reload()).catch(() => {});
    await sleep(3500);
    for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
    const S3 = await openSettings(ctx);
    await S3.getByRole('button', { name: 'Paper', exact: true }).click();
    let r = await waitFor(old, lookProbe, null, (l) => !l.error && lum(l.bodyBg) > 0.6, 5000);
    check('after extension reload: Background Paper reaches already-open GitHub tab (no tab reload)', r.ok, `bg ${r.v.bodyBg}; <html class="${r.v.htmlAttrs && r.v.htmlAttrs.class}">`);
    {
      // control: a GitHub tab opened after the reload must show the saved Paper background
      const fresh = await ctx.newPage();
      await fresh.setViewportSize(WIDE_VIEW);
      await gotoGitHub(fresh, REPO);
      const LF = await look(fresh);
      check('after extension reload: (control) a newly opened GitHub tab shows Background Paper', lum(LF.bodyBg) > 0.6, `bg ${LF.bodyBg}`);
      await fresh.close();
    }
    await setSwitch(S3, S3.locator('#clean-all'), true);
    await setSwitch(S3, S3.locator('input[data-k="footer"]'), true);
    r = await waitFor(old, lookProbe, null, (l) => !l.error && !l.footerVisible, 5000);
    check('after extension reload: Developer mode (hide footer) reaches already-open tab', r.ok, `footer visible ${r.v.footerVisible}`);
    const rA = await waitFor(gh, lookProbe, null, (l) => !l.error && lum(l.bodyBg) > 0.6, 3000);
    check('after extension reload: the even-older first GitHub tab also updates', rA.ok, `bg ${rA.v.bodyBg}`);

    await setSwitch(S3, S3.locator('#enabled'), false);
    r = await waitFor(old, lookProbe, null, (l) => !l.error && isPristine(l).length === 0, 5000);
    check('after extension reload: Restyle OFF fully restores GitHub in old tab', r.ok, r.ok ? '' : isPristine(r.v).join('; '));
    await sleep(2500);
    const later = await look(old);
    check('after extension reload: old tab stays pristine (no styling re-appears)', isPristine(later).length === 0, isPristine(later).join('; '));
    check('after extension reload: no extension attributes left on <html> of old tab', leftoverAttrs(later).length === 0, leftoverAttrs(later).join(' '));
    const laterA = await look(gh);
    check('after extension reload: first GitHub tab also pristine when OFF', isPristine(laterA).length === 0, isPristine(laterA).join('; '));
    await setSwitch(S3, S3.locator('#enabled'), true);
    r = await waitFor(old, lookProbe, null, (l) => !l.error && lum(l.bodyBg) > 0.6 && !l.footerVisible, 5000);
    check('after extension reload: Restyle ON brings design back in old tab', r.ok, `bg ${r.v.bodyBg}, footer ${r.v.footerVisible}`);
  });
} catch (e) {
  check('harness', false, `crashed: ${e && e.stack || e}`);
} finally {
  if (ctx) await ctx.close().catch(() => {});
  if (plain) await plain.close().catch(() => {});
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
