'use client';

import { FORMAT_COPY, type BetFormat } from '@sporim/domain';
import { color, radius, space, typeStyle } from '../tokens';

export interface FormatCardProps {
  readonly format: BetFormat;
  readonly selected: boolean;
  readonly onSelect: (format: BetFormat) => void;
}

/** One of the three ways to put money on something. */
export function FormatCard({ format, selected, onSelect }: FormatCardProps) {
  const copy = FORMAT_COPY[format];
  return (
    <button
      type="button"
      className="sporim-focusable"
      aria-pressed={selected}
      onClick={() => onSelect(format)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: space.xxs + 2,
        textAlign: 'left',
        width: '100%',
        padding: space.md,
        borderRadius: radius.md,
        border: `1px solid ${selected ? color.accent : color.hairline}`,
        background: selected ? color.surfaceRaised : color.surface,
        color: color.ink,
        cursor: 'pointer',
      }}
    >
      <span style={{ ...typeStyle('headingMd'), color: selected ? color.accent : color.ink }}>
        {copy.label}
      </span>
      <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>{copy.who}</span>
      <span style={{ ...typeStyle('micro'), color: color.inkFaint }}>{copy.onFail}</span>
    </button>
  );
}
