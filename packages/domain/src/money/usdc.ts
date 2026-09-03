import { USDC_BASE, USDC_DECIMALS } from '../constants';
import { asUsdcAmount, type UsdcAmount } from '../types/money';
import { err, ok, type Result } from '../types/result';

export type UsdcParseError =
  | { readonly code: 'EMPTY' }
  | { readonly code: 'INVALID_FORMAT'; readonly input: string }
  | { readonly code: 'TOO_MANY_DECIMALS'; readonly max: number }
  | { readonly code: 'TOO_LARGE' };

const DECIMAL_RE = /^(\d{1,9})(?:\.(\d{1,6}))?$/;
const MAX_WHOLE_DIGITS = 9;

/**
 * Parses user-typed USDC ("20", "20.5", "18.80") into base units without touching floats.
 * Rejects signs, exponents, commas, more than 6 decimals, and more than 9 integer digits.
 */
export function parseUsdc(input: string): Result<UsdcAmount, UsdcParseError> {
  const trimmed = input.trim();
  if (trimmed === '') return err({ code: 'EMPTY' });
  const match = DECIMAL_RE.exec(trimmed);
  if (!match) {
    if (/^\d+\.\d{7,}$/.test(trimmed))
      return err({ code: 'TOO_MANY_DECIMALS', max: USDC_DECIMALS });
    if (/^\d{10,}/.test(trimmed)) return err({ code: 'TOO_LARGE' });
    return err({ code: 'INVALID_FORMAT', input: trimmed });
  }
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(USDC_DECIMALS, '0');
  if (whole.length > MAX_WHOLE_DIGITS) return err({ code: 'TOO_LARGE' });
  return ok(asUsdcAmount(BigInt(whole) * USDC_BASE + BigInt(fraction)));
}

/** Whole-USDC constructor for presets and tests. Integers only. */
export function usdc(whole: number): UsdcAmount {
  if (!Number.isInteger(whole) || whole < 0)
    throw new RangeError(`usdc() takes a non-negative integer, got ${whole}`);
  return asUsdcAmount(BigInt(whole) * USDC_BASE);
}

/**
 * Formats base units for display: "20", "18.80", "0.60". Shows at least `minDecimals`
 * and at most `maxDecimals` fraction digits; extra precision is truncated (never rounded up).
 */
export function formatUsdc(
  amount: UsdcAmount,
  options: { readonly minDecimals?: number; readonly maxDecimals?: number } = {},
): string {
  const minDecimals = options.minDecimals ?? 0;
  const maxDecimals = options.maxDecimals ?? 2;
  const whole = amount / USDC_BASE;
  const fraction = (amount % USDC_BASE).toString().padStart(USDC_DECIMALS, '0');
  const truncated = fraction.slice(0, maxDecimals);
  const trimmed = truncated.replace(/0+$/, '');
  const digits = trimmed.length < minDecimals ? trimmed.padEnd(minDecimals, '0') : trimmed;
  if (minDecimals === 0 && digits === '') return whole.toString();
  const fixed = digits.length < 2 && digits !== '' ? digits.padEnd(2, '0') : digits;
  return fixed === '' ? whole.toString() : `${whole}.${fixed}`;
}

/** "20 USDC", "+18.80 USDC", "−20 USDC" — the sign is passed explicitly, never inferred. */
export function formatUsdcLabel(amount: UsdcAmount, sign: '' | '+' | '−' = ''): string {
  return `${sign}${formatUsdc(amount)} USDC`;
}
