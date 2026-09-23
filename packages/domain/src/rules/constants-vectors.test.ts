import { describe, expect, it } from 'vitest';
import { buildConstantsVectors, CONSTANTS_VECTORS_VERSION } from './constants-vectors';

/** The guard on the shared file — see `money/vectors.test.ts` for why it is a snapshot. */
const VECTORS_PATH = '../../test-vectors/constants.v1.json';
const serialized = `${JSON.stringify(buildConstantsVectors(), null, 2)}\n`;

describe('constants vectors', () => {
  it('matches the committed file, byte for byte', async () => {
    // If this fails after an intentional change: pnpm --filter @sporim/domain vectors
    await expect(serialized).toMatchFileSnapshot(VECTORS_PATH);
  });

  it('carries its version and names every value once', () => {
    const vectors = buildConstantsVectors();
    const names = vectors.values.map((v) => v.name);
    expect(vectors.version).toBe(CONSTANTS_VECTORS_VERSION);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps money as strings, because JSON numbers are doubles', () => {
    for (const name of ['MIN_STAKE', 'MAX_STAKE']) {
      const entry = buildConstantsVectors().values.find((v) => v.name === name);
      expect(typeof entry?.value, name).toBe('string');
    }
  });
});
