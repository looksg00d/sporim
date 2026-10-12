import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  STATE_COPY,
  addUsdc,
  allowedActions,
  formatUsdc,
  type Bet,
  type ViewerRole,
} from '@sporim/domain';
import { PillLink, StateChip, color, radius, space, typeStyle } from '@sporim/ui';
import { SignInWall } from '@/features/auth/SignInWall';
import { needsYou } from '@/features/bet/attention';
import { whatHappensNext } from '@/features/bet/next-step';
import { formatDeadlineShort, nowSeconds } from '@/lib/time';
import { currentPrivyDid } from '@/server/auth/session';
import { deadlineOptions, viewerTimeZone, type DeadlineDisplay } from '@/server/time-zone';
import { listBetsForUser } from '@/server/db/bets.repo';

/**
 * `/me` — every bet you are on.
 *
 * The gap this fills is not a missing feature so much as a missing exit. Until now a person
 * could create a bet, read "locked in", close the tab, and have no route back to it from
 * anywhere in the product. A bet you cannot find again is a bet you cannot settle, and a
 * deadline you never see is the failure mode this whole thing exists to prevent.
 *
 * ## Split by whose turn it is, not by date
 *
 * A flat list is useless the moment somebody has more than three bets: the point of coming
 * back is finding the one thing that needs a decision. `needsYou` draws that line from
 * `allowedActions`, so the split cannot drift from what the bet page will actually offer.
 *
 * ## Referees are here too
 *
 * A referee has a `participants` row, so being asked to settle an argument puts the bet in
 * this list. That was the hole the referee invitation left open: somebody could accept the
 * role and then have nowhere to see where they had accepted it.
 */

export const metadata: Metadata = {
  title: 'My bets',
  robots: { index: false, follow: false },
};

/** What this person is on this bet, in a word. */
const ROLE_LABEL: Record<ViewerRole, string> = {
  creator: 'You started it',
  opponent: 'You took it',
  referee: 'You referee it',
  beneficiary: 'It pays you',
  observer: 'You are watching',
};

function Row({
  bet,
  role,
  now,
  dates,
}: {
  readonly bet: Bet;
  readonly role: ViewerRole;
  readonly now: number;
  readonly dates: DeadlineDisplay;
}) {
  const pot = addUsdc(bet.stakeCreator, bet.stakeOpponent);

  return (
    <Link
      href={`/b/${bet.shortCode}`}
      className="sporim-focusable"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.xs,
        padding: space.md,
        borderRadius: radius.md,
        border: `1px solid ${color.hairline}`,
        background: color.surface,
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
        }}
      >
        <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
          {ROLE_LABEL[role]}
        </span>
        <StateChip state={bet.state} />
      </div>

      <span
        style={{
          ...typeStyle('body'),
          color: color.ink,
          // Two lines is enough to recognise which argument this is; the bet page has the rest.
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {bet.terms}
      </span>

      <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>
        {whatHappensNext(bet, role, now, dates)}
      </span>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space.sm }}>
        <span style={{ ...typeStyle('micro'), color: color.accent }}>{formatUsdc(pot)} USDC</span>
        <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>
          {formatDeadlineShort(bet.deadlineSeconds, dates)}
        </span>
      </div>
    </Link>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
      <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>{title}</span>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        <h1 style={{ margin: 0, ...typeStyle('displaySm'), color: color.ink }}>Nothing yet.</h1>
        <p style={{ margin: 0, ...typeStyle('body'), color: color.inkSecondary }}>
          Bets you start, take, or referee all show up here.
        </p>
      </div>
      <PillLink href="/new">Start one</PillLink>
    </div>
  );
}

export default async function MyBetsPage() {
  const privyDid = await currentPrivyDid();
  if (!privyDid) {
    return (
      <SignInWall title="Sign in to see your bets.">
        A bet is only readable by the people on it, so we have to know which of them you are.
      </SignInWall>
    );
  }

  const found = await listBetsForUser(privyDid);
  // A read that fails is not an empty list, and must never look like one: "you have no bets"
  // to somebody who has six is the single worst thing this page could say.
  if (!found.ok) {
    return (
      <div role="alert" style={{ ...typeStyle('body'), color: color.loss }}>
        We could not load your bets just now. Nothing is lost — try again in a moment.
      </div>
    );
  }

  const views = found.value;
  if (views.length === 0) return <Empty />;

  const now = nowSeconds();
  const dates = deadlineOptions(await viewerTimeZone(), now);
  const decorated = views.map((view) => ({
    ...view,
    waiting: needsYou(allowedActions(view.bet, view.role, now)),
  }));
  const yours = decorated.filter((view) => view.waiting);
  const rest = decorated.filter((view) => !view.waiting);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xl }}>
      <h1 style={{ margin: 0, ...typeStyle('displaySm'), color: color.ink }}>My bets</h1>

      {yours.length > 0 ? (
        <Section title={`YOUR MOVE · ${yours.length}`}>
          {yours.map(({ bet, role }) => (
            <Row key={bet.id} bet={bet} role={role} now={now} dates={dates} />
          ))}
        </Section>
      ) : null}

      {rest.length > 0 ? (
        <Section title="EVERYTHING ELSE">
          {rest.map(({ bet, role }) => (
            <Row key={bet.id} bet={bet} role={role} now={now} dates={dates} />
          ))}
        </Section>
      ) : null}

      <p style={{ margin: 0, ...typeStyle('micro'), color: color.inkFaint }}>
        {views.length} in total ·{' '}
        {views.filter(({ bet }) => bet.state === 'resolved' || bet.state === 'refunded').length}{' '}
        {STATE_COPY.resolved.toLowerCase()}
      </p>

      <PillLink href="/new" variant="secondary">
        Start another
      </PillLink>
    </div>
  );
}
