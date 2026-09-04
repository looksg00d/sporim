import type { ReactNode } from 'react';
import { color, space, typeStyle } from '@sporim/ui';
import { SignInButton } from './SignInButton';

/**
 * What a page shows when it has nothing it may render without knowing who is asking.
 *
 * A wall, not a redirect. A redirect to a login screen loses the URL the person actually
 * wanted, and the two places this appears are both links somebody was sent — a bet, and the
 * list of your bets. Staying on the URL means signing in lands you on the thing you came for.
 *
 * It says why rather than just demanding an account. "A bet is only readable by the people on
 * it" is the truth, it is the reason the policies exist, and it reads as a reassurance rather
 * than as a toll.
 */
export function SignInWall({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        <h1 style={{ margin: 0, ...typeStyle('displaySm'), color: color.ink }}>{title}</h1>
        <p style={{ margin: 0, ...typeStyle('body'), color: color.inkSecondary }}>{children}</p>
      </div>
      <SignInButton />
    </div>
  );
}
