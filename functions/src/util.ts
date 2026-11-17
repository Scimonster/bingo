import { createHash, randomBytes } from "node:crypto";
import { Timestamp, type DocumentReference, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import { DAY_MS, LIMITS } from "@bingo/core";
import { db } from "./admin";

export type BatchOp = (batch: WriteBatch) => void;

/** Commits write operations in batches of at most 500. */
export async function commitChunked(ops: BatchOp[], size = 500): Promise<void> {
  for (let i = 0; i < ops.length; i += size) {
    const batch = db().batch();
    for (const op of ops.slice(i, i + size)) op(batch);
    await batch.commit();
  }
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function newSecret(): string {
  return randomBytes(24).toString("base64url");
}

/** TTL timestamp for round detail (players, claims, private docs, memberships). */
export function roundExpireAt(now: number): Timestamp {
  return Timestamp.fromMillis(now + LIMITS.roundRetentionDays * DAY_MS);
}

const queues = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` after every earlier call with the same key has settled (in-process FIFO). Transactions
 * stay the source of truth; this only stops one instance's concurrent requests from contending
 * for the same document lock (e.g. a room of players joining at once).
 */
export function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

/** A Firestore transaction on a round, serialized per round within this instance. */
export function sessionTx<T>(sRef: DocumentReference, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return serialized(sRef.path, () => db().runTransaction(fn, { maxAttempts: 20 }));
}
