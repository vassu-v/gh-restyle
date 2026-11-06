import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * First-run state for the welcome tour (src/app/welcome.tsx).
 * Someone is "new" when they've neither finished/skipped the tour nor ever saved a design. People who used
 * Gitling before the tour existed already have a saved design, so they aren't sent through it.
 *
 * Must sit OUTSIDE DesignProvider: DesignProvider saves the default design as soon as it loads, so it has to
 * read the design key before that write happens. It renders nothing until it has read both keys.
 */
export const ONBOARDED_KEY = 'gitling.onboarded.v1';
const DESIGN_KEY = 'gitling.design.v1';
/** Set while a new person hasn't finished the tour, so closing the app midway brings them back to it. */
const PENDING_KEY = 'gitling.onboarding.pending';

type Ctx = { needed: boolean; finish: () => void };
const OnboardingContext = createContext<Ctx | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [needed, setNeeded] = useState<boolean | null>(null);
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(ONBOARDED_KEY), AsyncStorage.getItem(DESIGN_KEY), AsyncStorage.getItem(PENDING_KEY)])
      .then(([done, design, pending]) => {
        const need = !done && (!design || !!pending);
        if (need && !pending) AsyncStorage.setItem(PENDING_KEY, '1').catch(() => {});
        setNeeded(need);
      })
      .catch(() => setNeeded(false)); // storage broken: never trap someone in the tour
  }, []);
  const finish = useCallback(() => {
    setNeeded(false);
    AsyncStorage.setItem(ONBOARDED_KEY, new Date().toISOString()).catch(() => {});
    AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  }, []);
  const value = useMemo(() => ({ needed: !!needed, finish }), [needed, finish]);
  if (needed === null) return null;
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const c = useContext(OnboardingContext);
  if (!c) throw new Error('useOnboarding outside OnboardingProvider');
  return c;
}
