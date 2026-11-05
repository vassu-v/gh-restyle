import { decodeDesign, type Background } from '@gitling/design';
import { loadSettings, saveSettings, type Settings } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let s: Settings;

function render() {
  $<HTMLInputElement>('enabled').checked = s.enabled;
  for (const b of $('bg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === s.design.theme.background));
  for (const b of $('num').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === s.design.theme.numbers));
}
const msg = (text: string, ok: boolean) => { const m = $('msg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'bad'); };
/** Studio's main button copies a share link (…/studio?import=GITLING1.…); accept that as well as a bare code. */
function codeFrom(text: string) {
  const raw = text.trim();
  try { const c = new URL(raw).searchParams.get('import'); if (c) return c; } catch { /* not a link */ }
  return raw;
}
async function save() { await saveSettings(s); render(); }

(async () => {
  s = await loadSettings();
  render();
  $<HTMLInputElement>('enabled').addEventListener('change', (e) => { s.enabled = (e.target as HTMLInputElement).checked; save(); });
  $('bg').addEventListener('click', (e) => { const v = (e.target as HTMLElement).dataset.v as Background | undefined; if (v) { s.design.theme.background = v; save(); } });
  $('num').addEventListener('click', (e) => { const v = (e.target as HTMLElement).dataset.v as Settings['design']['theme']['numbers'] | undefined; if (v) { s.design.theme.numbers = v; save(); } });
  $('apply').addEventListener('click', async () => {
    const r = decodeDesign(codeFrom($<HTMLTextAreaElement>('code').value));
    if (!r.ok) return msg(r.error, false);
    s.design = r.design; s.enabled = true; await save();
    $<HTMLTextAreaElement>('code').value = '';
    msg('Applied. Open GitHub tabs update right away.', true);
  });
})();
