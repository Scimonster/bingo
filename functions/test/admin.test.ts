import { describe, expect, it } from "vitest";
import type { AdminResponses } from "@bingo/core";
import { bucket, db } from "../src/admin";
import { adminHandler } from "../src/handlers/adminPanel";
import { deleteGameHandler, deleteRoundHandler } from "../src/handlers/games";
import { generateSheetsHandler } from "../src/handlers/sheets";
import { anon, createGame, expectError, gameWithSheets, getSession, live, newAdmin, newHost, sessionDoc } from "./helpers";

const call = async <A extends keyof AdminResponses>(ctx: Parameters<typeof adminHandler>[0], req: { action: A } & Record<string, unknown>) =>
  (await adminHandler(ctx, req)) as AdminResponses[A];

describe("admin callable: access", () => {
  it("refuses non-admins, anonymous users and the signed-out", async () => {
    const host = await newHost();
    await expectError(adminHandler(host, { action: "overview" }), "permission-denied", "not-admin");
    await expectError(adminHandler({ ...anon(), isAdmin: true }, { action: "overview" }), "permission-denied", "not-admin");
    await expectError(adminHandler({ uid: null, isAnonymous: false }, { action: "overview" }), "unauthenticated");
  });

  it("validates the request", async () => {
    const admin = await newAdmin();
    await expectError(adminHandler(admin, { action: "nope" }), "invalid-argument", "invalid-request");
    await expectError(adminHandler(admin, { action: "runJob", job: "rm -rf" }), "invalid-argument", "invalid-request");
  });
});

describe("admin callable: overview", () => {
  it("lists hosts, games with counts and rounds, and totals", async () => {
    const admin = await newAdmin();
    const host = await newHost();
    const gameId = await gameWithSheets(host, 4, { title: "Admin overview game" });
    const { sessionId } = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    const before = await call(admin, { action: "overview" });

    const g = before.games.find((x) => x.gameId === gameId)!;
    expect(g).toMatchObject({ title: "Admin overview game", ownerId: host.uid, itemCount: 16, sheetCount: 4, contentLocked: true });
    expect(g.ownerEmail).toMatch(/^host-.*@example\.com$/);
    expect(g.rounds).toHaveLength(1);
    expect(g.rounds[0]).toMatchObject({ sessionId, status: "lobby", medium: "paper", mode: "central", drawCount: 0 });

    const h = before.hosts.find((x) => x.uid === host.uid)!;
    expect(h).toMatchObject({ gameCount: 1, isAdmin: false, disabled: false });
    expect(before.hosts.find((x) => x.uid === admin.uid)?.isAdmin).toBe(true);

    expect(before.stats.games).toBeGreaterThanOrEqual(1);
    expect(before.stats.sheets).toBeGreaterThanOrEqual(4);
    expect(before.stats.activeRounds).toBeGreaterThanOrEqual(1);
    expect(before.stats.rounds7d).toBeGreaterThanOrEqual(1);

    await live(host, { action: "endRound", gameId, sessionId });
    const after = await call(admin, { action: "overview" });
    expect(after.stats.activeRounds).toBe(before.stats.activeRounds - 1);
    expect(after.games.find((x) => x.gameId === gameId)!.rounds[0]!.status).toBe("ended");
  });
});

describe("admins pass owner checks", () => {
  it("can generate sheets, run and end a round, then delete it and the game", async () => {
    const admin = await newAdmin();
    const host = await newHost();
    const gameId = await createGame(host);
    await generateSheetsHandler(admin, { gameId, count: 3 });

    const { sessionId } = await live(admin, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    await sessionDoc(gameId, sessionId).update({ status: "live" });
    const d = await live(admin, { action: "draw", gameId, sessionId, expectedCount: 0 });
    expect(d.drawn).toBe(true);
    // A claim from an admin is decided at once, like one from the owner.
    const claim = await live(admin, { action: "submitClaim", gameId, sessionId, serial: "001" });
    expect(claim.status).not.toBe("pending");

    await live(admin, { action: "endRound", gameId, sessionId });
    expect((await getSession(gameId, sessionId)).status).toBe("ended");
    await deleteRoundHandler(admin, { gameId, sessionId });
    expect((await sessionDoc(gameId, sessionId).get()).exists).toBe(false);

    await deleteGameHandler(admin, { gameId });
    expect((await db().collection("games").doc(gameId).get()).exists).toBe(false);
  });

  it("an anonymous caller flagged admin still fails owner checks", async () => {
    const host = await newHost();
    const gameId = await createGame(host);
    await expectError(generateSheetsHandler({ ...anon(), isAdmin: true }, { gameId, count: 1 }), "permission-denied", "not-owner");
  });
});

describe("admin callable: storage and jobs", () => {
  it("sums storage per host and per game export", async () => {
    const admin = await newAdmin();
    const host = await newHost();
    const gameId = await createGame(host, { title: "Storage game" });
    const save = (p: string, n: number) => bucket().file(p).save(Buffer.alloc(n), { contentType: "application/octet-stream" });
    await save(`users/${host.uid}/images/a/thumb.webp`, 100);
    await save(`users/${host.uid}/images/a/print.webp`, 400);
    await save(`users/${host.uid}/images/b/thumb.webp`, 50);
    await save(`exports/${gameId}/sheets-1-4.pdf`, 1000);

    const r = await call(admin, { action: "storage" });
    expect(r.hosts.find((h) => h.uid === host.uid)).toMatchObject({ imageFolders: 2, imageBytes: 550 });
    expect(r.hosts.find((h) => h.uid === host.uid)!.email).toMatch(/^host-/);
    expect(r.exports.find((e) => e.gameId === gameId)).toEqual({ gameId, title: "Storage game", files: 1, bytes: 1000 });
    expect(r.totalBytes).toBe(r.imageBytes + r.exportBytes + r.otherBytes);
    expect(r.imageBytes).toBeGreaterThanOrEqual(550);
  });

  it("runs the maintenance jobs on demand", async () => {
    const admin = await newAdmin();
    const host = await newHost();
    const gameId = await gameWithSheets(host, 2);
    const { sessionId } = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "self" } });
    await sessionDoc(gameId, sessionId).update({ lastActivityAt: Date.now() - 48 * 3600_000 });

    const ended = await call(admin, { action: "runJob", job: "endStaleRounds" });
    expect(ended).toMatchObject({ job: "endStaleRounds" });
    expect((ended as { endedRounds: number }).endedRounds).toBeGreaterThanOrEqual(1);
    expect((await getSession(gameId, sessionId)).status).toBe("ended");

    const cleaned = await call(admin, { action: "runJob", job: "cleanupImages" });
    expect(cleaned).toMatchObject({ job: "cleanupImages" });
  });
});
