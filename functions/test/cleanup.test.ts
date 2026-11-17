import { describe, expect, it } from "vitest";
import { DAY_MS } from "@bingo/core";
import { bucket, db } from "../src/admin";
import { cleanupUnreferencedImages } from "../src/handlers/scheduled";
import { createGame, newHost } from "./helpers";

const exists = async (path: string) => (await bucket().file(path).exists())[0];

describe("cleanupUnreferencedImages", () => {
  it("deletes old unreferenced image folders and old exports only", async () => {
    const host = await newHost();
    const gameId = await createGame(host);
    const base = `users/${host.uid}/images`;
    const save = (p: string) => bucket().file(p).save(Buffer.from("x"), { contentType: "image/webp" });
    await Promise.all(
      ["used", "free", "orphan"].flatMap((id) => [save(`${base}/${id}/thumb.webp`), save(`${base}/${id}/print.webp`)]),
    );
    await bucket().file(`exports/${gameId}/sheets.pdf`).save(Buffer.from("%PDF"), { contentType: "application/pdf" });
    const g = db().collection("games").doc(gameId);
    await g.collection("items").doc("img").set({ type: "image", storagePath: `${base}/used`, createdAt: 1 });
    await g.update({ "settings.freeSpace.content": { type: "image", storagePath: `${base}/free` } });

    // Fresh uploads are kept even when unreferenced (an item doc may not be written yet).
    await cleanupUnreferencedImages();
    expect(await exists(`${base}/orphan/thumb.webp`)).toBe(true);

    await cleanupUnreferencedImages(Date.now() + 2 * DAY_MS);
    expect(await exists(`${base}/orphan/thumb.webp`)).toBe(false);
    expect(await exists(`${base}/orphan/print.webp`)).toBe(false);
    expect(await exists(`${base}/used/print.webp`)).toBe(true);
    expect(await exists(`${base}/free/thumb.webp`)).toBe(true);
    expect(await exists(`exports/${gameId}/sheets.pdf`)).toBe(true);

    await cleanupUnreferencedImages(Date.now() + 8 * DAY_MS);
    expect(await exists(`exports/${gameId}/sheets.pdf`)).toBe(false);
  });
});
