/**
 * Product copy. Voice per DESIGN.md: second person, declarative, dry, under ten words.
 *
 * Vocabulary rule (docs/06 §6): the product says stake / commit / lock / claim /
 * settle / refund. It never says bet-slip, odds, gamble, casino, jackpot or bookie —
 * that framing is what turns a commitment device into a gambling product, in the reader's
 * head and in a regulator's. `copy.test.ts` enforces it.
 */

export const FORMAT_COPY = {
  bet: {
    label: 'Bet',
    who: 'You both put money in.',
    onFail: 'Winner takes the pot.',
    example: "You won't run 10 km by Sunday.",
  },
  commit: {
    label: 'Commit',
    who: 'Only you put money in.',
    onFail: 'Miss it and your stake goes to them.',
    example: "I'll hand in my thesis by June 1.",
  },
} as const;

export const WIZARD_COPY = {
  terms: { title: "What's the bet?", cta: 'Next' },
  format: { title: 'How much is on the line?', cta: 'Next' },
  deadline: { title: "When's it decided?", cta: 'Next' },
  judge: { title: 'Who decides?', cta: 'Next' },
  review: { title: 'Sign your commitment.', cta: 'Hold to lock in' },
} as const;

export const STATE_COPY = {
  draft: 'Draft',
  open: 'Waiting for them',
  active: 'Locked in',
  claimed: 'Awaiting confirmation',
  disputed: 'Referee deciding',
  resolved: 'Settled',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
} as const;

export const TRUST_COPY = {
  fee: '3% fee. Nothing else.',
  feeSplit: 'A referee who rules is paid 1% of that 3%. You are never charged more.',
  escrow: 'Escrow, not our bank account.',
  refund: 'Nobody agrees? Both refunded.',
  noBackingOut: 'No backing out.',
  timeline:
    'After the deadline either of you claims the win. The other has 48 hours. Say nothing and the claim stands. Disagreeing is free: without a referee it refunds you both on the spot, with one the referee decides. If the referee never does, you both get your money back after 7 days.',
  refereeRole:
    "The referee only appears if you two disagree. They can't take the money — only pick a winner or a draw. Ruling earns them 1% of the winnings, out of our fee, not on top of it.",

  /**
   * The two halves of the same fact, and the reason this vocabulary exists at all: a referee
   * the creator merely typed is not a referee. Whichever of these a screen shows, it must
   * show one — a bet card that says only "Decided by: Anya" is a claim nobody has verified.
   */
  refereeConfirmed:
    'They opened their link and took the role. If you two disagree, they decide — and if they never do, you both get your money back.',
  refereeUnconfirmed:
    'They have not taken the role yet. Until they do, nobody can settle a disagreement — and one after the deadline refunds you both.',

  /** The /r/ screen: what is being asked, what it pays, and what it costs you to accept. */
  refereeInvite:
    'You have been asked to settle this if the two of them disagree. You are not on either side and you put no money in.',
  refereePay:
    'Ruling earns you 1% of the winnings. It comes out of the 3% fee, not on top of it — and only if you actually rule.',
  refereeNotAParty:
    'Taking this role means you can never take a side on this bet, and someone already on it can never referee it.',
  refereeSignInFirst:
    'Sign in first. The role is tied to an account, not to the link — otherwise whoever it gets forwarded to next could take your place.',

  linkWarning: 'Anyone with this link can accept. Send it to the right person.',
  disputing:
    "Disagreeing is free. If you say they didn't do it, your referee decides — and if your referee never does, everyone gets their money back.",
  /** The same moment on a bet with nobody named to decide (2026-09-17). */
  disputingMutual:
    "Disagreeing is free. With no referee, saying they didn't do it refunds you both on the spot — no fee.",
  devnet: 'Devnet — test money only.',
} as const;

/** Words that must never appear in user-facing copy. Asserted by copy.test.ts. */
export const BANNED_TERMS = [
  'gamble',
  'gambling',
  'casino',
  'jackpot',
  'bookie',
  'odds',
  'wager',
  'bet slip',
] as const;
