import type {
  BetFormat,
  BetId,
  HexHash,
  Outcome,
  TxSignature,
  UsdcAmount,
  WalletAddress,
} from '@sporim/domain';

/**
 * Every shape below is `readonly`. A quote or a receipt is a fact about one moment — mutating
 * one in place would make it a lie about a different moment.
 */

export interface TxReceipt {
  readonly signature: TxSignature;
  readonly slot: number | null;
  readonly confirmedAtSeconds: number;
  /** True in mock mode. This is what hides an explorer link — a simulated signature earns none. */
  readonly simulated: boolean;
}

export interface CreateBetInput {
  readonly betId: BetId;
  readonly format: BetFormat;
  readonly termsHash: HexHash;
  readonly stakeCreator: UsdcAmount;
  readonly stakeOpponent: UsdcAmount;
  readonly feeBps: number;
  readonly deadlineSeconds: number;
  readonly acceptDeadlineSeconds: number;
  /** Known only if the creator named someone who already has a wallet on file. */
  readonly opponent: WalletAddress | null;
  readonly referee: WalletAddress | null;
  readonly beneficiary: WalletAddress | null;
}

export interface BetQuote {
  readonly pot: UsdcAmount;
  readonly feeBps: number;
  readonly networkFeeLamports: number;
  readonly rentLamports: number;
  /** True when the caller's wallet needs a USDC associated token account created first. */
  readonly needsUsdcAccount: boolean;
}

export interface CreateBetReceipt extends TxReceipt {
  readonly betPda: WalletAddress;
  readonly vaultPda: WalletAddress;
}

export interface AcceptBetInput {
  readonly betId: BetId;
}

export interface CancelBetInput {
  readonly betId: BetId;
}

export interface SubmitClaimInput {
  readonly betId: BetId;
  readonly outcome: Outcome;
}

export interface ConfirmClaimInput {
  readonly betId: BetId;
}

export interface DisputeClaimInput {
  readonly betId: BetId;
}

export interface RefereeResolveInput {
  readonly betId: BetId;
  readonly outcome: Outcome;
}

export interface SettlementReceipt extends TxReceipt {
  readonly outcome: Outcome | 'refund';
  readonly winner: WalletAddress | null;
  readonly paidToWinner: UsdcAmount;
  readonly feePaid: UsdcAmount;
  /** Non-zero only when a referee actually ruled — see `calculateSettlement`. */
  readonly paidToReferee: UsdcAmount;
}

/**
 * The bet as the chain sees it, decoded from account data. A superset of what
 * `packages/domain`'s `Bet` needs, so the caller can always derive one from the other; never
 * imported the other way, so a chain type never leaks into UI code that runs before the chain
 * exists (mock mode has no on-chain account to decode).
 */
export interface OnChainBet {
  readonly betId: BetId;
  readonly betPda: WalletAddress;
  readonly vaultPda: WalletAddress;
  readonly creator: WalletAddress;
  readonly opponent: WalletAddress | null;
  readonly referee: WalletAddress | null;
  readonly beneficiary: WalletAddress | null;
  readonly stakeCreator: UsdcAmount;
  readonly stakeOpponent: UsdcAmount;
  readonly vaultBalance: UsdcAmount;
  readonly feeBps: number;
  readonly deadlineSeconds: number;
  readonly acceptDeadlineSeconds: number;
}
