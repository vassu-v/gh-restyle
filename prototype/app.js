/* Gitling — a GitHub client you design yourself. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gitling.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { v == null ? localStorage.removeItem('gitling.' + k) : localStorage.setItem('gitling.' + k, JSON.stringify(v)); } catch (_) {} },
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const icon = (n, cls = '') => `<i data-lucide="${esc(n)}" class="ic ${cls}"></i>`;

  /* ================= THEME ENGINE ================= */
  const FONTS = {
    graphite: { name: 'Grotesk / Plex', display: '"Space Grotesk"', body: '"IBM Plex Sans"', mono: '"IBM Plex Mono"' },
    blueprint: { name: 'Plex Condensed', display: '"IBM Plex Sans Condensed"', body: '"IBM Plex Sans"', mono: '"IBM Plex Mono"' },
    moss: { name: 'Schibsted / JetBrains', display: '"Schibsted Grotesk"', body: '"Schibsted Grotesk"', mono: '"JetBrains Mono"' },
    riso: { name: 'Bricolage / DM', display: '"Bricolage Grotesque"', body: '"DM Sans"', mono: '"DM Mono"' },
    darkroom: { name: 'Fraunces / Plex', display: '"Fraunces"', body: '"IBM Plex Sans"', mono: '"IBM Plex Mono"' },
    tidepool: { name: 'Instrument', display: '"Instrument Serif"', body: '"Instrument Sans"', mono: '"JetBrains Mono"' },
    ledger: { name: 'Newsreader / Public', display: '"Newsreader"', body: '"Public Sans"', mono: '"IBM Plex Mono"' },
  };
  const PRESETS = {
    graphite: { name: 'Graphite', note: 'Neutral, one signal color', font: 'graphite', radius: 12, density: 'default', cards: 'outlined', tabBar: 'pill', pattern: 'none',
      light: { bg: '#F2F3F5', surface: '#FFFFFF', fg: '#15171A', muted: '#5E6570', line: '#DDE0E5', accent: '#E8551A', accent2: '#2F6FEB' },
      dark: { bg: '#0E1013', surface: '#171A1F', fg: '#E8EAED', muted: '#9AA1AC', line: '#2A2F37', accent: '#FF7A45', accent2: '#6EA0FF' } },
    blueprint: { name: 'Blueprint', note: 'Drafting grid, square corners', font: 'blueprint', radius: 3, density: 'compact', cards: 'outlined', tabBar: 'docked', pattern: 'grid',
      light: { bg: '#EAF0F7', surface: '#FFFFFF', fg: '#0B1F3A', muted: '#526583', line: '#CFDAEA', accent: '#1457D9', accent2: '#E0A800' },
      dark: { bg: '#08111F', surface: '#0F1C30', fg: '#E3ECF8', muted: '#8A9CBA', line: '#1E3150', accent: '#6FA3FF', accent2: '#FFD23F' } },
    moss: { name: 'Terminal Moss', note: 'Dense, flat, keyboard energy', font: 'moss', radius: 6, density: 'compact', cards: 'flat', tabBar: 'icons', pattern: 'none',
      light: { bg: '#EEF2EC', surface: '#FAFCF9', fg: '#102016', muted: '#56685B', line: '#D5DED3', accent: '#1E7A3C', accent2: '#8DBF2E' },
      dark: { bg: '#0B0F0C', surface: '#131A15', fg: '#DCE8DF', muted: '#7E8F83', line: '#223026', accent: '#B6F36A', accent2: '#5BE38A' } },
    riso: { name: 'Risograph', note: 'Two inks, soft and round', font: 'riso', radius: 22, density: 'comfy', cards: 'elevated', tabBar: 'pill', pattern: 'dots',
      light: { bg: '#FFF4EC', surface: '#FFFFFF', fg: '#26131B', muted: '#7E5A66', line: '#F1DCD8', accent: '#D92D68', accent2: '#E8A400' },
      dark: { bg: '#1A0E14', surface: '#26161E', fg: '#FFE9F0', muted: '#B38A98', line: '#3A2530', accent: '#FF6FA1', accent2: '#FFD666' } },
    darkroom: { name: 'Darkroom', note: 'Safelight amber, editorial', font: 'darkroom', radius: 8, density: 'default', cards: 'flat', tabBar: 'docked', pattern: 'none',
      light: { bg: '#ECE9E6', surface: '#F9F8F6', fg: '#1C1712', muted: '#6B6156', line: '#DAD4CD', accent: '#B93A0B', accent2: '#7C5E10' },
      dark: { bg: '#110D0A', surface: '#1B1511', fg: '#F2E8D8', muted: '#A3927C', line: '#2E251D', accent: '#FF8A3D', accent2: '#E8C25A' } },
    tidepool: { name: 'Tidepool', note: 'Frosted glass over color', font: 'tidepool', radius: 18, density: 'comfy', cards: 'glass', tabBar: 'pill', pattern: 'glow',
      light: { bg: '#E6F1F0', surface: '#FFFFFF', fg: '#0E2524', muted: '#516C6A', line: '#CFE2E0', accent: '#0E7C7B', accent2: '#E07A5F' },
      dark: { bg: '#071615', surface: '#0F2221', fg: '#D6EEEC', muted: '#84A6A3', line: '#1C3533', accent: '#4FD1C5', accent2: '#FF9F80' } },
    ledger: { name: 'Ledger', note: 'Newsprint, high contrast', font: 'ledger', radius: 0, density: 'default', cards: 'flat', tabBar: 'docked', pattern: 'none',
      light: { bg: '#FAFAF7', surface: '#FFFFFF', fg: '#0A0A0A', muted: '#5F5F5F', line: '#E2E2DC', accent: '#D7263D', accent2: '#0A0A0A' },
      dark: { bg: '#000000', surface: '#111111', fg: '#F5F5F0', muted: '#9A9A9A', line: '#262626', accent: '#FF5A6E', accent2: '#F5F5F0' } },
  };
  const SEM = {
    light: { open: '#1A7F45', closed: '#C62828', merged: '#7A45D0', warn: '#A86400' },
    dark: { open: '#4CC27A', closed: '#FF6B6B', merged: '#B392F0', warn: '#E3B341' },
  };
  const SECTIONS = {
    chips: { name: 'Counters', desc: 'Review requests, assigned, mentions' },
    tiles: { name: 'Shortcuts', desc: 'Your custom tiles' },
    needs: { name: 'Needs you', desc: 'Open work you are involved in' },
    inbox: { name: 'Inbox preview', desc: 'Latest unread notifications' },
    recent: { name: 'Recent repositories', desc: 'Repos you pushed to lately' },
  };
  const TABS = {
    home: { name: 'Home', icon: 'house' }, inbox: { name: 'Inbox', icon: 'inbox' }, repos: { name: 'Repos', icon: 'book-marked' },
    search: { name: 'Search', icon: 'search' }, me: { name: 'Profile', icon: 'circle-user-round' },
  };
  const SWATCHES = ['#E8551A', '#D92D68', '#C62828', '#B7791F', '#1A7F45', '#0E7C7B', '#0EA5E9', '#1457D9', '#4F46E5', '#7A45D0', '#475569', '#111111'];
  const GLYPHS = ['git-pull-request', 'circle-dot', 'git-merge', 'git-branch', 'git-commit-horizontal', 'eye', 'bell', 'at-sign', 'inbox', 'star', 'bookmark', 'flag', 'bug', 'rocket', 'zap', 'flame', 'shield', 'package', 'tag', 'book-open', 'file-code', 'folder', 'terminal', 'code', 'play', 'list-checks', 'circle-check', 'clock', 'calendar', 'users', 'user', 'globe', 'link', 'search', 'heart', 'coffee', 'sparkles', 'compass', 'map', 'layers', 'box', 'cpu', 'database', 'cloud', 'lock', 'key-round', 'message-square', 'activity', 'hash', 'trophy'];

  const DEFAULT_TILES = [
    { id: 't1', label: 'Review requests', icon: 'eye', color: '#E8551A', style: 'solid', size: 1, badge: true, target: { type: 'search', q: 'is:open is:pr review-requested:@me archived:false' } },
    { id: 't2', label: 'Assigned to me', icon: 'circle-dot', color: '#1A7F45', style: 'soft', size: 1, badge: true, target: { type: 'search', q: 'is:open assignee:@me archived:false' } },
    { id: 't3', label: 'trail-notes pull requests', icon: 'git-pull-request', color: '#1457D9', style: 'soft', size: 2, badge: false, target: { type: 'repo', repo: 'you/trail-notes', tab: 'prs' } },
    { id: 't4', label: 'Mentions', icon: 'at-sign', color: '#7A45D0', style: 'outline', size: 1, badge: false, target: { type: 'inbox', filter: 'mention' } },
    { id: 't5', label: 'Search code', icon: 'emoji:🔎', color: '#475569', style: 'soft', size: 1, badge: false, target: { type: 'ask', dest: 'url', template: 'https://github.com/search?type=code&q={query}', prompt: 'Search code for…' } },
  ];
  const DEFAULT_T = {
    preset: 'graphite', mode: 'auto', accent: null, font: null, radius: null, density: null, cards: null, tabBar: null, pattern: null,
    scale: 1, iconWeight: 1.75, tabs: ['home', 'inbox', 'repos', 'search'],
    sections: [{ id: 'chips', on: true }, { id: 'tiles', on: true }, { id: 'needs', on: true }, { id: 'inbox', on: true }, { id: 'recent', on: true }],
    tiles: DEFAULT_TILES,
  };
  let T = Object.assign(clone(DEFAULT_T), store.get('design', {}));
  const history = [];
  function commit(mut) { history.push(JSON.stringify(T)); if (history.length > 30) history.shift(); mut(T); store.set('design', T); applyTheme(); }
  function undo() { if (!history.length) return; T = JSON.parse(history.pop()); store.set('design', T); applyTheme(); }

  const hx = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const toHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const lum = (h) => { const c = hx(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const inkOn = (c) => (contrast(c, '#FFFFFF') >= contrast(c, '#111111') ? '#FFFFFF' : '#111111');
  const fitContrast = (c, bg, min) => { let out = c, t = 0; const toward = lum(bg) < 0.2 ? '#FFFFFF' : '#000000'; while (contrast(out, bg) < min && t < 0.9) { t += 0.08; out = mix(c, toward, t); } return out; };

  const eff = (k) => (T[k] ?? PRESETS[T.preset][k]);
  function mode() {
    if (T.mode !== 'auto') return T.mode;
    const a = document.documentElement.getAttribute('data-theme');
    if (a === 'dark' || a === 'light') return a;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() {
    const P = PRESETS[T.preset] || PRESETS.graphite; const m = mode(); const pal = P[m]; const sem = SEM[m];
    const accent = T.accent ? fitContrast(T.accent, pal.surface, 3.2) : pal.accent;
    const F = FONTS[eff('font')] || FONTS.graphite;
    const pad = { compact: 10, default: 14, comfy: 18 }[eff('density')] || 14;
    const v = {
      '--bg': pal.bg, '--surface': pal.surface, '--fg': pal.fg, '--muted': pal.muted, '--line': pal.line,
      '--accent': accent, '--on-accent': inkOn(accent), '--accent2': pal.accent2, '--on-accent2': inkOn(pal.accent2),
      '--soft': mix(pal.surface, accent, m === 'dark' ? 0.18 : 0.1), '--raised': m === 'dark' ? mix(pal.surface, '#FFFFFF', 0.05) : pal.surface,
      '--open': sem.open, '--closed': sem.closed, '--merged': sem.merged, '--warn': sem.warn,
      '--add': mix(pal.surface, sem.open, m === 'dark' ? 0.2 : 0.13), '--del': mix(pal.surface, sem.closed, m === 'dark' ? 0.2 : 0.12),
      '--grid': mix(pal.bg, accent, 0.09),
      '--r': eff('radius') + 'px', '--r-sm': Math.min(eff('radius'), 10) + 'px', '--pad': pad + 'px', '--fs': T.scale,
      '--f-display': F.display + ', ui-sans-serif, system-ui, sans-serif', '--f-body': F.body + ', ui-sans-serif, system-ui, sans-serif',
      '--f-mono': F.mono + ', ui-monospace, SFMono-Regular, Menlo, monospace',
    };
    const root = document.documentElement;
    for (const k in v) root.style.setProperty(k, v[k]);
    root.style.colorScheme = m;
    root.dataset.cards = eff('cards'); root.dataset.tabbar = eff('tabBar'); root.dataset.pattern = eff('pattern'); root.dataset.mode = m;
    root.dataset.density = eff('density');
    const meta = $('meta[name="theme-color"]'); if (meta) meta.content = pal.bg;
    renderTabbar();
    if (S.studioOpen) renderStudio();
    paintIcons();
  }
  function paintIcons(root) {
    if (!window.lucide) return;
    try { window.lucide.createIcons({ attrs: { 'stroke-width': T.iconWeight }, nameAttr: 'data-lucide' }); } catch (_) {}
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => T.mode === 'auto' && applyTheme());
  new MutationObserver(() => T.mode === 'auto' && applyTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ================= SESSION / API ================= */
  const S = { token: store.get('token', null), demo: true, me: null, tab: 'home', stacks: {}, editing: false, studioOpen: false, studioTab: 'presets', unread: null, wrap: false, viewed: {}, cache: {}, seq: 0 };
  S.demo = !S.token;
  const api = (path, o) => GH.request(path, o, S);
  const FULL = 'application/vnd.github.full+json';
  async function getMe() { if (!S.me) S.me = await api('/user'); return S.me; }
  const meQ = (q) => q.replace(/@me\b/g, S.me ? S.me.login : '@me');
  async function cached(key, fn, ttl = 120e3) {
    const c = S.cache[key]; if (c && Date.now() - c.t < ttl) return c.v;
    const v = await fn(); S.cache[key] = { v, t: Date.now() }; return v;
  }
  const bust = () => { S.cache = {}; };

  /* ================= FORMAT HELPERS ================= */
  function rel(t) {
    const s = (Date.now() - new Date(t)) / 1000;
    if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: s > 86400 * 330 ? 'numeric' : undefined });
  }
  function dayGroup(t) {
    const d = new Date(t), n = new Date(); const start = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    if (d >= start) return 'Today'; if (d >= start - 86400e3) return 'Yesterday'; if (d >= start - 6 * 86400e3) return 'This week'; return 'Earlier';
  }
  const k = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));
  const LANG = { TypeScript: '#3178c6', JavaScript: '#e6c62f', Rust: '#dea584', Go: '#00add8', Python: '#3572a5', Shell: '#89e051', 'C++': '#f34b7d', C: '#555555', Swift: '#f05138', Kotlin: '#a97bff', Java: '#b07219', Ruby: '#cc342d', Astro: '#ff5a03', HTML: '#e34c26', CSS: '#663399', Dart: '#00b4ab', Vue: '#41b883', Svelte: '#ff3e00' };
  const repoOf = (it) => (it.repository_url || '').split('/repos/')[1] || '';
  function avatar(user, size = 28) {
    const login = (user && user.login) || '?';
    const hue = [...login].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    const fall = `<span class="av av-fb" style="--s:${size}px;--h:${hue}">${esc(login[0].toUpperCase())}</span>`;
    if (!user || !user.avatar_url || S.demo) return fall;
    return `<img class="av" style="--s:${size}px" src="${esc(user.avatar_url)}&s=${size * 2}" alt="" loading="lazy" onerror="this.outerHTML='${fall.replace(/"/g, '&quot;').replace(/'/g, '')}'">`;
  }
  function stateOf(it, pr) {
    const isPr = !!(it.pull_request || pr);
    const merged = pr ? pr.merged || pr.merged_at : it.pull_request && it.pull_request.merged_at;
    if (isPr) {
      if (merged) return { k: 'merged', label: 'Merged', icon: 'git-merge' };
      if (it.state === 'closed') return { k: 'closed', label: 'Closed', icon: 'git-pull-request-closed' };
      if ((pr && pr.draft) || it.draft) return { k: 'draft', label: 'Draft', icon: 'git-pull-request-draft' };
      return { k: 'open', label: 'Open', icon: 'git-pull-request' };
    }
    if (it.state === 'closed') return { k: 'merged', label: 'Closed', icon: 'circle-check' };
    return { k: 'open', label: 'Open', icon: 'circle-dot' };
  }
  const pill = (st) => `<span class="pill ${st.k}">${icon(st.icon)}${esc(st.label)}</span>`;
  const nav = (o) => `data-nav="${esc(JSON.stringify(o))}"`;
  const labels = (ls) => (ls || []).slice(0, 3).map((l) => `<span class="lbl" style="--lc:#${esc(l.color || '888')}">${esc(l.name)}</span>`).join('');

  function issueRow(it, showRepo = true) {
    const repo = repoOf(it); const [o, r] = repo.split('/'); const st = stateOf(it);
    return `<a class="row" ${nav({ v: 'issue', o, r, n: it.number })}>
      <span class="row-ic st-${st.k}">${icon(st.icon)}</span>
      <span class="row-main"><span class="row-t">${esc(it.title)}</span>
        <span class="meta">${showRepo ? esc(repo) + ' ' : ''}#${it.number} · ${rel(it.updated_at)}${it.user ? ' · ' + esc(it.user.login) : ''}</span>
        ${it.labels && it.labels.length ? `<span class="lbls">${labels(it.labels)}</span>` : ''}</span>
      <span class="row-end">${it.comments ? `<span class="cmt">${icon('message-square')}${it.comments}</span>` : ''}</span></a>`;
  }
  function repoRow(r) {
    return `<a class="row" ${nav({ v: 'repo', o: r.owner.login, r: r.name })}>
      <span class="row-ic">${icon(r.private ? 'lock' : 'book-marked')}</span>
      <span class="row-main"><span class="row-t"><span class="dim">${esc(r.owner.login)} /</span> ${esc(r.name)}</span>
      ${r.description ? `<span class="row-d">${esc(r.description)}</span>` : ''}
      <span class="meta">${r.language ? `<span class="ld" style="--lc:${LANG[r.language] || 'var(--muted)'}"></span>${esc(r.language)} · ` : ''}★ ${k(r.stargazers_count)} · ${rel(r.pushed_at || r.updated_at)}</span></span>
      <span class="row-end">${icon('chevron-right', 'chev')}</span></a>`;
  }
  const group = (rows, empty = 'Nothing here.') => rows.length ? `<div class="group">${rows.join('')}</div>` : `<div class="empty"><span class="meta">✓ 0 items</span><p>${esc(empty)}</p></div>`;
  const head = (t, extra = '') => `<div class="sec-h"><h2>${esc(t)}</h2>${extra}</div>`;
  const seg = (name, opts, cur) => `<div class="seg" role="tablist">${opts.map(([v, l]) => `<button role="tab" aria-selected="${v === cur}" data-act="${name}" data-val="${esc(v)}">${l}</button>`).join('')}</div>`;

  function renderDiff(files) {
    return files.map((f, i) => {
      const id = (f.sha || '') + f.filename; const viewed = !!S.viewed[id];
      const parts = f.filename.split('/'); const base = parts.pop();
      let oldN = 0, newN = 0; let body = '';
      if (f.patch) {
        const rows = f.patch.split('\n').map((ln) => {
          if (ln.startsWith('@@')) { const m = ln.match(/-(\d+)(?:,\d+)? \+(\d+)/); if (m) { oldN = +m[1]; newN = +m[2]; } return `<tr class="hk"><td colspan="3">${esc(ln)}</td></tr>`; }
          const c = ln[0]; let cls = 'ctx', a = '', b = '';
          if (c === '+') { cls = 'add'; b = newN++; } else if (c === '-') { cls = 'del'; a = oldN++; } else { a = oldN++; b = newN++; }
          return `<tr class="${cls}"><td class="ln">${a}</td><td class="ln">${b}</td><td class="cd">${esc(ln.slice(1)) || ' '}</td></tr>`;
        }).join('');
        body = `<div class="code-scroll"><table class="diff">${rows}</table></div>`;
      } else body = `<p class="pad muted">No text diff for this file (binary or too large).</p>`;
      return `<details class="file card" ${viewed ? '' : 'open'}><summary>${icon('chevron-right', 'chev')}<span class="fname"><span class="dim">${esc(parts.join('/'))}${parts.length ? '/' : ''}</span>${esc(base)}</span>
        <span class="delta"><b class="plus">+${f.additions}</b> <b class="minus">−${f.deletions}</b></span>
        <label class="viewed" data-stop><input type="checkbox" data-act="viewed" data-val="${esc(id)}" ${viewed ? 'checked' : ''}> Viewed</label></summary>${body}</details>`;
    }).join('');
  }

  /* ================= VIEWS ================= */
  const V = {};
  const skeleton = () => `<div class="skel">${'<div class="sk"></div>'.repeat(5)}</div>`;

  V.home = async () => {
    const me = await getMe();
    const h = new Date().getHours(); const greet = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    let out = `<header class="hero"><div><span class="eyebrow">${esc(date)}</span><h1 class="big">${greet}, ${esc(me.name ? me.name.split(' ')[0] : me.login)}</h1></div>
      <button class="av-btn" data-act="tab" data-val="me" aria-label="Profile">${avatar(me, 40)}</button></header>`;
    if (S.demo) out += `<div class="banner card"><div><b>You're looking at sample data.</b><p>Connect your GitHub account to see your own repos, inbox and pull requests.</p></div><button class="btn primary" data-act="tab" data-val="me">Connect</button></div>`;
    if (S.editing) return { title: '', html: out + homeEditor(), after: wireHomeEditor, big: true };
    const sections = T.sections.filter((s) => s.on);
    const parts = await Promise.all(sections.map((s) => homeSection(s.id).catch((e) => `<div class="err-inline">${esc(SECTIONS[s.id].name)}: ${esc(e.message)}</div>`)));
    out += parts.join('');
    out += `<div class="home-foot"><button class="btn ghost" data-act="edit-home">${icon('layout-list')}Edit home</button><button class="btn ghost" data-act="studio">${icon('palette')}Open Studio</button></div>`;
    return { title: '', html: out, big: true, after: () => { loadTileBadges(); wireLongPress(); } };
  };

  async function homeSection(id) {
    const me = await getMe();
    if (id === 'chips') {
      const defs = [['Review requests', 'is:open is:pr review-requested:@me archived:false', 'eye'], ['Assigned', 'is:open assignee:@me archived:false', 'circle-dot'], ['Mentions', 'is:open mentions:@me archived:false', 'at-sign'], ['Your PRs', 'is:open is:pr author:@me archived:false', 'git-pull-request']];
      const counts = await Promise.all(defs.map(([, q]) => cached('c:' + q, () => api('/search/issues?per_page=1&q=' + enc(meQ(q)))).then((r) => r.total_count).catch(() => '–')));
      return `<div class="chips-row">${defs.map(([l, q, ic], i) => `<button class="count-chip" ${nav({ v: 'query', q, title: l })}>${icon(ic)}<b>${counts[i]}</b><span>${esc(l)}</span></button>`).join('')}</div>`;
    }
    if (id === 'tiles') return head('Shortcuts', `<button class="link" data-act="studio" data-val="tiles">Edit</button>`) + tilesGrid();
    if (id === 'needs') {
      const r = await cached('needs', () => api('/search/issues?sort=updated&per_page=5&q=' + enc(`is:open involves:${me.login} archived:false`)));
      return head('Needs you', `<button class="link" ${nav({ v: 'query', q: 'is:open involves:@me archived:false', title: 'Involves you' })}>See all</button>`) + group(r.items.map((i) => issueRow(i)), 'Nothing is waiting on you.');
    }
    if (id === 'inbox') {
      const n = await cached('notif:false', () => api('/notifications?per_page=50'), 30e3); S.unread = n.length; renderTabbar();
      return head('Inbox', `<button class="link" data-act="tab" data-val="inbox">${n.length ? n.length + ' unread' : 'Open'}</button>`) + group(n.slice(0, 3).map((x) => notifRow(x, false)), 'Inbox zero. Nice.');
    }
    if (id === 'recent') {
      const repos = await cached('recent', () => api('/user/repos?sort=pushed&per_page=6'));
      return head('Recent repositories', `<button class="link" data-act="tab" data-val="repos">All</button>`) + `<div class="repo-grid">${repos.map((r) => `<a class="repo-card card" ${nav({ v: 'repo', o: r.owner.login, r: r.name })}>
        <span class="meta">${esc(r.owner.login)}</span><b>${esc(r.name)}</b><span class="meta">${r.language ? `<span class="ld" style="--lc:${LANG[r.language] || 'var(--muted)'}"></span>${esc(r.language)}` : ''} ★${k(r.stargazers_count)}</span></a>`).join('')}</div>`;
    }
    return '';
  }

  function homeEditor() {
    const row = (s) => `<div class="edit-row card" data-key="${s.id}">
      <button class="icon-btn" data-act="sec-toggle" data-val="${s.id}" aria-label="${s.on ? 'Hide' : 'Show'} ${esc(SECTIONS[s.id].name)}">${icon(s.on ? 'eye' : 'eye-off')}</button>
      <span class="grow"><b>${esc(SECTIONS[s.id].name)}</b><span class="meta">${esc(SECTIONS[s.id].desc)}</span></span>
      <button class="icon-btn" data-act="sec-move" data-val="${s.id}:-1" aria-label="Move up">${icon('arrow-up')}</button>
      <button class="icon-btn" data-act="sec-move" data-val="${s.id}:1" aria-label="Move down">${icon('arrow-down')}</button>
      <span class="grip" data-grip aria-hidden="true">${icon('grip-vertical')}</span></div>`;
    const on = T.sections.filter((s) => s.on), off = T.sections.filter((s) => !s.on);
    return `<div class="edit-bar card"><span><b>Editing home</b><span class="meta">Drag to reorder · eye to hide</span></span><button class="btn primary" data-act="edit-done">Done</button></div>
      <div class="edit-list" id="secs">${on.map(row).join('')}</div>
      ${off.length ? `<div class="sec-h"><h2>Hidden</h2></div><div class="edit-list hidden-list">${off.map(row).join('')}</div>` : ''}`;
  }
  function wireHomeEditor(root) {
    sortable($('#secs', root), (keys) => commit((t) => { const hidden = t.sections.filter((s) => !s.on); t.sections = keys.map((id) => t.sections.find((s) => s.id === id)).concat(hidden); }));
  }

  /* ---- tiles ---- */
  function tileHTML(t, opts = {}) {
    const c = t.color || '#475569'; const solidInk = inkOn(c);
    let glyph;
    if ((t.icon || '').startsWith('emoji:')) glyph = `<span class="emo">${esc(t.icon.slice(6))}</span>`;
    else if ((t.icon || '').startsWith('mono:')) glyph = `<span class="mono-g">${esc(t.icon.slice(5).slice(0, 2))}</span>`;
    else glyph = icon(t.icon || 'star');
    const inner = `<span class="tile-g">${glyph}</span><span class="tile-l">${esc(t.label || 'Untitled')}</span>${t.badge ? `<span class="tile-b" data-badge="${esc(t.id)}">·</span>` : ''}`;
    const style = `--c:${c};--tc:${solidInk}`;
    const cls = `tile ${t.style || 'soft'} ${t.size === 2 ? 'w2' : ''}`;
    if (opts.preview) return `<div class="${cls}" style="${style}">${inner}</div>`;
    const tg = t.target || {};
    if (tg.type === 'url') return `<a class="${cls}" style="${style}" href="${esc(safeUrl(tg.url))}" target="_blank" rel="noopener" data-tile="${esc(t.id)}">${inner}</a>`;
    return `<button class="${cls}" style="${style}" data-act="tile" data-val="${esc(t.id)}" data-tile="${esc(t.id)}">${inner}</button>`;
  }
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : 'https://' + String(u || 'github.com').replace(/^[a-z]+:/i, ''));
  function tilesGrid() {
    return `<div class="tiles">${T.tiles.map((t) => tileHTML(t)).join('')}<button class="tile add" data-act="tile-new">${icon('plus')}<span class="tile-l">New tile</span></button></div>`;
  }
  async function loadTileBadges() {
    for (const t of T.tiles) {
      if (!t.badge) continue; const el = $(`[data-badge="${CSS.escape(t.id)}"]`); if (!el) continue;
      try {
        const tg = t.target; let n = '';
        if (tg.type === 'search') n = (await cached('c:' + tg.q, () => api('/search/issues?per_page=1&q=' + enc(meQ(tg.q))))).total_count;
        else if (tg.type === 'inbox') n = (await cached('notif:false', () => api('/notifications?per_page=50'), 30e3)).filter((x) => !tg.filter || tg.filter === 'all' || x.reason === tg.filter).length;
        else if (tg.type === 'repo') { const r = await cached('repo:' + tg.repo, () => api('/repos/' + tg.repo)); n = r.open_issues_count; }
        el.textContent = n;
      } catch (_) { el.textContent = '–'; }
    }
  }
  function openTile(id) {
    const t = T.tiles.find((x) => x.id === id); if (!t) return; const tg = t.target || {};
    if (tg.type === 'search') return push({ v: 'query', q: tg.q, title: t.label });
    if (tg.type === 'repo') { const [o, r] = (tg.repo || '').split('/'); if (!o || !r) return toast('This tile needs a repository like owner/name.'); const m = { issues: { v: 'issues', kind: 'issue' }, prs: { v: 'issues', kind: 'pr' }, code: { v: 'code', path: '' }, commits: { v: 'commits' } }[tg.tab] || { v: 'repo' }; return push({ ...m, o, r }); }
    if (tg.type === 'user') return push({ v: 'user', u: tg.user });
    if (tg.type === 'file') { const [o, r] = (tg.repo || '').split('/'); return push({ v: 'code', o, r, path: tg.path || '' }); }
    if (tg.type === 'inbox') { S.inboxFilter = tg.filter || 'all'; return switchTab('inbox'); }
    if (tg.type === 'ask') return askSheet(t);
  }
  function wireLongPress() {
    $$('[data-tile]').forEach((el) => {
      let timer;
      el.addEventListener('pointerdown', () => { timer = setTimeout(() => { el.dataset.long = '1'; navigator.vibrate && navigator.vibrate(10); push({ v: 'tile', id: el.dataset.tile }); }, 550); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, () => clearTimeout(timer)));
      el.addEventListener('click', (e) => { if (el.dataset.long) { e.preventDefault(); e.stopPropagation(); delete el.dataset.long; } }, true);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  /* ---- inbox ---- */
  const REASONS = { all: 'All', mention: 'Mentions', review_requested: 'Review', assign: 'Assigned', author: 'Yours', comment: 'Comments', ci_activity: 'CI' };
  const TYPE_ICON = { PullRequest: 'git-pull-request', Issue: 'circle-dot', Release: 'tag', CheckSuite: 'circle-alert', Discussion: 'messages-square', Commit: 'git-commit-horizontal', RepositoryVulnerabilityAlert: 'shield-alert' };
  function notifRow(n, swipe = true) {
    const ic = TYPE_ICON[n.subject.type] || 'bell';
    return `<div class="swipe" data-nid="${esc(n.id)}">${swipe ? `<div class="swipe-bg"><span class="sb-l">${icon('check')}Done</span><span class="sb-r">Read${icon('mail-open')}</span></div>` : ''}
      <a class="row ${n.unread ? 'unread' : ''}" data-act="notif" data-val="${esc(n.id)}">
      <span class="row-ic">${icon(ic)}</span>
      <span class="row-main"><span class="meta">${esc(n.repository.full_name)}</span><span class="row-t">${esc(n.subject.title)}</span>
      <span class="meta">${esc((REASONS[n.reason] || n.reason || '').replace(/_/g, ' '))} · ${rel(n.updated_at)}</span></span>
      <span class="row-end">${n.unread ? '<span class="dot"></span>' : ''}</span></a></div>`;
  }
  V.inbox = async (cur) => {
    const all = !!S.inboxAll; const f = S.inboxFilter || 'all';
    const list = await cached('notif:' + all, () => api('/notifications?per_page=50' + (all ? '&all=true' : '')), 30e3);
    S.notifs = list; if (!all) { S.unread = list.length; renderTabbar(); }
    const shown = list.filter((n) => f === 'all' || n.reason === f).filter((n) => !(S.doneIds || new Set()).has(n.id));
    const groups = {}; shown.forEach((n) => (groups[dayGroup(n.updated_at)] = groups[dayGroup(n.updated_at)] || []).push(n));
    let html = `<div class="filters">${Object.entries(REASONS).map(([key, l]) => `<button class="fchip" aria-pressed="${key === f}" data-act="inbox-filter" data-val="${key}">${l}</button>`).join('')}</div>
      <div class="inbox-bar">${seg('inbox-all', [['0', 'Unread'], ['1', 'All']], all ? '1' : '0')}<button class="link" data-act="mark-all">Mark all read</button></div>
      <p class="hint meta">Swipe right for done · swipe left to mark read</p>`;
    if (!shown.length) html += `<div class="empty big-empty"><span class="meta">✓ 0 ${all ? 'notifications' : 'unread'}</span><p>${f === 'all' ? 'You are all caught up.' : 'Nothing in this filter.'}</p>${all ? '' : '<button class="link" data-act="inbox-all" data-val="1">View all</button>'}</div>`;
    for (const g of ['Today', 'Yesterday', 'This week', 'Earlier']) if (groups[g]) html += `<div class="day-h">${g}</div><div class="group">${groups[g].map((n) => notifRow(n)).join('')}</div>`;
    return { title: 'Inbox', html, big: true, after: wireSwipes };
  };
  function wireSwipes(root) {
    $$('.swipe', root).forEach((sw) => {
      const row = $('.row', sw); let x0, y0, dx = 0, active = false, decided = false;
      row.addEventListener('pointerdown', (e) => { if (e.button) return; x0 = e.clientX; y0 = e.clientY; dx = 0; active = true; decided = false; row.style.transition = 'none'; });
      row.addEventListener('pointermove', (e) => {
        if (!active) return; const ddx = e.clientX - x0, ddy = e.clientY - y0;
        if (!decided) { if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return; decided = true; if (Math.abs(ddy) > Math.abs(ddx)) { active = false; return; } row.setPointerCapture(e.pointerId); }
        dx = ddx; row.style.transform = `translateX(${dx}px)`; sw.dataset.dir = dx > 0 ? 'r' : 'l';
        const pass = Math.abs(dx) > sw.offsetWidth * 0.35; if (pass !== (sw.dataset.pass === '1')) { sw.dataset.pass = pass ? '1' : ''; pass && navigator.vibrate && navigator.vibrate(8); }
      });
      const end = () => {
        if (!active) return; active = false; row.style.transition = '';
        if (Math.abs(dx) > 6) { row.dataset.swiped = '1'; setTimeout(() => delete row.dataset.swiped, 50); }
        if (Math.abs(dx) > sw.offsetWidth * 0.35) { row.style.transform = `translateX(${dx > 0 ? '110%' : '-110%'})`; setTimeout(() => triage(sw.dataset.nid, dx > 0 ? 'done' : 'read'), 180); }
        else row.style.transform = '';
      };
      row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
    });
  }
  function triage(id, kind) {
    S.doneIds = S.doneIds || new Set(); const n = (S.notifs || []).find((x) => x.id === id); if (!n) return;
    const prevUnread = n.unread;
    if (kind === 'done') S.doneIds.add(id); else n.unread = false;
    S.unread = Math.max(0, (S.unread || 0) - (prevUnread ? 1 : 0)); renderTabbar(); render(true);
    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      try { await api('/notifications/threads/' + id, { method: kind === 'done' ? 'DELETE' : 'PATCH' }); } catch (e) { toast(e.message); }
      delete S.cache['notif:false'];
    }, 4000);
    toast(kind === 'done' ? 'Marked done' : 'Marked read', 'Undo', () => { undone = true; clearTimeout(timer); S.doneIds.delete(id); n.unread = prevUnread; S.unread = (S.unread || 0) + (prevUnread ? 1 : 0); renderTabbar(); render(true); });
  }

  /* ---- repos / search / profile ---- */
  V.repos = async () => {
    const mode = S.repoSeg || 'mine'; const sort = S.repoSort || 'pushed';
    const list = await cached('repos:' + mode, () => api(mode === 'mine' ? '/user/repos?per_page=100&sort=pushed' : '/user/starred?per_page=100'));
    const q = (S.repoFilter || '').toLowerCase();
    let items = list.filter((r) => !q || (r.full_name + ' ' + (r.description || '')).toLowerCase().includes(q));
    items = items.slice().sort((a, b) => sort === 'stars' ? b.stargazers_count - a.stargazers_count : sort === 'name' ? a.name.localeCompare(b.name) : new Date(b.pushed_at) - new Date(a.pushed_at));
    return { title: 'Repositories', big: true, html: `${seg('repo-seg', [['mine', 'Yours'], ['starred', 'Starred']], mode)}
      <div class="toolrow"><label class="field grow">${icon('search')}<input id="repo-filter" type="search" placeholder="Filter repositories" value="${esc(S.repoFilter || '')}" autocomplete="off"></label>
      <select id="repo-sort" class="select" aria-label="Sort">${[['pushed', 'Recent'], ['stars', 'Stars'], ['name', 'Name']].map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${group(items.map(repoRow), q ? 'No repositories match that filter.' : 'No repositories yet.')}`,
      after: (root) => {
        const inp = $('#repo-filter', root); inp.addEventListener('input', debounce(() => { S.repoFilter = inp.value; render(true).then(() => { const i = $('#repo-filter'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250));
        $('#repo-sort', root).addEventListener('change', (e) => { S.repoSort = e.target.value; render(true); });
      } };
  };
  V.search = async () => {
    const s = S.search || { q: '', kind: 'repositories' }; const recent = store.get('recent-searches', []);
    let results = '';
    if (s.q) {
      const ep = s.kind === 'users' ? 'users' : s.kind === 'repositories' ? 'repositories' : 'issues';
      const q = s.kind === 'issues' ? s.q + ' is:issue' : s.kind === 'prs' ? s.q + ' is:pr' : s.q;
      const r = await api(`/search/${ep}?per_page=30&q=${enc(q)}`);
      const rows = r.items.map((x) => ep === 'repositories' ? repoRow(x) : ep === 'users' ? `<a class="row" ${nav({ v: 'user', u: x.login })}><span class="row-ic">${avatar(x, 28)}</span><span class="row-main"><span class="row-t">${esc(x.login)}</span><span class="meta">${esc(x.type || 'User')}</span></span><span class="row-end">${icon('chevron-right', 'chev')}</span></a>` : issueRow(x));
      results = `<div class="meta count">${k(r.total_count)} results</div>` + group(rows, 'No results. Try fewer words or a different tab.');
      if (ep === 'issues') results += `<button class="btn ghost wide" data-act="save-search">${icon('plus')}Save this search as a tile</button>`;
    } else if (recent.length) results = head('Recent') + `<div class="filters wrap">${recent.map((r) => `<button class="fchip" data-act="recent-search" data-val="${esc(r)}">${esc(r)}</button>`).join('')}</div>`;
    else results = `<div class="empty"><p>Search repositories, issues, pull requests and people. GitHub qualifiers like <code>is:open</code>, <code>label:bug</code> and <code>user:you</code> work here.</p></div>`;
    return { title: 'Search', big: true, html: `<form class="toolrow" id="search-form"><label class="field grow">${icon('search')}<input id="search-q" type="search" placeholder="Search GitHub" value="${esc(s.q)}" autocomplete="off" enterkeyhint="search"></label></form>
      ${seg('search-kind', [['repositories', 'Repos'], ['issues', 'Issues'], ['prs', 'PRs'], ['users', 'People']], s.kind)}${results}`,
      after: (root) => $('#search-form', root).addEventListener('submit', (e) => { e.preventDefault(); const q = $('#search-q').value.trim(); S.search = { ...s, q }; if (q) store.set('recent-searches', [q, ...recent.filter((x) => x !== q)].slice(0, 8)); render(true); }) };
  };
  V.me = async () => {
    const me = await getMe();
    const account = S.demo
      ? `<div class="card connect"><h3>${icon('key-round')}Connect your GitHub account</h3>
        <p>Paste a personal access token (classic) with the <code>repo</code>, <code>notifications</code> and <code>read:user</code> scopes. The token stays in this browser and is sent only to api.github.com.</p>
        <a class="link" href="https://github.com/settings/tokens/new?scopes=repo,notifications,read:user&description=Gitling" target="_blank" rel="noopener">${icon('external-link')}Create a token on GitHub</a>
        <form id="login" class="stack"><input id="token" type="password" class="input" placeholder="ghp_…" autocomplete="off" spellcheck="false"><button class="btn primary" type="submit">Connect</button><p class="form-err" id="login-err" hidden></p></form></div>`
      : `<div class="group"><button class="row" data-act="signout"><span class="row-ic">${icon('log-out')}</span><span class="row-main"><span class="row-t">Sign out</span><span class="meta">Removes the token from this browser</span></span></button></div>`;
    return { title: 'Profile', big: true, html: profileBlock(me) + `<div class="group">
      <a class="row" ${nav({ v: 'userrepos', u: me.login })}><span class="row-ic">${icon('book-marked')}</span><span class="row-main"><span class="row-t">Repositories</span></span><span class="row-end"><span class="meta">${me.public_repos ?? ''}</span>${icon('chevron-right', 'chev')}</span></a>
      <button class="row" data-act="studio"><span class="row-ic">${icon('palette')}</span><span class="row-main"><span class="row-t">Studio</span><span class="meta">Theme, layout, tabs and tiles</span></span><span class="row-end">${icon('chevron-right', 'chev')}</span></button></div>` + account,
      after: (root) => { const f = $('#login', root); f && f.addEventListener('submit', login); } };
  };
  function profileBlock(u) {
    return `<div class="profile"><div class="pf-av">${avatar(u, 72)}</div><div class="pf-main"><h1 class="big">${esc(u.name || u.login)}</h1><span class="meta">@${esc(u.login)}${u.location ? ' · ' + esc(u.location) : ''}</span></div></div>
      ${u.bio ? `<p class="bio">${esc(u.bio)}</p>` : ''}
      <div class="stats"><span><b>${k(u.followers || 0)}</b> followers</span><span><b>${k(u.following || 0)}</b> following</span><span><b>${k(u.public_repos || 0)}</b> repos</span></div>`;
  }
  V.user = async (c) => {
    const [u, repos] = await Promise.all([api('/users/' + enc(c.u)), api('/users/' + enc(c.u) + '/repos?sort=pushed&per_page=30')]);
    return { title: u.login, html: profileBlock(u) + head('Repositories') + group(repos.map(repoRow), 'No public repositories.') };
  };
  V.userrepos = async (c) => {
    const repos = await api(S.me && c.u === S.me.login ? '/user/repos?per_page=100&sort=updated' : '/users/' + enc(c.u) + '/repos?per_page=100&sort=updated');
    return { title: 'Repositories', html: group(repos.map(repoRow)) };
  };
  V.query = async (c) => {
    const r = await api('/search/issues?sort=updated&per_page=40&q=' + enc(meQ(c.q)));
    return { title: c.title || 'Search', html: `<form class="toolrow" id="qform"><label class="field grow mono">${icon('filter')}<input id="qinput" value="${esc(c.q)}" autocomplete="off" spellcheck="false"></label></form>
      <div class="meta count">${k(r.total_count)} results</div>${group(r.items.map((i) => issueRow(i)), 'Nothing matches this filter right now.')}
      ${T.tiles.some((t) => t.target && t.target.q === c.q) ? '' : `<button class="btn ghost wide" data-act="save-query">${icon('plus')}Save as tile</button>`}`,
      after: (root) => $('#qform', root).addEventListener('submit', (e) => { e.preventDefault(); c.q = $('#qinput').value.trim(); render(true); }) };
  };

  /* ---- repo ---- */
  V.repo = async (c) => {
    const full = c.o + '/' + c.r;
    const [repo, readme, star] = await Promise.all([
      api('/repos/' + full), api('/repos/' + full + '/readme', { accept: 'application/vnd.github.html+json', text: true }).catch(() => null),
      api('/user/starred/' + full).then(() => true).catch(() => false)]);
    c.starred = star;
    const rows = [['issues', 'circle-dot', 'Issues', { v: 'issues', kind: 'issue' }], ['prs', 'git-pull-request', 'Pull requests', { v: 'issues', kind: 'pr' }], ['code', 'folder-code', 'Code', { v: 'code', path: '' }], ['commits', 'git-commit-horizontal', 'Commits', { v: 'commits' }]];
    return { title: repo.name, html: `<div class="repo-head">
        <span class="meta owner">${avatar(repo.owner, 20)}${esc(repo.owner.login)}</span>
        <h1 class="big">${esc(repo.name)}</h1>${repo.description ? `<p class="desc">${esc(repo.description)}</p>` : ''}
        ${repo.topics && repo.topics.length ? `<div class="topics">${repo.topics.map((t) => `<span class="topic">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="stats mono"><span>★ <b>${k(repo.stargazers_count)}</b></span><span>${icon('git-fork')}<b>${k(repo.forks_count)}</b></span>${repo.language ? `<span><span class="ld" style="--lc:${LANG[repo.language] || 'var(--muted)'}"></span>${esc(repo.language)}</span>` : ''}${repo.private ? `<span>${icon('lock')}private</span>` : ''}</div>
        <div class="btn-row"><button class="btn ${star ? 'on' : ''}" data-act="star">${icon('star', star ? 'filled' : '')}${star ? 'Starred' : 'Star'}</button>
        <button class="btn" data-act="pin-repo">${icon('pin')}Add tile</button>
        <a class="btn" href="${esc(repo.html_url)}" target="_blank" rel="noopener">${icon('external-link')}Web</a></div></div>
      <div class="group">${rows.map(([, ic, l, n]) => `<a class="row" ${nav({ ...n, o: c.o, r: c.r })}><span class="row-ic">${icon(ic)}</span><span class="row-main"><span class="row-t">${l}</span></span><span class="row-end">${l === 'Code' ? `<span class="meta">${esc(repo.default_branch)}</span>` : ''}${icon('chevron-right', 'chev')}</span></a>`).join('')}</div>
      ${readme ? `<div class="card readme"><div class="readme-h meta">${icon('book-open')}README</div><div class="md">${readme}</div></div>` : ''}` };
  };
  V.issues = async (c) => {
    const full = c.o + '/' + c.r; const st = c.state || 'open';
    let items = c.kind === 'pr' ? await api(`/repos/${full}/pulls?state=${st}&per_page=50&sort=updated&direction=desc`) : (await api(`/repos/${full}/issues?state=${st}&per_page=50`)).filter((i) => !i.pull_request);
    items = items.map((i) => ({ ...i, repository_url: 'x/repos/' + full, ...(c.kind === 'pr' ? { pull_request: { merged_at: i.merged_at } } : {}) }));
    return { title: c.kind === 'pr' ? 'Pull requests' : 'Issues', html: `<div class="meta crumb">${esc(full)}</div>${seg('issue-state', [['open', 'Open'], ['closed', 'Closed']], st)}${group(items.map((i) => issueRow(i, false)), st === 'open' ? 'No open ' + (c.kind === 'pr' ? 'pull requests.' : 'issues.') : 'Nothing closed yet.')}` };
  };

  V.issue = async (c) => {
    const full = c.o + '/' + c.r;
    const [it, comments] = await Promise.all([api(`/repos/${full}/issues/${c.n}`, { accept: FULL }), api(`/repos/${full}/issues/${c.n}/comments?per_page=100`, { accept: FULL })]);
    const isPr = !!it.pull_request; let pr = null;
    if (isPr) pr = await api(`/repos/${full}/pulls/${c.n}`);
    const st = stateOf(it, pr); const me = await getMe(); const tab = c.seg || 'conv';
    let html = `<div class="iss-head"><div class="meta crumb">${esc(full)} #${it.number}</div><h1 class="title">${esc(it.title)}</h1>
      <div class="iss-meta">${pill(st)}<span class="meta">${esc(it.user.login)} · opened ${rel(it.created_at)}</span></div>
      ${pr ? `<div class="branches mono"><span>${esc(pr.base.ref)}</span>${icon('arrow-left')}<span>${esc(pr.head.ref)}</span></div>` : ''}
      ${it.labels && it.labels.length ? `<div class="lbls">${labels(it.labels)}</div>` : ''}</div>`;
    if (pr) {
      html += `<div class="status card"><div class="st-line"><span class="plus">+${pr.additions}</span><span class="minus">−${pr.deletions}</span><span class="meta">${pr.changed_files} files · ${pr.commits} commits</span></div>
        ${st.k === 'open' || st.k === 'draft' ? `<div class="st-line">${pr.mergeable === false ? `<span class="warn">${icon('triangle-alert')}Has merge conflicts</span>` : pr.mergeable ? `<span class="ok">${icon('circle-check')}No conflicts with ${esc(pr.base.ref)}</span>` : `<span class="meta">Checking mergeability…</span>`}</div>
        <div class="btn-row"><button class="btn primary merge" data-act="merge" ${pr.mergeable === false || st.k === 'draft' ? 'disabled' : ''}>${icon('git-merge')}Merge pull request</button><button class="btn" data-act="close-issue">Close</button></div>` : ''}</div>`;
      html += seg('pr-seg', [['conv', `Conversation <span class="n">${comments.length + 1}</span>`], ['files', `Files <span class="n">${pr.changed_files}</span>`]], tab);
    }
    if (tab === 'files' && pr) {
      const files = await api(`/repos/${full}/pulls/${c.n}/files?per_page=100`);
      html += `<div class="toolrow end"><button class="link" data-act="wrap">${S.wrap ? 'No wrap' : 'Wrap lines'}</button></div><div class="files ${S.wrap ? 'wrap' : ''}">${renderDiff(files)}</div>`;
      return { title: '#' + it.number, html };
    }
    const bubble = (u, t, body, first) => `<div class="tl-item"><span class="tl-node">${avatar(u, 28)}</span><div class="bubble card ${first ? 'first' : ''}"><div class="bubble-h"><b>${esc(u.login)}</b><span class="meta">${rel(t)}</span></div><div class="md">${body || '<p class="muted">No description provided.</p>'}</div></div></div>`;
    html += `<div class="timeline">${bubble(it.user, it.created_at, it.body_html, true)}${comments.map((x) => bubble(x.user, x.created_at, x.body_html)).join('')}
      ${it.state === 'closed' ? `<div class="tl-event"><span class="tl-dot" style="--c:var(--${st.k === 'merged' ? 'merged' : 'closed'})"></span><span class="meta">${st.label} ${rel(it.closed_at)}</span></div>` : ''}</div>
      <form class="composer" id="composer"><span class="comp-av">${avatar(me, 28)}</span><div class="comp-main"><textarea id="comment-body" rows="3" placeholder="Leave a comment as ${esc(me.login)}"></textarea>
      <div class="btn-row"><button class="btn primary" type="submit">Comment</button>${!pr || st.k === 'closed' ? `<button class="btn" type="button" data-act="close-issue">${it.state === 'open' ? 'Close ' + (isPr ? 'pull request' : 'issue') : 'Reopen'}</button>` : ''}</div></div></form>`;
    c._state = it.state;
    return { title: '#' + it.number, html, after: (root) => $('#composer', root).addEventListener('submit', async (e) => {
      e.preventDefault(); const body = $('#comment-body').value.trim(); if (!body) return;
      const b = e.submitter || $('button[type=submit]', e.target); b.disabled = true;
      try { await api(`/repos/${full}/issues/${c.n}/comments`, { method: 'POST', body: { body } }); toast('Comment posted'); render(true); } catch (err) { toast(err.message); b.disabled = false; }
    }) };
  };

  V.code = async (c) => {
    const full = c.o + '/' + c.r; const path = c.path || '';
    const data = await api(`/repos/${full}/contents/${path.split('/').map(enc).join('/')}`);
    const crumbs = [`<button class="link" ${nav({ v: 'code', o: c.o, r: c.r, path: '', replace: true })}>${esc(c.r)}</button>`].concat(path ? path.split('/').map((p, i, a) => `<button class="link" ${nav({ v: 'code', o: c.o, r: c.r, path: a.slice(0, i + 1).join('/'), replace: true })}>${esc(p)}</button>`) : []).join('<span class="dim">/</span>');
    if (Array.isArray(data)) {
      const items = data.slice().sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
      return { title: path.split('/').pop() || 'Code', html: `<div class="crumbs mono">${crumbs}</div>` + group(items.map((f) => `<a class="row tight" ${nav({ v: 'code', o: c.o, r: c.r, path: f.path })}><span class="row-ic ${f.type === 'dir' ? 'accent' : ''}">${icon(f.type === 'dir' ? 'folder' : 'file')}</span><span class="row-main"><span class="row-t mono">${esc(f.name)}</span></span><span class="row-end meta">${f.type === 'dir' ? '' : (f.size / 1024).toFixed(1) + ' KB'}</span></a>`), 'This folder is empty.') };
    }
    let body;
    const ext = (data.name.split('.').pop() || '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) && data.content) body = `<div class="card pad center"><img alt="${esc(data.name)}" src="data:image/${ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext};base64,${data.content.replace(/\n/g, '')}"></div>`;
    else if (!data.content) body = `<div class="empty"><p>This file is too large to show here.</p><a class="link" href="${esc(data.html_url || '#')}" target="_blank" rel="noopener">Open on GitHub</a></div>`;
    else {
      let text; try { const bin = atob(data.content.replace(/\n/g, '')); text = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))); } catch (_) { text = '(binary file)'; }
      const lines = text.replace(/\n$/, '').split('\n');
      body = `<div class="card code-card"><div class="code-h meta"><span>${lines.length} lines · ${(data.size / 1024).toFixed(1)} KB</span><button class="link" data-act="wrap">${S.wrap ? 'No wrap' : 'Wrap'}</button></div><div class="code-scroll ${S.wrap ? 'wrap' : ''}"><table class="src">${lines.map((l, i) => `<tr><td class="ln">${i + 1}</td><td class="cd">${esc(l) || ' '}</td></tr>`).join('')}</table></div></div>`;
    }
    return { title: data.name, html: `<div class="crumbs mono">${crumbs}</div>${body}` };
  };
  V.commits = async (c) => {
    const full = c.o + '/' + c.r; const list = await api(`/repos/${full}/commits?per_page=40`);
    const groups = {}; list.forEach((x) => (groups[dayGroup(x.commit.author.date)] = groups[dayGroup(x.commit.author.date)] || []).push(x));
    let html = `<div class="meta crumb">${esc(full)}</div>`;
    for (const g of ['Today', 'Yesterday', 'This week', 'Earlier']) if (groups[g]) html += `<div class="day-h">${g}</div>` + group(groups[g].map((x) => `<a class="row" ${nav({ v: 'commit', o: c.o, r: c.r, sha: x.sha })}><span class="row-ic">${icon('git-commit-horizontal')}</span><span class="row-main"><span class="row-t">${esc(x.commit.message.split('\n')[0])}</span><span class="meta">${x.sha.slice(0, 7)} · ${esc(x.author ? x.author.login : x.commit.author.name)} · ${rel(x.commit.author.date)}</span></span></a>`));
    return { title: 'Commits', html };
  };
  V.commit = async (c) => {
    const x = await api(`/repos/${c.o}/${c.r}/commits/${c.sha}`);
    return { title: x.sha.slice(0, 7), html: `<div class="iss-head"><div class="meta crumb">${esc(c.o + '/' + c.r)} · ${x.sha.slice(0, 7)}</div><h1 class="title">${esc(x.commit.message.split('\n')[0])}</h1>
      <span class="meta">${esc(x.commit.author.name)} · ${rel(x.commit.author.date)} · <span class="plus">+${x.stats ? x.stats.additions : 0}</span> <span class="minus">−${x.stats ? x.stats.deletions : 0}</span></span></div>
      <div class="toolrow end"><button class="link" data-act="wrap">${S.wrap ? 'No wrap' : 'Wrap lines'}</button></div><div class="files ${S.wrap ? 'wrap' : ''}">${renderDiff(x.files || [])}</div>` };
  };

  /* ---- tile editor ---- */
  V.tile = async (c) => {
    if (!c.draft) c.draft = clone(T.tiles.find((t) => t.id === c.id) || { id: 't' + Date.now().toString(36), label: 'New tile', icon: 'star', color: SWATCHES[0], style: 'soft', size: 1, badge: false, target: { type: 'search', q: 'is:open is:pr author:@me' }, _new: true });
    const d = c.draft; const tg = d.target; const glyphTab = c.glyphTab || ((d.icon || '').startsWith('emoji:') ? 'emoji' : (d.icon || '').startsWith('mono:') ? 'mono' : 'glyph');
    const tf = (id, label, val, ph, mono) => `<label class="lab" for="${id}">${label}</label><input class="input ${mono ? 'mono' : ''}" id="${id}" data-tf="${id}" value="${esc(val || '')}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false">`;
    const targetFields = {
      search: tf('tg-q', 'Search query', tg.q, 'is:open is:pr review-requested:@me', true) + `<p class="help">GitHub issue search. <code>@me</code> means you.</p>`,
      repo: tf('tg-repo', 'Repository', tg.repo, 'owner/name', true) + `<label class="lab">Opens on</label>${seg('tg-tab', [['overview', 'Overview'], ['issues', 'Issues'], ['prs', 'PRs'], ['code', 'Code'], ['commits', 'Commits']], tg.tab || 'overview')}`,
      user: tf('tg-user', 'Username', tg.user, 'octocat', true),
      file: tf('tg-repo', 'Repository', tg.repo, 'owner/name', true) + tf('tg-path', 'Path', tg.path, 'src/index.ts', true),
      inbox: `<label class="lab">Inbox filter</label><div class="filters wrap">${Object.entries(REASONS).map(([key, l]) => `<button class="fchip" aria-pressed="${(tg.filter || 'all') === key}" data-act="tg-filter" data-val="${key}">${l}</button>`).join('')}</div>`,
      url: tf('tg-url', 'Link', tg.url, 'https://…', true),
      ask: tf('tg-prompt', 'Question to ask', tg.prompt, 'Search code for…') + `<label class="lab">Then go to</label>${seg('tg-dest', [['issues', 'Issue search'], ['repos', 'Repo search'], ['url', 'A link']], tg.dest || 'url')}` + (tg.dest === 'url' || !tg.dest ? tf('tg-template', 'Link template', tg.template, 'https://github.com/search?q={query}', true) + `<p class="help"><code>{query}</code> is replaced with what you type.</p>` : tf('tg-template', 'Query template (optional)', tg.template, 'is:open {query}', true)),
    };
    const types = [['search', 'Search'], ['repo', 'Repository'], ['user', 'Person'], ['file', 'File'], ['inbox', 'Inbox'], ['url', 'Link'], ['ask', 'Ask first']];
    let glyphPane;
    if (glyphTab === 'glyph') glyphPane = `<div class="glyphs">${GLYPHS.map((g) => `<button class="glyph ${d.icon === g ? 'sel' : ''}" data-act="tile-glyph" data-val="${g}" aria-label="${g}">${icon(g)}</button>`).join('')}</div>`;
    else if (glyphTab === 'emoji') glyphPane = `<input class="input emoji-in" id="tile-emoji" data-tf="tile-emoji" maxlength="8" value="${esc((d.icon || '').startsWith('emoji:') ? d.icon.slice(6) : '')}" placeholder="Type or paste an emoji">`;
    else glyphPane = `<input class="input" id="tile-mono" data-tf="tile-mono" maxlength="2" value="${esc((d.icon || '').startsWith('mono:') ? d.icon.slice(5) : '')}" placeholder="Up to 2 letters">`;
    return { title: d._new ? 'New tile' : 'Edit tile', html: `<div class="tile-stage" id="tile-stage"><div class="tiles preview ${d.size === 2 ? '' : 'one'}">${tileHTML(d, { preview: true })}</div></div>
      <div class="form">
        ${tf('tile-label', 'Label', d.label, 'Review requests')}
        <label class="lab">Icon</label>${seg('glyph-tab', [['glyph', 'Glyph'], ['emoji', 'Emoji'], ['mono', 'Letters']], glyphTab)}${glyphPane}
        <label class="lab">Color</label><div class="swatches">${SWATCHES.map((s) => `<button class="sw ${d.color === s ? 'sel' : ''}" style="--c:${s}" data-act="tile-color" data-val="${s}" aria-label="${s}"></button>`).join('')}<label class="sw custom" aria-label="Custom color"><input type="color" id="tile-color-custom" value="${esc(d.color)}">${icon('pipette')}</label></div>
        <label class="lab">Style</label>${seg('tile-style', [['solid', 'Solid'], ['soft', 'Soft'], ['outline', 'Outline']], d.style)}
        <label class="lab">Size</label>${seg('tile-size', [['1', 'Half width'], ['2', 'Full width']], String(d.size || 1))}
        <label class="lab">Opens</label><div class="filters wrap">${types.map(([v, l]) => `<button class="fchip" aria-pressed="${tg.type === v}" data-act="tg-type" data-val="${v}">${l}</button>`).join('')}</div>
        ${targetFields[tg.type] || ''}
        ${['search', 'inbox', 'repo'].includes(tg.type) ? `<label class="check"><input type="checkbox" id="tile-badge" ${d.badge ? 'checked' : ''}> Show a live count on the tile</label>` : ''}
      </div>
      <div class="sticky-actions"><button class="btn primary grow" data-act="tile-save">${icon('check')}Save tile</button>${d._new ? '' : `<button class="btn" data-act="tile-dup">${icon('copy')}</button><button class="btn danger" data-act="tile-del" aria-label="Delete tile">${icon('trash-2')}</button>`}</div>`,
      after: (root) => {
        $$('[data-tf]', root).forEach((inp) => inp.addEventListener('input', () => {
          const v = inp.value; const id = inp.dataset.tf;
          if (id === 'tile-label') d.label = v; else if (id === 'tile-emoji') d.icon = 'emoji:' + v; else if (id === 'tile-mono') d.icon = 'mono:' + v.toUpperCase();
          else if (id === 'tg-q') tg.q = v; else if (id === 'tg-repo') tg.repo = v.trim(); else if (id === 'tg-user') tg.user = v.trim(); else if (id === 'tg-path') tg.path = v.trim();
          else if (id === 'tg-url') tg.url = v.trim(); else if (id === 'tg-prompt') tg.prompt = v; else if (id === 'tg-template') tg.template = v;
          refreshTilePreview(d);
        }));
        const cc = $('#tile-color-custom', root); cc.addEventListener('input', () => { d.color = cc.value.toUpperCase(); refreshTilePreview(d); $$('.sw', root).forEach((s) => s.classList.remove('sel')); });
        const b = $('#tile-badge', root); b && b.addEventListener('change', () => { d.badge = b.checked; refreshTilePreview(d); });
      } };
  };
  function refreshTilePreview(d) { const st = $('#tile-stage'); if (!st) return; st.innerHTML = `<div class="tiles preview ${d.size === 2 ? '' : 'one'}">${tileHTML(d, { preview: true })}</div>`; paintIcons(); }

  /* ================= ROUTER ================= */
  const main = () => $('#view');
  const stack = () => (S.stacks[S.tab] = S.stacks[S.tab] || [{ v: S.tab }]);
  function push(o) { if (o.replace) { delete o.replace; stack()[stack().length - 1] = o; } else stack().push(o); render(); }
  function back() { if (stack().length > 1) { stack().pop(); render(false, true); } }
  function switchTab(t) { if (S.tab === t) S.stacks[t] = [{ v: t }]; S.tab = t; S.editing = false; render(); }
  async function render(keepScroll, isBack) {
    const st = stack(); const cur = st[st.length - 1]; const seq = ++S.seq;
    const y = window.scrollY;
    const view = main();
    $('#back').hidden = st.length < 2;
    if (!keepScroll) { view.innerHTML = skeleton(); view.classList.remove('enter'); }
    renderTabbar();
    try {
      const r = await (V[cur.v] || V.home)(cur);
      if (seq !== S.seq) return;
      $('#title').textContent = r.big ? '' : r.title || '';
      document.body.dataset.big = r.big ? '1' : '';
      if (r.big && r.title) view.innerHTML = `<h1 class="big page-t">${esc(r.title)}</h1>` + r.html; else view.innerHTML = r.html;
      if (!keepScroll) { void view.offsetWidth; view.classList.add('enter'); view.dataset.dir = isBack ? 'back' : 'fwd'; }
      r.after && r.after(view);
      paintIcons();
      window.scrollTo(0, keepScroll ? y : 0);
    } catch (e) {
      if (seq !== S.seq) return;
      view.innerHTML = `<div class="error card"><h3>${icon('circle-alert')}Couldn't load this</h3><p>${esc(e.message)}</p><div class="btn-row"><button class="btn" data-act="retry">Try again</button>${e.status === 401 ? '<button class="btn primary" data-act="signout">Sign in again</button>' : ''}</div></div>`;
      paintIcons();
    }
  }

  function renderTabbar() {
    const bar = $('#tabbar'); if (!bar) return;
    const tabs = T.tabs.filter((t) => TABS[t]);
    bar.innerHTML = tabs.map((t) => `<button class="tab" data-act="tab" data-val="${t}" aria-current="${S.tab === t}" aria-label="${TABS[t].name}"><span class="tab-ic">${icon(TABS[t].icon)}${t === 'inbox' && S.unread ? `<span class="tab-badge">${S.unread > 99 ? '99+' : S.unread}</span>` : ''}</span><span class="tab-l">${TABS[t].name}</span></button>`).join('')
      + `<button class="tab studio-tab" data-act="studio" aria-label="Open Studio" aria-expanded="${S.studioOpen}"><span class="tab-ic">${icon('palette')}</span><span class="tab-l">Studio</span></button>`;
    paintIcons();
  }

  /* ================= STUDIO (bottom sheet over the live app) ================= */
  function openStudio(tab) { if (tab) S.studioTab = tab; S.studioOpen = true; $('#studio').hidden = false; $('#scrim').hidden = false; requestAnimationFrame(() => document.body.classList.add('studio-on')); setSnap(S.snap || 'half'); renderStudio(); renderTabbar(); }
  function closeStudio() { S.studioOpen = false; document.body.classList.remove('studio-on'); setTimeout(() => { if (!S.studioOpen) { $('#studio').hidden = true; $('#scrim').hidden = true; } }, 260); renderTabbar(); }
  function setSnap(s) { S.snap = s; $('#studio').dataset.snap = s; }
  const STUDIO_TABS = [['presets', 'Presets'], ['color', 'Color'], ['type', 'Type'], ['shape', 'Shape'], ['layout', 'Layout'], ['tiles', 'Tiles'], ['share', 'Share']];
  function renderStudio() {
    const body = $('#studio-body'); if (!body) return; const scroll = body.scrollTop;
    $('#studio-tabs').innerHTML = STUDIO_TABS.map(([v, l]) => `<button class="fchip" aria-pressed="${S.studioTab === v}" data-act="studio-tab" data-val="${v}">${l}</button>`).join('');
    $('#studio-undo').disabled = !history.length;
    const P = PRESETS[T.preset]; const m = mode();
    const chips = (act, opts, cur) => `<div class="filters wrap">${opts.map(([v, l]) => `<button class="fchip" aria-pressed="${String(cur) === String(v)}" data-act="${act}" data-val="${v}">${l}</button>`).join('')}</div>`;
    let h = '';
    switch (S.studioTab) {
      case 'presets':
        h = `<p class="help">A preset sets colors, fonts, corners, density, cards and the tab bar together. You can change any part afterwards.</p><div class="presets">${Object.entries(PRESETS).map(([id, p]) => { const pl = p[m]; const F = FONTS[p.font]; return `<button class="preset ${T.preset === id ? 'sel' : ''}" data-act="preset" data-val="${id}" style="--pbg:${pl.bg};--psf:${pl.surface};--pfg:${pl.fg};--pmu:${pl.muted};--pac:${pl.accent};--pa2:${pl.accent2};--pln:${pl.line};--pr:${Math.min(p.radius, 14)}px">
          <span class="pv"><span class="pv-t" style="font-family:${F.display}">Aa</span><span class="pv-card"><span class="pv-l"></span><span class="pv-l s"></span></span><span class="pv-dots"><i></i><i></i></span></span>
          <span class="pn"><b>${esc(p.name)}</b><span class="meta">${esc(p.note)}</span></span></button>`; }).join('')}</div>`;
        break;
      case 'color':
        h = `<label class="lab">Appearance</label>${chips('mode', [['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']], T.mode)}
          <label class="lab">Accent</label><div class="swatches"><button class="sw ${!T.accent ? 'sel' : ''}" style="--c:${P[m].accent}" data-act="accent" data-val="" aria-label="Preset accent"><span class="sw-tag">Preset</span></button>${SWATCHES.map((s) => `<button class="sw ${T.accent === s ? 'sel' : ''}" style="--c:${s}" data-act="accent" data-val="${s}" aria-label="${s}"></button>`).join('')}<label class="sw custom" aria-label="Custom accent"><input type="color" id="accent-custom" value="${esc(T.accent || P.light.accent)}">${icon('pipette')}</label></div>
          <p class="help">Custom accents are adjusted automatically so text on them stays readable in light and dark.</p>
          <label class="lab">Background</label>${chips('pattern', [['none', 'Plain'], ['grid', 'Grid'], ['dots', 'Dots'], ['glow', 'Glow']], eff('pattern'))}`;
        break;
      case 'type':
        h = `<label class="lab">Font pair</label><div class="fonts">${Object.entries(FONTS).map(([id, f]) => `<button class="font-card ${eff('font') === id ? 'sel' : ''}" data-act="font" data-val="${id}"><span class="fa" style="font-family:${f.display}">Aa</span><span class="fb" style="font-family:${f.body}">Merge pull request</span><span class="fm" style="font-family:${f.mono}">#45 · 2h</span><span class="meta">${esc(f.name)}</span></button>`).join('')}</div>
          <label class="lab" for="scale">Text size <span class="meta" id="scale-v">${Math.round(T.scale * 100)}%</span></label><input type="range" id="scale" min="0.9" max="1.25" step="0.05" value="${T.scale}">`;
        break;
      case 'shape':
        h = `<label class="lab" for="radius">Corner radius <span class="meta" id="radius-v">${eff('radius')}px</span></label><input type="range" id="radius" min="0" max="28" step="1" value="${eff('radius')}">
          <label class="lab">Cards</label>${chips('cards', [['flat', 'Flat'], ['outlined', 'Outlined'], ['elevated', 'Elevated'], ['glass', 'Glass']], eff('cards'))}
          <label class="lab" for="iconw">Icon weight <span class="meta" id="iconw-v">${T.iconWeight}</span></label><input type="range" id="iconw" min="1" max="2.75" step="0.25" value="${T.iconWeight}">`;
        break;
      case 'layout':
        h = `<label class="lab">Density</label>${chips('density', [['compact', 'Compact'], ['default', 'Default'], ['comfy', 'Roomy']], eff('density'))}
          <label class="lab">Tab bar</label>${chips('tabbar', [['pill', 'Floating pill'], ['docked', 'Docked with labels'], ['icons', 'Docked, icons only']], eff('tabBar'))}
          <label class="lab">Tabs <span class="meta">tap to add or remove · drag to reorder</span></label>
          <div class="edit-list" id="tab-list">${T.tabs.map((t) => `<div class="edit-row card" data-key="${t}"><span class="row-ic">${icon(TABS[t].icon)}</span><span class="grow"><b>${TABS[t].name}</b></span><button class="icon-btn" data-act="tab-remove" data-val="${t}" aria-label="Remove ${TABS[t].name}" ${T.tabs.length <= 1 ? 'disabled' : ''}>${icon('minus')}</button><span class="grip" data-grip>${icon('grip-vertical')}</span></div>`).join('')}</div>
          ${Object.keys(TABS).filter((t) => !T.tabs.includes(t)).length ? `<div class="filters wrap">${Object.keys(TABS).filter((t) => !T.tabs.includes(t)).map((t) => `<button class="fchip" data-act="tab-add" data-val="${t}">${icon('plus')}${TABS[t].name}</button>`).join('')}</div>` : ''}
          <p class="help">Studio always stays in the tab bar so you can get back here.</p>
          <button class="btn wide" data-act="edit-home">${icon('layout-list')}Rearrange home sections</button>`;
        break;
      case 'tiles':
        h = `<div class="edit-list" id="tile-list">${T.tiles.map((t) => `<div class="edit-row card" data-key="${esc(t.id)}"><span class="mini-tile" style="--c:${t.color};--tc:${inkOn(t.color)}">${(t.icon || '').startsWith('emoji:') ? esc(t.icon.slice(6)) : (t.icon || '').startsWith('mono:') ? esc(t.icon.slice(5)) : icon(t.icon)}</span><span class="grow"><b>${esc(t.label)}</b><span class="meta">${esc(describeTarget(t.target))}</span></span><button class="icon-btn" data-act="tile-edit" data-val="${esc(t.id)}" aria-label="Edit ${esc(t.label)}">${icon('pencil')}</button><span class="grip" data-grip>${icon('grip-vertical')}</span></div>`).join('')}</div>
          <button class="btn primary wide" data-act="tile-new">${icon('plus')}New tile</button><p class="help">Long-press a tile on Home to edit it.</p>`;
        break;
      case 'share': {
        const code = 'GITLING1:' + btoa(unescape(encodeURIComponent(JSON.stringify(T))));
        h = `<label class="lab" for="share-code">Your design code</label><textarea id="share-code" class="input mono" rows="4" readonly>${esc(code)}</textarea>
          <div class="btn-row"><button class="btn primary" data-act="copy-code">${icon('copy')}Copy code</button></div>
          <p class="help">It includes your theme, tabs, home layout and tiles. Paste it on another device to get the same app.</p>
          <label class="lab" for="import-code">Import a design</label><textarea id="import-code" class="input mono" rows="3" placeholder="GITLING1:…"></textarea>
          <div class="btn-row"><button class="btn" data-act="import">${icon('download')}Apply design</button></div><p class="form-err" id="import-err" hidden></p>
          <label class="lab">Start over</label><button class="btn danger" data-act="reset">${icon('rotate-ccw')}Reset design to default</button>`;
      }
    }
    body.innerHTML = h; body.scrollTop = scroll; paintIcons();
    const rng = (id, key, fmt, transform = Number) => { const el = $('#' + id, body); if (!el) return; let started = false; el.addEventListener('input', () => { const val = transform(el.value); if (!started) { history.push(JSON.stringify(T)); started = true; } T[key] = val; store.set('design', T); $('#' + id + '-v').textContent = fmt(val); const was = S.studioOpen; S.studioOpen = false; applyTheme(); S.studioOpen = was; }); el.addEventListener('change', () => { started = false; renderStudio(); }); };
    rng('scale', 'scale', (v) => Math.round(v * 100) + '%'); rng('radius', 'radius', (v) => v + 'px'); rng('iconw', 'iconWeight', (v) => v);
    const ac = $('#accent-custom', body); ac && ac.addEventListener('change', () => commit((t) => (t.accent = ac.value.toUpperCase())));
    const tl = $('#tab-list', body); tl && sortable(tl, (keys) => commit((t) => (t.tabs = keys)));
    const til = $('#tile-list', body); til && sortable(til, (keys) => commit((t) => (t.tiles = keys.map((id) => t.tiles.find((x) => x.id === id)))));
  }
  function describeTarget(tg) {
    if (!tg) return '';
    return { search: () => 'Search · ' + tg.q, repo: () => (tg.repo || '?') + (tg.tab && tg.tab !== 'overview' ? ' · ' + tg.tab : ''), user: () => '@' + (tg.user || '?'), file: () => (tg.repo || '?') + '/' + (tg.path || ''), inbox: () => 'Inbox · ' + (REASONS[tg.filter || 'all']), url: () => tg.url || 'Link', ask: () => 'Asks: ' + (tg.prompt || '…') }[tg.type]?.() || '';
  }
  function wireSheetDrag() {
    const sheet = $('#studio'), grab = $('#studio-grab'); let y0, h0, dragging = false;
    grab.addEventListener('pointerdown', (e) => { dragging = true; y0 = e.clientY; h0 = sheet.getBoundingClientRect().height; sheet.style.transition = 'none'; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', (e) => { if (!dragging) return; const nh = Math.max(80, h0 - (e.clientY - y0)); sheet.style.height = nh + 'px'; });
    const end = (e) => { if (!dragging) return; dragging = false; sheet.style.transition = ''; sheet.style.height = ''; const dy = e.clientY - y0; const vh = innerHeight;
      if (Math.abs(dy) < 6) return setSnap(S.snap === 'half' ? 'full' : 'half');
      const nh = h0 - dy; if (nh < vh * 0.3) closeStudio(); else setSnap(nh > vh * 0.7 ? 'full' : 'half'); };
    grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
  }

  function askSheet(t) {
    const tg = t.target; const sh = $('#ask');
    sh.innerHTML = `<form class="ask-card card" id="ask-form"><b>${esc(tg.prompt || t.label)}</b><input class="input" id="ask-in" autocomplete="off" placeholder="Type here" enterkeyhint="go"><div class="btn-row" id="ask-actions"></div></form>`;
    sh.hidden = false; $('#scrim').hidden = false; document.body.classList.add('ask-on');
    const inp = $('#ask-in'); const actions = $('#ask-actions');
    const tmpl = tg.template || (tg.dest === 'url' ? 'https://github.com/search?q={query}' : '{query}');
    const update = () => { const v = inp.value.trim(); if (tg.dest === 'url' || !tg.dest) actions.innerHTML = `<a class="btn primary ${v ? '' : 'disabled'}" href="${esc(safeUrl(tmpl.replace('{query}', enc(v))))}" target="_blank" rel="noopener" ${v ? '' : 'aria-disabled="true" tabindex="-1"'}>${icon('external-link')}Open</a><button type="button" class="btn" data-act="ask-close">Cancel</button>`; else actions.innerHTML = `<button class="btn primary" type="submit" ${v ? '' : 'disabled'}>Search</button><button type="button" class="btn" data-act="ask-close">Cancel</button>`; paintIcons(); };
    inp.addEventListener('input', update); update(); setTimeout(() => inp.focus(), 50);
    $('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v) return; const q = tmpl.replace('{query}', v); closeAsk(); if (tg.dest === 'repos') { S.search = { q, kind: 'repositories' }; switchTab(T.tabs.includes('search') ? 'search' : S.tab); if (!T.tabs.includes('search')) push({ v: 'search' }); } else if (tg.dest === 'issues') push({ v: 'query', q, title: v }); });
    actions.addEventListener('click', (e) => { if (e.target.closest('a.btn.primary')) setTimeout(closeAsk, 100); });
  }
  function closeAsk() { $('#ask').hidden = true; document.body.classList.remove('ask-on'); if (!S.studioOpen) $('#scrim').hidden = true; }

  /* ================= SORTABLE (pointer drag + FLIP) ================= */
  function sortable(list, onDone) {
    if (!list) return;
    $$('[data-grip]', list).forEach((g) => {
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault(); const item = g.closest('[data-key]'); g.setPointerCapture(e.pointerId); item.classList.add('lifted'); navigator.vibrate && navigator.vibrate(8);
        const move = (ev) => {
          const items = $$(':scope > [data-key]', list); let before = null;
          for (const it of items) { if (it === item) continue; const r = it.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { before = it; break; } }
          if (before !== item.nextElementSibling && before !== item) {
            const first = new Map(items.map((it) => [it, it.getBoundingClientRect().top]));
            list.insertBefore(item, before);
            items.forEach((it) => { if (it === item) return; const d = first.get(it) - it.getBoundingClientRect().top; if (d) { it.style.transition = 'none'; it.style.transform = `translateY(${d}px)`; requestAnimationFrame(() => { it.style.transition = 'transform .18s ease'; it.style.transform = ''; }); } });
          }
          if (ev.clientY < 70) scrollBy(0, -8); else if (ev.clientY > innerHeight - 70) scrollBy(0, 8);
        };
        const up = () => { g.removeEventListener('pointermove', move); item.classList.remove('lifted'); onDone($$(':scope > [data-key]', list).map((x) => x.dataset.key)); };
        g.addEventListener('pointermove', move); g.addEventListener('pointerup', up, { once: true }); g.addEventListener('pointercancel', up, { once: true });
      });
    });
  }

  /* ================= ACTIONS ================= */
  let toastTimer;
  function toast(msg, actLabel, fn) {
    const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>${actLabel ? `<button class="link" id="toast-act">${esc(actLabel)}</button>` : ''}`; t.hidden = false; t.classList.add('show');
    if (actLabel) $('#toast-act').onclick = () => { fn(); hide(); };
    const hide = () => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 200); };
    clearTimeout(toastTimer); toastTimer = setTimeout(hide, actLabel ? 4000 : 2400);
  }
  const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };
  async function login(e) {
    e.preventDefault(); const tok = $('#token').value.trim(); const err = $('#login-err'); if (!tok) return;
    const btn = e.submitter || $('#login button'); btn.disabled = true; btn.textContent = 'Connecting…';
    try { const me = await GH.request('/user', {}, { demo: false, token: tok }); S.token = tok; S.demo = false; S.me = me; store.set('token', tok); bust(); S.stacks = {}; S.tab = 'home'; toast('Connected as ' + me.login); render(); }
    catch (x) { err.hidden = false; err.textContent = x.message; btn.disabled = false; btn.textContent = 'Connect'; }
  }
  function arm(btn, label) { if (btn.dataset.armed) return true; btn.dataset.armed = '1'; const old = btn.innerHTML; btn.innerHTML = label; btn.classList.add('armed'); setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.innerHTML = old; btn.classList.remove('armed'); paintIcons(); } }, 3500); return false; }

  const ACT = {
    tab: (v) => { if (S.studioOpen) closeStudio(); switchTab(v); },
    retry: () => render(),
    studio: (v) => openStudio(v || null),
    'studio-close': closeStudio, 'studio-undo': () => { undo(); toast('Undone'); },
    'studio-tab': (v) => { S.studioTab = v; renderStudio(); $('#studio-body').scrollTop = 0; },
    preset: (v) => commit((t) => { t.preset = v; t.accent = t.font = t.radius = t.density = t.cards = t.tabBar = t.pattern = null; }),
    mode: (v) => commit((t) => (t.mode = v)), accent: (v) => commit((t) => (t.accent = v || null)), pattern: (v) => commit((t) => (t.pattern = v)),
    font: (v) => commit((t) => (t.font = v)), cards: (v) => commit((t) => (t.cards = v)), density: (v) => commit((t) => (t.density = v)), tabbar: (v) => commit((t) => (t.tabBar = v)),
    'tab-remove': (v) => commit((t) => { t.tabs = t.tabs.filter((x) => x !== v); if (S.tab === v) { S.tab = t.tabs[0]; render(); } }),
    'tab-add': (v) => commit((t) => t.tabs.push(v)),
    'edit-home': () => { if (S.studioOpen) closeStudio(); S.tab = T.tabs.includes('home') ? 'home' : S.tab; S.stacks.home = [{ v: 'home' }]; S.tab = 'home'; S.editing = true; render(); },
    'edit-done': () => { S.editing = false; render(); },
    'sec-toggle': (v) => { commit((t) => { const s = t.sections.find((x) => x.id === v); s.on = !s.on; }); render(true); },
    'sec-move': (v) => { const [id, d] = v.split(':'); commit((t) => { const on = t.sections.filter((s) => s.on), off = t.sections.filter((s) => !s.on); const i = on.findIndex((s) => s.id === id); const j = i + +d; if (i < 0 || j < 0 || j >= on.length) return; [on[i], on[j]] = [on[j], on[i]]; t.sections = on.concat(off); }); render(true); },
    tile: (v) => openTile(v),
    'tile-new': () => { if (S.studioOpen) closeStudio(); push({ v: 'tile' }); },
    'tile-edit': (v) => { closeStudio(); push({ v: 'tile', id: v }); },
    'tile-glyph': (v, el, cur) => { cur.draft.icon = v; render(true); },
    'tile-color': (v, el, cur) => { cur.draft.color = v; render(true); },
    'glyph-tab': (v, el, cur) => { cur.glyphTab = v; render(true); },
    'tile-style': (v, el, cur) => { cur.draft.style = v; render(true); },
    'tile-size': (v, el, cur) => { cur.draft.size = +v; render(true); },
    'tg-type': (v, el, cur) => { const old = cur.draft.target; cur.draft.target = { type: v, ...(v === 'ask' ? { dest: 'url', template: 'https://github.com/search?q={query}', prompt: 'Search GitHub for…' } : {}), ...(old.repo && ['repo', 'file'].includes(v) ? { repo: old.repo } : {}) }; if (!['search', 'inbox', 'repo'].includes(v)) cur.draft.badge = false; render(true); },
    'tg-tab': (v, el, cur) => { cur.draft.target.tab = v; render(true); }, 'tg-dest': (v, el, cur) => { cur.draft.target.dest = v; cur.draft.target.template = v === 'url' ? 'https://github.com/search?q={query}' : '{query}'; render(true); },
    'tg-filter': (v, el, cur) => { cur.draft.target.filter = v; render(true); },
    'tile-save': (v, el, cur) => { const d = clone(cur.draft); const isNew = d._new; delete d._new; if (!d.label.trim()) return toast('Give the tile a label.'); commit((t) => { const i = t.tiles.findIndex((x) => x.id === d.id); if (i >= 0) t.tiles[i] = d; else t.tiles.push(d); }); toast(isNew ? 'Tile added to Home' : 'Tile saved'); bust(); back(); },
    'tile-dup': (v, el, cur) => { const d = clone(cur.draft); d.id = 't' + Date.now().toString(36); d.label += ' copy'; commit((t) => t.tiles.push(d)); toast('Tile duplicated'); back(); },
    'tile-del': (v, el, cur) => { if (!arm(el, 'Tap to delete')) return; commit((t) => (t.tiles = t.tiles.filter((x) => x.id !== cur.draft.id))); toast('Tile deleted'); back(); },
    'save-query': (v, el, cur) => { push({ v: 'tile', draft: { id: 't' + Date.now().toString(36), label: cur.title || 'Saved search', icon: 'search', color: SWATCHES[7], style: 'soft', size: 1, badge: true, target: { type: 'search', q: cur.q }, _new: true } }); },
    'save-search': () => { const s = S.search; push({ v: 'tile', draft: { id: 't' + Date.now().toString(36), label: s.q, icon: 'search', color: SWATCHES[7], style: 'soft', size: 1, badge: true, target: { type: 'search', q: s.q + (s.kind === 'prs' ? ' is:pr' : ' is:issue') }, _new: true } }); },
    'pin-repo': (v, el, cur) => push({ v: 'tile', draft: { id: 't' + Date.now().toString(36), label: cur.r, icon: 'book-marked', color: SWATCHES[5], style: 'soft', size: 1, badge: false, target: { type: 'repo', repo: cur.o + '/' + cur.r, tab: 'overview' }, _new: true } }),
    star: async (v, el, cur) => { const full = cur.o + '/' + cur.r; el.disabled = true; try { await api('/user/starred/' + full, { method: cur.starred ? 'DELETE' : 'PUT' }); toast(cur.starred ? 'Unstarred' : 'Starred'); delete S.cache['repos:starred']; render(true); } catch (e) { toast(e.message); el.disabled = false; } },
    notif: (v, el) => {
      if (el.dataset.swiped) return; const n = (S.notifs || []).find((x) => x.id === v) || null; if (!n) return;
      if (n.unread) { api('/notifications/threads/' + n.id, { method: 'PATCH' }).catch(() => {}); n.unread = false; S.unread = Math.max(0, (S.unread || 1) - 1); delete S.cache['notif:false']; }
      const m = n.subject.url && n.subject.url.match(/\/repos\/([^/]+)\/([^/]+)\/(issues|pulls)\/(\d+)/);
      if (m) push({ v: 'issue', o: m[1], r: m[2], n: +m[4] }); else { const [o, r] = n.repository.full_name.split('/'); push({ v: 'repo', o, r }); }
    },
    'inbox-filter': (v) => { S.inboxFilter = v; render(true); }, 'inbox-all': (v) => { S.inboxAll = v === '1'; render(true); },
    'mark-all': async () => { try { await api('/notifications', { method: 'PUT', body: { read: true } }); (S.notifs || []).forEach((n) => (n.unread = false)); S.unread = 0; bust(); toast('All marked read'); render(true); } catch (e) { toast(e.message); } },
    'repo-seg': (v) => { S.repoSeg = v; render(true); },
    'search-kind': (v) => { S.search = { ...(S.search || { q: '' }), kind: v }; render(true); },
    'recent-search': (v) => { S.search = { ...(S.search || { kind: 'repositories' }), q: v }; render(true); },
    'issue-state': (v, el, cur) => { cur.state = v; render(true); },
    'pr-seg': (v, el, cur) => { cur.seg = v; render(true); },
    wrap: () => { S.wrap = !S.wrap; render(true); },
    viewed: (v, el) => { S.viewed[v] = el.checked; const d = el.closest('details'); if (d) d.open = !el.checked; },
    merge: async (v, el, cur) => { if (!arm(el, 'Tap again to merge')) return; el.disabled = true; try { await api(`/repos/${cur.o}/${cur.r}/pulls/${cur.n}/merge`, { method: 'PUT', body: {} }); navigator.vibrate && navigator.vibrate([10, 40, 10]); toast('Pull request merged'); bust(); render(true); } catch (e) { toast(e.message); el.disabled = false; } },
    'close-issue': async (v, el, cur) => { const next = cur._state === 'closed' ? 'open' : 'closed'; if (next === 'closed' && !arm(el, 'Tap again to close')) return; try { await api(`/repos/${cur.o}/${cur.r}/issues/${cur.n}`, { method: 'PATCH', body: { state: next } }); toast(next === 'closed' ? 'Closed' : 'Reopened'); bust(); render(true); } catch (e) { toast(e.message); } },
    signout: () => { store.set('token', null); S.token = null; S.demo = true; S.me = null; bust(); S.stacks = {}; S.tab = 'home'; toast('Signed out. Showing sample data.'); render(); },
    'copy-code': async () => { const ta = $('#share-code'); try { await navigator.clipboard.writeText(ta.value); toast('Design code copied'); } catch (_) { ta.focus(); ta.select(); toast('Selected. Copy it from the menu.'); } },
    import: () => { const raw = $('#import-code').value.trim(); const err = $('#import-err'); try { if (!raw.startsWith('GITLING1:')) throw new Error('That is not a Gitling design code. It should start with GITLING1:'); const d = JSON.parse(decodeURIComponent(escape(atob(raw.slice(9))))); if (!d || !PRESETS[d.preset]) throw new Error('This code is damaged or from a newer version.'); commit((t) => Object.assign(t, clone(DEFAULT_T), d)); toast('Design applied'); render(); } catch (e) { err.hidden = false; err.textContent = e.message; } },
    reset: (v, el) => { if (!arm(el, 'Tap again to reset everything')) return; commit((t) => Object.assign(t, clone(DEFAULT_T))); toast('Design reset. Undo is available.'); render(); },
    'ask-close': closeAsk,
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]') && !e.target.closest('[data-act]')) { e.stopPropagation(); return; }
    const n = e.target.closest('[data-nav]');
    const a = e.target.closest('[data-act]');
    if (a && (!n || n.contains(a))) {
      const fn = ACT[a.dataset.act]; if (!fn) return;
      if (a.tagName !== 'INPUT') e.preventDefault();
      const st = stack(); fn(a.dataset.val, a, st[st.length - 1]); return;
    }
    if (n) { e.preventDefault(); push(JSON.parse(n.dataset.nav)); }
  });
  document.addEventListener('change', (e) => { const a = e.target.closest('input[type=checkbox][data-act]'); if (a) { const st = stack(); ACT[a.dataset.act](a.dataset.val, a, st[st.length - 1]); } });
  $('#back').addEventListener('click', back);
  $('#scrim').addEventListener('click', () => { if ($('#ask').hidden === false) closeAsk(); else closeStudio(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#ask').hidden) closeAsk(); else if (S.studioOpen) closeStudio(); } });

  // hide tab bar on scroll down, show on scroll up
  let lastY = 0;
  addEventListener('scroll', () => { const y = scrollY; document.body.classList.toggle('bar-hidden', y > lastY + 4 && y > 120 && !S.studioOpen); if (y < lastY - 4) document.body.classList.remove('bar-hidden'); lastY = y; }, { passive: true });

  wireSheetDrag();
  applyTheme();
  render();
})();
