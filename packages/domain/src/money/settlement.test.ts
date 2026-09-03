import { describe, expect, it } from 'vitest';
import { FEE_BPS, MAX_DISPUTE_BOND, MIN_DISPUTE_BOND } from '../constants';
import { BET_FORMATS, type BetFormat } from '../types/bet';
import { asUsdcAmount, ZERO_USDC, type UsdcAmount } from '../types/money';
import { unwrap } from '../types/result';
import {
  calculateDisputeBond,
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
      expect(s.toCreator + s.toOpponent + s.toTreasury).toBe(s.pot + s.bond);
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

describe('calculateSettlement — dispute bond routing', () => {
  const base: SettlementInput = {
    format: 'bet',
    stakeCreator: usdc(20),
    stakeOpponent: usdc(20),
    feeBps: FEE_BPS,
    outcome: 'creator_wins',
  };
  const bond = usdc(4);

  it('disputer loses the bond when the outcome goes against them', () => {
    const s = unwrap(calculateSettlement({ ...base, dispute: { by: 'opponent', bond } }));
    expect(s.bond).toBe(bond);
    expect(s.toCreator).toBe(39_400_000n + bond);
    expect(s.toOpponent).toBe(0n);
    expect(s.toCreator + s.toOpponent + s.toTreasury).toBe(s.pot + s.bond);
  });

  it('disputer keeps the bond when the outcome favours them', () => {
    const s = unwrap(
      calculateSettlement({ ...base, outcome: 'opponent_wins', dispute: { by: 'opponent', bond } }),
    );
    expect(s.toOpponent).toBe(39_400_000n + bond);
    expect(s.toCreator).toBe(0n);
  });

  it('draw returns the bond to the disputer with zero fee', () => {
    const s = unwrap(
      calculateSettlement({ ...base, outcome: 'draw', dispute: { by: 'creator', bond } }),
    );
    expect(s.fee).toBe(0n);
    expect(s.toCreator).toBe(usdc(20) + bond);
    expect(s.toOpponent).toBe(usdc(20));
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

describe('calculateDisputeBond', () => {
  it('is 10 % of the pot inside the clamp', () => {
    expect(calculateDisputeBond(usdc(40))).toBe(usdc(4));
  });
  it('clamps to the minimum for small pots', () => {
    expect(calculateDisputeBond(usdc(2))).toBe(MIN_DISPUTE_BOND);
  });
  it('clamps to the maximum for large pots', () => {
    expect(calculateDisputeBond(usdc(1_000))).toBe(MAX_DISPUTE_BOND);
  });
});

describe('feeOn', () => {
  it('computes basis points with floor', () => {
    expect(feeOn(usdc(20), 300)).toBe(600_000n);
    expect(feeOn(asUsdcAmount(33n), 300)).toBe(0n);
  });
});

describe('the dispute bond is not a free option', () => {
  const BOND = usdc(2);
  const disputed = (
    by: 'creator' | 'opponent',
    outcome: 'creator_wins' | 'opponent_wins' | 'draw' | 'refund',
  ) =>
    unwrap(
      calculateSettlement({
        format: 'bet',
        stakeCreator: usdc(20),
        stakeOpponent: usdc(20),
        feeBps: FEE_BPS,
        outcome,
        dispute: { by, bond: BOND },
      }),
    );

  // 40 pot, fee is 3% of the 20 net winnings = 0.60, so a winner is paid 39.40.
  const PAYOUT = 39_400_000n;

  it('returns the bond when the referee rules for the disputer', () => {
    const s = disputed('opponent', 'opponent_wins');
    expect(s.toOpponent).toBe(PAYOUT + BOND);
  });

  it('gives the bond to the counterparty when the referee rules against the disputer', () => {
    const s = disputed('opponent', 'creator_wins');
    expect(s.toCreator).toBe(PAYOUT + BOND);
    expect(s.toOpponent).toBe(0n);
  });

  it('returns the bond on a referee-ruled draw — the dispute had merit', () => {
    const s = disputed('opponent', 'draw');
    expect(s.toOpponent).toBe(20_000_000n + BOND);
    expect(s.toCreator).toBe(20_000_000n);
  });

  it('does NOT return the bond when the referee never ruled', () => {
    // The exploit this guards: a losing side disputes, waits out a silent referee for seven
    // days (machine.ts sends `disputed` past its deadline to `refundExpired`), and walks away
    // with a full refund. Returning the bond would make that cost nothing.
    const s = disputed('opponent', 'refund');
    expect(s.toOpponent).toBe(20_000_000n);
    expect(s.toCreator).toBe(20_000_000n + BOND);
  });

  it('costs the disputer their bond either way once they lose or go unheard', () => {
    for (const outcome of ['creator_wins', 'refund'] as const) {
      const s = disputed('opponent', outcome);
      expect(s.toOpponent).toBeLessThan(20_000_000n + BOND);
    }
  });

  it('never mints or burns money — bond included', () => {
    for (const by of ['creator', 'opponent'] as const) {
      for (const outcome of ['creator_wins', 'opponent_wins', 'draw', 'refund'] as const) {
        const s = disputed(by, outcome);
        expect(s.toCreator + s.toOpponent + s.toTreasury).toBe(s.pot + BOND);
      }
    }
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

  it('conserves money end to end with a referee share and a bond', () => {
    const s = unwrap(
      calculateSettlement({
        format: 'bet',
        stakeCreator: usdc(20),
        stakeOpponent: usdc(20),
        feeBps: FEE_BPS,
        outcome: 'creator_wins',
        ruledByReferee: true,
        dispute: { by: 'opponent', bond: usdc(2) },
      }),
    );
    expect(s.toCreator + s.toOpponent + s.toTreasury + s.toReferee).toBe(s.pot + s.bond);
  });
});
