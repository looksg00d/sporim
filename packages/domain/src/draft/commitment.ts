import type { SubmittableDraft } from './reducer';
import { signatureCanonicalString } from '../signature/signature';

/**
 * The canonical rendering of a finished agreement — the exact bytes that get hashed into
 * `Bet.termsHash`.
 *
 * Two jobs, and they are the same job seen from two sides:
 *
 *   * **Commitment.** The hash on the bet row has to cover everything the two people agreed
 *     to, including the scrawl, so that a card can later be proved to carry the agreement
 *     that was actually signed. `signature/signature.ts` already promises a stable rendering
 *     for exactly this; this is the rest of the sentence.
 *   * **Identity.** Two submissions of the same signed agreement are the same bet, so the
 *     hash is also what makes creation idempotent — a double tap, a retry after a dropped
 *     connection, or a page that came back from a login round trip and posted again all land
 *     on one row (`0007_bet_commitment_unique.sql`). Nothing has to be remembered between
 *     attempts, which is why this is derived rather than a token the client carries.
 *
 * Hashing itself is deliberately not here: the domain has no platform crypto, and both the
 * server (`node:crypto`) and the on-chain program will hash these same bytes.
 *
 * ## Why the encoding looks like this
 *
 * Every value goes through `JSON.stringify`, which escapes newlines and quotes, so a terms
 * string containing `\nstake=999` cannot forge a field boundary. The field order is fixed and
 * written out one per line rather than derived from `Object.keys`, because key order is an
 * implementation detail and this string is a hash input: it must not change when somebody
 * reorders an interface.
 *
 * The version prefix is the escape hatch. Changing any of the rules below changes every hash,
 * so the day that happens the prefix moves to `v2` and old rows stay verifiable against `v1`.
 */
export const COMMITMENT_VERSION = 'sporim.commitment.v1';

/**
 * What is in, and what is deliberately out.
 *
 * In: everything the two people can read on the review screen — the words, the format, the
 * money, the deadline, who decides, who is named, the fee they were quoted, and the
 * signature.
 *
 * Out: anything the server derives from the clock. `acceptDeadlineSeconds` is
 * `min(deadline, now + 48h)` and `createdAtSeconds` is the moment of writing, so including
 * either would make the same agreement hash differently on a retry — which is the one
 * property this string exists to provide.
 */
export function commitmentCanonicalString(draft: SubmittableDraft): string {
  const lines: readonly [string, unknown][] = [
    ['version', COMMITMENT_VERSION],
    ['format', draft.format],
    ['terms', draft.terms],
    ['stake', draft.stake.toString()],
    ['deadline', draft.deadlineSeconds],
    ['decision', draft.decisionMode],
    // Always null since 2026-09-17: nobody names the other side any more, whoever takes the
    // link is them. The line stays so that every v1 hash stays what it was.
    ['opponent', null],
    ['referee', draft.refereeRef ?? null],
    ['beneficiaryKind', draft.beneficiaryKind ?? null],
    ['beneficiaryRef', draft.beneficiaryRef ?? null],
    ['feeBps', draft.feeBps],
    ['signature', signatureCanonicalString(draft.signature)],
  ];

  return lines.map(([field, value]) => `${field}=${JSON.stringify(value)}`).join('\n');
}
