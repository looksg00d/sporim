import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { privyVerifier, verifyPrivyAccessToken } from './privy-token';

/**
 * Who the request is from — the one place the rest of the server asks.
 *
 * Everything below this line already worked against a verified Privy DID before there was
 * one: `withUser` binds it to `app.user_id`, every policy in `0002_rls.sql` compares against
 * it, and every repository function takes it as its first argument. This function is the
 * piece that was missing, and nothing that calls it changed when it landed.
 *
 * ## Where the token comes from
 *
 * The `privy-token` cookie, which the Privy client SDK writes on this origin. It is a
 * transport, not a claim: whatever is in it is verified against Privy's published keys
 * before a single character of it is believed (`privy-token.ts`). A cookie that is missing,
 * stale, truncated or hand-written all produce the same answer as no cookie at all.
 *
 * It is the *only* transport. There is no header, query parameter or request body anywhere
 * that can name a user — not because one would be hard to verify, but because a second way
 * in is a second thing to get right, and the failure mode of getting it wrong is somebody
 * else's bets. A server action is a public endpoint whatever page rendered it; the identity
 * it runs under comes from here and from nowhere the caller controls.
 *
 * ## `null` is a real answer
 *
 * An anonymous visitor is a case the product handles for good: the wizard fills in without an
 * account, and a person asked to referee an argument may read the terms before handing over
 * an identity. So `null` means "nobody is signed in", it is returned on every verification
 * failure, and there is no development shortcut — a DID read out of an environment variable
 * would be an unauthenticated login, indistinguishable from the real thing on the day
 * somebody deployed it.
 */

/** Written by `@privy-io/react-auth` on this origin. Named once, here. */
export const PRIVY_TOKEN_COOKIE = 'privy-token';

export async function currentPrivyDid(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(PRIVY_TOKEN_COOKIE)?.value;
  if (!token) return null;

  // Checked only now, with a token in hand. A deployment with no Privy configuration still
  // serves every anonymous screen; the moment somebody actually presents a credential it has
  // to be checkable, and failing loudly here beats deciding "not signed in" by accident.
  if (!env.privyAppId) {
    throw new Error(
      'A Privy access token was presented but NEXT_PUBLIC_PRIVY_APP_ID is not configured',
    );
  }

  return verifyPrivyAccessToken(token, privyVerifier());
}
