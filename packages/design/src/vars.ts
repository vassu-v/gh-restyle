/**
 * Theme variables: the exact values the extension writes into github.com (GitHub's own Primer design tokens,
 * like `--bgColor-default` or `--borderRadius-medium`, plus Gitling's `--gitling-*` copies), shown as text the
 * person can edit. The controls fill these in; a line the person changes (any value, any unit) overrides what
 * the controls would give, and travels with the design in codes and files.
 *
 * Only values are ever written, as CSS custom properties on <html> (plus `zoom` and `color-scheme`), so nothing
 * here can run code. Values that could load something from the network (url(), image-set(), @…) or break out
 * of a declaration (; { } < > \) are refused. Plain module (no zod): the content script uses it on every page.
 */

/** At most this many overrides, and this long a value: enough to restyle everything, small enough to share. */
export const VARS_MAX = 150;
export const VAR_VALUE_MAX = 200;

/** Names that may be set: any custom property, plus the two standard properties the extension itself sets. */
export const VAR_NAME = /^(--[A-Za-z0-9_-]{1,80}|zoom|color-scheme)$/;
export const isVarName = (n: string) => VAR_NAME.test(n);

/** Why a value can't be used, or null when it's fine. Never echoes the value back. */
export function varValueProblem(v: string): string | null {
  const s = v.trim();
  if (!s) return 'is empty';
  if (s.length > VAR_VALUE_MAX) return `is longer than ${VAR_VALUE_MAX} characters`;
  if (/[;{}<>\\\n\r]/.test(s)) return 'has a character that isn’t allowed in a value (; { } < > \\)';
  if (/\/\*|\*\//.test(s)) return 'has a comment in it (/* */); put comments on their own line';
  // Anything that could fetch from the network, or old IE script hooks.
  if (/\b(url|image|image-set|-webkit-image-set|cross-fade|element|src|expression)\s*\(|@|javascript:/i.test(s)) return 'can’t load anything (url(), image-set(), @ and the like aren’t allowed)';
  return null;
}

/** A clean map of overrides: valid names and values only, trimmed, at most VARS_MAX. */
export function tidyVars(vars: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!vars || typeof vars !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (Object.keys(out).length >= VARS_MAX) break;
    if (isVarName(k) && typeof v === 'string' && varValueProblem(v) === null) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Groups for the editor, by what a variable changes (first match wins). */
const GROUPS: [string, RegExp][] = [
  ['page', /^(zoom|color-scheme)$/],
  ['type', /fontStack|font/i],
  ['shape', /radius/i],
  ['buttons and controls', /^--(button|control)/],
  ['text and links', /^--fgColor/],
  ['backgrounds', /^--(bgColor|overlay|card|header-bg)/],
  ['borders and lines', /border|underline|divider/i],
  ['gitling copies (used by Gitling’s own rules)', /^--gitling-/],
];
const groupOf = (k: string) => GROUPS.find(([, re]) => re.test(k))?.[0] ?? 'other';

export const VARS_HEADER = [
  '/* What Gitling writes into github.com. Change any value, in any unit (px, rem, em, %, colours, fonts…).',
  '   Add any of GitHub’s own --variables too. Lines you change are yours: the controls above won’t touch',
  '   them. Delete a line of yours to give it back to the controls. */',
];

/**
 * The editor's text: your lines first, then everything the controls set, grouped. `base` is what the controls
 * give (primerVars), `overrides` the person's own values.
 */
export function formatVars(base: Record<string, string>, overrides: Record<string, string> | undefined): string {
  const o = overrides ?? {};
  const lines = [...VARS_HEADER];
  const mine = Object.keys(o);
  if (mine.length) {
    lines.push('', '/* yours */');
    for (const k of mine) lines.push(`${k}: ${o[k]};`);
  }
  const rest = Object.keys(base).filter((k) => !(k in o));
  const byGroup = new Map<string, string[]>();
  for (const k of rest) { const g = groupOf(k); byGroup.set(g, [...(byGroup.get(g) ?? []), k]); }
  for (const [g] of [...GROUPS, ['other']] as [string][]) {
    const ks = byGroup.get(g);
    if (!ks?.length) continue;
    lines.push('', `/* ${g} */`);
    for (const k of ks) lines.push(`${k}: ${base[k]};`);
  }
  return lines.join('\n') + '\n';
}

export type VarsParse = { overrides: Record<string, string>; errors: { line: number; message: string }[] };

/**
 * Reads the editor's text back. A line whose value is what the controls give isn't an override; any other
 * value (or a name the controls don't set) is. Comments and blank lines are ignored. Errors name the line.
 */
export function parseVars(text: string, base: Record<string, string>): VarsParse {
  const overrides: Record<string, string> = {};
  const errors: VarsParse['errors'] = [];
  const lineOf: Record<string, number> = {};
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')); // keep line numbers
  if (/\/\*/.test(src)) errors.push({ line: src.slice(0, src.indexOf('/*')).split('\n').length, message: 'A comment isn’t closed (add */).' });
  const original = text.split('\n');
  src.split('\n').forEach((raw, i) => {
    // A comment inside a value (ur/**/l(…)) is refused: values are plain text, and nothing should hide in them.
    const o = original[i] ?? '';
    const colon = o.indexOf(':');
    const semi = o.indexOf(';', colon);
    if (colon > 0 && /^\s*[-\w]/.test(o) && o.slice(colon, semi > colon ? semi : undefined).includes('/*')) return errors.push({ line: i + 1, message: 'Comments can’t go inside a value. Put them on their own line.' });
    const line = raw.trim().replace(/;\s*$/, '').trim();
    if (!line || line.startsWith('/*')) return;
    const at = line.indexOf(':');
    const n = i + 1;
    if (at < 1) return errors.push({ line: n, message: 'Write it as  --name: value;' });
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (!isVarName(name)) return errors.push({ line: n, message: `${name.slice(0, 60)} isn’t a variable Gitling can set. Use a --name (like --bgColor-default), zoom or color-scheme.` });
    const problem = varValueProblem(value);
    if (problem) return errors.push({ line: n, message: `The value of ${name} ${problem}.` });
    if (base[name] !== undefined && norm(base[name]) === norm(value)) { delete overrides[name]; return; }
    overrides[name] = value; lineOf[name] = n;
  });
  const names = Object.keys(overrides);
  if (names.length > VARS_MAX) errors.push({ line: lineOf[names[VARS_MAX]], message: `Up to ${VARS_MAX} of your own values; this is number ${VARS_MAX + 1}.` });
  return { overrides, errors };
}

const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();

/** What the content script writes: the controls' values with the person's on top. */
export const effectiveVars = (base: Record<string, string>, overrides: Record<string, string> | undefined) => ({ ...base, ...(tidyVars(overrides) ?? {}) });
