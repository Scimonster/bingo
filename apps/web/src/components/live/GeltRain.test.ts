import { describe, expect, it } from "vitest";
import { makeCoins } from "./GeltRain";

describe("makeCoins", () => {
  it("is deterministic per seed and stays within the shower", () => {
    const a = makeCoins(40, 7);
    expect(a).toEqual(makeCoins(40, 7));
    expect(a).not.toEqual(makeCoins(40, 8));
    expect(a).toHaveLength(40);
    for (const c of a) {
      expect(c.left).toBeGreaterThanOrEqual(0);
      expect(c.left).toBeLessThan(96);
      // Every coin has landed before the shower is removed.
      expect((c.delay + c.fall) * 1000).toBeLessThan(4200);
    }
    expect(a.some((c) => c.silver)).toBe(true);
  });
});
