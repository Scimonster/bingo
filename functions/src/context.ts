import type { DocumentReference, DocumentSnapshot } from "firebase-admin/firestore";
import type { Game, Session } from "@bingo/core";
import { db } from "./admin";
import { fail } from "./errors";

/** Caller identity, extracted from the callable request (uid null = signed out). */
export interface Ctx {
  uid: string | null;
  isAnonymous: boolean;
}

export function requireAuth(ctx: Ctx): string {
  if (!ctx.uid) fail("unauthenticated", "unauthenticated", "Sign in first");
  return ctx.uid;
}

export function gameRef(gameId: string): DocumentReference {
  return db().collection("games").doc(gameId);
}

export function sessionRef(gameId: string, sessionId: string): DocumentReference {
  return gameRef(gameId).collection("sessions").doc(sessionId);
}

export async function loadGame(gameId: string): Promise<{ ref: DocumentReference; game: Game }> {
  const ref = gameRef(gameId);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "game-not-found", "Game not found");
  return { ref, game: snap.data() as Game };
}

/** Loads the game and checks the caller is its (non-anonymous) owner. */
export async function requireOwner(ctx: Ctx, gameId: string): Promise<{ ref: DocumentReference; game: Game; uid: string }> {
  const uid = requireAuth(ctx);
  if (ctx.isAnonymous) fail("permission-denied", "not-owner", "Hosts must be signed in with an account");
  const { ref, game } = await loadGame(gameId);
  if (game.ownerId !== uid) fail("permission-denied", "not-owner", "Only the game owner can do this");
  return { ref, game, uid };
}

export function sessionData(snap: DocumentSnapshot): Session {
  if (!snap.exists) fail("not-found", "round-not-found", "Round not found");
  return snap.data() as Session;
}
