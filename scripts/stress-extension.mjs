// Stress test for the desktop extension on live github.com (signed out).
// For each page × background (graphite, black, paper), plus a baseline without the extension:
//   - the design is applied (html.gitling-on, page background = the design's bg)
//   - no page errors
//   - text contrast: samples up to 800 visible text elements, computes contrast against the effective
//     background (first opaque ancestor), and reports elements below 3:1 that GitHub alone doesn't have
//   - screenshot of the top of the page
// Run: npm run build:extension && node scripts/stress-extension.mjs [--quick | --only=<page name part>]
// Output: stress-report/ (report.md, report.json, screenshots), git-ignored.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, 'apps/extension/dist');
const out = join(root, 'stress-report');
mkdirSync(join(out, 'shots'), { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
// Chrome derives an unpacked extension's id from its path: UTF-8 bytes on macOS/Linux, UTF-16LE on Windows,
// where it first upper-cases the drive letter (a checkout under c:\ would otherwise get the wrong id).
const idPath = process.platform === 'win32' ? ext.replace(/^[a-z]:/, (d) => d.toUpperCase()) : ext;
const extId = [...createHash('sha256').update(process.platform === 'win32' ? Buffer.from(idPath, 'utf16le') : idPath).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');

const PAGES = [
  ['repo home', '/facebook/react'],
  ['readme-heavy repo', '/sindresorhus/awesome'],
  ['file view', '/facebook/react/blob/main/packages/react/src/ReactHooks.js'],
  ['big file', '/microsoft/TypeScript/blob/main/src/compiler/checker.ts'],
  ['markdown file', '/facebook/react/blob/main/CHANGELOG.md'],
  ['tree view', '/facebook/react/tree/main/packages'],
  ['issues list', '/facebook/react/issues'],
  ['single issue', '/facebook/react/issues/11347'],
  ['pull requests list', '/facebook/react/pulls'],
  ['PR conversation', '/facebook/react/pull/31000'],
  ['PR files (diff)', '/facebook/react/pull/31000/files'],
  ['commits list', '/facebook/react/commits/main'],
  ['commit diff', '/facebook/react/commit/a8d9d5e45dca2bdbc87f5ec0df09f36d3a29ecb2'],
  ['actions list', '/facebook/react/actions'],
  ['releases', '/facebook/react/releases'],
  ['branches', '/facebook/react/branches'],
  ['tags', '/facebook/react/tags'],
  ['contributors', '/facebook/react/graphs/contributors'],
  ['user profile', '/torvalds'],
  ['org page', '/microsoft'],
  ['topics', '/topics/react'],
  ['trending', '/trending'],
  ['explore', '/explore'],
  ['gist', 'https://gist.github.com/discover'],
  ['discussions', '/vercel/next.js/discussions'],
  ['blame', '/facebook/react/blame/main/packages/react/src/ReactHooks.js'],
];
const quick = process.argv.includes('--quick');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const pages = only ? PAGES.filter(([n]) => n.includes(only)) : quick ? PAGES.slice(0, 6) : PAGES;
const THEMES = ['graphite', 'black', 'paper'];

const audit = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(',').map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 }; };
  const path = (el) => { const p = []; for (let e = el; e && p.length < 3; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0] : '')); return p.join(' > '); };
  const els = [...document.querySelectorAll('body *')].filter((e) => {
    if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    // Emoji (flags and keycaps too) are drawn in their own colours, so text-colour contrast says nothing about them.
    if (e.closest('g-emoji') || /^(?:[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\s]|[0-9#*]\u{FE0F}?\u{20E3})+$/u.test(e.textContent.trim())) return false;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.top > 3000) return false;
    const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.3;
  }).slice(0, 800);
  const bad = [];
  for (const e of els) {
    const fg = parse(getComputedStyle(e).color); if (!fg || fg.a < 0.3) continue;
    const c = contrast(fg, bgOf(e));
    if (c < 3) bad.push({ text: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), where: path(e), contrast: Math.round(c * 100) / 100 });
  }
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  return { checked: els.length, bad, on: document.documentElement.classList.contains('gitling-on'), bodyBg };
};

async function run(withExt, theme) {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
    args: withExt ? [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] : [],
  });
  if (withExt) {
    const pop = await ctx.newPage();
    await pop.goto(`chrome-extension://${extId}/popup.html`);
    await pop.click(`#bg button[data-v="${theme}"]`);
    await pop.close();
  }
  const page = await ctx.newPage();
  const results = [];
  for (const [name, url] of pages) {
    const errors = [];
    const onErr = (e) => errors.push(e.message.slice(0, 120));
    page.on('pageerror', onErr);
    const t0 = Date.now();
    let loadMs = null, res = null;
    try {
      await page.goto(url.startsWith('http') ? url : 'https://github.com' + url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      loadMs = Date.now() - t0;
      res = await page.evaluate(audit);
      if (withExt) await page.screenshot({ path: join(out, 'shots', `${theme}-${name.replace(/\W+/g, '-')}.png`), clip: { x: 0, y: 0, width: 1280, height: 700 } });
    } catch (e) { errors.push('load: ' + e.message.split('\n')[0].slice(0, 120)); }
    page.off('pageerror', onErr);
    results.push({ name, url, loadMs, errors, ...(res ?? {}) });
    process.stdout.write(`${withExt ? theme : 'baseline'} · ${name}: ${res ? `${res.bad.length}/${res.checked} low-contrast` : 'failed'}${errors.length ? ` · ${errors.length} errors` : ''}\n`);
  }
  await ctx.close();
  return results;
}

const baseline = await run(false);
const report = { baseline, themes: {} };
for (const th of THEMES) report.themes[th] = await run(true, th);
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));

// Summarize: problems the extension introduces (not present in the same page without it).
const key = (b) => `${b.where}|${b.text}`;
let md = `# Extension stress test\n\nPages: ${pages.length} · themes: ${THEMES.join(', ')} · signed out · ${new Date().toISOString()}\n\n`;
md += '| Page | ' + THEMES.map((t) => `${t}: new low-contrast / checked`).join(' | ') + ' | errors (ext only) |\n|---|' + THEMES.map(() => '---').join('|') + '|---|\n';
const worst = {};
for (const [i, [name]] of pages.entries()) {
  const base = new Set((baseline[i]?.bad ?? []).map(key));
  const baseErr = new Set(baseline[i]?.errors ?? []);
  const cells = THEMES.map((th) => {
    const r = report.themes[th][i];
    if (!r?.checked) return 'failed';
    const fresh = r.bad.filter((b) => !base.has(key(b)));
    for (const b of fresh) { const k = `${th} · ${b.where}`; (worst[k] ??= { ...b, theme: th, pages: new Set(), count: 0 }).count++; worst[k].pages.add(name); }
    return `${fresh.length} / ${r.checked}${r.on ? '' : ' ⚠ not applied'}`;
  });
  const extErr = [...new Set(THEMES.flatMap((th) => report.themes[th][i]?.errors ?? []))].filter((e) => !baseErr.has(e));
  md += `| ${name} | ${cells.join(' | ')} | ${extErr.length ? extErr.join('; ') : '0'} |\n`;
}
md += '\n## Most frequent new low-contrast spots\n\n';
for (const w of Object.values(worst).sort((a, b) => b.count - a.count).slice(0, 25)) md += `- **${w.theme}** \`${w.where}\` "${w.text}" contrast ${w.contrast} · ${w.count}× on ${[...w.pages].slice(0, 4).join(', ')}\n`;
const loads = THEMES.flatMap((th) => report.themes[th].map((r, i) => (r.loadMs && baseline[i]?.loadMs ? r.loadMs - baseline[i].loadMs : null))).filter((x) => x !== null);
md += `\nLoad time vs baseline (ms, network-noisy): median ${loads.sort((a, b) => a - b)[Math.floor(loads.length / 2)] ?? 'n/a'}\n`;
writeFileSync(join(out, 'report.md'), md);
console.log('\n' + md);
