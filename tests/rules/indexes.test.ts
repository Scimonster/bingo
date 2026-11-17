import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface FieldOverride {
  collectionGroup: string;
  fieldPath: string;
  ttl?: boolean;
  indexes: unknown[];
}
interface IndexFile {
  indexes: { collectionGroup: string; queryScope: string; fields: { fieldPath: string; order?: string }[] }[];
  fieldOverrides: FieldOverride[];
}

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../firestore.indexes.json");
const config = JSON.parse(readFileSync(file, "utf8")) as IndexFile;

describe("firestore.indexes.json", () => {
  it("has TTL policies on expireAt for every expiring collection group", () => {
    for (const group of ["players", "claims", "private", "members", "joinCodes"]) {
      const o = config.fieldOverrides.find((f) => f.collectionGroup === group && f.fieldPath === "expireAt");
      expect(o, group).toBeDefined();
      expect(o!.ttl).toBe(true);
      expect(Array.isArray(o!.indexes)).toBe(true);
    }
  });

  it("has the collection-group index for the stale-round query", () => {
    const idx = config.indexes.find(
      (i) =>
        i.collectionGroup === "sessions" &&
        i.queryScope === "COLLECTION_GROUP" &&
        i.fields.map((f) => f.fieldPath).join(",") === "status,lastActivityAt",
    );
    expect(idx).toBeDefined();
  });
});
