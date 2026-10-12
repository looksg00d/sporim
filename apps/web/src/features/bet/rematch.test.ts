import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, usdc } from '@sporim/domain';
import { makeBet, makeReferee } from '@sporim/domain/testing';
import { canRematch, rematchDraft } from './rematch';

describe('canRematch', () => {
  it('is offered on a finished bet to both sides', () => {
    for (const state of ['resolved', 'refunded'] as const) {
      const bet = makeBet({ state, format: 'bet' });
      expect(canRematch(bet, 'creator')).toBe(true);
      expect(canRematch(bet, 'opponent')).toBe(true);
    }
  });

  it('is not offered while the bet is still running or was called off', () => {
    for (const state of ['open', 'active', 'claimed', 'disputed', 'cancelled'] as const) {
      expect(canRematch(makeBet({ state }), 'creator')).toBe(false);
    }
  });

  it('never lets the referee or a stranger start one', () => {
    const bet = makeBet({ state: 'resolved' });
    expect(canRematch(bet, 'referee')).toBe(false);
    expect(canRematch(bet, 'observer')).toBe(false);
  });

  it('lets only the person who committed renew a Commit', () => {
    const bet = makeBet({ state: 'resolved', format: 'commit' });
    expect(canRematch(bet, 'creator')).toBe(true);
    expect(canRematch(bet, 'opponent')).toBe(false);
  });
});

describe('rematchDraft', () => {
  it('keeps how they argue and drops what must be chosen again', () => {
    const draft = rematchDraft(
      makeBet({
        state: 'resolved',
        format: 'bet',
        terms: 'Old claim',
        stakeCreator: usdc(25),
        decisionMode: 'referee',
        referee: makeReferee({ displayName: 'Anya' }),
      }),
    );

    expect(draft.format).toBe('bet');
    expect(draft.stake).toBe(usdc(25));
    expect(draft.decisionMode).toBe('referee');
    expect(draft.refereeRef).toBe('Anya');
    expect(draft.terms).toBe(EMPTY_DRAFT.terms);
    expect(draft.deadlineSeconds).toBeNull();
    expect(draft.signature).toBeNull();
  });

  it('never raises the stake', () => {
    const bet = makeBet({ state: 'resolved', stakeCreator: usdc(10) });
    expect(rematchDraft(bet).stake).toBe(usdc(10));
  });

  it('names no referee on a mutual bet', () => {
    const bet = makeBet({ state: 'resolved', decisionMode: 'mutual', referee: null });
    expect(rematchDraft(bet).refereeRef).toBe('');
  });
});
