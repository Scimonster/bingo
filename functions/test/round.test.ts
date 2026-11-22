import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { DAY_MS, type Claim } from "@bingo/core";
import { db } from "../src/admin";
import { generateSheetsHandler } from "../src/handlers/sheets";
import { redeemDisplayTokenHandler } from "../src/handlers/round";
import { autoEndStaleRounds } from "../src/handlers/scheduled";
import {
  anon,
  drawUntilWin,
  expectError,
  gameWithSheets,
  getPlayer,
  getSession,
  live,
  newHost,
  sessionDoc,
  setStatus,
} from "./helpers";

const members = (gameId: string, uid: string) => db().collection("games").doc(gameId).collection("members").doc(uid);
const claimDoc = (gameId: string, sessionId: string, id: string) => sessionDoc(gameId, sessionId).collection("claims").doc(id);

describe("startRound", () => {
  it("requires sheets, defaults to the least-used slot and builds the draw bag", async () => {
    const host = await newHost();
    const { createGame } = await import("./helpers");
    const empty = await createGame(host);
    await expectError(live(host, { action: "startRound", gameId: empty, options: { medium: "paper", mode: "central" } }), "failed-precondition", "no-sheets");

    const gameId = await gameWithSheets(host, 5);
    const r1 = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    expect(r1.joinCode).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    expect(r1.displayToken.startsWith(`${gameId}.${r1.sessionId}.`)).toBe(true);
    const s1 = await getSession(gameId, r1.sessionId);
    expect(s1).toMatchObject({ status: "lobby", sheetSlot: 0, joinCode: r1.joinCode, draws: [], winners: [], pendingClaims: 0, waitingCount: 0 });
    expect(s1.patterns).toEqual([{ id: "line", name: "Any line", group: "line" }]);

    const bag = (await sessionDoc(gameId, r1.sessionId).collection("private").doc("drawState").get()).data()!;
    const boards = await db().collection("games").doc(gameId).collection("boards").where("slot", "==", 0).get();
    const onBoards = new Set(boards.docs.flatMap((b) => b.get("cells") as string[]).filter((c) => c !== "FREE"));
    expect(new Set(bag.remaining)).toEqual(onBoards);
    expect(bag.remaining).toHaveLength(onBoards.size);
    expect(s1.totalItems).toBe(onBoards.size);

    const code = (await db().collection("joinCodes").doc(r1.joinCode).get()).data()!;
    expect(code).toMatchObject({ gameId, sessionId: r1.sessionId, open: true });
    expect(code.expireAt).toBeInstanceOf(Timestamp);
    const display = (await sessionDoc(gameId, r1.sessionId).collection("private").doc("display").get()).data()!;
    expect(display.used).toBe(false);
    expect(display.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const r2 = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "self" } });
    expect((await getSession(gameId, r2.sessionId)).sheetSlot).toBe(1);
    const r3 = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "self", slot: 1 } });
    expect((await getSession(gameId, r3.sessionId)).sheetSlot).toBe(1);
    await expectError(live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "self", slot: 3 } }), "invalid-argument", "bad-slot");
    await expectError(live(anon(), { action: "startRound", gameId, options: { medium: "paper", mode: "self" } }), "permission-denied");
  });
});

describe("central paper round", () => {
  it("runs start → join → link → live → draws → claims → end", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 10);
    const { sessionId, joinCode } = await live(host, {
      action: "startRound",
      gameId,
      options: { medium: "paper", mode: "central", boardsPerPlayer: 2 },
    });
    const ann = anon("ann");
    const bob = anon("bob");

    await expectError(live(ann, { action: "joinRound", code: "ZZZZZZ", name: "Ann" }), "not-found", "bad-code");
    await expectError(live(ann, { action: "joinRound", code: joinCode, name: "   " }), "invalid-argument");
    const j = await live(ann, { action: "joinRound", code: joinCode.toLowerCase().replace(/^(...)/, "$1-"), name: " Ann " });
    expect(j).toEqual({ gameId, sessionId, sheets: [], waitingForSheets: 0 });
    expect(await getPlayer(gameId, sessionId, ann.uid!)).toMatchObject({ name: "Ann", sheets: [], marks: {}, waitingForSheets: 0 });
    expect((await members(gameId, ann.uid!).get()).data()).toEqual({ sessions: { [sessionId]: "player" } });
    await live(bob, { action: "joinRound", code: joinCode, name: "Bob" });

    // linkSheet
    await expectError(live(anon(), { action: "linkSheet", gameId, sessionId, serial: "1" }), "permission-denied", "not-joined");
    expect(await live(ann, { action: "linkSheet", gameId, sessionId, serial: "1" })).toEqual({ sheets: ["001"] });
    expect(await live(ann, { action: "linkSheet", gameId, sessionId, serial: "001" })).toEqual({ sheets: ["001"] });
    await expectError(live(bob, { action: "linkSheet", gameId, sessionId, serial: "1" }), "already-exists", "sheet-taken");
    await expectError(live(bob, { action: "linkSheet", gameId, sessionId, serial: "99" }), "not-found", "sheet-not-found");
    await live(ann, { action: "linkSheet", gameId, sessionId, serial: "2" });
    await expectError(live(ann, { action: "linkSheet", gameId, sessionId, serial: "3" }), "resource-exhausted", "sheet-cap");
    await live(bob, { action: "linkSheet", gameId, sessionId, serial: "3" });
    expect((await getSession(gameId, sessionId)).assignments).toEqual({ "001": ann.uid, "002": ann.uid, "003": bob.uid });

    // Drawing needs the host and a live round.
    await expectError(live(host, { action: "draw", gameId, sessionId, expectedCount: 0 }), "failed-precondition", "not-live");
    await setStatus(gameId, sessionId, "live");
    await expectError(live(ann, { action: "draw", gameId, sessionId, expectedCount: 0 }), "permission-denied", "not-owner");
    const d1 = await live(host, { action: "draw", gameId, sessionId, expectedCount: 0 });
    expect(d1.drawn).toBe(true);
    expect(d1.count).toBe(1);
    // Same expectedCount again (double press / timer race) is a no-op.
    expect(await live(host, { action: "draw", gameId, sessionId, expectedCount: 0 })).toEqual({ drawn: false, count: 1 });
    let s = await getSession(gameId, sessionId);
    expect(s.draws).toHaveLength(1);
    expect(s.draws[0]!.itemId).toBe(d1.itemId);
    expect(s.startedAt).toBeGreaterThan(0);
    const bag = (await sessionDoc(gameId, sessionId).collection("private").doc("drawState").get()).get("remaining") as string[];
    expect(bag).not.toContain(d1.itemId);
    expect(bag).toHaveLength(s.totalItems! - 1);

    // One draw can never win a 3x3 line (needs two items + free space): invalid claim.
    await expectError(live(bob, { action: "submitClaim", gameId, sessionId, serial: "1" }), "permission-denied", "not-your-sheet");
    const bad = await live(ann, { action: "submitClaim", gameId, sessionId, serial: "1" });
    expect(bad).toMatchObject({ status: "invalid", matchedPattern: null });
    const badDoc = (await claimDoc(gameId, sessionId, bad.claimId).get()).data() as Claim;
    expect(badDoc).toMatchObject({ serial: "001", uid: ann.uid, playerName: "Ann", computedValid: false, drawCount: 1, byHost: false });

    // Valid claim with auto verification.
    await drawUntilWin(host, gameId, sessionId, "001");
    const good = await live(ann, { action: "submitClaim", gameId, sessionId, serial: "001" });
    expect(good.status).toBe("valid");
    expect(good.matchedPattern).toBe("Any line");
    s = await getSession(gameId, sessionId);
    expect(s.winners).toHaveLength(1);
    expect(s.winners[0]).toMatchObject({ name: "Ann", serial: "001", pattern: "Any line", patternId: "line", claimId: good.claimId });

    // Each sheet wins each pattern at most once.
    const again = await live(ann, { action: "submitClaim", gameId, sessionId, serial: "001" });
    expect(again.status).toBe("invalid");
    expect((await getSession(gameId, sessionId)).winners).toHaveLength(1);

    // Host submits for a paper sheet: decided immediately.
    const hostClaim = await live(host, { action: "submitClaim", gameId, sessionId, serial: "5" });
    expect(["valid", "invalid"]).toContain(hostClaim.status);
    expect((await claimDoc(gameId, sessionId, hostClaim.claimId).get()).data()).toMatchObject({ byHost: true, uid: null, playerName: "" });

    await expectError(live(ann, { action: "endRound", gameId, sessionId }), "permission-denied");
    await live(host, { action: "endRound", gameId, sessionId });
    s = await getSession(gameId, sessionId);
    expect(s.status).toBe("ended");
    await expectError(live(host, { action: "draw", gameId, sessionId, expectedCount: s.draws.length }), "failed-precondition", "round-ended");
    await expectError(live(anon(), { action: "joinRound", code: joinCode, name: "Late" }), "not-found", "bad-code");
  });

  it("host verification: pending claims block auto draws until decided; duplicates return the pending claim", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 5);
    const { sessionId, joinCode } = await live(host, {
      action: "startRound",
      gameId,
      options: { medium: "paper", mode: "central", verification: "host" },
    });
    const ann = anon();
    await live(ann, { action: "joinRound", code: joinCode, name: "Ann" });
    await live(ann, { action: "linkSheet", gameId, sessionId, serial: "4" });
    await setStatus(gameId, sessionId, "live");
    const auto = await live(host, { action: "setAutoDraw", gameId, sessionId, enabled: true, intervalSec: 10 });
    expect(auto.nextDrawAt).toBeGreaterThan(Date.now());
    const n = await drawUntilWin(host, gameId, sessionId, "004");

    const c = await live(ann, { action: "submitClaim", gameId, sessionId, serial: "4" });
    expect(c).toMatchObject({ status: "pending", matchedPattern: "Any line" });
    expect((await getSession(gameId, sessionId)).pendingClaims).toBe(1);
    const dup = await live(ann, { action: "submitClaim", gameId, sessionId, serial: "4" });
    expect(dup.claimId).toBe(c.claimId);
    // The pending claim goes on the projector.
    expect((await getSession(gameId, sessionId)).screenClaim).toEqual({ claimId: c.claimId, serial: "004" });

    // Auto draw refused while a claim is pending; manual draw still allowed.
    expect(await live(host, { action: "draw", gameId, sessionId, expectedCount: n, auto: true })).toEqual({ drawn: false, count: n });
    await expectError(live(ann, { action: "decideClaim", gameId, sessionId, claimId: c.claimId, accept: true }), "permission-denied");
    expect(await live(host, { action: "decideClaim", gameId, sessionId, claimId: c.claimId, accept: true })).toEqual({ status: "valid" });
    const s = await getSession(gameId, sessionId);
    expect(s.pendingClaims).toBe(0);
    expect(s.winners.map((w) => w.claimId)).toEqual([c.claimId]);
    expect(s.screenClaim).toBeNull();
    expect(s.autoDraw.nextDrawAt).toBeGreaterThan(Date.now());
    // Deciding again is a no-op.
    expect(await live(host, { action: "decideClaim", gameId, sessionId, claimId: c.claimId, accept: false })).toEqual({ status: "valid" });

    // Auto draws resume; a paused round refuses them.
    expect((await live(host, { action: "draw", gameId, sessionId, expectedCount: n, auto: true })).drawn).toBe(true);
    await setStatus(gameId, sessionId, "paused");
    expect((await live(host, { action: "draw", gameId, sessionId, expectedCount: n + 1, auto: true })).drawn).toBe(false);

    // Rejecting a pending claim.
    await setStatus(gameId, sessionId, "live");
    const bob = anon();
    await live(bob, { action: "joinRound", code: joinCode, name: "Bob" });
    await live(bob, { action: "linkSheet", gameId, sessionId, serial: "2" });
    const c2 = await live(bob, { action: "submitClaim", gameId, sessionId, serial: "2" });
    expect(c2.status).toBe("pending");
    // A second claim waits its turn for the projector, then takes over when the first is decided.
    const carl = anon();
    await live(carl, { action: "joinRound", code: joinCode, name: "Carl" });
    await live(carl, { action: "linkSheet", gameId, sessionId, serial: "3" });
    const c3 = await live(carl, { action: "submitClaim", gameId, sessionId, serial: "3" });
    expect((await getSession(gameId, sessionId)).screenClaim).toEqual({ claimId: c2.claimId, serial: "002" });
    expect(await live(host, { action: "decideClaim", gameId, sessionId, claimId: c2.claimId, accept: false })).toEqual({ status: "invalid" });
    expect((await getSession(gameId, sessionId)).winners).toHaveLength(1);
    expect((await getSession(gameId, sessionId)).screenClaim).toEqual({ claimId: c3.claimId, serial: "003" });
    // Deciding a claim that is not on screen leaves the screen alone.
    await sessionDoc(gameId, sessionId).update({ screenClaim: null });
    await live(host, { action: "decideClaim", gameId, sessionId, claimId: c3.claimId, accept: false });
    expect((await getSession(gameId, sessionId)).screenClaim).toBeNull();

    // A host's paper check with no bingo shows the board; the next draw clears it.
    const before = (await getSession(gameId, sessionId)).draws.length;
    const paper = await live(host, { action: "submitClaim", gameId, sessionId, serial: "5" });
    if (paper.status === "invalid") {
      expect((await getSession(gameId, sessionId)).screenClaim).toEqual({ claimId: paper.claimId, serial: "005" });
      await live(host, { action: "draw", gameId, sessionId, expectedCount: before });
      expect((await getSession(gameId, sessionId)).screenClaim).toBeNull();
    } else {
      // A winning paper check gets the win overlay instead.
      expect((await getSession(gameId, sessionId)).screenClaim).toBeNull();
    }

    // With auto-show off, new claims stay off the projector.
    await sessionDoc(gameId, sessionId).update({ autoShowClaims: false });
    const c4 = await live(bob, { action: "submitClaim", gameId, sessionId, serial: "2" });
    expect(c4.status).toBe("pending");
    expect((await getSession(gameId, sessionId)).screenClaim).toBeNull();
  });

  it("onWin end: a valid win ends the round", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 3);
    const { sessionId, joinCode } = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central", onWin: "end" } });
    const ann = anon();
    await live(ann, { action: "joinRound", code: joinCode, name: "Ann" });
    await live(ann, { action: "linkSheet", gameId, sessionId, serial: "1" });
    await setStatus(gameId, sessionId, "live");
    await drawUntilWin(host, gameId, sessionId, "001");
    expect((await live(ann, { action: "submitClaim", gameId, sessionId, serial: "1" })).status).toBe("valid");
    const s = await getSession(gameId, sessionId);
    expect(s.status).toBe("ended");
    expect(s.winners).toHaveLength(1);
    expect((await db().collection("joinCodes").doc(joinCode).get()).exists).toBe(false);
  });

  it("self mode refuses draws and claims; claims need a live round", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 3);
    const self = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "self" } });
    await setStatus(gameId, self.sessionId, "live");
    await expectError(live(host, { action: "draw", gameId, sessionId: self.sessionId, expectedCount: 0 }), "failed-precondition", "not-central");
    await expectError(live(host, { action: "submitClaim", gameId, sessionId: self.sessionId, serial: "1" }), "failed-precondition", "not-central");
    const central = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    await expectError(live(host, { action: "submitClaim", gameId, sessionId: central.sessionId, serial: "1" }), "failed-precondition", "not-live");
    await expectError(live(host, { action: "linkSheet", gameId, sessionId: central.sessionId, serial: "1" }), "permission-denied", "not-joined");
  });
});

describe("digital rounds", () => {
  it("assigns sheets, makes extra players wait, and tops up on generateSheets", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 3);
    const { sessionId, joinCode } = await live(host, {
      action: "startRound",
      gameId,
      options: { medium: "digital", mode: "central", boardsPerPlayer: 2 },
    });
    const a = anon();
    const b = anon();
    const ra = await live(a, { action: "joinRound", code: joinCode, name: "A" });
    expect(ra.sheets).toHaveLength(2);
    expect(ra.waitingForSheets).toBe(0);
    const rb = await live(b, { action: "joinRound", code: joinCode, name: "B" });
    expect(rb.sheets).toHaveLength(1);
    expect(rb.waitingForSheets).toBe(1);
    expect(new Set([...ra.sheets, ...rb.sheets]).size).toBe(3);
    // Rejoining keeps sheets and renames.
    const ra2 = await live(a, { action: "joinRound", code: joinCode, name: "Alice" });
    expect(ra2.sheets).toEqual(ra.sheets);
    expect((await getPlayer(gameId, sessionId, a.uid!))!.name).toBe("Alice");
    await expectError(live(a, { action: "linkSheet", gameId, sessionId, serial: "1" }), "failed-precondition", "not-paper");

    const c = anon();
    expect((await live(c, { action: "joinRound", code: joinCode, name: "C" })).waitingForSheets).toBe(2);
    let s = await getSession(gameId, sessionId);
    expect(s.waitingCount).toBe(3);
    expect(Object.keys(s.assignments)).toHaveLength(3);

    await generateSheetsHandler(host, { gameId, count: 1 });
    // The oldest waiting player is served first.
    s = await getSession(gameId, sessionId);
    expect(s.waitingCount).toBe(2);
    expect((await getPlayer(gameId, sessionId, b.uid!))).toMatchObject({ waitingForSheets: 0 });
    expect((await getPlayer(gameId, sessionId, b.uid!))!.sheets).toHaveLength(2);
    expect((await getPlayer(gameId, sessionId, c.uid!))!.waitingForSheets).toBe(2);

    // Removing a player releases their sheets to waiting players.
    await expectError(live(c, { action: "removePlayer", gameId, sessionId, uid: a.uid! }), "permission-denied");
    await live(host, { action: "removePlayer", gameId, sessionId, uid: a.uid! });
    expect(await getPlayer(gameId, sessionId, a.uid!)).toBeUndefined();
    expect((await members(gameId, a.uid!).get()).get("sessions")).toEqual({});
    const pc = (await getPlayer(gameId, sessionId, c.uid!))!;
    expect(pc.waitingForSheets).toBe(0);
    expect(pc.sheets).toHaveLength(2);
    s = await getSession(gameId, sessionId);
    expect(s.waitingCount).toBe(0);
    expect(Object.values(s.assignments).filter((u) => u === a.uid)).toHaveLength(0);
    expect(Object.keys(s.assignments)).toHaveLength(4);
    await expectError(live(host, { action: "removePlayer", gameId, sessionId, uid: a.uid! }), "not-found", "player-not-found");
  });

  it("reassignPlayer moves sheets, marks, assignments and claims to the new device", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 1);
    const { sessionId, joinCode } = await live(host, { action: "startRound", gameId, options: { medium: "digital", mode: "central" } });
    const oldDev = anon();
    const newDev = anon();
    const r = await live(oldDev, { action: "joinRound", code: joinCode, name: "Dana" });
    expect(r.sheets).toEqual(["001"]);
    await sessionDoc(gameId, sessionId).collection("players").doc(oldDev.uid!).update({ marks: { "001": [0, 2] } });
    await setStatus(gameId, sessionId, "live");
    await live(host, { action: "draw", gameId, sessionId, expectedCount: 0 });
    const claim = await live(oldDev, { action: "submitClaim", gameId, sessionId, serial: "1" });
    expect((await live(newDev, { action: "joinRound", code: joinCode, name: "Dana" })).waitingForSheets).toBe(1);
    expect((await getSession(gameId, sessionId)).waitingCount).toBe(1);

    await expectError(live(host, { action: "reassignPlayer", gameId, sessionId, fromUid: oldDev.uid!, toUid: oldDev.uid! }), "invalid-argument");
    await expectError(live(newDev, { action: "reassignPlayer", gameId, sessionId, fromUid: oldDev.uid!, toUid: newDev.uid! }), "permission-denied");
    const res = await live(host, { action: "reassignPlayer", gameId, sessionId, fromUid: oldDev.uid!, toUid: newDev.uid! });
    expect(res).toEqual({ sheets: ["001"] });
    expect(await getPlayer(gameId, sessionId, oldDev.uid!)).toBeUndefined();
    expect(await getPlayer(gameId, sessionId, newDev.uid!)).toMatchObject({ sheets: ["001"], marks: { "001": [0, 2] }, waitingForSheets: 0 });
    const s = await getSession(gameId, sessionId);
    expect(s.assignments).toEqual({ "001": newDev.uid });
    expect(s.waitingCount).toBe(0);
    expect((await claimDoc(gameId, sessionId, claim.claimId).get()).get("uid")).toBe(newDev.uid);
    expect((await members(gameId, oldDev.uid!).get()).get("sessions")).toEqual({});
    // The new device can now claim on the sheet.
    expect((await live(newDev, { action: "submitClaim", gameId, sessionId, serial: "1" })).status).toBe("invalid");
  });
});

describe("endRound", () => {
  it("writes the summary, closes the join code and stamps TTLs", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 3);
    const { sessionId, joinCode, displayToken } = await live(host, { action: "startRound", gameId, options: { medium: "digital", mode: "central" } });
    const a = anon();
    const b = anon();
    const tv = anon("tv");
    await live(a, { action: "joinRound", code: joinCode, name: "A" });
    await live(b, { action: "joinRound", code: joinCode, name: "B" });
    await redeemDisplayTokenHandler(tv, { token: displayToken });
    await setStatus(gameId, sessionId, "live");
    await live(host, { action: "draw", gameId, sessionId, expectedCount: 0 });
    await live(host, { action: "draw", gameId, sessionId, expectedCount: 1 });
    const serial = (await getPlayer(gameId, sessionId, a.uid!))!.sheets[0]!;
    await live(a, { action: "submitClaim", gameId, sessionId, serial });

    const before = Date.now();
    await live(host, { action: "endRound", gameId, sessionId });
    const s = await getSession(gameId, sessionId);
    expect(s.status).toBe("ended");
    expect(s.joinCode).toBeNull();
    expect(s.endedAt).toBeGreaterThanOrEqual(before);
    expect(s.summary).toMatchObject({ drawCount: 2, playerCount: 2 });
    expect(s.summary!.durationSec).toBeGreaterThanOrEqual(0);
    expect((await db().collection("joinCodes").doc(joinCode).get()).exists).toBe(false);

    const expectTtl = (v: unknown) => {
      expect(v).toBeInstanceOf(Timestamp);
      const ms = (v as Timestamp).toMillis();
      expect(ms).toBeGreaterThanOrEqual(before + 30 * DAY_MS - 1000);
      expect(ms).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS + 1000);
    };
    const ref = sessionDoc(gameId, sessionId);
    for (const col of ["players", "claims", "private"]) {
      const docs = await ref.collection(col).get();
      expect(docs.size).toBeGreaterThan(0);
      docs.forEach((d) => expectTtl(d.get("expireAt")));
    }
    for (const u of [a, b, tv]) expectTtl((await members(gameId, u.uid!).get()).get("expireAt"));
    expect((s as unknown as { expireAt?: unknown }).expireAt).toBeUndefined();

    // Idempotent; ended rounds refuse changes.
    await live(host, { action: "endRound", gameId, sessionId });
    await expectError(live(host, { action: "createDisplayLink", gameId, sessionId }), "failed-precondition", "round-ended");
    await expectError(live(host, { action: "setAutoDraw", gameId, sessionId, enabled: true, intervalSec: 5 }), "failed-precondition");

    // Joining a new round clears the membership TTL.
    const r2 = await live(host, { action: "startRound", gameId, options: { medium: "digital", mode: "central" } });
    await live(a, { action: "joinRound", code: r2.joinCode, name: "A" });
    const m = (await members(gameId, a.uid!).get()).data()!;
    expect(m.expireAt).toBeUndefined();
    expect(m.sessions).toEqual({ [sessionId]: "player", [r2.sessionId]: "player" });
  });
});

describe("display tokens", () => {
  it("are single-use, hashed and replaceable via createDisplayLink", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 2);
    const { sessionId, displayToken } = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    const stored = (await sessionDoc(gameId, sessionId).collection("private").doc("display").get()).data()!;
    expect(JSON.stringify(stored)).not.toContain(displayToken.split(".")[2]);

    const tv = anon("tv");
    await expectError(redeemDisplayTokenHandler({ uid: null, isAnonymous: false }, { token: displayToken }), "unauthenticated");
    await expectError(redeemDisplayTokenHandler(tv, { token: `${gameId}.${sessionId}.wrongsecret` }), "permission-denied", "bad-token");
    await expectError(redeemDisplayTokenHandler(tv, { token: "garbage-token-without-dots" }), "permission-denied", "bad-token");
    expect(await redeemDisplayTokenHandler(tv, { token: displayToken })).toEqual({ gameId, sessionId });
    expect((await members(gameId, tv.uid!).get()).get("sessions")).toEqual({ [sessionId]: "display" });
    await expectError(redeemDisplayTokenHandler(anon(), { token: displayToken }), "permission-denied", "token-used");

    await expectError(live(tv, { action: "createDisplayLink", gameId, sessionId }), "permission-denied");
    const { displayToken: t2 } = await live(host, { action: "createDisplayLink", gameId, sessionId });
    expect(t2).not.toBe(displayToken);
    const tv2 = anon("tv");
    expect(await redeemDisplayTokenHandler(tv2, { token: t2 })).toEqual({ gameId, sessionId });

    // Expired tokens are refused.
    const { displayToken: t3 } = await live(host, { action: "createDisplayLink", gameId, sessionId });
    await sessionDoc(gameId, sessionId).collection("private").doc("display").update({ expiresAt: Date.now() - 1 });
    await expectError(redeemDisplayTokenHandler(anon(), { token: t3 }), "permission-denied", "token-expired");
  });
});

describe("autoEndStaleRounds", () => {
  it("ends open rounds idle for more than 24 hours", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 2);
    const stale = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    const fresh = await live(host, { action: "startRound", gameId, options: { medium: "paper", mode: "central" } });
    await sessionDoc(gameId, stale.sessionId).update({ lastActivityAt: Date.now() - 25 * 3600_000, status: "live" });
    expect(await autoEndStaleRounds()).toBeGreaterThanOrEqual(1);
    const s = await getSession(gameId, stale.sessionId);
    expect(s.status).toBe("ended");
    expect(s.summary).toBeDefined();
    expect((await db().collection("joinCodes").doc(stale.joinCode).get()).exists).toBe(false);
    expect((await getSession(gameId, fresh.sessionId)).status).toBe("lobby");
  });
});

describe("liveRound dispatcher", () => {
  it("answers ping without auth and rejects unknown actions", async () => {
    expect(await live({ uid: null, isAnonymous: false }, { action: "ping" })).toEqual({ ok: true });
    await expectError(live(anon(), { action: "explode" } as never), "invalid-argument", "invalid-request");
    await expectError(live({ uid: null, isAnonymous: false }, { action: "joinRound", code: "ABCDEF", name: "x" }), "unauthenticated");
  });
});
