'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { WizardStep } from '@sporim/domain';
import { useDraft } from './DraftProvider';
import { isAtOrBefore, stepRoute } from './steps';

/**
 * Keeps a step page honest: you may be on any step you have already earned, and nowhere
 * further. Someone who pastes `/new/review` into a fresh tab lands on `/new/terms`, not on
 * a review screen full of blanks.
 *
 * It waits for `ready` — the draft lives in `sessionStorage` and is applied after mount, so
 * guarding before the restore would bounce every reload back to step one.
 *
 * Returns whether this step is currently allowed, so the page can hold its render instead
 * of painting a screen it is about to navigate away from.
 */
export function useStepGuard(step: WizardStep): boolean {
  const { ready, furthestStep } = useDraft();
  const router = useRouter();
  const allowed = isAtOrBefore(step, furthestStep);

  useEffect(() => {
    if (!ready || allowed) return;
    router.replace(stepRoute(furthestStep));
  }, [ready, allowed, furthestStep, router]);

  return ready && allowed;
}
