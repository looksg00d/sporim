import { describe, expect, it } from 'vitest';
import { FEE_BPS } from '../constants';
import { usdc } from '../money/usdc';
import { buildContractSentence, renderContractSentence } from './contract-sentence';
import { BANNED_TERMS, FORMAT_COPY, STATE_COPY, TRUST_COPY, WIZARD_COPY } from './copy';

/**
 * The vocabulary guard from docs/06 §6. If this fails, someone reintroduced gambling
 * framing into user-facing copy — fix the copy, not the test.
 */
describe('copy vocabulary', () => {
  const surfaces = [FORMAT_COPY, WIZARD_COPY, STATE_COPY, TRUST_COPY];
  const haystack = JSON.stringify(surfaces).toLowerCase();

  it.each(BANNED_TERMS)('never says "%s"', (term) => {
    expect(haystack).not.toContain(term);
  });

  it('still says the words the product is built on', () => {
    expect(haystack).toContain('stake');
    expect(haystack).toContain('refund');
    expect(haystack).toContain('escrow');
  });
});

describe('contract sentence', () => {
  const base = {
    terms: "he won't run 10 km",
    stake: usdc(20),
    deadlineLabel: 'Sun 23:59',
    feeBps: FEE_BPS,
  } as const;

  it('reads as one sentence for a Bet with a referee', () => {
    const text = renderContractSentence({
      ...base,
      format: 'bet',
      decisionMode: 'referee',
      opponentName: 'Dan',
      refereeName: 'Anya',
    });
    expect(text).toBe(
      "I bet Dan 20 USDC that he won't run 10 km. By Sun 23:59. Anya decides if we disagree. Winner takes 39.40 USDC after a 3% fee.",
    );
  });

  it('falls back to mutual confirmation when no referee is named', () => {
    const text = renderContractSentence({
      ...base,
      format: 'bet',
      decisionMode: 'mutual',
      opponentName: 'Dan',
    });
    expect(text).toContain('We both confirm the result.');
    expect(text).not.toContain('decides if we disagree');
  });

  it('names the beneficiary in a Commit and charges no fee on success', () => {
    const text = renderContractSentence({
      ...base,
      terms: 'I finish the thesis',
      format: 'commit',
      decisionMode: 'referee',
      refereeName: 'Anya',
      beneficiaryName: 'Dan',
    });
    expect(text).toContain('I commit: I finish the thesis.');
    expect(text).toContain('goes to Dan');
    // Keeping your word costs nothing, so no payout clause is shown.
    expect(text).not.toContain('after a 3% fee');
  });

  it('handles a missing opponent gracefully', () => {
    const text = renderContractSentence({ ...base, format: 'bet', decisionMode: 'mutual' });
    expect(text).toContain('whoever takes it');
  });

  it('does not double a final period', () => {
    const text = renderContractSentence({
      ...base,
      terms: 'he loses.',
      format: 'bet',
      decisionMode: 'mutual',
    });
    expect(text).not.toContain('..');
  });

  it('marks money and names as emphasised parts', () => {
    const { parts } = buildContractSentence({
      ...base,
      format: 'bet',
      decisionMode: 'mutual',
      opponentName: 'Dan',
    });
    const emphasised = parts.filter((p) => p.emphasis).map((p) => p.text);
    expect(emphasised).toContain('Dan');
    expect(emphasised).toContain('20 USDC');
  });
});

describe('no copy promises anyone a free ride', () => {
  const everyString = (value: unknown): string[] =>
    typeof value === 'string'
      ? [value]
      : typeof value === 'object' && value !== null
        ? Object.values(value).flatMap(everyString)
        : [];

  const allCopy = [FORMAT_COPY, WIZARD_COPY, STATE_COPY, TRUST_COPY].flatMap(everyString);

  it('never claims a side risks nothing', () => {
    /*
     * This used to be about the dispute bond, which put money at risk even for a side that
     * staked none. The bond is gone (2026-09-04), so the ban survives on a different footing:
     * these strings are shared across formats, and a blanket "you risk nothing" is false the
     * moment the same line renders on a Bet. A promise that holds on one screen and not the
     * next is worse than none.
     */
    for (const line of allCopy) {
      expect(line, `"${line}" claims zero risk`).not.toMatch(/risks? nothing/i);
      expect(line, `"${line}" claims zero risk`).not.toMatch(/nothing (?:at stake|to lose)/i);
    }
  });

  /*
   * The bond is gone, so the copy has one job left: say that disagreeing is free, and say
   * what a silent referee means. Both halves are load-bearing — somebody who thinks objecting
   * costs money will not object, and somebody who is not told about the refund will read a
   * stalled bet as theft.
   */
  it('says disagreeing is free and what happens if the referee never rules', () => {
    expect(TRUST_COPY.disputing).toMatch(/free/i);
    expect(TRUST_COPY.disputing).toMatch(/money back/i);
    expect(TRUST_COPY.disputing).not.toMatch(/deposit|bond/i);
  });

  it('tells a bet with no referee that disagreeing is free and refunds you both', () => {
    // 2026-09-17: nobody to decide means nobody to wait for.
    expect(TRUST_COPY.disputingMutual).toMatch(/free/i);
    expect(TRUST_COPY.disputingMutual).toMatch(/money back|refunds you both/i);
    expect(TRUST_COPY.disputingMutual).not.toMatch(/referee decides/i);
  });

  it('describes Commit by what each side contributes, not by their exposure', () => {
    expect(FORMAT_COPY.commit.who).toBe('Only you put money in.');
  });

  /*
   * These used to assert that certain phrases were present, and every one of them still was
   * on 2026-09-05 — inside three sentences that had become false when the money rules were
   * reversed the day before. `timeline` promised that a silent referee leaves the claim
   * standing, and `refereeUnconfirmed` that disputing costs a deposit. Neither is true, both
   * were live, and the suite was green.
   *
   * So these assert the claim rather than the wording: what a line may not say, and what it
   * must. A rewrite that keeps the meaning passes; one that drifts back does not.
   */
  const refereeLines = [
    TRUST_COPY.timeline,
    TRUST_COPY.refereeConfirmed,
    TRUST_COPY.refereeUnconfirmed,
  ];

  it('never charges for a disagreement, because nothing does any more', () => {
    for (const line of allCopy) {
      expect(line, `"${line}" still prices a dispute`).not.toMatch(/deposit|bond/i);
    }
  });

  /*
   * Sentence by sentence, because the two halves are both true and only their combination is
   * a lie: silence *before* anyone objects does leave the claim standing — that is the 48-hour
   * window — while silence *from the referee*, after an objection, refunds. A line may say
   * either. No sentence may say both.
   */
  it('never says a silent referee leaves the claim standing', () => {
    for (const line of refereeLines) {
      for (const sentence of line.split(/(?<=[.!?])\s+/)) {
        const conflates = /referee/i.test(sentence) && /\bstand(s|ing)?\b/i.test(sentence);
        expect(conflates, `"${sentence}" contradicts refundExpired`).toBe(false);
      }
    }
  });

  it('always says where the money goes when the referee never rules', () => {
    for (const line of refereeLines) {
      expect(line, `"${line}" leaves a silent referee unexplained`).toMatch(
        /money back|refunds you both/i,
      );
    }
  });

  it('never promises a referee will decide without saying whether they agreed to', () => {
    // A card that says only "Decided by: Anya" is a claim nobody has verified.
    expect(TRUST_COPY.refereeConfirmed).toMatch(/took the role/i);
    expect(TRUST_COPY.refereeUnconfirmed).toMatch(/not taken the role/i);
  });

  it('says plainly that disagreeing costs nothing', () => {
    expect(TRUST_COPY.timeline).toMatch(/free/i);
  });

  it('says what a disagreement does when nobody was named to decide', () => {
    expect(TRUST_COPY.timeline).toMatch(/without a referee[^.]*refunds you both/i);
  });

  it('tells a referee that the role bars them from taking a side', () => {
    expect(TRUST_COPY.refereeNotAParty).toMatch(/never take a side/i);
    expect(TRUST_COPY.refereeNotAParty).toMatch(/never referee it/i);
  });
});
