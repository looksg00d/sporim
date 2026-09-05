import {
  canPerform,
  CLAIM_WINDOW_SECONDS,
  err,
  nextState,
  ok,
  REFEREE_TIMEOUT_SECONDS,
  resolveViewerRole,
  roleToSide,
  type Bet,
  type BetAction,
  type BetId,
  type Claim,
  type Dispute,
  type Outcome,
  type HexHash,
  type Party,
  type Result,
  type Signature,
  type ShortCode,
  type UserId,
  type ViewerRole,
} from '@sporim/domain';
import { nowSeconds as currentSeconds } from '@/lib/time';
import { withUser, type DbTransaction } from './client';
import {
  betRowSchema,
  claimRowSchema,
  disputeRowSchema,
  participantRowSchema,
  toBet,
  toBetInsert,
  toClaimInsert,
  toDisputeInsert,
  toParticipantInserts,
  signatureToJson,
  type ParticipantRole,
} from './bet-row';
import { forbidden, notFound, type RepoError } from './errors';
import { newRefereeToken } from './link-secrets';
import { requireCurrentUser, type UserRecord } from './users.repo';

/**
 * Bets.
 *
 * Every exported function authorizes before it does anything, and it authorizes with the
 * domain rather than with a hand-rolled rule: `resolveViewerRole` says who the caller is on
 * this bet and `canPerform` says whether the state machine allows the move right now. The UI
 * renders from the same two functions, so a button that is not on screen is also a call the
 * server refuses — there is one answer to "may I", not two that can drift.
 *
 * Row-level security is underneath all of it, not instead of it (`0002_rls.sql`). If a
 * function here were ever written without the check, the policies would still see an
 * unrelated Privy DID and return nothing.
 */

type RawRow = Record<string, unknown>;

/** Which transaction-signature column an action writes into, if any. */
function txColumnFor(action: BetAction): 'accept_tx' | 'settle_tx' | null {
  switch (action) {
    case 'accept':
      return 'accept_tx';
    case 'confirmClaim':
    case 'settleUncontested':
    case 'refereeResolve':
    case 'refundExpired':
      return 'settle_tx';
    default:
      return null;
  }
}

/**
 * Assembles a bet from its four tables. Exported for `referee.repo.ts`, which reaches a bet
 * through a capability rather than through membership and must still see the same object —
 * two ways in, one shape out. What each caller is *allowed* to see is the policies' answer,
 * not this function's: run it in the wrong transaction and it finds nothing.
 */
export async function loadBet(sql: DbTransaction, betId: BetId): Promise<Bet | null> {
  const betRows = await sql<RawRow[]>`select * from bets where id = ${betId}`;
  const betRow = betRows[0];
  if (!betRow) return null;

  const [participants, claims, disputes] = await Promise.all([
    sql<RawRow[]>`select * from participants where bet_id = ${betId}`,
    sql<RawRow[]>`select * from claims where bet_id = ${betId}`,
    sql<RawRow[]>`select * from disputes where bet_id = ${betId}`,
  ]);

  return toBet({
    bet: betRowSchema.parse(betRow),
    participants: participants.map((row) => participantRowSchema.parse(row)),
    claim: claims[0] ? claimRowSchema.parse(claims[0]) : null,
    dispute: disputes[0] ? disputeRowSchema.parse(disputes[0]) : null,
  });
}

export interface Caller {
  readonly user: UserRecord;
  readonly bet: Bet;
  readonly role: ViewerRole;
}

/**
 * The one gate. Resolves the session to a user, the user to a role on this bet, and refuses
 * anyone the state machine would not let take `action` right now.
 *
 * A stranger gets `NOT_FOUND`, never `FORBIDDEN`: telling them the bet exists but is not
 * theirs turns a guessed id into a membership oracle.
 *
 * Which is also why `accept` does not go through here, and still must not. The person
 * accepting is by definition not yet on the bet, so this gate refuses them — correctly, since
 * what authorizes them is possession of the link, which this function has no way to see. That
 * flow lives in `accept.repo.ts` with `0011`'s policies underneath it, exactly as
 * `0003_participant_insert_scope.sql` asked. `recordAction(…, 'accept', …)` answers NOT_FOUND
 * and should keep answering it: a second door into the same transition is a second place to
 * get the rules wrong.
 */
async function authorize(
  sql: DbTransaction,
  privyDid: string,
  betId: BetId,
  action: BetAction,
  atSeconds: number,
): Promise<Result<Caller, RepoError>> {
  const user = await requireCurrentUser(sql, privyDid);
  if (!user.ok) return user;

  const bet = await loadBet(sql, betId);
  if (!bet) return err(notFound('bet'));

  const role = resolveViewerRole(bet, { userId: user.value.id, wallet: user.value.wallet });
  if (role === 'observer') return err(notFound('bet'));
  if (!canPerform(bet, role, action, atSeconds)) {
    return err(forbidden(`${role} cannot ${action} a bet in state ${bet.state}`));
  }
  return ok({ user: user.value, bet, role });
}

/**
 * Exported for `accept.repo.ts`, for the same reason `loadBet` is: a capability-based flow
 * makes the same transitions and its audit rows must be indistinguishable from these. One
 * writer, one shape — a second `insert into bet_events` somewhere else is a second chance to
 * record a move differently from the way it happened.
 */
export async function appendEvent(
  sql: DbTransaction,
  input: {
    readonly betId: BetId;
    readonly action: BetAction;
    readonly fromState: Bet['state'];
    readonly toState: Bet['state'];
    readonly actor: Caller | null;
    readonly tx: string | null;
  },
): Promise<void> {
  const actorRole = input.actor && input.actor.role !== 'observer' ? input.actor.role : null;
  await sql`
    insert into bet_events (bet_id, action, from_state, to_state, actor_user_id, actor_role, tx)
    values (
      ${input.betId},
      ${input.action}::bet_action,
      ${input.fromState}::bet_state,
      ${input.toState}::bet_state,
      ${input.actor?.user.id ?? null},
      ${actorRole}::participant_role,
      ${input.tx}
    )
  `;
}

export interface CreateBetInput {
  /**
   * The finished bet, built by the caller from a validated draft. Passing the domain object
   * rather than a bag of columns keeps this repository from re-deriving product rules that
   * `toSubmittable` already applied.
   */
  readonly bet: Bet;
  /** The creator's scrawl. Stored on their participant row; not part of `Bet` — see `bet-row.ts`. */
  readonly signature?: Signature;
}

/**
 * The bet this creator already has for this commitment, if any.
 *
 * Only ever asked after an insert declined to happen, so the row is by definition the
 * caller's own and `bets_select_participant` lets them read it. A stranger asking the same
 * question sees nothing, which is the same answer they get everywhere else.
 */
async function loadBetByCommitment(
  sql: DbTransaction,
  creatorId: UserId,
  termsHash: HexHash,
): Promise<Bet | null> {
  const rows = await sql<RawRow[]>`
    select id from bets where creator_id = ${creatorId} and terms_hash = ${termsHash}
  `;
  const id = rows[0]?.id;
  return id === undefined ? null : loadBet(sql, id as BetId);
}

export async function createBet(
  privyDid: string,
  input: CreateBetInput,
  atSeconds: number = currentSeconds(),
): Promise<Result<Bet, RepoError>> {
  return withUser(privyDid, async (sql) => {
    const user = await requireCurrentUser(sql, privyDid);
    if (!user.ok) return user;

    const claimed = input.bet.creator.userId;
    if (claimed && claimed !== user.value.id) {
      return err(forbidden('a bet can only be created in your own name'));
    }

    // Forced rather than trusted: an unset `creator.userId` would produce a participant row
    // with a null user, and the creator would immediately lose sight of their own bet.
    const creator: Party = { ...input.bet.creator, userId: user.value.id };

    // Forced for the opposite reason. Consent is the referee's to give, and this call is the
    // creator's. Whatever the caller passed, a referee leaves this function unconfirmed — the
    // only thing that sets `confirmedAtSeconds` is that person opening their own link
    // (`confirmReferee`). Without this line the creator could hand themselves a referee whose
    // silence upholds their claim, which is exactly the abuse `disputedActions` splits on.
    const referee: Bet['referee'] = input.bet.referee
      ? { ...input.bet.referee, confirmedAtSeconds: null }
      : null;

    const bet: Bet = { ...input.bet, creator, referee };

    // Idempotent by the commitment hash (`0007_one_bet_per_commitment.sql`). A retry, a
    // double tap or a page that came back from a login round trip and posted again all land
    // here; the second one inserts nothing and reads back the bet the first one wrote. Done
    // with ON CONFLICT rather than a look-before-insert because two simultaneous attempts
    // would both look and both find nothing.
    const inserted = await sql<RawRow[]>`
      insert into bets ${sql(toBetInsert(bet, user.value.id))}
      on conflict (creator_id, terms_hash) do nothing
      returning id
    `;
    if (inserted.length === 0) {
      const existing = await loadBetByCommitment(sql, user.value.id, bet.termsHash);
      // The conflicting row is the caller's own by construction, so failing to read it back
      // means something else is wrong — say so rather than pretending nothing happened.
      return existing ? ok(existing) : err({ code: 'CONFLICT', reason: 'bet already exists' });
    }

    const signatures = input.signature
      ? { creator: { signature: input.signature, atSeconds } }
      : ({} as Partial<Record<ParticipantRole, { signature: Signature; atSeconds: number }>>);
    const rows = toParticipantInserts(bet, signatures).map((row) => ({
      ...row,
      signature: row.signature === null ? null : sql.json(signatureToJson(row.signature)),
    }));

    // Two statements, and the order is the policy's. `participants_insert_on_my_bets` lets
    // you add a row for yourself, or any row on a bet you are already on — and "already on"
    // is judged against the snapshot the statement started with, so a single multi-row insert
    // carrying the creator *and* the opponent fails on the opponent. The creator goes in
    // first and alone; everyone else follows, now visibly on the bet.
    const creatorRow = rows.find((row) => row.role === 'creator');
    if (!creatorRow) return err({ code: 'INVALID', issues: ['a bet needs a creator'] });
    await sql`insert into participants ${sql(creatorRow)}`;

    const others = rows.filter((row) => row.role !== 'creator');
    if (others.length > 0) await sql`insert into participants ${sql(others)}`;

    // The referee's own link, and only when there is a referee to send it to. A separate
    // secret from `short_code` because it grants a separate power: one link for both would
    // let whoever opened it first decide whether they were a player or the judge. It lands in
    // `referee_invites`, whose policy names the creator alone — a column on `bets` would be
    // readable by the opponent, who could then buy themselves a friendly referee (0004).
    if (bet.referee) {
      await sql`
        insert into referee_invites (bet_id, token) values (${bet.id}, ${newRefereeToken()})
      `;
    }

    // `share` is the action that opens a bet in `machine.ts`; a bet written straight into
    // some other state (only tests do that) gets no transition row, because none happened.
    if (bet.state === 'open') {
      await appendEvent(sql, {
        betId: bet.id,
        action: 'share',
        fromState: 'draft',
        toState: 'open',
        actor: null,
        tx: null,
      });
    }

    return ok(bet);
  });
}

export async function getBet(privyDid: string, betId: BetId): Promise<Result<Bet, RepoError>> {
  return withUser(privyDid, async (sql) => {
    const user = await requireCurrentUser(sql, privyDid);
    if (!user.ok) return user;

    const bet = await loadBet(sql, betId);
    if (!bet) return err(notFound('bet'));

    const role = resolveViewerRole(bet, { userId: user.value.id, wallet: user.value.wallet });
    if (role === 'observer') return err(notFound('bet'));
    return ok(bet);
  });
}

/** A bet and who the caller is on it. The role is never recomputed by the caller. */
export interface BetView {
  readonly bet: Bet;
  readonly role: ViewerRole;
}

/**
 * The same bet, reached by the string that gets shared rather than by its uuid.
 *
 * Membership decides what comes back here, and that is now the *narrow* of the two ways in:
 * `accept.repo.ts` reads the same bet through the code itself, for somebody who is not on it
 * yet. Use this one where membership is the question — a participant's own view — and that one
 * where possession of the link is.
 *
 * The role travels back with the bet because it was computed here to decide whether to answer
 * at all, and because the alternative is every page resolving it again from an identity it
 * would have to be handed separately. One derivation, one answer: a screen cannot disagree
 * with the check that let it render.
 */
export async function getBetByShortCode(
  privyDid: string,
  shortCode: ShortCode,
): Promise<Result<BetView, RepoError>> {
  return withUser(privyDid, async (sql) => {
    const user = await requireCurrentUser(sql, privyDid);
    if (!user.ok) return user;

    const rows = await sql<RawRow[]>`select id from bets where short_code = ${shortCode}`;
    const id = rows[0]?.id;
    if (id === undefined) return err(notFound('bet'));

    const bet = await loadBet(sql, id as BetId);
    if (!bet) return err(notFound('bet'));

    const role = resolveViewerRole(bet, { userId: user.value.id, wallet: user.value.wallet });
    if (role === 'observer') return err(notFound('bet'));
    return ok({ bet, role });
  });
}

/**
 * Every bet the caller is on, newest first. One query per table, grouped in memory — not N+1.
 *
 * "On" includes refereeing one: a referee has a `participants` row, and the person asked to
 * settle an argument needs somewhere to find it as much as the two arguing do. Each bet comes
 * back with the caller's role for the same reason `getBetByShortCode` returns one — the list
 * has to say whose turn it is, and that answer must not be recomputed from an identity the
 * page would have to be handed separately.
 */
export async function listBetsForUser(
  privyDid: string,
): Promise<Result<readonly BetView[], RepoError>> {
  return withUser(privyDid, async (sql) => {
    const user = await requireCurrentUser(sql, privyDid);
    if (!user.ok) return user;

    const betRows = await sql<RawRow[]>`
      select b.* from bets b
      join participants p on p.bet_id = b.id
      where p.user_id = ${user.value.id}
      order by b.created_at desc
    `;
    if (betRows.length === 0) return ok([]);

    const ids = betRows.map((row) => betRowSchema.parse(row).id);
    const [participants, claims, disputes] = await Promise.all([
      sql<RawRow[]>`select * from participants where bet_id in ${sql(ids)}`,
      sql<RawRow[]>`select * from claims where bet_id in ${sql(ids)}`,
      sql<RawRow[]>`select * from disputes where bet_id in ${sql(ids)}`,
    ]);

    const groupBy = <T>(rows: readonly RawRow[], parse: (row: RawRow) => T): Map<string, T[]> => {
      const grouped = new Map<string, T[]>();
      for (const row of rows) {
        const key = String(row.bet_id);
        const list = grouped.get(key) ?? [];
        list.push(parse(row));
        grouped.set(key, list);
      }
      return grouped;
    };

    const byBetParticipants = groupBy(participants, (row) => participantRowSchema.parse(row));
    const byBetClaim = groupBy(claims, (row) => claimRowSchema.parse(row));
    const byBetDispute = groupBy(disputes, (row) => disputeRowSchema.parse(row));

    const viewer = { userId: user.value.id, wallet: user.value.wallet };
    return ok(
      betRows.map((row) => {
        const parsed = betRowSchema.parse(row);
        const bet = toBet({
          bet: parsed,
          participants: byBetParticipants.get(parsed.id) ?? [],
          claim: byBetClaim.get(parsed.id)?.[0] ?? null,
          dispute: byBetDispute.get(parsed.id)?.[0] ?? null,
        });
        return { bet, role: resolveViewerRole(bet, viewer) };
      }),
    );
  });
}

export interface RecordActionOptions {
  /** Required exactly when the action resolves the bet; ignored otherwise. */
  readonly outcome?: Outcome;
  readonly tx?: string;
}

/**
 * Moves a bet through one transition and writes the audit row for it.
 *
 * Claims and disputes have their own functions below because they create a child row as well
 * as a transition; everything else — accept, cancel, the four permissionless settlements — is
 * this.
 */
export async function recordAction(
  privyDid: string,
  betId: BetId,
  action: BetAction,
  options: RecordActionOptions = {},
  atSeconds: number = currentSeconds(),
): Promise<Result<Bet, RepoError>> {
  return withUser(privyDid, async (sql) => {
    const caller = await authorize(sql, privyDid, betId, action, atSeconds);
    if (!caller.ok) return caller;

    const toState = nextState(action);
    if (toState === 'resolved' && !options.outcome) {
      return err({ code: 'INVALID', issues: [`${action} needs an outcome`] });
    }

    const txColumn = txColumnFor(action);
    await sql`
      update bets set
        state = ${toState}::bet_state,
        outcome = coalesce(${options.outcome ?? null}::bet_outcome, outcome),
        accept_tx = coalesce(${txColumn === 'accept_tx' ? (options.tx ?? null) : null}, accept_tx),
        settle_tx = coalesce(${txColumn === 'settle_tx' ? (options.tx ?? null) : null}, settle_tx)
      where id = ${betId}
    `;

    await appendEvent(sql, {
      betId,
      action,
      fromState: caller.value.bet.state,
      toState,
      actor: caller.value,
      tx: options.tx ?? null,
    });

    const updated = await loadBet(sql, betId);
    return updated ? ok(updated) : err(notFound('bet'));
  });
}

export interface SubmitClaimInput {
  readonly outcome: Outcome;
  readonly note?: string;
}

export async function submitClaim(
  privyDid: string,
  betId: BetId,
  input: SubmitClaimInput,
  atSeconds: number = currentSeconds(),
): Promise<Result<Bet, RepoError>> {
  return withUser(privyDid, async (sql) => {
    const caller = await authorize(sql, privyDid, betId, 'submitClaim', atSeconds);
    if (!caller.ok) return caller;

    const side = roleToSide(caller.value.role);
    if (!side) return err(forbidden('only a party to the bet can claim'));

    const claim: Claim = {
      outcome: input.outcome,
      by: side,
      atSeconds,
      windowEndsAtSeconds: atSeconds + CLAIM_WINDOW_SECONDS,
    };
    const row = toClaimInsert(betId, claim, caller.value.user.id, input.note ?? null);
    await sql`insert into claims ${sql(row)}`;
    await sql`update bets set state = 'claimed'::bet_state where id = ${betId}`;
    await appendEvent(sql, {
      betId,
      action: 'submitClaim',
      fromState: caller.value.bet.state,
      toState: 'claimed',
      actor: caller.value,
      tx: null,
    });

    const updated = await loadBet(sql, betId);
    return updated ? ok(updated) : err(notFound('bet'));
  });
}

export interface OpenDisputeInput {
  readonly reason?: string;
}

/**
 * Says "no, they didn't". It costs nothing and moves nothing: the only thing a dispute
 * changes is that the referee now decides, and their deadline is derived here rather than
 * accepted from the caller.
 */
export async function openDispute(
  privyDid: string,
  betId: BetId,
  input: OpenDisputeInput = {},
  atSeconds: number = currentSeconds(),
): Promise<Result<Bet, RepoError>> {
  return withUser(privyDid, async (sql) => {
    const caller = await authorize(sql, privyDid, betId, 'disputeClaim', atSeconds);
    if (!caller.ok) return caller;

    const side = roleToSide(caller.value.role);
    if (!side) return err(forbidden('only a party to the bet can dispute'));

    const claims = await sql<RawRow[]>`select id from claims where bet_id = ${betId}`;
    const claimId = claims[0]?.id;
    if (!claimId) return err({ code: 'CONFLICT', reason: 'no claim to dispute' });

    const bet = caller.value.bet;
    const dispute: Dispute = {
      by: side,
      atSeconds,
      refereeDeadlineSeconds: atSeconds + REFEREE_TIMEOUT_SECONDS,
    };
    const row = toDisputeInsert(
      betId,
      String(claimId),
      dispute,
      caller.value.user.id,
      input.reason ?? null,
    );
    await sql`insert into disputes ${sql(row)}`;
    await sql`update bets set state = 'disputed'::bet_state where id = ${betId}`;
    await appendEvent(sql, {
      betId,
      action: 'disputeClaim',
      fromState: bet.state,
      toState: 'disputed',
      actor: caller.value,
      tx: null,
    });

    const updated = await loadBet(sql, betId);
    return updated ? ok(updated) : err(notFound('bet'));
  });
}
