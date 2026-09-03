import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DevnetBanner } from '@sporim/ui';
import { DraftProvider } from '@/features/draft/DraftProvider';
import { isMockChain } from '@/lib/env';

export const metadata: Metadata = {
  title: 'New bet',
  // A half-written draft is nobody's search result.
  robots: { index: false, follow: false },
};

export default function NewBetLayout({ children }: { readonly children: ReactNode }) {
  return (
    <DraftProvider>
      <DevnetBanner visible={isMockChain} />
      {children}
    </DraftProvider>
  );
}
