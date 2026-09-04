import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { authEnv } from '@/lib/env';

/**
 * The only place identity is established.
 *
 * A Privy access token is a JWT signed with ES256 by a key Privy publishes. Verifying it is
 * the whole of authentication here: everything downstream — `withUser`, every RLS policy,
 * every repository's first argument — takes the `sub` this function returns and treats it as
 * the truth about who is calling.
 *
 * ## What is checked, and why each check is not optional
 *
 *   * **Signature**, against the app's published JWKS. Without it the token is a text file
 *     anybody can write.
 *   * **`alg` pinned to ES256.** Given only as an allow-list, so a token whose header says
 *     `none` — or `HS256` with the public key as the shared secret, the classic confusion
 *     attack — never reaches a key at all.
 *   * **`iss` = `privy.io`.** A token from some other issuer that happens to verify against a
 *     key we fetched is not ours.
 *   * **`aud` = our app id.** This is the one people skip. Privy signs every app's tokens,
 *     and a token minted for a different Privy application is genuinely valid — it just is
 *     not valid *here*. Without the audience check, anybody who can create a Privy app could
 *     mint themselves a session on this one.
 *   * **`exp`/`nbf`**, enforced by `jose` with no clock tolerance offered. An expired session
 *     is not a session.
 *
 * ## What is deliberately not consulted
 *
 * Nothing the caller asserts. There is no header, field or parameter anywhere in this app
 * that names a user; the DID exists only as the output of the verification below. That is
 * why `session.ts` has never had a development shortcut, and why adding one later would be a
 * change to this file rather than a configuration flag somewhere.
 */

/** Privy signs every application's access tokens as itself. */
export const PRIVY_ISSUER = 'privy.io';

/** Privy DIDs look like `did:privy:clx…`; the column is 200 characters (0001_init.sql). */
const MAX_DID_LENGTH = 200;

export function isPrivyDid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('did:privy:') &&
    value.length > 'did:privy:'.length &&
    value.length <= MAX_DID_LENGTH
  );
}

export interface PrivyVerifier {
  /** How a signing key is found for a token. Remote and cached in production, local in tests. */
  readonly keys: JWTVerifyGetKey;
  readonly audience: string;
}

/**
 * One key set for the process.
 *
 * `createRemoteJWKSet` caches what it fetches and only goes back to the network when a token
 * arrives with a `kid` it has not seen — which is exactly what a key rotation looks like, and
 * why the URL is fetched lazily rather than pinned to a single key at boot. Building it once
 * matters: a new one per request would mean a JWKS fetch per request, and an outage at Privy
 * would take sign-in down with it instead of being served from cache.
 */
let cached: PrivyVerifier | null = null;

export function privyVerifier(): PrivyVerifier {
  if (cached) return cached;
  const { privyAppId, privyJwksUrl } = authEnv();
  cached = { keys: createRemoteJWKSet(new URL(privyJwksUrl)), audience: privyAppId };
  return cached;
}

/**
 * Verifies a token and returns the Privy DID it belongs to, or `null`.
 *
 * `null` for every failure — forged, expired, wrong issuer, wrong audience, wrong algorithm,
 * unparseable, key not found. The caller's job is to refuse, and telling it *why* a token
 * failed would only ever end up on a screen, where it is a hint to whoever is probing.
 *
 * The verifier is a parameter so this stays a pure function of (token, keys): the tests drive
 * it with a locally generated key pair and never touch the network.
 */
export async function verifyPrivyAccessToken(
  token: string,
  verifier: PrivyVerifier,
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, verifier.keys, {
      issuer: PRIVY_ISSUER,
      audience: verifier.audience,
      algorithms: ['ES256'],
    });
    // A token can be perfectly valid and still carry a subject this system cannot store.
    // Checked rather than trusted, because `sub` reaches a database column and an RLS
    // session variable.
    return isPrivyDid(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}
