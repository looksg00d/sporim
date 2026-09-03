import { describe, expect, it } from 'vitest';
import { asUsdcAmount, usdc, type Bet, type UserId } from '@sporim/domain';
import { FIXTURE_IDS, makeBet, makeParty, makeReferee } from '@sporim/domain/testing';
import {
  betRowSchema,
  claimRowSchema,
  disputeRowSchema,
  participantRowSchema,
  toBet,
  toBetInsert,
  toClaimInsert,
  toDisputeInsert,
  toParticipantInserts,
  type BetRowBundle,
} from './bet-row';

/**
 * The mapper is the only place a domain value changes representation, so it is the only
 * place precision can be lost. These tests take a `Bet` all the way out to column values and
 * back and demand it be the same object.
 */

const CREATOR_ID = FIXTURE_IDS.creatorId;
const CLAIM_ID = '3b0c1e4a-5f6d-4a7b-8c9d-0e1f2a3b4c5d';

/** domain → column values → parsed row → domain, with nothing skipped in between. */
function roundTrip(bet: Bet, creatorId: UserId = CREATOR_ID): Bet {
  const bundle: BetRowBundle = {
    bet: betRowSchema.parse(toBetInsert(bet, creatorId)),
    participants: toParticipantInserts(bet).map((row) => participantRowSchema.parse(row)),
    claim: bet.claim ? claimRowSchema.parse(toClaimInsert(bet.id, bet.claim, creatorId)) : null,
    dispute: bet.dispute
      ? disputeRowSchema.parse(toDisputeInsert(bet.id, CLAIM_ID, bet.dispute, creatorId))
      : null,
  };
  return toBet(bundle);
}

describe('bet round trip', () => {
  it('loses nothing on a plain open bet', () => {
    const bet = makeBet();
    expect(roundTrip(bet)).toEqual(bet);
  });

  it('loses nothing on a commit with a beneficiary and a referee', () => {
    const bet = makeBet({
      format: 'commit',
      decisionMode: 'referee',
      state: 'active',
      stakeOpponent: asUsdcAmount(0n),
      opponent: makeParty({ userId: FIXTURE_IDS.opponentId, displayName: 'sasha' }),
      referee: makeReferee({ displayName: 'anya' }),
      beneficiary: { ...makeParty({ userId: null, wallet: null }), kind: 'charity' },
    });
    expect(roundTrip(bet)).toEqual(bet);
  });

  it('loses nothing on a disputed bet carrying a claim and a bond', () => {
    const bet = makeBet({
      state: 'disputed',
      claim: {
        outcome: 'creator_wins',
        by: 'creator',
        atSeconds: 1_788_700_000,
        windowEndsAtSeconds: 1_788_872_800,
      },
      dispute: {
        by: 'opponent',
        bond: usdc(4),
        atSeconds: 1_788_701_000,
        refereeDeadlineSeconds: 1_789_305_800,
      },
      opponent: makeParty({ userId: FIXTURE_IDS.opponentId, displayName: 'sasha' }),
      referee: makeReferee({ displayName: 'anya' }),
    });
    expect(roundTrip(bet)).toEqual(bet);
  });

  it('keeps a party whose user and wallet are both still unknown', () => {
    const bet = makeBet({
      opponent: { userId: null, wallet: null, displayName: 'the one with the link' },
    });
    const back = roundTrip(bet);
    expect(back.opponent).toEqual(bet.opponent);
  });

  it('refuses a bundle with no creator rather than inventing one', () => {
    const bet = makeBet();
    expect(() =>
      toBet({
        bet: betRowSchema.parse(toBetInsert(bet, CREATOR_ID)),
        participants: [],
        claim: null,
        dispute: null,
      }),
    ).toThrow(/no creator participant row/);
  });
});

describe('money across the boundary', () => {
  const row = (stake: unknown) => ({ ...toBetInsert(makeBet(), CREATOR_ID), stake_creator: stake });

  it('survives as exact base units, not as a rounded number', () => {
    // 20 USDC and one millionth: the digit a float would eat first.
    const odd = asUsdcAmount(20_000_001n);
    const bet = makeBet({ stakeCreator: odd, stakeOpponent: odd });
    const back = roundTrip(bet);
    expect(back.stakeCreator).toBe(20_000_001n);
    expect(back.stakeOpponent).toBe(20_000_001n);
  });

  it('accepts the driver default of a digit string without going through Number', () => {
    // Above 2^53: if this ever passed through a JS number it would come back as
    // 9007199254740992n and nobody would notice until a payout was short.
    const parsed = betRowSchema.parse(row('9007199254740993'));
    expect(parsed.stake_creator).toBe(9_007_199_254_740_993n);
  });

  it('rejects a JavaScript number, which is the only value that could arrive pre-rounded', () => {
    expect(() => betRowSchema.parse(row(20_000_001))).toThrow();
  });

  it('rejects a decimal string rather than truncating it', () => {
    expect(() => betRowSchema.parse(row('20.5'))).toThrow();
  });

  it('rejects a negative amount', () => {
    expect(() => betRowSchema.parse(row('-1'))).toThrow();
  });
});

describe('time across the boundary', () => {
  it('keeps whole unix seconds exactly', () => {
    const bet = makeBet({ createdAtSeconds: 1_788_350_400, deadlineSeconds: 1_788_782_400 });
    const back = roundTrip(bet);
    expect(back.createdAtSeconds).toBe(1_788_350_400);
    expect(back.deadlineSeconds).toBe(1_788_782_400);
  });
});

describe('column validation', () => {
  it('rejects a terms hash that is not 32 bytes of lowercase hex', () => {
    const bet = makeBet();
    expect(() =>
      betRowSchema.parse({ ...toBetInsert(bet, CREATOR_ID), terms_hash: 'nope' }),
    ).toThrow();
  });

  it('rejects a short code that is not base58', () => {
    const bet = makeBet();
    expect(() =>
      betRowSchema.parse({ ...toBetInsert(bet, CREATOR_ID), short_code: '0OIl0OIl' }),
    ).toThrow();
  });

  it('drops columns the domain has no field for instead of leaking them', () => {
    const bet = makeBet();
    const parsed = betRowSchema.parse({
      ...toBetInsert(bet, CREATOR_ID),
      terms_salt: 'not a domain concept',
    });
    expect(parsed).not.toHaveProperty('terms_salt');
  });
});
