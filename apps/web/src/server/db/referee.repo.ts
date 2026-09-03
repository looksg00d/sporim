import {
  err,
  isRefereeToken,
  isTerminal,
  ok,
  resolveViewerRole,
  type Bet,
  type BetId,
  type RefereeToken,
  type Result,
} from '@sporim/domain';
import { nowSeconds as currentSeconds } from '@/lib/time';
import { withRefereeToken, withUser, type DbTransaction } from './client';
import { toTimestamp } from './bet-row';
import { loadBet } from './bets.repo';
import { forbidden, notFound, type RepoError } from './errors';
import { requireCurrentUser } from './users.repo';

/**
 * The referee invitation: the second capability on a bet, and the only way anybody ever
 * becomes its judge.
 *
 * Two links exist and they are not the same link. `bets.short_code` says "take the other
 * side"; the token here says "settle it if they disagree". Sharing one secret between the two
 * would mean whoever opened it first chose their own role, and the role they would choose is
 * the one that suits them.
 *
 * ## What authorizes the caller
 *
 * Possession of the token, and nothing else. It is never read from a request body into a
 * trusted variable — it goes into the transaction through `withRefereeToken`, which binds it
 * to `app.referee_token`, and the policies in `0004_referee_confirmation.sql` compare it
 * against the stored row themselves. This layer cannot grant access it does not already have:
 * with a wrong token every read here returns nothing.
 *
 * ## The two crossings, both refused twice
 *
 *   * **A party cannot become the referee.** Checked below, and again by
 *     `app_may_claim_referee`. Judging your own case is the failure the referee exists to
 *     prevent, and the creator can see their own invitation link.
 *   * **A referee cannot take a side.** `openActions` never offers `accept` to the referee
 *     role, and once confirmed they hold the referee participant row, so `resolveViewerRole`
 *     answers `referee` for them from then on.
 */

type RawRow = Record<string, unknown>;

/** What the `/r/[token]` screen may offer the person holding the link. */
export type RefereeInviteStatus =
  /** Signed in, not on the bet, seat vacant: they can take it. */
  | 'open'
  /** They already took it. Opening the link again is not an error. */
  | 'yours'
  /** Somebody else got here first. A capability is not exclusive; the seat is. */
  | 'taken'
  /** They are the creator, the opponent or the beneficiary. Nobody judges their own case. */
  | 'party'
  /** No session. They may read the terms; taking a role needs an account to attach it to. */
  | 'anonymous'
  /** The bet is over. Nothing left to referee. */
  | 'closed';

export interface RefereeInvite {
  readonly bet: Bet;
  readonly status: RefereeInviteStatus;
}

/** The creator's copy of the link, plus whether it has been taken up yet. */
export interface RefereeInviteLink {
  readonly token: RefereeToken;
  readonly refereeName: string | null;
  readonly confirmedAtSeconds: number | null;
}

/**
 * Which bet this transaction's token unlocks.
 *
 * Asked of the database rather than derived from a `select` on `bets`, because that select
 * would also return every bet the caller is a participant of and the answer has to be the
 * token's alone. `app_referee_token_bet()` is NULL when the token is unknown or unset.
 */
async function tokenBetId(sql: DbTransaction): Promise<BetId | null> {
  const rows = await sql<{ bet_id: string | null }[]>`select app_referee_token_bet() as bet_id`;
  const id = rows[0]?.bet_id ?? null;
  return id === null ? null : (id as BetId);
}

/**
 * Reads the invitation for whoever opened the link, signed in or not.
 *
 * Anonymous reads are deliberate. Somebody asked to arbitrate an argument about money is
 * entitled to see what the argument is, who it is between and what the role costs them,
 * before they hand over an identity. What they cannot do without one is accept.
 */
export async function readRefereeInvite(
  token: string,
  privyDid: string | null = null,
): Promise<Result<RefereeInvite, RepoError>> {
  // Shape-checked before it reaches SQL, which also means a short code pasted into `/r/`
  // never gets as far as a lookup: the two capabilities have exclusive lengths.
  if (!isRefereeToken(token)) return err(notFound('invitation'));

  return withRefereeToken(token, privyDid, async (sql) => {
    const betId = await tokenBetId(sql);
    if (!betId) return err(notFound('invitation'));

    const bet = await loadBet(sql, betId);
    // A bet with an invitation but no referee row is not a shape the writer can produce; if
    // it ever appears, the honest answer is that there is nothing here to accept.
    if (!bet?.referee) return err(notFound('invitation'));

    if (!privyDid) return ok({ bet, status: 'anonymous' });

    const user = await requireCurrentUser(sql, privyDid);
    // Signed in as somebody with no row yet — treat them as a stranger reading the terms
    // rather than failing the page. The row appears on their first real action.
    if (!user.ok) return ok({ bet, status: 'anonymous' });

    const role = resolveViewerRole(bet, { userId: user.value.id, wallet: user.value.wallet });
    const mine = bet.referee.userId !== null && bet.referee.userId === user.value.id;

    if (mine)
      return ok({ bet, status: bet.referee.confirmedAtSeconds === null ? 'open' : 'yours' });
    if (role !== 'observer') return ok({ bet, status: 'party' });
    if (bet.referee.confirmedAtSeconds !== null) return ok({ bet, status: 'taken' });
    if (isTerminal(bet.state)) return ok({ bet, status: 'closed' });
    return ok({ bet, status: 'open' });
  });
}

/**
 * Takes the role.
 *
 * Idempotent for the person who already holds it: a forwarded link gets opened twice, and the
 * second time is not an error. It is emphatically not idempotent for anybody else — the seat
 * belongs to whoever confirmed, and 0004's trigger makes that permanent at the row level, so
 * neither this function nor a later one can quietly hand it on.
 */
export async function confirmReferee(
  privyDid: string,
  token: string,
  atSeconds: number = currentSeconds(),
): Promise<Result<Bet, RepoError>> {
  if (!isRefereeToken(token)) return err(notFound('invitation'));

  return withRefereeToken(token, privyDid, async (sql) => {
    const user = await requireCurrentUser(sql, privyDid);
    if (!user.ok) return user;

    const betId = await tokenBetId(sql);
    if (!betId) return err(notFound('invitation'));

    const bet = await loadBet(sql, betId);
    if (!bet?.referee) return err(notFound('invitation'));

    // Said here as well as in the policy, because a policy refusal arrives as zero rows
    // updated and this person deserves the reason rather than a shrug.
    const role = resolveViewerRole(bet, { userId: user.value.id, wallet: user.value.wallet });
    if (role !== 'observer' && role !== 'referee') {
      return err(forbidden('somebody on the bet cannot referee it'));
    }

    if (bet.referee.confirmedAtSeconds !== null) {
      return bet.referee.userId === user.value.id
        ? ok(bet)
        : err(forbidden('somebody else has already taken this role'));
    }

    if (isTerminal(bet.state)) {
      return err({ code: 'CONFLICT', reason: 'this bet is already settled' });
    }

    // `wallet_address` is coalesced and `display_name` is not touched at all. The name on the
    // card is the one the creator typed and both parties agreed to; a confirmation attaches an
    // account to the seat, it does not rewrite who the seat said it was.
    const updated = await sql<RawRow[]>`
      update participants set
        user_id = ${user.value.id},
        wallet_address = coalesce(${user.value.wallet}, wallet_address),
        confirmed_at = ${toTimestamp(atSeconds)}
      where bet_id = ${betId} and role = 'referee'
      returning id
    `;
    if (updated.length === 0) return err(forbidden('this invitation cannot be taken'));

    const after = await loadBet(sql, betId);
    return after ? ok(after) : err(notFound('bet'));
  });
}

/**
 * The creator's copy of the link, so there is something to send.
 *
 * Creator-only, and the policy on `referee_invites` says the same: the opponent must never
 * hold this token, or they could pass it to somebody who would rule for them. That is also
 * why the token is not a column on `bets` — row-level security is row-level, and a bet row
 * the opponent may read is a bet row they may read every column of.
 */
export async function getRefereeInvite(
  privyDid: string,
  betId: BetId,
): Promise<Result<RefereeInviteLink, RepoError>> {
  return withUser(privyDid, async (sql) => {
    const user = await requireCurrentUser(sql, privyDid);
    if (!user.ok) return user;

    const bet = await loadBet(sql, betId);
    if (!bet) return err(notFound('bet'));
    // NOT_FOUND rather than FORBIDDEN, like every other refusal here: telling a participant
    // that a link exists but is not theirs is more than they need to know.
    if (bet.creator.userId !== user.value.id) return err(notFound('invitation'));

    const rows = await sql<{ token: string }[]>`
      select token from referee_invites where bet_id = ${betId}
    `;
    const token = rows[0]?.token;
    if (token === undefined || !isRefereeToken(token)) return err(notFound('invitation'));

    return ok({
      token,
      refereeName: bet.referee?.displayName ?? null,
      confirmedAtSeconds: bet.referee?.confirmedAtSeconds ?? null,
    });
  });
}
