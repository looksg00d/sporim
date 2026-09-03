/** Small deterministic PRNG (mulberry32) so fixtures are stable across runs. */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = '0123456789abcdef';

/** Deterministic RFC-4122-shaped UUID v4 string from a seed. */
export function seededUuid(seed: number): string {
  const rng = seededRng(seed);
  const chars = Array.from({ length: 32 }, () => HEX[Math.floor(rng() * 16)] ?? '0');
  chars[12] = '4';
  chars[16] = HEX[8 + Math.floor(rng() * 4)] ?? '8';
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
