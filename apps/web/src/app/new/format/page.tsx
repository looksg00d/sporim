'use client';

import {
  BENEFICIARY_KINDS,
  BET_FORMATS,
  FORMAT_COPY,
  MAX_STAKE,
  STAKE_PRESETS_USDC,
  formatUsdc,
  parseUsdc,
  usdc,
  type BeneficiaryKind,
} from '@sporim/domain';
import {
  FormatCard,
  MoneyFlow,
  MoneyInput,
  PillButton,
  color,
  radius,
  space,
  typeStyle,
} from '@sporim/ui';
import { useState } from 'react';
import { useDraft } from '@/features/draft/DraftProvider';
import { StepScreen } from '@/features/draft/StepScreen';
import { track } from '@/lib/analytics';
import { env } from '@/lib/env';

/**
 * S2 — format, stake, and what each side walks away with.
 *
 * The three formats are the answer to "what if only one person is betting" (docs/05): a
 * Bet has money on both sides, a Commit has money on one. Because a one-sided
 * bet has nobody with an interest in admitting they lost, choosing one forces a referee —
 * the reducer does that itself, and this screen says so out loud instead of letting the
 * judge step surprise the user two screens later.
 *
 * Every number under the fold comes from `MoneyFlow`, which reads `calculateSettlement`.
 * Nothing on this screen does arithmetic.
 */

const BENEFICIARY_COPY: Record<BeneficiaryKind, { label: string; hint: string }> = {
  friend: { label: 'A friend', hint: 'They get your stake if you miss it.' },
  charity: { label: 'A charity', hint: 'Chosen from a fixed list at settlement.' },
  vault: { label: 'Locked away', hint: 'Nobody gets it. The point is the sting.' },
};

export default function FormatStepPage() {
  const { draft, dispatch } = useDraft();
  const [customStake, setCustomStake] = useState(() =>
    draft.stake === null ? '' : formatUsdc(draft.stake),
  );
  const [customOpen, setCustomOpen] = useState(
    () =>
      draft.stake !== null && !STAKE_PRESETS_USDC.some((preset) => usdc(preset) === draft.stake),
  );

  const stakeIssue = (() => {
    if (!customOpen || customStake.trim() === '') return undefined;
    const parsed = parseUsdc(customStake);
    if (!parsed.ok) return 'Enter a plain number, like 20 or 18.50.';
    if (parsed.value < usdc(1)) return 'Minimum stake is 1 USDC.';
    if (parsed.value > MAX_STAKE) return `Maximum stake is ${formatUsdc(MAX_STAKE)} USDC.`;
    return undefined;
  })();

  function chooseStake(whole: number) {
    setCustomOpen(false);
    setCustomStake('');
    dispatch({ type: 'setStake', stake: usdc(whole) });
    track({ name: 'stake_selected', preset: whole });
  }

  function changeCustomStake(next: string) {
    setCustomStake(next);
    const parsed = parseUsdc(next);
    if (parsed.ok && parsed.value >= usdc(1) && parsed.value <= MAX_STAKE) {
      dispatch({ type: 'setStake', stake: parsed.value });
    }
  }

  const needsBeneficiary = draft.format === 'commit';
  const beneficiaryMissing = needsBeneficiary && draft.beneficiaryKind === null;
  const canContinue = draft.stake !== null && !beneficiaryMissing && stakeIssue === undefined;

  const blockedReason =
    draft.stake === null
      ? 'Pick an amount.'
      : (stakeIssue ??
        (beneficiaryMissing ? 'Say where the money goes if you miss it.' : undefined));

  return (
    <StepScreen
      step="format"
      subtitle="Who puts money in, and how much."
      canContinue={canContinue}
      blockedReason={blockedReason}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
        {BET_FORMATS.map((format) => (
          <FormatCard
            key={format}
            format={format}
            selected={draft.format === format}
            onSelect={(next) => {
              dispatch({ type: 'setFormat', format: next });
              track({ name: 'format_selected', format: next });
            }}
          />
        ))}
      </div>

      {draft.format !== 'bet' ? (
        <p style={{ margin: 0, ...typeStyle('bodySm'), color: color.inkSecondary }}>
          Only one of you has money at stake, so a referee decides this one. You pick who on the
          next-but-one screen.
        </p>
      ) : null}

      {needsBeneficiary ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
          <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
            IF YOU MISS IT, THE MONEY GOES TO
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
            {BENEFICIARY_KINDS.map((kind) => {
              const selected = draft.beneficiaryKind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  className="sporim-focusable"
                  aria-pressed={selected}
                  onClick={() =>
                    dispatch({ type: 'setBeneficiary', kind, ref: draft.beneficiaryRef })
                  }
                  style={{
                    flexGrow: 1,
                    flexBasis: 100,
                    padding: `${space.sm}px ${space.md}px`,
                    borderRadius: radius.md,
                    border: `1px solid ${selected ? color.accent : color.hairline}`,
                    background: selected ? color.surfaceRaised : 'transparent',
                    color: selected ? color.accent : color.ink,
                    cursor: 'pointer',
                    textAlign: 'left',
                    ...typeStyle('bodySm'),
                  }}
                >
                  {BENEFICIARY_COPY[kind].label}
                </button>
              );
            })}
          </div>
          {draft.beneficiaryKind ? (
            <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>
              {BENEFICIARY_COPY[draft.beneficiaryKind].hint}
            </span>
          ) : null}
          {draft.beneficiaryKind === 'friend' ? (
            <input
              className="sporim-input sporim-focusable"
              value={draft.beneficiaryRef}
              onChange={(event) =>
                dispatch({ type: 'setBeneficiary', kind: 'friend', ref: event.target.value })
              }
              placeholder="Their name or @handle (optional)"
              maxLength={64}
              style={{
                width: '100%',
                padding: space.sm,
                borderRadius: radius.sm,
                border: `1px solid ${color.hairlineStrong}`,
                background: color.surface,
                color: color.ink,
                ...typeStyle('body'),
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
        <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
          {draft.format === 'bet' ? 'EACH SIDE STAKES' : 'YOU STAKE'}
        </span>
        <div style={{ display: 'flex', gap: space.xs }}>
          {STAKE_PRESETS_USDC.map((preset) => {
            const selected = !customOpen && draft.stake === usdc(preset);
            return (
              <PillButton
                key={preset}
                variant={selected ? 'primary' : 'secondary'}
                onClick={() => chooseStake(preset)}
                style={{ flexGrow: 1, flexBasis: 0, padding: 0 }}
              >
                ${preset}
              </PillButton>
            );
          })}
          <PillButton
            variant={customOpen ? 'primary' : 'secondary'}
            onClick={() => {
              setCustomOpen(true);
              track({ name: 'stake_selected', preset: 'custom' });
            }}
            style={{ flexGrow: 1, flexBasis: 0, padding: 0 }}
          >
            Custom
          </PillButton>
        </div>

        {customOpen ? (
          <MoneyInput
            label="Amount in USDC"
            value={customStake}
            onChange={changeCustomStake}
            error={stakeIssue}
            autoFocus
          />
        ) : null}

        <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>
          Phase 0 caps a bet at {formatUsdc(MAX_STAKE)} USDC. {FORMAT_COPY[draft.format].onFail}
        </span>
      </div>

      {draft.stake !== null && stakeIssue === undefined ? (
        <MoneyFlow
          format={draft.format}
          stake={draft.stake}
          feeBps={env.feeBps}
          opponentName={draft.opponentRef}
          beneficiaryName={draft.beneficiaryRef}
        />
      ) : null}
    </StepScreen>
  );
}
