import type { Bet, PartySide, ViewerRole } from '../types/bet';
import type { UserId, WalletAddress } from '../types/ids';

export interface ViewerIdentity {
  readonly userId?: UserId | null;
  readonly wallet?: WalletAddress | null;
}

function matches(
  party: { readonly userId: UserId | null; readonly wallet: WalletAddress | null } | null,
  viewer: ViewerIdentity,
): boolean {
  if (!party) return false;
  if (viewer.userId && party.userId && party.userId === viewer.userId) return true;
  return Boolean(viewer.wallet && party.wallet && party.wallet === viewer.wallet);
}

/**
 * Who is looking at this bet. Checked in priority order: a person can technically be
 * both creator and beneficiary, and the creator role always wins.
 */
export function resolveViewerRole(bet: Bet, viewer: ViewerIdentity): ViewerRole {
  if (matches(bet.creator, viewer)) return 'creator';
  if (matches(bet.opponent, viewer)) return 'opponent';
  if (matches(bet.referee, viewer)) return 'referee';
  if (matches(bet.beneficiary, viewer)) return 'beneficiary';
  return 'observer';
}

/** The two sides that hold money. Referees and observers are not sides. */
export function roleToSide(role: ViewerRole): PartySide | null {
  if (role === 'creator') return 'creator';
  if (role === 'opponent') return 'opponent';
  return null;
}

/**
 * Which side may claim a *success* in a one-sided format. In Commit the author is the one
 * doing the thing, so only they may say it was done — the party that profits from a failure
 * can never claim on the other's behalf. That is the conflict-of-interest guard from
 * docs/05, and it is why a one-sided format is worth distinguishing at all.
 *
 * When Dare comes back it returns `'opponent'` here: there the target does the thing.
 */
export function successClaimantSide(bet: Bet): PartySide | null {
  if (bet.format === 'commit') return 'creator';
  return null; // a plain Bet: either side may claim either outcome
}
