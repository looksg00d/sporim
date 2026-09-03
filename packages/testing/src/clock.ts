import { vi } from 'vitest';

/** 2026-09-02T12:00:00Z — a fixed "now" so time-based tests are reproducible. */
export const FIXED_NOW_SECONDS = 1_788_350_400;

/**
 * Freezes `Date.now()` and timers at `nowSeconds` for the current test.
 * Returns a function that restores real timers.
 */
export function freezeTime(nowSeconds: number = FIXED_NOW_SECONDS): () => void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(nowSeconds * 1000));
  return () => vi.useRealTimers();
}
