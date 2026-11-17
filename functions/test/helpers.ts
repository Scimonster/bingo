import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { HttpsError } from "firebase-functions/v2/https";
import { expect } from "vitest";
import {
  checkBoard,
  defaultPrintLayout,
  type Board,
  type GameSettings,
  type LiveRoundRequest,
  type LiveRoundResponses,
  type Session,
  type Sheet,
  type Player,
} from "@bingo/core";
import { db } from "../src/admin";
import type { Ctx } from "../src/context";
import { liveRoundHandler } from "../src/handlers/liveRound";
import { generateSheetsHandler } from "../src/handlers/sheets";

for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
  if (!process.env[v]) throw new Error(`${v} is not set: run these tests under \`firebase emulators:exec\``);
}

export const SETTINGS_3x3: GameSettings = {
  rows: 3,
  cols: 3,
  freeSpace: { enabled: true, row: 1, col: 1 },
  boardsPerSheet: 2,
};

export async function newHost(): Promise<Ctx> {
  const user = await getAuth().createUser({ email: `host-${randomUUID()}@example.com`, password: "test-password" });
  return { uid: user.uid, isAnonymous: false };
}

export function anon(label = "p"): Ctx {
  return { uid: `${label}-${randomUUID()}`, isAnonymous: true };
}

export async function createGame(
  host: Ctx,
  opts: { settings?: GameSettings; items?: number; title?: string } = {},
): Promise<string> {
  const settings = opts.settings ?? SETTINGS_3x3;
  const ref = db().collection("games").doc();
  await ref.set({
    ownerId: host.uid,
    title: opts.title ?? "Test game",
    createdAt: Date.now(),
    playerLanguage: "en",
    settings,
    printLayout: defaultPrintLayout(settings.boardsPerSheet),
  });
  const n = opts.items ?? 16;
  const batch = db().batch();
  for (let i = 0; i < n; i++) {
    batch.set(ref.collection("items").doc(`item${String(i).padStart(2, "0")}`), { type: "text", text: `Item ${i}`, createdAt: Date.now() });
  }
  await batch.commit();
  return ref.id;
}

export async function gameWithSheets(host: Ctx, count: number, opts: Parameters<typeof createGame>[1] = {}): Promise<string> {
  const gameId = await createGame(host, opts);
  await generateSheetsHandler(host, { gameId, count });
  return gameId;
}

export async function live<A extends LiveRoundRequest["action"]>(
  ctx: Ctx,
  req: Extract<LiveRoundRequest, { action: A }> | (Record<string, unknown> & { action: A }),
): Promise<LiveRoundResponses[A]> {
  return (await liveRoundHandler(ctx, req)) as LiveRoundResponses[A];
}

export async function expectError(p: Promise<unknown>, code: string, reason?: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpsError);
    const err = e as HttpsError;
    expect(err.code).toBe(code);
    if (reason) expect((err.details as { reason?: string })?.reason).toBe(reason);
    return;
  }
  throw new Error(`Expected ${code}${reason ? `/${reason}` : ""} but the call succeeded`);
}

export const sessionDoc = (gameId: string, sessionId: string) =>
  db().collection("games").doc(gameId).collection("sessions").doc(sessionId);

export async function getSession(gameId: string, sessionId: string): Promise<Session> {
  return (await sessionDoc(gameId, sessionId).get()).data() as Session;
}

export async function getPlayer(gameId: string, sessionId: string, uid: string): Promise<Player | undefined> {
  return (await sessionDoc(gameId, sessionId).collection("players").doc(uid).get()).data() as Player | undefined;
}

export async function setStatus(gameId: string, sessionId: string, status: Session["status"]): Promise<void> {
  await sessionDoc(gameId, sessionId).update({ status });
}

export async function boardFor(gameId: string, serial: string, slot: number): Promise<Board> {
  const g = db().collection("games").doc(gameId);
  const sheet = (await g.collection("sheets").doc(serial).get()).data() as Sheet;
  return (await g.collection("boards").doc(sheet.boardIds[slot]!).get()).data() as Board;
}

/** Draws until the given sheet's board wins one of the round's patterns. Returns the draw count. */
export async function drawUntilWin(host: Ctx, gameId: string, sessionId: string, serial: string): Promise<number> {
  const session = await getSession(gameId, sessionId);
  const board = await boardFor(gameId, serial, session.sheetSlot);
  const game = (await db().collection("games").doc(gameId).get()).data()!;
  const grid = { rows: game.settings.rows, cols: game.settings.cols };
  const drawn: string[] = session.draws.map((d) => d.itemId);
  for (;;) {
    if (checkBoard(board.cells, grid, drawn, session.patterns).won.length) return drawn.length;
    const r = await live(host, { action: "draw", gameId, sessionId, expectedCount: drawn.length });
    if (!r.drawn) throw new Error("Bag empty before a win");
    drawn.push(r.itemId!);
  }
}
