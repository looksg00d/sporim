'use client';

import {
  EMPTY_DRAFT,
  draftReducer,
  furthestAllowedStep,
  type BetDraft,
  type DraftAction,
  type WizardStep,
} from '@sporim/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import { nowSeconds } from '@/lib/time';
import { track } from '@/lib/analytics';
import { readStoredDraft, writeStoredDraft } from './storage';

/**
 * Holds the wizard draft for the whole `/new` tree.
 *
 * Two things are worth knowing:
 *
 * - **Hydration.** The server has no `sessionStorage`, so the first client render must
 *   match the server's: it starts from `EMPTY_DRAFT` and the stored draft is applied in an
 *   effect. `ready` says whether that has happened, and the step guard waits for it —
 *   redirecting on a draft you have not read yet would bounce every reload to step 1.
 * - **Time.** `nowSeconds()` during render would differ between server and client, so the
 *   clock is state, seeded on mount and ticked every half minute. Everything that gates on
 *   time reads it from here, which also makes the guard testable.
 */

interface DraftContextValue {
  readonly draft: BetDraft;
  readonly dispatch: (action: DraftAction) => void;
  readonly ready: boolean;
  readonly nowSeconds: number;
  readonly furthestStep: WizardStep;
  readonly clear: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

const CLOCK_TICK_MS = 30_000;

export function DraftProvider({ children }: { readonly children: ReactNode }) {
  const [draft, rawDispatch] = useReducer(draftReducer, EMPTY_DRAFT);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);

  // Restore once, before anything can gate on the draft.
  useEffect(() => {
    const stored = typeof window === 'undefined' ? null : readStoredDraft(window.sessionStorage);
    const seededNow = nowSeconds();
    setNow(seededNow);
    if (stored) {
      rawDispatch({ type: 'hydrate', draft: stored });
      track({ name: 'draft_restored', step: furthestAllowedStep(stored, seededNow) });
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(nowSeconds()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Persist every change, but only after the restore — otherwise the empty initial state
  // would overwrite the draft we are about to read.
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    writeStoredDraft(window.sessionStorage, draft);
  }, [draft, ready]);

  const clear = useCallback(() => {
    rawDispatch({ type: 'reset' });
    if (typeof window !== 'undefined') writeStoredDraft(window.sessionStorage, null);
  }, []);

  const value = useMemo<DraftContextValue>(
    () => ({
      draft,
      dispatch: rawDispatch,
      ready,
      nowSeconds: now,
      furthestStep: furthestAllowedStep(draft, now),
      clear,
    }),
    [draft, ready, now, clear],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const value = useContext(DraftContext);
  if (value === null) throw new Error('useDraft must be used inside <DraftProvider>');
  return value;
}
