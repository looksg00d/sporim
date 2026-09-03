import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS } from '../testing/factories';
import {
  isBetId,
  isHexHash,
  isRefereeToken,
  isShortCode,
  isTxSignature,
  isUserId,
  isUuid,
  isWalletAddress,
  REFEREE_TOKEN_LENGTH,
} from './ids';
import { err, isOk, mapResult, ok, unwrap } from './result';

describe('id guards', () => {
  it('accepts the fixture ids it is meant to validate', () => {
    expect(isUuid(FIXTURE_IDS.betId)).toBe(true);
    expect(isBetId(FIXTURE_IDS.betId)).toBe(true);
    expect(isUserId(FIXTURE_IDS.creatorId)).toBe(true);
    expect(isShortCode(FIXTURE_IDS.shortCode)).toBe(true);
    expect(isWalletAddress(FIXTURE_IDS.creatorWallet)).toBe(true);
    expect(isHexHash(FIXTURE_IDS.termsHash)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['not a uuid', 'abc'],
    ['uuid with a bad version nibble', '6f1c2a3e-4b5d-0c6e-8f70-1a2b3c4d5e6f'],
    ['uuid with a bad variant nibble', '6f1c2a3e-4b5d-4c6e-1f70-1a2b3c4d5e6f'],
  ])('rejects a %s as a uuid', (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(45)],
    ['contains base58-excluded characters', '0OIl'.padEnd(40, 'x')],
  ])('rejects a %s wallet address', (_label, value) => {
    expect(isWalletAddress(value)).toBe(false);
  });

  it('rejects short codes of the wrong length or alphabet', () => {
    expect(isShortCode('Ab3kZ9x')).toBe(false); // 7 chars
    expect(isShortCode('Ab3kZ9xQQ')).toBe(false); // 9 chars
    expect(isShortCode('Ab3kZ90Q')).toBe(false); // contains 0
  });

  it('never lets a referee token pass as a short code, or the reverse', () => {
    // The two are different capabilities on the same bet, and the only structural thing
    // stopping one link from being spent on the other route is that their lengths disagree.
    const token = 'R'.repeat(REFEREE_TOKEN_LENGTH);
    expect(isRefereeToken(token)).toBe(true);
    expect(isShortCode(token)).toBe(false);
    expect(isRefereeToken(FIXTURE_IDS.shortCode)).toBe(false);
  });

  it('rejects referee tokens of the wrong length or alphabet', () => {
    expect(isRefereeToken('R'.repeat(REFEREE_TOKEN_LENGTH - 1))).toBe(false);
    expect(isRefereeToken('R'.repeat(REFEREE_TOKEN_LENGTH + 1))).toBe(false);
    expect(isRefereeToken('0'.repeat(REFEREE_TOKEN_LENGTH))).toBe(false); // 0 is not base58
  });

  it('accepts a real-length signature and rejects a short one', () => {
    expect(isTxSignature('5'.repeat(88))).toBe(true);
    expect(isTxSignature('5'.repeat(40))).toBe(false);
  });

  it('requires exactly 64 lowercase hex characters for a hash', () => {
    expect(isHexHash('A'.repeat(64))).toBe(false);
    expect(isHexHash('a'.repeat(63))).toBe(false);
  });
});

describe('Result helpers', () => {
  it('wraps and unwraps a success', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe(42);
  });

  it('maps only over successes', () => {
    expect(unwrap(mapResult(ok(2), (n) => n * 2))).toBe(4);
    const failure = err({ code: 'NOPE' });
    expect(mapResult(failure, (n: number) => n * 2)).toBe(failure);
  });

  it('throws with the error attached when unwrapping a failure', () => {
    expect(() => unwrap(err({ code: 'NOPE' }))).toThrow(/NOPE/);
  });
});
