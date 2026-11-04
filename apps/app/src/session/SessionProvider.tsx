import { createClient, GitHubError, type GitHubClient, type User } from '@gitling/github';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { tokenStore } from './tokenStore';

type Ctx = {
  client: GitHubClient;
  isSample: boolean;
  /** Validates the token against GitHub before keeping it. */
  signInWithToken: (token: string) => Promise<User>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => { tokenStore.get().then(setToken).catch(() => setToken(null)); }, []);

  const client = useMemo(() => createClient(token ? { kind: 'token', token } : { kind: 'sample' }), [token]);

  const signInWithToken = useCallback(async (raw: string) => {
    const t = raw.trim();
    if (!t) throw new GitHubError('Paste a token first.', 0);
    const me = await createClient({ kind: 'token', token: t }).request<User>('/user');
    await tokenStore.set(t);
    qc.clear();
    setToken(t);
    return me;
  }, [qc]);

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    qc.clear();
    setToken(null);
  }, [qc]);

  if (token === undefined) return null;
  return (
    <SessionContext.Provider value={{ client, isSample: !token, signInWithToken, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
