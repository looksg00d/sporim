import type { CSSProperties, ReactNode } from 'react';
import { formatUsdc, type BetFormat, type BetState, type UsdcAmount } from '@sporim/domain';
import { color, radius, space, typeStyle } from '../tokens';
import { Icon } from '../primitives/Icon';

/**
 * The signature component: band → terms → sides → receipt rows, in that order,
 * everywhere a bet appears (screen, share card, OG image).
 *
 * Deliberately inline-styled with flexbox only, because this exact tree is also
 * rendered by satori for `/b/[id]/opengraph-image` — no CSS classes, no grid,
 * no custom properties survive that renderer.
 */

export interface BetSide {
  readonly label: string;
  readonly value: string;
  /** `mine` gets the accent treatment; `costly` marks the stance that would cost the viewer money. */
  readonly tone?: 'neutral' | 'mine' | 'costly';
}

export interface ReceiptRow {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'neutral' | 'accent' | 'loss';
}

export interface BetCardProps {
  readonly id: string;
  readonly state: BetState;
  readonly format?: BetFormat;
  readonly terms: string;
  readonly sides?: readonly BetSide[];
  readonly rows?: readonly ReceiptRow[];
  readonly scale?: 'phone' | 'wide';
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}

const STATE_BAND: Record<BetState, string> = {
  draft: 'DRAFT',
  open: 'WAITING',
  active: 'LOCKED IN',
  claimed: 'CLAIMED',
  disputed: 'DISPUTED',
  resolved: 'SETTLED',
  refunded: 'REFUNDED',
  cancelled: 'CANCELLED',
};

/** Only a live, funded bet earns the acid band; everything else is quiet. */
function bandColors(state: BetState): { background: string; color: string } {
  if (state === 'active' || state === 'resolved')
    return { background: color.accent, color: color.onAccent };
  if (state === 'disputed') return { background: color.loss, color: color.onAccent };
  return { background: color.surfaceRaised, color: color.inkSecondary };
}

function sideColor(tone: BetSide['tone']): string {
  if (tone === 'mine') return color.accent;
  if (tone === 'costly') return color.loss;
  return color.ink;
}

function rowColor(tone: ReceiptRow['tone']): string {
  if (tone === 'accent') return color.accent;
  if (tone === 'loss') return color.loss;
  return color.ink;
}

export function BetCard({
  id,
  state,
  terms,
  sides = [],
  rows = [],
  scale = 'phone',
  style,
  children,
}: BetCardProps) {
  const wide = scale === 'wide';
  const band = bandColors(state);
  const termsType = typeStyle(wide ? 'headingLg' : 'headingMd');
  const labelType = typeStyle('labelCapsSm');
  const rowType = typeStyle('bodySm');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: color.surface,
        border: `1px solid ${color.hairline}`,
        borderRadius: wide ? radius.xl : radius.lg,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* 1 — band: who this is and what state it's in */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: band.background,
          color: band.color,
          padding: `${space.sm - 1}px ${wide ? space.lg : space.md}px`,
          ...labelType,
          letterSpacing: '1.8px',
        }}
      >
        {/* A draft has no number yet; "BET #DRAFT" reads like a typo. */}
        <span>{id ? `BET #${id}` : 'BET'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: space.xxs + 2 }}>
          <Icon
            name={state === 'refunded' || state === 'cancelled' ? 'clock' : 'lock'}
            size={13}
            strokeWidth={2.4}
          />
          <span>{STATE_BAND[state]}</span>
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: wide ? space.xl - 2 : space.md,
          padding: `${wide ? space.xl + 2 : space.lg - 2}px ${wide ? space.lg + 2 : space.md}px`,
        }}
      >
        {/* 2 — the terms are the headline */}
        <div style={{ ...termsType, color: color.ink, textWrap: 'pretty' }}>{terms}</div>

        {/* 3 — sides */}
        {sides.length > 0 ? (
          <div style={{ display: 'flex', gap: space.sm - 2 }}>
            {sides.map((side) => (
              <div
                key={side.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: space.xxs + 2,
                  flexGrow: 1,
                  flexBasis: 0,
                  padding: space.md - 2,
                  borderRadius: radius.md,
                  border: `1px solid ${side.tone === 'mine' ? color.accent : color.hairline}`,
                  background: side.tone === 'mine' ? color.surfaceRaised : 'transparent',
                }}
              >
                <span
                  style={{
                    ...labelType,
                    color: side.tone === 'mine' ? color.accent : color.inkSecondary,
                  }}
                >
                  {side.label.toUpperCase()}
                </span>
                <span style={{ ...typeStyle('value'), color: sideColor(side.tone) }}>
                  {side.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* 4 — receipt rows, under the tear line */}
        {rows.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: space.sm - 3,
              borderTop: `1px dashed ${color.hairlineStrong}`,
              paddingTop: space.md - 2,
            }}
          >
            {rows.map((row) => (
              <div
                key={row.label}
                style={{ display: 'flex', justifyContent: 'space-between', ...rowType }}
              >
                <span style={{ color: color.inkSecondary }}>{row.label}</span>
                <span
                  style={{
                    color: rowColor(row.tone),
                    fontWeight: row.tone === 'accent' ? 600 : 400,
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}

/**
 * Builds the standard receipt rows so every surface shows the same five facts.
 *
 * "Decided by" is the row that can lie. A referee is a name the creator typed until that
 * person opens their own link and takes the role; a card reading "Decided by: Anya" invites
 * both parties to believe somebody will settle this, and if Anya never accepted, a
 * disagreement refunds instead. So the row says which of the two it is — and says it in the
 * loss colour while nobody has agreed to anything.
 */
export function standardRows(input: {
  readonly pot: UsdcAmount;
  readonly deadlineLabel: string;
  readonly decidedBy: string;
  readonly escrowLabel?: string;
  /** `null` when there is no referee to ask: mutual confirmation names nobody. */
  readonly refereeConfirmed?: boolean | null;
}): ReceiptRow[] {
  const confirmed = input.refereeConfirmed ?? null;
  const decidedBy: ReceiptRow =
    confirmed === null
      ? { label: 'Decided by', value: input.decidedBy }
      : confirmed
        ? { label: 'Decided by', value: `${input.decidedBy} · accepted` }
        : { label: 'Decided by', value: `${input.decidedBy} · not yet accepted`, tone: 'loss' };

  const rows: ReceiptRow[] = [
    { label: 'On the line', value: `${formatUsdc(input.pot)} USDC`, tone: 'accent' },
    { label: 'Deadline', value: input.deadlineLabel },
    decidedBy,
  ];
  return input.escrowLabel ? [...rows, { label: 'Escrow', value: input.escrowLabel }] : rows;
}
