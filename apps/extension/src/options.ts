import { ACCENTS, applyPreset, DEFAULT_DESIGN, designFileName, designToFile, encodeDesign, PRESETS, readDesignText, resolveTokens, type Design } from '@gitling/design';
import { presetOf } from './presetOf';
import { CLEAN_KEYS, loadSettings, onSettingsChange, saveSettings, type Settings } from './storage';

/*
 * The settings page: everything about how Gitling looks on github.com. The toolbar popup only turns it on or off
 * and opens this page; the content script only draws what's saved. All three share one record in
 * chrome.storage.sync (storage.ts), so a change here reaches open GitHub tabs at once.
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let s: Settings;


/** The page wears the design it edits. */
function paint() {
  const t = resolveTokens(s.design);
  const c = t.c;
  const r = document.documentElement.style;
  const set: Record<string, string> = { '--bg': c.bg, '--el': c.el, '--el2': c.el2, '--line': c.line, '--line2': c.line2, '--fg': c.fg, '--mut': c.mut, '--acc': c.acc, '--acc-soft': c.accSoft, '--on-fg': c.onFg, '--ok': c.ok, '--bad': c.bad,
    '--num': t.numbers === 'dot' ? '"Gitling Doto"' : t.numbers === 'mono' ? '"Gitling Geist Mono"' : '"Gitling Geist"', '--r': s.design.theme.tiles === 'plain' ? '22px' : '18px' };
  for (const [k, v] of Object.entries(set)) r.setProperty(k, v);
  r.colorScheme = t.mode;
  $('preview').style.fontSize = `${15 * s.design.theme.textScale}px`;
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
  paint();
}

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
  s = await loadSettings();
  buildPresets();
  render();
  // Another window (or the popup) changed something: show it.
  onSettingsChange(async () => { s = await loadSettings(); render(); });

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

  const load = async (text: string, from: string) => {
    // Same reader as the app: a design code, a share link, or a .gitling.json design file.
    const r = readDesignText(text);
    if (!r.ok) return msg(r.error, false);
    s.design = r.design; s.enabled = true;
    if (!(await save())) return;
    $<HTMLTextAreaElement>('code').value = '';
    msg(`${r.name ? `“${r.name}” applied` : 'Applied'} from ${from}.${r.dropped.length ? ` Left out: ${r.dropped.join(', ')}.` : ''} Open GitHub tabs update right away.`, true);
  };
  $('apply').addEventListener('click', () => load($<HTMLTextAreaElement>('code').value, 'the code'));
  $('open').addEventListener('click', () => $<HTMLInputElement>('file').click());
  $<HTMLInputElement>('file').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement; const f = input.files?.[0]; input.value = '';
    if (f) await load(await f.text(), f.name);
  });
  $('save').addEventListener('click', () => {
    const name = presetOf(s.design)?.name;
    const url = URL.createObjectURL(new Blob([designToFile(s.design, { name })], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = designFileName(name); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    msg('Saved. Open it in the app (Studio → Share) or on another computer.', true);
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(encodeDesign(s.design)); msg('Design code copied. Paste it in the app: Studio → Share.', true); }
    catch { msg("Couldn't copy. Use Save as file instead.", false); }
  });
  $('reset').addEventListener('click', () => { s.design = DEFAULT_DESIGN; save().then((ok) => ok && msg('Back to the default look.', true)); });
})();
