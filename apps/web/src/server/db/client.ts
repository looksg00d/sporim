import postgres from 'postgres';
import { databaseUrl } from '@/lib/env';

/**
 * The one connection to Postgres, and the two ways application code is allowed to use it.
 *
 * Nothing under `server/db` may be imported from a client component; the
 * `sporim/no-db-in-client` ESLint rule fails the build if it is. There is no browser-facing
 * database credential to leak because there is no browser-facing database access at all.
 *
 * ## Money across the boundary
 *
 * postgres.js hands back `bigint` columns as **strings** by default, and a string that
 * wanders into arithmetic becomes a float, and a float that holds USDC eventually pays
 * somebody the wrong amount. So the driver is configured to parse and serialise int8 as a
 * real JS `bigint` in both directions, and `bet-row.ts` re-brands it as the domain's
 * `UsdcAmount`. The row schemas there accept a `bigint` or a digit string and **reject a
 * `number` outright**, so even if this configuration were ever dropped the failure is a
 * parse error at the boundary rather than silent rounding halfway through a payout.
 */

type DbTypes = { readonly bigint: bigint };

export type Db = postgres.Sql<DbTypes>;
/** What repository functions receive: a handle already inside a transaction with a role set. */
export type DbTransaction = postgres.TransactionSql<DbTypes>;

function createClient(): Db {
  return postgres(databaseUrl(), {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    types: { bigint: postgres.BigInt },
    // Xata reports its own housekeeping through NOTICE; none of it is ours to act on.
    onnotice: () => {},
  });
}

/**
 * Next's dev server re-evaluates modules on every edit. Without a global handle each save
 * would open another pool and the connection limit would be reached by lunchtime.
 */
const globalForDb = globalThis as typeof globalThis & { sporimDb?: Db };

export function db(): Db {
  const existing = globalForDb.sporimDb;
  if (existing) return existing;
  const created = createClient();
  globalForDb.sporimDb = created;
  return created;
}

/** Closes the pool. For test teardown and for scripts; the app itself never calls it. */
export async function closeDb(): Promise<void> {
  const existing = globalForDb.sporimDb;
  if (!existing) return;
  delete globalForDb.sporimDb;
  await existing.end();
}

const APP_ROLE = 'sporim_app';

/**
 * Everything a transaction can carry, set in one place.
 *
 * Each wrapper below used to write its own `set_config` list, and the property that makes a
 * pooled connection safe — *every* variable written on *every* entry, including the ones being
 * cleared — was upheld by copies agreeing with each other. Adding the short code as a third
 * capability is what made that untenable: a wrapper that forgot it would not fail, it would
 * silently inherit whatever the previous request on that connection had left behind.
 *
 * So the set is named once and written whole. A fourth capability changes this function and
 * nothing else, and cannot be half-applied.
 *
 * Order matters and is the reason this is not merely tidier. The variables go in **first**,
 * while still on the connecting role, and the role is dropped second — so nothing between the
 * two points can run privileged with an identity attached. All are `LOCAL`: they exist for this
 * transaction and are gone at COMMIT.
 *
 * Values travel as bound parameters, never interpolated. `SET LOCAL ROLE` takes no parameters,
 * so it is the one literal here — and it is a compile-time constant, not user input.
 */
interface SessionContext {
  readonly privyDid?: string | null;
  readonly refereeToken?: string | null;
  readonly shortCode?: string | null;
}

async function inContext<T>(
  context: SessionContext,
  fn: (sql: DbTransaction) => Promise<T>,
): Promise<T> {
  // Boxed, because `begin` unwraps a returned array of promises. A repository that returns a
  // list of bets would otherwise have its result type quietly rewritten by the driver.
  const boxed = await db().begin(async (tx) => {
    await tx`
      select
        set_config('app.user_id', ${context.privyDid ?? ''}, true),
        set_config('app.referee_token', ${context.refereeToken ?? ''}, true),
        set_config('app.short_code', ${context.shortCode ?? ''}, true)
    `;
    await tx.unsafe(`set local role ${APP_ROLE}`);
    return { value: await fn(tx) };
  });
  return boxed.value;
}

/**
 * Runs `fn` in a transaction that has dropped to the unprivileged role and carries the
 * caller's Privy DID, so every policy in `0002_rls.sql` applies to every statement inside.
 *
 * Membership is the whole authorization here: no capability travels with it, and both are
 * cleared on the way in by `inContext`.
 */
export async function withUser<T>(
  privyDid: string,
  fn: (sql: DbTransaction) => Promise<T>,
): Promise<T> {
  if (!privyDid) throw new Error('withUser() needs a Privy DID; use withPublic() for anonymous');
  return inContext({ privyDid }, fn);
}

/**
 * The anonymous context: the same unprivileged role with **no** user set.
 *
 * This is the most restricted thing in the system, not a convenience hatch. Without an
 * identity every participant predicate is false, and reads of bets, users, claims, disputes
 * and the audit trail return zero rows. What is left is what genuinely belongs to nobody:
 * joining the waitlist.
 *
 * Which is the property worth having. A repository that forgets to establish a user does not
 * leak everything — it sees nothing at all.
 *
 * The identity is cleared explicitly rather than assumed absent. `SET LOCAL` does revert at
 * COMMIT, but it reverts to the session value, and once a custom GUC has been touched that
 * value is the empty string rather than "unset" — so `current_setting(…, true)` stops
 * returning NULL on a reused connection. `app_user_did()` maps both to NULL; clearing here
 * means this function does not depend on it having been written that way.
 */
export async function withPublic<T>(fn: (sql: DbTransaction) => Promise<T>): Promise<T> {
  return inContext({}, fn);
}

/**
 * The capability context: a transaction carrying a referee invitation token, and optionally
 * the caller's identity as well.
 *
 * This is the answer to the problem `0003_participant_insert_scope.sql` named and left open —
 * somebody who is not on the bet, and whose authorization is that they hold the link. The
 * token is a **secret**, not a claim about who the caller is, so it travels the same way the
 * Privy DID does: as a bound parameter into a `SET LOCAL` session variable, read back by
 * policies through `app_referee_token()`. Nothing the client asserts about its own role is
 * consulted anywhere.
 *
 * `privyDid` is optional because the two things it unlocks are different. Reading the terms
 * needs only the token — the person being asked to judge is entitled to see the argument
 * before they sign in. Taking the role needs both: `app_may_claim_referee` requires an
 * account, or there would be nobody who agreed.
 *
 * The short code is cleared on the way in, like every variable this transaction does not mean
 * to carry: a referee reading a bet must not also be holding the key to accepting it.
 */
export async function withRefereeToken<T>(
  token: string,
  privyDid: string | null,
  fn: (sql: DbTransaction) => Promise<T>,
): Promise<T> {
  if (!token) throw new Error('withRefereeToken() needs a token; use withPublic() for anonymous');
  return inContext({ privyDid, refereeToken: token }, fn);
}

/**
 * The other capability: a transaction carrying a bet's short code, and optionally the caller's
 * identity as well.
 *
 * The code is what a creator pastes into a chat, so unlike the referee token it is hidden from
 * nobody — it is printed on the card and read out loud. What makes it safe to treat as a key is
 * `0011`'s third condition: it opens a bet only while that bet is still `open`, so guessing one
 * buys exactly what leaking a link buys, which is the thing `TRUST_COPY.linkWarning` already
 * warns the creator about.
 *
 * `privyDid` is optional for the same reason it is on `withRefereeToken`, and the split is the
 * same: reading the terms needs only the code, because somebody deciding whether to take the
 * other side is entitled to read the argument first. Accepting needs both — `app_may_accept_bet`
 * requires an account, or there would be nobody on the other side.
 */
export async function withShortCode<T>(
  shortCode: string,
  privyDid: string | null,
  fn: (sql: DbTransaction) => Promise<T>,
): Promise<T> {
  if (!shortCode) throw new Error('withShortCode() needs a code; use withPublic() for anonymous');
  return inContext({ privyDid, shortCode }, fn);
}
