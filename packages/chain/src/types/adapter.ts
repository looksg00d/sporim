import type { BetId, ChainNetwork, Result, TxSignature, UsdcAmount, WalletAddress } from '@sporim/domain';
import type { ChainError } from './errors';
import type {
  AcceptBetInput,
  BetQuote,
  CancelBetInput,
  ConfirmClaimInput,
  CreateBetInput,
  CreateBetReceipt,
  DisputeClaimInput,
  OnChainBet,
  RefereeResolveInput,
  SettlementReceipt,
  SubmitClaimInput,
  TxReceipt,
} from './io';
import type { WalletPort } from './wallet';

export type { ChainNetwork };

/**
 * What a given network can actually do. `mock` and `devnet` both implement the full
 * `ChainAdapter` shape, but a caller that wants to know *whether a link is worth showing* (an
 * explorer link, a "dispute costs nothing" note) asks here rather than switching on `network`
 * — the network name is an identity, not a feature list, and the two have drifted before.
 */
export interface AdapterCapabilities {
  readonly permissionlessSettle: boolean;
  readonly explorer: boolean;
  readonly faucet: boolean;
}

/**
 * The seam between the product and Solana. `packages/domain` never imports this — the state
 * machine and `calculateSettlement` are chain-agnostic on purpose — and neither does any
 * component that has to render before a wallet exists (the landing page, the wizard's first
 * four screens). Everything here takes a `WalletPort`, never a keypair: this package cannot
 * sign anything on anyone's behalf.
 *
 * `mock` (in-memory, no real transfer) and `devnet` (this milestone) implement the same
 * interface end to end so the reel and the UI never branch on which one is live — see
 * `docs/09-phase0-plan.md` §2.4 for the shape this mirrors, and `docs/DECISIONS.md` (2026-09-04)
 * for why there is no dispute bond in `DisputeClaimInput`: disagreeing costs nothing on-chain
 * for the same reason it costs nothing in the database today.
 */
export interface ChainAdapter {
  readonly network: ChainNetwork;
  readonly capabilities: AdapterCapabilities;

  getUsdcBalance(owner: WalletAddress): Promise<Result<UsdcAmount, ChainError>>;
  getBet(betId: BetId): Promise<Result<OnChainBet | null, ChainError>>;
  getBets(betIds: readonly BetId[]): Promise<Result<readonly OnChainBet[], ChainError>>;
  /** Returns an unsubscribe function; never throws for "no such bet" — resolves to nothing. */
  watchBet(betId: BetId, onChange: (bet: OnChainBet) => void): () => void;
  quoteCreateBet(input: CreateBetInput): Promise<Result<BetQuote, ChainError>>;
  /** `null` when this network has no explorer (mock) or the signature was never real. */
  explorerUrl(signature: TxSignature): string | null;

  createBet(input: CreateBetInput, wallet: WalletPort): Promise<Result<CreateBetReceipt, ChainError>>;
  acceptBet(input: AcceptBetInput, wallet: WalletPort): Promise<Result<TxReceipt, ChainError>>;
  cancelBet(input: CancelBetInput, wallet: WalletPort): Promise<Result<TxReceipt, ChainError>>;

  submitClaim(input: SubmitClaimInput, wallet: WalletPort): Promise<Result<TxReceipt, ChainError>>;
  confirmClaim(
    input: ConfirmClaimInput,
    wallet: WalletPort,
  ): Promise<Result<SettlementReceipt, ChainError>>;
  disputeClaim(input: DisputeClaimInput, wallet: WalletPort): Promise<Result<TxReceipt, ChainError>>;
  refereeResolve(
    input: RefereeResolveInput,
    wallet: WalletPort,
  ): Promise<Result<SettlementReceipt, ChainError>>;

  /** Permissionless: anyone may call these, including a cron with no wallet of its own. */
  settleUncontested(
    input: { readonly betId: BetId },
    wallet: WalletPort,
  ): Promise<Result<SettlementReceipt, ChainError>>;
  refundExpired(
    input: { readonly betId: BetId },
    wallet: WalletPort,
  ): Promise<Result<SettlementReceipt, ChainError>>;

  /** Devnet only. `undefined` on mock and mainnet-beta — there is nothing to request. */
  requestTestUsdc?(owner: WalletAddress, amount: UsdcAmount): Promise<Result<TxReceipt, ChainError>>;
}
