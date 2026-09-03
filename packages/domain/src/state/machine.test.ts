import { describe, expect, it } from 'vitest';
import {
  CLAIM_GRACE_SECONDS,
  CLAIM_WINDOW_SECONDS,
  REFEREE_TIMEOUT_SECONDS,
  SECONDS_PER_DAY,
} from '../constants';
import { calculateSettlement } from '../money/settlement';
import { usdc } from '../money/usdc';
import {
  makeBet,
  makeParty,
  makeReferee,
  FIXTURE_IDS,
  FIXTURE_NOW_SECONDS as NOW,
} from '../testing/factories';
import {
  BET_STATES,
  VIEWER_ROLES,
  isRefereeConfirmed,
  type Bet,
  type BetState,
  type ViewerRole,
} from '../types/bet';
import { ZERO_USDC } from '../types/money';
import { unwrap } from '../types/result';
import {
  allowedActions,
  canPerform,
  isTerminal,
  nextState,
  PERMISSIONLESS_ACTIONS,
} from './machine';
import { resolveViewerRole, successClaimantSide } from './viewer';

const OPPONENT = makeParty({
  userId: FIXTURE_IDS.opponentId,
  wallet: FIXTURE_IDS.opponentWallet,
  displayName: 'sasha',
});
/** Took the role: opened their link and said yes. */
const REFEREE = makeReferee();
/** A name the creator typed on the fourth screen. Nobody has asked this person anything. */
const UNCONFIRMED_REFEREE = makeReferee({ confirmedAtSeconds: null });

const DEADLINE = NOW + 5 * SECONDS_PER_DAY;

function activeBet(overrides: Partial<Bet> = {}): Bet {
  return makeBet({ state: 'active', opponent: OPPONENT, deadlineSeconds: DEADLINE, ...overrides });
}

function claimedBet(claimedBySide: 'creator' | 'opponent', overrides: Partial<Bet> = {}): Bet {
  return activeBet({
    state: 'claimed',
    claim: {
      outcome: claimedBySide === 'creator' ? 'creator_wins' : 'opponent_wins',
      by: claimedBySide,
      atSeconds: DEADLINE,
      windowEndsAtSeconds: DEADLINE + CLAIM_WINDOW_SECONDS,
    },
    ...overrides,
  });
}

describe('allowedActions — open', () => {
  const bet = makeBet({ state: 'open' });

  it('lets the creator share and cancel', () => {
    expect(allowedActions(bet, 'creator', NOW)).toEqual(['share', 'cancel']);
  });

  it('lets anyone with the link accept', () => {
    expect(allowedActions(bet, 'observer', NOW)).toEqual(['accept']);
  });

  it('never lets the creator accept their own bet', () => {
    expect(canPerform(bet, 'creator', 'accept', NOW)).toBe(false);
  });

  it('never lets the referee take a side', () => {
    expect(allowedActions(bet, 'referee', NOW)).toEqual([]);
  });

  it('collapses to a permissionless refund once the accept window closes', () => {
    const past = bet.acceptDeadlineSeconds + 1;
    for (const role of VIEWER_ROLES) {
      expect(allowedActions(bet, role, past)).toEqual(['expireUnaccepted']);
    }
  });
});

describe('allowedActions — active', () => {
  it('allows no claims before the deadline', () => {
    const bet = activeBet();
    for (const role of VIEWER_ROLES) {
      expect(allowedActions(bet, role, DEADLINE - 1)).toEqual([]);
    }
  });

  it('lets either side claim after the deadline in a plain Bet', () => {
    const bet = activeBet();
    expect(allowedActions(bet, 'creator', DEADLINE)).toEqual(['submitClaim']);
    expect(allowedActions(bet, 'opponent', DEADLINE)).toEqual(['submitClaim']);
    expect(allowedActions(bet, 'observer', DEADLINE)).toEqual([]);
  });

  it('lets only the author claim success in a Commit', () => {
    const bet = activeBet({
      format: 'commit',
      stakeOpponent: ZERO_USDC,
      referee: REFEREE,
      decisionMode: 'referee',
    });
    expect(successClaimantSide(bet)).toBe('creator');
    expect(allowedActions(bet, 'creator', DEADLINE)).toEqual(['submitClaim']);
    expect(allowedActions(bet, 'opponent', DEADLINE)).toEqual([]);
  });

  it('opens a permissionless refund when both sides go silent', () => {
    const bet = activeBet();
    const abandoned = DEADLINE + CLAIM_GRACE_SECONDS;
    for (const role of VIEWER_ROLES) {
      expect(allowedActions(bet, role, abandoned)).toEqual(['refundExpired']);
    }
  });
});

describe('allowedActions — claimed', () => {
  it('offers confirm and dispute to the other side while the window is open', () => {
    const bet = claimedBet('creator', { referee: REFEREE });
    expect(allowedActions(bet, 'opponent', DEADLINE + 1)).toEqual(['confirmClaim', 'disputeClaim']);
  });

  it('does not offer a dispute when no referee was named', () => {
    const bet = claimedBet('creator', { referee: null });
    expect(allowedActions(bet, 'opponent', DEADLINE + 1)).toEqual(['confirmClaim']);
  });

  it('still offers a dispute against a referee who has not taken the role', () => {
    // Withholding it would leave the side facing a false claim with no move at all, and the
    // creator alone chose the referee. What changes is where the dispute lands, not whether
    // it can be opened — see the disputed suite below.
    const bet = claimedBet('creator', { referee: UNCONFIRMED_REFEREE });
    expect(allowedActions(bet, 'opponent', DEADLINE + 1)).toEqual(['confirmClaim', 'disputeClaim']);
  });

  it('never lets the claimant confirm their own claim', () => {
    const bet = claimedBet('creator', { referee: REFEREE });
    expect(allowedActions(bet, 'creator', DEADLINE + 1)).toEqual([]);
  });

  it('becomes permissionless once the 48h window closes', () => {
    const bet = claimedBet('creator', { referee: REFEREE });
    const after = DEADLINE + CLAIM_WINDOW_SECONDS;
    for (const role of VIEWER_ROLES) {
      expect(allowedActions(bet, role, after)).toEqual(['settleUncontested']);
    }
  });
});

const DISPUTE = {
  by: 'opponent',
  bond: usdc(4),
  atSeconds: DEADLINE + 1,
  refereeDeadlineSeconds: DEADLINE + 1 + REFEREE_TIMEOUT_SECONDS,
} as const;
const REFEREE_DEADLINE = DISPUTE.refereeDeadlineSeconds;

function disputedBetWith(referee: Bet['referee']): Bet {
  return claimedBet('creator', { state: 'disputed', referee, dispute: DISPUTE });
}

describe('allowedActions — disputed', () => {
  const disputedBet = disputedBetWith(REFEREE);

  it('gives the decision to the referee alone', () => {
    expect(allowedActions(disputedBet, 'referee', DEADLINE + 2)).toEqual(['refereeResolve']);
    expect(allowedActions(disputedBet, 'creator', DEADLINE + 2)).toEqual([]);
    expect(allowedActions(disputedBet, 'opponent', DEADLINE + 2)).toEqual([]);
  });

  it('upholds the claim if the referee never shows up', () => {
    // Silence means the same thing everywhere in this product: no objection sustained. If a
    // silent referee refunded instead, the losing side could dispute, wait out an inattentive
    // friend, and turn a loss into a full refund for free.
    const after = DEADLINE + 1 + REFEREE_TIMEOUT_SECONDS;
    for (const role of VIEWER_ROLES) {
      expect(allowedActions(disputedBet, role, after)).toEqual(['settleUnrefereed']);
    }
  });

  it('settles rather than refunds when the referee runs out of time', () => {
    const after = DEADLINE + 1 + REFEREE_TIMEOUT_SECONDS;
    expect(nextState(allowedActions(disputedBet, 'creator', after)[0]!)).toBe('resolved');
  });

  it('lets anyone push it through — the money is never trapped behind one person', () => {
    const after = DEADLINE + 1 + REFEREE_TIMEOUT_SECONDS;
    expect(PERMISSIONLESS_ACTIONS).toContain('settleUnrefereed');
    expect(allowedActions(disputedBet, 'observer', after)).toEqual(['settleUnrefereed']);
  });
});

describe('allowedActions — disputed with a referee who never took the role', () => {
  const disputedBet = disputedBetWith(UNCONFIRMED_REFEREE);

  it('offers no ruling to a name the creator typed', () => {
    // Whoever is behind that handle has agreed to nothing. Handing them the verdict button
    // would be handing it to whoever manages to sign in as them first.
    expect(isRefereeConfirmed(disputedBet.referee)).toBe(false);
    expect(allowedActions(disputedBet, 'referee', DEADLINE + 2)).toEqual([]);
  });

  it('refunds both sides instead of upholding the claim', () => {
    // Silence from someone nobody asked is not "no objection sustained" — it is the absence
    // of a referee. Letting it decide would punish the disputer for the creator's choice.
    for (const role of VIEWER_ROLES) {
      expect(allowedActions(disputedBet, role, REFEREE_DEADLINE)).toEqual(['refundExpired']);
    }
    expect(nextState('refundExpired')).toBe('refunded');
  });

  it('is still an exit anyone can take, like every other timeout', () => {
    expect(PERMISSIONLESS_ACTIONS).toContain('refundExpired');
    expect(allowedActions(disputedBet, 'observer', REFEREE_DEADLINE)).toEqual(['refundExpired']);
  });

  it('turns back into a ruling if the referee takes the role while the dispute is open', () => {
    // The check runs against the referee's state at the deadline, not at the moment the
    // dispute was opened. That is what stops "dispute and wait" from being a cheap way out:
    // a real friend who gets the link can still show up and decide.
    const confirmed = disputedBetWith(makeReferee({ confirmedAtSeconds: DEADLINE + 2 }));
    expect(allowedActions(confirmed, 'referee', DEADLINE + 3)).toEqual(['refereeResolve']);
    expect(allowedActions(confirmed, 'observer', REFEREE_DEADLINE)).toEqual(['settleUnrefereed']);
  });
});

describe('what the two branches cost the parties', () => {
  // The point of the split is money, so the split is asserted in money. Same bet, same
  // dispute, same silence — the only difference is whether the referee ever agreed to judge.
  const bet = disputedBetWith(REFEREE);
  const dispute = { by: DISPUTE.by, bond: DISPUTE.bond };

  function settle(action: 'settleUnrefereed' | 'refundExpired') {
    return unwrap(
      calculateSettlement({
        format: bet.format,
        stakeCreator: bet.stakeCreator,
        stakeOpponent: bet.stakeOpponent,
        feeBps: bet.feeBps,
        // `settleUnrefereed` upholds the claim; `refundExpired` decides nothing at all.
        outcome: action === 'settleUnrefereed' ? bet.claim!.outcome : 'refund',
        dispute,
      }),
    );
  }

  /** The 40 USDC pot less the 3 % charged on the 20 USDC actually won. */
  const POT_AFTER_FEE = 39_400_000n;

  it('pays the claimant the pot when the confirmed referee goes silent', () => {
    const settlement = settle('settleUnrefereed');
    expect(settlement.kind).toBe('payout');
    expect(settlement.winner).toBe('creator');
    expect(settlement.toCreator).toBe(POT_AFTER_FEE + DISPUTE.bond);
    expect(settlement.toOpponent).toBe(ZERO_USDC);
    // Nobody ruled, so nobody is paid for ruling.
    expect(settlement.toReferee).toBe(ZERO_USDC);
  });

  it('gives both sides their stake back when the referee never took the role', () => {
    const settlement = settle('refundExpired');
    expect(settlement.kind).toBe('refund');
    expect(settlement.winner).toBeNull();
    expect(settlement.fee).toBe(ZERO_USDC);
    expect(settlement.toOpponent).toBe(bet.stakeOpponent);
    // Refunded, but not for free: the bond still crosses to the other side, so opening a
    // dispute against an unconfirmed referee is not a costless way out of a loss.
    expect(settlement.toCreator).toBe(bet.stakeCreator + DISPUTE.bond);
  });

  it('keeps the bond away from the disputer in both branches', () => {
    const upheld = settle('settleUnrefereed');
    const refunded = settle('refundExpired');
    expect(upheld.bond).toBe(DISPUTE.bond);
    expect(refunded.bond).toBe(DISPUTE.bond);
    // The disputer is the opponent, and neither branch hands it back to them.
    expect(upheld.toOpponent).toBe(ZERO_USDC);
    expect(refunded.toOpponent).toBe(bet.stakeOpponent);
  });
});

describe('terminal states', () => {
  it.each(['resolved', 'refunded', 'cancelled', 'draft'] as const)(
    'offers nothing in %s',
    (state) => {
      const bet = makeBet({ state });
      for (const role of VIEWER_ROLES) {
        expect(allowedActions(bet, role, NOW)).toEqual([]);
      }
    },
  );

  it('marks exactly the three money-settled states as terminal', () => {
    const terminal = BET_STATES.filter(isTerminal);
    expect(terminal).toEqual(['resolved', 'refunded', 'cancelled']);
  });
});

describe('invariant: money is never trapped', () => {
  // For every non-terminal, funded state there must be a permissionless escape hatch
  // reachable by waiting. This is the "what if my phone dies" guarantee.
  const fundedStates: readonly BetState[] = ['open', 'active', 'claimed', 'disputed'];
  const farFuture = NOW + 400 * SECONDS_PER_DAY;

  it.each(fundedStates)('%s eventually exposes a permissionless exit', (state) => {
    const base =
      state === 'claimed' || state === 'disputed'
        ? claimedBet('creator', {
            state,
            referee: REFEREE,
            dispute:
              state === 'disputed'
                ? {
                    by: 'opponent',
                    bond: usdc(4),
                    atSeconds: DEADLINE + 1,
                    refereeDeadlineSeconds: DEADLINE + 1 + REFEREE_TIMEOUT_SECONDS,
                  }
                : null,
          })
        : makeBet({
            state,
            opponent: state === 'open' ? null : OPPONENT,
            deadlineSeconds: DEADLINE,
          });

    const actions = allowedActions(base, 'observer', farFuture);
    const escape = actions.filter((a) => (PERMISSIONLESS_ACTIONS as readonly string[]).includes(a));
    expect(escape.length).toBeGreaterThan(0);
    expect(isTerminal(nextState(escape[0]!))).toBe(true);
  });
});

describe('nextState', () => {
  it.each([
    ['accept', 'active'],
    ['submitClaim', 'claimed'],
    ['disputeClaim', 'disputed'],
    ['confirmClaim', 'resolved'],
    ['settleUncontested', 'resolved'],
    ['refereeResolve', 'resolved'],
    ['refundExpired', 'refunded'],
    ['cancel', 'cancelled'],
    ['expireUnaccepted', 'cancelled'],
  ] as const)('%s → %s', (action, expected) => {
    expect(nextState(action)).toBe(expected);
  });
});

describe('resolveViewerRole', () => {
  const bet = makeBet({ opponent: OPPONENT, referee: REFEREE });

  it.each([
    ['creator by wallet', { wallet: FIXTURE_IDS.creatorWallet }, 'creator'],
    ['opponent by wallet', { wallet: FIXTURE_IDS.opponentWallet }, 'opponent'],
    ['referee by user id', { userId: FIXTURE_IDS.refereeId }, 'referee'],
    ['stranger', { wallet: 'SomeoneElse111111111111111111111111111111' }, 'observer'],
    ['anonymous', {}, 'observer'],
  ] as const)('%s → %s', (_label, viewer, expected) => {
    expect(resolveViewerRole(bet, viewer as never)).toBe(expected satisfies ViewerRole);
  });
});
