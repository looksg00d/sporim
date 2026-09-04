import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  STATE_COPY,
  TRUST_COPY,
  addUsdc,
  allowedActions,
  calculateSettlement,
  formatUsdc,
  isRefereeConfirmed,
  isShortCode,
  type Bet,
  type BetAction,
  type Outcome,
  type ViewerRole,
} from '@sporim/domain';
import {
  BetCard,
  PayoutBreakdown,
  PillButton,
  color,
  radius,
  space,
  standardRows,
  typeStyle,
} from '@sporim/ui';
import { SignInWall } from '@/features/auth/SignInWall';
import { isMockChain } from '@/lib/env';
import { betUrl } from '@/features/bet/links';
import { whatHappensNext } from '@/features/bet/next-step';
import { formatDeadlineShort, nowSeconds } from '@/lib/time';
import {
  agreeWithClaim,
  cancelBet,
  claimOutcome,
  disagreeWithClaim,
  refereeRuling,
  settleByTimeout,
} from '@/server/actions/bet';
import { currentPrivyDid } from '@/server/auth/session';
import { getBetByShortCode } from '@/server/db/bets.repo';

/**
 * `/b/[code]` — the bet itself, after it exists.
 *
 * Everything on this page is derived, never stored twice: the buttons come from
 * `allowedActions`, the figures come from `calculateSettlement`, and the sentence about what
 * happens next comes from the same state the chip is drawn from. That is the whole design
 * rule — the screen cannot offer a move the server would refuse, and cannot show a number the
 * settlement would not pay, because it is asking the same functions.
 *
 * ## Who can see it
 *
 * Participants. The short code names a bet; it does not authorize reading one, so
 * `getBetByShortCode` answers NOT_FOUND to everybody else and this page renders the same
 * not-found for a stranger as for a code that was never minted. That is deliberate: the
 * alternative leaks which codes exist.
 *
 * The cost is that the link the creator sends to their friend does not yet work for that
 * friend — taking the other side needs an authorization for somebody who is not on the bet
 * yet, the same shape the referee invitation solved in `0004`, and it is not written. Until
 * it is, this page belongs to the people already on the bet.
 *
 * ## Rendered on the server
 *
 * No `'use client'`. The bet is read inside a request that already carries the session, so
 * there is no window in which a browser holds a bet it is not entitled to, and no second
 * copy of the state machine shipped to the client to disagree with the first.
 */

export const metadata: Metadata = {
  title: 'Bet',
  // Somebody's argument with their friend is not a search result. The share card will be an
  // explicit, deliberate exception with its own route; the page itself never is.
  robots: { index: false, follow: false },
};

/** The label on the button, in the words of the person pressing it. */
const ACTION_LABEL: Record<BetAction, string> = {
  share: 'Copy the link',
  accept: 'Take the other side',
  cancel: 'Call it off',
  expireUnaccepted: 'Nobody took it — return the stake',
  submitClaim: 'Say how it went',
  confirmClaim: 'Agree',
  disputeClaim: "No, they didn't",
  settleUncontested: 'Nobody objected — settle it',
  refereeResolve: 'Decide it',
  refundExpired: 'Nobody decided — return both stakes',
};

function Panel({ children }: { readonly children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.sm,
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

function Shell({ children }: { readonly children: ReactNode }) {
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
      {children}
    </main>
  );
}

/** One outcome button. The value is the domain's, never a label parsed back into meaning. */
function OutcomeButton({
  code,
  action,
  outcome,
  children,
}: {
  readonly code: string;
  readonly action: (formData: FormData) => Promise<void>;
  readonly outcome: Outcome;
  readonly children: ReactNode;
}) {
  return (
    <form action={action} style={{ display: 'contents' }}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="outcome" value={outcome} />
      <PillButton type="submit" variant="secondary" fullWidth>
        {children}
      </PillButton>
    </form>
  );
}

/**
 * The moves, drawn from `allowedActions` and nothing else.
 *
 * Two are deliberately not rendered as buttons. `accept` cannot be honoured yet — a stranger
 * cannot even read this page — and drawing it would be a promise the server breaks. `share`
 * needs a clipboard, which needs a client component; the link is printed instead, which works
 * everywhere and can be long-pressed on a phone.
 */
function Actions({
  bet,
  role,
  actions,
  code,
}: {
  readonly bet: Bet;
  readonly role: ViewerRole;
  readonly actions: readonly BetAction[];
  readonly code: string;
}) {
  const has = (action: BetAction) => actions.includes(action);
  const claimantIsCreator = bet.claim?.by === 'creator';
  const creatorName = bet.creator.displayName ?? 'they';
  const opponentName = bet.opponent?.displayName ?? 'the other side';

  if (actions.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
      {has('submitClaim') ? (
        <Panel>
          <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
            {ACTION_LABEL.submitClaim.toUpperCase()}
          </span>
          <OutcomeButton
            code={code}
            action={claimOutcome}
            outcome={role === 'creator' ? 'creator_wins' : 'opponent_wins'}
          >
            I won it
          </OutcomeButton>
          <OutcomeButton
            code={code}
            action={claimOutcome}
            outcome={role === 'creator' ? 'opponent_wins' : 'creator_wins'}
          >
            They won it
          </OutcomeButton>
          <OutcomeButton code={code} action={claimOutcome} outcome="draw">
            Nobody won — call it a draw
          </OutcomeButton>
        </Panel>
      ) : null}

      {has('confirmClaim') || has('disputeClaim') ? (
        <Panel>
          <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>
            {TRUST_COPY.disputing}
          </span>
          {has('confirmClaim') ? (
            <form action={agreeWithClaim}>
              <input type="hidden" name="code" value={code} />
              <PillButton type="submit" fullWidth icon="check">
                {ACTION_LABEL.confirmClaim}
              </PillButton>
            </form>
          ) : null}
          {has('disputeClaim') ? (
            <form action={disagreeWithClaim}>
              <input type="hidden" name="code" value={code} />
              <PillButton type="submit" variant="secondary" fullWidth>
                {ACTION_LABEL.disputeClaim}
              </PillButton>
            </form>
          ) : null}
        </Panel>
      ) : null}

      {has('refereeResolve') ? (
        <Panel>
          <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
            {ACTION_LABEL.refereeResolve.toUpperCase()}
          </span>
          <OutcomeButton code={code} action={refereeRuling} outcome="creator_wins">
            {creatorName} won it
          </OutcomeButton>
          <OutcomeButton code={code} action={refereeRuling} outcome="opponent_wins">
            {opponentName} won it
          </OutcomeButton>
          <OutcomeButton code={code} action={refereeRuling} outcome="draw">
            Neither of them — a draw
          </OutcomeButton>
        </Panel>
      ) : null}

      {(['settleUncontested', 'refundExpired', 'expireUnaccepted'] as const)
        .filter(has)
        .map((action) => (
          <form key={action} action={settleByTimeout}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="action" value={action} />
            <PillButton type="submit" fullWidth>
              {ACTION_LABEL[action]}
            </PillButton>
          </form>
        ))}

      {has('cancel') ? (
        <form action={cancelBet}>
          <input type="hidden" name="code" value={code} />
          <PillButton type="submit" variant="ghost" fullWidth>
            {ACTION_LABEL.cancel}
          </PillButton>
        </form>
      ) : null}

      {has('share') ? (
        <Panel>
          <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
            SEND THIS TO {claimantIsCreator ? 'THEM' : 'THE OTHER SIDE'}
          </span>
          <code
            style={{
              ...typeStyle('bodySm'),
              color: color.ink,
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {betUrl(code)}
          </code>
          <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>
            {TRUST_COPY.linkWarning}
          </span>
        </Panel>
      ) : null}
    </div>
  );
}

/** What the money did, once it is no longer a forecast. */
function SettledFigures({ bet }: { readonly bet: Bet }) {
  const outcome = bet.outcome;
  if (!outcome) return null;

  const settlement = calculateSettlement({
    format: bet.format,
    stakeCreator: bet.stakeCreator,
    stakeOpponent: bet.stakeOpponent,
    feeBps: bet.feeBps,
    outcome,
    ruledByReferee: bet.state === 'resolved' && bet.dispute !== null,
  });
  if (!settlement.ok) return null;
  const { toCreator, toOpponent, fee, toReferee } = settlement.value;

  const rows: readonly (readonly [string, string])[] = [
    [bet.creator.displayName ?? 'Creator', `${formatUsdc(toCreator)} USDC`],
    [bet.opponent?.displayName ?? 'Other side', `${formatUsdc(toOpponent)} USDC`],
    ...(toReferee > 0n
      ? ([[bet.referee?.displayName ?? 'Referee', `${formatUsdc(toReferee)} USDC`]] as const)
      : []),
    ['Fee', `${formatUsdc(fee)} USDC`],
  ];

  return (
    <Panel>
      <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>WHO GOT WHAT</span>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>{label}</span>
          <span style={{ ...typeStyle('bodySm'), color: color.ink }}>{value}</span>
        </div>
      ))}
    </Panel>
  );
}

/**
 * The code is deliberately absent from the wall. Printing "BET #ZZZZZZZZ" above "sign in"
 * would confirm the shape of a code a stranger just guessed; the wall says the same thing for
 * every eight-character string, real or not.
 */
function AnonymousWall() {
  return (
    <Shell>
      <SignInWall title="Sign in to see this bet.">
        A bet is only readable by the people on it, so we have to know which of them you are.
      </SignInWall>
    </Shell>
  );
}

export default async function BetPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // The shape is checked before the database is asked: a short code is exactly eight base58
  // characters, and anything else is a probe, not a typo.
  if (!isShortCode(code)) notFound();

  const privyDid = await currentPrivyDid();
  if (!privyDid) return <AnonymousWall />;

  const found = await getBetByShortCode(privyDid, code);
  // NOT_FOUND covers both "no such bet" and "not yours", on purpose — see the note at the top.
  if (!found.ok) notFound();

  // The role comes back with the bet: it is what decided we were allowed to answer at all, so
  // recomputing it here would be a second opinion nobody asked for.
  const { bet, role } = found.value;
  const now = nowSeconds();
  const actions = allowedActions(bet, role, now);
  const pot = addUsdc(bet.stakeCreator, bet.stakeOpponent);
  const settled = bet.state === 'resolved' || bet.state === 'refunded';

  return (
    <Shell>
      {/*
       * No heading above the card. The card already carries the code and the state, and a
       * page that prints both twice reads as a mistake — which it was.
       */}
      <BetCard
        id={code}
        state={bet.state}
        format={bet.format}
        terms={bet.terms}
        rows={standardRows({
          pot,
          deadlineLabel: formatDeadlineShort(bet.deadlineSeconds),
          decidedBy: bet.referee?.displayName ?? 'Both of you',
          refereeConfirmed: bet.referee ? isRefereeConfirmed(bet.referee) : null,
          ...(isMockChain ? { escrowLabel: 'Simulated' } : {}),
        })}
      />

      <p style={{ margin: 0, ...typeStyle('body'), color: color.ink }}>
        {whatHappensNext(bet, role, now)}
      </p>

      {settled ? (
        <SettledFigures bet={bet} />
      ) : role === 'creator' || role === 'opponent' ? (
        <PayoutBreakdown
          format={bet.format}
          stake={bet.stakeCreator}
          feeBps={bet.feeBps}
          perspective={role}
        />
      ) : null}

      <Actions bet={bet} role={role} actions={actions} code={code} />

      <p style={{ margin: 0, ...typeStyle('micro'), color: color.inkFaint }}>
        {STATE_COPY[bet.state]} · {TRUST_COPY.fee}
      </p>
    </Shell>
  );
}
