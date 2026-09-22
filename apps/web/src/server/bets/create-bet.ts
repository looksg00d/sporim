import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ZERO_USDC,
  beneficiaryKindSchema,
  clampSignature,
  decisionModeSchema,
  err,
  formatSchema,
  signatureSchema,
  stakeSchema,
  toSubmittable,
  type Bet,
  type BetDraft,
  type BetId,
  type Result,
  type SubmittableDraft,
} from '@sporim/domain';
import { env } from '@/lib/env';
import { nowSeconds as currentSeconds } from '@/lib/time';
import { createBet } from '@/server/db/bets.repo';
import { ensureUser, type UserRecord } from '@/server/db/users.repo';
import { newShortCode } from '@/server/db/link-secrets';
import type { RepoError } from '@/server/db/errors';
import { commitmentHash } from './commitment';

/**
 * Turning a wizard draft into a real bet.
 *
 * This module exists so the server action stays four lines long and so the interesting part —
 * what is accepted, what is re-derived, what is refused — can be read in one place and tested
 * without a request.
 *
 * ## What the client is allowed to say
 *
 * The payload below and nothing else. It carries what a person typed or chose: the words, the
 * amount they entered, the deadline they picked, the handles they wrote, the scrawl they
 * drew. Every one of those is re-validated here against the same domain rules the wizard
 * applied on screen, because a screen is a suggestion and a server action is a public
 * endpoint.
 *
 * ## What is re-derived rather than accepted
 *
 * Everything money touches, and everything that is a policy rather than a preference:
 *
 *   * **The fee.** `feeBps` is not in the payload at all. `toSubmittable` stamps `FEE_BPS`
 *     from the domain's constants, so a client cannot quote itself a cheaper agreement.
 *   * **The opposing stake.** Derived from the format — equal for a Bet, zero for a Commit —
 *     never sent. Asymmetric stakes are odds, which is a different product, and
 *     `calculateSettlement` refuses them anyway.
 *   * **The accept window.** `min(deadline, now + 48h)`, computed against the server's clock.
 *   * **The decision mode.** A one-sided format has nobody with an interest in telling the
 *     truth on the other side, so it is forced to `referee` whatever arrived.
 *   * **The commitment hash**, from the values above after they were re-derived.
 *   * **The identity.** `creator.userId` comes from the verified session; the repository
 *     refuses a bet created in anyone else's name, and the policies refuse it again.
 *   * **The short code and the referee token**, minted from `node:crypto`.
 *   * **The state, the chain, the timestamps** — none of which a client has an opinion about.
 *
 * The deadline is worth naming separately. It is accepted as a number, but re-checked against
 * *this* server's clock, so a draft that sat through a login round trip until its "Tonight"
 * had passed is refused here rather than written as a bet nobody can accept in time.
 */

/**
 * Deliberately narrower than `SubmittableDraft`. That type is the *output* of the domain's
 * gate and carries derived values; this is the input, and a field the client has no business
 * choosing is missing rather than ignored — an ignored field is one somebody adds a use for
 * later without noticing where it came from.
 */
export const createBetPayloadSchema = z.object({
  terms: z.string().max(4_000),
  format: formatSchema,
  /** The decimal string a person typed. A `number` here would be a float holding money. */
  stake: stakeSchema,
  deadlineSeconds: z.number().int().finite(),
  decisionMode: decisionModeSchema,
  refereeRef: z.string().max(200).optional(),
  beneficiaryKind: beneficiaryKindSchema.nullish(),
  beneficiaryRef: z.string().max(200).optional(),
  signature: signatureSchema,
});

export type CreateBetPayload = z.input<typeof createBetPayloadSchema>;

/**
 * The payload as the wizard's own draft, so the one gate that decides whether a draft may be
 * submitted is the same function on both sides of the wire.
 *
 * The two forced values are the rules `draftReducer` keeps on screen and a hand-written
 * request would not: a one-sided format decides by referee, and a plain Bet has no
 * beneficiary. Forced rather than rejected, because both are derivable — there is no
 * ambiguity to report back.
 */
function toDraft(payload: z.output<typeof createBetPayloadSchema>): BetDraft {
  const oneSided = payload.format !== 'bet';
  return {
    terms: payload.terms,
    format: payload.format,
    stake: payload.stake,
    deadlineSeconds: payload.deadlineSeconds,
    decisionMode: oneSided ? 'referee' : payload.decisionMode,
    refereeRef: payload.refereeRef ?? '',
    beneficiaryKind: oneSided ? (payload.beneficiaryKind ?? null) : null,
    beneficiaryRef: oneSided ? (payload.beneficiaryRef ?? '') : '',
    signature: clampSignature(payload.signature),
  };
}

/**
 * The finished bet, assembled from the re-derived draft and the session's own user.
 *
 * The referee and the beneficiary are named, not identified: a creator types "@anya" on the
 * fourth screen, and whether an account is behind that handle is not known and not assumed.
 * The referee's seat is left unconfirmed for the same reason — consent is theirs to give, by
 * opening their own link, and `createBet` nulls it a second time in case this ever forgets.
 */
function toBet(draft: SubmittableDraft, user: UserRecord, atSeconds: number): Bet {
  return {
    id: randomUUID() as BetId,
    shortCode: newShortCode(),
    format: draft.format,
    // `share` is what opens a bet in `machine.ts`, and creating one *is* sharing it: the
    // whole product is a link somebody sends. There is no state in which a bet exists and
    // nobody may accept it.
    state: 'open',
    terms: draft.terms,
    termsHash: commitmentHash(draft),
    stakeCreator: draft.stake,
    // Symmetric for a Bet, absent for a Commit. Never sent, so never wrong.
    stakeOpponent: draft.format === 'bet' ? draft.stake : ZERO_USDC,
    decisionMode: draft.decisionMode,
    creator: {
      userId: user.id,
      wallet: user.wallet,
      // The one name we honestly have. Somebody who signed by typing told us what to call
      // them; somebody who drew a scrawl did not, and inventing one would put a name on the
      // other person's card that its owner never chose.
      displayName: draft.signature.kind === 'typed' ? draft.signature.name : user.displayName,
    },
    // Nobody is named: whoever takes the link becomes the other side, under their own name.
    opponent: null,
    referee: draft.refereeRef
      ? { userId: null, wallet: null, displayName: draft.refereeRef, confirmedAtSeconds: null }
      : null,
    beneficiary: draft.beneficiaryKind
      ? {
          userId: null,
          wallet: null,
          displayName: draft.beneficiaryRef ?? null,
          kind: draft.beneficiaryKind,
        }
      : null,
    createdAtSeconds: atSeconds,
    acceptDeadlineSeconds: draft.acceptDeadlineSeconds,
    deadlineSeconds: draft.deadlineSeconds,
    claim: null,
    dispute: null,
    outcome: null,
    feeBps: draft.feeBps,
    chain: env.chainMode,
    // Mock mode says "Simulated" and means it: no signature is invented anywhere.
    createTx: null,
    acceptTx: null,
    settleTx: null,
  };
}

/**
 * `bets.short_code` is UNIQUE, and 46 bits of randomness makes a clash improbable rather than
 * impossible — at a million bets it is a fraction of a percent, which is small enough to
 * never see in testing and large enough to happen to a real person. Detected by constraint
 * name rather than by counting rows, and retried with a fresh code in a fresh transaction:
 * the failed one rolled back whole, so there is nothing to undo.
 */
function isShortCodeCollision(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false;
  const error = cause as { readonly code?: unknown; readonly constraint_name?: unknown };
  return (
    error.code === '23505' &&
    typeof error.constraint_name === 'string' &&
    error.constraint_name.includes('short_code')
  );
}

const SHORT_CODE_ATTEMPTS = 3;

export async function createBetFromDraft(
  privyDid: string,
  payload: unknown,
  atSeconds: number = currentSeconds(),
): Promise<Result<Bet, RepoError>> {
  const parsed = createBetPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return err({ code: 'INVALID', issues: parsed.error.issues.map((issue) => issue.message) });
  }

  // The same gate the review screen runs, against the server's clock. A draft that was
  // submittable an hour ago and is not any more — the deadline has since passed — stops here.
  const submittable = toSubmittable(toDraft(parsed.data), atSeconds);
  if (!submittable.ok) {
    const detail =
      submittable.error.code === 'INVALID'
        ? submittable.error.issues
        : [`the draft is not finished (${submittable.error.code.toLowerCase()})`];
    return err({ code: 'INVALID', issues: detail });
  }

  // First authenticated request creates the row every foreign key below points at.
  const user = await ensureUser(privyDid);
  if (!user.ok) return user;

  let lastError: RepoError = { code: 'CONFLICT', reason: 'could not mint a free short code' };
  for (let attempt = 0; attempt < SHORT_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await createBet(
        privyDid,
        {
          bet: toBet(submittable.value, user.value, atSeconds),
          signature: submittable.value.signature,
        },
        atSeconds,
      );
    } catch (cause) {
      if (!isShortCodeCollision(cause)) throw cause;
      lastError = { code: 'CONFLICT', reason: 'short code collision' };
    }
  }
  return err(lastError);
}
