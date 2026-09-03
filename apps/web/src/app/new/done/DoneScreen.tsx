'use client';

import { TRUST_COPY } from '@sporim/domain';
import { PillLink, Stamp, color, space, typeStyle } from '@sporim/ui';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useDraft } from '@/features/draft/DraftProvider';
import { isMockChain } from '@/lib/env';

/**
 * Locked in. Deliberately does not offer a share link yet: the bet page it would point at
 * lands in M2, and handing someone a link that 404s is worse than making them wait a
 * milestone. What this screen owes the user right now is proof the signature took.
 */
export function DoneScreen() {
  const code = useSearchParams().get('code');
  const { clear } = useDraft();

  // Cleanup lives here rather than on the review screen: clearing while that screen is
  // still mounted would fail its own step guard and bounce the user back to step one.
  useEffect(() => clear(), [clear]);

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xl,
        minHeight: '100dvh',
        padding: `${space.xxl}px ${space.lg}px`,
        textAlign: 'center',
      }}
    >
      <div className="sporim-pop">
        <Stamp rotate={-6}>{TRUST_COPY.noBackingOut}</Stamp>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        <h1 style={{ margin: 0, ...typeStyle('displayMd'), color: color.ink }}>Locked in.</h1>
        <p style={{ margin: 0, ...typeStyle('body'), color: color.inkSecondary }}>
          {isMockChain
            ? 'Simulated — no money moved and no transaction was made.'
            : 'Your stake is in escrow until the deadline.'}
        </p>
      </div>

      {code ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.xxs }}>
          <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>BET</span>
          <span className="sporim-tnum" style={{ ...typeStyle('displaySm'), color: color.accent }}>
            #{code}
          </span>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' }}>
        <PillLink href="/new/terms">Start another</PillLink>
        <PillLink href="/" variant="secondary">
          Home
        </PillLink>
      </div>
    </main>
  );
}
