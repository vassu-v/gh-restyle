import { router, type Href } from 'expo-router';
import { Linking } from 'react-native';
import { isSafeLink } from '@gitling/design';

/**
 * In-app routes, built in one place so screens don't hand-assemble paths.
 * Route files live under src/app/ (see docs/ARCHITECTURE.md § Routes).
 */
const seg = encodeURIComponent;
export const routes = {
  repo: (owner: string, name: string) => `/repo/${seg(owner)}/${seg(name)}` as Href,
  tree: (owner: string, name: string, path = '', ref?: string) => `/repo/${seg(owner)}/${seg(name)}/tree?path=${seg(path)}${ref ? `&ref=${seg(ref)}` : ''}` as Href,
  blob: (owner: string, name: string, path: string, ref?: string) => `/repo/${seg(owner)}/${seg(name)}/blob?path=${seg(path)}${ref ? `&ref=${seg(ref)}` : ''}` as Href,
  list: (owner: string, name: string, kind: 'issues' | 'pulls') => `/repo/${seg(owner)}/${seg(name)}/list?kind=${kind}` as Href,
  thread: (owner: string, name: string, n: number) => `/thread/${seg(owner)}/${seg(name)}/${n}` as Href,
  user: (login: string) => `/user/${seg(login)}` as Href,
};

const RESERVED = new Set(['settings', 'notifications', 'login', 'logout', 'orgs', 'organizations', 'marketplace', 'explore', 'topics', 'trending', 'features', 'pricing', 'about', 'sponsors', 'apps', 'search', 'new', 'pulls', 'issues', 'codespaces', 'collections', 'events', 'site', 'security', 'enterprise', 'team', 'customer-stories', 'readme', 'join', 'users', 'stars', 'dashboard', 'account', 'copilot', 'watching', 'discussions', 'gist', 'github-copilot', 'contact', 'blog', 'models', 'mobile', 'signup', 'sessions', 'password_reset']);

/** Maps a github.com URL to an in-app route, or null if Gitling has no screen for it. */
export function routeForUrl(url: string): Href | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!/^(www\.)?github\.com$/.test(u.hostname)) return null;
  let p: string[];
  try { p = u.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { return null; }
  if (!p.length || RESERVED.has(p[0].toLowerCase())) return null;
  const [owner, name, kind, ...rest] = p;
  if (!name) return routes.user(owner);
  const repoName = name.replace(/\.git$/, '');
  if (!kind) return routes.repo(owner, repoName);
  if ((kind === 'issues' || kind === 'pull') && /^\d+$/.test(rest[0] ?? '')) return routes.thread(owner, repoName, Number(rest[0]));
  if (kind === 'issues' && !rest.length) return routes.list(owner, repoName, 'issues');
  if (kind === 'pulls' && !rest.length) return routes.list(owner, repoName, 'pulls');
  // blob/tree URLs: the ref may contain slashes, which is ambiguous; assume a single-segment ref.
  if (kind === 'blob' && rest.length >= 2) return routes.blob(owner, repoName, rest.slice(1).join('/'), rest[0]);
  if (kind === 'tree' && rest.length >= 1) return routes.tree(owner, repoName, rest.slice(1).join('/'), rest[0]);
  return null;
}

/** Opens a link inside Gitling when there's a screen for it, otherwise in the browser. */
export function openUrl(url: string) {
  const r = routeForUrl(url);
  if (r) router.push(r);
  else if (isSafeLink(url)) Linking.openURL(url).catch(() => {});
}
