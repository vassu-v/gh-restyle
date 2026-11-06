import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { INSTALL_DISMISSED_KEY, isMobileBrowser, useInstall } from '@/pwa/useInstall';
import { useSession } from '@/session/SessionProvider';

/**
 * First-run state (src/app/welcome.tsx). A new person goes through, in order:
 *   1. install  — phone browsers only (not desktop, not inside the installed app): add Gitling to the home screen.
 *                 First, because on iPhone the installed app has its own storage: signing in before installing
 *                 would mean signing in twice.
 *   2. sign in  — "Sign in with GitHub", or "Look around first" with sample data.
 *   3. tour     — only once signed in, so Home's sections show your own data while you pick them. Someone who
 *                 chose to look around gets the tour the first time they sign in.
 * Someone is "new" when they've neither finished/skipped the tour nor ever saved a design. People who used
 * Gitling before the tour existed already have a saved design, so they aren't sent through it.
 *
 * Must sit OUTSIDE DesignProvider: DesignProvider saves the default design as soon as it loads, so it has to
 * read the design key before that write happens. It renders nothing until it has read its keys.
 */
export const ONBOARDED_KEY = 'gitling.onboarded.v1';
const DESIGN_KEY = 'gitling.design.v1';
/** Set while a new person hasn't finished the tour, so closing the app midway brings them back to it. */
const PENDING_KEY = 'gitling.onboarding.pending';
/** The install step was shown and passed (installed, or "continue in the browser"). */
export const INSTALL_STEP_KEY = 'gitling.onboarding.install';
/** "Look around first" was chosen on the sign-in step. */
export const SIGNIN_SKIPPED_KEY = 'gitling.onboarding.signin-skipped';

type Ctx = { newcomer: boolean; installDone: boolean; signInSkipped: boolean; passInstall: () => void; skipSignIn: () => void; finish: () => void };
const OnboardingContext = createContext<Ctx | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ newcomer: boolean; installDone: boolean; signInSkipped: boolean } | null>(null);
  useEffect(() => {
    Promise.all([ONBOARDED_KEY, DESIGN_KEY, PENDING_KEY, INSTALL_STEP_KEY, SIGNIN_SKIPPED_KEY].map((k) => AsyncStorage.getItem(k)))
      .then(([done, design, pending, install, skipped]) => {
        const newcomer = !done && (!design || !!pending);
        if (newcomer && !pending) AsyncStorage.setItem(PENDING_KEY, '1').catch(() => {});
        setState({ newcomer, installDone: !!install, signInSkipped: !!skipped });
      })
      .catch(() => setState({ newcomer: false, installDone: true, signInSkipped: true })); // storage broken: never trap someone
  }, []);
  const mark = useCallback((key: string, patch: Partial<NonNullable<typeof state>>) => {
    setState((s) => (s ? { ...s, ...patch } : s));
    AsyncStorage.setItem(key, new Date().toISOString()).catch(() => {});
  }, []);
  // Passing the install screen also snoozes the install card on Home (src/pwa/InstallSheet.tsx) for its usual 14 days.
  const passInstall = useCallback(() => {
    AsyncStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now())).catch(() => {});
    mark(INSTALL_STEP_KEY, { installDone: true });
  }, [mark]);
  const skipSignIn = useCallback(() => mark(SIGNIN_SKIPPED_KEY, { signInSkipped: true }), [mark]);
  const finish = useCallback(() => {
    mark(ONBOARDED_KEY, { newcomer: false });
    AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  }, [mark]);
  const value = useMemo(() => (state ? { ...state, passInstall, skipSignIn, finish } : null), [state, passInstall, skipSignIn, finish]);
  if (!value) return null;
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const c = useContext(OnboardingContext);
  if (!c) throw new Error('useOnboarding outside OnboardingProvider');
  return c;
}

export type FirstRunStep = 'install' | 'signin' | 'tour';

/** The first-run step this person is on, or null when there's nothing to show (Home shows as usual). */
export function useFirstRun(): FirstRunStep | null {
  const { newcomer, installDone, signInSkipped } = useOnboarding();
  const { isSample } = useSession();
  const { state } = useInstall();
  if (!newcomer) return null;
  if (!installDone && isMobileBrowser() && state !== 'installed') return 'install';
  if (!isSample) return 'tour';
  return signInSkipped ? null : 'signin';
}
