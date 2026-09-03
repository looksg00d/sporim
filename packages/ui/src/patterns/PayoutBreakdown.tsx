import {
  calculateSettlement,
  formatUsdc,
  subUsdc,
  ZERO_USDC,
  type BetFormat,
  type UsdcAmount,
} from '@sporim/domain';
import { color, space, typeStyle } from '../tokens';

export interface PayoutBreakdownProps {
  readonly format: BetFormat;
  readonly stake: UsdcAmount;
  readonly feeBps: number;
  /** Whose point of view: what *you* get if you win, and what you lose if you don't. */
  readonly perspective?: 'creator' | 'opponent';
}

/**
 * The honest answer to "where does the money go" — the loudest question in the comment
 * corpus (docs/06 §1). Every number here comes from `calculateSettlement`; this component
 * performs no arithmetic of its own, so the UI can never drift from the chain.
 */
export function PayoutBreakdown({
  format,
  stake,
  feeBps,
  perspective = 'creator',
}: PayoutBreakdownProps) {
  const stakeOpponent = format === 'bet' ? stake : ZERO_USDC;
  const win = calculateSettlement({
    format,
    stakeCreator: stake,
    stakeOpponent,
    feeBps,
    outcome: perspective === 'creator' ? 'creator_wins' : 'opponent_wins',
  });

  if (!win.ok) {
    return (
      <div role="alert" style={{ ...typeStyle('bodySm'), color: color.loss }}>
        Check the stake.
      </div>
    );
  }

  const settlement = win.value;
  const youReceive = perspective === 'creator' ? settlement.toCreator : settlement.toOpponent;
  const youStaked = perspective === 'creator' ? stake : stakeOpponent;
  const netGain = youReceive > youStaked ? subUsdc(youReceive, youStaked) : ZERO_USDC;

  const rows = [
    { label: 'Your stake', value: `${formatUsdc(youStaked)} USDC` },
    { label: 'Pot', value: `${formatUsdc(settlement.pot)} USDC` },
    { label: `Fee ${feeBps / 100}%`, value: `${formatUsdc(settlement.fee)} USDC` },
  ] as const;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.sm - 2,
        ...typeStyle('bodySm'),
      }}
    >
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: color.inkSecondary }}>{row.label}</span>
          <span style={{ color: color.ink }}>{row.value}</span>
        </div>
      ))}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: `1px dashed ${color.hairlineStrong}`,
          paddingTop: space.sm - 2,
        }}
      >
        <span style={{ color: color.inkSecondary }}>If you win</span>
        <span style={{ ...typeStyle('value'), color: color.accent }}>
          {netGain > ZERO_USDC ? `+${formatUsdc(netGain)}` : formatUsdc(youReceive)} USDC
        </span>
      </div>

      {youStaked > ZERO_USDC ? (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: color.inkSecondary }}>If you lose</span>
          <span style={{ color: color.loss, fontWeight: 600 }}>−{formatUsdc(youStaked)} USDC</span>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: color.inkSecondary }}>If you lose</span>
          <span style={{ color: color.inkSecondary }}>You staked nothing</span>
        </div>
      )}
    </div>
  );
}
