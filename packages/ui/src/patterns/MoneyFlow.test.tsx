import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FEE_BPS, calculateSettlement, formatUsdc, subUsdc, usdc, ZERO_USDC } from '@sporim/domain';
import { MoneyFlow } from './MoneyFlow';

const STAKE = usdc(20);

function settlement(format: 'bet' | 'commit', outcome: 'creator_wins' | 'opponent_wins') {
  const result = calculateSettlement({
    format,
    stakeCreator: STAKE,
    stakeOpponent: format === 'bet' ? STAKE : ZERO_USDC,
    feeBps: FEE_BPS,
    outcome,
  });
  if (!result.ok) throw new Error('fixture is not settleable');
  return result.value;
}

describe('MoneyFlow — the numbers come from the domain', () => {
  it('shows what a winning Bet actually pays, not the pot', () => {
    render(<MoneyFlow format="bet" stake={STAKE} feeBps={FEE_BPS} />);
    const paid = formatUsdc(settlement('bet', 'creator_wins').toCreator, { minDecimals: 2 });
    expect(paid).toBe('39.40'); // 40 pot − 0.60 fee, never the bare 40
    // A symmetric Bet pays the same either way, so the figure appears in both branches.
    expect(screen.getAllByText(`${paid} USDC`)).toHaveLength(2);
  });

  it('shows a kept Commit returning the stake untouched', () => {
    render(<MoneyFlow format="commit" stake={STAKE} feeBps={FEE_BPS} />);
    const returned = formatUsdc(settlement('commit', 'creator_wins').toCreator, { minDecimals: 2 });
    expect(returned).toBe('20.00');
    expect(screen.getByText('20.00 USDC')).toBeInTheDocument();
  });

  it('says a kept Commit costs no fee — the whole promise of the format', () => {
    render(<MoneyFlow format="commit" stake={STAKE} feeBps={FEE_BPS} />);
    expect(settlement('commit', 'creator_wins').fee).toBe(ZERO_USDC);
    expect(screen.getAllByText('No fee.').length).toBeGreaterThan(0);
  });

  it('shows the fee on a missed Commit, taken from the domain', () => {
    render(<MoneyFlow format="commit" stake={STAKE} feeBps={FEE_BPS} />);
    const toBeneficiary = formatUsdc(settlement('commit', 'opponent_wins').toOpponent, {
      minDecimals: 2,
    });
    expect(toBeneficiary).toBe('19.40');
    expect(screen.getByText('19.40 USDC')).toBeInTheDocument();
  });

  it('never invents a number the settlement did not produce', () => {
    const { container } = render(<MoneyFlow format="bet" stake={STAKE} feeBps={FEE_BPS} />);
    const shown = [...container.textContent!.matchAll(/\d+\.\d{2}/g)].map((m) => m[0]);
    const legal = new Set([
      formatUsdc(settlement('bet', 'creator_wins').toCreator, { minDecimals: 2 }),
      formatUsdc(settlement('bet', 'opponent_wins').toOpponent, { minDecimals: 2 }),
      formatUsdc(STAKE, { minDecimals: 2 }),
      // the "+gain" figure, which is toCreator − stake
      formatUsdc(subUsdc(settlement('bet', 'creator_wins').toCreator, STAKE), { minDecimals: 2 }),
      '0.00',
    ]);
    for (const value of shown) expect(legal).toContain(value);
  });
});

describe('MoneyFlow — both outcomes are always visible', () => {
  it.each(['bet', 'commit'] as const)('renders two branches for %s', (format) => {
    const { container } = render(<MoneyFlow format={format} stake={STAKE} feeBps={FEE_BPS} />);
    // One "no fee"/"after the fee" note per branch.
    expect(container.textContent).toMatch(/No fee\.|After the/);
    expect(screen.getByText('WHERE THE MONEY GOES')).toBeInTheDocument();
  });

  it('frames Commit around doing the thing, not around winning', () => {
    render(<MoneyFlow format="commit" stake={STAKE} feeBps={FEE_BPS} />);
    expect(screen.getByText('You do it')).toBeInTheDocument();
    expect(screen.getByText('You miss it')).toBeInTheDocument();
    expect(screen.queryByText('You win')).not.toBeInTheDocument();
  });

  it('keeps Bet in win/lose language, where it belongs', () => {
    render(<MoneyFlow format="bet" stake={STAKE} feeBps={FEE_BPS} />);
    expect(screen.getByText('You win')).toBeInTheDocument();
    expect(screen.getByText('You lose')).toBeInTheDocument();
  });
});

describe('MoneyFlow — names', () => {
  it('uses the opponent name when there is one', () => {
    render(<MoneyFlow format="bet" stake={STAKE} feeBps={FEE_BPS} opponentName="Dima" />);
    expect(screen.getByText('Dima takes')).toBeInTheDocument();
  });

  it('falls back to a noun that keeps the verb agreeing', () => {
    render(<MoneyFlow format="bet" stake={STAKE} feeBps={FEE_BPS} />);
    expect(screen.getByText('The other side takes')).toBeInTheDocument();
  });

  it('names the beneficiary of a missed Commit', () => {
    render(<MoneyFlow format="commit" stake={STAKE} feeBps={FEE_BPS} beneficiaryName="Dima" />);
    expect(screen.getByText('Dima gets')).toBeInTheDocument();
  });

  it('ignores a blank name rather than rendering an empty label', () => {
    render(<MoneyFlow format="commit" stake={STAKE} feeBps={FEE_BPS} beneficiaryName="   " />);
    expect(screen.getByText('Whoever you named gets')).toBeInTheDocument();
  });
});

describe('MoneyFlow — refuses to guess', () => {
  it('says so when the stake cannot be settled', () => {
    render(<MoneyFlow format="bet" stake={usdc(0)} feeBps={-1} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Check the stake.');
  });
});
