import { createApi, createClient, GitHubError, missingScopes, type Api, type GitHubClient, type User } from '@gitling/github';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { oauthConfigured } from '@/config';
import { completeSignIn, startSignIn } from './oauth';
import { tokenStore } from './tokenStore';

/**
 * Who is signed in. No token = sample-data mode (every screen still works).
 * Exposes `api` (typed endpoints) — screens use hooks in src/data/queries.ts, which read it from here.
 */
type Ctx = {
  client: GitHubClient;
  api: Api;
  isSample: boolean;
  /** One-tap sign-in is set up for this build (EXPO_PUBLIC_GITHUB_CLIENT_ID + EXPO_PUBLIC_AUTH_URL). */
  canOAuth: boolean;
  /** A one-line message for the Account screen, e.g. after GitHub revoked the token. */
  notice: string | null;
  signInWithGitHub: () => Promise<void>;
  /** Used by the web callback route. */
  finishGitHubSignIn: (p: { code?: string; state?: string; error?: string }) => Promise<void>;
  /** Validates the token against GitHub before keeping it. */
  signInWithToken: (token: string) => Promise<User>;
  signOut: (notice?: string) => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { tokenStore.get().then(setToken).catch(() => setToken(null)); }, []);

  const client = useMemo(() => createClient(token ? { kind: 'token', token } : { kind: 'sample' }), [token]);
  const api = useMemo(() => createApi(client), [client]);

  const adopt = useCallback(async (t: string, scope?: string) => {
    const me = await createApi(createClient({ kind: 'token', token: t })).me();
    await tokenStore.set(t);
    qc.clear();
    setToken(t);
    const missing = scope !== undefined ? missingScopes(scope) : [];
    setNotice(missing.length ? `Signed in, but without ${missing.join(', ')} access. Some screens will be empty.` : null);
    return me;
  }, [qc]);

  const signOut = useCallback(async (msg?: string) => {
    await tokenStore.clear();
    qc.clear();
    setToken(null);
    setNotice(msg ?? null);
  }, [qc]);

  // If GitHub rejects the token (revoked, expired), drop back to sample data and say why.
  useEffect(() => {
    if (!token) return;
    return qc.getQueryCache().subscribe((ev) => {
      const err = ev.type === 'updated' && ev.action.type === 'error' ? ev.action.error : null;
      if (err instanceof GitHubError && err.status === 401) void signOut('GitHub signed you out. Sign in again to see your data.');
    });
  }, [qc, token, signOut]);

  const signInWithGitHub = useCallback(async () => {
    const r = await startSignIn();
    if (r) await adopt(r.access_token, r.scope);
  }, [adopt]);

  const finishGitHubSignIn = useCallback(async (p: { code?: string; state?: string; error?: string }) => {
    const r = await completeSignIn(p);
    await adopt(r.access_token, r.scope);
  }, [adopt]);

  const signInWithToken = useCallback(async (raw: string) => {
    const t = raw.trim();
    if (!t) throw new GitHubError('Paste a token first.', 0);
    return adopt(t);
  }, [adopt]);

  if (token === undefined) return null;
  return (
    <SessionContext.Provider value={{ client, api, isSample: !token, canOAuth: oauthConfigured, notice, signInWithGitHub, finishGitHubSignIn, signInWithToken, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
