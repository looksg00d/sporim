import Link from 'next/link';
import { color, space, typeStyle } from '@sporim/ui';
import { currentPrivyDid } from '@/server/auth/session';

/**
 * The one piece of furniture every screen has: the wordmark, and a way back to your bets.
 *
 * It exists because the product had no navigation at all. A person could create a bet, land
 * on the "locked in" screen, close the tab — and there was no route back to it from anywhere.
 * A bet you cannot find again is a bet you cannot settle.
 *
 * Rendered on the server, and that is the whole reason "My bets" can be here at all. It reads
 * the session cookie, so the link is either in the markup or it is not — no flash of a link
 * that then disappears, and no wallet SDK pulled onto the landing page to answer a question a
 * cookie already answers. The landing page is where reel traffic arrives on mobile data; it
 * still pays for nothing it does not use.
 *
 * Signed out it renders the wordmark alone. There is deliberately no "Sign in" here: signing
 * in is something you do on the way to a specific thing, and an account that buys you nothing
 * yet is a wall in front of a stranger.
 */
export async function AppHeader() {
  const signedIn = (await currentPrivyDid()) !== null;

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.md,
        padding: `${space.md}px ${space.lg}px`,
      }}
    >
      <Link
        href="/"
        className="sporim-focusable"
        style={{ ...typeStyle('wordmark'), color: color.ink, textDecoration: 'none' }}
      >
        SPORIM
      </Link>

      {signedIn ? (
        <Link
          href="/me"
          className="sporim-link sporim-focusable"
          style={{ ...typeStyle('labelCaps'), color: color.accent, textDecoration: 'none' }}
        >
          MY BETS
        </Link>
      ) : null}
    </header>
  );
}
