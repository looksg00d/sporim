import type { SubmittableDraft } from '@sporim/domain';

/**
 * The seam between the wizard and money. M3 swaps the fake for Privy + the mock
 * `ChainAdapter`, and M5 for devnet — the review screen never learns which one it got.
 *
 * Errors are a closed set, because the user-facing message for each is a product decision
 * and not something a caught exception should be allowed to invent.
 */

export const WALLET_ERROR_CODES = [
  'USER_REJECTED',
  'INSUFFICIENT_FUNDS',
  'NOT_CONNECTED',
  'NETWORK',
  'UNKNOWN',
] as const;

export type WalletErrorCode = (typeof WALLET_ERROR_CODES)[number];

export interface CreatedBet {
  readonly shortCode: string;
  /** `null` in mock mode. A fabricated signature must never reach a screen. */
  readonly txSignature: string | null;
  readonly simulated: boolean;
}

export interface WalletPort {
  readonly createBet: (draft: SubmittableDraft) => Promise<CreatedBet>;
}

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
}

/** What the user reads. One sentence, no jargon, and it always says what happened to the money. */
export const WALLET_ERROR_COPY: Record<WalletErrorCode, string> = {
  USER_REJECTED: 'You cancelled the signature. Nothing was locked.',
  INSUFFICIENT_FUNDS: 'Not enough USDC in your wallet. Top up and try again.',
  NOT_CONNECTED: 'Your wallet disconnected. Reconnect and try again.',
  NETWORK: 'The network did not answer. Your money was not touched.',
  UNKNOWN: 'That did not go through. Nothing was locked.',
};

export function isWalletErrorCode(value: unknown): value is WalletErrorCode {
  return typeof value === 'string' && (WALLET_ERROR_CODES as readonly string[]).includes(value);
}

/** Anything thrown on the way to the chain becomes a code the UI knows how to say. */
export function toWalletError(cause: unknown): WalletError {
  if (cause instanceof WalletError) return cause;
  return new WalletError('UNKNOWN', WALLET_ERROR_COPY.UNKNOWN);
}
