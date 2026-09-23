import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { addUsdc, isRefereeConfirmed, isShortCode } from '@sporim/domain';
import { BetCard, color, space, standardRows, typeStyle } from '@sporim/ui';
import { isMockChain } from '@/lib/env';
import { nowSeconds } from '@/lib/time';
import { readBetByShortCode } from '@/server/db/accept.repo';

/**
 * What unfurls when somebody pastes `/b/[code]` into a chat.
 *
 * The link is the product's only growth channel, and until now it unfurled as a bare URL.
 * This draws the same `BetCard` the page does — it was built flexbox-and-inline-styles-only
 * for exactly this renderer.
 *
 * ## Read as nobody
 *
 * Always anonymous, never with a session: a crawler has none, and a card built from a
 * session could show a chat something only one of its members may see. Anonymous with a
 * real code sees the bet while it is `open` — the same terms the page shows a stranger —
 * and afterwards nothing, so a taken bet unfurls as the generic card rather than leaking.
 *
 * ## Fonts
 *
 * Satori reads TTF/OTF/WOFF, not the woff2 the site ships, and Unbounded has no static TTF
 * upstream. `assets/og/` holds the static instances Google Fonts serves per weight — the
 * same four weights `tokens.ts` uses, Cyrillic included, since terms are written in Russian.
 */

export const runtime = 'nodejs';
// Rendered per request: the card changes the moment the bet is taken.
export const dynamic = 'force-dynamic';
export const alt = 'A bet on SPORIM';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const MAX_TERMS = 140;

async function fonts() {
  const dir = join(process.cwd(), 'assets', 'og');
  const load = (file: string) => readFile(join(dir, file));
  const [u700, u900, m400, m600] = await Promise.all([
    load('unbounded-700.ttf'),
    load('unbounded-900.ttf'),
    load('ibm-plex-mono-400.ttf'),
    load('ibm-plex-mono-600.ttf'),
  ]);
  return [
    { name: 'Unbounded', data: u700, weight: 700 as const, style: 'normal' as const },
    { name: 'Unbounded', data: u900, weight: 900 as const, style: 'normal' as const },
    { name: 'IBM Plex Mono', data: m400, weight: 400 as const, style: 'normal' as const },
    { name: 'IBM Plex Mono', data: m600, weight: 600 as const, style: 'normal' as const },
  ];
}

/**
 * The card is read by a whole chat, in whatever zones its members live, and rendered on a
 * server whose zone is nobody's. So the date is full and the zone is named — the page's
 * short "Fri 18:00" would be a different Friday for half the chat, or no Friday at all a
 * month out.
 */
function deadlineLabel(seconds: number): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(seconds * 1000));
  return `${formatted} UTC`;
}

/** By code point, not UTF-16 unit: a slice through an emoji leaves half a surrogate. */
function truncate(text: string): string {
  const chars = Array.from(text);
  return chars.length <= MAX_TERMS
    ? text
    : `${chars
        .slice(0, MAX_TERMS - 1)
        .join('')
        .trimEnd()}…`;
}

/**
 * `ImageResponse` defaults to `public, immutable, max-age=31536000` in production, and the
 * URL's hash depends on this file, not on the bet. Left alone, a CDN would keep showing the
 * terms for a year after the code stopped opening them. Messengers cache the unfurl on their
 * side anyway; ours must not.
 */
const NO_STORE = { 'Cache-Control': 'no-store' };

/** A card that fails to read the bet is still a card: the generic one, never a 500 in chat. */
async function readOpenBet(code: string) {
  if (!isShortCode(code)) return null;
  try {
    const now = nowSeconds();
    const found = await readBetByShortCode(code, null, now);
    if (!found.ok) return null;
    const { bet } = found.value;
    // Still `open` past its accept deadline is a bet nobody can take: do not invite them.
    return bet.state === 'open' && now < bet.acceptDeadlineSeconds ? bet : null;
  } catch {
    return null;
  }
}

function Frame({
  children,
  footer,
}: {
  readonly children: React.ReactNode;
  readonly footer: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: space.lg,
        padding: `${space.xl}px ${space.xl * 2}px`,
        background: color.canvas,
      }}
    >
      {children}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ ...typeStyle('displaySm'), color: color.accent }}>SPORIM</span>
        <span style={{ ...typeStyle('body'), color: color.inkSecondary }}>{footer}</span>
      </div>
    </div>
  );
}

function Generic() {
  return (
    <Frame footer="sporim.fun">
      <span style={{ ...typeStyle('displayLg'), color: color.ink }}>Put money on it.</span>
      <span style={{ ...typeStyle('body'), color: color.inkSecondary }}>
        A bet between friends, with a referee and a deadline.
      </span>
    </Frame>
  );
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const bet = await readOpenBet(code);

  const body = bet ? (
    <Frame footer="Tap to take the other side">
      <BetCard
        id={code}
        state={bet.state}
        format={bet.format}
        terms={truncate(bet.terms)}
        scale="wide"
        rows={standardRows({
          pot: addUsdc(bet.stakeCreator, bet.stakeOpponent),
          deadlineLabel: deadlineLabel(bet.deadlineSeconds),
          decidedBy: bet.referee?.displayName ?? 'Both of you',
          refereeConfirmed: bet.referee ? isRefereeConfirmed(bet.referee) : null,
          ...(isMockChain ? { escrowLabel: 'Simulated' } : {}),
        })}
      />
    </Frame>
  ) : (
    <Generic />
  );

  return new ImageResponse(body, { ...size, fonts: await fonts(), headers: NO_STORE });
}
