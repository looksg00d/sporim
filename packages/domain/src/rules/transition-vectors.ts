import { CLAIM_GRACE_SECONDS, CLAIM_WINDOW_SECONDS } from '../constants';
import { allowedActions, type BetAction } from '../state/machine';
import { makeBet, makeParty } from '../testing';
import type { Bet, BetState, ViewerRole } from '../types/bet';

/**
 * "Who may do what, when", as a file the program reads.
 *
 * Sampled at every boundary an instruction checks — each side of the accept deadline, the
 * settlement deadline, the end of the claim grace and the end of the claim window — for the one
 * shape the program implements: Bet format, mutual decision. Each case is one call to
 * `allowedActions`; `rules::allowed` in the program must return the same set.
 *
 * `share` is dropped: it is a screen, not an instruction.
 */
export const TRANSITIONS_VECTORS_VERSION = 'sporim.transitions.v1';

export type VectorActor = 'creator' | 'opponent' | 'stranger';

const ROLE: Record<VectorActor, ViewerRole> = {
  creator: 'creator',
  opponent: 'opponent',
  stranger: 'observer',
};

export interface TransitionCase {
  readonly name: string;
  readonly state: BetState;
  readonly actor: VectorActor;
  readonly now: number;
  readonly acceptDeadline: number;
  readonly deadline: number;
  readonly claimBy: VectorActor | null;
  readonly claimWindowEnds: number;
  readonly expected: readonly BetAction[];
  readonly onChain: boolean;
}

export interface TransitionVectors {
  readonly version: string;
  readonly cases: readonly TransitionCase[];
}

function sample(label: string, bet: Bet, actor: VectorActor, now: number): TransitionCase {
  return {
    name: `${label} — ${actor}`,
    state: bet.state,
    actor,
    now,
    acceptDeadline: bet.acceptDeadlineSeconds,
    deadline: bet.deadlineSeconds,
    claimBy: bet.claim?.by ?? null,
    claimWindowEnds: bet.claim?.windowEndsAtSeconds ?? 0,
    expected: allowedActions(bet, ROLE[actor], now)
      .filter((action) => action !== 'share')
      .slice()
      .sort(),
    onChain: true,
  };
}

export function buildTransitionVectors(): TransitionVectors {
  const open = makeBet({ state: 'open' });
  const active = makeBet({ state: 'active', opponent: makeParty({ displayName: 'Dima' }) });
  const claimAt = active.deadlineSeconds + 60;
  const claimed = makeBet({
    ...active,
    state: 'claimed',
    claim: {
      outcome: 'creator_wins',
      by: 'creator',
      atSeconds: claimAt,
      windowEndsAtSeconds: claimAt + CLAIM_WINDOW_SECONDS,
    },
  });
  const graceEnds = active.deadlineSeconds + CLAIM_GRACE_SECONDS;
  const windowEnds = claimAt + CLAIM_WINDOW_SECONDS;
  const everyone: readonly VectorActor[] = ['creator', 'opponent', 'stranger'];
  // An open bet has no opponent yet: whoever is not the creator is a stranger.
  const beforeAccept: readonly VectorActor[] = ['creator', 'stranger'];

  const points: readonly (readonly [string, Bet, readonly VectorActor[], number])[] = [
    ['open, accept window running', open, beforeAccept, open.acceptDeadlineSeconds - 1],
    ['open, accept window closed', open, beforeAccept, open.acceptDeadlineSeconds],
    ['active, before deadline', active, everyone, active.deadlineSeconds - 1],
    ['active, at deadline', active, everyone, active.deadlineSeconds],
    ['active, last second of grace', active, everyone, graceEnds - 1],
    ['active, abandoned', active, everyone, graceEnds],
    ['claimed, window open', claimed, everyone, windowEnds - 1],
    ['claimed, window closed', claimed, everyone, windowEnds],
  ];

  return {
    version: TRANSITIONS_VECTORS_VERSION,
    cases: points.flatMap(([label, bet, actors, now]) =>
      actors.map((actor) => sample(label, bet, actor, now)),
    ),
  };
}
