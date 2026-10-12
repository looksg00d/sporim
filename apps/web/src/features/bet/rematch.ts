import { EMPTY_DRAFT, type Bet, type BetDraft, type ViewerRole } from '@sporim/domain';

/**
 * "Rematch" — a finished bet that seeds the next one.
 *
 * Every settled bet is the best moment to start another: both people are on the page, the
 * result is fresh, and the loser has a reason. The seed carries what is about *how* they
 * argue — format, stake, who decides — and leaves out what must be chosen again:
 *
 *   * **Terms** — a rematch is a new claim, not the old one re-signed.
 *   * **Deadline** — the old one is in the past by definition.
 *   * **Signature** — consent is given to this bet, never inherited from the last.
 *
 * No "double it". A stake that grows after a loss is the pattern the vocabulary rules exist
 * to keep this product away from.
 */

const FINISHED = new Set<Bet['state']>(['resolved', 'refunded']);

/**
 * Either side of a Bet can call for a rematch. A Commit belongs to the person who committed:
 * the other side seeding one would be committing somebody else to something.
 */
export function canRematch(bet: Bet, role: ViewerRole): boolean {
  if (!FINISHED.has(bet.state)) return false;
  if (role === 'creator') return true;
  return role === 'opponent' && bet.format === 'bet';
}

export function rematchDraft(bet: Bet): BetDraft {
  const referee = bet.decisionMode === 'referee' ? (bet.referee?.displayName ?? '') : '';
  const beneficiary = bet.format === 'commit' ? bet.beneficiary : null;

  return {
    ...EMPTY_DRAFT,
    format: bet.format,
    stake: bet.stakeCreator,
    decisionMode: bet.decisionMode,
    refereeRef: referee,
    beneficiaryKind: beneficiary?.kind ?? null,
    beneficiaryRef: beneficiary?.displayName ?? '',
  };
}
