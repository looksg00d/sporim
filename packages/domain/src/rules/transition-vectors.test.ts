import { describe, expect, it } from 'vitest';
import { buildTransitionVectors, TRANSITIONS_VECTORS_VERSION } from './transition-vectors';

/** The guard on the shared file — see `money/vectors.test.ts` for why it is a snapshot. */
const VECTORS_PATH = '../../test-vectors/transitions.v1.json';
const vectors = buildTransitionVectors();
const serialized = `${JSON.stringify(vectors, null, 2)}\n`;

const find = (name: string) => {
  const found = vectors.cases.find((c) => c.name === name);
  if (!found) throw new Error(`no case ${name}`);
  return found;
};

describe('transition vectors', () => {
  it('matches the committed file, byte for byte', async () => {
    // If this fails after an intentional change: pnpm --filter @sporim/domain vectors
    await expect(serialized).toMatchFileSnapshot(VECTORS_PATH);
  });

  it('carries its version and unique case names', () => {
    expect(vectors.version).toBe(TRANSITIONS_VECTORS_VERSION);
    const names = vectors.cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every permissionless exit the program must have', () => {
    const all = new Set(vectors.cases.flatMap((c) => c.expected));
    for (const exit of ['expireUnaccepted', 'refundExpired', 'settleUncontested'] as const) {
      expect(all.has(exit), exit).toBe(true);
    }
  });

  it('pins the boundary the program got wrong: claims stop when the grace ends', () => {
    expect(find('active, last second of grace — opponent').expected).toEqual(['submitClaim']);
    expect(find('active, abandoned — opponent').expected).toEqual(['refundExpired']);
    expect(find('active, abandoned — stranger').expected).toEqual(['refundExpired']);
  });

  it('never offers screen-only actions to the program', () => {
    for (const c of vectors.cases) expect(c.expected).not.toContain('share');
  });
});
