import { usdc } from '@sporim/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BetCard, standardRows } from './BetCard';

/**
 * The card is where both parties learn what they have agreed to, so the assertions here are
 * about what it must never let them believe.
 */
describe('standardRows', () => {
  const base = { pot: usdc(40), deadlineLabel: 'Sun 23:59', decidedBy: 'Anya' } as const;

  function decidedBy(rows: ReturnType<typeof standardRows>) {
    return rows.find((row) => row.label === 'Decided by');
  }

  it('says nothing about acceptance when nobody was named', () => {
    // Mutual confirmation has no referee to accept, and inventing a status for one would be
    // its own small lie.
    expect(decidedBy(standardRows({ ...base, decidedBy: 'Both of you' }))).toEqual({
      label: 'Decided by',
      value: 'Both of you',
    });
  });

  it('marks a referee who has not taken the role, in the loss colour', () => {
    // Until they do, a disagreement after the deadline refunds both sides — so a card that
    // named them without this would be promising a referee that does not exist.
    const row = decidedBy(standardRows({ ...base, refereeConfirmed: false }));
    expect(row?.value).toBe('Anya · not yet accepted');
    expect(row?.tone).toBe('loss');
  });

  it('marks one who has, quietly', () => {
    const row = decidedBy(standardRows({ ...base, refereeConfirmed: true }));
    expect(row?.value).toBe('Anya · accepted');
    expect(row?.tone).toBeUndefined();
  });
});

describe('BetCard', () => {
  it('carries the referee status onto the card itself', () => {
    render(
      <BetCard
        id="0F2A"
        state="active"
        terms="You won't run 10 km by Sunday."
        rows={standardRows({
          pot: usdc(40),
          deadlineLabel: 'Sun 23:59',
          decidedBy: 'Anya',
          refereeConfirmed: false,
        })}
      />,
    );
    expect(screen.getByText('Anya · not yet accepted')).toBeInTheDocument();
  });
});
