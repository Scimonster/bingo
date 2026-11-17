import { describe, expect, it } from "vitest";
import { FREE, boardFingerprint, cryptoRng, generateSheets, GenerationError, maxSheetOverlap, seededRng, varietyRatio } from "../src";

const items = (n: number) => Array.from({ length: n }, (_, i) => `i${i}`);
const settings = { rows: 5, cols: 5, freeSpace: { enabled: true, row: 2, col: 2 }, boardsPerSheet: 3 };

describe("generateSheets", () => {
  it("builds boards with FREE at the free index and distinct items", () => {
    const sheets = generateSheets({ itemIds: items(60), settings, count: 10, rng: seededRng(1) });
    expect(sheets).toHaveLength(10);
    expect(sheets.map((s) => s.serial)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const s of sheets) {
      expect(s.boards).toHaveLength(3);
      for (const b of s.boards) {
        expect(b.cells).toHaveLength(25);
        expect(b.cells[12]).toBe(FREE);
        expect(new Set(b.cells).size).toBe(25);
        expect(b.fingerprint).toBe(boardFingerprint(b.cells));
      }
    }
  });

  it("keeps boards unique per slot, including existing fingerprints, and continues serials", () => {
    const first = generateSheets({ itemIds: items(30), settings, count: 50, rng: seededRng(2) });
    const existing = [0, 1, 2].map((slot) => new Set(first.map((s) => s.boards[slot]!.fingerprint)));
    const more = generateSheets({ itemIds: items(30), settings, count: 50, startAfterSerial: 50, existingFingerprints: existing, rng: seededRng(2) });
    expect(more[0]!.serial).toBe(51);
    for (let slot = 0; slot < 3; slot++) {
      const all = [...first, ...more].map((s) => s.boards[slot]!.fingerprint);
      expect(new Set(all).size).toBe(100);
    }
  });

  it("limits item overlap between boards on one sheet", () => {
    const sheets = generateSheets({ itemIds: items(48), settings, count: 40, rng: cryptoRng });
    const max = maxSheetOverlap(24, 48);
    expect(max).toBe(12);
    for (const s of sheets) {
      for (let a = 0; a < 3; a++)
        for (let b = a + 1; b < 3; b++) {
          const setB = new Set(s.boards[b]!.cells);
          const shared = s.boards[a]!.cells.filter((x) => x !== FREE && setB.has(x)).length;
          expect(shared).toBeLessThanOrEqual(max);
        }
    }
  });

  it("works without free space and with exactly enough items", () => {
    const s = { rows: 3, cols: 3, freeSpace: { enabled: false, row: 0, col: 0 }, boardsPerSheet: 2 };
    const sheets = generateSheets({ itemIds: items(9), settings: s, count: 5, rng: seededRng(3) });
    expect(sheets[0]!.boards[0]!.cells).not.toContain(FREE);
  });

  it("fails with too few items", () => {
    expect(() => generateSheets({ itemIds: items(10), settings, count: 1, rng: seededRng(1) })).toThrow(GenerationError);
  });

  it("fails when unique boards run out", () => {
    const s = { rows: 3, cols: 3, freeSpace: { enabled: false, row: 0, col: 0 }, boardsPerSheet: 1 };
    // 2×2... use tiny grid via 3x3 with 9 items: 9! boards, fine; force exhaustion with maxAttempts and existing set
    const one = generateSheets({ itemIds: items(9), settings: s, count: 1, rng: seededRng(9) });
    const fp = new Set([one[0]!.boards[0]!.fingerprint]);
    const constRng = () => 0; // always the same board
    expect(() => generateSheets({ itemIds: items(9), settings: s, count: 1, rng: constRng, existingFingerprints: [new Set([boardFingerprint(generateSheets({ itemIds: items(9), settings: s, count: 1, rng: constRng })[0]!.boards[0]!.cells)])], maxAttempts: 20 })).toThrow(/unique/);
    expect(fp.size).toBe(1);
  });

  it("computes variety ratio", () => {
    expect(varietyRatio(48, settings)).toBe(2);
  });
});
