'use client';

import { WIZARD_COPY, WIZARD_STEPS, nextStep, type WizardStep } from '@sporim/domain';
import { useRouter } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';
import { PillButton, WizardShell, color, space, typeStyle } from '@sporim/ui';
import { track } from '@/lib/analytics';
import { useStepGuard } from './useStepGuard';
import { stepNumber, stepRoute } from './steps';

/**
 * Every wizard step is the same frame: guard, dots, title, body, one primary action.
 * Pages supply the body and say when the action may be pressed — nothing else, so no step
 * can quietly invent its own navigation or its own idea of "complete".
 */

export interface StepScreenProps {
  readonly step: WizardStep;
  readonly subtitle?: string;
  readonly canContinue: boolean;
  /** Shown under the button when the step is unfinished — never a silent disabled button. */
  readonly blockedReason?: string | undefined;
  readonly cta?: string;
  readonly children: ReactNode;
  /** Overrides "go to the next step", e.g. the review step, which signs instead. */
  readonly footer?: ReactNode;
}

export function StepScreen({
  step,
  subtitle,
  canContinue,
  blockedReason,
  cta,
  children,
  footer,
}: StepScreenProps) {
  const visible = useStepGuard(step);
  const router = useRouter();

  const goNext = useCallback(() => {
    if (!canContinue) {
      track({ name: 'wizard_step_blocked', step, reason: blockedReason ?? 'incomplete' });
      return;
    }
    track({ name: 'wizard_step_completed', step });
    const next = nextStep(step);
    if (next) router.push(stepRoute(next));
  }, [canContinue, blockedReason, step, router]);

  // Holding the render avoids painting a screen the guard is about to replace.
  if (!visible) return null;

  const copy = WIZARD_COPY[step];

  return (
    <WizardShell
      step={stepNumber(step)}
      totalSteps={WIZARD_STEPS.length}
      title={copy.title}
      {...(subtitle === undefined ? {} : { subtitle })}
      footer={
        footer ?? (
          <>
            <PillButton fullWidth disabled={!canContinue} onClick={goNext}>
              {cta ?? copy.cta}
            </PillButton>
            <p
              aria-live="polite"
              style={{
                margin: 0,
                minHeight: 18,
                textAlign: 'center',
                ...typeStyle('micro'),
                color: color.inkFaint,
              }}
            >
              {canContinue ? '' : (blockedReason ?? '')}
            </p>
          </>
        )
      }
    >
      <div
        data-draft-step={step}
        style={{ display: 'flex', flexDirection: 'column', gap: space.md }}
      >
        {children}
      </div>
    </WizardShell>
  );
}
