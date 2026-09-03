'use client';

import { DECISION_MODES, TRUST_COPY, type DecisionMode } from '@sporim/domain';
import { color, radius, space, typeStyle } from '@sporim/ui';
import { useDraft } from '@/features/draft/DraftProvider';
import { StepScreen } from '@/features/draft/StepScreen';
import { track } from '@/lib/analytics';

/**
 * S4 — who decides.
 *
 * Two guards live here. A one-sided format cannot use mutual confirmation, so that option
 * is not offered at all (the reducer would refuse it anyway — this screen just stops
 * showing a door that is locked). And you cannot referee your own bet: the referee's whole
 * value is that they have no money in it.
 */

const MODE_COPY: Record<DecisionMode, { label: string; hint: string }> = {
  mutual: {
    label: 'We both confirm',
    hint: 'Fastest. If you disagree, the referee you name here steps in.',
  },
  referee: {
    label: 'A friend decides',
    hint: TRUST_COPY.refereeRole,
  },
};

function looksLikeSelf(refereeRef: string, opponentRef: string): boolean {
  const referee = refereeRef.trim().toLowerCase().replace(/^@/, '');
  if (referee.length === 0) return false;
  return referee === opponentRef.trim().toLowerCase().replace(/^@/, '');
}

export default function JudgeStepPage() {
  const { draft, dispatch } = useDraft();

  const oneSided = draft.format !== 'bet';
  const availableModes = oneSided ? (['referee'] as const) : DECISION_MODES;

  const refereeRequired = draft.decisionMode === 'referee';
  const refereeTrimmed = draft.refereeRef.trim();
  const refereeMissing = refereeRequired && refereeTrimmed.length < 2;
  const refereeIsOpponent = looksLikeSelf(draft.refereeRef, draft.opponentRef);

  const blockedReason = refereeMissing
    ? 'Name who decides if you disagree.'
    : refereeIsOpponent
      ? 'The referee cannot be the other side of the bet.'
      : undefined;

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
          REFEREE
        </label>
        <input
          id="referee"
          className="sporim-input sporim-focusable"
          value={draft.refereeRef}
          onChange={(event) => dispatch({ type: 'setRefereeRef', refereeRef: event.target.value })}
          placeholder="@handle or their name"
          maxLength={64}
          aria-invalid={refereeIsOpponent}
          aria-describedby={refereeIsOpponent ? 'referee-error' : undefined}
          style={{
            width: '100%',
            padding: space.md,
            borderRadius: radius.md,
            border: `1px solid ${refereeIsOpponent ? color.loss : color.hairlineStrong}`,
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
          {TRUST_COPY.disputeBond}
        </p>

        {refereeIsOpponent ? (
          <span
            id="referee-error"
            role="alert"
            style={{ ...typeStyle('micro'), color: color.loss }}
          >
            That is the other side of the bet. Pick someone with nothing in it.
          </span>
        ) : (
          <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>
            They only get asked if you two disagree.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
        <label htmlFor="opponent" style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
          WHO ARE YOU BETTING? (OPTIONAL)
        </label>
        <input
          id="opponent"
          className="sporim-input sporim-focusable"
          value={draft.opponentRef}
          onChange={(event) =>
            dispatch({ type: 'setOpponentRef', opponentRef: event.target.value })
          }
          placeholder="Leave blank and anyone with the link can take it"
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
        <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>
          {TRUST_COPY.linkWarning}
        </span>
      </div>
    </StepScreen>
  );
}
