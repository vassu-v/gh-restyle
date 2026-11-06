import { resolveTokens } from '@gitling/design/src/tokens';
import { presetOf } from './presetOf';
import { ext, loadSettings, onSettingsChange, saveSettings, type Settings } from './storage';

/* The toolbar popup: on/off and a way to the settings page. Everything else lives on the settings page (options.ts). */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let s: Settings;

function render() {
  $<HTMLInputElement>('enabled').checked = s.enabled;
  const c = resolveTokens(s.design).c;
  $('name').textContent = presetOf(s.design)?.name ?? 'Your design';
  $('dots').replaceChildren(...[c.bg, c.el2, c.acc].map((col) => { const i = document.createElement('i'); i.style.background = col; return i; }));
  $('state').textContent = s.enabled ? 'On for github.com' : 'Off: GitHub looks as usual';
}

(async () => {
  s = await loadSettings();
  render();
  onSettingsChange(async () => { s = await loadSettings(); render(); });
  $<HTMLInputElement>('enabled').addEventListener('change', async (e) => {
    s.enabled = (e.target as HTMLInputElement).checked;
    try { await saveSettings(s); } catch { s.enabled = !s.enabled; }
    render();
  });
  $('settings').addEventListener('click', () => { (ext as unknown as { runtime: { openOptionsPage(): void } }).runtime.openOptionsPage(); window.close(); });
})();
