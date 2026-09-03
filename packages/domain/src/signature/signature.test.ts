import { describe, expect, it } from 'vitest';
import {
  MAX_SIGNATURE_POINTS,
  MAX_SIGNATURE_STROKES,
  MAX_TYPED_SIGNATURE_LENGTH,
  clampSignature,
  drawnSignature,
  isSignatureMeaningful,
  signatureBounds,
  signatureCanonicalString,
  signatureInkLength,
  signatureToPath,
  typedSignature,
  type SignatureStroke,
} from './signature';

/** A stroke long enough to count as ink: a 400-unit horizontal sweep. */
const SWEEP: SignatureStroke = [100, 100, 300, 140, 500, 90];
const LONG: SignatureStroke = [0, 0, 400, 0, 800, 0];

describe('signatureToPath', () => {
  it('starts every stroke with a move', () => {
    expect(signatureToPath([SWEEP])).toMatch(/^M 100 100/);
  });

  it('smooths through midpoints rather than drawing raw corners', () => {
    // Three points: one quadratic through the middle, then a line to the last.
    expect(signatureToPath([SWEEP])).toBe('M 100 100 Q 300 140 400 115 L 500 90');
  });

  it('joins multiple strokes into one path, each with its own move', () => {
    const path = signatureToPath([SWEEP, LONG]);
    expect(path.match(/M /g)).toHaveLength(2);
  });

  it('gives a lone point a visible mark instead of dropping it', () => {
    expect(signatureToPath([[50, 60]])).toBe('M 50 60 l 0.1 0');
  });

  it('ignores an empty stroke', () => {
    expect(signatureToPath([[], SWEEP])).toMatch(/^M 100 100/);
    expect(signatureToPath([[]])).toBe('');
  });

  it('is empty for no strokes at all', () => {
    expect(signatureToPath([])).toBe('');
  });

  it('is deterministic — the card and the screen must draw the same ink', () => {
    expect(signatureToPath([SWEEP, LONG])).toBe(signatureToPath([SWEEP, LONG]));
  });

  it('emits no NaN when a stroke has an odd number of numbers', () => {
    expect(signatureToPath([[10, 20, 30]])).not.toMatch(/NaN/);
  });
});

describe('isSignatureMeaningful', () => {
  it('rejects nothing at all', () => {
    expect(isSignatureMeaningful(null)).toBe(false);
    expect(isSignatureMeaningful(drawnSignature([], 300))).toBe(false);
  });

  it('rejects a single tap — a formality is exactly what the ritual must not be', () => {
    expect(isSignatureMeaningful(drawnSignature([[500, 150]], 300))).toBe(false);
  });

  it('rejects a twitch too short to be a signature', () => {
    expect(isSignatureMeaningful(drawnSignature([[500, 150, 505, 152]], 300))).toBe(false);
  });

  it('accepts a real scrawl', () => {
    expect(isSignatureMeaningful(drawnSignature([LONG], 300))).toBe(true);
  });

  it('adds up ink across strokes, so a dotted signature still counts', () => {
    const dashes = [
      [0, 0, 50, 0],
      [60, 0, 110, 0],
      [120, 0, 170, 0],
    ];
    expect(signatureInkLength(drawnSignature(dashes, 300))).toBe(150);
    expect(isSignatureMeaningful(drawnSignature(dashes, 300))).toBe(true);
  });

  it('still rejects three dashes too short to add up', () => {
    const tiny = [
      [0, 0, 20, 0],
      [30, 0, 50, 0],
    ];
    expect(isSignatureMeaningful(drawnSignature(tiny, 300))).toBe(false);
  });

  it('accepts a typed name of two characters or more', () => {
    expect(isSignatureMeaningful(typedSignature('Al'))).toBe(true);
    expect(isSignatureMeaningful(typedSignature('A'))).toBe(false);
    expect(isSignatureMeaningful(typedSignature('   '))).toBe(false);
  });
});

describe('typedSignature', () => {
  it('trims surrounding space', () => {
    expect(typedSignature('  Дима  ').name).toBe('Дима');
  });

  it('caps the length rather than letting a paragraph through', () => {
    expect(typedSignature('x'.repeat(200)).name).toHaveLength(MAX_TYPED_SIGNATURE_LENGTH);
  });
});

describe('clampSignature', () => {
  it('caps the number of strokes', () => {
    const many = Array.from({ length: 100 }, () => SWEEP);
    const clamped = clampSignature(drawnSignature(many, 300));
    expect(clamped.kind).toBe('drawn');
    if (clamped.kind === 'drawn') {
      expect(clamped.strokes.length).toBeLessThanOrEqual(MAX_SIGNATURE_STROKES);
    }
  });

  it('caps the total number of points across strokes', () => {
    const fat: SignatureStroke = Array.from({ length: 2000 }, (_, i) => i % 900);
    const clamped = clampSignature(drawnSignature([fat], 300));
    if (clamped.kind === 'drawn') {
      const points = clamped.strokes.reduce((n, s) => n + s.length / 2, 0);
      expect(points).toBeLessThanOrEqual(MAX_SIGNATURE_POINTS);
    }
  });

  it('never leaves a half-point behind', () => {
    const clamped = clampSignature(drawnSignature([[1, 2, 3]], 300));
    if (clamped.kind === 'drawn') {
      for (const stroke of clamped.strokes) expect(stroke.length % 2).toBe(0);
    }
  });

  it('keeps a signature that is already within the rails unchanged in shape', () => {
    const clamped = clampSignature(drawnSignature([SWEEP], 300));
    expect(clamped.kind).toBe('drawn');
    if (clamped.kind !== 'drawn') return;
    expect(signatureToPath(clamped.strokes)).toBe(signatureToPath([SWEEP]));
  });

  it('rounds the height to a whole unit and never below one', () => {
    const clamped = clampSignature(drawnSignature([SWEEP], 0.2));
    if (clamped.kind === 'drawn') expect(clamped.height).toBe(1);
  });

  it('passes a typed signature through its own trimming', () => {
    expect(clampSignature(typedSignature('  Dima '))).toEqual({ kind: 'typed', name: 'Dima' });
  });
});

describe('signatureBounds', () => {
  it('finds the extent of the ink', () => {
    expect(signatureBounds([SWEEP])).toEqual({ minX: 100, minY: 90, maxX: 500, maxY: 140 });
  });

  it('spans every stroke', () => {
    expect(signatureBounds([SWEEP, LONG])).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 140 });
  });

  it('is null when there is no ink', () => {
    expect(signatureBounds([])).toBeNull();
    expect(signatureBounds([[]])).toBeNull();
  });
});

describe('signatureCanonicalString', () => {
  it('is stable across calls — the hash must not drift', () => {
    const signature = drawnSignature([SWEEP, LONG], 300);
    expect(signatureCanonicalString(signature)).toBe(signatureCanonicalString(signature));
  });

  it('changes when the ink changes', () => {
    const a = signatureCanonicalString(drawnSignature([SWEEP], 300));
    const b = signatureCanonicalString(drawnSignature([LONG], 300));
    expect(a).not.toBe(b);
  });

  it('changes when only the height changes, because the shape does too', () => {
    expect(signatureCanonicalString(drawnSignature([SWEEP], 300))).not.toBe(
      signatureCanonicalString(drawnSignature([SWEEP], 400)),
    );
  });

  it('distinguishes a typed name from a drawn scrawl', () => {
    expect(signatureCanonicalString(typedSignature('Dima'))).toBe('typed:Dima');
  });

  it('never collides between a two-stroke and a one-stroke signature with the same points', () => {
    const split = signatureCanonicalString(
      drawnSignature(
        [
          [0, 0],
          [1, 1],
        ],
        300,
      ),
    );
    const joined = signatureCanonicalString(drawnSignature([[0, 0, 1, 1]], 300));
    expect(split).not.toBe(joined);
  });
});
