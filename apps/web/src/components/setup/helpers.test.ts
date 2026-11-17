import { describe, expect, it } from "vitest";
import { defaultSettings } from "@bingo/core";
import { clampFreeSpace, formatDuration, parsePasteMany, parseSerialRange, syncSlotLabels, toggleCell, varietyStatus } from "./helpers";

describe("parsePasteMany", () => {
  it("trims, drops blanks and dedupes case-insensitively", () => {
    const r = parsePasteMany("  Apple \n\nbanana\napple\n  Banana  \ncherry  pie", ["Cherry"]);
    expect(r.add).toEqual(["Apple", "banana", "cherry pie"]);
    expect(r.duplicates).toEqual(["apple", "Banana"]);
  });
  it("skips existing items and lines over the limit", () => {
    const r = parsePasteMany(`a\n${"x".repeat(201)}\n${"y".repeat(200)}\r\nb`, ["A"]);
    expect(r.add).toEqual(["y".repeat(200), "b"]);
    expect(r.duplicates).toEqual(["a"]);
    expect(r.tooLong).toHaveLength(1);
  });
  it("handles Hebrew", () => {
    expect(parsePasteMany("שלום\nשלום \nעולם").add).toEqual(["שלום", "עולם"]);
  });
});

describe("varietyStatus", () => {
  const s = defaultSettings(); // 5×5 with free space → 24 cells
  it("errors below one item per cell", () => expect(varietyStatus(23, s).level).toBe("error"));
  it("warns below 2×", () => {
    const v = varietyStatus(30, s);
    expect(v.level).toBe("warn");
    expect(v.recommended).toBe(48);
  });
  it("is ok at 2×", () => expect(varietyStatus(48, s).level).toBe("ok"));
});

describe("misc helpers", () => {
  it("syncs slot labels", () => {
    expect(syncSlotLabels(["A", "B", "C"], 2)).toEqual(["A", "B"]);
    expect(syncSlotLabels(["A"], 3)).toEqual(["A", "Game 2", "Game 3"]);
  });
  it("clamps free space", () => {
    expect(clampFreeSpace(2, 2, 5, 5)).toEqual({ row: 2, col: 2 });
    expect(clampFreeSpace(4, 4, 3, 3)).toEqual({ row: 1, col: 1 });
  });
  it("toggles cells", () => {
    expect(toggleCell([3, 1], 2)).toEqual([1, 2, 3]);
    expect(toggleCell([1, 2], 1)).toEqual([2]);
  });
  it("parses serial ranges", () => {
    expect(parseSerialRange("1", "10", 20)).toEqual({ from: 1, to: 10 });
    expect(parseSerialRange("5", "2", 20)).toBeNull();
    expect(parseSerialRange("1", "21", 20)).toBeNull();
  });
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(3700)).toBe("1h 1m");
  });
});
