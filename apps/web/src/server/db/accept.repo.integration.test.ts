import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCEPT_WINDOW_SECONDS,
  allowedActions,
  typedSignature,
  unwrap,
  type Bet,
} from '@sporim/domain';
import { fixtureBet, hasDatabase, ownerSql, purge, uniquePrivyDid } from '@/testing/db';
import { acceptBet, readBetByShortCode } from './accept.repo';
import { createBet } from './bets.repo';
import { closeDb, withShortCode, withUser } from './client';
import { confirmReferee, getRefereeInvite } from './referee.repo';
import { upsertUser, type UserRecord } from './users.repo';

/**
 * Taking the other side by link, against the real database.
 *
 * The question is the same one the referee capability answered for a different seat: how
 * somebody who is **not on a bet** is authorized to act on it. Most of what follows is about
 * the ways that must not work — the creator taking their own other side, a referee taking a
 * side, a second person taking a seat already taken, a code that names nothing.
 *
 * The last test in the file is the one that matters most, and it is deliberately not routed
 * through the repository: it writes raw SQL to prove the *database* refuses, so that a future
 * rewrite of this layer cannot quietly become the only thing standing between a stranger and
 * somebody else's bet.
 */

const describeDb = hasDatabase ? describe : describe.skip;

const NOW = 1_788_350_400; // 2026-09-02T12:00:00Z, the domain fixtures' clock
const SIGNATURE = typedSignature('sasha');

describeDb('accepting by link', () => {
  // Opened in `beforeAll`, not here: vitest still evaluates the body of a skipped suite, and
  // a connection built at that point would fail the file on a machine with no DATABASE_URL.
  let owner: ReturnType<typeof ownerSql>;
  const didAlice = uniquePrivyDid('acc-creator');
  const didSasha = uniquePrivyDid('acc-taker');
  const didAnya = uniquePrivyDid('acc-referee');
  const didStranger = uniquePrivyDid('acc-nobody');

  let alice: UserRecord;
  let sasha: UserRecord;
  let stranger: UserRecord;
  const createdBetIds: string[] = [];

  /** An open bet with nobody named on the other side — what an unaddressed link looks like. */
  async function openBet(overrides: Partial<Bet> = {}): Promise<Bet> {
    const bet = unwrap(
      await createBet(didAlice, { bet: fixtureBet({ creatorId: alice.id }, overrides) }, NOW),
    );
    createdBetIds.push(bet.id);
    return bet;
  }

  /** The other shape: the creator typed a handle, so an opponent row already exists. */
  async function openBetNaming(handle: string): Promise<Bet> {
    return openBet({
      opponent: { userId: null, wallet: null, displayName: handle },
    });
  }

  beforeAll(async () => {
    owner = ownerSql();
    alice = unwrap(await upsertUser(didAlice, { displayName: 'dima' }));
    sasha = unwrap(await upsertUser(didSasha, { displayName: 'sasha' }));
    unwrap(await upsertUser(didAnya, { displayName: 'anya' }));
    stranger = unwrap(await upsertUser(didStranger, { displayName: 'nobody' }));
  });

  afterAll(async () => {
    await purge(owner, {
      betIds: createdBetIds,
      privyDids: [didAlice, didSasha, didAnya, didStranger],
    });
    await owner.end();
    await closeDb();
  });

  describe('reading', () => {
    it('shows the terms to whoever opens the link, before they sign in', async () => {
      const bet = await openBet();
      const seen = unwrap(await readBetByShortCode(bet.shortCode, null, NOW));

      expect(seen.status).toBe('anonymous');
      expect(seen.role).toBe('observer');
      expect(seen.bet.terms).toContain('10 km');
      expect(seen.bet.creator.displayName).toBe('dima');
    });

    it('shows nothing at all without the code', async () => {
      const bet = await openBet();
      const rows = await withUser(
        didStranger,
        (sql) => sql`select id from bets where id = ${bet.id}`,
      );
      expect(rows).toHaveLength(0);
    });

    it('refuses a referee token pasted into the accept route, before it reaches SQL', async () => {
      // 32 characters is the other capability's length. The two are exclusive on purpose.
      const result = await readBetByShortCode('z'.repeat(32), didSasha, NOW);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('refuses a well-formed code nobody minted', async () => {
      const result = await readBetByShortCode('ZZZZZZZZ', didSasha, NOW);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('tells a stranger they may take it, and the creator that they are on it', async () => {
      const bet = await openBet();
      expect(unwrap(await readBetByShortCode(bet.shortCode, didSasha, NOW)).status).toBe('open');

      const mine = unwrap(await readBetByShortCode(bet.shortCode, didAlice, NOW));
      expect(mine.status).toBe('party');
      expect(mine.role).toBe('creator');
    });

    it('says it expired rather than offering a button that would fail', async () => {
      const bet = await openBet();
      const late = NOW + ACCEPT_WINDOW_SECONDS + 1;
      expect(unwrap(await readBetByShortCode(bet.shortCode, didSasha, late)).status).toBe(
        'expired',
      );
    });
  });

  describe('taking it', () => {
    it('puts the taker on the bet, with their scrawl, and starts it', async () => {
      const bet = await openBet();
      const after = unwrap(await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 60));

      expect(after.state).toBe('active');
      expect(after.opponent?.userId).toBe(sasha.id);

      // The audit records who did it, not just that it happened.
      const events = await owner`
        select action, from_state, to_state, actor_user_id
        from bet_events where bet_id = ${bet.id} order by id
      `;
      expect(events.map((row) => row.action)).toEqual(['share', 'accept']);
      expect(events[1]?.actor_user_id).toBe(sasha.id);

      // The signature is written even though nothing reads it back yet — the OG card will.
      const rows = await owner`
        select signature, signed_at, confirmed_at from participants
        where bet_id = ${bet.id} and role = 'opponent'
      `;
      expect(rows[0]?.signature).toMatchObject({ kind: 'typed', name: 'sasha' });
      expect(rows[0]?.signed_at).not.toBeNull();
      expect(rows[0]?.confirmed_at).not.toBeNull();
    });

    it('fills the seat the creator addressed, rather than adding a second one', async () => {
      const bet = await openBetNaming('sasha');
      const after = unwrap(await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 60));

      expect(after.opponent?.userId).toBe(sasha.id);
      const rows = await owner`
        select count(*)::int as n from participants where bet_id = ${bet.id} and role = 'opponent'
      `;
      expect(rows[0]?.n).toBe(1);
    });

    it('is not an error when the same person opens the link twice', async () => {
      const bet = await openBet();
      unwrap(await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 60));

      const again = unwrap(await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 120));
      expect(again.state).toBe('active');
      expect(unwrap(await readBetByShortCode(bet.shortCode, didSasha, NOW + 120)).status).toBe(
        'yours',
      );
    });

    it('gives the seat to whoever took it and to nobody after them', async () => {
      const bet = await openBet();
      unwrap(await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 60));

      const late = await acceptBet(didStranger, bet.shortCode, SIGNATURE, NOW + 120);
      expect(late.ok).toBe(false);
      if (!late.ok) expect(late.error.code).toBe('CONFLICT');
      expect(unwrap(await readBetByShortCode(bet.shortCode, didStranger, NOW + 120)).status).toBe(
        'taken',
      );
    });

    it('seats exactly one of two people who open the link at the same moment', async () => {
      // Sequentially this is the test above; simultaneously it used to be two INSERTs racing a
      // unique key, and whoever lost got an exception rather than an answer. Both statements —
      // the seat and the transition — now say the same thing when somebody got there first.
      const bet = await openBet();

      const results = await Promise.all([
        acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 60),
        acceptBet(didStranger, bet.shortCode, typedSignature('nobody'), NOW + 60),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const refused = results.find((result) => !result.ok);
      if (refused && !refused.ok) expect(refused.error.code).toBe('CONFLICT');

      const seats = await owner`
        select count(*)::int as n from participants where bet_id = ${bet.id} and role = 'opponent'
      `;
      expect(seats[0]?.n).toBe(1);
      const accepts = await owner`
        select count(*)::int as n from bet_events where bet_id = ${bet.id} and action = 'accept'
      `;
      expect(accepts[0]?.n).toBe(1);
    });

    it('will not let the creator take their own other side', async () => {
      const bet = await openBet();
      const result = await acceptBet(didAlice, bet.shortCode, SIGNATURE, NOW + 60);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    });

    it('will not let the referee take a side', async () => {
      const bet = await openBet({
        decisionMode: 'referee',
        referee: { userId: null, wallet: null, displayName: 'anya', confirmedAtSeconds: null },
      });
      const invite = unwrap(await getRefereeInvite(didAlice, bet.id));
      unwrap(await confirmReferee(didAnya, invite.token, NOW + 30));

      const result = await acceptBet(didAnya, bet.shortCode, SIGNATURE, NOW + 60);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    });

    it('refuses a bet nobody took in time', async () => {
      const bet = await openBet();
      const late = await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + ACCEPT_WINDOW_SECONDS);
      expect(late.ok).toBe(false);
      if (!late.ok) expect(late.error.code).toBe('CONFLICT');
    });

    it('refuses a mark that is not a signature', async () => {
      const bet = await openBet();
      // One character passes no meaningfulness test — the same guard the pad applies on screen.
      const result = await acceptBet(didSasha, bet.shortCode, typedSignature('x'), NOW + 60);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID');
    });

    it('leaves the domain agreeing with what just happened', async () => {
      const bet = await openBet();
      expect(allowedActions(bet, 'observer', NOW + 60)).toContain('accept');

      const after = unwrap(await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 60));
      expect(allowedActions(after, 'observer', NOW + 120)).not.toContain('accept');
    });
  });

  /*
   * The database's own answer, not the repository's.
   *
   * A probe exactly like this is what found the hole `0005` left, and the reasoning has not
   * changed: everything above goes through `acceptBet`, so if that function were rewritten
   * tomorrow by somebody who had forgotten a rule, every test above could stay green while the
   * rule was gone. These write SQL directly, as an attacker with a connection would.
   */
  describe('the database refuses on its own', () => {
    /*
     * A refusal wears two faces here and both are correct, which is why these assert the
     * outcome rather than the mechanism. A policy's WITH CHECK rejects an INSERT by raising;
     * a policy's USING excludes the row from an UPDATE, which then writes nothing and raises
     * nothing at all. Asserting a throw would have called the quiet refusal a failure — and
     * asserting zero rows would have called the loud one a failure. What matters is neither:
     * it is that the seat did not change hands.
     */
    async function refused(attempt: () => Promise<unknown>): Promise<void> {
      try {
        const rows = await attempt();
        expect(Array.isArray(rows) ? rows : []).toHaveLength(0);
      } catch (error) {
        expect(String(error)).toMatch(/row-level security|only the holder of the invitation/i);
      }
    }

    /** Who actually holds a seat, read with the owner connection so no policy can flatter us. */
    async function seatHolder(betId: string, role: 'opponent' | 'referee') {
      const rows = await owner`
        select user_id, confirmed_at from participants
        where bet_id = ${betId} and role = ${role}
      `;
      return rows[0] ?? null;
    }

    it('will not let a stranger seat themselves without the code', async () => {
      const bet = await openBet();
      await refused(() =>
        withUser(
          didStranger,
          (sql) => sql`
            insert into participants (bet_id, role, user_id, confirmed_at)
            values (${bet.id}, 'opponent', ${stranger.id}, now())
            returning id
          `,
        ),
      );
      expect(await seatHolder(bet.id, 'opponent')).toBeNull();
    });

    it('will not let the code holder take a seat that is not the opponent’s', async () => {
      const bet = await openBet({
        decisionMode: 'referee',
        referee: { userId: null, wallet: null, displayName: 'anya', confirmedAtSeconds: null },
      });
      // The capability opens exactly one chair. Holding the link is not holding the bet.
      await refused(() =>
        withShortCode(
          bet.shortCode,
          didSasha,
          (sql) => sql`
            update participants set user_id = ${sasha.id}, confirmed_at = now()
            where bet_id = ${bet.id} and role = 'referee'
            returning id
          `,
        ),
      );
      const referee = await seatHolder(bet.id, 'referee');
      expect(referee?.user_id).toBeNull();
      expect(referee?.confirmed_at).toBeNull();
    });

    it('will not let an acceptance be withdrawn, even by the person who made it', async () => {
      const bet = await openBet();
      unwrap(await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 60));

      await expect(
        withShortCode(
          bet.shortCode,
          didSasha,
          (sql) => sql`
            update participants set confirmed_at = null
            where bet_id = ${bet.id} and role = 'opponent'
          `,
        ),
      ).rejects.toThrow(/cannot be withdrawn/i);
    });

    it('stops opening the bet once it has been taken', async () => {
      const bet = await openBet();
      unwrap(await acceptBet(didSasha, bet.shortCode, SIGNATURE, NOW + 60));

      // `app_may_accept_bet` requires state 'open', so the code buys a stranger nothing now.
      const rows = await withShortCode(
        bet.shortCode,
        didStranger,
        (sql) => sql`select app_may_accept_bet(${bet.id}) as allowed`,
      );
      expect(rows[0]?.allowed).toBe(false);
    });
  });
});
