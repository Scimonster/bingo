import { FieldPath, FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { timingSafeEqual } from "node:crypto";
import {
  cryptoRng,
  DAY_MS,
  FREE,
  formatSerial,
  generateJoinCode,
  isValidCustomPattern,
  isValidJoinCode,
  LIMITS,
  normalizeJoinCode,
  redeemDisplayTokenRequestSchema,
  shuffle,
  type Player,
  type RedeemDisplayTokenResponse,
  type Session,
} from "@bingo/core";
import { db } from "../admin";
import { gameRef, requireAuth, requireOwner, sessionData, sessionRef, type Ctx } from "../context";
import { fail, isAlreadyExists, parse } from "../errors";
import { commitChunked, newSecret, roundExpireAt, sessionTx, sha256Hex, type BatchOp } from "../util";
import { listSheetIds, pickUnassigned, topUpWaitingPlayers } from "./assign";
import type { Req, Res } from "./types";

function displayDoc(now: number) {
  const secret = newSecret();
  return {
    secret,
    doc: { tokenHash: sha256Hex(secret), expiresAt: now + LIMITS.displayTokenTtlHours * 3600_000, used: false },
  };
}

function requireOpen(session: Session): void {
  if (session.status === "ended") fail("failed-precondition", "round-ended", "This round has ended");
}

/** Zero-padded serial as used in sheet doc IDs and round maps. */
function normSerial(serial: string): string {
  const n = Number(serial);
  if (!Number.isInteger(n) || n < 1) fail("invalid-argument", "bad-serial", "Invalid serial");
  return formatSerial(n);
}

// ---------------------------------------------------------------- startRound

export async function startRound(ctx: Ctx, req: Req<"startRound">): Promise<Res<"startRound">> {
  const { ref: gRef, game } = await requireOwner(ctx, req.gameId);
  const o = req.options;
  const s = game.settings;
  const sheetCount = (await gRef.collection("sheets").count().get()).data().count;
  if (sheetCount === 0) fail("failed-precondition", "no-sheets", "Generate sheets before starting a round");

  let slot = o.slot;
  if (slot === undefined) {
    const used = new Array<number>(s.boardsPerSheet).fill(0);
    const prev = await gRef.collection("sessions").select("sheetSlot").get();
    for (const d of prev.docs) {
      const k = d.get("sheetSlot");
      if (typeof k === "number" && k < used.length) used[k]!++;
    }
    slot = used.indexOf(Math.min(...used));
  }
  if (slot >= s.boardsPerSheet) fail("invalid-argument", "bad-slot", "No such slot on this game's sheets");
  const grid = { rows: s.rows, cols: s.cols };
  const patterns = o.patterns ?? [];
  if (!patterns.every((p) => isValidCustomPattern(p, grid))) fail("invalid-argument", "bad-pattern", "Invalid pattern for this grid");

  // Draw bag: every item that appears on any board of this slot.
  const boards = await gRef.collection("boards").where("slot", "==", slot).select("cells").get();
  const bag = new Set<string>();
  for (const b of boards.docs) for (const c of b.get("cells") as string[]) if (c !== FREE) bag.add(c);
  const remaining = shuffle([...bag], cryptoRng);

  const now = Date.now();
  const sRef = gRef.collection("sessions").doc();
  let joinCode = "";
  for (let attempt = 0; ; attempt++) {
    if (attempt >= 20) fail("unavailable", "join-code", "Could not allocate a join code");
    const code = generateJoinCode(cryptoRng);
    try {
      await db()
        .collection("joinCodes")
        .doc(code)
        .create({
          gameId: req.gameId,
          sessionId: sRef.id,
          open: true,
          expireAt: Timestamp.fromMillis(now + LIMITS.roundRetentionDays * DAY_MS),
        });
      joinCode = code;
      break;
    } catch (e) {
      if (!isAlreadyExists(e)) throw e;
    }
  }

  const display = displayDoc(now);
  const session: Session = {
    medium: o.medium,
    mode: o.mode,
    sheetSlot: slot,
    status: "lobby",
    verification: o.verification ?? "auto",
    boardsPerPlayer: o.boardsPerPlayer ?? 1,
    autoMark: o.autoMark ?? false,
    onWin: o.onWin ?? "continue",
    patterns,
    autoDraw: { enabled: false, intervalSec: o.autoDrawIntervalSec ?? 20, nextDrawAt: null },
    draws: [],
    assignments: {},
    winners: [],
    joinCode,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    lastActivityAt: now,
    totalItems: remaining.length,
    waitingCount: 0,
    pendingClaims: 0,
  };
  const batch = db().batch();
  batch.create(sRef, session);
  batch.create(sRef.collection("private").doc("drawState"), { remaining });
  batch.create(sRef.collection("private").doc("display"), display.doc);
  await batch.commit();
  return { sessionId: sRef.id, joinCode, displayToken: `${req.gameId}.${sRef.id}.${display.secret}` };
}

// ---------------------------------------------------------------- joinRound

export async function joinRound(ctx: Ctx, req: Req<"joinRound">): Promise<Res<"joinRound">> {
  const uid = requireAuth(ctx);
  const code = normalizeJoinCode(req.code);
  if (!isValidJoinCode(code)) fail("not-found", "bad-code", "Unknown or closed join code");
  const codeSnap = await db().collection("joinCodes").doc(code).get();
  const jc = codeSnap.data() as { gameId: string; sessionId: string; open: boolean; expireAt: Timestamp } | undefined;
  if (!jc || !jc.open || jc.expireAt.toMillis() < Date.now()) fail("not-found", "bad-code", "Unknown or closed join code");
  const { gameId, sessionId } = jc;
  const name = req.name.trim();
  const sRef = sessionRef(gameId, sessionId);
  const pRef = sRef.collection("players").doc(uid);
  const mRef = gameRef(gameId).collection("members").doc(uid);

  // Read the sheet list outside the transaction (it only grows while rounds are open).
  const pre = sessionData(await sRef.get());
  const sheetIds = pre.medium === "digital" ? await listSheetIds(gameId) : [];

  return sessionTx(sRef, async (tx) => {
    const session = sessionData(await tx.get(sRef));
    requireOpen(session);
    const pSnap = await tx.get(pRef);
    const now = Date.now();
    const old = pSnap.exists ? (pSnap.data() as Player) : null;
    const sheets = old ? [...old.sheets] : [];
    let waiting = 0;
    const sessionUpdate: Record<string, unknown> = { lastActivityAt: now };
    if (session.medium === "digital") {
      const assignments = { ...session.assignments };
      const need = Math.max(0, session.boardsPerPlayer - sheets.length);
      const got = pickUnassigned(sheetIds, assignments, need);
      for (const s of got) assignments[s] = uid;
      sheets.push(...got);
      waiting = need - got.length;
      if (got.length) sessionUpdate.assignments = assignments;
      const delta = waiting - (old?.waitingForSheets ?? 0);
      if (delta) sessionUpdate.waitingCount = Math.max(0, (session.waitingCount ?? 0) + delta);
    }
    if (old) {
      tx.update(pRef, { name, sheets, waitingForSheets: waiting });
    } else {
      const player: Player = { name, sheets, marks: {}, waitingForSheets: waiting, joinedAt: now };
      tx.create(pRef, player);
    }
    tx.set(mRef, { sessions: { [sessionId]: "player" }, expireAt: FieldValue.delete() }, { merge: true });
    tx.update(sRef, sessionUpdate);
    return { gameId, sessionId, sheets, waitingForSheets: waiting };
  });
}

// ---------------------------------------------------------------- linkSheet

export async function linkSheet(ctx: Ctx, req: Req<"linkSheet">): Promise<Res<"linkSheet">> {
  const uid = requireAuth(ctx);
  const serial = normSerial(req.serial);
  const sRef = sessionRef(req.gameId, req.sessionId);
  const pRef = sRef.collection("players").doc(uid);
  const sheetRef = gameRef(req.gameId).collection("sheets").doc(serial);
  return sessionTx(sRef, async (tx) => {
    const [sSnap, pSnap, sheetSnap] = await tx.getAll(sRef, pRef, sheetRef);
    const session = sessionData(sSnap!);
    if (!pSnap!.exists) fail("permission-denied", "not-joined", "Join the round first");
    requireOpen(session);
    if (session.medium !== "paper") fail("failed-precondition", "not-paper", "Sheets are assigned automatically in digital rounds");
    if (!sheetSnap!.exists) fail("not-found", "sheet-not-found", "No sheet with this serial in this game");
    const player = pSnap!.data() as Player;
    const holder = session.assignments[serial];
    if (holder === uid) return { sheets: player.sheets };
    if (holder) fail("already-exists", "sheet-taken", "Another player already linked this sheet");
    if (player.sheets.length >= session.boardsPerPlayer) {
      fail("resource-exhausted", "sheet-cap", "You already linked the maximum number of sheets");
    }
    const sheets = [...player.sheets, serial];
    tx.update(sRef, { assignments: { ...session.assignments, [serial]: uid }, lastActivityAt: Date.now() });
    tx.update(pRef, { sheets });
    return { sheets };
  });
}

// ---------------------------------------------------------------- draw / setAutoDraw

export async function draw(ctx: Ctx, req: Req<"draw">): Promise<Res<"draw">> {
  await requireOwner(ctx, req.gameId);
  const sRef = sessionRef(req.gameId, req.sessionId);
  const bagRef = sRef.collection("private").doc("drawState");
  return sessionTx(sRef, async (tx) => {
    const [sSnap, bagSnap] = await tx.getAll(sRef, bagRef);
    const session = sessionData(sSnap!);
    requireOpen(session);
    if (session.mode !== "central") fail("failed-precondition", "not-central", "Self-mode rounds have no draws");
    if (session.status === "lobby") fail("failed-precondition", "not-live", "Go live before drawing");
    const count = session.draws.length;
    if (count !== req.expectedCount) return { drawn: false, count };
    if (req.auto && (session.status !== "live" || (session.pendingClaims ?? 0) > 0)) return { drawn: false, count };
    const remaining = ((bagSnap!.data()?.remaining as string[]) ?? []).slice();
    const itemId = remaining.shift();
    if (itemId === undefined) {
      if (session.autoDraw.nextDrawAt != null) tx.update(sRef, { "autoDraw.nextDrawAt": null });
      return { drawn: false, count };
    }
    const now = Date.now();
    const nextDrawAt = session.autoDraw.enabled && remaining.length ? now + session.autoDraw.intervalSec * 1000 : null;
    tx.update(bagRef, { remaining });
    tx.update(sRef, {
      draws: [...session.draws, { itemId, at: now }],
      "autoDraw.nextDrawAt": nextDrawAt,
      lastActivityAt: now,
      ...(session.startedAt ? {} : { startedAt: now }),
    });
    return { drawn: true, itemId, count: count + 1 };
  });
}

export async function setAutoDraw(ctx: Ctx, req: Req<"setAutoDraw">): Promise<Res<"setAutoDraw">> {
  await requireOwner(ctx, req.gameId);
  const sRef = sessionRef(req.gameId, req.sessionId);
  return sessionTx(sRef, async (tx) => {
    const session = sessionData(await tx.get(sRef));
    requireOpen(session);
    const nextDrawAt = req.enabled ? Date.now() + req.intervalSec * 1000 : null;
    tx.update(sRef, { autoDraw: { enabled: req.enabled, intervalSec: req.intervalSec, nextDrawAt } });
    return { nextDrawAt };
  });
}

// ---------------------------------------------------------------- display links

export async function createDisplayLink(ctx: Ctx, req: Req<"createDisplayLink">): Promise<Res<"createDisplayLink">> {
  await requireOwner(ctx, req.gameId);
  const sRef = sessionRef(req.gameId, req.sessionId);
  requireOpen(sessionData(await sRef.get()));
  const display = displayDoc(Date.now());
  await sRef.collection("private").doc("display").set(display.doc);
  return { displayToken: `${req.gameId}.${req.sessionId}.${display.secret}` };
}

export async function redeemDisplayTokenHandler(ctx: Ctx, data: unknown): Promise<RedeemDisplayTokenResponse> {
  const uid = requireAuth(ctx);
  const { token } = parse(redeemDisplayTokenRequestSchema, data);
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) fail("permission-denied", "bad-token", "Invalid display link");
  const [gameId, sessionId, secret] = parts as [string, string, string];
  if (gameId.includes("/") || sessionId.includes("/")) fail("permission-denied", "bad-token", "Invalid display link");
  const sRef = sessionRef(gameId, sessionId);
  const dRef = sRef.collection("private").doc("display");
  await sessionTx(sRef, async (tx) => {
    const [sSnap, dSnap] = await tx.getAll(sRef, dRef);
    const d = dSnap!.data() as { tokenHash: string; expiresAt: number; used: boolean } | undefined;
    const given = Buffer.from(sha256Hex(secret), "hex");
    const stored = d ? Buffer.from(d.tokenHash, "hex") : Buffer.alloc(0);
    if (!sSnap!.exists || !d || stored.length !== given.length || !timingSafeEqual(stored, given)) {
      fail("permission-denied", "bad-token", "Invalid display link");
    }
    if (d.used) fail("permission-denied", "token-used", "This display link was already used");
    if (d.expiresAt < Date.now()) fail("permission-denied", "token-expired", "This display link has expired");
    requireOpen(sSnap!.data() as Session);
    tx.update(dRef, { used: true });
    tx.set(
      gameRef(gameId).collection("members").doc(uid),
      { sessions: { [sessionId]: "display" }, expireAt: FieldValue.delete() },
      { merge: true },
    );
  });
  return { gameId, sessionId };
}

// ---------------------------------------------------------------- players

export async function removePlayer(ctx: Ctx, req: Req<"removePlayer">): Promise<Res<"removePlayer">> {
  await requireOwner(ctx, req.gameId);
  const sRef = sessionRef(req.gameId, req.sessionId);
  const pRef = sRef.collection("players").doc(req.uid);
  const mRef = gameRef(req.gameId).collection("members").doc(req.uid);
  const released = await sessionTx(sRef, async (tx) => {
    const [sSnap, pSnap, mSnap] = await tx.getAll(sRef, pRef, mRef);
    const session = sessionData(sSnap!);
    requireOpen(session);
    if (!pSnap!.exists) fail("not-found", "player-not-found", "No such player in this round");
    const player = pSnap!.data() as Player;
    const assignments = Object.fromEntries(Object.entries(session.assignments).filter(([, u]) => u !== req.uid));
    tx.update(sRef, {
      assignments,
      waitingCount: Math.max(0, (session.waitingCount ?? 0) - (player.waitingForSheets ?? 0)),
    });
    tx.delete(pRef);
    if (mSnap!.exists && mSnap!.get(new FieldPath("sessions", req.sessionId)) === "player") {
      tx.update(mRef, new FieldPath("sessions", req.sessionId), FieldValue.delete());
    }
    return session.medium === "digital" && player.sheets.length > 0;
  });
  if (released) await topUpWaitingPlayers(req.gameId, req.sessionId);
  return { ok: true };
}

export async function reassignPlayer(ctx: Ctx, req: Req<"reassignPlayer">): Promise<Res<"reassignPlayer">> {
  await requireOwner(ctx, req.gameId);
  if (req.fromUid === req.toUid) fail("invalid-argument", "same-player", "Pick two different players");
  const sRef = sessionRef(req.gameId, req.sessionId);
  const fromRef = sRef.collection("players").doc(req.fromUid);
  const toRef = sRef.collection("players").doc(req.toUid);
  const mRef = gameRef(req.gameId).collection("members").doc(req.fromUid);
  return sessionTx(sRef, async (tx) => {
    const [sSnap, fSnap, tSnap, mSnap] = await tx.getAll(sRef, fromRef, toRef, mRef);
    const session = sessionData(sSnap!);
    requireOpen(session);
    if (!fSnap!.exists || !tSnap!.exists) fail("not-found", "player-not-found", "Both players must be in this round");
    const claims = await tx.get(sRef.collection("claims").where("uid", "==", req.fromUid));
    const from = fSnap!.data() as Player;
    const to = tSnap!.data() as Player;
    const sheets = [...new Set([...to.sheets, ...from.sheets])];
    const marks: Record<string, number[]> = { ...to.marks };
    for (const [serial, cells] of Object.entries(from.marks ?? {})) {
      marks[serial] = [...new Set([...(marks[serial] ?? []), ...cells])].sort((a, b) => a - b);
    }
    const assignments = { ...session.assignments };
    for (const [serial, u] of Object.entries(assignments)) if (u === req.fromUid) assignments[serial] = req.toUid;
    const waiting = session.medium === "digital" ? Math.max(0, session.boardsPerPlayer - sheets.length) : 0;
    const waitingDelta = waiting - (from.waitingForSheets ?? 0) - (to.waitingForSheets ?? 0);
    tx.update(sRef, { assignments, waitingCount: Math.max(0, (session.waitingCount ?? 0) + waitingDelta) });
    tx.update(toRef, { sheets, marks, waitingForSheets: waiting });
    tx.delete(fromRef);
    for (const c of claims.docs) tx.update(c.ref, { uid: req.toUid });
    if (mSnap!.exists && mSnap!.get(new FieldPath("sessions", req.sessionId)) === "player") {
      tx.update(mRef, new FieldPath("sessions", req.sessionId), FieldValue.delete());
    }
    return { sheets };
  });
}

// ---------------------------------------------------------------- endRound

export async function endRound(ctx: Ctx, req: Req<"endRound">): Promise<Res<"endRound">> {
  await requireOwner(ctx, req.gameId);
  await endRoundInternal(req.gameId, req.sessionId);
  return { ok: true };
}

/**
 * Ends a round: summary, status, closes the join code and stamps TTL `expireAt` on the round's
 * players, claims, private docs and memberships. Idempotent. Used by endRound, onWin "end" and
 * autoEndStaleRounds.
 */
export async function endRoundInternal(gameId: string, sessionId: string, now = Date.now()): Promise<boolean> {
  const sRef = sessionRef(gameId, sessionId);
  const ended = await sessionTx(sRef, async (tx) => {
    const sSnap = await tx.get(sRef);
    if (!sSnap.exists) return null;
    const session = sSnap.data() as Session;
    if (session.status === "ended") return null;
    const players = await tx.get(sRef.collection("players").select());
    const start = session.startedAt ?? session.createdAt ?? now;
    tx.update(sRef, {
      status: "ended",
      endedAt: now,
      joinCode: null,
      lastActivityAt: now,
      "autoDraw.enabled": false,
      "autoDraw.nextDrawAt": null,
      summary: {
        drawCount: session.draws.length,
        playerCount: players.size,
        durationSec: Math.max(0, Math.round((now - start) / 1000)),
      },
    });
    return session;
  });
  if (!ended) return false;

  const expireAt = roundExpireAt(now);
  const ops: BatchOp[] = [];
  if (ended.joinCode) {
    const jcRef = db().collection("joinCodes").doc(ended.joinCode);
    const jc = await jcRef.get();
    if (jc.exists && jc.get("sessionId") === sessionId) ops.push((b) => b.delete(jcRef));
  }
  const stamp = (refs: DocumentReference[]) => refs.forEach((r) => ops.push((b) => b.update(r, { expireAt })));
  const [players, claims, priv, members] = await Promise.all([
    sRef.collection("players").select().get(),
    sRef.collection("claims").select().get(),
    sRef.collection("private").select().get(),
    gameRef(gameId).collection("members").where(new FieldPath("sessions", sessionId), "in", ["player", "display"]).select().get(),
  ]);
  stamp([...players.docs, ...claims.docs, ...priv.docs, ...members.docs].map((d) => d.ref));
  await commitChunked(ops);
  return true;
}
