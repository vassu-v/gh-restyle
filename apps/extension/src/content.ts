import { BACKGROUNDS } from '@gitling/design/src/signal';
import { primerVars } from './primer';
import { CLEAN_KEYS, loadSettings, onSettingsChange } from './storage';

/*
 * Applies the design in two layers:
 *  1. GitHub's own color mode follows the design (dark or light), so everything we don't override (code syntax
 *     colors, segmented controls, diff colors, …) uses GitHub's palette tuned for that mode. Signed-out GitHub
 *     defaults to light; without this, light-tuned syntax colors landed on our dark backgrounds (stress test).
 *  2. Our CSS variables on <html>, set through the CSSOM (GitHub's Content-Security-Policy allows that).
 * Turning Gitling off restores GitHub's original attributes.
 */
const root = document.documentElement;
const MODE_ATTRS = ['data-color-mode', 'data-light-theme', 'data-dark-theme'] as const;
const original = Object.fromEntries(MODE_ATTRS.map((a) => [a, root.getAttribute(a)]));
let applied: string[] = [];
let wantMode: Record<string, string> | null = null;
let cleanClasses: string[] = [];

function setModeAttrs() {
  if (!wantMode) return;
  for (const [k, v] of Object.entries(wantMode)) if (root.getAttribute(k) !== v) root.setAttribute(k, v);
}

function clear() {
  for (const k of applied) root.style.removeProperty(k);
  applied = [];
  root.classList.remove('gitling-on', ...CLEAN_KEYS.map((k) => `gitling-clean-${k}`));
  wantMode = null;
  cleanClasses = [];
  for (const a of MODE_ATTRS) { const v = original[a]; if (v === null) root.removeAttribute(a); else root.setAttribute(a, v); }
}

async function apply() {
  const s = await loadSettings();
  clear();
  if (!s.enabled) return;
  const mode = BACKGROUNDS[s.design.theme.background].mode;
  wantMode = { 'data-color-mode': mode, 'data-light-theme': 'light', 'data-dark-theme': 'dark' };
  setModeAttrs();
  const vars = primerVars(s.design);
  for (const [k, v] of Object.entries(vars)) { root.style.setProperty(k, v, 'important'); applied.push(k); }
  root.classList.add('gitling-on');
  // Developer mode: each part is a class on <html> that content.css acts on.
  cleanClasses = CLEAN_KEYS.filter((k) => s.clean[k]).map((k) => `gitling-clean-${k}`);
  root.classList.add(...cleanClasses);
}

apply();
onSettingsChange(apply);
// GitHub rewrites <html> attributes on theme changes and some navigations; put ours back.
new MutationObserver(() => {
  if (!applied.length) return;
  for (const c of ['gitling-on', ...cleanClasses]) if (!root.classList.contains(c)) root.classList.add(c);
  setModeAttrs();
}).observe(root, { attributes: true, attributeFilter: ['class', ...MODE_ATTRS] });
