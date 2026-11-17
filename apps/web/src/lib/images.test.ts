import { describe, expect, it } from "vitest";
import { fitWithin, validateImageFile } from "./images";

describe("fitWithin", () => {
  it("scales landscape images to the max edge", () => expect(fitWithin(4000, 3000, 1200)).toEqual({ w: 1200, h: 900 }));
  it("scales portrait images", () => expect(fitWithin(1000, 2000, 256)).toEqual({ w: 128, h: 256 }));
  it("never upscales", () => expect(fitWithin(100, 50, 256)).toEqual({ w: 100, h: 50 }));
  it("keeps at least 1px", () => expect(fitWithin(10000, 1, 256)).toEqual({ w: 256, h: 1 }));
});

describe("validateImageFile", () => {
  it("accepts allowed types under 10 MB", () => expect(validateImageFile({ type: "image/png", size: 1000 })).toBeNull());
  it("rejects other types", () => expect(validateImageFile({ type: "image/svg+xml", size: 1000 })).toMatch(/only PNG/));
  it("rejects files over 10 MB", () => expect(validateImageFile({ type: "image/jpeg", size: 11 * 1024 * 1024 })).toMatch(/10 MB/));
});
