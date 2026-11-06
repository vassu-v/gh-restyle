import { readDesignText, type Background } from '@gitling/design';
import { loadSettings, saveSettings, type Settings } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let s: Settings;

function render() {
  $<HTMLInputElement>('enabled').checked = s.enabled;
  for (const b of $('bg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === s.design.theme.background));
  for (const b of $('num').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === s.design.theme.numbers));
}
const msg = (text: string, ok: boolean) => { const m = $('msg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'bad'); };
async function save(): Promise<boolean> {
  try { await saveSettings(s); } catch (e) { msg(`Couldn't save: ${(e as Error).message}`, false); return false; }
  render();
  return true;
}

(async () => {
  s = await loadSettings();
  render();
  $<HTMLInputElement>('enabled').addEventListener('change', (e) => { s.enabled = (e.target as HTMLInputElement).checked; save(); });
  $('bg').addEventListener('click', (e) => { const v = (e.target as HTMLElement).dataset.v as Background | undefined; if (v) { s.design.theme.background = v; save(); } });
  $('num').addEventListener('click', (e) => { const v = (e.target as HTMLElement).dataset.v as Settings['design']['theme']['numbers'] | undefined; if (v) { s.design.theme.numbers = v; save(); } });
  $('apply').addEventListener('click', async () => {
    // Same reader as the app: a design code, a share link, or a .gitling.json design file's text.
    const r = readDesignText($<HTMLTextAreaElement>('code').value);
    if (!r.ok) return msg(r.error, false);
    s.design = r.design; s.enabled = true;
    if (!(await save())) return;
    $<HTMLTextAreaElement>('code').value = '';
    msg('Applied. Open GitHub tabs update right away.', true);
  });
})();
