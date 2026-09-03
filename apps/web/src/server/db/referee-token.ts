import { randomBytes } from 'node:crypto';
import { REFEREE_TOKEN_LENGTH, type RefereeToken } from '@sporim/domain';

/**
 * Minting the referee invitation.
 *
 * Its own module so that `bets.repo.ts` (which writes one when a bet names a referee) and
 * `referee.repo.ts` (which spends one) can both reach it without importing each other.
 *
 * The alphabet is base58 for the same reason the short code is: these strings are read aloud,
 * retyped from a screenshot and pasted out of chat apps, and `0/O/I/l` is where that goes
 * wrong. 32 characters is roughly 187 bits — this is not a code somebody guesses.
 */

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * The largest multiple of 58 below 256. Bytes at or above it are thrown away rather than
 * folded with `% 58`, which would make the first 24 letters of the alphabet slightly more
 * likely than the rest. A biased secret is a shorter secret, and this one is a capability.
 */
const REJECT_AT = 232;

export function newRefereeToken(): RefereeToken {
  let token = '';
  while (token.length < REFEREE_TOKEN_LENGTH) {
    for (const byte of randomBytes(REFEREE_TOKEN_LENGTH)) {
      if (byte >= REJECT_AT) continue;
      token += BASE58[byte % BASE58.length] ?? '';
      if (token.length === REFEREE_TOKEN_LENGTH) break;
    }
  }
  return token as RefereeToken;
}
