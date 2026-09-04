import { BPS_DENOMINATOR, REFEREE_FEE_SHARE_BPS, MAX_FEE_BPS } from '../constants';
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

/**
 * A dispute is deliberately absent from this input.
 *
 * It used to carry a bond, and the bond had to be routed to somebody, which made saying "no,
 * they didn't" a transaction. Removing it (2026-09-04) took the dispute out of the money
 * entirely: disagreeing is now a state-machine event and costs nothing, so the numbers depend
 * only on the stakes, the fee and who won. Whether anybody objected on the way here changes
 * no figure on any screen.
 */
export interface SettlementInput {
  readonly format: BetFormat;
  readonly stakeCreator: UsdcAmount;
  readonly stakeOpponent: UsdcAmount;
  readonly feeBps: number;
  readonly outcome: SettlementOutcome;
  /** True when a referee decided this outcome, which is the only thing that earns their share. */
  readonly ruledByReferee?: boolean;
}

export interface Settlement {
  readonly kind: 'payout' | 'refund';
  readonly winner: PartySide | null;
  readonly pot: UsdcAmount;
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

export function calculateSettlement(input: SettlementInput): Result<Settlement, SettlementError> {
  const invalid = validate(input);
  if (invalid) return err(invalid);

  const pot = addUsdc(input.stakeCreator, input.stakeOpponent);

  if (input.outcome === 'refund' || input.outcome === 'draw') {
    return ok({
      kind: 'refund',
      winner: null,
      pot,
      fee: ZERO_USDC,
      toCreator: input.stakeCreator,
      toOpponent: input.stakeOpponent,
      toTreasury: ZERO_USDC,
      // A refund is not a win, so there is no fee to split — a referee who ruled a draw is
      // paid nothing. Their share comes out of winnings, and there are none.
      toReferee: ZERO_USDC,
    });
  }

  const { winner, net } = winnerAndNet(input, input.outcome);
  const fee = feeOn(net, input.feeBps);
  const payout = subUsdc(pot, fee);

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
    fee,
    toCreator: winner === 'creator' ? payout : ZERO_USDC,
    toOpponent: winner === 'opponent' ? payout : ZERO_USDC,
    toTreasury: subUsdc(fee, refereeShare),
    toReferee: refereeShare,
  });
}
