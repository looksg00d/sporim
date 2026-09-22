import { formatDeadlineShort } from '@/lib/time';
import type { Bet, ViewerRole } from '@sporim/domain';

/**
 * What is actually going on, in the second person, from where this viewer stands.
 *
 * `STATE_COPY` names a state for a chip; this says what it *means for you*. A referee reading
 * "Awaiting confirmation" learns nothing — what they need to know is that nothing is theirs to
 * do yet. Same row of the state machine, three different people, three different sentences.
 *
 * It lives away from the page for one reason: this is the product's voice at the moments money
 * is about to move, and it should be assertable without a database, a session and a browser.
 *
 * Two rules it must keep, both under test:
 *
 *   * **Never claim a result that has not happened.** A disputed bet says the referee decides,
 *     not that anybody has won.
 *   * **Never promise the referee will answer.** Since 2026-09-04 their silence refunds, and
 *     saying so up front is the difference between a stalled bet and one that reads as theft.
 */
export function whatHappensNext(bet: Bet, role: ViewerRole, now: number): string {
  const isParty = role === 'creator' || role === 'opponent';

  switch (bet.state) {
    case 'open':
      return now >= bet.acceptDeadlineSeconds
        ? 'Nobody took the other side in time. The stake goes back.'
        : 'Waiting for the other side to take it. Nothing is locked until they do.';

    case 'active':
      if (now < bet.deadlineSeconds) {
        return `Running until ${formatDeadlineShort(bet.deadlineSeconds)}. Neither side can call it before then.`;
      }
      return isParty
        ? 'The deadline has passed. Say how it went.'
        : 'The deadline has passed. It is on the two of them to say how it went.';

    case 'claimed': {
      const claim = bet.claim;
      if (!claim) return 'A result was claimed.';
      // Where a disagreement lands, said before it happens: with nobody named, it refunds on
      // the spot (2026-09-17).
      const onDisagree = bet.referee
        ? 'the referee decides, and if they never do, you both get your money back'
        : 'you both get your money back';
      if (isParty && claim.by === role) {
        return `You said how it went. They have time to agree. If they disagree, ${onDisagree}.`;
      }
      return isParty
        ? `They said how it went. Agree, or say they did not. Disagreeing is free: ${onDisagree}.`
        : 'One side has claimed a result. The other side has time to answer.';
    }

    case 'disputed':
      return role === 'referee'
        ? 'They disagree, and they picked you. Your call.'
        : 'They disagree. The referee decides — and if the referee never does, everyone gets their money back.';

    case 'resolved':
      return 'Settled.';
    case 'refunded':
      return 'Nobody won this one. Both stakes went back.';
    case 'cancelled':
      return 'Called off before anybody took the other side.';
    case 'draft':
      return 'Not finished.';
  }
}
