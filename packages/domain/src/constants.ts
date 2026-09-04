/**
 * Product rules as numbers. Mirrors docs/05-product-spec.md and docs/09-phase0-plan.md §1.5.
 * Money is always USDC in base units (bigint, 6 decimals). Time is always unix seconds.
 */

import { asUsdcAmount } from './types/money';

export const USDC_DECIMALS = 6;
/** Scale factor, not money — the one bigint here that is deliberately unbranded. */
export const USDC_BASE = 1_000_000n;

/** Stake bounds per bet (Phase 0/1 cap). Branded, so they compose with the money helpers. */
export const MIN_STAKE = asUsdcAmount(1n * USDC_BASE); // 1 USDC
export const MAX_STAKE = asUsdcAmount(100n * USDC_BASE); // 100 USDC
export const STAKE_PRESETS_USDC = [5, 10, 25] as const;

/** Fees in basis points. */
export const BPS_DENOMINATOR = 10_000n;
export const FEE_BPS = 300; // 3 % of net winnings
export const MAX_FEE_BPS = 1_000; // hard ceiling — the community's stated maximum

/**
 * A referee who actually rules is paid out of the fee, not on top of it: the user is charged
 * 3 % either way, and the split is ours to make. A third of the fee (1 % of net winnings)
 * goes to the referee, two thirds to the treasury.
 *
 * Paid **only when a ruling happens**. A referee named on a bet nobody disputed did no work,
 * and paying for that would tax every bet to fund a service almost nobody uses. This is the
 * whole reason a referee has any reason to open the link.
 */
export const REFEREE_FEE_SHARE_BPS = 100; // 1 % of net winnings, taken out of FEE_BPS

/*
 * There is no dispute bond, and that is a decision rather than an omission (2026-09-04).
 *
 * A bond exists to stop the losing side from objecting to everything for free. In an
 * anonymous market that is the only lever there is, which is why UMA and Reality.eth have
 * one. Here both sides and the referee are people who know each other, an objection carries
 * the objector's name, and being the friend who contests a bet they plainly lost costs
 * something a bond cannot price. Charging money to say "no, they didn't" bought a deterrent
 * we already had, and made disagreeing feel like filing a claim.
 */

/** Timing (seconds). */
export const SECONDS_PER_HOUR = 3_600;
export const SECONDS_PER_DAY = 86_400;
export const MIN_DEADLINE_LEAD_SECONDS = 15 * 60;
export const MAX_DEADLINE_LEAD_SECONDS = 365 * SECONDS_PER_DAY;
export const ACCEPT_WINDOW_SECONDS = 48 * SECONDS_PER_HOUR;
export const CLAIM_WINDOW_SECONDS = 48 * SECONDS_PER_HOUR;
export const REFEREE_TIMEOUT_SECONDS = 7 * SECONDS_PER_DAY;
export const CLAIM_GRACE_SECONDS = 14 * SECONDS_PER_DAY;

/** Terms text bounds. */
export const TERMS_MIN_LENGTH = 10;
export const TERMS_MAX_LENGTH = 280;
export const TERMS_WARN_LENGTH = 240;

/** Signing ritual: press-and-hold duration. */
export const HOLD_TO_LOCK_MS = 800;
