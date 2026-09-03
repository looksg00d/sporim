import { describe, expect, it } from 'vitest';
import { asUsdcAmount } from '../types/money';
import { unwrap } from '../types/result';
import { formatUsdc, formatUsdcLabel, parseUsdc, usdc } from './usdc';

describe('parseUsdc', () => {
  it.each([
    ['20', 20_000_000n],
    ['20.5', 20_500_000n],
    ['18.80', 18_800_000n],
    ['0.6', 600_000n],
    ['99.99', 99_990_000n],
    ['1.234567', 1_234_567n],
    [' 7 ', 7_000_000n],
    ['0', 0n],
  ])('parses %s → %s base units', (input, expected) => {
    expect(unwrap(parseUsdc(input))).toBe(expected);
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['1e2', 'INVALID_FORMAT'],
    ['-5', 'INVALID_FORMAT'],
    ['+5', 'INVALID_FORMAT'],
    ['20,5', 'INVALID_FORMAT'],
    ['abc', 'INVALID_FORMAT'],
    ['.5', 'INVALID_FORMAT'],
    ['5.', 'INVALID_FORMAT'],
    ['1.2345678', 'TOO_MANY_DECIMALS'],
    ['1234567890', 'TOO_LARGE'],
  ])('rejects %s with %s', (input, code) => {
    const result = parseUsdc(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });
});

describe('usdc()', () => {
  it('builds whole amounts', () => {
    expect(usdc(25)).toBe(25_000_000n);
  });

  it.each([-1, 1.5, Number.NaN])('rejects %s', (value) => {
    expect(() => usdc(value)).toThrow(RangeError);
  });
});

describe('formatUsdc', () => {
  it.each([
    [20_000_000n, '20'],
    [18_800_000n, '18.80'],
    [600_000n, '0.60'],
    [39_400_000n, '39.40'],
    [1_234_567n, '1.23'],
    [1_999_999n, '1.99'],
    [0n, '0'],
  ])('%s → %s', (base, expected) => {
    expect(formatUsdc(asUsdcAmount(base))).toBe(expected);
  });

  it('never rounds up (truncates extra precision)', () => {
    expect(formatUsdc(asUsdcAmount(999_999n))).toBe('0.99');
  });

  it('respects minDecimals', () => {
    expect(formatUsdc(usdc(20), { minDecimals: 2 })).toBe('20.00');
  });

  it('labels with an explicit sign', () => {
    expect(formatUsdcLabel(usdc(20))).toBe('20 USDC');
    expect(formatUsdcLabel(asUsdcAmount(18_800_000n), '+')).toBe('+18.80 USDC');
    expect(formatUsdcLabel(usdc(20), '−')).toBe('−20 USDC');
  });
});
