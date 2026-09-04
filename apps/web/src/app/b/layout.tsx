import type { ReactNode } from 'react';
import { DevnetBanner } from '@sporim/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { isMockChain } from '@/lib/env';

/**
 * A bet is only readable by the people on it, so this tree always has something to
 * authenticate — unlike the landing page, which deliberately does not mount the wallet SDK.
 *
 * Without this the sign-in wall on `/b/[code]` throws rather than renders: `useAuth` refuses
 * to invent a session outside a provider, which is the behaviour we want and the reason the
 * omission surfaces as a crash instead of as a page that quietly says nobody is signed in.
 */
export default function BetLayout({ children }: { readonly children: ReactNode }) {
  return (
    <AuthProvider>
      <DevnetBanner visible={isMockChain} />
      {children}
    </AuthProvider>
  );
}
