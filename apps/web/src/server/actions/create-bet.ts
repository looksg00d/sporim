'use server';

import { env } from '@/lib/env';
import { currentPrivyDid } from '@/server/auth/session';
import { createBetFromDraft } from '@/server/bets/create-bet';
import type { CreateBetResult } from '@/features/wallet/port';

/**
 * Creating a bet, from the commit button on the review screen.
 *
 * Thin on purpose. A server action is a public endpoint whatever page rendered it — anybody
 * can post to this — so the two things that matter both happen before the payload is looked
 * at: the identity comes from the verified session, and the draft goes to
 * `createBetFromDraft`, which re-derives every number rather than believing one.
 *
 * There is no `did` in the arguments, and there never will be. Adding one would be a login
 * by assertion, which is exactly the shape this whole layer was built to make impossible.
 */
export async function createBetAction(payload: unknown): Promise<CreateBetResult> {
  const privyDid = await currentPrivyDid();
  // Not an error worth explaining in detail: the screen asks people to sign in before it gets
  // here, so reaching this means a session expired between the click and the call.
  if (!privyDid) return { ok: false, code: 'NOT_SIGNED_IN' };

  const created = await createBetFromDraft(privyDid, payload);
  if (created.ok) {
    return {
      ok: true,
      bet: {
        shortCode: created.value.shortCode,
        // Nothing is invented: mock mode has no transaction, and says so on the next screen.
        txSignature: created.value.createTx,
        simulated: created.value.chain === 'mock',
      },
    };
  }

  // `INVALID` is the domain refusing the draft — a deadline that passed while the person was
  // logging in is the common one, and it is worth its own sentence. Everything else is ours
  // to fix and theirs to retry, so it gets the honest "that did not go through".
  if (created.error.code === 'INVALID') return { ok: false, code: 'DRAFT_INVALID' };

  // The code and nothing else. Repository reasons name rows and roles, and this string ends
  // up in a server log that is read during an incident, not on anybody's screen.
  console.error(
    `create-bet refused: ${created.error.code}`,
    env.appEnv === 'local' ? created.error : '',
  );
  return { ok: false, code: 'UNKNOWN' };
}
