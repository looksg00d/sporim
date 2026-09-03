import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { TRUST_COPY, addUsdc, formatUsdc, isRefereeToken } from '@sporim/domain';
import {
  BetCard,
  Icon,
  PillButton,
  PillLink,
  color,
  radius,
  space,
  standardRows,
  typeStyle,
} from '@sporim/ui';
import { isMockChain } from '@/lib/env';
import { formatDeadlineShort } from '@/lib/time';
import { takeRefereeRole } from '@/server/actions/referee';
import { currentPrivyDid } from '@/server/auth/session';
import {
  readRefereeInvite,
  type RefereeInvite,
  type RefereeInviteStatus,
} from '@/server/db/referee.repo';

/**
 * `/r/[token]` — the referee's own door into a bet.
 *
 * This is the screen that closes the hole the whole feature is about: today a creator names a
 * referee on the fourth screen and that person never learns of it. Here they read the terms,
 * see who is arguing, find out what the role costs them and what it pays, and take it or
 * don't. Until they take it their silence in a dispute refunds both sides — so this page is
 * also the only thing that turns "Anya is the referee" from a hope into a fact.
 *
 * A different link from the accept link, on purpose. `/b/[code]` says "take the other side";
 * this one says "settle it if they disagree". One shared link would let whoever opened it
 * first choose which of the two they wanted to be.
 */

export const metadata: Metadata = {
  title: 'Referee this bet',
  // A URL that *is* a capability must never be in an index or in a preview crawl.
  robots: { index: false, follow: false, nocache: true },
};

/** What the page may offer, and the one sentence explaining why. */
const STATUS_COPY: Record<RefereeInviteStatus, { readonly title: string; readonly body: string }> =
  {
    open: {
      title: 'Take the role?',
      body: TRUST_COPY.refereeNotAParty,
    },
    yours: {
      title: 'You are the referee.',
      body: "Nothing to do until they disagree. If that happens, you'll decide — and we'll ask you here.",
    },
    taken: {
      title: 'Somebody already took this.',
      body: 'The role belongs to whoever accepted it first, and it cannot be handed on. Nothing here needs you.',
    },
    party: {
      title: 'You are on this bet.',
      body: TRUST_COPY.refereeNotAParty,
    },
    anonymous: {
      title: 'Take the role?',
      body: TRUST_COPY.refereeSignInFirst,
    },
    closed: {
      title: 'This one is over.',
      body: 'The bet has already settled, so there is nothing left to decide.',
    },
  };

function Panel({
  tone = 'quiet',
  children,
}: {
  readonly tone?: 'quiet' | 'warn';
  readonly children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.xs,
        padding: space.md,
        borderRadius: radius.md,
        border: `1px solid ${tone === 'warn' ? color.loss : color.hairline}`,
        background: color.surface,
      }}
    >
      {children}
    </div>
  );
}

function Line({ children }: { readonly children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.xs }}>
      <Icon
        name="check"
        size={14}
        strokeWidth={2.4}
        color={color.accent}
        style={{ marginTop: 3 }}
      />
      <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>{children}</span>
    </div>
  );
}

function RefereeInviteScreen({
  invite,
  token,
}: {
  readonly invite: RefereeInvite;
  readonly token: string;
}) {
  const { bet, status } = invite;
  const copy = STATUS_COPY[status];
  const pot = addUsdc(bet.stakeCreator, bet.stakeOpponent);
  const creatorName = bet.creator.displayName ?? 'They';
  const opponentName = bet.opponent?.displayName ?? 'whoever takes it';

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.xl,
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: `64px ${space.lg}px ${space.xxl}px`,
        background: color.canvas,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        <span style={{ ...typeStyle('labelCaps'), color: color.accent }}>REFEREE</span>
        <h1 style={{ margin: 0, ...typeStyle('displayMd'), color: color.ink, textWrap: 'pretty' }}>
          {copy.title}
        </h1>
        <p style={{ margin: 0, ...typeStyle('body'), color: color.inkSecondary }}>
          {TRUST_COPY.refereeInvite}
        </p>
      </div>

      <BetCard
        id={bet.shortCode}
        state={bet.state}
        format={bet.format}
        terms={bet.terms}
        sides={[
          { label: creatorName, value: `${formatUsdc(bet.stakeCreator)} USDC` },
          {
            label: opponentName,
            value: bet.format === 'bet' ? `${formatUsdc(bet.stakeOpponent)} USDC` : 'No stake',
          },
        ]}
        rows={standardRows({
          pot,
          deadlineLabel: formatDeadlineShort(bet.deadlineSeconds),
          decidedBy: bet.referee?.displayName ?? 'you',
          escrowLabel: isMockChain ? 'Simulated' : 'Devnet escrow',
          refereeConfirmed: bet.referee?.confirmedAtSeconds !== null,
        })}
      />

      <Panel>
        <span style={{ ...typeStyle('labelCapsSm'), color: color.inkFaint }}>
          WHAT YOU AGREE TO
        </span>
        <Line>{TRUST_COPY.refereeRole}</Line>
        <Line>{TRUST_COPY.refereePay}</Line>
        <Line>{TRUST_COPY.refereeNotAParty}</Line>
      </Panel>

      {/*
        Said plainly, because it is the thing they are actually deciding. A named referee who
        never accepts is not a referee: their silence refunds both sides instead of upholding
        a claim, which is why nobody may quietly be signed up for this.
      */}
      <Panel tone={bet.referee?.confirmedAtSeconds === null ? 'warn' : 'quiet'}>
        <span
          style={{
            ...typeStyle('labelCapsSm'),
            color: bet.referee?.confirmedAtSeconds === null ? color.loss : color.inkFaint,
          }}
        >
          IF THEY DISAGREE
        </span>
        <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>
          {bet.referee?.confirmedAtSeconds === null
            ? TRUST_COPY.refereeUnconfirmed
            : TRUST_COPY.refereeConfirmed}
        </span>
      </Panel>

      <div style={{ flexGrow: 1 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm - 2 }}>
        {status === 'open' ? (
          // A plain form, so taking the role needs no client bundle at all: the person opening
          // this link is in somebody else's chat app on a bad connection.
          <form action={takeRefereeRole}>
            <input type="hidden" name="token" value={token} />
            <PillButton fullWidth icon="scale" type="submit" data-testid="take-referee-role">
              I&apos;ll decide it
            </PillButton>
          </form>
        ) : null}

        <p
          style={{
            margin: 0,
            minHeight: 18,
            textAlign: 'center',
            ...typeStyle('micro'),
            color: status === 'party' ? color.loss : color.inkFaint,
          }}
        >
          {copy.body}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PillLink href="/" variant="ghost">
            What is SPORIM?
          </PillLink>
        </div>
      </div>
    </main>
  );
}

export default async function RefereeInvitePage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}) {
  const { token } = await params;
  // Shape-checked before anything else, which is also what stops an 8-character short code
  // from being spent here: the two capabilities have deliberately exclusive lengths.
  if (!isRefereeToken(token)) notFound();

  const invite = await readRefereeInvite(token, await currentPrivyDid());
  // A bad token and a bet that does not exist give the same answer, so the URL never becomes
  // an oracle for which invitations are real.
  if (!invite.ok) notFound();

  return <RefereeInviteScreen invite={invite.value} token={token} />;
}
