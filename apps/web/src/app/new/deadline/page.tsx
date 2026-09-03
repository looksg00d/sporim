'use client';

import { MIN_DEADLINE_LEAD_SECONDS, TRUST_COPY } from '@sporim/domain';
import { PillButton, color, radius, space, typeStyle } from '@sporim/ui';
import { useState } from 'react';
import { useDraft } from '@/features/draft/DraftProvider';
import { StepScreen } from '@/features/draft/StepScreen';
import { track } from '@/lib/analytics';
import {
  deadlinePresets,
  formatDeadlineLong,
  formatLead,
  fromDatetimeLocalValue,
  timeZoneLabel,
  toDatetimeLocalValue,
} from '@/lib/time';

/**
 * S3 — when it is decided.
 *
 * The timezone is named on screen because the two parties may not share one, and "Sunday
 * midnight" is worth arguing about only if nobody wrote down whose midnight it was.
 */
export default function DeadlineStepPage() {
  const { draft, dispatch, nowSeconds } = useDraft();
  const [customOpen, setCustomOpen] = useState(false);

  const presets = deadlinePresets(nowSeconds);
  const selectedPreset = presets.find((preset) => preset.atSeconds === draft.deadlineSeconds);

  const chosen = draft.deadlineSeconds;
  const tooSoon = chosen !== null && chosen < nowSeconds + MIN_DEADLINE_LEAD_SECONDS;

  function choosePreset(atSeconds: number, id: string) {
    setCustomOpen(false);
    dispatch({ type: 'setDeadline', deadlineSeconds: atSeconds });
    track({ name: 'deadline_selected', preset: id });
  }

  return (
    <StepScreen
      step="deadline"
      subtitle={`All times are ${timeZoneLabel()}.`}
      canContinue={chosen !== null && !tooSoon}
      blockedReason={
        chosen === null
          ? 'Pick a deadline.'
          : tooSoon
            ? 'Give yourselves at least 15 minutes.'
            : undefined
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
        {presets.map((preset) => (
          <PillButton
            key={preset.id}
            variant={selectedPreset?.id === preset.id ? 'primary' : 'secondary'}
            onClick={() => choosePreset(preset.atSeconds, preset.id)}
            style={{ flexGrow: 1, flexBasis: 120, padding: 0 }}
          >
            {preset.label}
          </PillButton>
        ))}
        <PillButton
          variant={customOpen ? 'primary' : 'secondary'}
          onClick={() => {
            setCustomOpen(true);
            track({ name: 'deadline_selected', preset: 'custom' });
          }}
          style={{ flexGrow: 1, flexBasis: 120, padding: 0 }}
        >
          Pick a date
        </PillButton>
      </div>

      {customOpen ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
          <label
            htmlFor="deadline"
            style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}
          >
            DEADLINE
          </label>
          <input
            id="deadline"
            type="datetime-local"
            className="sporim-input sporim-focusable"
            value={chosen === null ? '' : toDatetimeLocalValue(chosen)}
            min={toDatetimeLocalValue(nowSeconds + MIN_DEADLINE_LEAD_SECONDS)}
            onChange={(event) => {
              const parsed = fromDatetimeLocalValue(event.target.value);
              if (parsed !== null) dispatch({ type: 'setDeadline', deadlineSeconds: parsed });
            }}
            style={{
              width: '100%',
              padding: space.md,
              borderRadius: radius.md,
              border: `1px solid ${tooSoon ? color.loss : color.hairlineStrong}`,
              background: color.surface,
              color: color.ink,
              colorScheme: 'dark',
              ...typeStyle('body'),
            }}
          />
        </div>
      ) : null}

      {chosen !== null ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: space.xxs,
            padding: space.md,
            borderRadius: radius.md,
            border: `1px solid ${color.hairline}`,
            background: color.surface,
          }}
        >
          <span style={{ ...typeStyle('value'), color: tooSoon ? color.loss : color.accent }}>
            {formatDeadlineLong(chosen)}
          </span>
          <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>
            {formatLead(nowSeconds, chosen)} · {timeZoneLabel()}
          </span>
        </div>
      ) : null}

      <p style={{ margin: 0, ...typeStyle('bodySm'), color: color.inkSecondary }}>
        {TRUST_COPY.timeline}
      </p>
    </StepScreen>
  );
}
