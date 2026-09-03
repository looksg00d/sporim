import { z } from 'zod';

/** Waitlist capture. Email is normalized here so duplicates collapse before they reach the DB. */
export const waitlistInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('That does not look like an email.')
    .max(254, 'That email is too long.'),
  source: z.string().trim().max(64).default('landing'),
  refCode: z.string().trim().max(64).optional(),
  utm: z.record(z.string().max(64), z.string().max(256)).default({}),
  /** Honeypot: bots fill it, humans never see it. Must stay empty. */
  website: z.string().max(0, 'Rejected.').optional(),
  /** Milliseconds the form was on screen; sub-second submissions are bots. */
  elapsedMs: z.number().int().min(0).optional(),
});

export type WaitlistInput = z.output<typeof waitlistInputSchema>;

export const MIN_FORM_ELAPSED_MS = 1_500;

export function looksAutomated(input: Pick<WaitlistInput, 'website' | 'elapsedMs'>): boolean {
  if (input.website && input.website.length > 0) return true;
  return input.elapsedMs !== undefined && input.elapsedMs < MIN_FORM_ELAPSED_MS;
}
