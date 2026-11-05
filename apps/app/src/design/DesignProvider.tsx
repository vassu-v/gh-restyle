import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_DESIGN, Design, resolveTokens, salvageDesign, type Tokens } from '@gitling/design';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const KEY = 'gitling.design.v1';
const MAX_UNDO = 30;

type Ctx = {
  design: Design;
  tokens: Tokens;
  /** Apply a change. Invalid results are ignored; every change can be undone. */
  update: (fn: (d: Design) => void) => void;
  replace: (d: Design) => void;
  undo: () => void;
  canUndo: boolean;
  reset: () => void;
  /** Parts of the saved design that couldn't be loaded (the full original is kept under KEY + '.unreadable'). */
  dropped: string[];
  dismissDropped: () => void;
};

type State = { design: Design; history: Design[]; loaded: boolean; dropped: string[] };

const DesignContext = createContext<Ctx | null>(null);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function apply(s: State, next: Design): State {
  const ok = Design.safeParse(next);
  if (!ok.success) return s;
  if (JSON.stringify(ok.data) === JSON.stringify(s.design)) return s; // no-op edits don't add undo steps
  return { ...s, design: ok.data, history: [...s.history.slice(-(MAX_UNDO - 1)), s.design] };
}

export function DesignProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>({ design: DEFAULT_DESIGN, history: [], loaded: false, dropped: [] });

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(async (raw) => {
        let json: unknown = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* corrupt JSON: handled below */ }
        // A saved design that a newer schema partly rejects keeps every part that still validates, instead of
        // resetting to the default. The full original is kept so nothing is lost for good.
        const got = raw ? salvageDesign(json, DEFAULT_DESIGN) : null;
        const dropped = raw && !got ? ['the whole design (unreadable)'] : (got?.dropped ?? []);
        if (dropped.length) await AsyncStorage.setItem(`${KEY}.unreadable`, raw!).catch(() => {});
        setS((x) => ({ ...x, design: got?.design ?? x.design, loaded: true, dropped }));
      })
      .catch(() => setS((x) => ({ ...x, loaded: true })));
  }, []);

  useEffect(() => {
    if (s.loaded) AsyncStorage.setItem(KEY, JSON.stringify(s.design)).catch(() => {});
  }, [s.design, s.loaded]);

  const update = useCallback((fn: (d: Design) => void) => {
    setS((x) => { const next = clone(x.design); fn(next); return apply(x, next); });
  }, []);
  const replace = useCallback((d: Design) => setS((x) => apply(x, d)), []);
  const undo = useCallback(() => setS((x) => (x.history.length ? { ...x, design: x.history[x.history.length - 1], history: x.history.slice(0, -1) } : x)), []);
  const reset = useCallback(() => setS((x) => apply(x, clone(DEFAULT_DESIGN))), []);

  const dismissDropped = useCallback(() => setS((x) => ({ ...x, dropped: [] })), []);

  const value = useMemo<Ctx>(() => ({
    design: s.design, tokens: resolveTokens(s.design), update, replace, undo, reset, canUndo: s.history.length > 0,
    dropped: s.dropped, dismissDropped,
  }), [s.design, s.history.length, update, replace, undo, reset, s.dropped, dismissDropped]);

  if (!s.loaded) return null;
  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>;
}

/**
 * Draws a subtree with another design's tokens (Studio previews of presets and imported share codes).
 * Components read tokens with useTokens(), which prefers this override.
 */
const TokensOverride = createContext<Tokens | null>(null);
export function TokensScope({ tokens, children }: { tokens: Tokens; children: ReactNode }) {
  return <TokensOverride.Provider value={tokens}>{children}</TokensOverride.Provider>;
}

export function useDesign() {
  const c = useContext(DesignContext);
  if (!c) throw new Error('useDesign outside DesignProvider');
  return c;
}
export function useTokens() {
  const override = useContext(TokensOverride);
  const own = useDesign().tokens;
  return override ?? own;
}
