import type { Transaction, VersionedTransaction } from '@solana/web3.js';
import type { TxSignature, WalletAddress } from '@sporim/domain';
import type { Result } from '@sporim/domain';

/**
 * What the adapter hands a wallet to sign. A raw byte blob cannot show a person what they are
 * approving, so this stays a real `@solana/web3.js` transaction rather than opaque bytes —
 * Privy's Solana wallet (web now, Expo later) expects the same shape either way.
 */
export type UnsignedTransaction = Transaction | VersionedTransaction;

/**
 * The one seam between "what SPORIM wants to happen" and "whoever holds the keys". Implemented
 * by Privy's embedded/connected wallet on web today; the same interface is what Expo's wallet
 * integration fills in later. `packages/chain` never imports a wallet SDK directly — every
 * adapter method that moves money takes a `WalletPort`, never a private key.
 */
export interface WalletPort {
  readonly address: WalletAddress | null;
  signAndSendTransaction(tx: UnsignedTransaction): Promise<Result<TxSignature, WalletError>>;
  signMessage(message: Uint8Array): Promise<Result<Uint8Array, WalletError>>;
}

export type WalletErrorCode = 'WALLET_NOT_CONNECTED' | 'USER_REJECTED' | 'UNKNOWN';

export interface WalletError {
  readonly code: WalletErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}
