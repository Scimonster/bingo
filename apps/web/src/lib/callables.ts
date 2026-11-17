import { httpsCallable } from "firebase/functions";
import type {
  CloneGameResponse, ExportSheetsPdfResponse, GenerateSheetsResponse, LiveRoundRequest, LiveRoundResponses,
  RedeemDisplayTokenResponse, ResetSheetsResponse,
} from "@bingo/core";
import { functions } from "./firebase";

/** Calls the liveRound dispatcher with a typed action. */
export async function liveRound<A extends LiveRoundRequest["action"]>(
  req: Extract<LiveRoundRequest, { action: A }>,
): Promise<LiveRoundResponses[A]> {
  const res = await httpsCallable(functions, "liveRound")(req);
  return res.data as LiveRoundResponses[A];
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  const res = await httpsCallable(functions, name, { timeout: 540_000 })(data);
  return res.data as Res;
}

export const generateSheets = (gameId: string, count: number) => call<object, GenerateSheetsResponse>("generateSheets", { gameId, count });
export const resetSheets = (gameId: string) => call<object, ResetSheetsResponse>("resetSheets", { gameId });
export const exportSheetsPdf = (gameId: string, fromSerial: number, toSerial: number) =>
  call<object, ExportSheetsPdfResponse>("exportSheetsPdf", { gameId, fromSerial, toSerial });
export const cloneGame = (gameId: string) => call<object, CloneGameResponse>("cloneGame", { gameId });
export const deleteGame = (gameId: string) => call<object, { ok: true }>("deleteGame", { gameId });
export const deleteRound = (gameId: string, sessionId: string) => call<object, { ok: true }>("deleteRound", { gameId, sessionId });
export const redeemDisplayToken = (token: string) => call<object, RedeemDisplayTokenResponse>("redeemDisplayToken", { token });

/** Human-readable message from a callable error. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
