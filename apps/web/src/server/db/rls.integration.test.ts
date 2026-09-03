import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unwrap, type Bet } from '@sporim/domain';
import { fixtureBet, hasDatabase, ownerSql, purge, uniquePrivyDid } from '@/testing/db';
import { closeDb, withPublic, withUser } from './client';
import { createBet, getBet } from './bets.repo';
import { upsertUser, type UserRecord } from './users.repo';

/**
 * Row-level security, against the real database.
 *
 * These tests are not about the repositories — they issue raw SQL on purpose. The question
 * being asked is what a **buggy** repository would see: if a query goes out without the
 * authorization check the application layer is supposed to make, what comes back?
 *
 * The answer has to be "nothing", not "everything". That is the whole reason the policies
 * exist, and it is the one property that cannot be verified by reading the code.
 */

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('row-level security', () => {
  // Opened in `beforeAll`, not here: vitest still evaluates the body of a skipped suite, and
  // a connection built at that point would fail the file on a machine with no DATABASE_URL.
  let owner: ReturnType<typeof ownerSql>;
  const didAlice = uniquePrivyDid('alice');
  const didSasha = uniquePrivyDid('sasha');
  const didStranger = uniquePrivyDid('stranger');
  const waitlistEmail = `rls-${Date.now()}@example.test`;

  let alice: UserRecord;
  let sasha: UserRecord;
  let stranger: UserRecord;
  // Undefined until `beforeAll` gets there; teardown has to cope, or a failed setup leaves
  // rows behind and every later run is fighting them.
  let bet: Bet | undefined;

  beforeAll(async () => {
    owner = ownerSql();
    alice = unwrap(await upsertUser(didAlice, { displayName: 'alice' }));
    sasha = unwrap(await upsertUser(didSasha, { displayName: 'sasha' }));
    stranger = unwrap(await upsertUser(didStranger, { displayName: 'stranger' }));

    bet = unwrap(
      await createBet(didAlice, {
        bet: fixtureBet({ creatorId: alice.id, opponentId: sasha.id }),
      }),
    );
  });

  afterAll(async () => {
    await purge(owner, {
      betIds: bet ? [bet.id] : [],
      privyDids: [didAlice, didSasha, didStranger],
    });
    await owner`delete from waitlist where email = ${waitlistEmail}`;
    await owner.end();
    await closeDb();
  });

  /** Narrowing helper: every test below runs only if `beforeAll` produced a bet. */
  function theBet(): Bet {
    if (!bet) throw new Error('fixture bet was not created');
    return bet;
  }

  it('runs application statements as an unprivileged role, not as the connecting one', async () => {
    const rows = await withUser(
      didAlice,
      (sql) => sql<{ role: string; bypass: boolean }[]>`
      select current_user as role, rolbypassrls as bypass
      from pg_roles where rolname = current_user
    `,
    );
    expect(rows[0]?.role).toBe('sporim_app');
    // The reason the first attempt at this design silently failed: the connecting role has
    // BYPASSRLS, so policies never applied to it and every probe looked like it worked.
    expect(rows[0]?.bypass).toBe(false);
  });

  it('shows a participant their own bet', async () => {
    const rows = await withUser(didAlice, (sql) => sql`select id from bets`);
    expect(rows.map((row) => row.id)).toEqual([theBet().id]);
  });

  it('shows the other side the same bet', async () => {
    const rows = await withUser(didSasha, (sql) => sql`select id from bets`);
    expect(rows.map((row) => row.id)).toEqual([theBet().id]);
  });

  it('shows a stranger nothing, even when they name the id', async () => {
    const rows = await withUser(
      didStranger,
      (sql) => sql`select id from bets where id = ${theBet().id}`,
    );
    expect(rows).toHaveLength(0);
  });

  it('hides other people from the users table', async () => {
    const rows = await withUser(didAlice, (sql) => sql`select privy_did from users`);
    expect(rows.map((row) => row.privy_did)).toEqual([didAlice]);
  });

  it('returns zero rows with no user context at all — it fails closed', async () => {
    // `current_setting('app.user_id', true)` is NULL when unset, every comparison against it
    // is NULL, and a policy that is not true does not pass a row. A forgotten `SET LOCAL`
    // therefore closes the data rather than opening it.
    const counts = await withPublic(async (sql) => ({
      bets: await sql`select id from bets`,
      users: await sql`select id from users`,
      participants: await sql`select id from participants`,
      events: await sql`select id from bet_events`,
    }));
    expect(counts.bets).toHaveLength(0);
    expect(counts.users).toHaveLength(0);
    expect(counts.participants).toHaveLength(0);
    expect(counts.events).toHaveLength(0);
  });

  it('leaves no identity behind on a pooled connection', async () => {
    await withUser(didAlice, (sql) => sql`select 1`);
    // SET LOCAL is scoped to the transaction; if it were not, the next anonymous request on
    // the same connection would inherit Alice's identity.
    //
    // Worth knowing: once a custom GUC has been set in a session, reverting it leaves the
    // **empty string**, not "unset". `current_setting(…, true)` therefore returns `''` here
    // rather than NULL — which is precisely why `app_user_did()` wraps it in `nullif(…, '')`
    // instead of trusting the raw value. Both spellings fail closed; only one of them is
    // obvious, so the helper does the un-obvious part once.
    const rows = await withPublic(
      (sql) => sql<{ raw: string | null; did: string | null }[]>`
        select current_setting('app.user_id', true) as raw, app_user_did() as did
      `,
    );
    expect(rows[0]?.raw ?? '').toBe('');
    expect(rows[0]?.did).toBeNull();
  });

  it('lets a participant read the audit trail and nobody else', async () => {
    const mine = await withUser(didAlice, (sql) => sql`select action from bet_events`);
    expect(mine.map((row) => row.action)).toContain('share');

    const theirs = await withUser(didStranger, (sql) => sql`select action from bet_events`);
    expect(theirs).toHaveLength(0);
  });

  it('refuses to let the application delete anything', async () => {
    await expect(
      withUser(didAlice, (sql) => sql`delete from bets where id = ${theBet().id}`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses to let the application rewrite the audit trail', async () => {
    await expect(
      withUser(
        didAlice,
        (sql) => sql`update bet_events set action = 'cancel' where bet_id = ${theBet().id}`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('takes a waitlist signup from nobody and refuses to read the list back', async () => {
    await withPublic((sql) => sql`insert into waitlist (email) values (${waitlistEmail})`);
    const [stored] = await owner`select email from waitlist where email = ${waitlistEmail}`;
    expect(stored?.email).toBe(waitlistEmail);

    // Not "returns nothing" — there is no SELECT privilege at all, so the read is refused
    // before a policy is even consulted. Two independent mechanisms, one answer.
    await expect(withPublic((sql) => sql`select email from waitlist`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('will not let a stranger add themselves to somebody else’s bet', async () => {
    // Knowing the id is not the same as being invited. Before 0003 the self-insert arm of
    // `participants_insert_on_my_bets` let anyone holding a bet id take a vacant role and
    // read their way in; the arm is now the creator's alone.
    await expect(
      withUser(
        didStranger,
        (sql) => sql`
          insert into participants (bet_id, role, user_id)
          values (${theBet().id}, 'referee', ${stranger.id})
        `,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('agrees with the repository, which refuses the same stranger', async () => {
    expect(stranger.id).not.toBe(alice.id);
    const result = await getBet(didStranger, theBet().id);
    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', what: 'bet' } });
  });

  /**
   * A referee only decides a bet if they confirmed the role, so writing `confirmed_at` is the
   * whole game. `0005` froze it against UPDATE — but the trigger fired only on UPDATE, and the
   * INSERT policy ends in `OR app_is_participant(bet_id)`, so the creator could simply insert
   * the referee row already confirmed. A referee confirmed that way was never asked, and their
   * silence then upholds the creator's own claim instead of refunding.
   *
   * Closed in `0006` by putting the same guard on both doors. This test is here because the
   * hole survived one round of "fixed" already.
   */
  it('refuses a referee row that arrives already confirmed', async () => {
    expect(bet).toBeDefined();
    await expect(
      withUser(didAlice, async (tx) => {
        await tx`insert into participants (bet_id, role, user_id, display_name, confirmed_at)
                 values (${bet!.id}, 'referee', ${alice.id}, 'accomplice', now())`;
      }),
    ).rejects.toThrow(/only the holder of the invitation/i);
  });

  it('still lets the creator name an unconfirmed referee', async () => {
    expect(bet).toBeDefined();
    await withUser(didAlice, async (tx) => {
      await tx`insert into participants (bet_id, role, display_name)
               values (${bet!.id}, 'referee', 'Kolya')`;
    });
    const [row] = await owner`
      select confirmed_at from participants where bet_id = ${bet!.id} and role = 'referee'`;
    expect(row?.confirmed_at).toBeNull();
    await owner`delete from participants where bet_id = ${bet!.id} and role = 'referee'`;
  });
});
