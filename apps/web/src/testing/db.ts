import postgres from 'postgres';
import { makeBet, makeParty, makeReferee } from '@sporim/domain/testing';
import type { Bet, BetId, ShortCode, UserId, WalletAddress } from '@sporim/domain';

/**
 * Support for the suites that talk to the real database.
 *
 * Two things live here that application code deliberately does not have. The first is an
 * owner-role connection: `client.ts` offers only `withUser` and `withPublic`, both of which
 * drop to `sporim_app`, and neither of them is granted DELETE — so a test cannot tidy up
 * after itself through the app's own door, and it should not be able to.
 *
 * The second is unique fixture identity. The suites share one database with whatever else is
 * on that branch, so every run mints its own DIDs, ids and short codes rather than assuming
 * an empty table.
 */

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const hasDatabase = Boolean(process.env.DATABASE_URL);

/** The owner connection, with the same bigint handling the app uses. Tests must `end()` it. */
export function ownerSql(): postgres.Sql<{ bigint: bigint }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set; guard the suite with `hasDatabase`');
  return postgres(url, { max: 2, types: { bigint: postgres.BigInt }, onnotice: () => {} });
}

function randomBase58(length: number): string {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += BASE58[Math.floor(Math.random() * BASE58.length)];
  }
  return out;
}

export function uniquePrivyDid(label: string): string {
  return `did:privy:test-${label}-${randomBase58(12)}`;
}

export function uniqueShortCode(): ShortCode {
  return randomBase58(8) as ShortCode;
}

export function uniqueWallet(): WalletAddress {
  return `Test${randomBase58(36)}` as WalletAddress;
}

/** A `crypto.randomUUID()` bet id, so parallel runs never collide on a primary key. */
export function uniqueBetId(): BetId {
  return crypto.randomUUID() as BetId;
}

export interface FixtureBetOptions {
  readonly creatorId: UserId;
  readonly opponentId?: UserId;
  readonly refereeId?: UserId;
}

/** The canonical `makeBet` fixture, re-pointed at real user rows and given fresh ids. */
export function fixtureBet(options: FixtureBetOptions, overrides: Partial<Bet> = {}): Bet {
  return makeBet({
    id: uniqueBetId(),
    shortCode: uniqueShortCode(),
    creator: makeParty({ userId: options.creatorId, wallet: uniqueWallet() }),
    opponent: options.opponentId
      ? makeParty({ userId: options.opponentId, wallet: uniqueWallet(), displayName: 'sasha' })
      : null,
    // Unconfirmed, because that is what a creator's fourth screen actually produces: a name
    // and, at most, a guess at who is behind it. `createBet` forces it to null anyway — the
    // only thing that confirms a referee is that person opening their own link.
    referee: options.refereeId
      ? makeReferee({
          userId: options.refereeId,
          wallet: uniqueWallet(),
          displayName: 'anya',
          confirmedAtSeconds: null,
        })
      : null,
    ...overrides,
  });
}

/**
 * Removes everything a suite created, children first. Runs as the owner because the app role
 * has no DELETE privilege anywhere — which is the point of not granting it.
 */
export async function purge(
  sql: postgres.Sql<{ bigint: bigint }>,
  ids: { readonly betIds?: readonly string[]; readonly privyDids?: readonly string[] },
): Promise<void> {
  const betIds = ids.betIds ?? [];
  if (betIds.length > 0) {
    await sql`delete from referee_invites where bet_id in ${sql(betIds)}`;
    await sql`delete from bet_events where bet_id in ${sql(betIds)}`;
    await sql`delete from disputes where bet_id in ${sql(betIds)}`;
    await sql`delete from claims where bet_id in ${sql(betIds)}`;
    await sql`delete from participants where bet_id in ${sql(betIds)}`;
    await sql`delete from bets where id in ${sql(betIds)}`;
  }
  const privyDids = ids.privyDids ?? [];
  if (privyDids.length > 0) {
    await sql`delete from users where privy_did in ${sql(privyDids)}`;
  }
}
