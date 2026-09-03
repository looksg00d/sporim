import { describe, expect, it } from 'vitest';
import { ACCEPT_WINDOW_SECONDS, SECONDS_PER_DAY } from '../constants';
import { usdc } from '../money/usdc';
import { drawnSignature, typedSignature } from '../signature/signature';
import { FIXTURE_NOW_SECONDS as NOW } from '../testing/factories';
import { unwrap } from '../types/result';
import {
  draftReducer,
  EMPTY_DRAFT,
  furthestAllowedStep,
  isStepComplete,
  nextStep,
  previousStep,
  toSubmittable,
  type BetDraft,
} from './reducer';

const DEADLINE = NOW + 5 * SECONDS_PER_DAY;

/** A scrawl long enough to pass `isSignatureMeaningful`, shared by the fixtures below. */
const SIGNED = drawnSignature([[0, 0, 400, 10, 800, 0]], 300);

function filledDraft(overrides: Partial<BetDraft> = {}): BetDraft {
  return {
    ...EMPTY_DRAFT,
    terms: "@sasha won't run 10 km before Sunday.",
    stake: usdc(20),
    deadlineSeconds: DEADLINE,
    signature: SIGNED,
    ...overrides,
  };
}

describe('draftReducer — immutability', () => {
  it('never mutates the previous state', () => {
    const next = draftReducer(EMPTY_DRAFT, { type: 'setTerms', terms: 'hello there friend' });
    expect(next).not.toBe(EMPTY_DRAFT);
    expect(EMPTY_DRAFT.terms).toBe('');
    expect(next.terms).toBe('hello there friend');
  });

  it('returns the same reference when a format is re-selected', () => {
    const state = filledDraft();
    expect(draftReducer(state, { type: 'setFormat', format: 'bet' })).toBe(state);
  });
});

describe('draftReducer — one-sided formats force a referee', () => {
  it.each(['commit'] as const)('%s switches the decision mode to referee', (format) => {
    const next = draftReducer(filledDraft(), { type: 'setFormat', format });
    expect(next.format).toBe(format);
    expect(next.decisionMode).toBe('referee');
  });

  it('refuses to fall back to mutual confirmation while one-sided', () => {
    const commit = draftReducer(filledDraft(), { type: 'setFormat', format: 'commit' });
    const attempted = draftReducer(commit, { type: 'setDecisionMode', decisionMode: 'mutual' });
    expect(attempted).toBe(commit);
    expect(attempted.decisionMode).toBe('referee');
  });

  it('clears beneficiary leftovers when switching back to a plain Bet', () => {
    const commit = draftReducer(filledDraft(), { type: 'setFormat', format: 'commit' });
    const withBeneficiary = draftReducer(commit, {
      type: 'setBeneficiary',
      kind: 'friend',
      ref: '@dima',
    });
    const back = draftReducer(withBeneficiary, { type: 'setFormat', format: 'bet' });
    expect(back.beneficiaryKind).toBeNull();
    expect(back.beneficiaryRef).toBe('');
  });

  it('reset returns the empty draft', () => {
    expect(draftReducer(filledDraft(), { type: 'reset' })).toEqual(EMPTY_DRAFT);
  });
});

describe('isStepComplete', () => {
  it('gates terms on length', () => {
    expect(isStepComplete({ ...EMPTY_DRAFT, terms: 'too short' }, 'terms', NOW)).toBe(false);
    expect(isStepComplete({ ...EMPTY_DRAFT, terms: 'x'.repeat(281) }, 'terms', NOW)).toBe(false);
    expect(isStepComplete(filledDraft(), 'terms', NOW)).toBe(true);
  });

  it('gates format on a stake, and on a beneficiary for Commit', () => {
    expect(isStepComplete({ ...EMPTY_DRAFT, stake: null }, 'format', NOW)).toBe(false);
    expect(isStepComplete(filledDraft(), 'format', NOW)).toBe(true);
    const commit = filledDraft({ format: 'commit', decisionMode: 'referee' });
    expect(isStepComplete(commit, 'format', NOW)).toBe(false);
    expect(isStepComplete({ ...commit, beneficiaryKind: 'friend' }, 'format', NOW)).toBe(true);
  });

  it('gates deadline on being in the future', () => {
    expect(isStepComplete(filledDraft({ deadlineSeconds: NOW - 1 }), 'deadline', NOW)).toBe(false);
    expect(isStepComplete(filledDraft(), 'deadline', NOW)).toBe(true);
  });

  it('gates judge on a referee handle when a referee is required', () => {
    expect(isStepComplete(filledDraft({ decisionMode: 'referee' }), 'judge', NOW)).toBe(false);
    expect(
      isStepComplete(filledDraft({ decisionMode: 'referee', refereeRef: '@anya' }), 'judge', NOW),
    ).toBe(true);
    expect(isStepComplete(filledDraft(), 'judge', NOW)).toBe(true);
  });
});

describe('step navigation', () => {
  it('walks forward and back', () => {
    expect(nextStep('terms')).toBe('format');
    expect(nextStep('review')).toBeNull();
    expect(previousStep('format')).toBe('terms');
    expect(previousStep('terms')).toBeNull();
  });

  it('reports the furthest step the draft has earned', () => {
    expect(furthestAllowedStep(EMPTY_DRAFT, NOW)).toBe('terms');
    expect(furthestAllowedStep({ ...EMPTY_DRAFT, terms: 'x'.repeat(20) }, NOW)).toBe('format');
    expect(furthestAllowedStep(filledDraft(), NOW)).toBe('review');
  });
});

describe('toSubmittable', () => {
  it('produces a payload for a complete Bet draft', () => {
    const submittable = unwrap(toSubmittable(filledDraft(), NOW));
    expect(submittable.stake).toBe(usdc(20));
    expect(submittable.format).toBe('bet');
    expect(submittable.feeBps).toBe(300);
    // The accept window never outlives the bet itself.
    expect(submittable.acceptDeadlineSeconds).toBe(NOW + ACCEPT_WINDOW_SECONDS);
    expect(submittable.acceptDeadlineSeconds).toBeLessThanOrEqual(submittable.deadlineSeconds);
  });

  it('clamps the accept window to a short deadline', () => {
    const soon = NOW + 3_600;
    const submittable = unwrap(toSubmittable(filledDraft({ deadlineSeconds: soon }), NOW));
    expect(submittable.acceptDeadlineSeconds).toBe(soon);
  });

  it('names the first unfinished step', () => {
    const result = toSubmittable({ ...EMPTY_DRAFT, terms: 'long enough terms here' }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'INCOMPLETE') expect(result.error.step).toBe('format');
  });

  it('surfaces schema issues for a draft that passes the gates but not validation', () => {
    const result = toSubmittable(filledDraft({ deadlineSeconds: NOW + 60 }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'INVALID') {
      expect(result.error.issues.join(' ')).toContain('15 minutes');
    }
  });
});

describe('draftReducer — hydrate', () => {
  it('replaces the whole draft', () => {
    const restored = filledDraft({ terms: 'restored from storage, long enough' });
    expect(draftReducer(EMPTY_DRAFT, { type: 'hydrate', draft: restored })).toEqual(restored);
  });

  it('does not merge leftovers from the state it replaces', () => {
    const dirty = filledDraft({ refereeRef: 'kolya', opponentRef: 'dima' });
    const restored = { ...EMPTY_DRAFT, terms: 'a restored draft, ten plus chars' };
    const next = draftReducer(dirty, { type: 'hydrate', draft: restored });
    expect(next.refereeRef).toBe('');
    expect(next.opponentRef).toBe('');
  });

  it('is reversible by reset', () => {
    const restored = filledDraft();
    const next = draftReducer(EMPTY_DRAFT, { type: 'hydrate', draft: restored });
    expect(draftReducer(next, { type: 'reset' })).toEqual(EMPTY_DRAFT);
  });
});

describe('signing gates submission', () => {
  it('refuses an unsigned but otherwise complete draft', () => {
    const result = toSubmittable(filledDraft({ signature: null }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNSIGNED');
  });

  it('refuses a signature too slight to count as one', () => {
    const tap = drawnSignature([[500, 150]], 300);
    const result = toSubmittable(filledDraft({ signature: tap }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNSIGNED');
  });

  it('accepts a real scrawl and carries it through', () => {
    const scrawl = drawnSignature([[0, 0, 400, 20, 800, 0]], 300);
    const submittable = unwrap(toSubmittable(filledDraft({ signature: scrawl }), NOW));
    expect(submittable.signature).toEqual(scrawl);
  });

  it('accepts a typed name — a drawn-only gate would exclude people', () => {
    const submittable = unwrap(
      toSubmittable(filledDraft({ signature: typedSignature('Дима') }), NOW),
    );
    expect(submittable.signature).toEqual({ kind: 'typed', name: 'Дима' });
  });

  it('reports the missing step before it reports the missing signature', () => {
    const result = toSubmittable({ ...EMPTY_DRAFT, signature: null }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INCOMPLETE');
  });
});

describe('draftReducer — signature', () => {
  it('stores a signature without touching anything else', () => {
    const signature = typedSignature('Dima');
    const next = draftReducer(EMPTY_DRAFT, { type: 'setSignature', signature });
    expect(next.signature).toEqual(signature);
    expect({ ...next, signature: null }).toEqual(EMPTY_DRAFT);
  });

  it('clears a signature', () => {
    const signed = draftReducer(EMPTY_DRAFT, {
      type: 'setSignature',
      signature: typedSignature('Dima'),
    });
    expect(draftReducer(signed, { type: 'setSignature', signature: null }).signature).toBeNull();
  });

  it('is dropped by reset, so a new bet starts unsigned', () => {
    const signed = draftReducer(EMPTY_DRAFT, {
      type: 'setSignature',
      signature: typedSignature('Dima'),
    });
    expect(draftReducer(signed, { type: 'reset' }).signature).toBeNull();
  });
});
