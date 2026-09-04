import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCEPT_WINDOW_SECONDS,
  CLAIM_WINDOW_SECONDS,
  SECONDS_PER_DAY,
  drawnSignature,
  unwrap,
  usdc,
  type Bet,
} from '@sporim/domain';
import { fixtureBet, hasDatabase, ownerSql, purge, uniquePrivyDid } from '@/testing/db';
import { closeDb } from './client';
import {
  createBet,
  getBet,
  listBetsForUser,
  openDispute,
  recordAction,
  submitClaim,
} from './bets.repo';
import { confirmReferee, getRefereeInvite } from './referee.repo';
import { upsertUser, type UserRecord } from './users.repo';

/**
 * The repository layer, against the real database.
 *
 * Authorization is asserted here rather than only in `rls.integration.test.ts` because the
 * two answer different questions. The policies say what a *connection* may see; these tests
 * say what a *caller* is allowed to do, which is the state machine's answer and has to be
 * the same one the UI renders from.
 */

const describeDb = hasDatabase ? describe : describe.skip;

const NOW = 1_788_350_400; // 2026-09-02T12:00:00Z, the domain fixtures' clock
const AFTER_DEADLINE = NOW + 6 * SECONDS_PER_DAY;

describeDb('bets repository', () => {
  // Opened in `beforeAll`, not here: vitest still evaluates the body of a skipped suite, and
  // a connection built at that point would fail the file on a machine with no DATABASE_URL.
  let owner: ReturnType<typeof ownerSql>;
  const didAlice = uniquePrivyDid('creator');
  const didSasha = uniquePrivyDid('opponent');
  const didAnya = uniquePrivyDid('referee');
  const didStranger = uniquePrivyDid('nobody');

  let alice: UserRecord;
  let sasha: UserRecord;
  let anya: UserRecord;
  const createdBetIds: string[] = [];

  /**
   * A live bet whose referee has actually taken the role.
   *
   * The confirmation goes through the real flow rather than being written into the fixture,
   * because `createBet` refuses to accept one: consent is the referee's to give. Which also
   * means the only thing standing between "Anya was named" and "Anya can rule" is this call,
   * and the tests below that expect a ruling would fail without it.
   */
  async function makeActiveBet(overrides: Partial<Bet> = {}): Promise<Bet> {
    const created = unwrap(
      await createBet(
        didAlice,
        {
          bet: fixtureBet(
            { creatorId: alice.id, opponentId: sasha.id, refereeId: anya.id },
            { state: 'active', decisionMode: 'referee', ...overrides },
          ),
        },
        NOW,
      ),
    );
    createdBetIds.push(created.id);
    const invite = unwrap(await getRefereeInvite(didAlice, created.id));
    return unwrap(await confirmReferee(didAnya, invite.token, NOW));
  }

  beforeAll(async () => {
    owner = ownerSql();
    alice = unwrap(await upsertUser(didAlice, { displayName: 'alice' }));
    sasha = unwrap(await upsertUser(didSasha, { displayName: 'sasha' }));
    anya = unwrap(await upsertUser(didAnya, { displayName: 'anya' }));
    await upsertUser(didStranger, { displayName: 'nobody' });
  });

  afterAll(async () => {
    await purge(owner, {
      betIds: createdBetIds,
      privyDids: [didAlice, didSasha, didAnya, didStranger],
    });
    await owner.end();
    await closeDb();
  });

  it('writes a bet and reads back exactly what went in', async () => {
    const bet = unwrap(
      await createBet(
        didAlice,
        {
          bet: fixtureBet({ creatorId: alice.id, opponentId: sasha.id }),
          signature: drawnSignature([[10, 20, 30, 40]], 240),
        },
        NOW,
      ),
    );
    createdBetIds.push(bet.id);

    const stored = unwrap(await getBet(didAlice, bet.id));
    expect(stored).toEqual(bet);
    expect(stored.stakeCreator).toBe(usdc(20));
    expect(stored.acceptDeadlineSeconds).toBe(NOW + ACCEPT_WINDOW_SECONDS);
  });

  it('stores the signature as stroke points on the participant row, not as an image', async () => {
    const bet = unwrap(
      await createBet(
        didAlice,
        {
          bet: fixtureBet({ creatorId: alice.id }),
          signature: drawnSignature([[1, 2, 3.5, 4]], 200),
        },
        NOW,
      ),
    );
    createdBetIds.push(bet.id);

    const [row] = await owner`
      select signature from participants where bet_id = ${bet.id} and role = 'creator'
    `;
    expect(row?.signature).toEqual({ kind: 'drawn', strokes: [[1, 2, 3.5, 4]], height: 200 });
  });

  it('refuses to let the creator declare their own referee confirmed', async () => {
    // The one thing that would make the whole split meaningless: if the creator could set
    // `confirmedAtSeconds` themselves, a silent referee of their own choosing would uphold
    // their claim, which is the exact abuse `disputedActions` splits on.
    const created = unwrap(
      await createBet(
        didAlice,
        {
          bet: fixtureBet(
            { creatorId: alice.id, opponentId: sasha.id, refereeId: anya.id },
            {
              state: 'active',
              decisionMode: 'referee',
              referee: {
                userId: anya.id,
                wallet: null,
                displayName: 'anya',
                confirmedAtSeconds: NOW,
              },
            },
          ),
        },
        NOW,
      ),
    );
    createdBetIds.push(created.id);
    expect(created.referee?.confirmedAtSeconds).toBeNull();
    expect(unwrap(await getBet(didAlice, created.id)).referee?.confirmedAtSeconds).toBeNull();
  });

  it('refuses to create a bet in somebody else’s name', async () => {
    const result = await createBet(didSasha, { bet: fixtureBet({ creatorId: alice.id }) }, NOW);
    expect(result).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', reason: 'a bet can only be created in your own name' },
    });
  });

  it('refuses a caller who is not a participant', async () => {
    const bet = await makeActiveBet();

    // The stranger cannot see it...
    expect(await getBet(didStranger, bet.id)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', what: 'bet' },
    });

    // ...and cannot act on it either, with the same answer, so a guessed id tells them
    // nothing about whether the bet exists.
    const acted = await recordAction(didStranger, bet.id, 'cancel', {}, NOW);
    expect(acted).toEqual({ ok: false, error: { code: 'NOT_FOUND', what: 'bet' } });
    expect(unwrap(await listBetsForUser(didStranger))).toHaveLength(0);
  });

  it('refuses a participant the state machine does not allow to act right now', async () => {
    const bet = await makeActiveBet();
    // Anya is genuinely on this bet — and a referee still cannot claim a win.
    const result = await recordAction(didAnya, bet.id, 'submitClaim', {}, AFTER_DEADLINE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('records a claim, a dispute and the audit trail behind them', async () => {
    const bet = await makeActiveBet();

    const claimed = unwrap(
      await submitClaim(didAlice, bet.id, { outcome: 'creator_wins' }, AFTER_DEADLINE),
    );
    expect(claimed.state).toBe('claimed');
    expect(claimed.claim).toEqual({
      outcome: 'creator_wins',
      by: 'creator',
      atSeconds: AFTER_DEADLINE,
      windowEndsAtSeconds: AFTER_DEADLINE + CLAIM_WINDOW_SECONDS,
    });

    const disputed = unwrap(
      await openDispute(didSasha, bet.id, { reason: 'he did not' }, AFTER_DEADLINE + 60),
    );
    expect(disputed.state).toBe('disputed');
    // Disagreeing moves no money; all a dispute records is who objected and by when the
    // referee has to answer.
    expect(disputed.dispute?.by).toBe('opponent');

    const events = await owner`
      select action, from_state, to_state from bet_events where bet_id = ${bet.id} order by id
    `;
    expect(events.map((row) => row.action)).toEqual(['submitClaim', 'disputeClaim']);
    expect(events.map((row) => row.to_state)).toEqual(['claimed', 'disputed']);
  });

  it('resolves a dispute the referee rules on, and names the action in the audit', async () => {
    const bet = await makeActiveBet();
    await submitClaim(didAlice, bet.id, { outcome: 'creator_wins' }, AFTER_DEADLINE);
    await openDispute(didSasha, bet.id, {}, AFTER_DEADLINE + 60);

    const resolved = unwrap(
      await recordAction(
        didAnya,
        bet.id,
        'refereeResolve',
        { outcome: 'opponent_wins' },
        AFTER_DEADLINE + 120,
      ),
    );
    expect(resolved.state).toBe('resolved');
    expect(resolved.outcome).toBe('opponent_wins');

    const [last] = await owner`
      select action, actor_role from bet_events where bet_id = ${bet.id} order by id desc limit 1
    `;
    expect(last?.action).toBe('refereeResolve');
    expect(last?.actor_role).toBe('referee');
  });

  it('needs an outcome before it will resolve a bet', async () => {
    const bet = await makeActiveBet();
    await submitClaim(didAlice, bet.id, { outcome: 'creator_wins' }, AFTER_DEADLINE);
    const result = await recordAction(didSasha, bet.id, 'confirmClaim', {}, AFTER_DEADLINE + 60);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID');
  });

  it('lists every bet the caller is on and nothing else', async () => {
    const mine = unwrap(await listBetsForUser(didAlice));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((bet) => bet.creator.userId === alice.id)).toBe(true);

    const theirs = unwrap(await listBetsForUser(didSasha));
    expect(theirs.map((bet) => bet.id).sort()).toEqual(
      mine
        .filter((bet) => bet.opponent?.userId === sasha.id)
        .map((bet) => bet.id)
        .sort(),
    );
  });
});
