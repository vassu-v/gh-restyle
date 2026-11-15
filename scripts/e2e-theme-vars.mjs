// Black-box end-to-end checks for the extension's "variables" box (docs/EXTENSION.md § Variables), written from the
// user-facing spec only. Loads apps/extension/dist unpacked in Chromium, drives the settings page while a real
// github.com tab is open, and checks what a user sees there: values in the box, live changes on github.com without a
// reload, "yours" lines, errors by line, no network from url(), design codes, Reset, and settings that last.
// Run: npm run build:extension && npm run e2e:extension:vars   (prints PASS/FAIL lines, exits 1 on any FAIL)
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, 'apps/extension/dist');
if (!existsSync(join(ext, 'manifest.json'))) { console.error('Build the extension first: npm run build:extension'); process.exit(1); }
const { chromium } = createRequire(import.meta.url)('playwright');
// Chrome derives an unpacked extension's id from its path: UTF-8 bytes on macOS/Linux, UTF-16LE on Windows,
// where it first upper-cases the drive letter.
const idPath = process.platform === 'win32' ? ext.replace(/^[a-z]:/, (d) => d.toUpperCase()) : ext;
const extId = [...createHash('sha256').update(process.platform === 'win32' ? Buffer.from(idPath, 'utf16le') : idPath).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
let EXT_ORIGIN = `chrome-extension://${extId}`;

// Only this github.com page is reachable from the test environment; it's enough (Gitling styles every page the same way).
const GH = 'https://github.com/vassu-v/gh-restyle';
const FAKE = 'gitling-fake.example';
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;

// ---------- reporting ----------
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return !!ok; };
const info = (s) => console.log(`info  ${s}`);
async function guarded(name, fn) { try { await fn(); } catch (e) { check(name, false, `threw: ${String(e?.message || e).split('\n')[0]}`); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, pred, timeout = 5000) {
  const end = Date.now() + timeout; let v;
  for (;;) { try { v = await fn(); } catch (e) { v = { error: String(e?.message || e) }; } if (pred(v)) return { ok: true, v }; if (Date.now() > end) return { ok: false, v }; await sleep(150); }
}
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')');
const same = (a, b) => norm(a) === norm(b);
const goto = async (page, url) => { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {}); };

// ---------- browser ----------
const work = mkdtempSync(join(tmpdir(), 'gitling-e2e-vars-'));
const ctx = await chromium.launchPersistentContext(join(work, 'profile'), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, proxy,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
if (sw) EXT_ORIGIN = sw.url().split('/').slice(0, 3).join('/');
const OPTIONS = `${EXT_ORIGIN}/options.html`;

// Anything that tries to fetch from the fake host is counted (and answered locally, so nothing leaves the machine).
let fakeHits = 0;
const fakeUrls = [];
ctx.on('request', (r) => { if (r.url().includes(FAKE)) { fakeHits++; fakeUrls.push(r.url()); } });
await ctx.route(`**/*${FAKE}*/**`, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));

const extErrors = [];
function watchErrors(page, label) {
  page.on('pageerror', (e) => {
    const where = `${e.message}\n${e.stack ?? ''}`;
    if (page.url().startsWith(EXT_ORIGIN) || where.includes(EXT_ORIGIN) || /gitling/i.test(where)) extErrors.push(`${label}: ${e.message.slice(0, 160)}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url ?? '';
    if (page.url().startsWith(EXT_ORIGIN) || loc.startsWith(EXT_ORIGIN)) extErrors.push(`${label} console: ${m.text().slice(0, 160)}`);
  });
}

const gh = await ctx.newPage(); watchErrors(gh, 'github');
await goto(gh, GH);
await gh.evaluate(() => { window.__gitlingVarsMark = 42; });
let opt;
async function openSettings() {
  opt = await ctx.newPage(); watchErrors(opt, 'settings');
  await opt.goto(OPTIONS);
  await opt.waitForFunction(() => (document.querySelector('#vars')?.value ?? '').includes('--'), null, { timeout: 8000 });
  await opt.evaluate(() => { const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => { window.__copied = t; return w(t).catch(() => {}); }; });
  opt.on('dialog', (d) => d.accept().catch(() => {}));
}
await openSettings();

// ---------- probes ----------
const ghVar = (name) => gh.evaluate((n) => (n === 'zoom' || n === 'color-scheme')
  ? getComputedStyle(document.documentElement)[n === 'zoom' ? 'zoom' : 'colorScheme']
  : getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const ghVars = (names) => gh.evaluate((ns) => { const s = getComputedStyle(document.documentElement); return Object.fromEntries(ns.map((n) => [n, s.getPropertyValue(n).trim()])); }, names);
const notReloaded = async () => (await gh.evaluate(() => window.__gitlingVarsMark).catch(() => null)) === 42;
const boxText = () => opt.inputValue('#vars');
/** Lines of the box as [{line, name, value}] (declarations only, comments skipped). */
function decls(text) {
  const out = []; let inComment = false;
  text.split('\n').forEach((raw, i) => {
    let l = raw;
    if (inComment) { const e = l.indexOf('*/'); if (e < 0) return; l = l.slice(e + 2); inComment = false; }
    l = l.replace(/\/\*.*?\*\//g, '');
    const s = l.indexOf('/*'); if (s >= 0) { l = l.slice(0, s); inComment = true; }
    const m = l.match(/^\s*([-\w]+)\s*:\s*(.*?)\s*;?\s*$/);
    if (m) out.push({ line: i + 1, name: m[1], value: m[2] });
  });
  return out;
}
const valueInBox = (text, name) => decls(text).find((d) => d.name === name)?.value;
/** Names listed under the "/* yours *\/" heading (until the next comment heading). */
function yoursIn(text) {
  const ls = text.split('\n'); const i = ls.findIndex((l) => /\/\*\s*yours\s*\*\//i.test(l));
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < ls.length; j++) { if (/^\s*\/\*/.test(ls[j])) break; const m = ls[j].match(/^\s*([-\w]+)\s*:/); if (m) out.push(m[1]); }
  return out;
}
async function typeBox(text) { await opt.bringToFront(); await opt.fill('#vars', text); await sleep(900); }
async function blurBox() { await opt.evaluate(() => document.querySelector('#vars').blur()); await sleep(400); }
/** Replace (or add) one line in the box, like a person editing it. */
async function setLine(name, value) {
  const ls = (await boxText()).split('\n');
  const i = ls.findIndex((l) => new RegExp(`^\\s*${name.replace(/[-]/g, '\\-')}\\s*:`).test(l));
  const line = `${name}: ${value};`;
  if (i >= 0) ls[i] = line; else ls.push(line);
  await typeBox(ls.join('\n'));
}
async function deleteLine(name) {
  const ls = (await boxText()).split('\n').filter((l) => !new RegExp(`^\\s*${name.replace(/[-]/g, '\\-')}\\s*:`).test(l));
  await typeBox(ls.join('\n'));
}
const stateText = () => opt.textContent('#vars-state').then((t) => (t ?? '').trim());
const errorsText = () => opt.evaluate(() => [...document.querySelectorAll('#vars-errors li, #vars-errors > *')].map((e) => e.textContent.trim()).filter(Boolean));
const yoursCount = async () => Number(((await stateText()).match(/(\d+)\s+of yours/i) || [])[1] ?? (/(no|none)/i.test(await stateText()) ? 0 : NaN));
const decodeCode = (code) => JSON.parse(Buffer.from(code.trim().replace(/^GITLING1\./, ''), 'base64url').toString('utf8'));
const encodeCode = (design) => 'GITLING1.' + Buffer.from(JSON.stringify(design)).toString('base64url');
async function applyCode(code) { await opt.bringToFront(); await opt.fill('#code', code); await opt.click('#apply'); await sleep(900); return (await opt.textContent('#msg'))?.trim() ?? ''; }
async function copyCode() { await opt.evaluate(() => { window.__copied = undefined; }); await opt.click('#copy'); const r = await until(() => opt.evaluate(() => window.__copied), (v) => typeof v === 'string' && v.length > 0); return r.v ?? ''; }

let BASE = {}; // the controls' values as the box shows them at the start
const MINE = {
  '--borderRadius-medium': '2px',
  '--borderRadius-large': '1.5rem',
  '--fgColor-accent': 'rgb(255 120 0)',
  '--fontStack-system': 'Georgia, serif',
  '--gitling-test-width': '50%',
  zoom: '1.1',
};

let exitCode = 0;
try {
  // 1. The box lists what Gitling writes, with the values github.com has right now.
  await guarded('box lists the variables', async () => {
    const text = await boxText();
    const ds = decls(text);
    BASE = Object.fromEntries(ds.map((d) => [d.name, d.value]));
    info(`box shows ${ds.length} declarations`);
    check('box: lists about 65 values (at least 40)', ds.length >= 40, `${ds.length}`);
    for (const n of ['--bgColor-default', '--fgColor-accent', '--fontStack-monospace', 'color-scheme']) check(`box: lists ${n}`, n in BASE, BASE[n]);
    check('box: lists --gitling-* copies', ds.some((d) => d.name.startsWith('--gitling-')));
    check('box: starts with nothing of yours', (await yoursCount()) === 0 && yoursIn(text).length === 0, await stateText());
    const names = ds.filter((d) => d.name.startsWith('--')).map((d) => d.name);
    const live = await ghVars(names);
    const off = names.filter((n) => !same(live[n], BASE[n]));
    check('box: every --value matches github.com right now', off.length === 0, off.slice(0, 4).map((n) => `${n}: box ${BASE[n]} / page ${live[n]}`).join('; '));
    const groups = ['page', 'type', 'shape', 'buttons and controls', 'text and links', 'backgrounds', 'borders and lines'];
    check('box: grouped like the spec says', groups.every((g) => text.toLowerCase().includes(g)), groups.filter((g) => !text.toLowerCase().includes(g)).join(', '));
  });

  // 2. Changing values, in several units, reaches the open github.com tab without a reload.
  await guarded('live edits', async () => {
    for (const [name, value] of Object.entries(MINE)) {
      await setLine(name, value);
      const want = name === 'zoom' ? (v) => Math.abs(parseFloat(v) - 1.1) < 0.001 : (v) => same(v, value);
      const r = await until(() => ghVar(name), want, 5000);
      check(`live: ${name}: ${value} reaches github.com`, r.ok, `page has ${JSON.stringify(r.v)}`);
    }
    check('live: github.com tab was not reloaded', await notReloaded());
    const fonts = await gh.evaluate(() => getComputedStyle(document.body).fontFamily);
    info(`github.com body font-family now: ${fonts}`);
  });
  await guarded('changes show on the page', async () => {
    // a variable github.com actually uses: the page background
    await setLine('--bgColor-default', '#102030');
    const r = await until(() => gh.evaluate(() => getComputedStyle(document.body).backgroundColor), (v) => v === 'rgb(16, 32, 48)');
    check('live: --bgColor-default: #102030 paints github.com\'s background', r.ok, r.v);
    await deleteLine('--bgColor-default');
    const back = await until(() => ghVar('--bgColor-default'), (v) => same(v, BASE['--bgColor-default']));
    check('live: deleting that line gives the background back to the controls', back.ok, `${back.v} vs ${BASE['--bgColor-default']}`);
  });

  // 3. Your lines move to the top under /* yours */.
  await guarded('yours', async () => {
    await blurBox();
    const text = await boxText();
    const ys = yoursIn(text);
    check('yours: every changed line is listed under /* yours */', Object.keys(MINE).every((n) => ys.includes(n)), ys.join(', '));
    check('yours: nothing else is listed as yours', ys.length === Object.keys(MINE).length, ys.join(', '));
    const firstYours = text.toLowerCase().indexOf('/* yours */');
    const firstGroupDecl = decls(text).find((d) => !(d.name in MINE));
    check('yours: /* yours */ comes before the controls\' groups', firstYours >= 0 && text.split('\n').slice(0, firstGroupDecl.line - 1).join('\n').toLowerCase().includes('/* yours */'));
    check('yours: each of yours appears once', Object.keys(MINE).every((n) => decls(text).filter((d) => d.name === n).length === 1));
    check(`yours: state says "${Object.keys(MINE).length} of yours"`, (await yoursCount()) === Object.keys(MINE).length, await stateText());
  });

  // 4. Background change: your lines stay; other lines follow the controls.
  await guarded('background change', async () => {
    const before = await boxText();
    const target = (await opt.evaluate(() => document.querySelector('#bg button[aria-pressed="true"]')?.dataset.v)) === 'paper' ? 'black' : 'paper';
    await opt.click(`#bg button[data-v="${target}"]`);
    const r = await until(boxText, (t) => valueInBox(t, '--bgColor-default') !== valueInBox(before, '--bgColor-default'));
    check(`bg ${target}: the box shows the controls' new values`, r.ok, `${valueInBox(before, '--bgColor-default')} → ${valueInBox(r.v, '--bgColor-default')}`);
    const text = r.v;
    const page = await until(() => ghVar('--bgColor-default'), (v) => same(v, valueInBox(text, '--bgColor-default')));
    check(`bg ${target}: github.com follows on lines that aren't yours`, page.ok, `${page.v}`);
    for (const [n, v] of Object.entries(MINE)) {
      check(`bg ${target}: your ${n} stays in the box`, same(valueInBox(text, n), v), valueInBox(text, n));
      const pv = await ghVar(n);
      check(`bg ${target}: your ${n} stays on github.com`, n === 'zoom' ? Math.abs(parseFloat(pv) - 1.1) < 0.001 : same(pv, v), pv);
    }
    check(`bg ${target}: still ${Object.keys(MINE).length} of yours`, (await yoursCount()) === Object.keys(MINE).length, await stateText());
    BASE = Object.fromEntries(decls(text).filter((d) => !(d.name in MINE)).map((d) => [d.name, d.value]));
  });

  // 5. Handing lines back: delete one, or set one to the controls' value.
  await guarded('hand back', async () => {
    await deleteLine('--borderRadius-medium');
    await blurBox();
    const r = await until(() => ghVar('--borderRadius-medium'), (v) => !same(v, '2px'));
    const t = await boxText();
    check('give back: deleting your line changes github.com back', r.ok, r.v);
    check('give back: the line returns to the controls\' group with their value', !yoursIn(t).includes('--borderRadius-medium') && valueInBox(t, '--borderRadius-medium') && same(valueInBox(t, '--borderRadius-medium'), r.v), `${valueInBox(t, '--borderRadius-medium')} / page ${r.v}`);
    const link = valueInBox(t, '--fgColor-link');
    await setLine('--fgColor-link', '#00ff00');
    const g = await until(() => ghVar('--fgColor-link'), (v) => same(v, '#00ff00'));
    check('give back: --fgColor-link edited to #00ff00 reaches github.com', g.ok, g.v);
    await setLine('--fgColor-link', link);
    await blurBox();
    const t2 = await boxText();
    check('give back: setting a line back to the controls\' value means it is no longer yours', !yoursIn(t2).includes('--fgColor-link'), yoursIn(t2).join(', '));
    check('give back: state counts it', (await yoursCount()) === Object.keys(MINE).length - 1, await stateText());
    delete MINE['--borderRadius-medium'];
  });

  // 6. Mistakes are named by line, and nothing changes until they're fixed.
  await guarded('errors', async () => {
    const good = await boxText();
    const before = await ghVars(['--fgColor-muted', '--bgColor-muted']);
    const ls = good.split('\n');
    ls.push('--fgColor-muted: #123456;'); // a good change alongside the mistakes: must not apply yet
    ls.push('color: red;'); const l1 = ls.length;
    ls.push(`--bgColor-muted: url(https://${FAKE}/a.png);`); const l2 = ls.length;
    ls.push('this is not css'); const l3 = ls.length;
    ls.push('--x: Image-Set("https://' + FAKE + '/b.png" 1x);'); const l4 = ls.length;
    await typeBox(ls.join('\n'));
    await sleep(600);
    const errs = await errorsText();
    info(`errors shown: ${JSON.stringify(errs)}`);
    for (const [n, what] of [[l1, 'color: red'], [l2, 'url()'], [l3, 'not css'], [l4, 'Image-Set()']]) {
      check(`errors: line ${n} (${what}) is named`, errs.some((e) => new RegExp(`\\b${n}\\b`).test(e)), errs.join(' | ').slice(0, 200));
    }
    check('errors: four errors listed', errs.length === 4, `${errs.length}`);
    const after = await ghVars(['--fgColor-muted', '--bgColor-muted']);
    check('errors: nothing changed on github.com (not even the good line)', same(after['--fgColor-muted'], before['--fgColor-muted']) && same(after['--bgColor-muted'], before['--bgColor-muted']), JSON.stringify(after));
    check('errors: no request to the url() host', fakeHits === 0, fakeUrls.join(' '));
    // fix them: the good line then applies, errors go away
    await typeBox(ls.slice(0, l1 - 1).join('\n'));
    const r = await until(() => ghVar('--fgColor-muted'), (v) => same(v, '#123456'));
    check('errors: once fixed, the good line applies', r.ok, r.v);
    check('errors: the list empties once fixed', (await errorsText()).length === 0, (await errorsText()).join(' | '));
    MINE['--fgColor-muted'] = '#123456';
  });

  // 7. Harder mistakes: nothing that could load or break out of the value.
  await guarded('refused values', async () => {
    const tries = [
      `--bgColor-muted: URL (https://${FAKE}/c.png);`, `--bgColor-muted: \\75rl(https://${FAKE}/d.png);`, `--bgColor-muted: image-set("https://${FAKE}/e.png" 1x);`,
      `--bgColor-muted: -webkit-image-set("https://${FAKE}/f.png" 1x);`, `--bgColor-muted: red; background-image: url(https://${FAKE}/g.png);`,
      `--bgColor-muted: red } body { background: url(https://${FAKE}/h.png) } :root {`, `--bgColor-muted: javascript:alert(1);`,
      `--bgColor-muted: </style><img src="https://${FAKE}/i.png">;`, '@import url(https://' + FAKE + '/j.css);', `--bgColor-muted: ${'x'.repeat(201)};`,
      `--bgColor-muted: ur/**/l(https://${FAKE}/k.png);`,
    ];
    const good = await boxText();
    const before = await ghVar('--bgColor-muted');
    for (const t of tries) {
      await typeBox(`${good}\n${t}`);
      const errs = await errorsText();
      const now = await ghVar('--bgColor-muted');
      const bodyBg = await gh.evaluate(() => getComputedStyle(document.body).backgroundImage);
      check(`refused: ${t.slice(0, 60)}`, errs.length > 0 && same(now, before) && !bodyBg.includes(FAKE), `errors=${errs.length} page=${now.slice(0, 40)}`);
    }
    await typeBox(good);
    await sleep(500);
    check('refused: still no request to the fake host', fakeHits === 0, fakeUrls.join(' '));
    // an unclosed quote is a value, not a way to break the rest
    await setLine('--gitling-test-quote', '"unclosed');
    await sleep(400);
    const q = await ghVars(['--fgColor-accent', '--gitling-test-width']);
    check('quote: an unclosed quote doesn\'t break your other lines on github.com', same(q['--fgColor-accent'], 'rgb(255 120 0)') && same(q['--gitling-test-width'], '50%'), JSON.stringify(q));
    await deleteLine('--gitling-test-quote');
    await blurBox();
  });

  // 8. Copy design code, give all back, paste the code: your values come back.
  let code = '';
  await guarded('codes', async () => {
    code = await copyCode();
    check('code: Copy design code gives a GITLING1. code', code.startsWith('GITLING1.'), code.slice(0, 16));
    const vars = decodeCode(code)?.theme?.custom?.vars ?? {};
    check('code: carries theme.custom.vars with your values', Object.entries(MINE).every(([k, v]) => same(vars[k], v)) && Object.keys(vars).length === Object.keys(MINE).length, JSON.stringify(vars));
    await opt.click('#vars-reset');
    await sleep(800);
    const t = await boxText();
    check('give all back: no lines of yours left', yoursIn(t).length === 0 && (await yoursCount()) === 0, await stateText());
    const r = await until(() => ghVar('--fgColor-accent'), (v) => !same(v, 'rgb(255 120 0)'));
    check('give all back: github.com goes back to the controls', r.ok && !same(await ghVar('--gitling-test-width'), '50%'), r.v);
    const msg = await applyCode(code);
    info(`#msg after paste: ${msg}`);
    const back = await until(() => ghVars(Object.keys(MINE).filter((k) => k.startsWith('--'))), (v) => Object.entries(v).every(([k, x]) => same(x, MINE[k])));
    check('paste: the code restores your values on github.com straight away (nothing to confirm)', back.ok, JSON.stringify(back.v));
    const zoomed = await ghVar('zoom');
    check('paste: zoom restored', Math.abs(parseFloat(zoomed) - 1.1) < 0.001, zoomed);
    await blurBox();
    const ys = yoursIn(await boxText());
    check('paste: the box lists them as yours again', Object.keys(MINE).every((k) => ys.includes(k)), ys.join(', '));
  });

  // 9. A design with a bad variable: the rest loads, it's named, nothing is fetched.
  await guarded('bad code', async () => {
    const d = decodeCode(code);
    d.theme.custom.vars = { ...d.theme.custom.vars, '--evil': `url(https://${FAKE}/z.png)`, '--gitling-test-ok': '7px' };
    const msg = await applyCode(encodeCode(d));
    check('bad code: says what it left out (--evil)', /--evil/.test(msg), msg);
    const r = await until(() => ghVar('--gitling-test-ok'), (v) => same(v, '7px'));
    check('bad code: the other variables still apply', r.ok && same(await ghVar('--fgColor-accent'), 'rgb(255 120 0)'), r.v);
    check('bad code: --evil is not on github.com', !(await ghVar('--evil')), await ghVar('--evil'));
    check('bad code: no request to the fake host', fakeHits === 0, fakeUrls.join(' '));
    await applyCode(code); // back to the clean code
    await until(() => ghVar('--gitling-test-ok'), (v) => !v);
  });

  // 10. Loading a design without variables keeps yours.
  await guarded('design without vars', async () => {
    const d = decodeCode(code);
    delete d.theme.custom.vars;
    if (d.theme.custom && Object.keys(d.theme.custom).length === 0) delete d.theme.custom;
    d.theme.accent = '#33AA77';
    await applyCode(encodeCode(d));
    await sleep(500);
    const v = await ghVars(Object.keys(MINE).filter((k) => k.startsWith('--')));
    check('no-vars design: your values stay on github.com', Object.entries(v).every(([k, x]) => same(x, MINE[k])), JSON.stringify(v));
    await blurBox();
    const ys = yoursIn(await boxText());
    check('no-vars design: still yours in the box', Object.keys(MINE).every((k) => ys.includes(k)), ys.join(', '));
    const a = await until(() => ghVar('--fgColor-default'), () => true);
    void a;
  });

  // 11. Settings survive reopening the settings page, and reach a reloaded github.com tab.
  await guarded('persist', async () => {
    await opt.close();
    await openSettings();
    const t = await boxText();
    check('reopen: your lines are still in the box under /* yours */', Object.entries(MINE).every(([k, v]) => yoursIn(t).includes(k) && same(valueInBox(t, k), v)), yoursIn(t).join(', '));
    await goto(gh, GH);
    const r = await until(() => ghVars(Object.keys(MINE).filter((k) => k.startsWith('--'))), (v) => Object.entries(v).every(([k, x]) => same(x, MINE[k])), 8000);
    check('reload: a freshly loaded github.com tab gets your values', r.ok, JSON.stringify(r.v));
    await gh.evaluate(() => { window.__gitlingVarsMark = 42; });
  });

  // 12. Reset to default clears them.
  await guarded('reset', async () => {
    await opt.bringToFront();
    await opt.click('#reset');
    await sleep(1000);
    const t = await boxText();
    check('reset: no lines of yours', yoursIn(t).length === 0 && (await yoursCount()) === 0, await stateText());
    const r = await until(() => ghVars(['--fgColor-accent', '--gitling-test-width', '--fgColor-muted']), (v) => !same(v['--fgColor-accent'], 'rgb(255 120 0)') && !v['--gitling-test-width'] && !same(v['--fgColor-muted'], '#123456'));
    check('reset: github.com loses your values', r.ok, JSON.stringify(r.v));
    const z = await ghVar('zoom');
    check('reset: zoom is back to 1', Math.abs(parseFloat(z) - 1) < 0.001, z);
    const vars = decodeCode(await copyCode())?.theme?.custom?.vars;
    check('reset: the design code has no variables', !vars || Object.keys(vars).length === 0, JSON.stringify(vars));
    check('reset: github.com was not reloaded', await notReloaded());
  });

  check('no request ever reached the fake url() host', fakeHits === 0, fakeUrls.join(' '));
  check('no errors from the extension', extErrors.length === 0, extErrors.slice(0, 4).join(' | '));
} catch (e) {
  check('run', false, String(e?.stack || e));
} finally {
  await ctx.close().catch(() => {});
  rmSync(work, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('Failed:'); for (const f of failed) console.log(`  - ${f.name}`); exitCode = 1; }
process.exit(exitCode);
