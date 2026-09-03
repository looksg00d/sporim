import { z } from 'zod';
import {
  MAX_DEADLINE_LEAD_SECONDS,
  MAX_STAKE,
  MIN_DEADLINE_LEAD_SECONDS,
  MIN_STAKE,
  TERMS_MAX_LENGTH,
  TERMS_MIN_LENGTH,
} from '../constants';
import { parseUsdc } from '../money/usdc';
import { BENEFICIARY_KINDS, BET_FORMATS, DECISION_MODES } from '../types/bet';
import { asUsdcAmount } from '../types/money';

/**
 * Validation for the 5-step create wizard. Every rule here is also asserted on the server
 * before a bet is written, and the money bounds are re-checked on-chain (docs/09 §2.5).
 */

export const termsSchema = z
  .string()
  .trim()
  .min(TERMS_MIN_LENGTH, `Say a bit more — at least ${TERMS_MIN_LENGTH} characters.`)
  .max(TERMS_MAX_LENGTH, `Keep it to ${TERMS_MAX_LENGTH} characters.`);

/**
 * Accepts what the user types ("20", "18.80") and yields USDC base units.
 * USDC itself carries 6 decimals, but a *stake* is money a person types, so it is
 * capped at cents — sub-cent precision only ever appears in computed payouts.
 */
export const STAKE_MAX_DECIMALS = 2;

export const stakeSchema = z
  .string()
  .transform((raw, ctx) => {
    const trimmed = raw.trim();
    const decimals = trimmed.includes('.') ? (trimmed.split('.')[1]?.length ?? 0) : 0;
    if (decimals > STAKE_MAX_DECIMALS) {
      ctx.addIssue({ code: 'custom', message: `At most ${STAKE_MAX_DECIMALS} decimals.` });
      return z.NEVER;
    }
    const parsed = parseUsdc(trimmed);
    if (!parsed.ok) {
      const message =
        parsed.error.code === 'EMPTY'
          ? 'Enter an amount.'
          : 'Enter a plain number, like 20 or 18.50.';
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return parsed.value;
  })
  .refine((amount) => amount >= MIN_STAKE, { message: 'Minimum stake is 1 USDC.' })
  .refine((amount) => amount <= MAX_STAKE, { message: 'Maximum stake is 100 USDC.' });

export const formatSchema = z.enum(BET_FORMATS);
export const decisionModeSchema = z.enum(DECISION_MODES);
export const beneficiaryKindSchema = z.enum(BENEFICIARY_KINDS);

/** Unix seconds. Bounds are relative to a caller-supplied `now` so tests stay deterministic. */
export function deadlineSchema(nowSeconds: number) {
  return z
    .number()
    .int('Pick a real date.')
    .refine((deadline) => deadline >= nowSeconds + MIN_DEADLINE_LEAD_SECONDS, {
      message: 'Give yourselves at least 15 minutes.',
    })
    .refine((deadline) => deadline <= nowSeconds + MAX_DEADLINE_LEAD_SECONDS, {
      message: 'A year out is the limit.',
    });
}

export const refereeRefSchema = z
  .string()
  .trim()
  .min(2, 'Who should decide?')
  .max(64, 'That handle is too long.')
  .refine((value) => !/\s{2,}/.test(value), { message: 'That does not look like a handle.' });

export const opponentRefSchema = z.string().trim().max(64).optional();

/** The wizard's in-progress draft. Steps fill it in; only `betDraftSchema` gates submission. */
export const betDraftSchema = z.object({
  terms: termsSchema,
  format: formatSchema,
  // Re-brands the validated bigint so downstream code keeps the UsdcAmount guarantee.
  stake: z.bigint().min(MIN_STAKE).max(MAX_STAKE).transform(asUsdcAmount),
  deadlineSeconds: z.number().int(),
  decisionMode: decisionModeSchema,
  opponentRef: opponentRefSchema,
  refereeRef: refereeRefSchema.optional(),
  beneficiaryKind: beneficiaryKindSchema.optional(),
  beneficiaryRef: z.string().trim().max(64).optional(),
});

export type BetDraftInput = z.input<typeof betDraftSchema>;
export type BetDraftValues = z.output<typeof betDraftSchema>;
