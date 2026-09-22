import { FEE_BPS, MAX_STAKE, MIN_STAKE } from '../constants';
import { asUsdcAmount, ZERO_USDC } from '../types/money';
import { unwrap } from '../types/result';
import { calculateSettlement, type SettlementInput } from './settlement';

/**
 * The settlement, written down in a form two languages can both read.
 *
 * `docs/09-phase0-plan.md` (T5.11) calls the TS↔Rust parity check the most important test in
 * the repository, and until now it did not exist: the on-chain numbers were compared to these
 * ones once, by hand, on one devnet run. A rule that lives in two implementations drifts the
 * day somebody fixes one of them — and the fix that drifts is the one nobody notices, because
 * both sides keep passing their own tests.
 *
 * So the cases are generated here, from `calculateSettlement` itself, and written to
 * `test-vectors/settlement.v1.json`. TypeScript asserts the committed file still matches what
 * the code produces; Rust reads the same file and asserts its own arithmetic lands on the same
 * integers. Neither side can move alone: changing the money rules changes the file, and
 * changing the file fails the other language's test until it agrees.
 *
 * Money crosses as decimal strings. JSON has one number type and it is a double, which is
 * exactly the representation this project refuses to let money touch.
 */
export const SETTLEMENT_VECTORS_VERSION = 'sporim.settlement.v1';

export interface SettlementVectorCase {
  readonly name: string;
  readonly input: {
    readonly format: SettlementInput['format'];
    readonly stakeCreator: string;
    readonly stakeOpponent: string;
    readonly feeBps: number;
    readonly outcome: SettlementInput['outcome'];
    readonly ruledByReferee: boolean;
  };
  readonly expected: {
    readonly kind: string;
    readonly pot: string;
    readonly fee: string;
    readonly toCreator: string;
    readonly toOpponent: string;
    readonly toTreasury: string;
    readonly toReferee: string;
  };
  /**
   * Whether the program is expected to reproduce this case *today*. The first on-chain slice
   * knows the Bet format and nothing else — no Commit, no referee share, no refund path — so
   * those cases are carried here as the contract the next slice has to meet, and skipped by
   * the Rust side until it does.
   */
  readonly onChain: boolean;
}

export interface SettlementVectors {
  readonly version: string;
  readonly feeBps: number;
  readonly cases: readonly SettlementVectorCase[];
}

interface CaseSpec {
  readonly name: string;
  readonly input: SettlementInput;
}

const usdc = (whole: number) => asUsdcAmount(BigInt(whole) * 1_000_000n);
const units = (value: bigint) => asUsdcAmount(value);

/**
 * The boundaries worth pinning, and why each one is here.
 *
 * The rounding cases are the point: the fee floors, so 33 and 34 base units sit either side of
 * the first whole unit of fee, and 3333/3334 either side of the hundredth. An implementation
 * that rounds the other way passes every "20 USDC" test ever written and fails these.
 */
const CASES: readonly CaseSpec[] = [
  {
    name: 'bet, equal stakes, creator wins',
    input: {
      format: 'bet',
      stakeCreator: usdc(20),
      stakeOpponent: usdc(20),
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
    },
  },
  {
    name: 'bet, equal stakes, opponent wins',
    input: {
      format: 'bet',
      stakeCreator: usdc(20),
      stakeOpponent: usdc(20),
      feeBps: FEE_BPS,
      outcome: 'opponent_wins',
    },
  },
  {
    name: 'bet, a draw returns both stakes and charges nothing',
    input: {
      format: 'bet',
      stakeCreator: usdc(20),
      stakeOpponent: usdc(20),
      feeBps: FEE_BPS,
      outcome: 'draw',
    },
  },
  {
    name: 'bet, a refund is a draw by another name',
    input: {
      format: 'bet',
      stakeCreator: usdc(20),
      stakeOpponent: usdc(20),
      feeBps: FEE_BPS,
      outcome: 'refund',
    },
  },
  {
    name: 'bet at the minimum stake',
    input: {
      format: 'bet',
      stakeCreator: MIN_STAKE,
      stakeOpponent: MIN_STAKE,
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
    },
  },
  {
    name: 'bet at the maximum stake',
    input: {
      format: 'bet',
      stakeCreator: MAX_STAKE,
      stakeOpponent: MAX_STAKE,
      feeBps: FEE_BPS,
      outcome: 'opponent_wins',
    },
  },
  {
    name: 'rounding: one base unit of net wins pays no fee at all',
    input: {
      format: 'bet',
      stakeCreator: units(1n),
      stakeOpponent: units(1n),
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
    },
  },
  {
    name: 'rounding: 33 units of net is still no fee',
    input: {
      format: 'bet',
      stakeCreator: units(33n),
      stakeOpponent: units(33n),
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
    },
  },
  {
    name: 'rounding: 34 units of net is the first whole unit of fee',
    input: {
      format: 'bet',
      stakeCreator: units(34n),
      stakeOpponent: units(34n),
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
    },
  },
  {
    name: 'rounding: 3333 units floors to 99',
    input: {
      format: 'bet',
      stakeCreator: units(3333n),
      stakeOpponent: units(3333n),
      feeBps: FEE_BPS,
      outcome: 'opponent_wins',
    },
  },
  {
    name: 'rounding: 3334 units reaches 100',
    input: {
      format: 'bet',
      stakeCreator: units(3334n),
      stakeOpponent: units(3334n),
      feeBps: FEE_BPS,
      outcome: 'opponent_wins',
    },
  },
  {
    name: 'commit kept: the author keeps their stake and pays nothing',
    input: {
      format: 'commit',
      stakeCreator: usdc(20),
      stakeOpponent: ZERO_USDC,
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
    },
  },
  {
    name: 'commit failed: the stake goes to the beneficiary, less the fee',
    input: {
      format: 'commit',
      stakeCreator: usdc(20),
      stakeOpponent: ZERO_USDC,
      feeBps: FEE_BPS,
      outcome: 'opponent_wins',
    },
  },
  {
    name: 'referee rules a win: their share comes out of the fee, not on top',
    input: {
      format: 'bet',
      stakeCreator: usdc(20),
      stakeOpponent: usdc(20),
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
      ruledByReferee: true,
    },
  },
  {
    name: 'referee rules a draw: no winnings, so no share',
    input: {
      format: 'bet',
      stakeCreator: usdc(20),
      stakeOpponent: usdc(20),
      feeBps: FEE_BPS,
      outcome: 'draw',
      ruledByReferee: true,
    },
  },
  {
    name: 'referee share on a small pot, where the two floors could disagree',
    input: {
      format: 'bet',
      stakeCreator: units(199n),
      stakeOpponent: units(199n),
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
      ruledByReferee: true,
    },
  },
];

/** What the first on-chain slice implements: the Bet format, decided by the two parties. */
function isOnChainToday(input: SettlementInput): boolean {
  return input.format === 'bet' && input.outcome !== 'refund' && input.ruledByReferee !== true;
}

export function buildSettlementVectors(): SettlementVectors {
  return {
    version: SETTLEMENT_VECTORS_VERSION,
    feeBps: FEE_BPS,
    cases: CASES.map(({ name, input }) => {
      const settlement = unwrap(calculateSettlement(input));
      return {
        name,
        input: {
          format: input.format,
          stakeCreator: input.stakeCreator.toString(),
          stakeOpponent: input.stakeOpponent.toString(),
          feeBps: input.feeBps,
          outcome: input.outcome,
          ruledByReferee: input.ruledByReferee === true,
        },
        expected: {
          kind: settlement.kind,
          pot: settlement.pot.toString(),
          fee: settlement.fee.toString(),
          toCreator: settlement.toCreator.toString(),
          toOpponent: settlement.toOpponent.toString(),
          toTreasury: settlement.toTreasury.toString(),
          toReferee: settlement.toReferee.toString(),
        },
        onChain: isOnChainToday(input),
      };
    }),
  };
}
