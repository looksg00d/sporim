'use server';

import { redirect } from 'next/navigation';
import { isShortCode, OUTCOMES, type Outcome, type ShortCode } from '@sporim/domain';
import { currentPrivyDid } from '@/server/auth/session';
import { getBetByShortCode, openDispute, recordAction, submitClaim } from '@/server/db/bets.repo';

/**
 * Everything a person can do to a bet from `/b/[code]`.
 *
 * Each of these is a public endpoint. A server action is reachable by anybody who can post to
 * this origin, whatever the page around it looked like, so nothing here trusts the form it
 * came from:
 *
 *   * **Identity is the session and only the session.** A `did` field in any of these forms
 *     would be a login by assertion. The short code names *which* bet, never *who*.
 *   * **Permission is `allowedActions`, checked inside the transaction.** Every repository
 *     call below runs `authorize`, which asks the same state machine the buttons were
 *     rendered from. A form for an action the caller may not take is refused on arrival, not
 *     because the page declined to draw it.
 *   * **Membership, not possession.** Every action here goes through `getBetByShortCode`,
 *     which answers NOT_FOUND to anybody not on the bet — so holding the link buys a stranger
 *     nothing in this file. Taking the other side is the one move authorized by the link
 *     itself, and it lives in `accept.ts` with its own policies.
 *
 * They all redirect back to the page rather than returning a message. The page recomputes
 * state and actions from the bet, so one place decides what the person is looking at — the
 * same reason `takeRefereeRole` redirects.
 */

/** The bet this form is about, or a bounce. Never trusted beyond naming a row. */
function shortCodeFrom(formData: FormData): ShortCode {
  const code = String(formData.get('code') ?? '');
  if (!isShortCode(code)) redirect('/');
  return code;
}

function outcomeFrom(formData: FormData): Outcome {
  const outcome = String(formData.get('outcome') ?? '');
  if (!(OUTCOMES as readonly string[]).includes(outcome)) redirect('/');
  return outcome as Outcome;
}

/**
 * Resolves the code to a bet the caller is actually on.
 *
 * Returns the bet rather than just its id because two of the actions below need to read it,
 * and because a caller who is not a participant must fall out here — before any write is
 * attempted, and with the same answer a stranger gets for a code that does not exist.
 */
async function requireOwnBet(code: ShortCode) {
  const privyDid = await currentPrivyDid();
  if (!privyDid) redirect(`/b/${code}`);

  const found = await getBetByShortCode(privyDid, code);
  if (!found.ok) redirect(`/b/${code}`);
  return { privyDid, bet: found.value.bet };
}

/** "It's done" / "they didn't" — the first move after a deadline. */
export async function claimOutcome(formData: FormData): Promise<void> {
  const code = shortCodeFrom(formData);
  const outcome = outcomeFrom(formData);
  const { privyDid, bet } = await requireOwnBet(code);

  await submitClaim(privyDid, bet.id, { outcome });
  redirect(`/b/${code}`);
}

/** Agreeing with what the other side claimed. Settles the bet on their number. */
export async function agreeWithClaim(formData: FormData): Promise<void> {
  const code = shortCodeFrom(formData);
  const { privyDid, bet } = await requireOwnBet(code);

  // The outcome is the claim's, read from the row rather than taken from the form: a person
  // confirming somebody else's claim is agreeing to *their* number, and a form field here
  // would let one side confirm a different result than the one on screen.
  const outcome = bet.claim?.outcome;
  if (!outcome) redirect(`/b/${code}`);

  await recordAction(privyDid, bet.id, 'confirmClaim', { outcome });
  redirect(`/b/${code}`);
}

/** "No, they didn't." Free, and it moves nothing — all it does is hand the decision over. */
export async function disagreeWithClaim(formData: FormData): Promise<void> {
  const code = shortCodeFrom(formData);
  const { privyDid, bet } = await requireOwnBet(code);

  await openDispute(privyDid, bet.id, {});
  redirect(`/b/${code}`);
}

/** The referee's verdict. Only a confirmed referee reaches this; `authorize` is what says so. */
export async function refereeRuling(formData: FormData): Promise<void> {
  const code = shortCodeFrom(formData);
  const outcome = outcomeFrom(formData);
  const { privyDid, bet } = await requireOwnBet(code);

  await recordAction(privyDid, bet.id, 'refereeResolve', { outcome });
  redirect(`/b/${code}`);
}

/**
 * The timeouts: an unanswered claim settles, an unanswered dispute refunds, an unaccepted bet
 * expires. `allowedActions` marks these permissionless, and they are — in the domain, and in
 * the on-chain program they will become. Here they still need a session, because a request
 * with no user opens no transaction and every policy in `0002_rls.sql` reads `app.user_id`.
 * That is a property of this deployment, not of the rule: when the program exists, the
 * timeout path stops depending on us being reachable at all.
 */
export async function settleByTimeout(formData: FormData): Promise<void> {
  const code = shortCodeFrom(formData);
  const { privyDid, bet } = await requireOwnBet(code);
  const action = String(formData.get('action') ?? '');

  if (action === 'settleUncontested') {
    /*
     * The claim cannot have moved. `settleUncontested` is offered only once the confirmation
     * window has closed, and `confirmClaim` and `disputeClaim` are offered only while it is
     * open — so past that line the claim is frozen and reading it before writing is safe.
     */
    const outcome = bet.claim?.outcome;
    if (!outcome) redirect(`/b/${code}`);
    await recordAction(privyDid, bet.id, 'settleUncontested', { outcome });
  } else if (action === 'refundExpired' || action === 'expireUnaccepted') {
    await recordAction(privyDid, bet.id, action);
  }

  redirect(`/b/${code}`);
}

/** Calling it off while nobody has taken the other side yet. */
export async function cancelBet(formData: FormData): Promise<void> {
  const code = shortCodeFrom(formData);
  const { privyDid, bet } = await requireOwnBet(code);

  await recordAction(privyDid, bet.id, 'cancel');
  redirect(`/b/${code}`);
}
