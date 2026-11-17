/** Returns a uniform integer in [0, maxExclusive). */
export type Rng = (maxExclusive: number) => number;

/** Cryptographic RNG (browser and Node ≥ 19 both expose globalThis.crypto). Rejection-sampled, unbiased. */
export const cryptoRng: Rng = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError(`bad range ${maxExclusive}`);
  }
  const buf = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % maxExclusive;
  }
};

/** Fast seeded, non-cryptographic RNG (mulberry32) for client-side sample previews and tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * maxExclusive);
  };
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(input: readonly T[], rng: Rng): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Picks k distinct elements in random order (partial Fisher–Yates). */
export function sample<T>(input: readonly T[], k: number, rng: Rng): T[] {
  if (k > input.length) throw new RangeError("sample larger than population");
  const a = input.slice();
  for (let i = 0; i < k; i++) {
    const j = i + rng(a.length - i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}
