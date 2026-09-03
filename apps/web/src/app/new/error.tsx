'use client';

import { PillButton, PillLink, color, space, typeStyle } from '@sporim/ui';
import { useEffect } from 'react';

/**
 * A crash inside the wizard must not cost the user their draft — it lives in
 * `sessionStorage`, so `reset()` re-mounts the tree and the provider restores it. That is
 * the whole point of this boundary: recover in place rather than sending them home.
 */
export default function NewBetError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Sentry lands in M4; until then the console is the only place this can go.
    console.error('[new-bet]', error);
  }, [error]);

  return (
    <main
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: space.lg,
        minHeight: '100dvh',
        padding: `${space.xxl}px ${space.lg}px`,
      }}
    >
      <h1 style={{ margin: 0, ...typeStyle('displayMd'), color: color.ink }}>That broke.</h1>
      <p style={{ margin: 0, ...typeStyle('body'), color: color.inkSecondary, maxWidth: 460 }}>
        Nothing was locked and no money moved. Your draft is still here — pick up where you left
        off.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
        <PillButton onClick={reset}>Try again</PillButton>
        <PillLink href="/" variant="secondary">
          Home
        </PillLink>
      </div>
      {error.digest ? (
        <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>Ref {error.digest}</span>
      ) : null}
    </main>
  );
}
