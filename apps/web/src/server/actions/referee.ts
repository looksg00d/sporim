'use server';

import { redirect } from 'next/navigation';
import { isRefereeToken } from '@sporim/domain';
import { currentPrivyDid } from '@/server/auth/session';
import { confirmReferee } from '@/server/db/referee.repo';

/**
 * Taking the referee role, from the form on `/r/[token]`.
 *
 * The token comes out of the submitted form rather than out of a closure, because a server
 * action is a public endpoint whatever the page around it looks like — anyone can post to it.
 * That is fine, and it is the point: possession of the token is the authorization, and
 * `confirmReferee` re-checks it against the database on every call. Nothing here is trusted
 * because the page that rendered it was trusted.
 *
 * The identity is taken from the session and never from the request. A `did` field in this
 * form would be a login by assertion.
 *
 * Every outcome — taken, already yours, somebody else's, you are on this bet, the bet is
 * over — is a status `readRefereeInvite` recomputes on the way back, so the action redirects
 * rather than trying to narrate. One place decides what this person is looking at.
 */
export async function takeRefereeRole(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  if (!isRefereeToken(token)) redirect('/');

  const privyDid = await currentPrivyDid();
  // No session, no role: a confirmation has to attach to an account, or there is nobody who
  // agreed. The page says so, and says it before offering the button.
  if (privyDid) await confirmReferee(privyDid, token);

  redirect(`/r/${token}`);
}
