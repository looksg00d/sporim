import { describe, expect, it } from 'vitest';
import { betIdFromBytes, betIdToBytes } from './bet-id';
import { findBetPda } from './generated';

describe('bet id bytes', () => {
  it('reads a uuid in the order it is written', () => {
    const bytes = betIdToBytes('0190f5c8-a2b3-7c4e-9d1f-2a3b4c5d6e7f');
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x01, 0x90, 0xf5, 0xc8]);
    expect(bytes.at(-1)).toBe(0x7f);
  });

  it('round-trips a hundred random uuids', () => {
    for (let i = 0; i < 100; i += 1) {
      const uuid = crypto.randomUUID();
      expect(betIdFromBytes(betIdToBytes(uuid))).toBe(uuid);
    }
  });

  it('refuses anything that is not a uuid', () => {
    expect(() => betIdToBytes('ABCD1234')).toThrow();
    expect(() => betIdFromBytes(new Uint8Array(15))).toThrow();
  });
});

/**
 * The expected addresses come from outside TypeScript: `solana find-program-derived-address
 * EkfT… string:bet hex:<id>`, computed on 2026-09-24. So this checks the generated client, the
 * uuid conversion and the seed layout against the Solana toolchain, not against themselves.
 */
describe('bet PDA', () => {
  it('matches the Solana CLI for the harness id used by the Rust tests', async () => {
    const [address] = await findBetPda({ betId: new TextEncoder().encode('bet-0000-0000-01') });
    expect(address).toBe('A55G55Q7isiBoY2bAW3xrVjgFNVvvcwnywXtbyFusdqA');
  });

  it('matches the Solana CLI for a database uuid', async () => {
    const [address] = await findBetPda({
      betId: betIdToBytes('0190f5c8-a2b3-7c4e-9d1f-2a3b4c5d6e7f'),
    });
    expect(address).toBe('GLTFQVJw91uzqQ649ZcmxDEEGgQDzWWQjquaU9P6D5rq');
  });
});
