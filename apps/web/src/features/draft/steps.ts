import { WIZARD_STEPS, type WizardStep } from '@sporim/domain';

/** One place that knows a step is also a URL segment, so nothing else has to guess. */

export const STEP_ROUTES: Record<WizardStep, string> = {
  terms: '/new/terms',
  format: '/new/format',
  deadline: '/new/deadline',
  judge: '/new/judge',
  review: '/new/review',
};

export function stepRoute(step: WizardStep): string {
  return STEP_ROUTES[step];
}

export function stepNumber(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step) + 1;
}

export function stepFromPathname(pathname: string): WizardStep | null {
  const segment = pathname.replace(/\/+$/, '').split('/').pop();
  return WIZARD_STEPS.find((step) => step === segment) ?? null;
}

/** Is `candidate` at or before `limit` in the wizard order? */
export function isAtOrBefore(candidate: WizardStep, limit: WizardStep): boolean {
  return WIZARD_STEPS.indexOf(candidate) <= WIZARD_STEPS.indexOf(limit);
}
