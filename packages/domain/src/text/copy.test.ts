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
      opponentName: 'Даня',
      refereeName: 'Аня',
    });
    expect(text).toBe(
      "I bet Даня 20 USDC that he won't run 10 km. By Sun 23:59. Аня decides if we disagree. Winner takes 39.40 USDC after a 3% fee.",
    );
  });

  it('falls back to mutual confirmation when no referee is named', () => {
    const text = renderContractSentence({
      ...base,
      format: 'bet',
      decisionMode: 'mutual',
      opponentName: 'Даня',
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
      refereeName: 'Аня',
      beneficiaryName: 'Даня',
    });
    expect(text).toContain('I commit: I finish the thesis.');
    expect(text).toContain('goes to Даня');
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
      opponentName: 'Даня',
    });
    const emphasised = parts.filter((p) => p.emphasis).map((p) => p.text);
    expect(emphasised).toContain('Даня');
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
    // Disputing a result costs a bond, and `bondRouting` hands it to the other side when the
    // referee disagrees — so a party with no stake still has money exposed. Saying otherwise
    // is not a wording problem, it is a false statement about the product.
    for (const line of allCopy) {
      expect(line, `"${line}" claims zero risk`).not.toMatch(/risks? nothing/i);
      expect(line, `"${line}" claims zero risk`).not.toMatch(/nothing (?:at stake|to lose)/i);
    }
  });

  it('states what the dispute deposit actually does', () => {
    expect(TRUST_COPY.disputeBond).toMatch(/deposit/i);
    expect(TRUST_COPY.disputeBond).toMatch(/lose it/i);
  });

  it('describes Commit by what each side contributes, not by their exposure', () => {
    expect(FORMAT_COPY.commit.who).toBe('Only you put money in.');
  });

  it('never promises a referee will decide without saying whether they agreed to', () => {
    // The one thing a user must not be allowed to believe. Any line that says a referee rules
    // has to carry the condition, because an unconfirmed one refunds both sides instead.
    expect(TRUST_COPY.timeline).toMatch(/took the role/i);
    expect(TRUST_COPY.timeline).toMatch(/refunds you both/i);
    expect(TRUST_COPY.refereeConfirmed).toMatch(/took the role/i);
    expect(TRUST_COPY.refereeUnconfirmed).toMatch(/not taken the role/i);
    expect(TRUST_COPY.refereeUnconfirmed).toMatch(/refunds you both/i);
  });

  it('tells a referee that the role bars them from taking a side', () => {
    expect(TRUST_COPY.refereeNotAParty).toMatch(/never take a side/i);
    expect(TRUST_COPY.refereeNotAParty).toMatch(/never referee it/i);
  });
});
