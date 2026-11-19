import { describe, expect, it } from "vitest";
import {
  INFO_BLOCK, JOIN_CODE_ALPHABET, blockOrder, formatSerial, generateJoinCode, isValidJoinCode, layoutMetrics, liveRoundRequestSchema,
  normalizeJoinCode, parseInfoText, parseSerial, sanitizeInfoText, seededRng, shuffle, cryptoRng, roundOptionsSchema,
} from "../src";

describe("codes", () => {
  it("join codes avoid ambiguous characters", () => {
    for (const ch of "0O1IL") expect(JOIN_CODE_ALPHABET).not.toContain(ch);
    const c = generateJoinCode(seededRng(5));
    expect(isValidJoinCode(c)).toBe(true);
    expect(normalizeJoinCode(" ab-c d ")).toBe("ABCD");
  });
  it("serials", () => {
    expect(formatSerial(42)).toBe("042");
    expect(formatSerial(1234)).toBe("1234");
    expect(parseSerial("№ 042")).toBe(42);
    expect(parseSerial("x")).toBeNull();
  });
});

describe("rng", () => {
  it("shuffle is a permutation", () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    expect(shuffle(a, cryptoRng).sort((x, y) => x - y)).toEqual(a);
  });
  it("cryptoRng stays in range", () => {
    for (let i = 0; i < 1000; i++) {
      const v = cryptoRng(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});

describe("layoutMetrics", () => {
  it("three 5×5 boards on A4 landscape give ~17 mm cells", () => {
    const m = layoutMetrics({ paperSize: "A4", orientation: "landscape", arrangement: "row", marginMm: 10, boardsPerSheet: 3, rows: 5, cols: 5 });
    expect(m.cellMm).toBeGreaterThan(15);
    expect(m.cellMm).toBeLessThan(19);
    expect(m.tooSmall).toBe(false);
  });
  it("flags small cells for 8×8 with three boards", () => {
    const m = layoutMetrics({ paperSize: "A4", orientation: "landscape", arrangement: "row", marginMm: 10, boardsPerSheet: 3, rows: 8, cols: 8 });
    expect(m.tooSmall).toBe(true);
  });
  it("stretches boards to fill the box and reclaims the info area without info text", () => {
    const base = { paperSize: "A4", orientation: "landscape", arrangement: "row", marginMm: 10, boardsPerSheet: 3, rows: 5, cols: 5 } as const;
    const square = layoutMetrics(base);
    const stretched = layoutMetrics({ ...base, stretch: true, hasInfo: true });
    const noInfo = layoutMetrics({ ...base, stretch: true, hasInfo: false });
    expect(square.cellW).toBeCloseTo(square.cellH);
    expect(stretched.boardW).toBeCloseTo(square.boardW);
    expect(stretched.boardH).toBeGreaterThan(square.boardH);
    expect(noInfo.boardH).toBeGreaterThan(stretched.boardH);
    expect(stretched.cellMm).toBeCloseTo(Math.min(stretched.cellW, stretched.cellH));
  });
});

describe("blockOrder", () => {
  it("defaults to slots, plus the info panel for grids with 2–3 boards", () => {
    expect(blockOrder(undefined, "row", 3)).toEqual([0, 1, 2]);
    expect(blockOrder(undefined, "grid", 3)).toEqual([0, 1, 2, INFO_BLOCK]);
    expect(blockOrder(undefined, "grid", 4)).toEqual([0, 1, 2, 3]);
    expect(blockOrder([2, 0, 1], "single", 1)).toEqual([0]);
  });
  it("keeps valid permutations and rejects anything else", () => {
    expect(blockOrder([INFO_BLOCK, 2, 0, 1], "grid", 3)).toEqual([INFO_BLOCK, 2, 0, 1]);
    expect(blockOrder([2, 1, 0], "column", 3)).toEqual([2, 1, 0]);
    expect(blockOrder([INFO_BLOCK, 1, 0], "row", 2)).toEqual([0, 1]);
    expect(blockOrder([0, 0, 1], "row", 3)).toEqual([0, 1, 2]);
    expect(blockOrder([1, 0], "row", 3)).toEqual([0, 1, 2]);
  });
});

describe("markdown", () => {
  it("parses bold, italic, lists and breaks", () => {
    const b = parseInfoText("Hello **big** *world*\nline 2\n\n- a\n- b\n1. one\n2. two");
    expect(b.map((x) => x.t)).toEqual(["p", "ul", "ol"]);
    expect(b[0]).toEqual({ t: "p", c: [{ t: "text", v: "Hello " }, { t: "b", c: [{ t: "text", v: "big" }] }, { t: "text", v: " " }, { t: "i", c: [{ t: "text", v: "world" }] }, { t: "br" }, { t: "text", v: "line 2" }] });
  });
  it("sanitizes html and links", () => {
    expect(sanitizeInfoText("<script>x</script>[a](http://x) # h")).toBe("xa # h");
  });
});

describe("api schemas", () => {
  it("applies round option defaults", () => {
    const o = roundOptionsSchema.parse({ medium: "paper", mode: "central" });
    expect(o.patterns[0]!.id).toBe("line");
    expect(o.boardsPerPlayer).toBe(1);
  });
  it("validates liveRound actions", () => {
    expect(liveRoundRequestSchema.safeParse({ action: "joinRound", code: "ABC234", name: "" }).success).toBe(false);
    expect(liveRoundRequestSchema.safeParse({ action: "draw", gameId: "g", sessionId: "s", expectedCount: 0 }).success).toBe(true);
  });
});
