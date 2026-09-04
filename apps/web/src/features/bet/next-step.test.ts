import { describe, expect, it } from 'vitest';
import { BET_STATES, VIEWER_ROLES, type Bet, type ViewerRole } from '@sporim/domain';
import { makeBet, makeParty, makeReferee } from '@sporim/domain/testing';
import { whatHappensNext } from './next-step';

/**
 * The product's voice at the moments money is about to move.
 *
 * These read like copy tests because they are, but the ones that matter are not about tone:
 * a sentence that says somebody won when nobody has, or that a referee will answer when
 * their silence refunds, is a false statement about somebody's money.
 */

const NOW = makeBet().createdAtSeconds + 1_000;

const bet = (overrides: Partial<Bet> = {}) => makeBet({ opponent: makeParty(), ...overrides });

describe('whatHappensNext', () => {
  it('says something for every state and every viewer', () => {
    for (const state of BET_STATES) {
      for (const role of VIEWER_ROLES) {
        const line = whatHappensNext(bet({ state }), role, NOW);
        expect(line, `${state} / ${role}`).not.toBe('');
      }
    }
  });

  describe('while it is running', () => {
    it('names the deadline and says neither side can call it early', () => {
      const running = bet({ state: 'active' });
      const line = whatHappensNext(running, 'creator', running.deadlineSeconds - 60);
      expect(line).toMatch(/Running until/);
      expect(line).toMatch(/Neither side/);
    });

    it('asks a party to speak once the deadline passes, and tells an onlooker to wait', () => {
      const running = bet({ state: 'active' });
      const after = running.deadlineSeconds + 60;
      expect(whatHappensNext(running, 'creator', after)).toBe(
        'The deadline has passed. Say how it went.',
      );
      expect(whatHappensNext(running, 'referee', after)).toMatch(/on the two of them/);
    });
  });

  describe('once somebody has claimed', () => {
    const claimed = (by: 'creator' | 'opponent') =>
      bet({
        state: 'claimed',
        claim: { outcome: 'creator_wins', by, atSeconds: NOW, windowEndsAtSeconds: NOW + 1_000 },
      });

    it('tells the claimant to wait and the other side to answer', () => {
      expect(whatHappensNext(claimed('creator'), 'creator', NOW)).toMatch(/You said how it went/);
      expect(whatHappensNext(claimed('creator'), 'opponent', NOW)).toMatch(/They said how it went/);
    });

    /*
     * The line the whole 2026-09-04 change hangs on. Somebody who believes objecting costs
     * money will not object, and the objection is the only route to a referee we have.
     */
    it('says out loud that disagreeing is free', () => {
      expect(whatHappensNext(claimed('creator'), 'opponent', NOW)).toMatch(/free/);
    });
  });

  describe('once they disagree', () => {
    const disputed = bet({
      state: 'disputed',
      referee: makeReferee(),
      dispute: { by: 'opponent', atSeconds: NOW, refereeDeadlineSeconds: NOW + 10_000 },
    });

    it('hands the referee the decision in as many words', () => {
      expect(whatHappensNext(disputed, 'referee', NOW)).toMatch(/Your call/);
    });

    /*
     * Never promise a verdict. A referee who goes quiet refunds, and a person who was not told
     * that reads a stalled bet as theft — which is the one impression this product cannot
     * survive.
     */
    it('warns the parties that a silent referee means a refund', () => {
      for (const role of ['creator', 'opponent'] as const satisfies readonly ViewerRole[]) {
        const line = whatHappensNext(disputed, role, NOW);
        expect(line).toMatch(/referee decides/i);
        expect(line).toMatch(/money back/i);
      }
    });
  });

  it('never announces a winner before there is one', () => {
    const undecided = ['open', 'active', 'claimed', 'disputed'] as const;
    for (const state of undecided) {
      for (const role of VIEWER_ROLES) {
        const line = whatHappensNext(bet({ state }), role, NOW);
        expect(line, `${state} / ${role}`).not.toMatch(/you won|they won|settled/i);
      }
    }
  });

  it('does not call a refund a win, or a cancellation a loss', () => {
    expect(whatHappensNext(bet({ state: 'refunded' }), 'creator', NOW)).toMatch(/Nobody won/);
    expect(whatHappensNext(bet({ state: 'cancelled' }), 'creator', NOW)).toMatch(/Called off/);
  });
});
