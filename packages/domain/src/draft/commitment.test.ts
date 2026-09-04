import { describe, expect, it } from 'vitest';
import { drawnSignature, typedSignature } from '../signature/signature';
import { usdc } from '../money/usdc';
import { COMMITMENT_VERSION, commitmentCanonicalString } from './commitment';
import type { SubmittableDraft } from './reducer';

const DRAFT: SubmittableDraft = {
  terms: 'Ты не пробежишь 10 км до воскресенья.',
  format: 'bet',
  stake: usdc(20),
  deadlineSeconds: 1_788_000_000,
  decisionMode: 'mutual',
  opponentRef: 'dima',
  refereeRef: undefined,
  beneficiaryKind: undefined,
  beneficiaryRef: undefined,
  acceptDeadlineSeconds: 1_787_900_000,
  feeBps: 300,
  signature: drawnSignature([[0, 0, 400, 10, 800, 0]], 300),
};

describe('commitmentCanonicalString', () => {
  it('is stable for the same agreement', () => {
    expect(commitmentCanonicalString(DRAFT)).toBe(commitmentCanonicalString({ ...DRAFT }));
  });

  it('carries its version, so a change of rules is not a silent change of hash', () => {
    expect(commitmentCanonicalString(DRAFT)).toContain(COMMITMENT_VERSION);
  });

  it.each([
    ['terms', { terms: 'Ты не пробежишь 11 км до воскресенья.' }],
    ['stake', { stake: usdc(21) }],
    ['deadline', { deadlineSeconds: DRAFT.deadlineSeconds + 1 }],
    ['format', { format: 'commit' as const }],
    ['decision mode', { decisionMode: 'referee' as const }],
    ['opponent', { opponentRef: 'sasha' }],
    ['referee', { refereeRef: 'anya' }],
    ['fee', { feeBps: 200 }],
    ['signature', { signature: typedSignature('Дима') }],
  ])('changes when the %s changes', (_label, patch) => {
    expect(commitmentCanonicalString({ ...DRAFT, ...patch })).not.toBe(
      commitmentCanonicalString(DRAFT),
    );
  });

  /**
   * The one property that makes it usable as an idempotency key: a draft submitted again
   * after a login round trip is the same agreement, even though the server's clock has moved
   * and `acceptDeadlineSeconds` moved with it.
   */
  it('ignores the values the server derives from its own clock', () => {
    const later: SubmittableDraft = { ...DRAFT, acceptDeadlineSeconds: DRAFT.deadlineSeconds };
    expect(commitmentCanonicalString(later)).toBe(commitmentCanonicalString(DRAFT));
  });

  it('cannot have a field boundary forged from inside a value', () => {
    const injected: SubmittableDraft = { ...DRAFT, terms: 'x"\nstake="999999999' };
    const forged: SubmittableDraft = { ...DRAFT, stake: usdc(100) };
    expect(commitmentCanonicalString(injected)).not.toBe(commitmentCanonicalString(forged));
    // One line per field, whatever anyone typed into one of them.
    expect(commitmentCanonicalString(injected).split('\n')).toHaveLength(12);
  });

  it('distinguishes an absent referee from one who is named', () => {
    const named: SubmittableDraft = { ...DRAFT, refereeRef: 'anya' };
    expect(commitmentCanonicalString(named)).toContain('"anya"');
    expect(commitmentCanonicalString(DRAFT)).toContain('referee=null');
  });
});
