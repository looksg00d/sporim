import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DevnetBanner } from '@sporim/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { DraftProvider } from '@/features/draft/DraftProvider';
import { isMockChain } from '@/lib/env';

export const metadata: Metadata = {
  title: 'New bet',
  // A half-written draft is nobody's search result.
  robots: { index: false, follow: false },
};

/**
 * `AuthProvider` outside `DraftProvider`, not inside: the draft survives the trip to the
 * inbox and back, so signing in must never be able to unmount the thing being written.
 */
export default function NewBetLayout({ children }: { readonly children: ReactNode }) {
  return (
    <AuthProvider>
      <DraftProvider>
        <DevnetBanner visible={isMockChain} />
        {children}
      </DraftProvider>
    </AuthProvider>
  );
}
