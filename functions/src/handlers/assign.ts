/** Digital sheet assignment shared by joinRound, generateSheets (top-up) and removePlayer. */
import type { Transaction } from "firebase-admin/firestore";
import { cryptoRng, sample, type Player, type Session } from "@bingo/core";
import { gameRef, sessionRef } from "../context";
import { sessionTx } from "../util";

/** All sheet doc IDs (zero-padded serials) of a game. Sheets only grow while rounds are open. */
export async function listSheetIds(gameId: string): Promise<string[]> {
  const snap = await gameRef(gameId).collection("sheets").select().get();
  return snap.docs.map((d) => d.id);
}

/** Picks up to `n` random sheets not yet assigned in this round. */
export function pickUnassigned(sheetIds: readonly string[], assignments: Record<string, string>, n: number): string[] {
  if (n <= 0) return [];
  const free = sheetIds.filter((id) => !(id in assignments));
  return sample(free, Math.min(n, free.length), cryptoRng);
}

/**
 * Gives waiting players in a digital round sheets that became available, oldest joiner first.
 * Returns the number of sheets assigned.
 */
export async function topUpWaitingPlayers(gameId: string, sessionId: string, sheetIds?: string[]): Promise<number> {
  const ids = sheetIds ?? (await listSheetIds(gameId));
  const sRef = sessionRef(gameId, sessionId);
  return sessionTx(sRef, async (tx: Transaction) => {
    const sSnap = await tx.get(sRef);
    if (!sSnap.exists) return 0;
    const session = sSnap.data() as Session;
    if (session.medium !== "digital" || session.status === "ended") return 0;
    const waiting = await tx.get(sRef.collection("players").where("waitingForSheets", ">", 0));
    if (waiting.empty) return 0;
    const players = waiting.docs
      .map((d) => ({ ref: d.ref, uid: d.id, p: d.data() as Player }))
      .sort((a, b) => a.p.joinedAt - b.p.joinedAt);
    const assignments = { ...(session.assignments ?? {}) };
    let assigned = 0;
    let waitingDelta = 0;
    for (const { ref, uid, p } of players) {
      const got = pickUnassigned(ids, assignments, p.waitingForSheets);
      if (!got.length) break;
      for (const s of got) assignments[s] = uid;
      assigned += got.length;
      waitingDelta -= got.length;
      tx.update(ref, { sheets: [...p.sheets, ...got], waitingForSheets: p.waitingForSheets - got.length });
    }
    if (assigned) {
      tx.update(sRef, {
        assignments,
        waitingCount: Math.max(0, (session.waitingCount ?? 0) + waitingDelta),
      });
    }
    return assigned;
  });
}
