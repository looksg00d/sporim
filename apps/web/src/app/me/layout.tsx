import type { ReactNode } from 'react';
import { DevnetBanner, color, space } from '@sporim/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { AppHeader } from '@/features/nav/AppHeader';
import { isMockChain } from '@/lib/env';

/**
 * Signed out, this tree shows a sign-in wall rather than redirecting — so the provider has to
 * be here, and `AppHeader` renders the way back for everybody else.
 */
export default function MyBetsLayout({ children }: { readonly children: ReactNode }) {
  return (
    <AuthProvider>
      <DevnetBanner visible={isMockChain} />
      <AppHeader />
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: space.xl,
          minHeight: '100dvh',
          boxSizing: 'border-box',
          padding: `${space.lg}px ${space.lg}px ${space.xxl}px`,
          background: color.canvas,
        }}
      >
        {children}
      </main>
    </AuthProvider>
  );
}
