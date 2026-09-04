import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFEREE_TIMEOUT_SECONDS, SECONDS_PER_DAY, allowedActions, unwrap } from '@sporim/domain';
import { fixtureBet, hasDatabase, ownerSql, purge, uniquePrivyDid } from '@/testing/db';
import { closeDb, withRefereeToken, withUser } from './client';
import { createBet, openDispute, recordAction, submitClaim } from './bets.repo';
import { confirmReferee, getRefereeInvite, readRefereeInvite } from './referee.repo';
import { upsertUser, type UserRecord } from './users.repo';

/**
 * The referee capability, against the real database.
 *
 * The question this file answers is the one `0003_participant_insert_scope.sql` left open:
 * how somebody who is **not on a bet** is authorized to act on it. The answer is a secret they
 * hold, checked server-side, and the tests below are mostly about the ways that must not work
 * — a party using it, a second holder using it, the wrong link, no link at all.
 */

const describeDb = hasDatabase ? describe : describe.skip;

const NOW = 1_788_350_400; // 2026-09-02T12:00:00Z, the domain fixtures' clock
const AFTER_DEADLINE = NOW + 6 * SECONDS_PER_DAY;

describeDb('referee invitations', () => {
  // Opened in `beforeAll`, not here: vitest still evaluates the body of a skipped suite, and
  // a connection built at that point would fail the file on a machine with no DATABASE_URL.
  let owner: ReturnType<typeof ownerSql>;
  const didAlice = uniquePrivyDid('ref-creator');
  const didSasha = uniquePrivyDid('ref-opponent');
  const didAnya = uniquePrivyDid('ref-referee');
  const didStranger = uniquePrivyDid('ref-nobody');

  let alice: UserRecord;
  let sasha: UserRecord;
  let anya: UserRecord;
  let stranger: UserRecord;
  const createdBetIds: string[] = [];

  /** A live bet with a referee named and, so far, nobody having asked them anything. */
  async function betWithNamedReferee(): Promise<{ betId: string; token: string }> {
    const bet = unwrap(
      await createBet(
        didAlice,
        {
          bet: fixtureBet(
            { creatorId: alice.id, opponentId: sasha.id },
            {
              state: 'active',
              decisionMode: 'referee',
              // Named by handle with no account attached — what the fourth screen produces.
              referee: {
                userId: null,
                wallet: null,
                displayName: 'anya',
                confirmedAtSeconds: null,
              },
            },
          ),
        },
        NOW,
      ),
    );
    createdBetIds.push(bet.id);
    const invite = unwrap(await getRefereeInvite(didAlice, bet.id));
    return { betId: bet.id, token: invite.token };
  }

  beforeAll(async () => {
    owner = ownerSql();
    alice = unwrap(await upsertUser(didAlice, { displayName: 'alice' }));
    sasha = unwrap(await upsertUser(didSasha, { displayName: 'sasha' }));
    anya = unwrap(await upsertUser(didAnya, { displayName: 'anya' }));
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

  it('mints a link only for a bet that named somebody, and only for the creator', async () => {
    const { betId, token } = await betWithNamedReferee();
    expect(token).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32}$/);
    // Not a short code, and never mistakable for one: the lengths are exclusive.
    expect(token).not.toHaveLength(8);

    // The opponent must never hold it. If they did, they could hand it to somebody who would
    // rule for them — which is why it lives in its own table and not on the bet row they read.
    expect(await getRefereeInvite(didSasha, betId as never)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', what: 'invitation' },
    });
    const leaked = await withUser(
      didSasha,
      (sql) => sql`select token from referee_invites where bet_id = ${betId}`,
    );
    expect(leaked).toHaveLength(0);
  });

  it('writes no link for a bet with nobody to send it to', async () => {
    const bet = unwrap(
      await createBet(didAlice, { bet: fixtureBet({ creatorId: alice.id }) }, NOW),
    );
    createdBetIds.push(bet.id);
    expect(await getRefereeInvite(didAlice, bet.id)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', what: 'invitation' },
    });
  });

  it('shows the terms to whoever opens the link, before they sign in', async () => {
    const { token } = await betWithNamedReferee();
    const invite = unwrap(await readRefereeInvite(token));
    expect(invite.status).toBe('anonymous');
    // Somebody asked to arbitrate an argument about money gets to read the argument first.
    expect(invite.bet.terms).toContain('10 km');
    expect(invite.bet.creator.displayName).toBe('dima');
    expect(invite.bet.opponent?.displayName).toBe('sasha');
    expect(invite.bet.referee?.confirmedAtSeconds).toBeNull();
  });

  it('shows nothing at all without the link', async () => {
    const { betId } = await betWithNamedReferee();
    const rows = await withUser(didStranger, (sql) => sql`select id from bets where id = ${betId}`);
    expect(rows).toHaveLength(0);
  });

  it('refuses a token of the wrong shape before it reaches the database', async () => {
    // A short code pasted into `/r/` is the realistic version of this, and it is refused by
    // the type guard rather than by a lookup that could otherwise confirm the bet exists.
    expect(await readRefereeInvite('Ab3kZ9xQ')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', what: 'invitation' },
    });
    expect(await confirmReferee(didAnya, 'Ab3kZ9xQ')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', what: 'invitation' },
    });
  });

  it('refuses a well-formed token nobody issued', async () => {
    expect(await readRefereeInvite('z'.repeat(32))).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', what: 'invitation' },
    });
  });

  it('lets the person holding the link take the role, and records when', async () => {
    const { token } = await betWithNamedReferee();
    const bet = unwrap(await confirmReferee(didAnya, token, NOW + 60));
    expect(bet.referee?.confirmedAtSeconds).toBe(NOW + 60);
    expect(bet.referee?.userId).toBe(anya.id);
    // The name on the card stays what the creator typed and both parties agreed to.
    expect(bet.referee?.displayName).toBe('anya');

    // Opening a forwarded link twice is not an error for the person who already took it.
    expect(
      unwrap(await confirmReferee(didAnya, token, NOW + 120)).referee?.confirmedAtSeconds,
    ).toBe(NOW + 60);
    expect(unwrap(await readRefereeInvite(token, didAnya)).status).toBe('yours');
  });

  it('will not let a party to the bet become its judge', async () => {
    const { token, betId } = await betWithNamedReferee();

    // Both crossings, from both directions. The creator holds this link by construction, and
    // the state machine has always refused the referee a side; what is new is that the person
    // with the link cannot simply be whoever wants the outcome.
    expect(await confirmReferee(didAlice, token, NOW + 60)).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', reason: 'somebody on the bet cannot referee it' },
    });
    expect(await confirmReferee(didSasha, token, NOW + 60)).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', reason: 'somebody on the bet cannot referee it' },
    });
    expect(unwrap(await readRefereeInvite(token, didAlice)).status).toBe('party');

    // And the database says it too, so a repository written later without the check still
    // fails. This is the assertion that found the gap: `participants_update_on_my_bets` lets
    // the creator write any row on their own bet, so the policies alone let this through —
    // `confirmed_at` is guarded by 0005's trigger instead, because it is one column on a row
    // that is otherwise legitimately theirs.
    await expect(
      withUser(
        didAlice,
        (sql) => sql`
          update participants set user_id = ${alice.id}, confirmed_at = now()
          where role = 'referee' and bet_id = ${betId}
        `,
      ),
    ).rejects.toThrow(/only the holder of the invitation/i);
  });

  it('gives the seat to whoever confirmed and to nobody after them', async () => {
    const { token } = await betWithNamedReferee();
    unwrap(await confirmReferee(didAnya, token, NOW + 60));

    // A capability is not exclusive — the link can be forwarded — but the seat is.
    expect(await confirmReferee(didStranger, token, NOW + 120)).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', reason: 'somebody else has already taken this role' },
    });
    expect(unwrap(await readRefereeInvite(token, didStranger)).status).toBe('taken');
  });

  it('will not let a confirmation be withdrawn, even by the referee', async () => {
    // The other side stakes money on "Anya has taken the role" being on the card. If the seat
    // could be vacated, a dispute could be flipped from "the claim stands" to "both refunded"
    // after the fact — for free, by two people agreeing out of band.
    const { token, betId } = await betWithNamedReferee();
    unwrap(await confirmReferee(didAnya, token, NOW + 60));

    await expect(
      withRefereeToken(
        token,
        didAnya,
        (sql) => sql`
          update participants set confirmed_at = null
          where role = 'referee' and bet_id = ${betId}
        `,
      ),
    ).rejects.toThrow(/cannot be withdrawn/i);
  });

  it('lets a referee who took the role rule, and one who did not, not', async () => {
    // The point of the whole feature, end to end and in that order.
    const named = await betWithNamedReferee();
    await submitClaim(didAlice, named.betId as never, { outcome: 'creator_wins' }, AFTER_DEADLINE);
    await openDispute(didSasha, named.betId as never, {}, AFTER_DEADLINE + 60);

    const before = unwrap(await readRefereeInvite(named.token)).bet;
    expect(allowedActions(before, 'referee', AFTER_DEADLINE + 120)).toEqual([]);
    const deadline = AFTER_DEADLINE + 60 + REFEREE_TIMEOUT_SECONDS;
    expect(allowedActions(before, 'observer', deadline)).toEqual(['refundExpired']);

    const after = unwrap(await confirmReferee(didAnya, named.token, AFTER_DEADLINE + 90));
    expect(allowedActions(after, 'referee', AFTER_DEADLINE + 120)).toEqual(['refereeResolve']);
    // Taking the role buys the *right to rule*, and nothing else: silence past the deadline
    // refunds either way (0009/0010). That is the whole difference the feature makes.
    expect(allowedActions(after, 'observer', deadline)).toEqual(['refundExpired']);

    // And the server agrees with the screen, because both ask the same function.
    const ruled = unwrap(
      await recordAction(
        didAnya,
        named.betId as never,
        'refereeResolve',
        { outcome: 'opponent_wins' },
        AFTER_DEADLINE + 120,
      ),
    );
    expect(ruled.state).toBe('resolved');
  });

  it('refuses to let a confirmed referee take a side', async () => {
    const { token, betId } = await betWithNamedReferee();
    unwrap(await confirmReferee(didAnya, token, NOW + 60));
    // `openActions` never offers `accept` to the referee role, and the gate asks the same
    // question the screen does — so there is no second answer to drift from the first.
    const result = await recordAction(didAnya, betId as never, 'accept', {}, NOW + 120);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    expect(sasha.id).not.toBe(anya.id);
    expect(stranger.id).not.toBe(anya.id);
  });
});
