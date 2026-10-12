import { TRUST_COPY, usdc } from '@sporim/domain';
import {
  accentGlow,
  BetCard,
  color,
  DevnetBanner,
  PillLink,
  ProofChips,
  space,
  Stamp,
  standardRows,
  typeStyle,
} from '@sporim/ui';
import { AppHeader } from '@/features/nav/AppHeader';
import { OpenInPhantom } from '@/features/wallet/OpenInPhantom';
import { env, isMockChain } from '@/lib/env';

/*
 * Scaffold home (T0.12). The real landing is T4.5 — this exists so the wiring is visible:
 * self-hosted fonts, design-system tokens, the devnet banner, and a BetCard rendered from
 * domain values rather than hand-typed numbers.
 */

export default async function HomePage() {
  const rows = standardRows({
    pot: usdc(40),
    deadlineLabel: 'Sun 23:59',
    decidedBy: 'Both of you, then Dima',
    escrowLabel: isMockChain ? 'Simulated' : 'Devnet escrow',
  });

  return (
    <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <DevnetBanner />
      {/*
       * The header, not a bare wordmark: somebody arriving here with a session needs a way to
       * their bets, and this is the page every link in the product eventually returns to. It
       * reads a cookie on the server and pulls in no wallet SDK, so reel traffic on mobile
       * data still pays nothing for it.
       */}
      <AppHeader />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: space.xxl,
          flexGrow: 1,
          padding: `${space.xxl}px ${space.lg}px`,
          backgroundImage: accentGlow(50, 18),
        }}
      >
        {/*
         * Two columns on a desktop, one on a phone: the copy and the sample card wrap onto
         * separate rows below ~800px instead of leaving the right half of a wide screen empty.
         */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: space.xxl,
            alignItems: 'center',
            alignContent: 'center',
            flexGrow: 1,
            width: '100%',
            maxWidth: 1200,
            margin: '0 auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: space.xl,
              flexGrow: 1,
              flexBasis: 420,
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.md, maxWidth: 620 }}>
              <span
                style={{
                  ...typeStyle('labelCaps'),
                  color: color.accent,
                  textTransform: 'uppercase',
                }}
              >
                {TRUST_COPY.noBackingOut}
              </span>
              <h1
                style={{
                  margin: 0,
                  ...typeStyle('displayLg'),
                  color: color.ink,
                  textWrap: 'balance',
                }}
              >
                Put money on it.
              </h1>
              <p
                style={{
                  margin: 0,
                  ...typeStyle('bodyLg'),
                  color: color.inkSecondary,
                  textWrap: 'pretty',
                }}
              >
                An argument with a friend ends one of two ways: someone quietly forgets it, or
                someone pays. Both sides lock USDC in escrow — the winner takes it.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
              <PillLink href="/new/terms">Start one</PillLink>
              <PillLink href="/how-it-works" variant="secondary">
                How it works
              </PillLink>
            </div>

            <OpenInPhantom />

            <div style={{ maxWidth: 380 }}>
              <ProofChips />
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              flexGrow: 1,
              flexBasis: 320,
              maxWidth: 460,
              paddingBottom: 46,
            }}
          >
            <BetCard
              id="0F2A"
              state="active"
              terms="You won't run 10 km by Sunday."
              sides={[
                { label: 'You', value: '20.00 USDC', tone: 'mine' },
                { label: 'Dima', value: '20.00 USDC' },
              ]}
              rows={rows}
            />
            <Stamp style={{ position: 'absolute', right: -6, bottom: 0, zIndex: 1 }}>
              {TRUST_COPY.noBackingOut}
            </Stamp>
          </div>
        </div>

        <p style={{ margin: 0, ...typeStyle('micro'), color: color.inkFaint }}>
          {/* No "Terms" link until there are terms: it pointed at a /legal that never existed. */}
          {env.appEnv} · chain: {env.chainMode} · fee {env.feeBps / 100}%
        </p>
      </div>
    </main>
  );
}
