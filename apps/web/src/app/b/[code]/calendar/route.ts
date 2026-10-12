import { isShortCode, isTerminal } from '@sporim/domain';
import { buildBetCalendar } from '@/features/bet/calendar';
import { betUrl } from '@/features/bet/links';
import { nowSeconds } from '@/lib/time';
import { currentPrivyDid } from '@/server/auth/session';
import { readBetByShortCode } from '@/server/db/accept.repo';

/**
 * `/b/[code]/calendar` — the bet's deadline as an `.ics` download.
 *
 * Only for somebody on the bet. A stranger holding an open code can read the terms, but a
 * reminder for somebody else's deadline is not something they need, and the answer is the
 * same not-found the page gives, so this route is no better an oracle than the page.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const notFound = () => new Response('Not found', { status: 404 });
  if (!isShortCode(code)) return notFound();

  const now = nowSeconds();
  const found = await readBetByShortCode(code, await currentPrivyDid(), now);
  if (!found.ok) return notFound();

  const { bet, status } = found.value;
  if (status !== 'party' && status !== 'yours') return notFound();
  if (isTerminal(bet.state)) return notFound();

  const body = buildBetCalendar(
    { code, terms: bet.terms, deadlineSeconds: bet.deadlineSeconds, url: betUrl(code) },
    now,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="sporim-${code}.ics"`,
      // Personal and changes with the bet; never let a shared cache hold it.
      'Cache-Control': 'private, no-store',
    },
  });
}
