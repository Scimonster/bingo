import { describe, expect, it } from "vitest";
import {
  JOIN_CODE_ALPHABET, formatSerial, generateJoinCode, isValidJoinCode, layoutMetrics, liveRoundRequestSchema,
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
