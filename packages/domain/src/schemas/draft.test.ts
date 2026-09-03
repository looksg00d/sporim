import { describe, expect, it } from 'vitest';
import { MAX_DEADLINE_LEAD_SECONDS, MIN_DEADLINE_LEAD_SECONDS } from '../constants';
import { usdc } from '../money/usdc';
import { deadlineSchema, refereeRefSchema, stakeSchema, termsSchema } from './draft';
import { looksAutomated, waitlistInputSchema } from './waitlist';

const NOW = 1_788_350_400;

describe('termsSchema', () => {
  it('accepts a normal bet sentence', () => {
    expect(termsSchema.parse("  @sasha won't run 10 km before Sunday.  ")).toBe(
      "@sasha won't run 10 km before Sunday.",
    );
  });

  it.each([
    ['too short', 'too short'.slice(0, 9)],
    ['empty', '   '],
    ['too long', 'x'.repeat(281)],
  ])('rejects %s', (_label, value) => {
    expect(termsSchema.safeParse(value).success).toBe(false);
  });

  it('accepts exactly 280 characters', () => {
    expect(termsSchema.safeParse('x'.repeat(280)).success).toBe(true);
  });
});

describe('stakeSchema', () => {
  it.each([
    ['20', usdc(20)],
    ['18.50', 18_500_000n],
    ['1', usdc(1)],
    ['100', usdc(100)],
  ])('accepts %s', (input, expected) => {
    expect(stakeSchema.parse(input)).toBe(expected);
  });

  it.each(['0', '0.99', '100.01', '1e2', '-5', '', '20,5', '1.234'])('rejects %s', (input) => {
    expect(stakeSchema.safeParse(input).success).toBe(false);
  });
});

describe('deadlineSchema', () => {
  const schema = deadlineSchema(NOW);

  it('accepts a deadline just past the minimum lead', () => {
    expect(schema.safeParse(NOW + MIN_DEADLINE_LEAD_SECONDS).success).toBe(true);
  });

  it.each([
    ['in the past', NOW - 1],
    ['too soon', NOW + MIN_DEADLINE_LEAD_SECONDS - 1],
    ['beyond a year', NOW + MAX_DEADLINE_LEAD_SECONDS + 1],
    ['not an integer', NOW + 0.5],
  ])('rejects %s', (_label, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});

describe('refereeRefSchema', () => {
  it('accepts a handle', () => {
    expect(refereeRefSchema.parse(' @anya ')).toBe('@anya');
  });
  it.each(['a', 'x'.repeat(65), 'two  spaces'])('rejects %s', (value) => {
    expect(refereeRefSchema.safeParse(value).success).toBe(false);
  });
});

describe('waitlist', () => {
  it('normalizes the email', () => {
    const parsed = waitlistInputSchema.parse({ email: '  MAX@Example.COM ' });
    expect(parsed.email).toBe('max@example.com');
    expect(parsed.source).toBe('landing');
  });

  it('rejects a malformed email', () => {
    expect(waitlistInputSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('flags a filled honeypot and instant submissions', () => {
    expect(looksAutomated({ website: 'http://spam', elapsedMs: 9_000 })).toBe(true);
    expect(looksAutomated({ website: '', elapsedMs: 200 })).toBe(true);
    expect(looksAutomated({ website: '', elapsedMs: 4_000 })).toBe(false);
  });
});
