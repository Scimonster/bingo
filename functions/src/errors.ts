import { HttpsError, type FunctionsErrorCode } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { ZodError, type ZodType } from "zod";
import { GenerationError } from "@bingo/core";

/**
 * Throws an HttpsError whose `details.reason` is a stable machine-readable string the web client
 * can switch on (messages are English and for logs only).
 */
export function fail(code: FunctionsErrorCode, reason: string, message?: string, extra?: Record<string, unknown>): never {
  throw new HttpsError(code, message ?? reason, { reason, ...extra });
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    fail("invalid-argument", "invalid-request", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return r.data;
}

/** Maps anything thrown by a handler to an HttpsError. */
export function toHttpsError(e: unknown): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof ZodError) return new HttpsError("invalid-argument", e.message, { reason: "invalid-request" });
  if (e instanceof GenerationError) return new HttpsError("failed-precondition", e.message, { reason: e.code });
  logger.error("Unhandled error", e);
  return new HttpsError("internal", "Internal error", { reason: "internal" });
}

/** gRPC ALREADY_EXISTS from Firestore `create()`. */
export function isAlreadyExists(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}
