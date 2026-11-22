import {
  checkBoard,
  formatSerial,
  type Board,
  type Claim,
  type Player,
  type Session,
  type Sheet,
  type Winner,
} from "@bingo/core";
import { canManage, gameRef, requireAuth, requireOwner, loadGame, sessionData, sessionRef, type Ctx } from "../context";
import { fail } from "../errors";
import { sessionTx } from "../util";
import { endRoundInternal } from "./round";
import type { Req, Res } from "./types";

function patternIdsWon(session: Session, serial: string): Set<string> {
  return new Set(session.winners.filter((w) => w.serial === serial && w.patternId).map((w) => w.patternId!));
}

/** Winner entries for a valid claim: one per newly won pattern (or one entry for a host override). */
function winnersFor(claim: Claim, claimId: string, session: Session, now: number): Winner[] {
  const already = patternIdsWon(session, claim.serial);
  const ids = claim.matchedPatternIds.filter((id) => !already.has(id));
  const byId = new Map(session.patterns.map((p) => [p.id, p.name]));
  const base = { name: claim.playerName, serial: claim.serial, claimId, at: now };
  // Host accepted a claim the check did not support: record it without a pattern.
  if (!claim.matchedPatternIds.length) return [{ ...base, pattern: claim.matchedPattern ?? "", patternId: null }];
  return ids.map((id) => ({ ...base, pattern: byId.get(id) ?? id, patternId: id }));
}

export async function submitClaim(ctx: Ctx, req: Req<"submitClaim">): Promise<Res<"submitClaim">> {
  const uid = requireAuth(ctx);
  const { game } = await loadGame(req.gameId);
  const isOwner = canManage(ctx, game);
  const n = Number(req.serial);
  if (!Number.isInteger(n) || n < 1) fail("invalid-argument", "bad-serial", "Invalid serial");
  const serial = formatSerial(n);
  const grid = { rows: game.settings.rows, cols: game.settings.cols };
  const sRef = sessionRef(req.gameId, req.sessionId);
  const sheetRef = gameRef(req.gameId).collection("sheets").doc(serial);

  const result = await sessionTx(sRef, async (tx) => {
    const [sSnap, sheetSnap] = await tx.getAll(sRef, sheetRef);
    const session = sessionData(sSnap!);
    if (session.status === "ended") fail("failed-precondition", "round-ended", "This round has ended");
    if (session.mode !== "central") fail("failed-precondition", "not-central", "Self-mode rounds have no claims");
    if (session.status === "lobby") fail("failed-precondition", "not-live", "The round has not started");
    const holder = session.assignments[serial] ?? null;
    if (!isOwner && holder !== uid) fail("permission-denied", "not-your-sheet", "This sheet is not linked to you");
    if (!sheetSnap!.exists) fail("not-found", "sheet-not-found", "No sheet with this serial in this game");
    const bId = (sheetSnap!.data() as Sheet).boardIds[session.sheetSlot];
    if (!bId) fail("failed-precondition", "no-board", "This sheet has no board for the round's slot");
    const boardRef = gameRef(req.gameId).collection("boards").doc(bId);
    const [boardSnap, existing, holderSnap] = await Promise.all([
      tx.get(boardRef),
      tx.get(sRef.collection("claims").where("serial", "==", serial)),
      holder ? tx.get(sRef.collection("players").doc(holder)) : Promise.resolve(null),
    ]);
    const pending = existing.docs.find((d) => d.get("status") === "pending");
    if (pending) {
      const c = pending.data() as Claim;
      return { claimId: pending.id, status: c.status, matchedPattern: c.matchedPattern, end: false };
    }
    if (!boardSnap.exists) fail("not-found", "board-not-found", "Board missing");
    const board = boardSnap.data() as Board;
    const check = checkBoard(board.cells, grid, session.draws.map((d) => d.itemId), session.patterns);
    const already = patternIdsWon(session, serial);
    const newWins = check.won.filter((w) => !already.has(w.pattern.id));
    const computedValid = newWins.length > 0;
    const decideNow = session.verification === "auto" || isOwner;
    const status: Claim["status"] = decideNow ? (computedValid ? "valid" : "invalid") : "pending";
    const now = Date.now();
    const holderName = holderSnap?.exists ? (holderSnap.data() as Player).name : null;
    const claim: Claim = {
      serial,
      uid: holder,
      playerName: holderName ?? "", // paper sheet nobody linked: UIs show the serial alone
      matchedPattern: computedValid ? newWins.map((w) => w.pattern.name).join(", ") : null,
      matchedPatternIds: newWins.map((w) => w.pattern.id),
      computedValid,
      status,
      drawCount: session.draws.length,
      createdAt: now,
      decidedAt: decideNow ? now : null,
      byHost: isOwner,
    };
    const cRef = sRef.collection("claims").doc();
    tx.create(cRef, claim);
    const update: Record<string, unknown> = { lastActivityAt: now };
    if (status === "valid") update.winners = [...session.winners, ...winnersFor(claim, cRef.id, session, now)];
    if (status === "pending") update.pendingClaims = (session.pendingClaims ?? 0) + 1;
    tx.update(sRef, update);
    return { claimId: cRef.id, status, matchedPattern: claim.matchedPattern, end: status === "valid" && session.onWin === "end" };
  });

  if (result.end) await endRoundInternal(req.gameId, req.sessionId);
  return { claimId: result.claimId, status: result.status, matchedPattern: result.matchedPattern };
}

export async function decideClaim(ctx: Ctx, req: Req<"decideClaim">): Promise<Res<"decideClaim">> {
  await requireOwner(ctx, req.gameId);
  const sRef = sessionRef(req.gameId, req.sessionId);
  const cRef = sRef.collection("claims").doc(req.claimId);
  const result = await sessionTx(sRef, async (tx) => {
    const [sSnap, cSnap] = await tx.getAll(sRef, cRef);
    const session = sessionData(sSnap!);
    if (!cSnap!.exists) fail("not-found", "claim-not-found", "No such claim");
    const claim = cSnap!.data() as Claim;
    if (claim.status !== "pending") return { status: claim.status as "valid" | "invalid", end: false };
    if (session.status === "ended") fail("failed-precondition", "round-ended", "This round has ended");
    const now = Date.now();
    const status = req.accept ? "valid" : "invalid";
    tx.update(cRef, { status, decidedAt: now });
    const pendingClaims = Math.max(0, (session.pendingClaims ?? 0) - 1);
    const update: Record<string, unknown> = { pendingClaims, lastActivityAt: now };
    if (status === "valid") update.winners = [...session.winners, ...winnersFor(claim, cRef.id, session, now)];
    // Auto-draw paused while the claim waited; restart its timer.
    if (pendingClaims === 0 && session.autoDraw.enabled) {
      update["autoDraw.nextDrawAt"] = now + session.autoDraw.intervalSec * 1000;
    }
    tx.update(sRef, update);
    return { status, end: status === "valid" && session.onWin === "end" } as const;
  });
  if (result.end) await endRoundInternal(req.gameId, req.sessionId);
  return { status: result.status };
}
