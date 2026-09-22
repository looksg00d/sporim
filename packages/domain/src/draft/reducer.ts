import { ACCEPT_WINDOW_SECONDS, FEE_BPS } from '../constants';
import { betDraftSchema, deadlineSchema } from '../schemas/draft';
import type { BeneficiaryKind, BetFormat, DecisionMode } from '../types/bet';
import type { UsdcAmount } from '../types/money';
import { isSignatureMeaningful, type Signature } from '../signature/signature';
import { err, ok, type Result } from '../types/result';

/** The five wizard steps, in order. */
export const WIZARD_STEPS = ['terms', 'format', 'deadline', 'judge', 'review'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface BetDraft {
  readonly terms: string;
  readonly format: BetFormat;
  readonly stake: UsdcAmount | null;
  readonly deadlineSeconds: number | null;
  readonly decisionMode: DecisionMode;
  readonly refereeRef: string;
  readonly beneficiaryKind: BeneficiaryKind | null;
  readonly beneficiaryRef: string;
  /** The scrawl that locks it in. A keepsake and a commitment device, never a legal signature. */
  readonly signature: Signature | null;
}

export const EMPTY_DRAFT: BetDraft = {
  terms: '',
  format: 'bet',
  stake: null,
  deadlineSeconds: null,
  decisionMode: 'mutual',
  refereeRef: '',
  beneficiaryKind: null,
  beneficiaryRef: '',
  signature: null,
};

export type DraftAction =
  | { readonly type: 'setTerms'; readonly terms: string }
  | { readonly type: 'setFormat'; readonly format: BetFormat }
  | { readonly type: 'setStake'; readonly stake: UsdcAmount }
  | { readonly type: 'setDeadline'; readonly deadlineSeconds: number }
  | { readonly type: 'setDecisionMode'; readonly decisionMode: DecisionMode }
  | { readonly type: 'setRefereeRef'; readonly refereeRef: string }
  | { readonly type: 'setBeneficiary'; readonly kind: BeneficiaryKind; readonly ref: string }
  | { readonly type: 'setSignature'; readonly signature: Signature | null }
  /** Replaces the whole draft — restoring one from storage, never editing. */
  | { readonly type: 'hydrate'; readonly draft: BetDraft }
  | { readonly type: 'reset' };

/**
 * Pure reducer — always returns a new object, never mutates.
 *
 * The one rule it enforces on its own: a one-sided format (Commit today, Dare when it
 * returns) has nobody
 * with an interest in telling the truth on the other side, so mutual confirmation is
 * meaningless there. Picking such a format therefore switches the decision mode to a
 * referee, and switching back to a plain Bet clears the one-sided leftovers.
 */
export function draftReducer(state: BetDraft, action: DraftAction): BetDraft {
  switch (action.type) {
    case 'setTerms':
      return { ...state, terms: action.terms };

    case 'setFormat': {
      if (action.format === state.format) return state;
      if (action.format === 'bet') {
        return { ...state, format: 'bet', beneficiaryKind: null, beneficiaryRef: '' };
      }
      return { ...state, format: action.format, decisionMode: 'referee' };
    }

    case 'setStake':
      return { ...state, stake: action.stake };

    case 'setDeadline':
      return { ...state, deadlineSeconds: action.deadlineSeconds };

    case 'setDecisionMode':
      // A one-sided format cannot fall back to mutual confirmation.
      if (state.format !== 'bet' && action.decisionMode === 'mutual') return state;
      return { ...state, decisionMode: action.decisionMode };

    case 'setRefereeRef':
      return { ...state, refereeRef: action.refereeRef };

    case 'setBeneficiary':
      return { ...state, beneficiaryKind: action.kind, beneficiaryRef: action.ref };

    case 'setSignature':
      return { ...state, signature: action.signature };

    case 'hydrate':
      // Restored drafts are re-validated by the step guard and again by `toSubmittable`,
      // so this is a plain replacement rather than a merge.
      return action.draft;

    case 'reset':
      return EMPTY_DRAFT;
  }
}

export interface SubmittableDraft {
  readonly terms: string;
  readonly format: BetFormat;
  readonly stake: UsdcAmount;
  readonly deadlineSeconds: number;
  readonly decisionMode: DecisionMode;
  readonly refereeRef: string | undefined;
  readonly beneficiaryKind: BeneficiaryKind | undefined;
  readonly beneficiaryRef: string | undefined;
  readonly acceptDeadlineSeconds: number;
  readonly feeBps: number;
  readonly signature: Signature;
}

export type DraftError =
  | { readonly code: 'INCOMPLETE'; readonly step: WizardStep }
  | { readonly code: 'UNSIGNED' }
  | { readonly code: 'INVALID'; readonly issues: readonly string[] };

/** Turns a finished draft into the payload the server action accepts, or says which step is unfinished. */
export function toSubmittable(
  draft: BetDraft,
  nowSeconds: number,
): Result<SubmittableDraft, DraftError> {
  const firstIncomplete = WIZARD_STEPS.find((step) => !isStepComplete(draft, step, nowSeconds));
  if (firstIncomplete && firstIncomplete !== 'review') {
    return err({ code: 'INCOMPLETE', step: firstIncomplete });
  }

  const parsed = betDraftSchema.safeParse({
    terms: draft.terms,
    format: draft.format,
    stake: draft.stake,
    deadlineSeconds: draft.deadlineSeconds,
    decisionMode: draft.decisionMode,
    refereeRef: draft.refereeRef || undefined,
    beneficiaryKind: draft.beneficiaryKind ?? undefined,
    beneficiaryRef: draft.beneficiaryRef || undefined,
  });
  if (!parsed.success) {
    return err({ code: 'INVALID', issues: parsed.error.issues.map((issue) => issue.message) });
  }

  // The deadline bounds are relative to "now", so they live in a schema factory that the
  // static draft schema cannot include. Apply them here, at the last gate before submission.
  const deadlineCheck = deadlineSchema(nowSeconds).safeParse(parsed.data.deadlineSeconds);
  if (!deadlineCheck.success) {
    return err({
      code: 'INVALID',
      issues: deadlineCheck.error.issues.map((issue) => issue.message),
    });
  }

  // The signature is the act of committing, so it gates submission rather than a step.
  if (!isSignatureMeaningful(draft.signature) || draft.signature === null) {
    return err({ code: 'UNSIGNED' });
  }

  const values = parsed.data;
  const acceptDeadlineSeconds = Math.min(
    values.deadlineSeconds,
    nowSeconds + ACCEPT_WINDOW_SECONDS,
  );

  return ok({
    terms: values.terms,
    format: values.format,
    stake: values.stake,
    deadlineSeconds: values.deadlineSeconds,
    decisionMode: values.decisionMode,
    refereeRef: values.refereeRef,
    beneficiaryKind: values.beneficiaryKind,
    beneficiaryRef: values.beneficiaryRef,
    acceptDeadlineSeconds,
    feeBps: FEE_BPS,
    signature: draft.signature,
  });
}

/** Step gating for the wizard: can the user leave this step? */
export function isStepComplete(draft: BetDraft, step: WizardStep, nowSeconds: number): boolean {
  switch (step) {
    case 'terms':
      return draft.terms.trim().length >= 10 && draft.terms.trim().length <= 280;
    case 'format':
      if (draft.stake === null) return false;
      if (draft.format === 'commit') return draft.beneficiaryKind !== null;
      return true;
    case 'deadline':
      return draft.deadlineSeconds !== null && draft.deadlineSeconds > nowSeconds;
    case 'judge':
      return draft.decisionMode === 'mutual' || draft.refereeRef.trim().length >= 2;
    case 'review':
      return false; // the last step is never "complete" — signing leaves it
  }
}

export function nextStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS[index + 1] ?? null;
}

export function previousStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.indexOf(step);
  return index > 0 ? (WIZARD_STEPS[index - 1] ?? null) : null;
}

/** The furthest step the user is allowed to be on, given what they have filled in. */
export function furthestAllowedStep(draft: BetDraft, nowSeconds: number): WizardStep {
  for (const step of WIZARD_STEPS) {
    if (!isStepComplete(draft, step, nowSeconds)) return step;
  }
  return 'review';
}
