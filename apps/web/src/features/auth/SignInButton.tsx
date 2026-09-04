'use client';

import { PillButton, color, typeStyle } from '@sporim/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuth } from './AuthProvider';

/**
 * "Sign in" on a server-rendered page.
 *
 * The page around it decided what to show from a session the server verified, so signing in
 * has to make that page think again: Privy writes its cookie in the browser, and until the
 * server sees it the screen is still the one it rendered for a stranger. `router.refresh()`
 * on the transition is the whole of that — the page re-renders on the server, with a session
 * this time, and offers whatever it offers.
 *
 * Refreshed on the *transition* rather than whenever `authenticated` is true, so a page
 * opened by somebody already signed in does not fetch itself a second time for nothing.
 */
export function SignInButton({
  label = 'Sign in',
  unavailableLabel = 'Sign-in is unavailable right now.',
}: {
  readonly label?: string;
  readonly unavailableLabel?: string;
}) {
  const { configured, ready, authenticated, login } = useAuth();
  const router = useRouter();
  const wasAuthenticated = useRef(authenticated);

  useEffect(() => {
    if (authenticated === wasAuthenticated.current) return;
    wasAuthenticated.current = authenticated;
    if (authenticated) router.refresh();
  }, [authenticated, router]);

  // Said plainly rather than shown as a button that does nothing. A deployment with no Privy
  // application cannot sign anybody in, and pretending otherwise wastes the one tap somebody
  // came here to make.
  if (!configured) {
    return (
      <p style={{ margin: 0, textAlign: 'center', ...typeStyle('micro'), color: color.loss }}>
        {unavailableLabel}
      </p>
    );
  }

  return (
    <PillButton fullWidth icon="check" disabled={!ready} onClick={login} data-testid="sign-in">
      {ready ? label : 'Loading…'}
    </PillButton>
  );
}
