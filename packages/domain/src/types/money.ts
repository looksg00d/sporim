import type { Brand } from './ids';

/** USDC in base units (6 decimals), never negative. Use the helpers in money/usdc.ts to construct. */
export type UsdcAmount = Brand<bigint, 'UsdcAmount'>;

export const ZERO_USDC = 0n as UsdcAmount;

export function isUsdcAmount(value: unknown): value is UsdcAmount {
  return typeof value === 'bigint' && value >= 0n;
}

/** Wraps a bigint as UsdcAmount; throws on negatives — programmer error, not user input. */
export function asUsdcAmount(value: bigint): UsdcAmount {
  if (value < 0n) throw new RangeError(`UsdcAmount cannot be negative: ${value}`);
  return value as UsdcAmount;
}

export function addUsdc(a: UsdcAmount, b: UsdcAmount): UsdcAmount {
  return (a + b) as UsdcAmount;
}

export function subUsdc(a: UsdcAmount, b: UsdcAmount): UsdcAmount {
  return asUsdcAmount(a - b);
}
