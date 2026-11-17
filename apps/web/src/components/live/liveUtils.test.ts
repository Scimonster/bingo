import { describe, expect, it } from "vitest";
import {
  autoDrawBlocker, bestGridColumns, coveredCells, formatDuration, isAutoDrawDue, normalizeSerialInput, parseSheetQr, readLastRound,
  secondsUntil, spinFrames, spinSchedule, toggleMark, writeLastRound, type AutoDrawSession,
} from "./liveUtils";

describe("parseSheetQr", () => {
  it("parses full URLs and paths", () => {
    expect(parseSheetQr("https://bingo.example/s/game1/042")).toEqual({ gameId: "game1", serial: "042" });
    expect(parseSheetQr("/s/abc/7")).toEqual({ gameId: "abc", serial: "007" });
    expect(parseSheetQr("http://localhost:5173/s/abc/1234/")).toEqual({ gameId: "abc", serial: "1234" });
  });
  it("rejects other content", () => {
    expect(parseSheetQr("https://bingo.example/join/ABCDEF")).toBeNull();
    expect(parseSheetQr("/s/abc/xyz")).toBeNull();
    expect(parseSheetQr("/s/abc/0")).toBeNull();
    expect(parseSheetQr("hello")).toBeNull();
  });
});

describe("normalizeSerialInput", () => {
  it("pads and strips", () => {
    expect(normalizeSerialInput(" 42 ")).toBe("042");
    expect(normalizeSerialInput("№ 5")).toBe("005");
    expect(normalizeSerialInput("abc")).toBeNull();
  });
});

describe("auto-draw", () => {
  const base: AutoDrawSession = {
    status: "live", mode: "central", autoDraw: { enabled: true, intervalSec: 20, nextDrawAt: 1000 }, pendingClaims: 0, totalItems: 10, drawCount: 3,
  };
  it("is due once nextDrawAt passes", () => {
    expect(isAutoDrawDue(base, 999)).toBe(false);
    expect(isAutoDrawDue(base, 1000)).toBe(true);
  });
  it("pauses for claims, empty bag, status, disabled, self mode", () => {
    expect(autoDrawBlocker({ ...base, pendingClaims: 1 })).toBe("claims");
    expect(autoDrawBlocker({ ...base, drawCount: 10 })).toBe("empty");
    expect(autoDrawBlocker({ ...base, status: "paused" })).toBe("notLive");
    expect(autoDrawBlocker({ ...base, autoDraw: { enabled: false, intervalSec: 20 } })).toBe("off");
    expect(autoDrawBlocker({ ...base, mode: "self" })).toBe("off");
    expect(isAutoDrawDue({ ...base, pendingClaims: 2 }, 5000)).toBe(false);
    expect(isAutoDrawDue({ ...base, autoDraw: { enabled: true, intervalSec: 20, nextDrawAt: null } }, 5000)).toBe(false);
  });
  it("counts down in whole seconds", () => {
    expect(secondsUntil(5000, 3001)).toBe(2);
    expect(secondsUntil(5000, 6000)).toBe(0);
    expect(secondsUntil(null, 0)).toBeNull();
  });
});

describe("last round storage", () => {
  it("round-trips and tolerates garbage", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    writeLastRound(s, "g", "sess");
    expect(m.get("bingo:lastRound:g")).toBe('{"sessionId":"sess"}');
    expect(readLastRound(s, "g")).toBe("sess");
    m.set("bingo:lastRound:g", "nope");
    expect(readLastRound(s, "g")).toBeNull();
    expect(readLastRound(s, "other")).toBeNull();
  });
});

describe("board helpers", () => {
  it("covers drawn and free cells", () => {
    expect([...coveredCells(["a", "FREE", "b", "c"], new Set(["c"]))]).toEqual([1, 3]);
  });
  it("toggles marks", () => {
    expect(toggleMark([3, 1], 2)).toEqual([1, 2, 3]);
    expect(toggleMark([1, 2], 2)).toEqual([1]);
    expect(toggleMark(undefined, 0)).toEqual([0]);
  });
});

describe("spinner", () => {
  it("schedule slows down and sums to total", () => {
    const s = spinSchedule(10, 2000);
    expect(s).toHaveLength(10);
    expect(s[9]!).toBeGreaterThan(s[0]!);
    expect(Math.abs(s.reduce((a, b) => a + b, 0) - 2000)).toBeLessThanOrEqual(10);
  });
  it("frames come from the pool and avoid the final item", () => {
    const f = spinFrames(["a", "b", "c", "d"], 20, "a");
    expect(f).toHaveLength(20);
    expect(f.every((x) => ["b", "c", "d"].includes(x))).toBe(true);
    expect(spinFrames([], 5, "a")).toEqual([]);
  });
  it("formats durations", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

describe("bestGridColumns", () => {
  it("fills a wide box with more columns", () => {
    expect(bestGridColumns(36, 1200, 600)).toMatchObject({ cols: 9, rows: 4 });
    expect(bestGridColumns(36, 600, 600)).toMatchObject({ cols: 6, rows: 6, size: 100 });
    expect(bestGridColumns(0, 100, 100).cols).toBe(1);
  });
});
