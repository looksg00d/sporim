import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FORMAT_COPY, TRUST_COPY } from '@sporim/domain';
import { DevnetBanner, PillLink, color, radius, space, typeStyle } from '@sporim/ui';
import { AppHeader } from '@/features/nav/AppHeader';
import { isMockChain } from '@/lib/env';

/**
 * `/how-it-works` — the landing page's second button, which led to a 404 until now.
 *
 * Every rule on this page is quoted from `@sporim/domain`'s copy tables rather than
 * restated. Those sentences are the ones the vocabulary test already guards and the ones the
 * product shows at the moment each rule applies; a second wording here would be a second
 * promise to keep true.
 */

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Two sides, one deadline, money in escrow, and a referee only if you disagree.',
};

const STEPS: readonly (readonly [string, string])[] = [
  ['Write it down', 'One sentence, a stake and a deadline. You sign it with your finger.'],
  ['Send the link', TRUST_COPY.linkWarning],
  [
    'They take it',
    'Whoever opens the link and signs is the other side. Until then nothing is locked.',
  ],
  ['Deadline passes', TRUST_COPY.timeline],
];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
      <h2 style={{ margin: 0, ...typeStyle('labelCaps'), color: color.inkSecondary }}>{title}</h2>
      {children}
    </section>
  );
}

function Card({ children }: { readonly children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.xs,
        padding: space.md,
        borderRadius: radius.md,
        border: `1px solid ${color.hairline}`,
        background: color.surface,
      }}
    >
      {children}
    </div>
  );
}

function Line({ children, strong }: { readonly children: ReactNode; readonly strong?: boolean }) {
  return (
    <p
      style={{
        margin: 0,
        ...typeStyle(strong ? 'body' : 'bodySm'),
        color: strong ? color.ink : color.inkSecondary,
      }}
    >
      {children}
    </p>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <DevnetBanner visible={isMockChain} />
      <AppHeader />
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: space.xl,
          maxWidth: 640,
          margin: '0 auto',
          minHeight: '100dvh',
          boxSizing: 'border-box',
          padding: `${space.lg}px ${space.lg}px ${space.xxl}px`,
          background: color.canvas,
        }}
      >
        <h1 style={{ margin: 0, ...typeStyle('displaySm'), color: color.ink }}>How it works</h1>

        {isMockChain ? (
          // Said first, not in a footnote: nothing on this page is true of real money yet.
          <Card>
            <Line strong>Right now escrow is simulated.</Line>
            <Line>
              Bets, signatures, deadlines and referees all work. No USDC moves until escrow goes
              live — the card says “Simulated” until then.
            </Line>
          </Card>
        ) : null}

        <Section title="Four steps">
          {STEPS.map(([title, body], index) => (
            <Card key={title}>
              <Line strong>
                {index + 1}. {title}
              </Line>
              <Line>{body}</Line>
            </Card>
          ))}
        </Section>

        <Section title="Two formats">
          {Object.values(FORMAT_COPY).map((format) => (
            <Card key={format.label}>
              <Line strong>{format.label}</Line>
              <Line>
                {format.who} {format.onFail}
              </Line>
              <Line>“{format.example}”</Line>
            </Card>
          ))}
        </Section>

        <Section title="The referee">
          <Card>
            <Line>{TRUST_COPY.refereeRole}</Line>
            <Line>{TRUST_COPY.refereeConfirmed}</Line>
          </Card>
        </Section>

        <Section title="The money">
          <Card>
            <Line strong>{TRUST_COPY.fee}</Line>
            <Line>{TRUST_COPY.feeSplit}</Line>
            <Line>{TRUST_COPY.refund}</Line>
          </Card>
        </Section>

        <PillLink href="/new/terms" fullWidth>
          Start one
        </PillLink>
      </main>
    </>
  );
}
