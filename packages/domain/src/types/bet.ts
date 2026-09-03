import type { BetId, HexHash, ShortCode, UserId, WalletAddress, TxSignature } from './ids';
import type { UsdcAmount } from './money';

/**
 * Dare is parked, not deleted (2026-09-03): three formats made the first screen a puzzle,
 * and Dare is the one people could not place. Bringing it back is a small, known change —
 * add it here, add its `FORMAT_COPY` entry, and restore the one branch it needs in
 * `successClaimantSide`, `contract-sentence` and `MoneyFlow`. The settlement math already
 * treats every one-sided format alike, so none of it has to change. See docs/05.
 */
export const BET_FORMATS = ['bet', 'commit'] as const;
export type BetFormat = (typeof BET_FORMATS)[number];

export const BET_STATES = [
  'draft',
  'open',
  'active',
  'claimed',
  'disputed',
  'resolved',
  'refunded',
  'cancelled',
] as const;
export type BetState = (typeof BET_STATES)[number];

export const TERMINAL_STATES = [
  'resolved',
  'refunded',
  'cancelled',
] as const satisfies readonly BetState[];

export const DECISION_MODES = ['mutual', 'referee'] as const;
export type DecisionMode = (typeof DECISION_MODES)[number];

export const OUTCOMES = ['creator_wins', 'opponent_wins', 'draw'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const PARTY_SIDES = ['creator', 'opponent'] as const;
export type PartySide = (typeof PARTY_SIDES)[number];

export const VIEWER_ROLES = ['creator', 'opponent', 'referee', 'beneficiary', 'observer'] as const;
export type ViewerRole = (typeof VIEWER_ROLES)[number];

export const BENEFICIARY_KINDS = ['friend', 'charity', 'vault'] as const;
export type BeneficiaryKind = (typeof BENEFICIARY_KINDS)[number];

export const CHAIN_NETWORKS = ['mock', 'devnet', 'mainnet-beta'] as const;
export type ChainNetwork = (typeof CHAIN_NETWORKS)[number];

export interface Party {
  readonly userId: UserId | null;
  readonly wallet: WalletAddress | null;
  readonly displayName: string | null;
}

/**
 * A referee is a Party who may not have agreed to anything yet.
 *
 * The creator names them on the fourth screen — often just "Kolya", typed from memory — and
 * that person learns of the role only if a dispute happens, weeks later, from a cold link.
 * Treating that as consent is what would make a silent referee's ruling-by-inaction unfair,
 * so confirmation is part of the type: you cannot say "confirmed" without saying **when**.
 *
 * `null` means named but unconfirmed. Their silence decides nothing — see `disputedActions`.
 */
export interface Referee extends Party {
  readonly confirmedAtSeconds: number | null;
}

export function isRefereeConfirmed(referee: Referee | null): referee is Referee {
  return referee !== null && referee.confirmedAtSeconds !== null;
}

export interface Claim {
  readonly outcome: Outcome;
  readonly by: PartySide;
  readonly atSeconds: number;
  readonly windowEndsAtSeconds: number;
}

export interface Dispute {
  readonly by: PartySide;
  readonly bond: UsdcAmount;
  readonly atSeconds: number;
  readonly refereeDeadlineSeconds: number;
}

/** The canonical bet as the domain sees it. Time in unix seconds; money in USDC base units. */
export interface Bet {
  readonly id: BetId;
  readonly shortCode: ShortCode;
  readonly format: BetFormat;
  readonly state: BetState;
  readonly terms: string;
  readonly termsHash: HexHash;
  readonly stakeCreator: UsdcAmount;
  readonly stakeOpponent: UsdcAmount;
  readonly decisionMode: DecisionMode;
  readonly creator: Party;
  readonly opponent: Party | null;
  readonly referee: Referee | null;
  readonly beneficiary: (Party & { readonly kind: BeneficiaryKind }) | null;
  readonly createdAtSeconds: number;
  readonly acceptDeadlineSeconds: number;
  readonly deadlineSeconds: number;
  readonly claim: Claim | null;
  readonly dispute: Dispute | null;
  readonly outcome: Outcome | null;
  readonly feeBps: number;
  readonly chain: ChainNetwork;
  readonly createTx: TxSignature | null;
  readonly acceptTx: TxSignature | null;
  readonly settleTx: TxSignature | null;
}
