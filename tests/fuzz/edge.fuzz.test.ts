import { runs } from './runs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeState } from '../../packages/github/src/auth';
import { handle, isAllowedReturn, returnTarget, type Env } from '../../services/edge/src/index';

const ORIGINS = ['https://gitling.example.com', 'http://localhost:8081'];
const env: Env = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'secret', ALLOWED_RETURN: `${ORIGINS.join(', ')}, gitling://auth/callback` };
const W = 'https://auth.example.workers.dev';

/** What the allowlist is supposed to mean, written independently of isAllowedReturn. */
function allowedByOracle(target: string): boolean {
  let u: URL;
  try { u = new URL(target); } catch { return false; }
  if (u.protocol === 'http:' || u.protocol === 'https:') return ORIGINS.includes(u.origin);
  if (u.protocol === 'gitling:') return (u.host + u.pathname).replace(/^\/+|\/+$/g, '') === 'auth/callback';
  return false;
}

const hosts = ['gitling.example.com', 'localhost'];
const hostileTarget = fc.tuple(
  fc.constantFrom('https', 'http', 'HTTPS', 'hTtP', 'blob:https', 'blob:http', 'ws', 'wss', 'ftp', 'javascript', 'gitling', 'GITLING', 'view-source:https'),
  fc.constantFrom('://', ':/', ':', ':\\\\', '://\\', ':///', '://\t'),
  fc.constantFrom('', 'evil.com@', 'user:pass@', 'evil.com\\@', 'evil.com%40', 'evil.com#@', 'evil.com?@', 'xn--80ak6aa92e.com@', 'аpple.com@', 'evil.com%2f@'),
  fc.constantFrom(...hosts, 'GITLING.example.com', 'gitling.example.com.', 'gitling.example.com..', 'gitling%2eexample.com', 'gitling。example。com', 'ｇitling.example.com', 'xn--gitling-9za.example.com', '127.0.0.1', '[::1]', 'auth', 'evil.com'),
  fc.constantFrom('', ':443', ':80', ':8081', ':8082', ':0', ':65536', '.evil.com', '@evil.com', '\\@evil.com', '%00.evil.com', '\\', '\\\\evil.com', '%2f%2fevil.com', '\u0000', ':@evil.com'),
  fc.constantFrom('', '/', '/auth/callback', '/callback', '//evil.com', '/../evil', '?x=https://gitling.example.com', '#x'),
).map((p) => p.join(''));
const anyTarget = fc.oneof(hostileTarget, fc.webUrl({ withQueryParameters: true, withFragments: true }), fc.fullUnicodeString());

describe('isAllowedReturn', () => {
  it('never accepts a URL the allowlist does not cover (hostile hosts)', () => {
    fc.assert(fc.property(anyTarget, (t) => {
      if (isAllowedReturn(t, env)) expect(allowedByOracle(t), t).toBe(true);
    }), { numRuns: runs(1000), examples: [['blob:https://gitling.example.com/x']] });
  });

  it('an http(s) rule only ever admits http(s) URLs of exactly that origin', () => {
    const httpOnly = { ...env, ALLOWED_RETURN: ORIGINS.join(',') };
    fc.assert(fc.property(anyTarget, (t) => {
      if (!isAllowedReturn(t, httpOnly)) return;
      const u = new URL(t);
      expect(['http:', 'https:'], t).toContain(u.protocol);
      expect(ORIGINS).toContain(u.origin);
    }), { numRuns: runs(1000), examples: [['blob:https://gitling.example.com/x']] });
  });
});

describe('state round-trip', () => {
  const nonce = fc.stringOf(fc.constantFrom(...'abcXYZ019-_'.split('')), { minLength: 1, maxLength: 43 });
  it('returnTarget(encodeState(n, x)) === x for arbitrary unicode', () => {
    fc.assert(fc.property(nonce, fc.fullUnicodeString({ maxLength: 200 }), (n, x) => {
      expect(returnTarget(encodeState(n, x))).toBe(x);
    }), { numRuns: runs(1000) });
  });
  it('returnTarget never throws', () => {
    fc.assert(fc.property(fc.fullUnicodeString(), (s) => { returnTarget(s); }), { numRuns: runs(1000) });
  });
});

describe('handle()', () => {
  const ghStub = (body: string, status: number): typeof fetch => async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
  const pathArb = fc.oneof(fc.constantFrom('/auth/callback', '/auth/exchange', '/health', '/', '/auth', '/auth/callback/'), fc.webPath());
  const queryArb = fc.oneof(
    fc.constant(''),
    fc.webQueryParameters(),
    fc.dictionary(fc.constantFrom('code', 'state', 'error', 'error_description', 'x'), fc.fullUnicodeString({ maxLength: 40 }))
      .map((d) => new URLSearchParams(d).toString()),
  );
  const originArb = fc.option(fc.constantFrom(...ORIGINS, 'https://evil.com', 'null', 'gitling://auth', ''), { nil: undefined });
  const bodyArb = fc.oneof(fc.fullUnicodeString(), fc.jsonValue().map((v) => JSON.stringify(v)),
    fc.record({ code: fc.oneof(fc.string(), fc.constant('abcdefgh12')), code_verifier: fc.oneof(fc.string(), fc.constant('a'.repeat(43))) }).map((v) => JSON.stringify(v)));
  const ghArb = fc.tuple(fc.oneof(fc.string(), fc.jsonValue().map((v) => JSON.stringify(v)), fc.constant('{"access_token":"t"}')), fc.constantFrom(200, 400, 401, 404, 500, 502));

  it('never throws or answers 5xx for arbitrary GET/POST/OPTIONS without ASSETS', async () => {
    await fc.assert(fc.asyncProperty(fc.constantFrom('GET', 'POST', 'OPTIONS', 'HEAD', 'PUT', 'DELETE'), pathArb, queryArb, originArb, bodyArb, ghArb,
      async (method, path, query, origin, body, [ghBody, ghStatus]) => {
        let req: Request;
        try {
          const headers: Record<string, string> = {};
          if (origin !== undefined) headers.Origin = origin;
          req = new Request(`${W}${path}${query ? '?' + query : ''}`, { method, headers, body: method === 'POST' || method === 'PUT' ? body : undefined });
        } catch { return; } // not a request a client could send
        const res = await handle(req, env, ghStub(ghBody, ghStatus));
        expect(res.status, `${method} ${path}?${query}`).toBeLessThan(500);
      }), { numRuns: runs(300) });
  });

  it('/auth/callback never 302s to a target outside the allowlist', async () => {
    const nonce = fc.stringOf(fc.constantFrom(...'abc019-_'.split('')), { minLength: 1, maxLength: 10 });
    const state = fc.oneof(fc.fullUnicodeString(), fc.tuple(nonce, anyTarget).map(([n, t]) => encodeState(n, t)));
    await fc.assert(fc.asyncProperty(state, fc.option(fc.fullUnicodeString({ maxLength: 20 })), async (s, code) => {
      const q = new URLSearchParams({ state: s, ...(code != null ? { code } : {}) });
      const res = await handle(new Request(`${W}/auth/callback?${q}`), env);
      expect(res.status).toBeLessThan(500);
      if (res.status === 302) {
        const loc = res.headers.get('Location')!;
        expect(allowedByOracle(loc), loc).toBe(true);
      }
    }), { numRuns: runs(500), examples: [[encodeState('n', 'blob:https://gitling.example.com/x'), 'c0de']] });
  });
});
