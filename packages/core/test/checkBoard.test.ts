import { describe, expect, it } from "vitest";
import { BUILTIN_PATTERNS, FREE, checkBoard, expandPattern } from "../src";

const grid = { rows: 5, cols: 5 };
const cells = Array.from({ length: 25 }, (_, i) => (i === 12 ? FREE : `c${i}`));
const P = (id: string) => BUILTIN_PATTERNS.find((p) => p.id === id)!;

describe("patterns", () => {
  it("expands line into 5 rows, 5 cols, 2 diagonals", () => {
    expect(expandPattern(P("line"), grid)).toHaveLength(12);
    expect(expandPattern(P("diagonal"), { rows: 4, cols: 5 })).toHaveLength(0);
    expect(expandPattern(P("corners"), grid)).toEqual([[0, 4, 20, 24]]);
  });
  it("filters out-of-range custom cells", () => {
    expect(expandPattern({ id: "x", name: "x", cells: [0, 99, 6, 6] }, grid)).toEqual([[0, 6]]);
  });
});

describe("checkBoard", () => {
  it("counts the free space and reports a row win", () => {
    const r = checkBoard(cells, grid, ["c10", "c11", "c13", "c14"], [P("line")]);
    expect(r.won).toHaveLength(1);
    expect(r.won[0]!.cells).toEqual([10, 11, 12, 13, 14]);
    expect(r.covered).toEqual([10, 11, 12, 13, 14]);
  });
  it("reports missing counts for unmet patterns", () => {
    const r = checkBoard(cells, grid, ["c0", "c6", "c18"], [P("line"), P("corners"), P("blackout")]);
    expect(r.won).toHaveLength(0);
    const by = Object.fromEntries(r.unmet.map((u) => [u.pattern.id, u.missing]));
    expect(by).toEqual({ line: 1, corners: 3, blackout: 21 });
  });
  it("ignores drawn items that are not on the board", () => {
    const r = checkBoard(cells, grid, ["zzz"], [P("corners")]);
    expect(r.unmet[0]!.missing).toBe(4);
  });
  it("custom pattern win", () => {
    const r = checkBoard(cells, grid, new Set(["c0", "c24"]), [{ id: "x", name: "X", cells: [0, 12, 24] }]);
    expect(r.won.map((w) => w.pattern.id)).toEqual(["x"]);
  });
});
