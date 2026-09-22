'use client';

import { DECISION_MODES, TRUST_COPY, type DecisionMode } from '@sporim/domain';
import { color, radius, space, typeStyle } from '@sporim/ui';
import { useDraft } from '@/features/draft/DraftProvider';
import { StepScreen } from '@/features/draft/StepScreen';
import { track } from '@/lib/analytics';

/**
 * S4 — who decides.
 *
 * A one-sided format cannot use mutual confirmation, so that option is not offered at all (the
 * reducer would refuse it anyway — this screen just stops showing a door that is locked).
 *
 * The other side is not asked for here (2026-09-17): whoever takes the link is them, under
 * their own name. A typed name bound to nothing, so the check that the referee is not that
 * name went with it — the real guard is where the accounts are known, in the accept and
 * referee links, which refuse each other's holder (0004, 0011).
 */

const MODE_COPY: Record<DecisionMode, { label: string; hint: string }> = {
  mutual: {
    label: 'We both confirm',
    // Nobody named is a real choice, and it has a consequence worth saying up front (2026-09-17).
    hint: 'Fastest. If you disagree, a referee you name below steps in — name nobody, and you both get your money back.',
  },
  referee: {
    label: 'A friend decides',
    hint: TRUST_COPY.refereeRole,
  },
};

export default function JudgeStepPage() {
  const { draft, dispatch } = useDraft();

  const oneSided = draft.format !== 'bet';
  const availableModes = oneSided ? (['referee'] as const) : DECISION_MODES;

  const refereeRequired = draft.decisionMode === 'referee';
  const refereeTrimmed = draft.refereeRef.trim();
  const refereeMissing = refereeRequired && refereeTrimmed.length < 2;

  const blockedReason = refereeMissing ? 'Name who decides if you disagree.' : undefined;

  return (
    <StepScreen
      step="judge"
      subtitle="If the two of you disagree after the deadline, somebody has to call it."
      canContinue={blockedReason === undefined}
      blockedReason={blockedReason}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
        {availableModes.map((mode) => {
          const selected = draft.decisionMode === mode;
          return (
            <button
              key={mode}
              type="button"
              className="sporim-focusable"
              aria-pressed={selected}
              onClick={() => {
                dispatch({ type: 'setDecisionMode', decisionMode: mode });
                track({ name: 'decision_mode_selected', mode });
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: space.xxs,
                width: '100%',
                textAlign: 'left',
                padding: space.md,
                borderRadius: radius.md,
                border: `1px solid ${selected ? color.accent : color.hairline}`,
                background: selected ? color.surfaceRaised : color.surface,
                cursor: 'pointer',
              }}
            >
              <span
                style={{ ...typeStyle('headingMd'), color: selected ? color.accent : color.ink }}
              >
                {MODE_COPY[mode].label}
              </span>
              <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>
                {MODE_COPY[mode].hint}
              </span>
            </button>
          );
        })}
      </div>

      {oneSided ? (
        <p style={{ margin: 0, ...typeStyle('bodySm'), color: color.inkSecondary }}>
          Only one of you has money at stake, so mutual confirmation would mean asking the person
          with nothing to lose. A referee it is.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
        <label htmlFor="referee" style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
          {refereeRequired ? 'REFEREE' : 'REFEREE (OPTIONAL)'}
        </label>
        <input
          id="referee"
          className="sporim-input sporim-focusable"
          value={draft.refereeRef}
          onChange={(event) => dispatch({ type: 'setRefereeRef', refereeRef: event.target.value })}
          placeholder="@handle or their name"
          maxLength={64}
          style={{
            width: '100%',
            padding: space.md,
            borderRadius: radius.md,
            border: `1px solid ${color.hairlineStrong}`,
            background: color.surface,
            color: color.ink,
            ...typeStyle('body'),
          }}
        />
        <p
          style={{
            margin: 0,
            padding: space.sm,
            borderRadius: radius.sm,
            border: `1px solid ${color.hairline}`,
            ...typeStyle('micro'),
            color: color.inkSecondary,
          }}
        >
          {refereeTrimmed ? TRUST_COPY.disputing : TRUST_COPY.disputingMutual}
        </p>
        <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>
          They only get asked if you two disagree. Whoever takes your link is the other side.
        </span>
      </div>
    </StepScreen>
  );
}
