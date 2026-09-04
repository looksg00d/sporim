import { randomBytes } from 'node:crypto';
import { REFEREE_TOKEN_LENGTH, type RefereeToken, type ShortCode } from '@sporim/domain';

/**
 * The two secrets a bet hands out, minted in one place because they are the same kind of
 * thing: a string that is read aloud across a table, retyped from a screenshot and pasted out
 * of a chat app, and whose only protection is that it cannot be guessed.
 *
 * Base58 for the human half of that — `0/O/I/l` is where retyping goes wrong. Lengths are
 * deliberately exclusive (8 against 32) so neither value can ever be spent on the other
 * route, and `isShortCode`/`isRefereeToken` refuse the mistake before it reaches SQL.
 *
 * They are not interchangeable in power, which is the whole reason there are two of them
 * (0004): the short code says "take the other side", the token says "settle it if they
 * disagree". One link for both would let whoever opened it first choose their own role.
 */

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * The largest multiple of 58 below 256. Bytes at or above it are thrown away rather than
 * folded with `% 58`, which would make the first 24 letters of the alphabet slightly more
 * likely than the rest. A biased secret is a shorter secret, and both of these are
 * capabilities.
 */
const REJECT_AT = 232;

/** 8 base58 characters ≈ 46 bits. Short enough to say out loud; the wrong size for a role. */
export const SHORT_CODE_LENGTH = 8;

export function randomBase58(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= REJECT_AT) continue;
      out += BASE58[byte % BASE58.length] ?? '';
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * The link that shares a bet.
 *
 * 46 bits is not enough to make a collision impossible at scale, only improbable — which is
 * why `bets.short_code` is UNIQUE and `createBetForDraft` retries on that one constraint
 * rather than trusting the arithmetic. Short is the product requirement; the database is
 * what makes short safe.
 */
export function newShortCode(): ShortCode {
  return randomBase58(SHORT_CODE_LENGTH) as ShortCode;
}

/** The referee invitation. 32 characters ≈ 187 bits — this is not a code somebody guesses. */
export function newRefereeToken(): RefereeToken {
  return randomBase58(REFEREE_TOKEN_LENGTH) as RefereeToken;
}
