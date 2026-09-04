import { createHash } from 'node:crypto';
import { commitmentCanonicalString, type HexHash, type SubmittableDraft } from '@sporim/domain';

/**
 * `Bet.termsHash` — sha256 over the canonical rendering of the agreement.
 *
 * The bytes come from the domain (`commitmentCanonicalString`) and the hashing happens here,
 * which is the split the domain asks for: it stays free of platform crypto so the same string
 * can be hashed by Node today and by the on-chain program later, and the two agree because
 * neither of them invented the encoding.
 *
 * It covers the signature as well as the words, so what is stored is a fingerprint of the
 * thing that was actually signed rather than of the sentence somebody could have signed. That
 * is what lets a share card be checked against a bet, and it is also — for free — what makes
 * creation idempotent (`0007_one_bet_per_commitment.sql`).
 *
 * Computed on the server, from values the server re-derived. A hash accepted from the client
 * would be a number the client chose, and the column it lands in is unique per creator.
 */
export function commitmentHash(draft: SubmittableDraft): HexHash {
  const digest = createHash('sha256')
    .update(commitmentCanonicalString(draft), 'utf8')
    .digest('hex');
  return digest as HexHash;
}
