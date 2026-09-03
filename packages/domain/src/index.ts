export { BRAND, type Brand } from './brand';
export * from './constants';

// --- types ---
export type {
  BetId,
  ShortCode,
  RefereeToken,
  UserId,
  WalletAddress,
  TxSignature,
  HexHash,
} from './types/ids';
export {
  isUuid,
  isWalletAddress,
  isTxSignature,
  isShortCode,
  isRefereeToken,
  isHexHash,
  isBetId,
  isUserId,
  REFEREE_TOKEN_LENGTH,
} from './types/ids';
export {
  type UsdcAmount,
  ZERO_USDC,
  isUsdcAmount,
  asUsdcAmount,
  addUsdc,
  subUsdc,
} from './types/money';
export { type Result, ok, err, isOk, mapResult, unwrap } from './types/result';
export * from './types/bet';

// --- money ---
export { parseUsdc, usdc, formatUsdc, formatUsdcLabel, type UsdcParseError } from './money/usdc';
export {
  calculateSettlement,
  calculateDisputeBond,
  feeOn,
  otherSide,
  type Settlement,
  type SettlementInput,
  type SettlementOutcome,
  type SettlementError,
  type DisputeInput,
} from './money/settlement';

// --- validation ---
export {
  termsSchema,
  stakeSchema,
  formatSchema,
  decisionModeSchema,
  beneficiaryKindSchema,
  deadlineSchema,
  refereeRefSchema,
  opponentRefSchema,
  betDraftSchema,
  STAKE_MAX_DECIMALS,
  type BetDraftInput,
  type BetDraftValues,
} from './schemas/draft';
export {
  waitlistInputSchema,
  looksAutomated,
  MIN_FORM_ELAPSED_MS,
  type WaitlistInput,
} from './schemas/waitlist';

// --- state ---
export {
  BET_ACTIONS,
  PERMISSIONLESS_ACTIONS,
  allowedActions,
  canPerform,
  isTerminal,
  nextState,
  type BetAction,
} from './state/machine';
export {
  resolveViewerRole,
  roleToSide,
  successClaimantSide,
  type ViewerIdentity,
} from './state/viewer';

// --- wizard draft ---
export {
  WIZARD_STEPS,
  EMPTY_DRAFT,
  draftReducer,
  toSubmittable,
  isStepComplete,
  nextStep,
  previousStep,
  furthestAllowedStep,
  type WizardStep,
  type BetDraft,
  type DraftAction,
  type SubmittableDraft,
  type DraftError,
} from './draft/reducer';

// --- signature ---
export {
  SIGNATURE_WIDTH,
  MAX_SIGNATURE_STROKES,
  MAX_SIGNATURE_POINTS,
  MAX_TYPED_SIGNATURE_LENGTH,
  drawnSignature,
  typedSignature,
  clampSignature,
  isSignatureMeaningful,
  signatureInkLength,
  signatureToPath,
  signatureBounds,
  signatureCanonicalString,
  type Signature,
  type DrawnSignature,
  type TypedSignature,
  type SignatureStroke,
  type SignatureBounds,
} from './signature/signature';

// --- text ---
export {
  buildContractSentence,
  renderContractSentence,
  type ContractSentence,
  type ContractSentenceInput,
  type ContractPart,
} from './text/contract-sentence';
export { FORMAT_COPY, WIZARD_COPY, STATE_COPY, TRUST_COPY, BANNED_TERMS } from './text/copy';
