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
import { clearHandoff, takeHandoff } from './handoff';
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
 * - **A tab that is not the tab it started in.** `sessionStorage` is per-tab and a login can
 *   hand somebody a different one. So when this tab has nothing of its own, it looks for a
 *   draft handed over on the way into a login and adopts it (`handoff.ts`). Session storage
 *   is still consulted first: a tab with a draft of its own is a tab in the middle of
 *   something, and must not be overwritten by an older one.
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
    const seededNow = nowSeconds();
    setNow(seededNow);

    if (typeof window !== 'undefined') {
      // This tab's own draft wins. Only a tab that has none — a fresh one opened by a mail
      // app, or one the browser discarded and re-created — reaches for the hand-over, which
      // consumes it either way so it cannot resurface in some later sitting.
      const stored = readStoredDraft(window.sessionStorage) ?? takeHandoff(window.localStorage);
      if (stored) {
        rawDispatch({ type: 'hydrate', draft: stored });
        track({ name: 'draft_restored', step: furthestAllowedStep(stored, seededNow) });
      }
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
    if (typeof window === 'undefined') return;
    writeStoredDraft(window.sessionStorage, null);
    // The hand-over goes too. A bet that has been created is not one anybody should be
    // offered again in the next tab they open.
    clearHandoff(window.localStorage);
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
