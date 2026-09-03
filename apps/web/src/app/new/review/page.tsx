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
import { useCallback, useState } from 'react';
import { useDraft } from '@/features/draft/DraftProvider';
import { StepScreen } from '@/features/draft/StepScreen';
import { track } from '@/lib/analytics';
import { isMockChain } from '@/lib/env';
import { formatDeadlineLong, formatDeadlineShort } from '@/lib/time';
import { createFakeWallet } from '@/features/wallet/fake';
import { WALLET_ERROR_COPY, toWalletError } from '@/features/wallet/port';

/**
 * S5 — the signature.
 *
 * Signing replaces the press-and-hold that used to live here. Both are deliberate friction,
 * but only one leaves something behind: the scrawl goes onto the bet card and into the share
 * image, which is the whole growth loop. `HoldButton` is not retired — it is the right
 * control for the irreversible actions in M2/M3 (claim a win, open a dispute, force a
 * refund), which need friction without ceremony.
 *
 * `toSubmittable` is the only gate, and it refuses an unsigned draft outright, so no amount
 * of clicking here can submit one.
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

export default function ReviewStepPage() {
  const { draft, dispatch, nowSeconds } = useDraft();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submittable = toSubmittable(draft, nowSeconds);
  const signed = isSignatureMeaningful(draft.signature);

  const setSignature = useCallback(
    (signature: Signature | null) => dispatch({ type: 'setSignature', signature }),
    [dispatch],
  );

  const commit = useCallback(async () => {
    if (!submittable.ok || pending) return;
    setPending(true);
    setError(null);
    track({ name: 'bet_create_submitted', format: submittable.value.format });

    // Read at click time rather than through useSearchParams: this is a test hook, and the
    // hook would force the whole review screen behind a Suspense boundary.
    const failWith =
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('mockFail');

    try {
      const created = await createFakeWallet({ failWith }).createBet(submittable.value);
      track({ name: 'bet_create_succeeded', format: submittable.value.format });
      // The draft is cleared by /new/done, not here: emptying it while this screen is still
      // mounted would fail its own step guard and bounce the user back to step one.
      router.push(`/new/done?code=${created.shortCode}`);
    } catch (cause) {
      const walletError = toWalletError(cause);
      track({ name: 'bet_create_failed', code: walletError.code });
      setError(WALLET_ERROR_COPY[walletError.code]);
      setPending(false);
    }
  }, [submittable, pending, router]);

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
            disabled={!signed || pending}
            onClick={commit}
            data-testid="commit"
          >
            {pending ? 'Locking in…' : "I'm committed"}
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
            {error ?? (signed ? TRUST_COPY.noBackingOut : 'Sign above to lock it in.')}
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
            opponentName: values.opponentRef,
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
            label: values.opponentRef ?? 'Them',
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
