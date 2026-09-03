import {
  ZERO_USDC,
  calculateSettlement,
  formatUsdc,
  subUsdc,
  type BetFormat,
  type UsdcAmount,
} from '@sporim/domain';
import { color, radius, space, typeStyle } from '../tokens';
import { Icon } from '../primitives/Icon';

/**
 * "Where does my money actually go?" — the loudest question in the comment corpus
 * (docs/06 §1), and the one the three format cards on their own do not answer.
 *
 * Two branches, both always shown, because the whole point of a one-sided format is that
 * the two outcomes are *not* symmetric: a kept Commit returns the stake untouched and
 * costs nothing, while a missed one hands it over. Reading only the good branch is how a
 * person ends up surprised, and a surprised person disputes.
 *
 * Every number comes from `calculateSettlement`. This component performs no arithmetic —
 * if a figure here disagreed with the chain, the chain would be right and the screen would
 * be lying.
 */

export interface MoneyFlowProps {
  readonly format: BetFormat;
  readonly stake: UsdcAmount;
  readonly feeBps: number;
  readonly opponentName?: string | undefined;
  readonly beneficiaryName?: string | undefined;
}

interface BranchCopy {
  /** What happened, in the user's own frame. */
  readonly condition: string;
  /** Where the money ends up. `{who}` and `{amount}` are filled in below. */
  readonly destination: string;
}

function branchCopy(
  format: BetFormat,
  them: string,
  beneficiary: string,
): { good: BranchCopy; bad: BranchCopy } {
  switch (format) {
    case 'bet':
      return {
        good: { condition: 'You win', destination: 'You take' },
        bad: { condition: 'You lose', destination: `${them} takes` },
      };
    case 'commit':
      return {
        good: { condition: 'You do it', destination: 'Your stake comes back' },
        bad: { condition: 'You miss it', destination: `${beneficiary} gets` },
      };
  }
}

function Branch({
  tone,
  condition,
  destination,
  amount,
  delta,
  note,
}: {
  readonly tone: 'good' | 'bad';
  readonly condition: string;
  readonly destination: string;
  readonly amount: string;
  readonly delta: string;
  readonly note: string;
}) {
  const accent = tone === 'good' ? color.accent : color.loss;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.xs,
        flexGrow: 1,
        flexBasis: 0,
        padding: space.md,
        borderRadius: radius.md,
        border: `1px solid ${color.hairline}`,
        background: color.surface,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.xxs + 2,
          ...typeStyle('labelCapsSm'),
          color: accent,
          textTransform: 'uppercase',
        }}
      >
        <Icon name={tone === 'good' ? 'check' : 'clock'} size={13} strokeWidth={2.4} />
        {condition}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xxs }}>
        <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>{destination}</span>
        <span style={{ ...typeStyle('value'), color: color.ink }}>{amount}</span>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: space.xs,
          borderTop: `1px dashed ${color.hairlineStrong}`,
          paddingTop: space.xs,
        }}
      >
        <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>{note}</span>
        <span style={{ ...typeStyle('bodySm'), fontWeight: 600, color: accent }}>{delta}</span>
      </div>
    </div>
  );
}

export function MoneyFlow({
  format,
  stake,
  feeBps,
  opponentName,
  beneficiaryName,
}: MoneyFlowProps) {
  const stakeOpponent = format === 'bet' ? stake : ZERO_USDC;
  const shared = { format, stakeCreator: stake, stakeOpponent, feeBps } as const;

  const good = calculateSettlement({ ...shared, outcome: 'creator_wins' });
  const bad = calculateSettlement({ ...shared, outcome: 'opponent_wins' });

  if (!good.ok || !bad.ok) {
    return (
      <div role="alert" style={{ ...typeStyle('bodySm'), color: color.loss }}>
        Check the stake.
      </div>
    );
  }

  // "The other side", not "They": the same template also takes a name, and a template that
  // reads "Dima takes" cannot also read "They takes". A noun keeps the verb agreeing either way.
  const them = opponentName?.trim() || 'The other side';
  const beneficiary = beneficiaryName?.trim() || 'Whoever you named';
  const copy = branchCopy(format, them, beneficiary);

  // A Commit that goes the creator's way returns the stake and takes no fee at all,
  // so the "you gained" line would read "+0.00" — say "nothing changes hands" instead.
  const goodNet = good.value.toCreator > stake ? subUsdc(good.value.toCreator, stake) : ZERO_USDC;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
      <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
        WHERE THE MONEY GOES
      </span>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
        <Branch
          tone="good"
          condition={copy.good.condition}
          destination={copy.good.destination}
          amount={`${formatUsdc(good.value.toCreator, { minDecimals: 2 })} USDC`}
          delta={goodNet > ZERO_USDC ? `+${formatUsdc(goodNet, { minDecimals: 2 })}` : '±0.00'}
          note={good.value.fee === ZERO_USDC ? 'No fee.' : `After the ${feeBps / 100}% fee.`}
        />
        <Branch
          tone="bad"
          condition={copy.bad.condition}
          destination={copy.bad.destination}
          amount={`${formatUsdc(bad.value.toOpponent, { minDecimals: 2 })} USDC`}
          delta={`−${formatUsdc(stake, { minDecimals: 2 })}`}
          note={bad.value.fee === ZERO_USDC ? 'No fee.' : `After the ${feeBps / 100}% fee.`}
        />
      </div>
    </div>
  );
}
