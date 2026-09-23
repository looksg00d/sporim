import {
  CLAIM_GRACE_SECONDS,
  CLAIM_WINDOW_SECONDS,
  FEE_BPS,
  MAX_DEADLINE_LEAD_SECONDS,
  MAX_STAKE,
  MIN_DEADLINE_LEAD_SECONDS,
  MIN_STAKE,
  REFEREE_TIMEOUT_SECONDS,
} from '../constants';

/**
 * Every number both the domain and the program must agree on, in one file both read.
 *
 * Same contract as `settlement.v1.json`: TypeScript snapshots it, Rust `include_str!`s it, so a
 * constant changed on one side alone is a red test on the other. `onChain: false` marks a value
 * the program does not need yet — the contract the next slice has to meet.
 */
export const CONSTANTS_VECTORS_VERSION = 'sporim.constants.v1';

export interface ConstantVector {
  readonly name: string;
  /** Money as a string (base units can exceed 2^53 once scaled); seconds and bps as numbers. */
  readonly value: string | number;
  readonly onChain: boolean;
}

export interface ConstantsVectors {
  readonly version: string;
  readonly values: readonly ConstantVector[];
}

export function buildConstantsVectors(): ConstantsVectors {
  return {
    version: CONSTANTS_VECTORS_VERSION,
    values: [
      { name: 'FEE_BPS', value: FEE_BPS, onChain: true },
      { name: 'MIN_STAKE', value: MIN_STAKE.toString(), onChain: true },
      { name: 'MAX_STAKE', value: MAX_STAKE.toString(), onChain: true },
      { name: 'MIN_DEADLINE_LEAD_SECONDS', value: MIN_DEADLINE_LEAD_SECONDS, onChain: true },
      { name: 'MAX_DEADLINE_LEAD_SECONDS', value: MAX_DEADLINE_LEAD_SECONDS, onChain: true },
      { name: 'CLAIM_WINDOW_SECONDS', value: CLAIM_WINDOW_SECONDS, onChain: true },
      { name: 'CLAIM_GRACE_SECONDS', value: CLAIM_GRACE_SECONDS, onChain: true },
      // No referee on-chain in this slice — waits on how the referee is paid.
      { name: 'REFEREE_TIMEOUT_SECONDS', value: REFEREE_TIMEOUT_SECONDS, onChain: false },
    ],
  };
}
