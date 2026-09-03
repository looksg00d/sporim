import { describe, expect, it } from 'vitest';
import { drawnSignature, usdc, type SubmittableDraft } from '@sporim/domain';
import { createFakeWallet, generateShortCode } from './fake';
import { WALLET_ERROR_COPY, WalletError, isWalletErrorCode, toWalletError } from './port';

const DRAFT: SubmittableDraft = {
  terms: 'Ты не пробежишь 10 км до воскресенья.',
  format: 'bet',
  stake: usdc(20),
  deadlineSeconds: 1_788_000_000,
  decisionMode: 'mutual',
  opponentRef: 'dima',
  refereeRef: undefined,
  beneficiaryKind: undefined,
  beneficiaryRef: undefined,
  acceptDeadlineSeconds: 1_787_900_000,
  feeBps: 300,
  signature: drawnSignature([[0, 0, 400, 10, 800, 0]], 300),
};

describe('createFakeWallet', () => {
  it('returns a short code', async () => {
    const wallet = createFakeWallet({ delayMs: 0 });
    const created = await wallet.createBet(DRAFT);
    expect(created.shortCode).toHaveLength(6);
  });

  it('never invents a transaction signature', async () => {
    const wallet = createFakeWallet({ delayMs: 0 });
    const created = await wallet.createBet(DRAFT);
    expect(created.txSignature).toBeNull();
    expect(created.simulated).toBe(true);
  });

  it('fails with the requested code', async () => {
    const wallet = createFakeWallet({ delayMs: 0, failWith: 'INSUFFICIENT_FUNDS' });
    await expect(wallet.createBet(DRAFT)).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
      message: WALLET_ERROR_COPY.INSUFFICIENT_FUNDS,
    });
  });

  it('treats an unrecognised failure request as UNKNOWN rather than trusting the URL', async () => {
    const wallet = createFakeWallet({ delayMs: 0, failWith: 'DROP TABLE bets' });
    await expect(wallet.createBet(DRAFT)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('takes time on purpose — a signature that returns instantly feels fake', async () => {
    const wallet = createFakeWallet({ delayMs: 40 });
    const started = Date.now();
    await wallet.createBet(DRAFT);
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
  });
});

describe('generateShortCode', () => {
  it('is six characters', () => {
    expect(generateShortCode(() => 0)).toHaveLength(6);
  });

  it('contains no vowels, so a code cannot read as a word', () => {
    const codes = Array.from({ length: 200 }, () => generateShortCode());
    expect(codes.join('')).not.toMatch(/[AEIOU]/);
  });

  it('uses only the documented alphabet', () => {
    const codes = Array.from({ length: 200 }, () => generateShortCode());
    expect(codes.join('')).toMatch(/^[0-9BCDFGHJKLMNPQRSTVWXYZ]+$/);
  });

  it('is deterministic when the randomness is', () => {
    expect(generateShortCode(() => 0)).toBe(generateShortCode(() => 0));
  });
});

describe('error mapping', () => {
  it('recognises every documented code', () => {
    for (const code of Object.keys(WALLET_ERROR_COPY)) {
      expect(isWalletErrorCode(code)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isWalletErrorCode('OOPS')).toBe(false);
    expect(isWalletErrorCode(undefined)).toBe(false);
  });

  it('passes a WalletError through untouched', () => {
    const original = new WalletError('USER_REJECTED', WALLET_ERROR_COPY.USER_REJECTED);
    expect(toWalletError(original)).toBe(original);
  });

  it('never leaks an underlying exception message to the user', () => {
    const mapped = toWalletError(new Error('RPC 503: node xyz.example.dev refused'));
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.message).toBe(WALLET_ERROR_COPY.UNKNOWN);
  });

  it('has copy for every code, and none of it blames the user', () => {
    for (const message of Object.values(WALLET_ERROR_COPY)) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/your fault|invalid input/i);
    }
  });
});
