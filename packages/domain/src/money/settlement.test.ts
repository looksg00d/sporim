import { describe, expect, it } from 'vitest';
import { FEE_BPS } from '../constants';
import { BET_FORMATS, type BetFormat } from '../types/bet';
import { asUsdcAmount, ZERO_USDC, type UsdcAmount } from '../types/money';
import { unwrap } from '../types/result';
import {
  calculateSettlement,
  feeOn,
  type SettlementInput,
  type SettlementOutcome,
} from './settlement';
import { parseUsdc, usdc } from './usdc';

const STAKES = ['5', '10', '25', '99.99'] as const;
const OUTCOMES: readonly SettlementOutcome[] = ['creator_wins', 'opponent_wins', 'draw', 'refund'];

function stakesFor(
  format: BetFormat,
  stake: UsdcAmount,
): Pick<SettlementInput, 'stakeCreator' | 'stakeOpponent'> {
  return { stakeCreator: stake, stakeOpponent: format === 'bet' ? stake : ZERO_USDC };
}

describe('calculateSettlement — invariants across formats × outcomes × stakes', () => {
  const cases = BET_FORMATS.flatMap((format) =>
    OUTCOMES.flatMap((outcome) => STAKES.map((stake) => [format, outcome, stake] as const)),
  );

  it.each(cases)(
    '%s / %s / %s USDC conserves money and never taxes a refund',
    (format, outcome, stakeText) => {
      const stake = unwrap(parseUsdc(stakeText));
      const input: SettlementInput = {
        format,
        ...stakesFor(format, stake),
        feeBps: FEE_BPS,
        outcome,
      };
      const s = unwrap(calculateSettlement(input));

      // Money in == money out, always.
      expect(s.toCreator + s.toOpponent + s.toTreasury).toBe(s.pot);
      expect(s.pot).toBe(input.stakeCreator + input.stakeOpponent);
      expect(s.toTreasury).toBe(s.fee);

      if (outcome === 'draw' || outcome === 'refund') {
        expect(s.kind).toBe('refund');
        expect(s.fee).toBe(0n);
        expect(s.toCreator).toBe(input.stakeCreator);
        expect(s.toOpponent).toBe(input.stakeOpponent);
      } else {
        expect(s.kind).toBe('payout');
        // Fee is on net winnings only and floors: fee <= net * bps / 10_000.
        const net =
          outcome === 'creator_wins'
            ? format === 'bet'
              ? input.stakeOpponent
              : 0n
            : input.stakeCreator;
        expect(s.fee).toBe((net * BigInt(FEE_BPS)) / 10_000n);
        expect(s.fee <= net).toBe(true);
      }
    },
  );
});

describe('calculateSettlement — known values', () => {
  it('Bet $20 vs $20, creator wins → fee 0.60, creator gets 39.40', () => {
    const s = unwrap(
      calculateSettlement({
        format: 'bet',
        stakeCreator: usdc(20),
        stakeOpponent: usdc(20),
        feeBps: FEE_BPS,
        outcome: 'creator_wins',
      }),
    );
    expect(s.winner).toBe('creator');
    expect(s.fee).toBe(600_000n);
    expect(s.toCreator).toBe(39_400_000n);
    expect(s.toOpponent).toBe(0n);
  });

  it('Bet $20 vs $20, opponent wins → symmetric', () => {
    const s = unwrap(
      calculateSettlement({
        format: 'bet',
        stakeCreator: usdc(20),
        stakeOpponent: usdc(20),
        feeBps: FEE_BPS,
        outcome: 'opponent_wins',
      }),
    );
    expect(s.winner).toBe('opponent');
    expect(s.toOpponent).toBe(39_400_000n);
    expect(s.toCreator).toBe(0n);
  });

  it('Commit $50 kept → author gets the full stake back, fee 0', () => {
    const s = unwrap(
      calculateSettlement({
        format: 'commit',
        stakeCreator: usdc(50),
        stakeOpponent: ZERO_USDC,
        feeBps: FEE_BPS,
        outcome: 'creator_wins',
      }),
    );
    expect(s.kind).toBe('payout');
    expect(s.fee).toBe(0n);
    expect(s.toCreator).toBe(usdc(50));
  });

  it('Commit $50 failed → beneficiary (opponent side) gets 48.50, fee 1.50', () => {
    const s = unwrap(
      calculateSettlement({
        format: 'commit',
        stakeCreator: usdc(50),
        stakeOpponent: ZERO_USDC,
        feeBps: FEE_BPS,
        outcome: 'opponent_wins',
      }),
    );
    expect(s.winner).toBe('opponent');
    expect(s.fee).toBe(1_500_000n);
    expect(s.toOpponent).toBe(48_500_000n);
  });

  it('floors the fee so the remainder stays with the user', () => {
    // 0.000001 USDC net → 3% is 0.00000003 → floors to 0.
    const s = unwrap(
      calculateSettlement({
        format: 'bet',
        stakeCreator: asUsdcAmount(1n),
        stakeOpponent: asUsdcAmount(1n),
        feeBps: FEE_BPS,
        outcome: 'creator_wins',
      }),
    );
    expect(s.fee).toBe(0n);
    expect(s.toCreator).toBe(2n);
  });
});

describe('calculateSettlement — validation', () => {
  it('rejects fee above the 10 % ceiling', () => {
    const r = calculateSettlement({
      format: 'bet',
      stakeCreator: usdc(5),
      stakeOpponent: usdc(5),
      feeBps: 1_001,
      outcome: 'draw',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_FEE_BPS');
  });

  it.each([
    ['bet with unequal stakes', { format: 'bet', stakeCreator: usdc(5), stakeOpponent: usdc(6) }],
    [
      'commit with an opponent stake',
      { format: 'commit', stakeCreator: usdc(5), stakeOpponent: usdc(5) },
    ],
    ['zero creator stake', { format: 'bet', stakeCreator: ZERO_USDC, stakeOpponent: ZERO_USDC }],
  ] as const)('rejects %s', (_label, stakes) => {
    const r = calculateSettlement({ ...stakes, feeBps: FEE_BPS, outcome: 'creator_wins' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_STAKES');
  });
});

describe('feeOn', () => {
  it('computes basis points with floor', () => {
    expect(feeOn(usdc(20), 300)).toBe(600_000n);
    expect(feeOn(asUsdcAmount(33n), 300)).toBe(0n);
  });
});

describe('the referee is paid out of the fee, never on top of it', () => {
  const bet20 = (extra: Partial<SettlementInput> = {}) =>
    unwrap(
      calculateSettlement({
        format: 'bet',
        stakeCreator: usdc(20),
        stakeOpponent: usdc(20),
        feeBps: FEE_BPS,
        outcome: 'creator_wins',
        ...extra,
      }),
    );

  it('pays nothing to a referee who never ruled', () => {
    const s = bet20();
    expect(s.toReferee).toBe(0n);
    expect(s.toTreasury).toBe(s.fee);
  });

  it('pays a third of the fee to a referee who did rule', () => {
    const s = bet20({ ruledByReferee: true });
    expect(s.fee).toBe(600_000n); // 3% of the 20 net winnings
    expect(s.toReferee).toBe(200_000n); // 1% of net winnings
    expect(s.toTreasury).toBe(400_000n); // 2% — the remainder
  });

  it('never changes what the parties pay', () => {
    expect(bet20({ ruledByReferee: true }).fee).toBe(bet20().fee);
    expect(bet20({ ruledByReferee: true }).toCreator).toBe(bet20().toCreator);
  });

  it('always splits the fee exactly — nothing is minted or lost', () => {
    for (const ruled of [true, false]) {
      const s = bet20({ ruledByReferee: ruled });
      expect(s.toTreasury + s.toReferee).toBe(s.fee);
    }
  });

  it('pays a referee nothing on a draw, because there are no winnings to take a share of', () => {
    const s = bet20({ outcome: 'draw', ruledByReferee: true });
    expect(s.toReferee).toBe(0n);
    expect(s.fee).toBe(0n);
  });

  it('pays a referee nothing on a kept Commit — the same reason', () => {
    const s = unwrap(
      calculateSettlement({
        format: 'commit',
        stakeCreator: usdc(20),
        stakeOpponent: ZERO_USDC,
        feeBps: FEE_BPS,
        outcome: 'creator_wins',
        ruledByReferee: true,
      }),
    );
    expect(s.fee).toBe(0n);
    expect(s.toReferee).toBe(0n);
  });

  it('never pays the referee more than the fee collected, whatever the fee is set to', () => {
    for (const feeBps of [0, 50, 100, 300, 1000]) {
      const s = unwrap(
        calculateSettlement({
          format: 'bet',
          stakeCreator: usdc(20),
          stakeOpponent: usdc(20),
          feeBps,
          outcome: 'creator_wins',
          ruledByReferee: true,
        }),
      );
      expect(s.toReferee).toBeLessThanOrEqual(s.fee);
      expect(s.toTreasury + s.toReferee).toBe(s.fee);
    }
  });

  it('conserves money end to end with a referee share', () => {
    const s = unwrap(
      calculateSettlement({
        format: 'bet',
        stakeCreator: usdc(20),
        stakeOpponent: usdc(20),
        feeBps: FEE_BPS,
        outcome: 'creator_wins',
        ruledByReferee: true,
      }),
    );
    expect(s.toCreator + s.toOpponent + s.toTreasury + s.toReferee).toBe(s.pot);
  });
});
