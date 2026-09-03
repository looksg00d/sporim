import type { CSSProperties, ReactNode } from 'react';
import { color, radius, space, typeStyle } from '../tokens';

export interface CardProps {
  readonly children: ReactNode;
  readonly padded?: boolean;
  readonly style?: CSSProperties;
}

/** Surface + 1px hairline. Depth in this system is a border, not a shadow. */
export function Card({ children, padded = true, style }: CardProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: color.surface,
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
        padding: padded ? space.md : 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface StampProps {
  readonly children: ReactNode;
  readonly rotate?: number;
  readonly tone?: 'accent' | 'loss';
  readonly style?: CSSProperties;
}

/**
 * The rubber stamp. Only ever carries a rule of the product — NO BACKING OUT,
 * REFUNDED, PAID — and it is the one element allowed to sit at an angle.
 */
export function Stamp({ children, rotate = 8, tone = 'accent', style }: StampProps) {
  const stroke = tone === 'accent' ? color.accent : color.loss;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        transform: `rotate(${rotate}deg)`,
        border: `3px solid ${stroke}`,
        color: stroke,
        borderRadius: radius.xs,
        padding: `${space.xxs + 2}px ${space.sm}px`,
        opacity: 0.95,
        ...typeStyle('headingMd'),
        textTransform: 'uppercase',
        letterSpacing: '1px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface ProgressDotsProps {
  readonly total: number;
  readonly current: number;
  readonly label?: string;
}

/** Five pills instead of a "Step 3 of 5" counter. */
export function ProgressDots({ total, current, label = 'Progress' }: ProgressDotsProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      style={{ display: 'flex', justifyContent: 'center', gap: space.xs }}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          style={{
            width: 22,
            height: 4,
            borderRadius: radius.pill,
            background: index < current ? color.accent : color.hairlineStrong,
          }}
        />
      ))}
    </div>
  );
}
