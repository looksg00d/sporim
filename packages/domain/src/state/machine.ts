import { CLAIM_GRACE_SECONDS } from '../constants';
import type { Bet, BetState, ViewerRole } from '../types/bet';
import { TERMINAL_STATES, isRefereeConfirmed } from '../types/bet';
import { roleToSide, successClaimantSide } from './viewer';

/**
 * Every move anyone can make on a bet. `settleUncontested`, `expireUnaccepted` and
 * `refundExpired` are permissionless by design — if we disappear, anyone can still
 * unlock the money (docs/08, bet2fun principle).
 */
export const BET_ACTIONS = [
  'share',
  'accept',
  'cancel',
  'expireUnaccepted',
  'submitClaim',
  'confirmClaim',
  'disputeClaim',
  'settleUncontested',
  'refereeResolve',
  'refundExpired',
] as const;
export type BetAction = (typeof BET_ACTIONS)[number];

export const PERMISSIONLESS_ACTIONS = [
  'expireUnaccepted',
  'settleUncontested',
  'refundExpired',
] as const satisfies readonly BetAction[];

export function isTerminal(state: BetState): boolean {
  return (TERMINAL_STATES as readonly BetState[]).includes(state);
}

function openActions(bet: Bet, role: ViewerRole, now: number): BetAction[] {
  const expired = now >= bet.acceptDeadlineSeconds;
  if (expired) return ['expireUnaccepted'];
  const actions: BetAction[] = [];
  if (role === 'creator') actions.push('share', 'cancel');
  // Anyone with the link who is not the creator may take the other side.
  if (role !== 'creator' && role !== 'referee') actions.push('accept');
  return actions;
}

function activeActions(bet: Bet, role: ViewerRole, now: number): BetAction[] {
  const side = roleToSide(role);
  const pastDeadline = now >= bet.deadlineSeconds;
  const abandoned = now >= bet.deadlineSeconds + CLAIM_GRACE_SECONDS;

  if (abandoned) return ['refundExpired'];
  if (!pastDeadline || !side) return [];

  // In a one-sided format only the party doing the thing may claim; the other side waits.
  const claimant = successClaimantSide(bet);
  if (claimant && side !== claimant) return [];
  return ['submitClaim'];
}

function claimedActions(bet: Bet, role: ViewerRole, now: number): BetAction[] {
  const claim = bet.claim;
  if (!claim) return [];
  const windowOpen = now < claim.windowEndsAtSeconds;
  if (!windowOpen) return ['settleUncontested'];

  const side = roleToSide(role);
  if (!side || side === claim.by) return [];

  const actions: BetAction[] = ['confirmClaim'];
  // Disputing needs someone to arbitrate; without a referee the timeout does the work.
  if (bet.referee) actions.push('disputeClaim');
  return actions;
}

/**
 * A referee who never rules refunds the bet. Confirmed or not, and whatever was claimed.
 *
 * This reverses the earlier rule, where a *confirmed* referee's silence upheld the claim
 * (2026-09-04; the reasoning is in `docs/DECISIONS.md`). Two things moved:
 *
 *   * **Silence is not agreement once somebody has objected.** UMA and Polymarket accept an
 *     unchallenged claim after a timeout, and that is the only thing the researched systems
 *     support. After a challenge the disagreement is a known fact, and settling it on whether
 *     a third person opened a link decides by attendance rather than by merit. The honest
 *     side would lose the pot because somebody else went quiet.
 *   * **Nothing is left to protect.** The old rule earned its keep by making a losing party's
 *     objection worthless, which mattered while a refund was the alternative. With the bond
 *     gone the deterrent is social, and it applies the same either way.
 *
 * What we accept in exchange: a party who has lost can object at no cost and, if the referee
 * then vanishes, get their stake back. The wager is that among friends this is embarrassing
 * enough not to happen, and that if the funnel says otherwise, it says so in numbers.
 *
 * Confirmation still decides who may *rule* — an unconfirmed name cannot — so the card can
 * tell the other side whether a judge exists before they stake anything.
 */
function disputedActions(bet: Bet, role: ViewerRole, now: number): BetAction[] {
  const dispute = bet.dispute;
  if (!dispute) return [];
  if (now >= dispute.refereeDeadlineSeconds) return ['refundExpired'];
  return role === 'referee' && isRefereeConfirmed(bet.referee) ? ['refereeResolve'] : [];
}

/**
 * The single source of truth for "what can this viewer do right now".
 * The UI renders from it, the server authorizes with it, and the program mirrors it.
 */
export function allowedActions(
  bet: Bet,
  role: ViewerRole,
  nowSeconds: number,
): readonly BetAction[] {
  switch (bet.state) {
    case 'draft':
      return [];
    case 'open':
      return openActions(bet, role, nowSeconds);
    case 'active':
      return activeActions(bet, role, nowSeconds);
    case 'claimed':
      return claimedActions(bet, role, nowSeconds);
    case 'disputed':
      return disputedActions(bet, role, nowSeconds);
    case 'resolved':
    case 'refunded':
    case 'cancelled':
      return [];
  }
}

export function canPerform(
  bet: Bet,
  role: ViewerRole,
  action: BetAction,
  nowSeconds: number,
): boolean {
  return allowedActions(bet, role, nowSeconds).includes(action);
}

/** The state an action moves the bet into. Pure lookup — no validation, call `canPerform` first. */
export function nextState(action: BetAction): BetState {
  switch (action) {
    case 'accept':
      return 'active';
    case 'submitClaim':
      return 'claimed';
    case 'disputeClaim':
      return 'disputed';
    case 'confirmClaim':
    case 'settleUncontested':
    case 'refereeResolve':
      return 'resolved';
    case 'refundExpired':
      return 'refunded';
    case 'cancel':
    case 'expireUnaccepted':
      return 'cancelled';
    case 'share':
      return 'open';
  }
}
