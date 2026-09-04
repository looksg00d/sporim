import type { SubmittableDraft } from '@sporim/domain';

/**
 * The seam between the wizard and money. The fake behind it has been replaced by the real
 * `create-bet` action; M5 replaces the escrow behind *that* with devnet, and the review
 * screen still never learns which one it got.
 *
 * Errors are a closed set, because the user-facing message for each is a product decision
 * and not something a caught exception should be allowed to invent. Two of them are not
 * about a wallet at all — creating a bet now needs an account and a server that agrees the
 * draft is still valid — and they are here rather than somewhere new because the screen has
 * exactly one place it reports a failed commit, and a second vocabulary would be a second
 * set of sentences to keep honest.
 */

export const WALLET_ERROR_CODES = [
  /** No verified session. The screen normally offers a sign-in instead of ever showing this. */
  'NOT_SIGNED_IN',
  /** The server re-ran the domain rules and said no — most often a deadline that has passed. */
  'DRAFT_INVALID',
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

/**
 * What the `create-bet` server action answers with.
 *
 * A plain value rather than a thrown error, because it crosses a process boundary: React
 * serialises the return of a server action, and an exception on the other side arrives as a
 * generic digest with the message stripped in production. So the failure is data, and the
 * code is one this file already has a sentence for.
 *
 * Declared here, next to that sentence, because a `'use server'` module may export nothing
 * but async functions.
 */
export type CreateBetResult =
  | { readonly ok: true; readonly bet: CreatedBet }
  | { readonly ok: false; readonly code: WalletErrorCode };

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
  NOT_SIGNED_IN: 'Sign in to lock this in. Nothing was submitted.',
  DRAFT_INVALID: 'Something changed while you were away — check the deadline and try again.',
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
