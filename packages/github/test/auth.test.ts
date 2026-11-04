import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeUrl, base64url, callbackUrlFor, challengeFor, createPkce, decodeState, encodeState, exchangeCode, missingScopes } from '../src/auth';

const deps = { random: (n: number) => webcrypto.getRandomValues(new Uint8Array(n)), sha256: (d: Uint8Array) => webcrypto.subtle.digest('SHA-256', d) };

describe('PKCE', () => {
  it('challenge = base64url(sha256(verifier)), checked against Node crypto', async () => {
    const v = 'dBjftJeZ4CVP-mJ92K9IpkxvR8Nz2uX8bTrdS6BevTI';
    expect(await challengeFor(v, deps)).toBe(createHash('sha256').update(v).digest('base64url'));
  });
  it('makes a 43-char verifier', async () => {
    const p = await createPkce(deps);
    expect(p.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.challenge).toBe(await challengeFor(p.verifier, deps));
  });
  it('base64url matches Node for every length', () => {
    for (let n = 0; n < 40; n++) {
      const b = deps.random(n);
      expect(base64url(b)).toBe(Buffer.from(b).toString('base64url'));
    }
  });
});

describe('state', () => {
  it('round-trips nonce and return target, including unicode', () => {
    const s = encodeState('abc', 'https://x.dev/auth/callback?ü=1');
    expect(decodeState(s)).toEqual({ nonce: 'abc', returnTo: 'https://x.dev/auth/callback?ü=1' });
  });
  it('rejects garbage', () => {
    expect(decodeState('nodot')).toBeNull();
    expect(decodeState('.x')).toBeNull();
    expect(decodeState('a.%%%')).toBeNull();
  });
});

describe('authorize URL', () => {
  it('asks for the right scopes with S256', () => {
    const u = new URL(authorizeUrl({ clientId: 'cid', callbackUrl: callbackUrlFor('https://w.dev/'), state: 's', challenge: 'c' }));
    expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(u.searchParams.get('redirect_uri')).toBe('https://w.dev/auth/callback');
    expect(u.searchParams.get('scope')).toBe('repo notifications read:user');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('exchangeCode', () => {
  it('returns the token', async () => {
    const f = async () => new Response(JSON.stringify({ access_token: 't', scope: 'repo' }));
    expect((await exchangeCode({ authBase: 'https://w', code: 'c', verifier: 'v', fetch: f as unknown as typeof fetch })).access_token).toBe('t');
  });
  it('surfaces the worker error message', async () => {
    const f = async () => new Response(JSON.stringify({ error: 'That sign-in expired. Try again.' }), { status: 400 });
    await expect(exchangeCode({ authBase: 'https://w', code: 'c', verifier: 'v', fetch: f as unknown as typeof fetch })).rejects.toThrow(/expired/);
  });
  it('explains a network failure', async () => {
    const f = async () => { throw new TypeError('fetch failed'); };
    await expect(exchangeCode({ authBase: 'https://w', code: 'c', verifier: 'v', fetch: f as unknown as typeof fetch })).rejects.toThrow(/reach the sign-in service/);
  });
});

it('reports missing scopes', () => {
  expect(missingScopes('repo,notifications,read:user')).toEqual([]);
  expect(missingScopes('repo, user')).toEqual(['notifications']);
});
