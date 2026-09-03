import { z } from 'zod';
import {
  asUsdcAmount,
  BENEFICIARY_KINDS,
  BET_FORMATS,
  BET_STATES,
  CHAIN_NETWORKS,
  DECISION_MODES,
  isBetId,
  isHexHash,
  isShortCode,
  isTxSignature,
  isUserId,
  isWalletAddress,
  OUTCOMES,
  PARTY_SIDES,
  type BeneficiaryKind,
  type Bet,
  type BetId,
  type Claim,
  type Dispute,
  type HexHash,
  type Party,
  type Referee,
  type ShortCode,
  type Signature,
  type TxSignature,
  type UserId,
  type ViewerRole,
  type WalletAddress,
} from '@sporim/domain';

/**
 * The seam between a Postgres row and the domain `Bet`.
 *
 * Everything crossing it is parsed, never cast on faith: the database is a boundary like any
 * other, and a column that drifted from what the domain expects should fail here with the
 * column's name in the message rather than three layers up as a wrong number on a receipt.
 *
 * Two conversions carry all the risk and both are done in one place:
 *
 *   * **Money.** int8 arrives as a JS `bigint` (see `client.ts`), or as a digit string if the
 *     driver were ever reconfigured. A JavaScript `number` is rejected outright — accepting
 *     one is how base units silently become a float.
 *   * **Time.** `timestamptz` arrives as a `Date`; the domain counts unix seconds. The column
 *     defaults truncate to the second so the two representations agree exactly.
 *
 * A bet is assembled from four tables, so the mapper takes a bundle rather than a row.
 */

/** `VIEWER_ROLES` without `observer`: an observer is the absence of a participant row. */
export const PARTICIPANT_ROLES = [
  'creator',
  'opponent',
  'referee',
  'beneficiary',
] as const satisfies readonly ViewerRole[];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

function branded<T extends string>(guard: (value: string) => value is T, label: string) {
  // The guard has already run when the transform executes, so the cast is the assertion
  // being made rather than a hole in it.
  return z
    .string()
    .refine(guard, `not a valid ${label}`)
    .transform((value) => value as T);
}

const betIdColumn = branded(isBetId, 'bet id');
const userIdColumn = branded(isUserId, 'user id');
const shortCodeColumn = branded(isShortCode, 'short code');
const walletColumn = branded(isWalletAddress, 'wallet address');
const txColumn = branded(isTxSignature, 'transaction signature');
const hexHashColumn = branded(isHexHash, 'terms hash');

/**
 * USDC base units. A `number` is not in the union on purpose: every integer above 2^53 that
 * matters here would arrive already rounded, and there is no way to detect that after the
 * fact.
 */
const usdcColumn = z
  .union([z.bigint(), z.string().regex(/^\d+$/, 'expected USDC base units as digits')])
  .transform((value) => asUsdcAmount(typeof value === 'bigint' ? value : BigInt(value)));

const unixSecondsColumn = z.date().transform((date) => Math.floor(date.getTime() / 1000));

/** Unix seconds back to a `timestamptz` parameter. Whole seconds in, whole seconds out. */
export function toTimestamp(seconds: number): Date {
  return new Date(seconds * 1000);
}

/**
 * The signature as a plain document for the jsonb column. Rebuilt field by field rather than
 * handed over as-is: the driver wants an indexable object, and spelling the shape out here
 * means a field added to `Signature` has to be considered rather than silently stored.
 */
export function signatureToJson(signature: Signature) {
  return signature.kind === 'typed'
    ? { kind: 'typed', name: signature.name }
    : {
        kind: 'drawn',
        strokes: signature.strokes.map((stroke) => [...stroke]),
        height: signature.height,
      };
}

export const betRowSchema = z.object({
  id: betIdColumn,
  short_code: shortCodeColumn,
  format: z.enum(BET_FORMATS),
  state: z.enum(BET_STATES),
  terms: z.string(),
  terms_hash: hexHashColumn,
  stake_creator: usdcColumn,
  stake_opponent: usdcColumn,
  decision_mode: z.enum(DECISION_MODES),
  outcome: z.enum(OUTCOMES).nullable(),
  fee_bps: z.number().int(),
  chain: z.enum(CHAIN_NETWORKS),
  create_tx: txColumn.nullable(),
  accept_tx: txColumn.nullable(),
  settle_tx: txColumn.nullable(),
  created_at: unixSecondsColumn,
  accept_deadline_at: unixSecondsColumn,
  deadline_at: unixSecondsColumn,
});
export type BetRow = z.output<typeof betRowSchema>;

export const participantRowSchema = z.object({
  role: z.enum(PARTICIPANT_ROLES),
  user_id: userIdColumn.nullable(),
  wallet_address: walletColumn.nullable(),
  display_name: z.string().nullable(),
  beneficiary_kind: z.enum(BENEFICIARY_KINDS).nullable(),
  /**
   * When this person took the role, or null if they never did. Only the referee seat reads it
   * today, and the difference it makes is the whole of `disputedActions`: an unconfirmed
   * referee's silence refunds instead of deciding.
   *
   * Defaulted rather than required, because every fixture and every row written before 0004
   * predates the column and "we never asked them" is the honest reading of its absence.
   */
  confirmed_at: unixSecondsColumn.nullable().default(null),
});
export type ParticipantRow = z.output<typeof participantRowSchema>;

export const claimRowSchema = z.object({
  by_side: z.enum(PARTY_SIDES),
  outcome: z.enum(OUTCOMES),
  claimed_at: unixSecondsColumn,
  window_ends_at: unixSecondsColumn,
});
export type ClaimRow = z.output<typeof claimRowSchema>;

export const disputeRowSchema = z.object({
  by_side: z.enum(PARTY_SIDES),
  bond_amount: usdcColumn,
  opened_at: unixSecondsColumn,
  referee_deadline_at: unixSecondsColumn,
});
export type DisputeRow = z.output<typeof disputeRowSchema>;

export interface BetRowBundle {
  readonly bet: BetRow;
  readonly participants: readonly ParticipantRow[];
  readonly claim: ClaimRow | null;
  readonly dispute: DisputeRow | null;
}

export class BetRowError extends Error {
  constructor(betId: string, detail: string) {
    super(`Bet ${betId} cannot be mapped: ${detail}`);
    this.name = 'BetRowError';
  }
}

function toParty(row: ParticipantRow): Party {
  return { userId: row.user_id, wallet: row.wallet_address, displayName: row.display_name };
}

/**
 * The referee seat carries one fact a `Party` does not: whether the person behind the name
 * ever agreed to sit in it. Read straight off the row and never inferred — "they have a user
 * id, so presumably they said yes" is exactly the guess this column exists to stop.
 */
function toReferee(row: ParticipantRow): Referee {
  return { ...toParty(row), confirmedAtSeconds: row.confirmed_at };
}

/** Rows to the domain. Throws on a row the domain has no shape for — that is a broken invariant. */
export function toBet(bundle: BetRowBundle): Bet {
  const { bet } = bundle;
  const byRole = new Map(bundle.participants.map((row) => [row.role, row]));

  const creatorRow = byRole.get('creator');
  if (!creatorRow) throw new BetRowError(bet.id, 'no creator participant row');

  const opponentRow = byRole.get('opponent');
  const refereeRow = byRole.get('referee');
  const beneficiaryRow = byRole.get('beneficiary');

  let beneficiary: Bet['beneficiary'] = null;
  if (beneficiaryRow) {
    // Guaranteed by `participants_beneficiary_kind_placement`; asserted anyway, because the
    // mapper is also fed by tests and by whatever writes rows next year.
    if (!beneficiaryRow.beneficiary_kind) {
      throw new BetRowError(bet.id, 'beneficiary participant has no kind');
    }
    beneficiary = { ...toParty(beneficiaryRow), kind: beneficiaryRow.beneficiary_kind };
  }

  const claim: Claim | null = bundle.claim
    ? {
        outcome: bundle.claim.outcome,
        by: bundle.claim.by_side,
        atSeconds: bundle.claim.claimed_at,
        windowEndsAtSeconds: bundle.claim.window_ends_at,
      }
    : null;

  const dispute: Dispute | null = bundle.dispute
    ? {
        by: bundle.dispute.by_side,
        bond: bundle.dispute.bond_amount,
        atSeconds: bundle.dispute.opened_at,
        refereeDeadlineSeconds: bundle.dispute.referee_deadline_at,
      }
    : null;

  return {
    id: bet.id,
    shortCode: bet.short_code,
    format: bet.format,
    state: bet.state,
    terms: bet.terms,
    termsHash: bet.terms_hash,
    stakeCreator: bet.stake_creator,
    stakeOpponent: bet.stake_opponent,
    decisionMode: bet.decision_mode,
    creator: toParty(creatorRow),
    opponent: opponentRow ? toParty(opponentRow) : null,
    referee: refereeRow ? toReferee(refereeRow) : null,
    beneficiary,
    createdAtSeconds: bet.created_at,
    acceptDeadlineSeconds: bet.accept_deadline_at,
    deadlineSeconds: bet.deadline_at,
    claim,
    dispute,
    outcome: bet.outcome,
    feeBps: bet.fee_bps,
    chain: bet.chain,
    createTx: bet.create_tx,
    acceptTx: bet.accept_tx,
    settleTx: bet.settle_tx,
  };
}

/** Column values for `insert into bets`. `creator_id` is the one column the domain implies rather than holds. */
export interface BetInsert {
  readonly id: BetId;
  readonly short_code: ShortCode;
  readonly format: Bet['format'];
  readonly state: Bet['state'];
  readonly terms: string;
  readonly terms_hash: HexHash;
  readonly stake_creator: bigint;
  readonly stake_opponent: bigint;
  readonly decision_mode: Bet['decisionMode'];
  readonly creator_id: UserId;
  readonly outcome: Bet['outcome'];
  readonly fee_bps: number;
  readonly chain: Bet['chain'];
  readonly create_tx: TxSignature | null;
  readonly accept_tx: TxSignature | null;
  readonly settle_tx: TxSignature | null;
  readonly created_at: Date;
  readonly accept_deadline_at: Date;
  readonly deadline_at: Date;
}

export function toBetInsert(bet: Bet, creatorId: UserId): BetInsert {
  return {
    id: bet.id,
    short_code: bet.shortCode,
    format: bet.format,
    state: bet.state,
    terms: bet.terms,
    terms_hash: bet.termsHash,
    stake_creator: bet.stakeCreator,
    stake_opponent: bet.stakeOpponent,
    decision_mode: bet.decisionMode,
    creator_id: creatorId,
    outcome: bet.outcome,
    fee_bps: bet.feeBps,
    chain: bet.chain,
    create_tx: bet.createTx,
    accept_tx: bet.acceptTx,
    settle_tx: bet.settleTx,
    created_at: toTimestamp(bet.createdAtSeconds),
    accept_deadline_at: toTimestamp(bet.acceptDeadlineSeconds),
    deadline_at: toTimestamp(bet.deadlineSeconds),
  };
}

export interface ClaimInsert {
  readonly bet_id: BetId;
  readonly by_side: Claim['by'];
  readonly claimant_user_id: UserId | null;
  readonly outcome: Claim['outcome'];
  readonly note: string | null;
  readonly claimed_at: Date;
  readonly window_ends_at: Date;
}

export function toClaimInsert(
  betId: BetId,
  claim: Claim,
  claimantUserId: UserId | null,
  note: string | null = null,
): ClaimInsert {
  return {
    bet_id: betId,
    by_side: claim.by,
    claimant_user_id: claimantUserId,
    outcome: claim.outcome,
    note,
    claimed_at: toTimestamp(claim.atSeconds),
    window_ends_at: toTimestamp(claim.windowEndsAtSeconds),
  };
}

export interface DisputeInsert {
  readonly bet_id: BetId;
  readonly claim_id: string;
  readonly by_side: Dispute['by'];
  readonly disputer_user_id: UserId | null;
  readonly bond_amount: bigint;
  readonly reason: string | null;
  readonly opened_at: Date;
  readonly referee_deadline_at: Date;
}

export function toDisputeInsert(
  betId: BetId,
  claimId: string,
  dispute: Dispute,
  disputerUserId: UserId | null,
  reason: string | null = null,
): DisputeInsert {
  return {
    bet_id: betId,
    claim_id: claimId,
    by_side: dispute.by,
    disputer_user_id: disputerUserId,
    bond_amount: dispute.bond,
    reason,
    opened_at: toTimestamp(dispute.atSeconds),
    referee_deadline_at: toTimestamp(dispute.refereeDeadlineSeconds),
  };
}

export interface ParticipantInsert {
  readonly bet_id: BetId;
  readonly role: ParticipantRole;
  readonly user_id: UserId | null;
  readonly wallet_address: WalletAddress | null;
  readonly display_name: string | null;
  readonly invite_ref: string | null;
  readonly beneficiary_kind: BeneficiaryKind | null;
  readonly signature: Signature | null;
  readonly signed_at: Date | null;
  readonly confirmed_at: Date | null;
}

/**
 * One insert per party the bet actually has.
 *
 * `signatures` is a separate argument because the domain `Bet` does not carry one: the
 * scrawl belongs to the act of committing (`BetDraft.signature`), not to the bet's state, and
 * inventing a `Bet.signature` to make this function symmetric would put a field in the domain
 * that no rule reads. The column is written here and dropped on the way back.
 */
export function toParticipantInserts(
  bet: Bet,
  signatures: Partial<Record<ParticipantRole, { signature: Signature; atSeconds: number }>> = {},
): readonly ParticipantInsert[] {
  const rows: ParticipantInsert[] = [];

  const push = (
    role: ParticipantRole,
    party: Party | null,
    beneficiaryKind: BeneficiaryKind | null,
    confirmedAtSeconds: number | null = null,
  ): void => {
    if (!party) return;
    const signed = signatures[role];
    rows.push({
      bet_id: bet.id,
      role,
      user_id: party.userId,
      wallet_address: party.wallet,
      display_name: party.displayName,
      invite_ref: null,
      beneficiary_kind: beneficiaryKind,
      signature: signed ? signed.signature : null,
      signed_at: signed ? toTimestamp(signed.atSeconds) : null,
      confirmed_at: confirmedAtSeconds === null ? null : toTimestamp(confirmedAtSeconds),
    });
  };

  push('creator', bet.creator, null);
  push('opponent', bet.opponent, null);
  push('referee', bet.referee, null, bet.referee?.confirmedAtSeconds ?? null);
  push('beneficiary', bet.beneficiary, bet.beneficiary?.kind ?? null);

  return rows;
}
