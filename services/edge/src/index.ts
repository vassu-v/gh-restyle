/**
 * Gitling Worker (Cloudflare). Serves the web app from static assets (wrangler.toml [assets]) and handles
 * sign-in. Stores nothing. Routes that reach this code:
 *
 *   GET  /auth/callback?code&state  GitHub sends the user here (the OAuth App's single callback URL).
 *                                    We read where the app wants to land from `state`, check it against
 *                                    ALLOWED_RETURN, and redirect there with the same code + state.
 *   POST /auth/exchange             {code, code_verifier} → adds the client secret → GitHub → {access_token, scope}.
 *                                    GitHub's token endpoint needs the secret and blocks browser CORS, hence this hop.
 *   GET  /health                    liveness check.
 *
 * Phase 2 adds /push/* and a cron poller here (see PLAN.md § 7).
 */

export interface Env {
  /** Static assets (the web app). Absent when the worker runs without assets (tests, auth-only deploys). */
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Comma list: exact http(s) origins and/or custom schemes ("gitling://"). */
  ALLOWED_RETURN: string;
  /** Optional rate limiter for /auth/exchange (wrangler.toml [[ratelimits]]). */
  EXCHANGE_LIMIT?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
}

type Fetch = typeof fetch;

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
};

export async function handle(req: Request, env: Env, f: Fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} });
    if (url.pathname === '/health') return json({ ok: true, configured: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) }, 200, cors);
    if (url.pathname === '/auth/callback' && req.method === 'GET') return callback(req, url, env);
    if (url.pathname === '/auth/exchange' && req.method === 'POST') {
      if (req.headers.get('Origin') && !cors) return json({ error: 'This website is not allowed to sign in here.' }, 403);
      if (env.EXCHANGE_LIMIT) {
        const { success } = await env.EXCHANGE_LIMIT.limit({ key: req.headers.get('CF-Connecting-IP') ?? 'unknown' });
        if (!success) return json({ error: 'Too many sign-in attempts. Wait a minute and try again.' }, 429, cors);
      }
      return exchange(req, url, env, f, cors);
    }
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return json({ error: 'Not found' }, 404, cors);
  } catch {
    return json({ error: 'Sign-in service error. Try again.' }, 500, cors);
  }
}

/* ─── callback: bounce GitHub's redirect back into the app ─── */

async function callback(req: Request, url: URL, env: Env): Promise<Response> {
  const state = url.searchParams.get('state') ?? '';
  const target = returnTarget(state);
  if (!target || !isAllowedReturn(target, env)) return page(400, 'This sign-in link is not valid. Go back to Gitling and try again.');
  const out = new URL(target);
  // When the app is served by this same Worker, its return address IS this URL. Redirecting would loop
  // forever (run_worker_first sends /auth/* back here), so serve the app's page and let it read code+state.
  if (out.origin === url.origin && out.pathname === url.pathname && env.ASSETS) {
    // The address holds a one-time code: never cache this page, never send it on as a Referer.
    const page = await env.ASSETS.fetch(req);
    const res = new Response(page.body, page);
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Referrer-Policy', 'no-referrer');
    return res;
  }
  for (const k of ['code', 'state', 'error', 'error_description']) {
    const v = url.searchParams.get(k);
    if (v) out.searchParams.set(k, v);
  }
  return new Response(null, { status: 302, headers: { Location: out.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

/** state = "<nonce>.<base64url(returnTo)>" (packages/github/src/auth.ts encodeState). */
export function returnTarget(state: string): string | null {
  const i = state.indexOf('.');
  if (i < 1) return null;
  try {
    const b64 = state.slice(i + 1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return null; }
}

function allowList(env: Env) { return (env.ALLOWED_RETURN ?? '').split(',').map((s) => s.trim()).filter(Boolean); }

export function isAllowedReturn(target: string, env: Env): boolean {
  let t: URL;
  try { t = new URL(target); } catch { return false; }
  return allowList(env).some((rule) => {
    // Protocol too: blob:https://site has origin https://site but isn't a page the site serves.
    if (/^https?:\/\//.test(rule)) { try { const r = new URL(rule); return t.protocol === r.protocol && t.origin === r.origin; } catch { return false; } }
    // "gitling://auth/callback" matches only that place (query aside). A bare "gitling://" would accept any
    // gitling: URL, which any app on an Android phone could register to catch the code.
    const m = /^([a-z][\w+.-]*):\/*(.*)$/i.exec(rule);
    if (!m || t.protocol !== m[1].toLowerCase() + ':') return false;
    if (!m[2]) return true;
    return (t.host + t.pathname).replace(/^\/+|\/+$/g, '') === m[2].replace(/\/+$/, '');
  });
}

/* ─── exchange: code + verifier → token ─── */

/** The scopes Gitling requests (packages/github auth.ts OAUTH_SCOPES), plus `user`: GitHub reports it instead of
 *  `read:user` when the person granted the wider one before (auth.ts missingScopes treats them the same way).
 *  Refusing it would lock that person out: every new token would carry it and be revoked. */
const ALLOWED_SCOPES = new Set(['repo', 'notifications', 'read:user', 'user']);

async function exchange(req: Request, url: URL, env: Env, f: Fetch, cors: Record<string, string> | null): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return json({ error: 'Sign-in is not configured on the server yet.' }, 503, cors);
  let body: { code?: unknown; code_verifier?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400, cors); }
  if (!body || typeof body !== 'object') return json({ error: 'Bad request.' }, 400, cors); // e.g. a JSON body of null
  const code = typeof body.code === 'string' ? body.code : '';
  const verifier = typeof body.code_verifier === 'string' ? body.code_verifier : '';
  if (!/^[\w-]{8,100}$/.test(code) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return json({ error: 'Bad request.' }, 400, cors);

  const gh = await f('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'gitling-auth' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  const data = ((await gh.json().catch(() => null)) ?? {}) as { access_token?: string; scope?: string; token_type?: string; error?: string; error_description?: string };
  if (!gh.ok || !data.access_token) {
    const expired = data.error === 'bad_verification_code';
    return json({ error: expired ? 'That sign-in expired. Try again.' : (data.error_description ?? 'GitHub refused the sign-in.') }, 400, cors);
  }
  // Anyone can start an authorize request with Gitling's client id and any scope list. Hand out only tokens with
  // the scopes Gitling asks for; revoke anything broader instead of returning it.
  const extra = (data.scope ?? '').split(/[,\s]+/).filter((s) => s && !ALLOWED_SCOPES.has(s));
  if (extra.length) {
    await f(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'gitling-auth' },
      body: JSON.stringify({ access_token: data.access_token }),
    }).catch(() => {});
    return json({ error: 'That sign-in asked for more access than Gitling uses, so it was cancelled. Start again from Gitling.' }, 400, cors);
  }
  return json({ access_token: data.access_token, scope: data.scope ?? '', token_type: data.token_type ?? 'bearer' }, 200, cors);
}

/* ─── helpers ─── */

function corsHeaders(req: Request, env: Env): Record<string, string> | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const ok = allowList(env).some((rule) => { try { return /^https?:\/\//.test(rule) && new URL(rule).origin === origin; } catch { return false; } });
  if (!ok) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}

function json(data: unknown, status: number, extra?: Record<string, string> | null): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(extra ?? {}) } });
}

function page(status: number, message: string): Response {
  const esc = message.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Gitling</title><body style="font:16px system-ui;background:#0E0F11;color:#ECECEE;padding:32px"><h1 style="font-size:20px">Gitling</h1><p>${esc}</p>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
