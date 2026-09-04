import { z } from 'zod';
import {
  err,
  isUserId,
  isWalletAddress,
  ok,
  type Result,
  type UserId,
  type WalletAddress,
} from '@sporim/domain';
import { withUser, type DbTransaction } from './client';
import { notFound, type RepoError } from './errors';

/**
 * Users, keyed by the Privy DID.
 *
 * Every function here takes the DID from the **verified session** and nothing else — there is
 * no `findUserById(id)` and no way to name somebody other than yourself, because no screen
 * needs one. What a counterparty may see about you is the name and wallet you attached to a
 * bet you shared with them, and that lives on `participants`.
 *
 * The row-level policies say the same thing a second time (`users_select_self`), so a
 * function added later that forgets the rule returns nothing rather than everything.
 */

type RawRow = Record<string, unknown>;

const userIdColumn = z
  .string()
  .refine(isUserId, 'not a valid user id')
  .transform((value) => value as UserId);

const userRowSchema = z.object({
  id: userIdColumn,
  privy_did: z.string(),
  wallet_address: z
    .string()
    .refine(isWalletAddress, 'not a valid wallet address')
    .transform((value) => value as WalletAddress)
    .nullable(),
  handle: z.string().nullable(),
  display_name: z.string().nullable(),
  email: z.string().nullable(),
});

export interface UserRecord {
  readonly id: UserId;
  readonly privyDid: string;
  readonly wallet: WalletAddress | null;
  readonly handle: string | null;
  readonly displayName: string | null;
  readonly email: string | null;
}

function toUser(row: unknown): UserRecord {
  const parsed = userRowSchema.parse(row);
  return {
    id: parsed.id,
    privyDid: parsed.privy_did,
    wallet: parsed.wallet_address,
    handle: parsed.handle,
    displayName: parsed.display_name,
    email: parsed.email,
  };
}

/** The profile fields a person may set. The DID is not among them: it identifies, it is not data. */
export const userProfileSchema = z.object({
  wallet: z.string().refine(isWalletAddress, 'not a valid wallet address').nullish(),
  handle: z.string().trim().min(2).max(64).nullish(),
  displayName: z.string().trim().max(80).nullish(),
  email: z.string().trim().toLowerCase().email().max(254).nullish(),
});
export type UserProfileInput = z.input<typeof userProfileSchema>;

/** Reads the caller's own row inside a transaction that is already authorized. */
export async function requireCurrentUser(
  sql: DbTransaction,
  privyDid: string,
): Promise<Result<UserRecord, RepoError>> {
  const rows = await sql<RawRow[]>`
    select id, privy_did, wallet_address, handle, display_name, email
    from users
    where privy_did = ${privyDid}
  `;
  const row = rows[0];
  if (!row) return err(notFound('user'));
  return ok(toUser(row));
}

export async function findUser(privyDid: string): Promise<Result<UserRecord, RepoError>> {
  return withUser(privyDid, (sql) => requireCurrentUser(sql, privyDid));
}

/**
 * The row that has to exist before anything else can happen, created on the first request
 * that arrives with a verified session.
 *
 * Read first, write only if there is nothing there: a bet is created once and read many
 * times, so the common path is a select and the insert happens once in a user's life.
 *
 * **Nothing but the DID is stored, and that is the point.** A wallet address and an email
 * would both be nice to have here, and both would have to come from the browser, and neither
 * is a thing the browser is entitled to assert. `resolveViewerRole` matches a participant by
 * wallet as well as by user id — so a client that could name its own wallet address could
 * name somebody else's and be resolved into their seat on a bet. The authoritative source is
 * Privy's own API, read server-side with the app secret, and that is where the wallet will
 * come from when the chain layer needs one. Until something actually reads these fields,
 * having them empty is better than having them wrong.
 */
export async function ensureUser(privyDid: string): Promise<Result<UserRecord, RepoError>> {
  const existing = await findUser(privyDid);
  if (existing.ok || existing.error.code !== 'NOT_FOUND') return existing;
  return upsertUser(privyDid);
}

/**
 * Creates the row on first login and updates it afterwards. Authorized twice over: the DID
 * written is the session's own, and `users_insert_self` / `users_update_self` reject any
 * other. `coalesce` on update, so sending a partial profile does not blank what is there.
 */
export async function upsertUser(
  privyDid: string,
  input: UserProfileInput = {},
): Promise<Result<UserRecord, RepoError>> {
  const parsed = userProfileSchema.safeParse(input);
  if (!parsed.success) {
    return err({ code: 'INVALID', issues: parsed.error.issues.map((issue) => issue.message) });
  }
  const profile = parsed.data;

  return withUser(privyDid, async (sql) => {
    const rows = await sql<RawRow[]>`
      insert into users (privy_did, wallet_address, handle, display_name, email)
      values (
        ${privyDid},
        ${profile.wallet ?? null},
        ${profile.handle ?? null},
        ${profile.displayName ?? null},
        ${profile.email ?? null}
      )
      on conflict (privy_did) do update set
        wallet_address = coalesce(excluded.wallet_address, users.wallet_address),
        handle         = coalesce(excluded.handle, users.handle),
        display_name   = coalesce(excluded.display_name, users.display_name),
        email          = coalesce(excluded.email, users.email)
      returning id, privy_did, wallet_address, handle, display_name, email
    `;
    const row = rows[0];
    if (!row) return err({ code: 'CONFLICT', reason: 'user upsert returned no row' });
    return ok(toUser(row));
  });
}
