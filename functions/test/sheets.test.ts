import { describe, expect, it } from "vitest";
import { db } from "../src/admin";
import { generateSheetsHandler, resetSheetsHandler } from "../src/handlers/sheets";
import { cloneGameHandler, deleteGameHandler, deleteRoundHandler } from "../src/handlers/games";
import { anon, createGame, expectError, gameWithSheets, live, newHost, SETTINGS_3x3 } from "./helpers";

const game = (id: string) => db().collection("games").doc(id);

describe("generateSheets", () => {
  it("creates sheets and boards, continues serials, keeps boards unique per slot and locks content", async () => {
    const host = await newHost();
    const gameId = await createGame(host);
    const r1 = await generateSheetsHandler(host, { gameId, count: 30 });
    expect(r1).toEqual({ created: 30, firstSerial: 1, lastSerial: 30 });
    const r2 = await generateSheetsHandler(host, { gameId, count: 20 });
    expect(r2).toEqual({ created: 20, firstSerial: 31, lastSerial: 50 });

    const sheets = await game(gameId).collection("sheets").get();
    expect(sheets.size).toBe(50);
    expect(sheets.docs.map((d) => d.id).sort()[0]).toBe("001");
    const s42 = (await game(gameId).collection("sheets").doc("042").get()).data()!;
    expect(s42).toEqual({ serial: 42, boardIds: ["042-0", "042-1"] });

    const boards = await game(gameId).collection("boards").get();
    expect(boards.size).toBe(100);
    for (const slot of [0, 1]) {
      const fps = boards.docs.filter((b) => b.get("slot") === slot).map((b) => b.get("fingerprint"));
      expect(new Set(fps).size).toBe(50);
    }
    const b = (await game(gameId).collection("boards").doc("042-1").get()).data()!;
    expect(b.sheetSerial).toBe(42);
    expect(b.cells).toHaveLength(9);
    expect(b.cells[4]).toBe("FREE");
    expect((await game(gameId).get()).get("contentLocked")).toBe(true);
  });

  it("fails without enough items and leaves the game unlocked", async () => {
    const host = await newHost();
    const gameId = await createGame(host, { items: 5 });
    await expectError(generateSheetsHandler(host, { gameId, count: 1 }), "failed-precondition", "not-enough-items");
    expect((await game(gameId).get()).get("contentLocked")).toBe(false);
  });

  it("enforces the per-game sheet limit and input validation", async () => {
    const host = await newHost();
    const gameId = await createGame(host);
    await expectError(generateSheetsHandler(host, { gameId, count: 0 }), "invalid-argument", "invalid-request");
    await expectError(generateSheetsHandler(host, { gameId, count: 501 }), "invalid-argument");
    await expectError(generateSheetsHandler(host, { gameId: "nope", count: 1 }), "not-found", "game-not-found");
  });

  it("denies non-owners and anonymous callers", async () => {
    const host = await newHost();
    const other = await newHost();
    const gameId = await createGame(host);
    await expectError(generateSheetsHandler(other, { gameId, count: 1 }), "permission-denied", "not-owner");
    await expectError(generateSheetsHandler({ uid: host.uid, isAnonymous: true }, { gameId, count: 1 }), "permission-denied");
    await expectError(generateSheetsHandler({ uid: null, isAnonymous: false }, { gameId, count: 1 }), "unauthenticated");
  });
});

describe("resetSheets", () => {
  it("refuses while a round is open, then deletes sheets and boards and unlocks", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 10);
    const { sessionId } = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    await expectError(resetSheetsHandler(host, { gameId }), "failed-precondition", "round-open");
    await expectError(resetSheetsHandler(anon(), { gameId }), "permission-denied");
    await live(host, { action: "endRound", gameId, sessionId });
    expect(await resetSheetsHandler(host, { gameId })).toEqual({ deleted: 10 });
    expect((await game(gameId).collection("sheets").get()).size).toBe(0);
    expect((await game(gameId).collection("boards").get()).size).toBe(0);
    expect((await game(gameId).get()).get("contentLocked")).toBe(false);
    // Serials restart at 1 after a reset.
    expect((await generateSheetsHandler(host, { gameId, count: 2 })).firstSerial).toBe(1);
  });
});

describe("cloneGame", () => {
  it("copies settings, layout, patterns and items (same storage paths) without sheets", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 3, { title: "Party" });
    await game(gameId).update({ customPatterns: [{ id: "x", name: "X", cells: [0, 2, 4, 6, 8] }] });
    await game(gameId).collection("items").doc("img").set({ type: "image", storagePath: `users/${host.uid}/images/abc`, createdAt: 1 });
    const { gameId: copyId } = await cloneGameHandler(host, { gameId });
    const copy = (await game(copyId).get()).data()!;
    expect(copy).toMatchObject({
      ownerId: host.uid,
      title: "Copy of Party",
      playerLanguage: "en",
      settings: SETTINGS_3x3,
      contentLocked: false,
      clonedFrom: gameId,
      customPatterns: [{ id: "x", name: "X", cells: [0, 2, 4, 6, 8] }],
    });
    expect(copy.printLayout.slotLabels).toEqual(["Game 1", "Game 2"]);
    const items = await game(copyId).collection("items").get();
    expect(items.size).toBe(17);
    expect(items.docs.find((d) => d.id === "img")!.get("storagePath")).toBe(`users/${host.uid}/images/abc`);
    expect((await game(copyId).collection("sheets").get()).size).toBe(0);
    await expectError(cloneGameHandler(await newHost(), { gameId }), "permission-denied");
  });
});

describe("deleteGame / deleteRound", () => {
  it("deleteRound only deletes ended rounds, recursively", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 3);
    const { sessionId, joinCode } = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    const player = anon();
    await live(player, { action: "joinRound", code: joinCode, name: "Ann" });
    await expectError(deleteRoundHandler(host, { gameId, sessionId }), "failed-precondition", "round-open");
    await live(host, { action: "endRound", gameId, sessionId });
    await expectError(deleteRoundHandler(player, { gameId, sessionId }), "permission-denied");
    await deleteRoundHandler(host, { gameId, sessionId });
    const s = game(gameId).collection("sessions").doc(sessionId);
    expect((await s.get()).exists).toBe(false);
    expect((await s.collection("players").get()).size).toBe(0);
    expect((await s.collection("private").get()).size).toBe(0);
    const member = (await game(gameId).collection("members").doc(player.uid!).get()).data()!;
    expect(member.sessions[sessionId]).toBeUndefined();
  });

  it("deleteGame removes the game, its subcollections and its join codes", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 3);
    const { sessionId, joinCode } = await live(host, { action: "startRound", gameId, options: { medium: "digital", mode: "central" } });
    await live(anon(), { action: "joinRound", code: joinCode, name: "Bob" });
    await expectError(deleteGameHandler(await newHost(), { gameId }), "permission-denied");
    await deleteGameHandler(host, { gameId });
    expect((await game(gameId).get()).exists).toBe(false);
    expect((await game(gameId).collection("sheets").get()).size).toBe(0);
    expect((await game(gameId).collection("sessions").doc(sessionId).collection("players").get()).size).toBe(0);
    expect((await game(gameId).collection("members").get()).size).toBe(0);
    expect((await db().collection("joinCodes").doc(joinCode).get()).exists).toBe(false);
  });
});
