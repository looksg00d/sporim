import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { env } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: 'SPORIM — put money on it',
    template: '%s · SPORIM',
  },
  description:
    'Settle an argument with a friend the only way that sticks: both sides put USDC in escrow, and the winner takes it.',
  applicationName: 'SPORIM',
  openGraph: {
    type: 'website',
    siteName: 'SPORIM',
    url: env.appUrl,
  },
  twitter: { card: 'summary_large_image' },
  robots: env.appEnv === 'production' ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0f1014',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // The product is a phone screen first; pinch-zoom stays on for accessibility.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
