import { calculateSettlement } from '../money/settlement';
import { formatUsdc } from '../money/usdc';
import type { BetFormat, DecisionMode } from '../types/bet';
import type { UsdcAmount } from '../types/money';

/**
 * The whole agreement as one human sentence — the screen-4 pattern from the reel
 * (docs/01) and the thing the user actually signs. Everything else on the review
 * screen is a breakdown of this sentence.
 */
export interface ContractSentenceInput {
  readonly format: BetFormat;
  readonly terms: string;
  readonly stake: UsdcAmount;
  readonly deadlineLabel: string;
  readonly decisionMode: DecisionMode;
  readonly opponentName?: string | undefined;
  readonly refereeName?: string | undefined;
  readonly beneficiaryName?: string | undefined;
  readonly feeBps: number;
}

export interface ContractSentence {
  readonly text: string;
  readonly parts: readonly ContractPart[];
}

/** Emphasised parts let the UI bold the money and the names without parsing the string. */
export interface ContractPart {
  readonly text: string;
  readonly emphasis: boolean;
}

function part(text: string, emphasis = false): ContractPart {
  return { text, emphasis };
}

function endWithPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function stakeLine(input: ContractSentenceInput): ContractPart[] {
  const amount = `${formatUsdc(input.stake)} USDC`;
  const who = input.opponentName ?? 'whoever takes it';

  switch (input.format) {
    case 'bet':
      return [
        part('I bet '),
        part(who, true),
        part(' '),
        part(amount, true),
        part(' that '),
        part(endWithPeriod(input.terms)),
      ];
    case 'commit':
      return [
        part('I commit: '),
        part(endWithPeriod(input.terms)),
        part(' Miss it and '),
        part(amount, true),
        part(' goes to '),
        part(input.beneficiaryName ?? 'my beneficiary', true),
        part('.'),
      ];
  }
}

function decisionLine(input: ContractSentenceInput): ContractPart[] {
  if (input.decisionMode === 'referee' && input.refereeName) {
    return [part(' '), part(input.refereeName, true), part(' decides if we disagree.')];
  }
  return [part(' We both confirm the result.')];
}

function payoutLine(input: ContractSentenceInput): ContractPart[] {
  const settlement = calculateSettlement({
    format: input.format,
    stakeCreator: input.stake,
    stakeOpponent: input.format === 'bet' ? input.stake : (0n as UsdcAmount),
    feeBps: input.feeBps,
    outcome: 'creator_wins',
  });
  if (!settlement.ok || settlement.value.fee === 0n) return [];
  const winnerTakes = settlement.value.toCreator;
  return [
    part(' Winner takes '),
    part(`${formatUsdc(winnerTakes)} USDC`, true),
    part(` after a ${input.feeBps / 100}% fee.`),
  ];
}

export function buildContractSentence(input: ContractSentenceInput): ContractSentence {
  const parts = [
    ...stakeLine(input),
    part(` By ${input.deadlineLabel}.`),
    ...decisionLine(input),
    ...payoutLine(input),
  ];
  return { parts, text: parts.map((p) => p.text).join('') };
}

/** Convenience for places that only need the string (OG cards, share text, tests). */
export function renderContractSentence(input: ContractSentenceInput): string {
  return buildContractSentence(input).text;
}
