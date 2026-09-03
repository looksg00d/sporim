declare const brandSymbol: unique symbol;

/** Nominal typing helper: `Brand<string, 'BetId'>` is not assignable from a plain string. */
export type Brand<T, Name extends string> = T & { readonly [brandSymbol]: Name };

export type BetId = Brand<string, 'BetId'>; // UUID v4, also the on-chain bet_id and the URL id
export type ShortCode = Brand<string, 'ShortCode'>; // 8-char base58 used in shared links
export type RefereeToken = Brand<string, 'RefereeToken'>; // 32-char base58, the /r/ capability
export type UserId = Brand<string, 'UserId'>; // UUID
export type WalletAddress = Brand<string, 'WalletAddress'>; // base58 Solana pubkey
export type TxSignature = Brand<string, 'TxSignature'>; // base58 Solana signature
export type HexHash = Brand<string, 'HexHash'>; // 64 lowercase hex chars (32 bytes)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const HEX32_RE = /^[0-9a-f]{64}$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isWalletAddress(value: string): value is WalletAddress {
  return value.length >= 32 && value.length <= 44 && BASE58_RE.test(value);
}

export function isTxSignature(value: string): value is TxSignature {
  return value.length >= 86 && value.length <= 88 && BASE58_RE.test(value);
}

export function isShortCode(value: string): value is ShortCode {
  return value.length === 8 && BASE58_RE.test(value);
}

/**
 * The referee invitation. A separate secret from the short code because it grants a separate
 * power over the same bet: the short code says "take the other side", this one says "judge
 * it". One link for both would let whoever opened it first pick their own role.
 *
 * The lengths are exclusive on purpose — 8 against 32 — so neither value can ever be spent on
 * the other route, and the mistake is caught by a type guard rather than by a policy.
 *
 * 32 base58 characters is roughly 187 bits. The short code's 8 is 46, which is the right size
 * for something people forward in a chat and the wrong size for a role.
 */
export const REFEREE_TOKEN_LENGTH = 32;

export function isRefereeToken(value: string): value is RefereeToken {
  return value.length === REFEREE_TOKEN_LENGTH && BASE58_RE.test(value);
}

export function isHexHash(value: string): value is HexHash {
  return HEX32_RE.test(value);
}

export function isBetId(value: string): value is BetId {
  return isUuid(value);
}

export function isUserId(value: string): value is UserId {
  return isUuid(value);
}
