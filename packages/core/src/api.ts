/**
 * Callable Function contract shared by the app and the Functions.
 *
 * Round-time actions all go through ONE 2nd-gen callable, `liveRound`, which dispatches on
 * `action` (keeps one warm instance for the whole room). Setup/admin actions are separate
 * callables named after themselves.
 */
import { z } from "zod";
import { LIMITS } from "./constants";
import { playerNameSchema, roundOptionsSchema } from "./schemas";

const id = z.string().min(1).max(128);
const serial = z.string().regex(/^\d{1,6}$/);

export const liveRoundRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ping") }),
  z.object({ action: z.literal("startRound"), gameId: id, options: roundOptionsSchema }),
  z.object({ action: z.literal("joinRound"), code: z.string().min(1).max(16), name: playerNameSchema }),
  z.object({ action: z.literal("linkSheet"), gameId: id, sessionId: id, serial }),
  z.object({ action: z.literal("draw"), gameId: id, sessionId: id, expectedCount: z.number().int().min(0), auto: z.boolean().optional() }),
  z.object({
    action: z.literal("setAutoDraw"),
    gameId: id,
    sessionId: id,
    enabled: z.boolean(),
    intervalSec: z.number().int().min(LIMITS.autoDrawMinSec).max(LIMITS.autoDrawMaxSec),
  }),
  z.object({ action: z.literal("submitClaim"), gameId: id, sessionId: id, serial }),
  z.object({ action: z.literal("decideClaim"), gameId: id, sessionId: id, claimId: id, accept: z.boolean() }),
  z.object({ action: z.literal("removePlayer"), gameId: id, sessionId: id, uid: id }),
  z.object({ action: z.literal("reassignPlayer"), gameId: id, sessionId: id, fromUid: id, toUid: id }),
  z.object({ action: z.literal("createDisplayLink"), gameId: id, sessionId: id }),
  z.object({ action: z.literal("endRound"), gameId: id, sessionId: id }),
]);
export type LiveRoundRequest = z.infer<typeof liveRoundRequestSchema>;
export type LiveRoundAction = LiveRoundRequest["action"];

export interface LiveRoundResponses {
  ping: { ok: true };
  startRound: { sessionId: string; joinCode: string; displayToken: string };
  joinRound: { gameId: string; sessionId: string; sheets: string[]; waitingForSheets: number };
  linkSheet: { sheets: string[] };
  draw: { drawn: boolean; itemId?: string; count: number };
  setAutoDraw: { nextDrawAt: number | null };
  submitClaim: { claimId: string; status: "pending" | "valid" | "invalid"; matchedPattern: string | null };
  decideClaim: { status: "valid" | "invalid" };
  removePlayer: { ok: true };
  reassignPlayer: { sheets: string[] };
  createDisplayLink: { displayToken: string };
  endRound: { ok: true };
}

export const generateSheetsRequestSchema = z.object({ gameId: id, count: z.number().int().min(1).max(LIMITS.generateMaxPerCall) });
export interface GenerateSheetsResponse { created: number; firstSerial: number; lastSerial: number }

export const resetSheetsRequestSchema = z.object({ gameId: id });
export interface ResetSheetsResponse { deleted: number }

export const exportSheetsPdfRequestSchema = z.object({ gameId: id, fromSerial: z.number().int().min(1), toSerial: z.number().int().min(1) });
/** Storage path of the PDF; the client resolves it with getDownloadURL (owner-only read). */
export interface ExportSheetsPdfResponse { storagePath: string; pages: number }

export const cloneGameRequestSchema = z.object({ gameId: id });
export interface CloneGameResponse { gameId: string }

export const deleteGameRequestSchema = z.object({ gameId: id });
export const deleteRoundRequestSchema = z.object({ gameId: id, sessionId: id });

/** Display token format: "<gameId>.<sessionId>.<secret>"; only a SHA-256 of the secret is stored. */
export const redeemDisplayTokenRequestSchema = z.object({ token: z.string().min(10).max(400) });
export interface RedeemDisplayTokenResponse { gameId: string; sessionId: string }

export const CALLABLE_NAMES = [
  "liveRound",
  "generateSheets",
  "resetSheets",
  "exportSheetsPdf",
  "cloneGame",
  "deleteGame",
  "deleteRound",
  "redeemDisplayToken",
] as const;
export type CallableName = (typeof CALLABLE_NAMES)[number];
