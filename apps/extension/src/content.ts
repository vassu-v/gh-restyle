import { primerVars } from './primer';
import { loadSettings, onSettingsChange } from './storage';

/*
 * Applies the design by setting CSS variables on <html> through the CSSOM.
 * GitHub's Content-Security-Policy doesn't block CSSOM writes, and the static
 * rules in content.css (fonts, small shape tweaks) are injected by the browser.
 */
const root = document.documentElement;
let applied: string[] = [];

function clear() {
  for (const k of applied) root.style.removeProperty(k);
  applied = [];
  root.classList.remove('gitling-on');
}

async function apply() {
  const s = await loadSettings();
  clear();
  if (!s.enabled) return;
  const vars = primerVars(s.design);
  for (const [k, v] of Object.entries(vars)) { root.style.setProperty(k, v, 'important'); applied.push(k); }
  root.classList.add('gitling-on');
}

apply();
onSettingsChange(apply);
// GitHub swaps the <html> attributes on theme changes; keep our class on.
new MutationObserver(() => { if (applied.length && !root.classList.contains('gitling-on')) root.classList.add('gitling-on'); })
  .observe(root, { attributes: true, attributeFilter: ['class'] });
