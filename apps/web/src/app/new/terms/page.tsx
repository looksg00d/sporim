'use client';

import { TERMS_MAX_LENGTH, TERMS_MIN_LENGTH, TERMS_WARN_LENGTH, FORMAT_COPY } from '@sporim/domain';
import { color, radius, space, typeStyle } from '@sporim/ui';
import { useDraft } from '@/features/draft/DraftProvider';
import { StepScreen } from '@/features/draft/StepScreen';

/**
 * S1 — the terms. Everything downstream is arithmetic; this is the only screen where the
 * user writes the thing they are actually arguing about, so it gets the whole screen and
 * a counter that turns before it bites rather than a hard stop at 280.
 */
export default function TermsStepPage() {
  const { draft, dispatch } = useDraft();
  const trimmed = draft.terms.trim();
  const tooShort = trimmed.length < TERMS_MIN_LENGTH;
  const tooLong = trimmed.length > TERMS_MAX_LENGTH;

  const remaining = TERMS_MAX_LENGTH - trimmed.length;
  const counterColor =
    trimmed.length > TERMS_MAX_LENGTH
      ? color.loss
      : trimmed.length >= TERMS_WARN_LENGTH
        ? color.accent
        : color.inkFaint;

  const blockedReason = tooShort
    ? trimmed.length === 0
      ? 'Write what the bet is about.'
      : `${TERMS_MIN_LENGTH - trimmed.length} more characters.`
    : tooLong
      ? `${trimmed.length - TERMS_MAX_LENGTH} characters over.`
      : undefined;

  return (
    <StepScreen
      step="terms"
      subtitle="Write it the way you would say it out loud. Both of you have to agree it happened."
      canContinue={!tooShort && !tooLong}
      blockedReason={blockedReason}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
        <label htmlFor="terms" style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
          THE TERMS
        </label>
        <textarea
          id="terms"
          className="sporim-input sporim-focusable"
          value={draft.terms}
          onChange={(event) => dispatch({ type: 'setTerms', terms: event.target.value })}
          placeholder={FORMAT_COPY.bet.example}
          rows={4}
          // A soft cap: typing past it is allowed and shown, so nothing is silently eaten.
          maxLength={TERMS_MAX_LENGTH + 40}
          autoFocus
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: 128,
            padding: space.md,
            borderRadius: radius.md,
            border: `1px solid ${tooLong ? color.loss : color.hairlineStrong}`,
            background: color.surface,
            color: color.ink,
            ...typeStyle('bodyLg'),
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', ...typeStyle('micro') }}>
          <span style={{ color: color.inkFaint }}>Nobody can edit this once it is locked.</span>
          <span style={{ color: counterColor }} className="sporim-tnum">
            {remaining}
          </span>
        </div>
      </div>
    </StepScreen>
  );
}
