import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  cloneGameRequestSchema,
  deleteGameRequestSchema,
  deleteRoundRequestSchema,
  LIMITS,
  type CloneGameResponse,
  type Game,
  type Session,
} from "@bingo/core";
import { bucket, db } from "../admin";
import { requireOwner, sessionData, type Ctx } from "../context";
import { fail, parse } from "../errors";
import { commitChunked, type BatchOp } from "../util";

export async function cloneGameHandler(ctx: Ctx, data: unknown): Promise<CloneGameResponse> {
  const { gameId } = parse(cloneGameRequestSchema, data);
  const { ref, game, uid } = await requireOwner(ctx, gameId);
  const newRef = db().collection("games").doc();
  const copy: Record<string, unknown> = {
    ownerId: uid,
    title: `Copy of ${game.title}`.slice(0, LIMITS.titleMax),
    createdAt: FieldValue.serverTimestamp(),
    playerLanguage: game.playerLanguage,
    settings: game.settings,
    printLayout: game.printLayout,
    contentLocked: false,
    clonedFrom: gameId,
  } satisfies Partial<Record<keyof Game, unknown>>;
  if (game.customPatterns) copy.customPatterns = game.customPatterns;
  const items = await ref.collection("items").get();
  const ops: BatchOp[] = [(b) => b.create(newRef, copy)];
  for (const it of items.docs) ops.push((b) => b.create(newRef.collection("items").doc(it.id), it.data()));
  await commitChunked(ops);
  return { gameId: newRef.id };
}

export async function deleteGameHandler(ctx: Ctx, data: unknown): Promise<{ ok: true }> {
  const { gameId } = parse(deleteGameRequestSchema, data);
  const { ref } = await requireOwner(ctx, gameId);
  const codes = await db().collection("joinCodes").where("gameId", "==", gameId).get();
  await commitChunked(codes.docs.map((d) => (b) => b.delete(d.ref)));
  await db().recursiveDelete(ref);
  try {
    await bucket().deleteFiles({ prefix: `exports/${gameId}/` });
  } catch (e) {
    logger.warn("Could not delete exports", { gameId, e });
  }
  return { ok: true };
}

export async function deleteRoundHandler(ctx: Ctx, data: unknown): Promise<{ ok: true }> {
  const { gameId, sessionId } = parse(deleteRoundRequestSchema, data);
  const { ref } = await requireOwner(ctx, gameId);
  const sRef = ref.collection("sessions").doc(sessionId);
  const session: Session = sessionData(await sRef.get());
  if (session.status !== "ended") fail("failed-precondition", "round-open", "End the round before deleting it");
  const path = new FieldPath("sessions", sessionId);
  const members = await ref.collection("members").where(path, "in", ["player", "display"]).select().get();
  await commitChunked(members.docs.map((d) => (b) => b.update(d.ref, path, FieldValue.delete())));
  await db().recursiveDelete(sRef);
  return { ok: true };
}
