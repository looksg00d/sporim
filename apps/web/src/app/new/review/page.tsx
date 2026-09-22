'use client';

import {
  TRUST_COPY,
  formatUsdc,
  isSignatureMeaningful,
  toSubmittable,
  type Signature,
} from '@sporim/domain';
import {
  BetCard,
  ContractSentence,
  PayoutBreakdown,
  PillButton,
  ProofChips,
  SignatureMark,
  SignaturePad,
  color,
  radius,
  space,
  standardRows,
  typeStyle,
} from '@sporim/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraft } from '@/features/draft/DraftProvider';
import { writeHandoff } from '@/features/draft/handoff';
import { StepScreen } from '@/features/draft/StepScreen';
import { track } from '@/lib/analytics';
import { isMockChain } from '@/lib/env';
import { formatDeadlineLong, formatDeadlineShort } from '@/lib/time';
import { createFakeWallet } from '@/features/wallet/fake';
import { createServerWallet } from '@/features/wallet/server';
import { WALLET_ERROR_COPY, toWalletError } from '@/features/wallet/port';

/**
 * S5 — the signature, and the only place in the wizard that asks who you are.
 *
 * Signing replaces the press-and-hold that used to live here. Both are deliberate friction,
 * but only one leaves something behind: the scrawl goes onto the bet card and into the share
 * image, which is the whole growth loop. `HoldButton` is not retired — it is the right
 * control for the irreversible actions in M2/M3 (claim a win, open a dispute, force a
 * refund), which need friction without ceremony.
 *
 * `toSubmittable` is the only gate, and it refuses an unsigned draft outright, so no amount
 * of clicking here can submit one. The server runs the very same gate again, on the same
 * draft, against its own clock.
 *
 * ## Why the login is here and not on step one
 *
 * Nothing before this button needs an account. Somebody who arrived from a reel can write the
 * terms, pick the stake, set the deadline and name a referee without meeting a sign-in
 * screen — and by the time they reach one they have spent two minutes on something they
 * want. A wall on step one is a wall in front of strangers.
 *
 * The price of putting it here is that the draft has to survive a login, and a login is
 * exactly when a browser is most likely to hand somebody a different tab than the one they
 * started in. `handoff.ts` is the answer; this screen writes the hand-over just before it
 * asks, and resumes the moment a session appears.
 */

/**
 * Stands in while the user has not signed yet, so the card and the sentence can be rendered
 * before a signature exists. It never reaches the wallet — `commit` uses the real
 * `submittable`, which refuses an unsigned draft.
 *
 * It must itself pass `isSignatureMeaningful`, or this preview fails and the whole screen
 * renders blank — which is exactly what a one-character placeholder did.
 */
const PLACEHOLDER_SIGNATURE: Signature = { kind: 'typed', name: 'unsigned preview' };

/**
 * The test hook, read at click time rather than through `useSearchParams`, which would force
 * the whole review screen behind a Suspense boundary.
 *
 * `?mockFail=CODE` covers the error copy; `?mock=ok` covers the success path. Both mean the
 * same thing to this screen — talk to the fake wallet, not the server — and the success half
 * is not a convenience: a real lock-in needs a real session, which a headless browser has no
 * way to obtain. Keeping it explicit in the URL is what stops a test from *looking* like it
 * exercised the server when it did not.
 */
interface MockRequest {
  readonly requested: boolean;
  readonly failWith: string | null;
}

function readMock(): MockRequest {
  if (typeof window === 'undefined') return { requested: false, failWith: null };
  const params = new URLSearchParams(window.location.search);
  const failWith = params.get('mockFail');
  return { requested: failWith !== null || params.has('mock'), failWith };
}

/** What the button is doing. One value, because the three states are mutually exclusive. */
type CommitIntent = 'idle' | 'signing-in' | 'submitting';

export default function ReviewStepPage() {
  const { draft, dispatch, nowSeconds } = useDraft();
  const { configured, ready: authReady, authenticated, login } = useAuth();
  const router = useRouter();
  const [intent, setIntent] = useState<CommitIntent>('idle');
  const [error, setError] = useState<string | null>(null);
  /**
   * Two guards that state cannot give. `busy` closes the gap between a click and the
   * re-render that disables the button; the server is idempotent by the commitment hash, so a
   * double tap costs a round trip rather than a second bet, but not making the round trip is
   * better. `askedToSignIn` stops one intent from opening the modal twice.
   */
  const busy = useRef(false);
  const askedToSignIn = useRef(false);

  const submittable = toSubmittable(draft, nowSeconds);
  const signed = isSignatureMeaningful(draft.signature);
  const pending = intent === 'submitting';

  const setSignature = useCallback(
    (signature: Signature | null) => dispatch({ type: 'setSignature', signature }),
    [dispatch],
  );

  const submit = useCallback(async () => {
    if (!submittable.ok || busy.current) return;
    busy.current = true;
    setIntent('submitting');
    setError(null);
    track({ name: 'bet_create_submitted', format: submittable.value.format });

    const mock = readMock();
    try {
      // The mock is the test hook and nothing else: every branch of `WALLET_ERROR_COPY` has
      // to be reachable without an account or a database behind it. Without `?mock`/
      // `?mockFail` in the URL this is the real server action.
      const wallet = mock.requested
        ? createFakeWallet({ failWith: mock.failWith })
        : createServerWallet();
      const created = await wallet.createBet(submittable.value);
      track({ name: 'bet_create_succeeded', format: submittable.value.format });
      // The draft is cleared by /new/done, not here: emptying it while this screen is still
      // mounted would fail its own step guard and bounce the user back to step one.
      router.push(`/new/done?code=${created.shortCode}`);
    } catch (cause) {
      const walletError = toWalletError(cause);
      track({ name: 'bet_create_failed', code: walletError.code });
      setError(WALLET_ERROR_COPY[walletError.code]);
      setIntent('idle');
      busy.current = false;
    }
  }, [submittable, router]);

  const commit = useCallback(() => {
    if (!submittable.ok || intent !== 'idle') return;

    // The test hook short-circuits the gate, deliberately. A simulated wallet failure is
    // about the sentence the user reads; making it depend on a real session would make the
    // copy untestable rather than the test more honest.
    if (readMock().requested || authenticated) {
      void submit();
      return;
    }

    // Written *before* the modal opens, because from here on the browser may decide this tab
    // is not the one the person comes back to.
    if (typeof window !== 'undefined') writeHandoff(window.localStorage, draft);
    track({ name: 'login_required' });
    setError(null);
    setIntent('signing-in');
    // If Privy has not finished booting, the effect below opens the modal the moment it has.
    if (authReady) {
      askedToSignIn.current = true;
      login();
    }
  }, [submittable, intent, authenticated, authReady, login, draft, submit]);

  /**
   * The other half of the round trip: submit as soon as there is a session.
   *
   * It watches the fact rather than the callback, so both ways back work — the modal
   * completing in this tab, and this tab being re-rendered with a session that was
   * established somewhere else entirely.
   */
  useEffect(() => {
    if (intent !== 'signing-in' || !authReady) return;
    if (authenticated) {
      setIntent('idle');
      void submit();
      return;
    }
    if (!askedToSignIn.current) {
      askedToSignIn.current = true;
      login();
    }
  }, [intent, authReady, authenticated, login, submit]);

  // Being unsigned is the expected state of this screen, not a failure worth reporting.
  if (!submittable.ok && submittable.error.code !== 'UNSIGNED') {
    return (
      <StepScreen step="review" canContinue={false} blockedReason="Something above needs fixing.">
        <div role="alert" style={{ ...typeStyle('body'), color: color.loss }}>
          {submittable.error.code === 'INVALID'
            ? submittable.error.issues.join(' ')
            : `Step "${submittable.error.step}" is not finished.`}
        </div>
      </StepScreen>
    );
  }

  const preview = toSubmittable({ ...draft, signature: PLACEHOLDER_SIGNATURE }, nowSeconds);
  if (!preview.ok) return null;
  const values = preview.value;
  const refereeNamed = Boolean(values.refereeRef);

  /**
   * The referee decides in both modes — under mutual confirmation they are the tiebreaker
   * rather than the first port of call — so the card names them either way. It has to: the
   * "not yet accepted" mark hangs off this row, and a row reading "Both of you" alone would
   * hide the fact that the fallback has agreed to nothing.
   */
  const decidedBy = refereeNamed
    ? values.decisionMode === 'referee'
      ? (values.refereeRef ?? 'a referee')
      : `Both of you, then ${values.refereeRef}`
    : 'Both of you';

  /**
   * The button says what the next tap actually does. Somebody who has not signed in is about
   * to be asked to, and being told that a moment before the modal appears is the difference
   * between a step and an interruption — especially in an in-app browser, where a modal
   * arriving unannounced reads as something going wrong.
   */
  const needsSignIn = !authenticated && !pending;
  const commitLabel = pending
    ? 'Locking in…'
    : intent === 'signing-in'
      ? 'Waiting for sign-in…'
      : needsSignIn
        ? 'Sign in & lock it in'
        : "I'm committed";

  const footnote = error
    ? error
    : !signed
      ? 'Sign above to lock it in.'
      : configured
        ? needsSignIn
          ? 'You sign in on the next screen. Your bet is kept either way.'
          : TRUST_COPY.noBackingOut
        : 'Sign-in is not configured on this deployment, so nothing can be locked in yet.';

  return (
    <StepScreen
      step="review"
      subtitle="Read it once more, then sign. After this it cannot be edited or cancelled."
      canContinue={signed}
      footer={
        <>
          <PillButton
            fullWidth
            icon="lock"
            disabled={!signed || intent !== 'idle' || !configured}
            onClick={commit}
            data-testid="commit"
          >
            {commitLabel}
          </PillButton>
          <p
            role={error ? 'alert' : undefined}
            aria-live="polite"
            style={{
              margin: 0,
              minHeight: 18,
              textAlign: 'center',
              ...typeStyle('micro'),
              color: error ? color.loss : color.inkFaint,
            }}
          >
            {footnote}
          </p>
        </>
      }
    >
      <div
        style={{
          padding: space.md,
          borderRadius: radius.md,
          border: `1px solid ${color.hairline}`,
          background: color.surface,
        }}
      >
        <ContractSentence
          input={{
            format: values.format,
            terms: values.terms,
            stake: values.stake,
            deadlineLabel: formatDeadlineLong(values.deadlineSeconds),
            decisionMode: values.decisionMode,
            refereeName: values.refereeRef,
            beneficiaryName: values.beneficiaryRef,
            feeBps: values.feeBps,
          }}
        />
      </div>

      {refereeNamed ? (
        <div
          role="note"
          data-testid="referee-unconfirmed"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: space.xxs,
            padding: space.md,
            borderRadius: radius.md,
            border: `1px solid ${color.loss}`,
            background: color.surface,
          }}
        >
          <span style={{ ...typeStyle('labelCapsSm'), color: color.loss }}>
            {(values.refereeRef ?? 'YOUR REFEREE').toUpperCase()} HASN&apos;T BEEN ASKED YET
          </span>
          <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>
            {TRUST_COPY.refereeUnconfirmed} Send them the referee link after this and they can take
            the role.
          </span>
        </div>
      ) : null}

      <SignaturePad value={draft.signature} onChange={setSignature} />

      <p style={{ margin: 0, ...typeStyle('micro'), color: color.inkFaint }}>
        Your signature goes on the card you send. It is a commitment between the two of you, not a
        legal document.
      </p>

      <BetCard
        id=""
        state="draft"
        format={values.format}
        terms={values.terms}
        sides={[
          { label: 'You', value: `${formatUsdc(values.stake)} USDC`, tone: 'mine' },
          {
            label: 'Them',
            value: values.format === 'bet' ? `${formatUsdc(values.stake)} USDC` : 'No stake',
          },
        ]}
        rows={standardRows({
          pot: values.stake,
          deadlineLabel: formatDeadlineShort(values.deadlineSeconds),
          decidedBy,
          escrowLabel: isMockChain ? 'Simulated' : 'Devnet escrow',
          // Always `false` when a referee is named, and that is not a placeholder: nobody has
          // been asked yet. They are asked by the link this screen's submission mints, and
          // until they open it their silence in a dispute refunds instead of deciding.
          refereeConfirmed: refereeNamed ? false : null,
        })}
      >
        {draft.signature && signed ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: space.xxs,
              borderTop: `1px dashed ${color.hairlineStrong}`,
              paddingTop: space.sm,
            }}
          >
            <span style={{ ...typeStyle('labelCapsSm'), color: color.inkFaint }}>SIGNED</span>
            <SignatureMark signature={draft.signature} height={44} stroke={color.accent} />
          </div>
        ) : null}
      </BetCard>

      <PayoutBreakdown format={values.format} stake={values.stake} feeBps={values.feeBps} />

      <ProofChips />
    </StepScreen>
  );
}
