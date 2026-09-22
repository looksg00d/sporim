import {
  EMPTY_DRAFT,
  USDC_DECIMALS,
  clampSignature,
  formatUsdc,
  parseUsdc,
  signatureSchema,
  type BetDraft,
} from '@sporim/domain';
import { z } from 'zod';

/**
 * The draft survives a reload — losing a half-written bet because someone switched apps to
 * check the date is the cheapest possible way to lose a user.
 *
 * `sessionStorage`, not `localStorage`: the draft belongs to this tab and this sitting. It
 * is also why nothing here is a security boundary — the server re-validates every field.
 *
 * The one real hazard is `stake`, a **bigint**, which `JSON.stringify` throws on. It is
 * stored as the decimal string a person would type and parsed back through the domain, so
 * the stored form is both readable and impossible to drift from `parseUsdc`.
 */

export const DRAFT_STORAGE_KEY = 'sporim.draft.v1';

const storedSchema = z.object({
  terms: z.string(),
  format: z.enum(['bet', 'commit']),
  stake: z.string().nullable(),
  deadlineSeconds: z.number().int().nullable(),
  decisionMode: z.enum(['mutual', 'referee']),
  refereeRef: z.string(),
  beneficiaryKind: z.enum(['friend', 'charity', 'vault']).nullable(),
  beneficiaryRef: z.string(),
  // A stored signature is untrusted input like any other, so it goes through the same schema
  // a server action uses and is re-clamped on read.
  signature: signatureSchema.nullable(),
});

export function serializeDraft(draft: BetDraft): string {
  return JSON.stringify({
    terms: draft.terms,
    format: draft.format,
    // Full precision: storage must never be the place money loses a digit.
    stake: draft.stake === null ? null : formatUsdc(draft.stake, { maxDecimals: USDC_DECIMALS }),
    deadlineSeconds: draft.deadlineSeconds,
    decisionMode: draft.decisionMode,
    refereeRef: draft.refereeRef,
    beneficiaryKind: draft.beneficiaryKind,
    beneficiaryRef: draft.beneficiaryRef,
    signature: draft.signature,
  });
}

/**
 * Anything unreadable yields `null` and the wizard starts clean. A corrupt draft is not
 * worth an error screen — but it must never be half-applied.
 */
export function deserializeDraft(raw: string | null): BetDraft | null {
  if (!raw) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }

  const stored = storedSchema.safeParse(parsedJson);
  if (!stored.success) return null;

  let stake: BetDraft['stake'] = null;
  if (stored.data.stake !== null) {
    const amount = parseUsdc(stored.data.stake);
    if (!amount.ok) return null;
    stake = amount.value;
  }

  return {
    ...EMPTY_DRAFT,
    ...stored.data,
    stake,
    signature: stored.data.signature === null ? null : clampSignature(stored.data.signature),
  };
}

export function readStoredDraft(storage: Pick<Storage, 'getItem'>): BetDraft | null {
  try {
    return deserializeDraft(storage.getItem(DRAFT_STORAGE_KEY));
  } catch {
    // Private-mode Safari and locked-down browsers throw on access, not on write.
    return null;
  }
}

export function writeStoredDraft(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  draft: BetDraft | null,
): void {
  try {
    if (draft === null) storage.removeItem(DRAFT_STORAGE_KEY);
    else storage.setItem(DRAFT_STORAGE_KEY, serializeDraft(draft));
  } catch {
    // A draft that cannot be saved is a worse experience, never a broken one.
  }
}
