import {
  boardId,
  cryptoRng,
  formatSerial,
  generateSheets,
  generateSheetsRequestSchema,
  LIMITS,
  resetSheetsRequestSchema,
  type GenerateSheetsResponse,
  type ResetSheetsResponse,
  type Session,
} from "@bingo/core";
import { db } from "../admin";
import { requireOwner, type Ctx } from "../context";
import { fail, parse, toHttpsError } from "../errors";
import { commitChunked, type BatchOp } from "../util";
import { listSheetIds, topUpWaitingPlayers } from "./assign";

export async function generateSheetsHandler(ctx: Ctx, data: unknown): Promise<GenerateSheetsResponse> {
  const { gameId, count } = parse(generateSheetsRequestSchema, data);
  const { ref, game } = await requireOwner(ctx, gameId);
  const s = game.settings;

  const [itemsSnap, sheetsSnap, boardsSnap] = await Promise.all([
    ref.collection("items").select().get(),
    ref.collection("sheets").select("serial").get(),
    ref.collection("boards").select("slot", "fingerprint").get(),
  ]);
  const existing = sheetsSnap.size;
  if (existing + count > LIMITS.sheetsPerGameMax) {
    fail("resource-exhausted", "too-many-sheets", `A game can have at most ${LIMITS.sheetsPerGameMax} sheets`, {
      max: LIMITS.sheetsPerGameMax,
      existing,
    });
  }
  const maxSerial = sheetsSnap.docs.reduce((m, d) => Math.max(m, Number(d.get("serial")) || 0), 0);
  const fingerprints: Set<string>[] = Array.from({ length: s.boardsPerSheet }, () => new Set());
  for (const b of boardsSnap.docs) fingerprints[b.get("slot") as number]?.add(b.get("fingerprint") as string);

  // Lock content before generating so items cannot change underneath us.
  if (!game.contentLocked) await ref.update({ contentLocked: true });
  let generated;
  try {
    generated = generateSheets({
      itemIds: itemsSnap.docs.map((d) => d.id),
      settings: s,
      count,
      startAfterSerial: maxSerial,
      existingFingerprints: fingerprints,
      rng: cryptoRng,
    });
  } catch (e) {
    if (existing === 0) await ref.update({ contentLocked: false });
    throw toHttpsError(e);
  }

  const ops: BatchOp[] = [];
  for (const sheet of generated) {
    const boardIds = sheet.boards.map((b) => boardId(sheet.serial, b.slot));
    ops.push((b) => b.create(ref.collection("sheets").doc(formatSerial(sheet.serial)), { serial: sheet.serial, boardIds }));
    for (const board of sheet.boards) {
      ops.push((b) =>
        b.create(ref.collection("boards").doc(boardId(sheet.serial, board.slot)), {
          sheetSerial: sheet.serial,
          slot: board.slot,
          cells: board.cells,
          fingerprint: board.fingerprint,
        }),
      );
    }
  }
  await commitChunked(ops);

  // New sheets may satisfy digital players waiting in open rounds of this game.
  const open = await ref.collection("sessions").where("medium", "==", "digital").get();
  const waitingRounds = open.docs.filter((d) => {
    const sd = d.data() as Session;
    return sd.status !== "ended" && (sd.waitingCount ?? 0) > 0;
  });
  if (waitingRounds.length) {
    const ids = await listSheetIds(gameId);
    for (const r of waitingRounds) await topUpWaitingPlayers(gameId, r.id, ids);
  }

  return { created: generated.length, firstSerial: maxSerial + 1, lastSerial: maxSerial + generated.length };
}

export async function resetSheetsHandler(ctx: Ctx, data: unknown): Promise<ResetSheetsResponse> {
  const { gameId } = parse(resetSheetsRequestSchema, data);
  const { ref } = await requireOwner(ctx, gameId);
  const sessions = await ref.collection("sessions").where("status", "in", ["lobby", "live", "paused"]).limit(1).get();
  if (!sessions.empty) fail("failed-precondition", "round-open", "End all open rounds before resetting sheets");
  const count = (await ref.collection("sheets").count().get()).data().count;
  await db().recursiveDelete(ref.collection("sheets"));
  await db().recursiveDelete(ref.collection("boards"));
  await ref.update({ contentLocked: false });
  return { deleted: count };
}
