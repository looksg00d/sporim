'use server';

import { redirect } from 'next/navigation';
import { clampSignature, isShortCode, signatureSchema } from '@sporim/domain';
import { acceptBet } from '@/server/db/accept.repo';
import { currentPrivyDid } from '@/server/auth/session';

/**
 * Taking the other side, from the form on `/b/[code]`.
 *
 * The code comes out of the submitted form rather than out of a closure, because a server
 * action is a public endpoint whatever the page around it looks like — anyone can post here.
 * That is fine, and it is the point: possession of the code is the authorization, and
 * `acceptBet` re-checks it against the database on every call, where `0011`'s policies check
 * it again underneath. Nothing is trusted because the page that rendered it was trusted.
 *
 * The identity is the session's and never the request's. A `did` field in this form would be
 * a login by assertion.
 *
 * The signature arrives as a JSON string, because a form posts strings, and is parsed by the
 * same schema a restored draft goes through — then clamped, so an enthusiastic scrawl is
 * trimmed to what the product draws rather than refused. A malformed one bounces back to the
 * page, which will render the panel again rather than explain: one place decides what this
 * person is looking at, and it is the page.
 */
export async function acceptByLink(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '');
  if (!isShortCode(code)) redirect('/');

  const privyDid = await currentPrivyDid();
  // No session, no seat: an acceptance has to attach to an account, or there is nobody on the
  // other side. The page says so before it offers the button.
  if (!privyDid) redirect(`/b/${code}`);

  const parsed = signatureSchema.safeParse(safeJson(formData.get('signature')));
  if (parsed.success) {
    await acceptBet(privyDid, code, clampSignature(parsed.data));
  }

  redirect(`/b/${code}`);
}

/** A form field is a string, and a string from a form is not JSON until it parses. */
function safeJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || value === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
