import {
  err,
  isShortCode,
  isSignatureMeaningful,
  ok,
  resolveViewerRole,
  type Bet,
  type BetId,
  type Result,
  type Signature,
  type ViewerRole,
} from '@sporim/domain';
import { nowSeconds as currentSeconds } from '@/lib/time';
import { signatureToJson, toTimestamp } from './bet-row';
import { applyTransition, asConflict, loadBet } from './bets.repo';
import { withShortCode, type DbTransaction } from './client';
import { forbidden, notFound, type RepoError } from './errors';
import { requireCurrentUser } from './users.repo';

/**
 * Taking the other side of a bet, by holding the link to it.
 *
 * This is the last gap in the loop. Until `0011` a bet's short code named it without
 * authorizing anybody to read it, so the link a creator pasted into a chat answered NOT_FOUND
 * to the one person it was meant for, and no bet could ever acquire a second side.
 *
 * ## What authorizes the caller
 *
 * Possession of the code, and nothing else. It goes into the transaction through
 * `withShortCode`, which binds it to `app.short_code`, and the policies compare it themselves.
 * Nothing the client asserts about who it is or what it may do is consulted anywhere.
 *
 * Unlike the referee token, the code is not a secret from anybody — it is printed on the card
 * and read out loud. What makes it a usable key is that `app_may_accept_bet` opens a bet only
 * while it is still `open`: guessing one buys what leaking a link buys, and no more.
 *
 * ## Two arms, because the row may or may not exist
 *
 * `confirmReferee` only ever updates, because a referee's row is written when the bet is
 * created. An opponent's row exists only if the creator typed a handle on the fourth screen,
 * so this has to be able to insert one — and `participants_one_row_per_role` makes the two
 * mutually exclusive rather than combinable.
 *
 * ## The crossings, refused twice
 *
 *   * **The creator cannot take their own other side.** Checked below and again by
 *     `app_may_accept_bet`.
 *   * **A referee cannot become a party.** Same two places, and the mirror of the rule
 *     `0004` enforces from the other direction.
 */

type RawRow = Record<string, unknown>;

/** What the `/b/[code]` screen may offer whoever opened the link. */
export type AcceptStatus =
  /** Signed in, not on the bet, the other side still free: they can take it. */
  | 'open'
  /** They already took it. A forwarded link gets opened twice; the second time is not an error. */
  | 'yours'
  /** Somebody else got here first. A capability is not exclusive; the seat is. */
  | 'taken'
  /** They are the creator, the referee or the beneficiary. */
  | 'party'
  /** No session. They may read the terms; taking a side needs an account to attach it to. */
  | 'anonymous'
  /** Nobody took it in time. The domain offers `expireUnaccepted` from here. */
  | 'expired'
  /** The bet has moved on — settled, refunded or called off. */
  | 'closed';

export interface BetByLink {
  readonly bet: Bet;
  readonly status: AcceptStatus;
  /** Who the viewer already is on this bet. `observer` for a stranger holding the link. */
  readonly role: ViewerRole;
}

/**
 * Which bet this transaction's code unlocks.
 *
 * Asked of the database rather than derived from a `select` on `bets`, because that select
 * would also return every bet the caller is a participant of — and on a code that names none
 * of them, the answer has to be nothing rather than the first row of somebody's own list.
 */
async function codeBetId(sql: DbTransaction): Promise<BetId | null> {
  const rows = await sql<{ bet_id: string | null }[]>`select app_short_code_bet() as bet_id`;
  const id = rows[0]?.bet_id ?? null;
  return id === null ? null : (id as BetId);
}

/**
 * Reads a bet for whoever opened its link, signed in or not.
 *
 * Anonymous reads are deliberate, and the same judgement `/r/[token]` already makes: somebody
 * being asked to put money on an argument is entitled to read the argument first. What they
 * cannot do without an account is accept.
 */
export async function readBetByShortCode(
  code: string,
  privyDid: string | null = null,
  atSeconds: number = currentSeconds(),
): Promise<Result<BetByLink, RepoError>> {
  // Shape-checked before it reaches SQL, so a referee token pasted into `/b/` never gets as
  // far as a lookup: the two capabilities have exclusive lengths.
  if (!isShortCode(code)) return err(notFound('bet'));

  return withShortCode(code, privyDid, async (sql) => {
    const betId = await codeBetId(sql);
    if (!betId) return err(notFound('bet'));

    const bet = await loadBet(sql, betId);
    if (!bet) return err(notFound('bet'));

    if (!privyDid) return ok({ bet, status: 'anonymous', role: 'observer' });

    const user = await requireCurrentUser(sql, privyDid);
    // Signed in as somebody with no row yet — a stranger reading the terms rather than a
    // failed page. Their row appears on their first real action, which is this one.
    if (!user.ok) return ok({ bet, status: 'anonymous', role: 'observer' });

    const role = resolveViewerRole(bet, { userId: user.value.id, wallet: user.value.wallet });
    if (role === 'opponent') return ok({ bet, status: 'yours', role });
    if (role !== 'observer') return ok({ bet, status: 'party', role });

    // Order matters below. `closed` is asked before `taken` because a settled bet is not
    // usefully described by who took it, and `expired` before `open` because a chip that
    // cannot be pressed is a chip that lies.
    if (bet.state !== 'open') {
      return ok({ bet, status: bet.state === 'active' ? 'taken' : 'closed', role });
    }
    if (atSeconds >= bet.acceptDeadlineSeconds) return ok({ bet, status: 'expired', role });
    return ok({ bet, status: 'open', role });
  });
}

/**
 * Takes the other side.
 *
 * Idempotent for whoever already holds the seat, for the same reason `confirmReferee` is: a
 * link gets opened twice. It is emphatically not idempotent for anybody else — the seat
 * belongs to whoever accepted, and `0006`'s trigger makes that permanent at the row level.
 *
 * The signature is required rather than optional. The creator signed to commit, and a card
 * with one scrawl on it is a card that says only one person meant it.
 */
export async function acceptBet(
  privyDid: string,
  code: string,
  signature: Signature,
  atSeconds: number = currentSeconds(),
): Promise<Result<Bet, RepoError>> {
  if (!isShortCode(code)) return err(notFound('bet'));
  if (!isSignatureMeaningful(signature)) {
    return err({ code: 'INVALID', issues: ['a signature is required to take the other side'] });
  }

  return asConflict(
    withShortCode(code, privyDid, async (sql) => {
      const user = await requireCurrentUser(sql, privyDid);
      if (!user.ok) return user;

      const betId = await codeBetId(sql);
      if (!betId) return err(notFound('bet'));

      const bet = await loadBet(sql, betId);
      if (!bet) return err(notFound('bet'));

      // Said here as well as in the policy, because a policy refusal arrives as zero rows
      // written and this person deserves the reason rather than a shrug.
      const role = resolveViewerRole(bet, { userId: user.value.id, wallet: user.value.wallet });
      if (role === 'opponent') return ok(bet);
      if (role !== 'observer') {
        return err(forbidden('somebody already on this bet cannot take the other side'));
      }
      if (bet.state !== 'open') {
        return err({
          code: 'CONFLICT',
          reason: bet.state === 'active' ? 'somebody already took this one' : 'this bet is closed',
        });
      }
      if (atSeconds >= bet.acceptDeadlineSeconds) {
        return err({ code: 'CONFLICT', reason: 'this one was not taken in time' });
      }

      /*
       * The name on the card. A typed signature *is* a name and the person chose it here, so it
       * wins; otherwise the handle the creator typed stands, and only then the profile. What is
       * never done is overwriting a name the creator wrote with something else silently — the
       * same restraint `confirmReferee` shows by not touching `display_name` at all.
       */
      const displayName =
        signature.kind === 'typed'
          ? signature.name
          : (bet.opponent?.displayName ?? user.value.displayName);

      const signed = {
        user_id: user.value.id,
        wallet_address: user.value.wallet,
        display_name: displayName,
        signature: sql.json(signatureToJson(signature)),
        signed_at: toTimestamp(atSeconds),
        confirmed_at: toTimestamp(atSeconds),
      };

      // Two arms, chosen by whether the creator named anybody. Not `on conflict do update`: that
      // would need the INSERT and UPDATE policies to pass together, and for a non-participant
      // neither the old ones do.
      const written = bet.opponent
        ? await sql<RawRow[]>`
            update participants set ${sql(signed)}
            where bet_id = ${betId} and role = 'opponent'
            returning id
          `
        : await sql<RawRow[]>`
            insert into participants ${sql({ bet_id: betId, role: 'opponent', ...signed })}
            returning id
          `;
      if (written.length === 0) return err(forbidden('this bet cannot be taken'));

      // Separate statement, and that is what makes it legal: `bets_update_participant` asks
      // `app_is_participant`, which now sees the row written above. The mirror of the trap
      // `0008` documents, where a RETURNING row was judged inside the statement creating it.
      //
      // It goes through the one writer, so this seat is taken under the same guard as every
      // other move: `from: 'open'` fails if somebody else got here first, and the participant
      // row above goes back with it. The unique key on (bet_id, role) already refused a second
      // opponent; this refuses a second *transition*, which is the part the audit trail sees.
      await applyTransition(sql, {
        betId,
        action: 'accept',
        from: 'open',
        to: 'active',
        actor: { user: user.value, bet, role: 'opponent' },
      });

      const after = await loadBet(sql, betId);
      if (!after) return err(notFound('bet'));

      return ok(after);
    }),
  );
}
