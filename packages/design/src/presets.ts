import type { Design } from './schema';

/**
 * Curated looks for the Studio gallery. A preset only changes `theme`; the person's tabs, home layout and
 * tiles stay as they are. All presets are Signal-skin variations (see docs/CONTEXT.md § Design taste).
 */
export type Preset = { id: string; name: string; blurb: string; theme: Design['theme'] };

export const PRESETS: Preset[] = [
  { id: 'signal', name: 'Signal', blurb: 'Graphite, dot-matrix numbers. The default.', theme: { accent: '#A8B8FF', background: 'graphite', numbers: 'dot', tiles: 'window', density: 3, textScale: 1 } },
  { id: 'terminal', name: 'Terminal', blurb: 'True black, green, mono everything.', theme: { accent: '#5BD69A', background: 'black', numbers: 'mono', tiles: 'plain', density: 3, textScale: 1 } },
  { id: 'paper', name: 'Paper', blurb: 'Light and printed. Easy in daylight.', theme: { accent: '#4C6EF5', background: 'paper', numbers: 'sans', tiles: 'window', density: 3, textScale: 1 } },
  { id: 'dense', name: 'Dense', blurb: 'Tight rows, small text, more on screen.', theme: { accent: '#7FD3E6', background: 'graphite', numbers: 'mono', tiles: 'plain', density: 1, textScale: 0.9 } },
  { id: 'calm', name: 'Calm', blurb: 'Bigger text, roomy rows, soft pink.', theme: { accent: '#FF9CC8', background: 'graphite', numbers: 'sans', tiles: 'window', density: 4, textScale: 1.12 } },
  { id: 'ink', name: 'Ink', blurb: 'Black and white, nothing else.', theme: { accent: '#ECECEE', background: 'black', numbers: 'dot', tiles: 'window', density: 2, textScale: 1 } },
];

export function applyPreset(design: Design, preset: Preset): Design {
  return { ...design, theme: { ...preset.theme } };
}

/** The preset the design currently matches exactly, if any. */
export function presetOf(design: Design): Preset | undefined {
  const t = design.theme;
  return PRESETS.find((p) => (Object.keys(p.theme) as (keyof Design['theme'])[]).every((k) => String(p.theme[k]).toLowerCase() === String(t[k]).toLowerCase()));
}

/** One line describing a design, for share previews. */
export function describeDesign(d: Design): string {
  const p = presetOf(d);
  const look = p ? p.name : `${d.theme.background[0].toUpperCase()}${d.theme.background.slice(1)} · ${d.theme.numbers} numbers`;
  return `${look} · ${d.nav.tabs.length} tabs · ${d.home.sections.filter((s) => s.visible).length} home sections · ${d.tiles.length} shortcuts`;
}
