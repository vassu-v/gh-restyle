import {
  ACCENTS, applyPreset, CUSTOM_COLOR_LABELS, CUSTOM_COLORS, CUSTOM_CSS_MAX, CUSTOM_CSS_NOTE, CUSTOM_CSS_NOTICE, CUSTOM_FONT_LABELS, CUSTOM_FONTS, DEFAULT_DESIGN, Design as DesignSchema,
  derivedColor, designFileName, designName, designToFile, encodeDesign, FONT_NAMES, PRESETS, readDesignText, resolveTokens, startCustom, themeWarnings, withCustom, type CustomTheme, type Design,
} from '@gitling/design';
import { presetOf } from './presetOf';
import { fontStacks, radiusOf } from './primer';
import { CLEAN_KEYS, loadCss, loadSettings, onSettingsChange, saveCss, saveSettings, type CustomCss, type Settings } from './storage';

/*
 * The settings page: everything about how Gitling looks on github.com. The toolbar popup only turns it on or off
 * and opens this page; the content script only draws what's saved. All three share one record in
 * chrome.storage.sync (storage.ts), so a change here reaches open GitHub tabs at once.
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let s: Settings;
let css: CustomCss;


/** The page wears the design it edits. */
function paint() {
  const t = resolveTokens(s.design);
  const c = t.c;
  const r = document.documentElement.style;
  const set: Record<string, string> = { '--bg': c.bg, '--el': c.el, '--el2': c.el2, '--line': c.line, '--line2': c.line2, '--fg': c.fg, '--mut': c.mut, '--acc': c.acc, '--acc-soft': c.accSoft, '--on-fg': c.onFg, '--ok': c.ok, '--bad': c.bad,
    '--num': t.numbers === 'dot' ? '"Gitling Doto"' : t.numbers === 'mono' ? '"Gitling Geist Mono"' : '"Gitling Geist"', '--r': `${radiusOf(s.design) + 8}px`, '--font': fontStacks(s.design).body };
  for (const [k, v] of Object.entries(set)) r.setProperty(k, v);
  r.colorScheme = t.mode;
  $('preview').style.fontSize = `${15 * s.design.theme.textScale}px`;
  $('preview').style.fontFamily = fontStacks(s.design).body;
}

function render() {
  const th = s.design.theme;
  $<HTMLInputElement>('enabled').checked = s.enabled;
  const pick = (id: string, v: string) => { for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === v)); };
  pick('bg', th.background); pick('num', th.numbers); pick('tiles', th.tiles);
  pick('accent', ACCENTS.find((a) => a.toLowerCase() === th.accent.toLowerCase()) ?? '');
  $<HTMLInputElement>('accent-custom').value = th.accent.toLowerCase();
  $<HTMLInputElement>('scale').value = String(th.textScale);
  $('scale-out').textContent = `${Math.round(th.textScale * 100)}%`;
  for (const i of $('clean').querySelectorAll<HTMLInputElement>('input[data-k]')) i.checked = s.clean[i.dataset.k as keyof Settings['clean']];
  // The master shows on while any part is on (half-filled when only some are), so it never reads off while
  // GitHub is still being changed; clicking it then turns everything off.
  const on = CLEAN_KEYS.filter((k) => s.clean[k]).length;
  const all = $<HTMLInputElement>('clean-all');
  all.checked = on > 0; all.indeterminate = on > 0 && on < CLEAN_KEYS.length;
  all.setAttribute('aria-checked', on === 0 ? 'false' : on === CLEAN_KEYS.length ? 'true' : 'mixed');
  const cur = presetOf(s.design)?.id;
  for (const b of $('presets').querySelectorAll<HTMLElement>('.preset')) b.setAttribute('aria-pressed', String(b.dataset.v === cur));
  renderCustom();
  paint();
}

/** The Custom theme section: same fields, order and words as the app's Studio (packages/design/src/custom.ts). */
function renderCustom() {
  const c = s.design.theme.custom;
  const on = !!c;
  $('ct-fields').hidden = !on;
  $('ct-remove').hidden = !on;
  $('ct-start').textContent = on ? 'Fill in from current look' : 'Start from current look';
  $('ct-state').textContent = on ? `Your design: ${designName(s.design)}` : '';
  const keep = (id: string, v: string) => { const i = $<HTMLInputElement>(id); if (document.activeElement !== i) i.value = v; };
  keep('ct-name', c?.name ?? ''); keep('ct-author', c?.author ?? '');
  for (const b of $('ct-mode').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === resolveTokens(s.design).mode));
  const warns = themeWarnings(s.design);
  for (const k of CUSTOM_COLORS) {
    const row = $(`ct-c-${k}`);
    const set = c?.colors?.[k];
    const v = (set ?? derivedColor(s.design, k)).toLowerCase();
    row.querySelector<HTMLInputElement>('input')!.value = v;
    row.querySelector('code')!.textContent = set ? v : `${v} (auto)`;
    row.querySelector('.ct-color')!.classList.toggle('unset', !set);
    row.querySelector<HTMLButtonElement>('.reset')!.disabled = !set;
    const w = warns.filter((x) => x.field === k);
    row.querySelector('.warn')!.textContent = w.length ? `${Math.min(...w.map((x) => x.ratio)).toFixed(1)}:1` : '';
    (row.querySelector('.warn') as HTMLElement).hidden = !w.length;
  }
  for (const k of Object.keys(CUSTOM_FONTS) as (keyof typeof CUSTOM_FONTS)[]) {
    const sel = $<HTMLSelectElement>(`ct-f-${k}`);
    sel.value = c?.fonts?.[k] ?? '';
  }
  const r = radiusOf(s.design);
  $<HTMLInputElement>('ct-radius').value = String(c?.radius ?? r);
  $('ct-radius-out').textContent = `${c?.radius ?? r} px${c?.radius === undefined ? ' (auto)' : ''}`;
  $<HTMLButtonElement>('ct-radius-reset').disabled = c?.radius === undefined;
  const ul = $('ct-warnings'); ul.textContent = '';
  for (const w of warns) { const li = document.createElement('li'); li.textContent = w.message; ul.append(li); }
  // Custom CSS
  $<HTMLInputElement>('css-on').checked = css.on && css.accepted;
  if (document.activeElement !== $('css')) $<HTMLTextAreaElement>('css').value = css.css;
  $('css-notice').hidden = !css.css || css.accepted;
}

function buildCustom() {
  const colors = $('ct-colors');
  for (const k of CUSTOM_COLORS) {
    const { label, hint } = CUSTOM_COLOR_LABELS[k];
    const row = document.createElement('div');
    row.className = 'row'; row.id = `ct-c-${k}`;
    row.innerHTML = '<div><span class="l"></span><span class="warn" hidden></span><div class="hint"></div></div><div class="ct-color"><code></code><input type="color"><button class="reset">Reset</button></div>';
    row.querySelector('.l')!.textContent = label;
    row.querySelector('.hint')!.textContent = hint;
    row.querySelector('input')!.setAttribute('aria-label', label);
    row.querySelector('.reset')!.setAttribute('aria-label', `Reset ${label}`);
    row.querySelector('input')!.addEventListener('change', (e) => custom((x) => ({ ...x, colors: { ...x.colors, [k]: (e.target as HTMLInputElement).value.toUpperCase() } })));
    row.querySelector('.reset')!.addEventListener('click', () => custom((x) => ({ ...x, colors: { ...x.colors, [k]: undefined } })));
    colors.append(row);
  }
  const fonts = $('ct-fonts');
  for (const k of Object.keys(CUSTOM_FONTS) as (keyof typeof CUSTOM_FONTS)[]) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<label></label><select class="field"></select>';
    row.querySelector('label')!.textContent = CUSTOM_FONT_LABELS[k];
    row.querySelector('label')!.htmlFor = `ct-f-${k}`;
    const sel = row.querySelector('select')!; sel.id = `ct-f-${k}`;
    for (const v of ['', ...CUSTOM_FONTS[k]]) { const o = document.createElement('option'); o.value = v; o.textContent = v ? FONT_NAMES[v] : 'Auto'; sel.append(o); }
    sel.addEventListener('change', () => custom((x) => ({ ...x, fonts: { ...x.fonts, [k]: sel.value || undefined } })));
    fonts.append(row);
  }
  $('css-note').textContent = CUSTOM_CSS_NOTE;
  $('css-notice-text').textContent = CUSTOM_CSS_NOTICE;
}

/** Change the custom theme; refuses (with the schema's message) anything a design can't hold. */
function custom(fn: (c: CustomTheme) => CustomTheme) {
  const next = withCustom(s.design, fn(s.design.theme.custom ?? {}));
  const ok = DesignSchema.shape.theme.safeParse(next.theme);
  if (!ok.success) { msg(ok.error.issues[0]?.message ?? 'That value isn’t allowed.', false); render(); return Promise.resolve(false); }
  s.design = next;
  return save();
}

async function storeCss(next: CustomCss, note?: string) {
  if (next.css.length > CUSTOM_CSS_MAX) return msg('Custom CSS: up to 20 KB', false);
  css = next;
  try { await saveCss(css); } catch (e) { return msg(`Couldn't save: ${(e as Error).message}`, false); }
  render();
  msg(note ?? 'Saved. Open GitHub tabs update right away.', true);
}

/** The design with this computer's custom CSS in it, for codes and files. */
const exported = (): Design => (css.css ? withCustom(s.design, { ...s.design.theme.custom, css: css.css }) : s.design);

const msg = (text: string, ok: boolean) => { const m = $('msg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'bad'); };
async function save(): Promise<boolean> {
  try { await saveSettings(s); } catch (e) { msg(`Couldn't save: ${(e as Error).message}`, false); return false; }
  render();
  msg('Saved. Open GitHub tabs update right away.', true);
  return true;
}
const theme = (patch: Partial<Design['theme']>) => { s.design = { ...s.design, theme: { ...s.design.theme, ...patch } }; return save(); };
const seg = (id: string, fn: (v: string) => void) => $(id).addEventListener('click', (e) => { const v = (e.target as HTMLElement).closest('button')?.dataset.v; if (v) fn(v); });

function buildPresets() {
  const box = $('presets');
  for (const p of PRESETS) {
    const c = resolveTokens({ ...DEFAULT_DESIGN, theme: p.theme }).c;
    const b = document.createElement('button');
    b.className = 'panel preset'; b.dataset.v = p.id;
    b.innerHTML = '<div class="bar"><span></span><span class="dots"></span></div><div class="body"><b></b><span></span></div>';
    b.querySelector('.bar > span')!.textContent = p.id;
    for (const col of [c.bg, c.el2, c.acc]) { const i = document.createElement('i'); i.style.background = col; b.querySelector('.dots')!.append(i); }
    b.querySelector('b')!.textContent = p.name;
    b.querySelector('.body span')!.textContent = p.blurb;
    b.addEventListener('click', () => { s.design = applyPreset(s.design, p); save().then((ok) => ok && msg(`${p.name} applied.`, true)); });
    box.append(b);
  }
  const acc = $('accent');
  for (const a of ACCENTS) {
    const b = document.createElement('button');
    b.dataset.v = a; b.style.background = a; b.setAttribute('aria-label', `Accent ${a}`);
    acc.insertBefore(b, $('accent-custom'));
  }
}

(async () => {
  [s, css] = await Promise.all([loadSettings(), loadCss()]);
  buildPresets();
  buildCustom();
  render();
  // Another window (or the popup) changed something: show it.
  onSettingsChange(async () => { [s, css] = await Promise.all([loadSettings(), loadCss()]); render(); });

  $<HTMLInputElement>('enabled').addEventListener('change', (e) => { s.enabled = (e.target as HTMLInputElement).checked; save(); });
  $('clean').addEventListener('change', (e) => {
    const i = e.target as HTMLInputElement;
    if (i.id === 'clean-all') { const anyOn = CLEAN_KEYS.some((k) => s.clean[k]); s.clean = Object.fromEntries(CLEAN_KEYS.map((k) => [k, !anyOn])) as Settings['clean']; }
    else if (i.dataset.k) s.clean = { ...s.clean, [i.dataset.k]: i.checked };
    save();
  });
  seg('bg', (v) => theme({ background: v as Design['theme']['background'] }));
  seg('num', (v) => theme({ numbers: v as Design['theme']['numbers'] }));
  seg('tiles', (v) => theme({ tiles: v as Design['theme']['tiles'] }));
  seg('accent', (v) => theme({ accent: v }));
  $<HTMLInputElement>('accent-custom').addEventListener('change', (e) => theme({ accent: (e.target as HTMLInputElement).value.toUpperCase() }));
  $<HTMLInputElement>('scale').addEventListener('change', (e) => theme({ textScale: Number((e.target as HTMLInputElement).value) }));
  $<HTMLInputElement>('scale').addEventListener('input', (e) => { $('scale-out').textContent = `${Math.round(Number((e.target as HTMLInputElement).value) * 100)}%`; });

  // Custom theme
  $('ct-start').addEventListener('click', () => custom(() => startCustom(s.design)));
  $('ct-remove').addEventListener('click', () => custom(() => ({})));
  $<HTMLInputElement>('ct-name').addEventListener('change', (e) => custom((x) => ({ ...x, name: (e.target as HTMLInputElement).value.trim() || undefined })));
  $<HTMLInputElement>('ct-author').addEventListener('change', (e) => custom((x) => ({ ...x, author: (e.target as HTMLInputElement).value.trim() || undefined })));
  seg('ct-mode', (v) => custom((x) => ({ ...x, mode: v as 'dark' | 'light' })));
  $<HTMLInputElement>('ct-radius').addEventListener('input', (e) => { $('ct-radius-out').textContent = `${(e.target as HTMLInputElement).value} px`; });
  $<HTMLInputElement>('ct-radius').addEventListener('change', (e) => custom((x) => ({ ...x, radius: Number((e.target as HTMLInputElement).value) })));
  $('ct-radius-reset').addEventListener('click', () => custom((x) => ({ ...x, radius: undefined })));
  // Custom CSS: CSS you type is yours, so it's accepted; CSS from an import waits for the notice.
  $('css-save').addEventListener('click', () => { const v = $<HTMLTextAreaElement>('css').value; storeCss({ css: v, on: !!v.trim(), accepted: true }, v.trim() ? 'Custom CSS saved. It applies on github.com only.' : 'Custom CSS removed.'); });
  $<HTMLInputElement>('css-on').addEventListener('change', (e) => {
    const want = (e.target as HTMLInputElement).checked;
    if (want && !css.accepted) { $<HTMLInputElement>('css-on').checked = false; $('css-notice').hidden = false; return; }
    storeCss({ ...css, on: want });
  });
  $('css-accept').addEventListener('click', () => storeCss({ ...css, on: true, accepted: true }, 'Custom CSS applied on github.com.'));
  $('css-decline').addEventListener('click', () => storeCss({ ...css, on: false, accepted: false }, 'Custom CSS kept off. Turn it on here whenever you like.'));

  const load = async (text: string, from: string) => {
    // Same reader as the app: a design code, a share link, or a .gitling.json design file.
    const r = readDesignText(text);
    if (!r.ok) return msg(r.error, false);
    const importedCss = r.design.theme.custom?.css ?? '';
    s.design = r.design; s.enabled = true;
    if (!(await save())) return;
    // CSS from someone else's design is stored but never applied until the person confirms the notice.
    if (importedCss) { css = { css: importedCss, on: false, accepted: false }; await saveCss(css); render(); }
    $<HTMLTextAreaElement>('code').value = '';
    msg(`${r.name ? `“${r.name}” applied` : 'Applied'} from ${from}.${r.dropped.length ? ` Left out: ${r.dropped.join(', ')}.` : ''}${importedCss ? ' It has custom CSS: see the notice under Custom CSS.' : ''} Open GitHub tabs update right away.`, true);
  };
  $('apply').addEventListener('click', () => load($<HTMLTextAreaElement>('code').value, 'the code'));
  $('open').addEventListener('click', () => $<HTMLInputElement>('file').click());
  $<HTMLInputElement>('file').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement; const f = input.files?.[0]; input.value = '';
    if (f) await load(await f.text(), f.name);
  });
  $('save').addEventListener('click', () => {
    const name = designName(s.design);
    const url = URL.createObjectURL(new Blob([designToFile(exported(), { name })], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = designFileName(name); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    msg('Saved. Open it in the app (Studio → Share) or on another computer.', true);
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(encodeDesign(exported())); msg('Design code copied. Paste it in the app: Studio → Share.', true); }
    catch { msg("Couldn't copy. Use Save as file instead.", false); }
  });
  $('reset').addEventListener('click', () => { s.design = DEFAULT_DESIGN; save().then((ok) => ok && msg('Back to the default look.', true)); });
})();
