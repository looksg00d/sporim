import { calculateSettlement, FEE_BPS, formatUsdc, usdc, ZERO_USDC } from '@sporim/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BetCard, standardRows } from './BetCard';
import { PayoutBreakdown } from './PayoutBreakdown';

describe('PayoutBreakdown', () => {
  it('shows exactly what calculateSettlement returns — never its own arithmetic', () => {
    const stake = usdc(20);
    const expected = calculateSettlement({
      format: 'bet',
      stakeCreator: stake,
      stakeOpponent: stake,
      feeBps: FEE_BPS,
      outcome: 'creator_wins',
    });
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;

    render(<PayoutBreakdown format="bet" stake={stake} feeBps={FEE_BPS} />);

    expect(screen.getByText(`${formatUsdc(expected.value.pot)} USDC`)).toBeInTheDocument();
    expect(screen.getByText(`${formatUsdc(expected.value.fee)} USDC`)).toBeInTheDocument();
    // Net gain on a $20/$20 bet is the pot minus the fee minus your own stake.
    expect(screen.getByText('+19.40 USDC')).toBeInTheDocument();
    expect(screen.getByText('−20 USDC')).toBeInTheDocument();
  });

  it('tells a one-sided target they put in no stake — not that they risk nothing', () => {
    render(
      <PayoutBreakdown format="commit" stake={usdc(20)} feeBps={FEE_BPS} perspective="opponent" />,
    );
    /*
     * With the dispute bond gone (2026-09-04) "you risk nothing" is no longer *false* for a
     * Commit beneficiary — they really do put in nothing. It stays banned anyway, for a
     * different and more durable reason: it is a blanket promise, this component also renders
     * Bet, and a phrase that is true on one screen and false on the next is worse than one
     * that is merely vague. "You staked nothing" says the same thing and stays true.
     */
    expect(screen.getByText('You staked nothing')).toBeInTheDocument();
    expect(screen.queryByText(/risk nothing/i)).not.toBeInTheDocument();
  });

  it('shows a kept Commit costing no fee', () => {
    render(<PayoutBreakdown format="commit" stake={usdc(50)} feeBps={FEE_BPS} />);
    expect(screen.getByText('Fee 3%')).toBeInTheDocument();
    expect(screen.getByText('0 USDC')).toBeInTheDocument();
  });

  it('reports a bad stake instead of rendering nonsense', () => {
    render(<PayoutBreakdown format="bet" stake={ZERO_USDC} feeBps={FEE_BPS} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Check the stake.');
  });
});

describe('BetCard', () => {
  const props = {
    id: '0001',
    terms: "@sasha won't run 10 km before Sunday.",
    sides: [
      { label: '@dima says', value: "Won't.", tone: 'costly' as const },
      { label: 'You say', value: 'Will.', tone: 'mine' as const },
    ],
    rows: standardRows({ pot: usdc(40), deadlineLabel: 'Sun 23:59', decidedBy: 'Both confirm' }),
  };

  it('renders band, terms, sides and receipt rows in that order', () => {
    render(<BetCard {...props} state="active" />);
    expect(screen.getByText('BET #0001')).toBeInTheDocument();
    expect(screen.getByText('LOCKED IN')).toBeInTheDocument();
    expect(screen.getByText(props.terms)).toBeInTheDocument();
    expect(screen.getByText('@DIMA SAYS')).toBeInTheDocument();
    expect(screen.getByText('40 USDC')).toBeInTheDocument();
    expect(screen.getByText('Sun 23:59')).toBeInTheDocument();
  });

  it('labels each state on the band', () => {
    const { rerender } = render(<BetCard {...props} state="open" />);
    expect(screen.getByText('WAITING')).toBeInTheDocument();
    rerender(<BetCard {...props} state="refunded" />);
    expect(screen.getByText('REFUNDED')).toBeInTheDocument();
    rerender(<BetCard {...props} state="disputed" />);
    expect(screen.getByText('DISPUTED')).toBeInTheDocument();
  });

  it('works with no sides and no rows — the OG fallback case', () => {
    render(<BetCard id="0002" state="open" terms="Just the terms." />);
    expect(screen.getByText('Just the terms.')).toBeInTheDocument();
  });

  it('adds the escrow row only when there is one', () => {
    const withEscrow = standardRows({
      pot: usdc(40),
      deadlineLabel: 'Sun 23:59',
      decidedBy: 'Both confirm',
      escrowLabel: 'Solana · 5Kz…9fQ',
    });
    expect(withEscrow).toHaveLength(4);
    expect(standardRows({ pot: usdc(40), deadlineLabel: 'x', decidedBy: 'y' })).toHaveLength(3);
  });
});
