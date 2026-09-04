import type { BetAction } from '@sporim/domain';

/**
 * Which of my bets are waiting on *me*.
 *
 * `/me` is useless as a flat list — the point of coming back is finding the one thing that
 * needs a decision, and a person who has to open six bets to discover that none of them do
 * will stop opening any of them.
 *
 * The split is not "can I press something", because plenty of what `allowedActions` offers is
 * optional or housekeeping:
 *
 *   * `share` and `cancel` are the creator's to take or leave; a bet nobody has accepted yet
 *     is not nagging anybody.
 *   * The three timeouts are permissionless. They are how money gets out when everyone has
 *     gone quiet, and any passer-by can push them — so they belong to nobody's inbox.
 *
 * What is left is the set of moves only this person can make, and where not making one leaves
 * the bet stuck: say how it went, agree, disagree, rule on it, take the other side.
 */
const NEEDS_A_DECISION = [
  'accept',
  'submitClaim',
  'confirmClaim',
  'disputeClaim',
  'refereeResolve',
] as const satisfies readonly BetAction[];

export function needsYou(actions: readonly BetAction[]): boolean {
  return actions.some((action) => (NEEDS_A_DECISION as readonly BetAction[]).includes(action));
}
