import {
  BPS_DENOMINATOR,
  REFEREE_FEE_SHARE_BPS,
  DISPUTE_BOND_BPS,
  MAX_DISPUTE_BOND,
  MAX_FEE_BPS,
  MIN_DISPUTE_BOND,
} from '../constants';
import type { BetFormat, Outcome, PartySide } from '../types/bet';
import { addUsdc, asUsdcAmount, subUsdc, ZERO_USDC, type UsdcAmount } from '../types/money';

function minUsdc(a: UsdcAmount, b: UsdcAmount): UsdcAmount {
  return a < b ? a : b;
}
import { err, ok, type Result } from '../types/result';

/**
 * Single source of truth for every number the product shows, the mock emits and the
 * on-chain program must reproduce (docs/09 §2.5 "Money rules", T5.11 parity test).
 *
 * Fee policy (Q1, accepted): the fee is charged on NET WINNINGS only — never on a returned
 * stake, never on a refund or a draw. Rounding always floors the fee, so the remainder
 * stays with the user.
 *
 * Sides: for Commit the "opponent" side is the beneficiary (friend/charity/vault). Mapping a
 * side to a wallet is the chain layer's job.
 */

export type SettlementOutcome = Outcome | 'refund';

export interface DisputeInput {
  readonly by: PartySide;
  readonly bond: UsdcAmount;
}

export interface SettlementInput {
  readonly format: BetFormat;
  readonly stakeCreator: UsdcAmount;
  readonly stakeOpponent: UsdcAmount;
  readonly feeBps: number;
  readonly outcome: SettlementOutcome;
  readonly dispute?: DisputeInput | null;
  /** True when a referee decided this outcome, which is the only thing that earns their share. */
  readonly ruledByReferee?: boolean;
}

export interface Settlement {
  readonly kind: 'payout' | 'refund';
  readonly winner: PartySide | null;
  readonly pot: UsdcAmount;
  readonly bond: UsdcAmount;
  /** What the parties pay in total. `toTreasury + toReferee` always equals this. */
  readonly fee: UsdcAmount;
  readonly toCreator: UsdcAmount;
  readonly toOpponent: UsdcAmount;
  readonly toTreasury: UsdcAmount;
  /** Non-zero only when a referee actually ruled. Comes out of the fee, never on top. */
  readonly toReferee: UsdcAmount;
}

export type SettlementError =
  | { readonly code: 'INVALID_FEE_BPS'; readonly feeBps: number }
  | { readonly code: 'INVALID_STAKES'; readonly reason: string };

export function feeOn(netWinnings: UsdcAmount, feeBps: number): UsdcAmount {
  return asUsdcAmount((netWinnings * BigInt(feeBps)) / BPS_DENOMINATOR);
}

export function otherSide(side: PartySide): PartySide {
  return side === 'creator' ? 'opponent' : 'creator';
}

function validate(input: SettlementInput): SettlementError | null {
  const { feeBps, format, stakeCreator, stakeOpponent } = input;
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS) {
    return { code: 'INVALID_FEE_BPS', feeBps };
  }
  if (stakeCreator <= 0n)
    return { code: 'INVALID_STAKES', reason: 'creator stake must be positive' };
  if (format === 'bet' && stakeOpponent !== stakeCreator) {
    return { code: 'INVALID_STAKES', reason: 'bet stakes must be equal' };
  }
  if (format !== 'bet' && stakeOpponent !== 0n) {
    return { code: 'INVALID_STAKES', reason: `${format} must have a zero opponent stake` };
  }
  return null;
}

/** Who ends up with money on a decided outcome, and what their net winnings are. */
function winnerAndNet(
  input: SettlementInput,
  outcome: Outcome,
): { winner: PartySide; net: UsdcAmount } {
  const { format, stakeCreator, stakeOpponent } = input;
  if (outcome === 'creator_wins') {
    // Bet: creator takes the opponent's stake. Commit: creator simply keeps their own — net 0.
    return { winner: 'creator', net: format === 'bet' ? stakeOpponent : ZERO_USDC };
  }
  // opponent_wins — Bet: opponent takes the creator's stake; Commit: the beneficiary receives
  // it. Either way the net gain is the creator's stake.
  return { winner: 'opponent', net: stakeCreator };
}

function bondRouting(
  dispute: DisputeInput | null | undefined,
  outcome: SettlementOutcome,
  winner: PartySide | null,
): { bond: UsdcAmount; toCreator: UsdcAmount; toOpponent: UsdcAmount } {
  if (!dispute) return { bond: ZERO_USDC, toCreator: ZERO_USDC, toOpponent: ZERO_USDC };

  // The bond only comes back when a referee actually ruled and the ruling did not go against
  // the disputer: a win for their side, or a draw.
  //
  // An unadjudicated `refund` must NOT return it, or disputing becomes a free option. Since
  // `settleUnrefereed` was introduced a silent referee upholds the claim instead of refunding,
  // so this combination is no longer reachable through `machine.ts` — the rule stays as a
  // guard, because the settlement math is also the contract the on-chain program mirrors and
  // it must not depend on the client reaching it the right way.
  const ruledForDisputer = outcome === 'draw' || winner === dispute.by;
  const bondGoesTo: PartySide = ruledForDisputer ? dispute.by : otherSide(dispute.by);
  return {
    bond: dispute.bond,
    toCreator: bondGoesTo === 'creator' ? dispute.bond : ZERO_USDC,
    toOpponent: bondGoesTo === 'opponent' ? dispute.bond : ZERO_USDC,
  };
}

export function calculateSettlement(input: SettlementInput): Result<Settlement, SettlementError> {
  const invalid = validate(input);
  if (invalid) return err(invalid);

  const pot = addUsdc(input.stakeCreator, input.stakeOpponent);

  if (input.outcome === 'refund' || input.outcome === 'draw') {
    const routed = bondRouting(input.dispute, input.outcome, null);
    return ok({
      kind: 'refund',
      winner: null,
      pot,
      bond: routed.bond,
      fee: ZERO_USDC,
      toCreator: addUsdc(input.stakeCreator, routed.toCreator),
      toOpponent: addUsdc(input.stakeOpponent, routed.toOpponent),
      toTreasury: ZERO_USDC,
      // A refund is not a win, so there is no fee to split — a referee who ruled a draw is
      // paid nothing. Their share comes out of winnings, and there are none.
      toReferee: ZERO_USDC,
    });
  }

  const { winner, net } = winnerAndNet(input, input.outcome);
  const fee = feeOn(net, input.feeBps);
  const payout = subUsdc(pot, fee);
  const routed = bondRouting(input.dispute, input.outcome, winner);

  // The referee is paid out of the fee, never on top of it: the parties are charged the same
  // 3 % whether or not anybody had to rule. Capped at the fee so a misconfigured share can
  // never pay out more than was collected.
  const refereeShare = input.ruledByReferee
    ? minUsdc(feeOn(net, Math.min(REFEREE_FEE_SHARE_BPS, input.feeBps)), fee)
    : ZERO_USDC;

  return ok({
    kind: 'payout',
    winner,
    pot,
    bond: routed.bond,
    fee,
    toCreator: addUsdc(winner === 'creator' ? payout : ZERO_USDC, routed.toCreator),
    toOpponent: addUsdc(winner === 'opponent' ? payout : ZERO_USDC, routed.toOpponent),
    toTreasury: subUsdc(fee, refereeShare),
    toReferee: refereeShare,
  });
}

/** 10 % of the pot, clamped to [1, 25] USDC — the price of saying "no, they didn't". */
export function calculateDisputeBond(
  pot: UsdcAmount,
  bondBps: number = DISPUTE_BOND_BPS,
): UsdcAmount {
  const raw = (pot * BigInt(bondBps)) / BPS_DENOMINATOR;
  if (raw < MIN_DISPUTE_BOND) return asUsdcAmount(MIN_DISPUTE_BOND);
  if (raw > MAX_DISPUTE_BOND) return asUsdcAmount(MAX_DISPUTE_BOND);
  return asUsdcAmount(raw);
}
