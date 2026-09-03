/**
 * The signature a person draws when they lock a bet in.
 *
 * Stored as **stroke points, never as an image**. Three reasons, all of them load-bearing:
 *
 * 1. `next/og` renders the bet card through satori, which draws an `<svg><path>` but cannot
 *    embed a canvas blob. The share card is the growth loop; the signature has to survive
 *    into it.
 * 2. A few hundred integers is a couple of kilobytes. A PNG of the same scrawl is tens.
 * 3. Points are resolution-independent, so the same signature is crisp on a phone and on a
 *    1200×630 card.
 *
 * Coordinates are normalised to a `SIGNATURE_WIDTH`-wide space with the aspect ratio kept,
 * so `height` travels with the strokes and the viewBox can be reconstructed exactly.
 *
 * This is a ritual and a keepsake. It is **not** an electronic signature and nothing in the
 * product may describe it as legally binding.
 */

export const SIGNATURE_WIDTH = 1000;

/** Guard rails: a signature is a scrawl, not a drawing. */
export const MAX_SIGNATURE_STROKES = 24;
export const MAX_SIGNATURE_POINTS = 600;
export const MAX_TYPED_SIGNATURE_LENGTH = 48;

/** How much ink counts as a signature rather than an accidental tap. */
const MIN_INK_LENGTH = 120;

/** Flat `[x0, y0, x1, y1, …]` — half the JSON of an array of objects. */
export type SignatureStroke = readonly number[];

export interface DrawnSignature {
  readonly kind: 'drawn';
  readonly strokes: readonly SignatureStroke[];
  /** Height of the normalised space; width is always `SIGNATURE_WIDTH`. */
  readonly height: number;
}

export interface TypedSignature {
  readonly kind: 'typed';
  readonly name: string;
}

/** Typed is a first-class alternative, not a degraded one: a drawn-only gate excludes
 *  anyone who cannot use a pointer. */
export type Signature = DrawnSignature | TypedSignature;

export function drawnSignature(
  strokes: readonly SignatureStroke[],
  height: number,
): DrawnSignature {
  return { kind: 'drawn', strokes, height };
}

export function typedSignature(name: string): TypedSignature {
  return { kind: 'typed', name: name.trim().slice(0, MAX_TYPED_SIGNATURE_LENGTH) };
}

function strokeLength(stroke: SignatureStroke): number {
  let total = 0;
  for (let i = 2; i + 1 < stroke.length; i += 2) {
    const dx = (stroke[i] ?? 0) - (stroke[i - 2] ?? 0);
    const dy = (stroke[i + 1] ?? 0) - (stroke[i - 1] ?? 0);
    total += Math.hypot(dx, dy);
  }
  return total;
}

/** Total ink laid down, in normalised units. */
export function signatureInkLength(signature: Signature): number {
  if (signature.kind === 'typed') return 0;
  return signature.strokes.reduce((sum, stroke) => sum + strokeLength(stroke), 0);
}

/**
 * Is there enough here to call it signed? A single tap leaves one point and no length —
 * accepting that would make the ritual a formality, which is the one thing it must not be.
 */
export function isSignatureMeaningful(signature: Signature | null): boolean {
  if (signature === null) return false;
  if (signature.kind === 'typed') return signature.name.trim().length >= 2;
  if (signature.strokes.length === 0) return false;
  return signatureInkLength(signature) >= MIN_INK_LENGTH;
}

/**
 * Turns strokes into SVG path data, smoothing through the midpoints so the result reads as
 * ink rather than as a seismograph. Pure, so the exact same string is used by the screen,
 * the share card and the tests.
 */
export function signatureToPath(strokes: readonly SignatureStroke[]): string {
  const parts: string[] = [];

  for (const stroke of strokes) {
    const count = Math.floor(stroke.length / 2);
    if (count === 0) continue;

    const at = (index: number): [number, number] => [
      stroke[index * 2] ?? 0,
      stroke[index * 2 + 1] ?? 0,
    ];

    const [x0, y0] = at(0);
    if (count === 1) {
      // A lone point still deserves a mark — a dot on the i.
      parts.push(`M ${x0} ${y0} l 0.1 0`);
      continue;
    }

    let path = `M ${x0} ${y0}`;
    for (let index = 1; index < count - 1; index += 1) {
      const [cx, cy] = at(index);
      const [nx, ny] = at(index + 1);
      const mx = round((cx + nx) / 2);
      const my = round((cy + ny) / 2);
      path += ` Q ${cx} ${cy} ${mx} ${my}`;
    }
    const [lastX, lastY] = at(count - 1);
    path += ` L ${lastX} ${lastY}`;
    parts.push(path);
  }

  return parts.join(' ');
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface SignatureBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function signatureBounds(strokes: readonly SignatureStroke[]): SignatureBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (let i = 0; i + 1 < stroke.length; i += 2) {
      const x = stroke[i] ?? 0;
      const y = stroke[i + 1] ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * Trims a signature to the guard rails. Applied on capture *and* on read, because a stored
 * draft is untrusted input like any other.
 */
export function clampSignature(signature: Signature): Signature {
  if (signature.kind === 'typed') return typedSignature(signature.name);

  let budget = MAX_SIGNATURE_POINTS;
  const strokes: SignatureStroke[] = [];

  for (const stroke of signature.strokes.slice(0, MAX_SIGNATURE_STROKES)) {
    if (budget <= 0) break;
    const points = Math.min(Math.floor(stroke.length / 2), budget);
    if (points === 0) continue;
    strokes.push(stroke.slice(0, points * 2).map(round));
    budget -= points;
  }

  return drawnSignature(strokes, Math.max(1, Math.round(signature.height)));
}

/**
 * The canonical text form, for hashing into the commitment alongside the terms.
 *
 * Hashing happens in the chain layer, not here — the domain stays free of platform crypto.
 * What the domain owes that layer is a byte-for-byte stable rendering, so the same
 * signature always produces the same hash and a card can be proved to carry the scrawl that
 * was actually signed.
 */
export function signatureCanonicalString(signature: Signature): string {
  if (signature.kind === 'typed') return `typed:${signature.name.trim()}`;
  const strokes = signature.strokes.map((stroke) => stroke.map(round).join(',')).join(';');
  return `drawn:${signature.height}:${strokes}`;
}
