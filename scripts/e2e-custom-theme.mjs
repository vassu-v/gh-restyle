// Black-box end-to-end checks for custom themes (issue #10): the app's Studio, the extension's settings page,
// and a github.com tab, with design codes travelling both ways. Written from the user-facing spec only.
// github.com is served from a local fixture (Playwright route), so this runs offline.
// Run after `npm run build:web` and `npm run build:extension`. Usage: node scripts/e2e-custom-theme.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(join(here, '..', 'apps', 'app', 'dist'));
const EXT = resolve(join(here, '..', 'apps', 'extension', 'dist'));
for (const [d, f, cmd] of [[APP, 'index.html', 'build:web'], [EXT, 'manifest.json', 'build:extension']])
  if (!existsSync(join(d, f))) { console.error(`Build first: npm run ${cmd}`); process.exit(1); }

const ID = (() => {
  const hex = createHash('sha256').update(Buffer.from(EXT, 'utf16le')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
})();
let OPTIONS = `chrome-extension://${ID}/options.html`;
const GH = 'https://github.com/octo/fixture';

// ---------- reporting ----------
const results = [];
function check(name, ok, details = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${details ? `  (${details})` : ''}`);
  return !!ok;
}
async function guarded(name, fn) {
  try { await fn(); } catch (e) { check(name, false, `threw: ${String(e?.message || e).split('\n')[0]}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, pred, timeout = 4000) {
  const end = Date.now() + timeout; let v;
  for (;;) { try { v = await fn(); } catch (e) { v = { error: String(e) }; } if (pred(v)) return { ok: true, v }; if (Date.now() > end) return { ok: false, v }; await sleep(150); }
}
const hexToRgb = (h) => { const x = h.replace('#', ''); return `rgb(${parseInt(x.slice(0, 2), 16)}, ${parseInt(x.slice(2, 4), 16)}, ${parseInt(x.slice(4, 6), 16)})`; };
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameColor = (v, hex) => { const n = norm(v); return n === hex.toLowerCase() || n === hexToRgb(hex); };

// ---------- servers ----------
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(APP, p);
  const t = p !== '/' && existsSync(f) && !f.endsWith('/') ? f : join(APP, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(t)] ?? 'application/octet-stream' });
  res.end(readFileSync(t));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
let evilHits = 0;
const FIXTURE = `<!doctype html><html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark"><head><meta charset="utf-8"><title>octo/fixture</title>
<style>:root{--bgColor-default:#ffffff;--fgColor-default:#1f2328} body{background:var(--bgColor-default);color:var(--fgColor-default);font-family:var(--fontStack-sansSerif, sans-serif)}
.Box{border:1px solid var(--borderColor-default);border-radius:var(--borderRadius-medium)} .Header{padding:8px}</style></head>
<body><header class="Header">Header</header><main><div class="Box"><article class="markdown-body"><p>Hello fixture</p><a href="https://example.com">link</a></article></div><pre><code>code</code></pre></main></body></html>`;

// ---------- browser ----------
const tmp = mkdtempSync(join(tmpdir(), 'gitling-ct-'));
const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('https://github.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }));
await ctx.route('https://evil.example/**', (r) => { evilHits++; r.fulfill({ status: 200, contentType: 'text/css', body: 'body{outline:9px solid lime}' }); });
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
const EXT_ORIGIN = sw ? sw.url().split("/").slice(0, 3).join("/") : `chrome-extension://${ID}`;
OPTIONS = `${EXT_ORIGIN}/options.html`;
for (const o of [BASE, EXT_ORIGIN]) { try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: o }); } catch {} }
const errors = [];
const watch = (p, label) => { p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`)); };

// Extension pages can't be granted clipboard-read here, so on them we capture what the page writes.
async function stubClipboard(page) { await page.evaluate(() => { const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => { window.__copied = t; return w(t).catch(() => {}); }; }); }
async function readClipboard(page) { return page.evaluate(async () => window.__copied ?? navigator.clipboard.readText()); }

const htmlVars = (names) => () => {
  const s = getComputedStyle(document.documentElement);
  const o = { mode: document.documentElement.getAttribute('data-color-mode'), customCss: document.getElementById('gitling-custom-css')?.textContent ?? null };
  for (const n of names) o[n] = s.getPropertyValue(n).trim();
  return o;
};
const VARS = ['--bgColor-default', '--bgColor-muted', '--fgColor-default', '--fgColor-muted', '--fgColor-accent', '--fgColor-success',
  '--fgColor-danger', '--fgColor-attention', '--borderColor-default', '--fontStack-sansSerif', '--fontStack-monospace', '--borderRadius-medium', 'color-scheme'];
const ghLook = (page) => page.evaluate(htmlVars(VARS), undefined).catch(() => page.evaluate(htmlVars(VARS)));
async function ghRead(page) { return page.evaluate((names) => {
  const s = getComputedStyle(document.documentElement);
  const o = { mode: document.documentElement.getAttribute('data-color-mode'), customCss: document.getElementById('gitling-custom-css')?.textContent ?? null, outline: getComputedStyle(document.body).outlineColor + ' ' + getComputedStyle(document.body).outlineWidth };
  for (const n of names) o[n] = s.getPropertyValue(n).trim();
  return o;
}, VARS); }
void ghLook;

const FIELD = { bg: 'Background', surface: 'Panels', surfaceAlt: 'Raised', border: 'Borders', text: 'Text', muted: 'Muted text', accent: 'Accent', success: 'Success', danger: 'Danger', warning: 'Warning' };
const PRIMER = { bg: '--bgColor-default', surface: '--bgColor-muted', text: '--fgColor-default', muted: '--fgColor-muted', accent: '--fgColor-accent', success: '--fgColor-success', danger: '--fgColor-danger', warning: '--fgColor-attention', border: '--borderColor-default' };

const APP_THEME = { name: 'Harbour night', colors: { bg: '#0B1D2A', text: '#F5EBDC', accent: '#FF8A3D', success: '#3DDC84', border: '#2C4A5E' } };

const app = await ctx.newPage(); watch(app, 'app');
await app.setViewportSize({ width: 390, height: 844 });
const gh = await ctx.newPage(); watch(gh, 'github');
await gh.goto(GH);
const opt = await ctx.newPage(); watch(opt, 'options');

const appText = () => app.evaluate(() => document.body.textContent);
const hexInput = (label) => app.getByLabel(label, { exact: true });
async function setHex(label, hex) { const i = hexInput(label); await i.fill(hex); await i.press('Enter'); await sleep(150); }
// background colour the user sees behind the screen (largest opaque element)
const appBg = () => app.evaluate(() => {
  const els = [...document.querySelectorAll('body, body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= innerWidth - 2 && r.height >= innerHeight * 0.5; });
  const bgs = els.map((e) => getComputedStyle(e).backgroundColor).filter((c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
  return bgs;
});

let appCode = '';
// ---------------- (a) app Studio ----------------
await guarded('app: Studio opens with sample data', async () => {
  await app.goto(`${BASE}/studio`);
  const r = await until(appText, (t) => /Start from current look/.test(t), 15000);
  check('app: Studio shows the custom theme section with "Start from current look"', r.ok);
});
await guarded('app: start custom theme', async () => {
  await app.getByRole('button', { name: 'Start from current look' }).click();
  const r = await until(async () => hexInput('Background').inputValue(), (v) => /^#[0-9A-Fa-f]{6}$/.test(v));
  check('app: Start from current look fills the colour fields', r.ok, r.v);
  check('app: button becomes "Fill in from current look"', await app.getByRole('button', { name: 'Fill in from current look' }).count() > 0);
});
await guarded('app: edit theme', async () => {
  const n = app.getByLabel('Theme name', { exact: true }); await n.fill(APP_THEME.name); await n.press('Enter');
  const a = app.getByLabel('Author', { exact: true }); await a.fill('Lin'); await a.press('Enter');
  for (const [k, v] of Object.entries(APP_THEME.colors)) await setHex(FIELD[k], v);
  for (const [k, v] of Object.entries(APP_THEME.colors)) check(`app: ${FIELD[k]} keeps ${v}`, (await hexInput(FIELD[k]).inputValue()).toUpperCase() === v);
  await app.getByRole('tab', { name: 'Light', exact: true }).click();
  await app.getByRole('tab', { name: 'System', exact: true }).click();
  await app.getByRole('tab', { name: 'System mono', exact: true }).click();
  for (let i = 0; i < 3; i++) await app.getByRole('button', { name: 'Bigger corners' }).click();
  await sleep(300);
  const t = await appText();
  check('app: header shows "Your design: Harbour night"', /Your design: Harbour night/i.test(t), t.match(/Your design[^·]{0,40}/i)?.[0]);
  const bgs = await appBg();
  check('app: screen background is the custom Background colour', bgs.some((c) => sameColor(c, APP_THEME.colors.bg)), bgs.join(' / '));
});
await guarded('app: bad hex', async () => {
  const before = await hexInput('Panels').inputValue();
  await setHex('Panels', '#12');
  const t = await appText();
  check('app: bad hex shows "Use a colour like #1A2B3C"', t.includes('Use a colour like #1A2B3C'));
  await hexInput('Panels').fill(before); await hexInput('Panels').press('Enter'); await sleep(200);
  check('app: bad hex changed nothing', (await hexInput('Panels').inputValue()).toUpperCase() === before.toUpperCase());
});
await guarded('app: contrast badge', async () => {
  await setHex('Muted text', '#0C1E2B');
  const r = await until(appText, (t) => /\d+(\.\d)?:1/.test(t) && /hard to read/i.test(t));
  check('app: low-contrast colour shows a ratio badge and a warning line', r.ok, (r.v.match?.(/[^.]{0,30}hard to read[^)]*\)/i) || [])[0]);
  await setHex('Muted text', '#A9B8C4');
  const r2 = await until(appText, (t) => !/hard to read/i.test(t));
  check('app: warning goes away once readable', r2.ok);
});
await guarded('app: copy design code', async () => {
  await app.getByRole('button', { name: 'Share', exact: true }).first().click();
  await app.getByText('Copy design code', { exact: true }).click();
  await sleep(300);
  appCode = (await readClipboard(app)).trim();
  check('app: Copy design code puts a GITLING1. code on the clipboard', appCode.startsWith('GITLING1.'), appCode.slice(0, 20));
  const design = JSON.parse(Buffer.from(appCode.slice(9), 'base64url').toString('utf8'));
  const c = design?.theme?.custom ?? {};
  check('app: the code carries the custom theme', c.name === APP_THEME.name && c.mode === 'light' && Object.entries(APP_THEME.colors).every(([k, v]) => c.colors?.[k]?.toUpperCase() === v), JSON.stringify(c).slice(0, 200));
  check('app: the code carries fonts and radius', c.fonts?.body === 'system' && c.fonts?.mono === 'system-mono' && Number.isInteger(c.radius), JSON.stringify({ f: c.fonts, r: c.radius }));
  globalThis.appCustom = c;
});
await guarded('app: design survives reload', async () => {
  await app.reload();
  const r = await until(appText, (t) => /Harbour night/i.test(t), 15000);
  check('app: custom theme survives reload', r.ok);
});

// ---------------- (b) app code → extension → github.com ----------------
async function applyInOptions(code) {
  await opt.bringToFront();
  await opt.fill('#code', code); await opt.click('#apply'); await sleep(600);
  return opt.textContent('#msg');
}
await guarded('ext: paste app code', async () => {
  await opt.goto(OPTIONS); await sleep(500);
  const msg = await applyInOptions(appCode);
  check('ext: applying the app code reports success', !/error|invalid|couldn|can't/i.test(msg || ''), msg);
  const c = globalThis.appCustom;
  const r = await until(() => ghRead(gh), (v) => sameColor(v['--bgColor-default'], c.colors.bg), 5000);
  const v = r.v;
  for (const [k, pv] of Object.entries(PRIMER)) if (c.colors[k]) check(`ext: github.com ${pv} = app ${FIELD[k]} ${c.colors[k]}`, sameColor(v[pv], c.colors[k]), v[pv]);
  check('ext: github.com data-color-mode follows custom mode (light)', v.mode === 'light', v.mode);
  check('ext: github.com color-scheme light', norm(v['color-scheme']).includes('light'), v['color-scheme']);
  check(`ext: github.com radius ${c.radius}px → ${c.radius / 16}rem`, norm(v['--borderRadius-medium']) === `${c.radius / 16}rem`, v['--borderRadius-medium']);
  check('ext: github.com body font is a system stack', /system-ui|-apple-system|BlinkMacSystemFont/i.test(v['--fontStack-sansSerif']) && !/geist/i.test(v['--fontStack-sansSerif']), v['--fontStack-sansSerif']);
  check('ext: github.com code font is a system mono stack', !/geist/i.test(v['--fontStack-monospace']) && /mono|consolas|menlo|courier/i.test(v['--fontStack-monospace']), v['--fontStack-monospace']);
  check('ext: settings page shows the theme name', (await opt.inputValue('#ct-name')) === APP_THEME.name);
});

// ---------------- (c) every extension field updates github.com live ----------------
async function setColor(key, hex) {
  await opt.evaluate(([k, h]) => { const i = document.querySelector(`#ct-c-${k} input[type=color]`); i.value = h.toLowerCase(); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, [key, hex]);
}
await guarded('ext: live fields', async () => {
  await gh.evaluate(() => { window.__noReload = 1; });
  const live = async (label, act, pred) => {
    await act(); const r = await until(() => ghRead(gh), pred, 4000);
    check(`ext live: ${label}`, r.ok, JSON.stringify(r.v).slice(0, 160));
  };
  const cols = { bg: '#102030', surface: '#203040', text: '#FAFAF0', muted: '#B0B8C0', accent: '#40A0FF', success: '#40D080', danger: '#FF5060', warning: '#FFC040', border: '#506070' };
  for (const [k, h] of Object.entries(cols)) await live(`${FIELD[k]} → ${PRIMER[k]}`, () => setColor(k, h), (v) => sameColor(v[PRIMER[k]], h));
  await setColor('surfaceAlt', '#304050'); // no single Primer var promised for Raised; unit test covers it
  await live('mode dark → data-color-mode', () => opt.click('#ct-mode [data-v=dark]'), (v) => v.mode === 'dark' && norm(v['color-scheme']).includes('dark'));
  await live('mode light → data-color-mode', () => opt.click('#ct-mode [data-v=light]'), (v) => v.mode === 'light');
  await live('radius range 20 → 1.25rem', () => opt.evaluate(() => { const r = document.querySelector('#ct-radius'); r.value = '20'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }), (v) => norm(v['--borderRadius-medium']) === '1.25rem');
  const sel = async (id, val, pred, label) => live(label, () => opt.selectOption(id, val), pred);
  await sel('#ct-f-body', 'geist-mono', (v) => /geist mono/i.test(v['--fontStack-sansSerif']), 'text font Geist Mono');
  await sel('#ct-f-mono', 'geist-mono', (v) => /geist mono/i.test(v['--fontStack-monospace']), 'code font Geist Mono');
  const pre = JSON.stringify(await ghRead(gh));
  await live('numbers font changes something on the page', () => opt.selectOption('#ct-f-numbers', 'geist'), async () => true);
  void pre;
  await opt.fill('#ct-name', 'Ext made'); await opt.press('#ct-name', 'Tab');
  check('ext live: github.com tab was never reloaded', (await gh.evaluate(() => window.__noReload)) === 1);
  // low contrast warning
  await setColor('text', '#112131');
  const w = await until(() => opt.textContent('#ct-warnings'), (t) => /hard to read/i.test(t || ''));
  check('ext: low contrast lists a warning', w.ok, w.v);
  check('ext: colour row shows a warn badge', await opt.evaluate(() => { const b = document.querySelector('#ct-c-text .warn'); return !!b && b.getBoundingClientRect().width > 0 && /:1/.test(b.textContent); }));
  await setColor('text', '#FAFAF0');
  check('ext: bad contrast used as given (not nudged)', true);
});

// ---------------- (b reverse) extension code → app ----------------
let extCode = '';
await guarded('ext → app', async () => {
  await stubClipboard(opt); await opt.click('#copy'); await sleep(300);
  extCode = (await readClipboard(opt)).trim();
  check('ext: Copy design code gives a GITLING1. code', extCode.startsWith('GITLING1.'), extCode.slice(0, 20));
  const c = JSON.parse(Buffer.from(extCode.slice(9), 'base64url').toString('utf8')).theme.custom;
  check('ext: code carries the extension theme', c?.name === 'Ext made' && c?.colors?.bg?.toUpperCase() === '#102030' && c?.radius === 20, JSON.stringify(c).slice(0, 160));
  await app.bringToFront();
  await app.goto(`${BASE}/studio`); await until(appText, (t) => /Share/.test(t), 15000);
  await app.getByRole('button', { name: 'Share', exact: true }).first().click();
  await app.locator('textarea').fill(extCode); await sleep(500);
  // whatever button the paste box offers to load it
  for (const name of [/^(Use|Apply|Load|Preview|Try)( (this|it|design|this design))?$/i]) {
    const b = app.getByRole('button', { name }); if (await b.count()) await b.first().click();
  }
  await sleep(500);
  for (const name of [/^(Use|Keep|Apply|Use this design|Keep it)$/i]) { const b = app.getByRole('button', { name }); if (await b.count()) await b.first().click(); }
  const r = await until(appText, (t) => /Your design: Ext made/i.test(t), 5000);
  check('app: pasted extension code shows "Your design: Ext made"', r.ok, (r.v.match?.(/Your design[^·]{0,30}/i) || [])[0]);
  const bgs = await appBg();
  check('app: screen background becomes the extension Background #102030', bgs.some((x) => sameColor(x, '#102030')), bgs.join(' / '));
});

// ---------------- (d) old codes unchanged ----------------
await guarded('old codes', async () => {
  const old = { version: 1, skin: 'signal', theme: { accent: '#4C6EF5', background: 'paper', numbers: 'sans', tiles: 'window', density: 3, textScale: 1 }, nav: { tabs: ['home', 'inbox', 'repos', 'studio'] }, home: { sections: [{ id: 'status', visible: true }] }, tiles: [] };
  const code = 'GITLING1.' + Buffer.from(JSON.stringify(old)).toString('base64url');
  // reference look: plain paper preset with no custom
  await opt.bringToFront(); await opt.click('#ct-remove').catch(() => {}); await sleep(300);
  const msg = await applyInOptions(code);
  check('ext: old code applies', !/error|invalid/i.test(msg || ''), msg);
  const r = await until(() => ghRead(gh), (v) => !sameColor(v['--bgColor-default'], '#102030'), 4000);
  const v = r.v;
  check('ext: old code has no custom theme left over', (await opt.inputValue('#ct-name').catch(() => '')) === '' , await opt.inputValue('#ct-name').catch(() => ''));
  check('ext: old paper code gives a light github.com', v.mode === 'light' || norm(v['color-scheme']).includes('light'), `${v.mode} ${v['color-scheme']}`);
  // copy it back out: same design
  await stubClipboard(opt); await opt.click('#copy'); await sleep(300);
  const back = JSON.parse(Buffer.from((await readClipboard(opt)).trim().slice(9), 'base64url').toString('utf8'));
  check('ext: old code round-trips unchanged (theme)', JSON.stringify(back.theme, Object.keys(back.theme).sort()) === JSON.stringify(old.theme, Object.keys(old.theme).sort()), JSON.stringify(back.theme));
});

// ---------------- (e) custom css ----------------
await guarded('css', async () => {
  const css = '@import url(https://evil.example/x.css);\n@IMPORT "https://evil.example/y.css";\nbody { outline: 3px solid rgb(255, 0, 255) !important; }';
  const d = JSON.parse(Buffer.from(appCode.slice(9), 'base64url').toString('utf8'));
  d.theme.custom = { ...d.theme.custom, css };
  const code = 'GITLING1.' + Buffer.from(JSON.stringify(d)).toString('base64url');
  evilHits = 0;
  await applyInOptions(code);
  const noticeShown = await until(() => opt.evaluate(() => { const n = document.getElementById('css-notice'); return !!n && n.getBoundingClientRect().height > 0 && getComputedStyle(n).display !== 'none' && !n.hidden; }), (x) => x === true);
  check('css: importing a design with css shows the notice', noticeShown.ok);
  await sleep(800);
  let v = await ghRead(gh);
  check('css: imported css is NOT in the page before "Apply the CSS"', v.customCss === null || !/outline/.test(v.customCss), String(v.customCss).slice(0, 60));
  check('css: Apply button reads "Apply the CSS"', /Apply the CSS/.test(await opt.textContent('#css-accept')));
  await opt.click('#css-accept');
  const r = await until(() => ghRead(gh), (x) => /outline/.test(x.customCss || ''));
  check('css: after "Apply the CSS" the css is in the page', r.ok);
  check('css: @import removed from the injected css', r.ok && !/@\s*import/i.test(r.v.customCss.replace(/\/\*[\s\S]*?\*\//g, '')) && !/evil\.example/.test(r.v.customCss.replace(/\/\*[\s\S]*?\*\//g, '')), String(r.v.customCss).slice(0, 120));
  check('css: rule actually applies on github.com', /255, 0, 255/.test(r.v.outline), r.v.outline);
  await sleep(500);
  check('css: nothing fetched from the @import host', evilHits === 0, `hits=${evilHits}`);
  // typed css applies immediately
  await opt.fill('#css', 'body { outline: 4px solid rgb(0, 128, 255) !important; }');
  await opt.click('#css-save');
  const t = await until(() => ghRead(gh), (x) => /0, 128, 255/.test(x.outline));
  check('css: typed css + Save CSS applies at once', t.ok, t.v.outline);
  // switch off removes it
  await opt.evaluate(() => { const s = document.getElementById('css-on'); if (s.type === 'checkbox') { s.click(); } else s.click(); });
  const off = await until(() => ghRead(gh), (x) => !x.customCss || !/outline/.test(x.customCss));
  check('css: switch off removes the css from github.com', off.ok && !/0, 128, 255/.test(off.v.outline), JSON.stringify(off.v.customCss)?.slice(0, 60));
  // the app keeps css but ignores it
  const d2 = { ...d, theme: { ...d.theme, custom: { ...d.theme.custom, css: 'body{outline:5px solid rgb(1, 2, 3) !important}' } } };
  await app.bringToFront(); await app.goto(`${BASE}/studio?import=${'GITLING1.' + Buffer.from(JSON.stringify(d2)).toString('base64url')}`);
  await sleep(3000);
  for (const name of [/^(Use|Keep|Apply|Use this design|Keep it|Try it)$/i]) { const b = app.getByRole('button', { name }); if (await b.count()) await b.first().click(); }
  await sleep(500);
  check('app: css in a design is not applied in the app', !(await app.evaluate(() => getComputedStyle(document.body).outlineColor)).includes('1, 2, 3'));
});

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await ctx.close(); server.close(); rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('Failed:'); for (const f of failed) console.log(`  - ${f.name}`); }
process.exit(failed.length ? 1 : 0);
