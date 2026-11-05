import { describe, expect, it, vi } from 'vitest';
import { encodeState } from '../../../packages/github/src/auth';
import { handle, isAllowedReturn, returnTarget, type Env } from '../src/index';

const env: Env = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'secret', ALLOWED_RETURN: 'http://localhost:8081, https://gitling.vercel.app, gitling://' };
const W = 'https://auth.example.workers.dev';
const verifier = 'a'.repeat(43);

describe('return target allowlist', () => {
  it('decodes the target the app put in state', () => {
    expect(returnTarget(encodeState('n0nce', 'https://gitling.vercel.app/auth/callback'))).toBe('https://gitling.vercel.app/auth/callback');
  });
  it('matches http(s) by exact origin', () => {
    expect(isAllowedReturn('https://gitling.vercel.app/auth/callback', env)).toBe(true);
    expect(isAllowedReturn('https://gitling.vercel.app.evil.com/auth/callback', env)).toBe(false);
    expect(isAllowedReturn('http://gitling.vercel.app/auth/callback', env)).toBe(false);
    expect(isAllowedReturn('https://evil.com/?x=https://gitling.vercel.app', env)).toBe(false);
  });
  it('matches custom schemes by scheme', () => {
    expect(isAllowedReturn('gitling://auth/callback', env)).toBe(true);
    expect(isAllowedReturn('javascript:alert(1)', env)).toBe(false);
    expect(isAllowedReturn('exp://192.168.1.2:8081/--/auth/callback', env)).toBe(false);
  });
  it('a custom-scheme rule with a path matches only that place', () => {
    const pinned = { ...env, ALLOWED_RETURN: 'https://gitling.vercel.app,gitling://auth/callback' };
    expect(isAllowedReturn('gitling://auth/callback', pinned)).toBe(true);
    expect(isAllowedReturn('GITLING://auth/callback?x=1', pinned)).toBe(true);
    for (const bad of ['gitling://evil', 'gitling:x', 'gitling://auth/callback/../../x', 'gitling://auth/callbackx', 'gitling://evil/auth/callback'])
      expect(isAllowedReturn(bad, pinned), bad).toBe(false);
  });
});

describe('GET /auth/callback', () => {
  it('redirects back to the app with code and state', async () => {
    const state = encodeState('n0nce', 'http://localhost:8081/auth/callback');
    const res = await handle(new Request(`${W}/auth/callback?code=abc123&state=${state}`), env);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('Location')!);
    expect(loc.origin + loc.pathname).toBe('http://localhost:8081/auth/callback');
    expect(loc.searchParams.get('code')).toBe('abc123');
    expect(loc.searchParams.get('state')).toBe(state);
  });
  it('forwards a denial from GitHub', async () => {
    const state = encodeState('n', 'gitling://auth/callback');
    const res = await handle(new Request(`${W}/auth/callback?error=access_denied&state=${state}`), env);
    expect(new URL(res.headers.get('Location')!).searchParams.get('error')).toBe('access_denied');
  });
  it('refuses targets outside the allowlist', async () => {
    const res = await handle(new Request(`${W}/auth/callback?code=abc&state=${encodeState('n', 'https://evil.com/cb')}`), env);
    expect(res.status).toBe(400);
    expect(res.headers.get('Location')).toBeNull();
  });
});

describe('POST /auth/exchange', () => {
  const post = (body: unknown, origin?: string) => new Request(`${W}/auth/exchange`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) } });

  it('adds the secret and returns the token', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: 'gho_x', scope: 'repo,notifications,read:user', token_type: 'bearer' })));
    const res = await handle(post({ code: 'abcdef1234', code_verifier: verifier }, 'http://localhost:8081'), env, f as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'gho_x', scope: 'repo,notifications,read:user', token_type: 'bearer' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toMatchObject({ client_id: 'cid', client_secret: 'secret', code: 'abcdef1234', code_verifier: verifier, redirect_uri: `${W}/auth/callback` });
  });
  it('allows native apps (no Origin header)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: 'gho_y', scope: 'repo' })));
    const res = await handle(post({ code: 'abcdef1234', code_verifier: verifier }), env, f as unknown as typeof fetch);
    expect(res.status).toBe(200);
  });
  it('blocks browsers from origins not on the list', async () => {
    const f = vi.fn();
    const res = await handle(post({ code: 'abcdef1234', code_verifier: verifier }, 'https://evil.com'), env, f as unknown as typeof fetch);
    expect(res.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects malformed input without calling GitHub', async () => {
    const f = vi.fn();
    const res = await handle(post({ code: 'x', code_verifier: 'short' }), env, f as unknown as typeof fetch);
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it('explains an expired code', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'bad_verification_code' })));
    const res = await handle(post({ code: 'abcdef1234', code_verifier: verifier }), env, f as unknown as typeof fetch);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/expired/);
  });
  it('says when the secret is missing', async () => {
    const res = await handle(post({ code: 'abcdef1234', code_verifier: verifier }), { ...env, GITHUB_CLIENT_SECRET: '' });
    expect(res.status).toBe(503);
  });
  it('answers CORS preflight for allowed origins only', async () => {
    const ok = await handle(new Request(`${W}/auth/exchange`, { method: 'OPTIONS', headers: { Origin: 'https://gitling.vercel.app' } }), env);
    expect(ok.status).toBe(204);
    const no = await handle(new Request(`${W}/auth/exchange`, { method: 'OPTIONS', headers: { Origin: 'https://evil.com' } }), env);
    expect(no.status).toBe(403);
  });
});

describe('exchange input', () => {
  it('GitHub answering null (or nothing) is a 400, not a crash (found by fuzzing on Windows CI)', async () => {
    for (const reply of ['null', '', '[]']) {
      const res = await handle(new Request(`${W}/auth/exchange`, { method: 'POST', body: JSON.stringify({ code: 'abcdefgh12', code_verifier: verifier }) }), env, (async () => new Response(reply, { status: 200 })) as never);
      expect(res.status, reply).toBe(400);
    }
  });
  it('a JSON body of null is a 400, not a crash (found by fuzzing)', async () => {
    const res = await handle(new Request(`${W}/auth/exchange`, { method: 'POST', body: 'null' }), env, vi.fn() as never);
    expect(res.status).toBe(400);
  });
});

describe('rate limit', () => {
  it('refuses exchanges over the limit with 429 and never calls GitHub', async () => {
    const f = vi.fn();
    const EXCHANGE_LIMIT = { limit: vi.fn(async () => ({ success: false })) };
    const res = await handle(new Request(`${W}/auth/exchange`, { method: 'POST', headers: { 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify({ code: 'abcdef1234', code_verifier: verifier }) }), { ...env, EXCHANGE_LIMIT }, f as never);
    expect(res.status).toBe(429);
    expect(EXCHANGE_LIMIT.limit).toHaveBeenCalledWith({ key: '1.2.3.4' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('static assets', () => {
  it('hands non-auth paths to the app assets when bound', async () => {
    const ASSETS = { fetch: vi.fn(async () => new Response('<html>app</html>')) };
    const res = await handle(new Request(`${W}/repo/a/b`), { ...env, ASSETS });
    expect(await res.text()).toBe('<html>app</html>');
    expect(ASSETS.fetch).toHaveBeenCalledOnce();
  });
  it('serves the app at /auth/callback when the app and the worker share an origin (no redirect loop)', async () => {
    const ASSETS = { fetch: vi.fn(async () => new Response('<html>app</html>')) };
    const same = { ...env, ASSETS, ALLOWED_RETURN: `${W},gitling://` };
    const state = encodeState('n0nce', `${W}/auth/callback`);
    const res = await handle(new Request(`${W}/auth/callback?code=abc123&state=${state}`), same);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<html>app</html>');
    // a different path on the same origin still redirects; an evil target is still refused without touching assets
    const other = await handle(new Request(`${W}/auth/callback?code=abc123&state=${encodeState('n', `${W}/done`)}`), same);
    expect(other.status).toBe(302);
    const evil = await handle(new Request(`${W}/auth/callback?code=abc123&state=${encodeState('n', 'https://evil.com/auth/callback')}`), same);
    expect(evil.status).toBe(400);
    expect(ASSETS.fetch).toHaveBeenCalledOnce();
  });
  it('still answers /health itself', async () => {
    const ASSETS = { fetch: vi.fn() };
    const res = await handle(new Request(`${W}/health`), { ...env, ASSETS });
    expect((await res.json()).ok).toBe(true);
    expect(ASSETS.fetch).not.toHaveBeenCalled();
  });
});
