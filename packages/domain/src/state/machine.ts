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
  /** A dispute the referee never ruled on: the claim stands. */
  'settleUnrefereed',
  'refundExpired',
] as const;
export type BetAction = (typeof BET_ACTIONS)[number];

export const PERMISSIONLESS_ACTIONS = [
  'expireUnaccepted',
  'settleUncontested',
  'settleUnrefereed',
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
 * What a silent referee's deadline means depends on whether they ever agreed to the job.
 *
 * **Confirmed** — they opened their link and took the role. Silence then means the same thing
 * it means everywhere else in this product: no objection sustained. The claim stands and the
 * disputer forfeits their bond, so disputing is not a free rollback.
 *
 * **Unconfirmed** — they are a name the creator typed, and nobody asked them. Letting that
 * silence decide would punish the disputer for the creator's unilateral choice of a stranger,
 * so the bet refunds instead. Such a bet is in effect a word-of-honour bet, which is honest:
 * it has no referee. Disputing still costs the bond (`bondRouting` hands it to the
 * counterparty on an unadjudicated refund), so it is not free either.
 *
 * The counter-risk to the confirmed branch is a creator naming someone they know will ghost
 * and then claiming falsely. Confirmation is exactly what closes it: an accomplice must now
 * actively take the role, and the referee is on the card before the other side stakes money.
 */
function disputedActions(bet: Bet, role: ViewerRole, now: number): BetAction[] {
  const dispute = bet.dispute;
  if (!dispute) return [];
  if (now >= dispute.refereeDeadlineSeconds) {
    return isRefereeConfirmed(bet.referee) ? ['settleUnrefereed'] : ['refundExpired'];
  }
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
    case 'settleUnrefereed':
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
