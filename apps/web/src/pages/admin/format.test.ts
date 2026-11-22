import { describe, expect, it } from "vitest";
import { formatBytes, formatWhen } from "./format";

describe("formatBytes", () => {
  it("picks a unit and keeps one decimal below 10", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});

describe("formatWhen", () => {
  const now = 1_700_000_000_000;
  it("shows recent times relatively and unknown as a dash", () => {
    expect(formatWhen(null, now)).toBe("—");
    expect(formatWhen(now - 10_000, now)).toBe("just now");
    expect(formatWhen(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatWhen(now - 3 * 3600_000, now)).toBe("3 h ago");
    expect(formatWhen(now - 2 * 86_400_000, now)).toBe("2 d ago");
  });
});
