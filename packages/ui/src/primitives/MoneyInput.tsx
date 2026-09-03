'use client';

import type { CSSProperties } from 'react';
import { STAKE_MAX_DECIMALS } from '@sporim/domain';
import { color, control, radius, space, typeStyle } from '../tokens';

/**
 * Rejects at the keystroke, not on submit: no `e`, no sign, no comma, no third decimal.
 * The user should never be able to type something the schema will refuse.
 */
export function sanitizeMoneyInput(raw: string, maxDecimals = STAKE_MAX_DECIMALS): string {
  const digitsAndDots = raw.replace(/[^0-9.]/g, '');
  const [whole = '', ...rest] = digitsAndDots.split('.');
  const clampedWhole = whole.slice(0, 9);
  if (rest.length === 0) return clampedWhole;
  // Collapse any extra dots the user pasted, then clamp the fraction.
  const fraction = rest.join('').slice(0, maxDecimals);
  return `${clampedWhole}.${fraction}`;
}

export interface MoneyInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly id?: string;
  readonly placeholder?: string;
  readonly error?: string | undefined;
  readonly autoFocus?: boolean;
  readonly style?: CSSProperties;
}

export function MoneyInput({
  value,
  onChange,
  label,
  id = 'sporim-money-input',
  placeholder = '0',
  error,
  autoFocus = false,
  style,
}: MoneyInputProps) {
  const errorId = `${id}-error`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs, ...style }}>
      <label
        htmlFor={id}
        style={{
          ...typeStyle('labelCapsSm'),
          letterSpacing: '1.8px',
          textTransform: 'uppercase',
          color: color.inkSecondary,
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          id={id}
          className="sporim-input sporim-focusable"
          // `inputMode` gives phones the numeric pad; `type=text` keeps our sanitizer in charge.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(sanitizeMoneyInput(event.target.value))}
          onKeyDown={(event) => {
            // Belt and braces: these never produce a valid amount.
            if (['e', 'E', '+', '-', ','].includes(event.key)) event.preventDefault();
          }}
          style={{
            flexGrow: 1,
            minHeight: control.inputHeight,
            padding: `0 ${space.xxl + space.md}px 0 ${space.md}px`,
            borderRadius: radius.sm,
            border: `1px solid ${error ? color.loss : color.hairlineStrong}`,
            background: color.surface,
            color: color.ink,
            ...typeStyle('value'),
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: space.md,
            ...typeStyle('bodySm'),
            color: color.inkFaint,
            pointerEvents: 'none',
          }}
        >
          USDC
        </span>
      </div>
      {error ? (
        <span id={errorId} role="alert" style={{ ...typeStyle('micro'), color: color.loss }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
