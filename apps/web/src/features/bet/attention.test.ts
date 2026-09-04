import { describe, expect, it } from 'vitest';
import {
  BET_ACTIONS,
  PERMISSIONLESS_ACTIONS,
  allowedActions,
  type BetAction,
} from '@sporim/domain';
import { makeBet, makeParty, makeReferee } from '@sporim/domain/testing';
import { needsYou } from './attention';

/**
 * The rule `/me` sorts by. Getting it wrong is quiet and expensive in both directions: a bet
 * that needs a decision and is not flagged runs into its deadline, and a list where
 * everything is flagged is a list nobody reads twice.
 */

describe('needsYou', () => {
  it('is false with nothing to do', () => {
    expect(needsYou([])).toBe(false);
  });

  it.each(['accept', 'submitClaim', 'confirmClaim', 'disputeClaim', 'refereeResolve'] as const)(
    'flags %s — nobody else can make that move',
    (action) => {
      expect(needsYou([action])).toBe(true);
    },
  );

  /*
   * The timeouts are how money leaves a bet everyone has abandoned, and any passer-by can
   * push them. Putting them in somebody's inbox would mean every stale bet in the system
   * nagging every participant forever.
   */
  it.each(PERMISSIONLESS_ACTIONS)('does not flag %s — anyone can push it', (action) => {
    expect(needsYou([action])).toBe(false);
  });

  it('does not flag the creator’s optional moves', () => {
    expect(needsYou(['share', 'cancel'])).toBe(false);
  });

  it('flags a list as soon as one move needs a decision', () => {
    expect(needsYou(['share', 'cancel', 'submitClaim'])).toBe(true);
  });

  it('has an opinion about every action the machine can offer', () => {
    for (const action of BET_ACTIONS) {
      expect(typeof needsYou([action satisfies BetAction])).toBe('boolean');
    }
  });
});

describe('what it means on a real bet', () => {
  const NOW = makeBet().createdAtSeconds;

  it('does not nag either side while the bet is still running', () => {
    const running = makeBet({ state: 'active', opponent: makeParty() });
    const before = running.deadlineSeconds - 60;
    expect(needsYou(allowedActions(running, 'creator', before))).toBe(false);
    expect(needsYou(allowedActions(running, 'opponent', before))).toBe(false);
  });

  it('nags both sides the moment the deadline passes', () => {
    const running = makeBet({ state: 'active', opponent: makeParty() });
    const after = running.deadlineSeconds + 60;
    expect(needsYou(allowedActions(running, 'creator', after))).toBe(true);
    expect(needsYou(allowedActions(running, 'opponent', after))).toBe(true);
  });

  it('nags the other side once a claim lands, and not the claimant', () => {
    const claimed = makeBet({
      state: 'claimed',
      opponent: makeParty(),
      referee: makeReferee(),
      claim: {
        outcome: 'creator_wins',
        by: 'creator',
        atSeconds: NOW,
        windowEndsAtSeconds: NOW + 10_000,
      },
    });
    expect(needsYou(allowedActions(claimed, 'opponent', NOW + 1))).toBe(true);
    expect(needsYou(allowedActions(claimed, 'creator', NOW + 1))).toBe(false);
  });

  it('nags the referee once they disagree, and neither party', () => {
    const disputed = makeBet({
      state: 'disputed',
      opponent: makeParty(),
      referee: makeReferee(),
      claim: {
        outcome: 'creator_wins',
        by: 'creator',
        atSeconds: NOW,
        windowEndsAtSeconds: NOW + 10_000,
      },
      dispute: { by: 'opponent', atSeconds: NOW + 1, refereeDeadlineSeconds: NOW + 100_000 },
    });
    expect(needsYou(allowedActions(disputed, 'referee', NOW + 2))).toBe(true);
    expect(needsYou(allowedActions(disputed, 'creator', NOW + 2))).toBe(false);
    expect(needsYou(allowedActions(disputed, 'opponent', NOW + 2))).toBe(false);
  });

  it('stops nagging anybody once it is over', () => {
    for (const state of ['resolved', 'refunded', 'cancelled'] as const) {
      const done = makeBet({ state, opponent: makeParty() });
      expect(needsYou(allowedActions(done, 'creator', NOW + 1_000_000))).toBe(false);
    }
  });
});
