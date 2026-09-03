import { STATE_COPY, TRUST_COPY, type BetState } from '@sporim/domain';
import type { CSSProperties, ReactNode } from 'react';
import { color, radius, space, typeStyle } from '../tokens';
import { Icon } from '../primitives/Icon';
import { ProgressDots } from '../primitives/Surface';

/** Small state pill for lists and headers. */
export function StateChip({ state }: { readonly state: BetState }) {
  const live = state === 'active' || state === 'resolved';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space.xxs + 2,
        padding: `${space.xxs}px ${space.sm}px`,
        borderRadius: radius.pill,
        background: live ? color.accent : color.surfaceRaised,
        color: live ? color.onAccent : color.inkSecondary,
        ...typeStyle('labelCapsSm'),
        textTransform: 'uppercase',
      }}
    >
      {STATE_COPY[state]}
    </span>
  );
}

/** Non-dismissible: nobody should mistake test money for real money. */
export function DevnetBanner({ visible = true }: { readonly visible?: boolean }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
        minHeight: 32,
        background: color.loss,
        color: color.onAccent,
        ...typeStyle('labelCapsSm'),
        textTransform: 'uppercase',
      }}
    >
      <Icon name="clock" size={13} strokeWidth={2.4} />
      {TRUST_COPY.devnet}
    </div>
  );
}

/** Three facts that answer the top objections, shown wherever there is room. */
export function ProofChips({ items }: { readonly items?: readonly string[] }) {
  const chips = items ?? [TRUST_COPY.fee, TRUST_COPY.escrow, TRUST_COPY.refund];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
      {chips.map((chip) => (
        <div key={chip} style={{ display: 'flex', alignItems: 'flex-start', gap: space.xs }}>
          <Icon
            name="check"
            size={14}
            strokeWidth={2.4}
            color={color.accent}
            style={{ marginTop: 3 }}
          />
          <span style={{ ...typeStyle('bodySm'), color: color.inkSecondary }}>{chip}</span>
        </div>
      ))}
    </div>
  );
}

export interface WizardShellProps {
  readonly step: number;
  readonly totalSteps?: number;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly style?: CSSProperties;
}

/**
 * The frame every create step sits in: dots on top, title, body, action pinned to the
 * bottom. The top 64px stay empty — the real status bar lives there.
 */
export function WizardShell({
  step,
  totalSteps = 5,
  title,
  subtitle,
  children,
  footer,
  style,
}: WizardShellProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.xl,
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: `64px ${space.lg}px ${space.xxl}px`,
        background: color.canvas,
        ...style,
      }}
    >
      <ProgressDots total={totalSteps} current={step} label={`Step ${step} of ${totalSteps}`} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        <h1 style={{ margin: 0, ...typeStyle('displayMd'), color: color.ink, textWrap: 'pretty' }}>
          {title}
        </h1>
        {subtitle ? (
          <p style={{ margin: 0, ...typeStyle('body'), color: color.inkSecondary }}>{subtitle}</p>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>{children}</div>

      <div style={{ flexGrow: 1 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm - 2 }}>{footer}</div>
    </div>
  );
}
