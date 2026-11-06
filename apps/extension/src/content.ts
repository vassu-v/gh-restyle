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
// While Gitling is on, two attributes on <html> remember what it changed, so a fresh copy of this script
// (injected into open tabs after an extension update, see background.ts) can undo the old copy's work:
// GitHub's own mode attributes, and the names of the CSS variables set. Both are removed when it's off.
const ORIG = 'data-gitling-orig';
const VARS = 'data-gitling-vars';
const readJson = <T,>(a: string, fallback: T): T => { try { const v = root.getAttribute(a); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
let original: Record<string, string | null> = readJson(ORIG, Object.fromEntries(MODE_ATTRS.map((a) => [a, root.getAttribute(a)])));
const NUM_CLASSES = ['gitling-num-dot', 'gitling-num-mono', 'gitling-num-sans'];
let applied: string[] = readJson<string[]>(VARS, []);
let wantMode: Record<string, string> | null = null;
let cleanClasses: string[] = [];

function setModeAttrs() {
  if (!wantMode) return;
  for (const [k, v] of Object.entries(wantMode)) if (root.getAttribute(k) !== v) root.setAttribute(k, v);
}

function clear() {
  for (const k of applied) root.style.removeProperty(k);
  applied = [];
  root.classList.remove('gitling-on', ...NUM_CLASSES, ...CLEAN_KEYS.map((k) => `gitling-clean-${k}`));
  wantMode = null;
  cleanClasses = [];
  for (const a of MODE_ATTRS) { const v = original[a]; if (v === null) root.removeAttribute(a); else root.setAttribute(a, v); }
  root.removeAttribute(ORIG); root.removeAttribute(VARS);
  if (!root.getAttribute('style')) root.removeAttribute('style');
  if (!root.getAttribute('class')) root.removeAttribute('class');
}

async function apply() {
  const s = await loadSettings();
  clear();
  if (!s.enabled) return;
  const mode = BACKGROUNDS[s.design.theme.background].mode;
  wantMode = { 'data-color-mode': mode, 'data-light-theme': 'light', 'data-dark-theme': 'dark' };
  // Re-read GitHub's own values: clear() just put them back, and GitHub may have changed them while we were off.
  original = Object.fromEntries(MODE_ATTRS.map((a) => [a, root.getAttribute(a)]));
  root.setAttribute(ORIG, JSON.stringify(original));
  setModeAttrs();
  const vars = primerVars(s.design);
  for (const [k, v] of Object.entries(vars)) { root.style.setProperty(k, v, 'important'); applied.push(k); }
  root.setAttribute(VARS, JSON.stringify(applied));
  root.classList.add('gitling-on');
  // Number style as a class too, so content.css can size the dot-matrix face up (it's unreadable at GitHub's 12px).
  cleanClasses = [`gitling-num-${s.design.theme.numbers}`];
  // Developer mode: each part is a class on <html> that content.css acts on.
  cleanClasses.push(...CLEAN_KEYS.filter((k) => s.clean[k]).map((k) => `gitling-clean-${k}`));
  root.classList.add(...cleanClasses);
}

apply();
onSettingsChange(apply);
// GitHub rewrites <html> attributes on theme changes and some navigations; put ours back.
// After the extension is reloaded or updated, this copy is cut off from settings (no live changes) while a fresh
// copy takes over; it must stop re-adding its own classes, or it would undo the new copy's changes.
const alive = () => { try { return !!(globalThis as unknown as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id; } catch { return false; } };
const watcher = new MutationObserver(() => {
  if (!alive()) { watcher.disconnect(); return; }
  if (!applied.length) return;
  for (const c of ['gitling-on', ...cleanClasses]) if (!root.classList.contains(c)) root.classList.add(c);
  setModeAttrs();
});
watcher.observe(root, { attributes: true, attributeFilter: ['class', ...MODE_ATTRS] });
