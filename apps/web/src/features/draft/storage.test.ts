import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  asUsdcAmount,
  drawnSignature,
  typedSignature,
  usdc,
  type BetDraft,
} from '@sporim/domain';
import {
  DRAFT_STORAGE_KEY,
  deserializeDraft,
  readStoredDraft,
  serializeDraft,
  writeStoredDraft,
} from './storage';

const FILLED: BetDraft = {
  terms: 'Ты не пробежишь 10 км до воскресенья.',
  format: 'bet',
  stake: usdc(20),
  deadlineSeconds: 1_788_000_000,
  decisionMode: 'referee',
  refereeRef: 'kolya',
  beneficiaryKind: null,
  beneficiaryRef: '',
  signature: drawnSignature([[0, 0, 400, 10, 800, 0]], 300),
};

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  };
}

describe('serializeDraft', () => {
  it('round-trips a filled draft, bigint stake included', () => {
    expect(deserializeDraft(serializeDraft(FILLED))).toEqual(FILLED);
  });

  it('round-trips an empty draft', () => {
    expect(deserializeDraft(serializeDraft(EMPTY_DRAFT))).toEqual(EMPTY_DRAFT);
  });

  it('stores the stake as the decimal string a person would type', () => {
    expect(JSON.parse(serializeDraft(FILLED)).stake).toBe('20');
  });

  it('keeps a stake exact down to the last base unit', () => {
    const draft = { ...FILLED, stake: asUsdcAmount(1n) };
    expect(JSON.parse(serializeDraft(draft)).stake).toBe('0.000001');
    expect(deserializeDraft(serializeDraft(draft))?.stake).toBe(1n);
  });

  it('round-trips a zero stake', () => {
    const draft = { ...FILLED, stake: usdc(0) };
    expect(deserializeDraft(serializeDraft(draft))?.stake).toBe(0n);
  });

  it('does not throw on a bigint, which plain JSON.stringify would', () => {
    expect(() => JSON.stringify(FILLED)).toThrow(TypeError);
    expect(() => serializeDraft(FILLED)).not.toThrow();
  });
});

describe('deserializeDraft', () => {
  it('reads a draft saved while the wizard still asked for the opponent, and drops the name', () => {
    // 2026-09-17: the field is gone, but a tab opened before the deploy still holds one.
    const legacy = JSON.stringify({ ...JSON.parse(serializeDraft(FILLED)), opponentRef: 'dima' });
    const restored = deserializeDraft(legacy);
    expect(restored).toEqual(FILLED);
    expect(restored).not.toHaveProperty('opponentRef');
  });

  it('returns null for nothing stored', () => {
    expect(deserializeDraft(null)).toBeNull();
    expect(deserializeDraft('')).toBeNull();
  });

  it('returns null rather than throwing on malformed JSON', () => {
    expect(deserializeDraft('{oh no')).toBeNull();
  });

  it('returns null on a shape from another version', () => {
    expect(deserializeDraft(JSON.stringify({ terms: 'x' }))).toBeNull();
  });

  it('rejects an unknown format instead of trusting it', () => {
    const raw = JSON.parse(serializeDraft(FILLED));
    expect(deserializeDraft(JSON.stringify({ ...raw, format: 'parlay' }))).toBeNull();
  });

  it('rejects a stake that is not a number', () => {
    const raw = JSON.parse(serializeDraft(FILLED));
    expect(deserializeDraft(JSON.stringify({ ...raw, stake: 'twenty' }))).toBeNull();
  });

  it('never half-applies a bad draft', () => {
    const raw = JSON.parse(serializeDraft(FILLED));
    expect(deserializeDraft(JSON.stringify({ ...raw, deadlineSeconds: 'soon' }))).toBeNull();
  });
});

describe('storage adapters', () => {
  it('writes under the versioned key', () => {
    const storage = memoryStorage();
    writeStoredDraft(storage, FILLED);
    expect(storage.map.has(DRAFT_STORAGE_KEY)).toBe(true);
  });

  it('reads back what it wrote', () => {
    const storage = memoryStorage();
    writeStoredDraft(storage, FILLED);
    expect(readStoredDraft(storage)).toEqual(FILLED);
  });

  it('clears the key when handed null', () => {
    const storage = memoryStorage();
    writeStoredDraft(storage, FILLED);
    writeStoredDraft(storage, null);
    expect(readStoredDraft(storage)).toBeNull();
  });

  it('survives a storage that throws on read', () => {
    const hostile = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readStoredDraft(hostile)).toBeNull();
  });

  it('survives a storage that throws on write', () => {
    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(() => writeStoredDraft(full, FILLED)).not.toThrow();
  });
});

describe('the signature survives a reload', () => {
  it('round-trips a drawn signature stroke for stroke', () => {
    expect(deserializeDraft(serializeDraft(FILLED))?.signature).toEqual(FILLED.signature);
  });

  it('round-trips a typed signature', () => {
    const draft = { ...FILLED, signature: typedSignature('Дима') };
    expect(deserializeDraft(serializeDraft(draft))?.signature).toEqual({
      kind: 'typed',
      name: 'Дима',
    });
  });

  it('round-trips an unsigned draft', () => {
    const draft = { ...FILLED, signature: null };
    expect(deserializeDraft(serializeDraft(draft))?.signature).toBeNull();
  });

  it('rejects a stored signature of an unknown kind', () => {
    const raw = JSON.parse(serializeDraft(FILLED));
    const tampered = { ...raw, signature: { kind: 'scanned', url: 'http://evil' } };
    expect(deserializeDraft(JSON.stringify(tampered))).toBeNull();
  });

  it('clamps a stored signature that grew beyond the rails', () => {
    const raw = JSON.parse(serializeDraft(FILLED));
    const huge = {
      ...raw,
      signature: { kind: 'drawn', strokes: [Array(2000).fill(5)], height: 300 },
    };
    const restored = deserializeDraft(JSON.stringify(huge));
    expect(restored).not.toBeNull();
    const signature = restored!.signature!;
    if (signature.kind === 'drawn') {
      const points = signature.strokes.reduce((n, s) => n + s.length / 2, 0);
      expect(points).toBeLessThanOrEqual(600);
    }
  });
});
