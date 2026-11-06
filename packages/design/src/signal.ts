import type { Background, Design } from './schema';

/** Signal skin: Quiet Pro structure + Telemetry instruments. Color only means state; red only for real failures. */

export type Palette = {
  bg: string; el: string; el2: string; line: string; line2: string;
  fg: string; mut: string; dim: string;
  ok: string; bad: string; wait: string; merged: string;
  glass: string; glassBorder: string; onFg: string;
};

export const BACKGROUNDS: Record<Background, { label: string; mode: 'dark' | 'light'; palette: Palette }> = {
  graphite: {
    label: 'Graphite', mode: 'dark',
    palette: {
      bg: '#0E0F11', el: '#16171A', el2: '#1E1F23', line: '#25262B', line2: '#303137',
      fg: '#ECECEE', mut: '#8D8F96', dim: '#5E6067',
      ok: '#5BD69A', bad: '#FF7A5C', wait: '#F2C25B', merged: '#C3A2FF',
      glass: 'rgba(36,37,42,0.78)', glassBorder: 'rgba(255,255,255,0.07)', onFg: '#0E0F11',
    },
  },
  black: {
    label: 'Black', mode: 'dark',
    palette: {
      bg: '#000000', el: '#0E0E10', el2: '#18181B', line: '#1F1F23', line2: '#2A2A2F',
      fg: '#F2F2F3', mut: '#8A8A92', dim: '#55555C',
      ok: '#4FD18F', bad: '#FF6B4A', wait: '#F2C25B', merged: '#C3A2FF',
      glass: 'rgba(28,28,31,0.8)', glassBorder: 'rgba(255,255,255,0.08)', onFg: '#000000',
    },
  },
  paper: {
    label: 'Paper', mode: 'light',
    palette: {
      bg: '#F4F4F2', el: '#FFFFFF', el2: '#ECECE9', line: '#E2E2DE', line2: '#D3D3CE',
      fg: '#16171A', mut: '#62646B', dim: '#9A9CA2',
      ok: '#178A55', bad: '#D2462A', wait: '#A86F00', merged: '#7A4FD0',
      glass: 'rgba(255,255,255,0.8)', glassBorder: 'rgba(0,0,0,0.08)', onFg: '#FFFFFF',
    },
  },
};

export const ACCENTS = ['#A8B8FF', '#5BD69A', '#F2C25B', '#FF9CC8', '#7FD3E6', '#ECECEE'] as const;
export const TINTS = ['#8D8F96', '#F2C25B', '#5BD69A', '#A8B8FF', '#FF9CC8', '#7FD3E6', '#FF7A5C', '#C3A2FF'] as const;

export const DEFAULT_DESIGN: Design = {
  version: 1,
  skin: 'signal',
  theme: { accent: '#A8B8FF', background: 'graphite', numbers: 'dot', tiles: 'window', density: 3, textScale: 1 },
  nav: { tabs: ['home', 'feed', 'inbox', 'repos', 'studio'] },
  home: {
    sections: [
      { id: 'status', visible: true },
      { id: 'shortcuts', visible: true },
      { id: 'needs', visible: true },
      { id: 'feed', visible: false },
      { id: 'inbox', visible: false },
      { id: 'recent', visible: true },
      { id: 'reviews', visible: false },
      { id: 'my-prs', visible: false },
      { id: 'assigned', visible: false },
      { id: 'mentions', visible: false },
      { id: 'starred', visible: false },
      { id: 'checks', visible: false },
    ],
  },
  tiles: [
    { id: 't-review', label: 'Waiting on you', icon: 'eye', tint: '#F2C25B', count: true, size: 'half', target: { type: 'search', q: 'is:open is:pr review-requested:@me archived:false' } },
    { id: 't-repo', label: 'trail-notes', icon: 'book-marked', tint: '#8D8F96', count: false, size: 'half', target: { type: 'repo', repo: 'you/trail-notes', tab: 'overview' } },
    { id: 't-bugs', label: 'label:bug', icon: 'bug', tint: '#8D8F96', count: true, size: 'half', target: { type: 'search', q: 'is:open label:bug involves:@me' } },
    { id: 't-actions', label: 'Actions', icon: 'arrow-up-right', tint: '#8D8F96', count: false, size: 'half', target: { type: 'link', url: 'https://github.com/you/trail-notes/actions' } },
  ],
};
