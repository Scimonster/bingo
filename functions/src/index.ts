import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, type CallableOptions, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import type { Ctx } from "./context";
import { toHttpsError } from "./errors";
import { liveRoundHandler } from "./handlers/liveRound";
import { generateSheetsHandler, resetSheetsHandler } from "./handlers/sheets";
import { cloneGameHandler, deleteGameHandler, deleteRoundHandler } from "./handlers/games";
import { redeemDisplayTokenHandler } from "./handlers/round";
import { adminHandler } from "./handlers/adminPanel";
import { autoEndStaleRounds as autoEndStaleRoundsJob, cleanupUnreferencedImages as cleanupJob } from "./handlers/scheduled";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

/**
 * Set ENFORCE_APP_CHECK=true (e.g. in functions/.env.<project>) to require App Check on callables.
 * Read from the environment directly: callables check App Check at runtime, and a defineBoolean
 * param would be resolved at load time anyway (with a warning).
 */
const enforceAppCheck = process.env.ENFORCE_APP_CHECK === "true";

function ctxOf(req: CallableRequest): Ctx {
  const provider = (req.auth?.token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  const isAnonymous = provider === "anonymous";
  return { uid: req.auth?.uid ?? null, isAnonymous, isAdmin: !isAnonymous && req.auth?.token.admin === true };
}

function callable<R>(handler: (ctx: Ctx, data: unknown) => Promise<R>, opts: CallableOptions = {}) {
  return onCall({ enforceAppCheck, ...opts }, async (req) => {
    try {
      return await handler(ctxOf(req), req.data);
    } catch (e) {
      throw toHttpsError(e);
    }
  });
}

/** All round-time actions; one warm instance serves the whole room. */
export const liveRound = callable(liveRoundHandler, { concurrency: 80, cpu: 1, memory: "512MiB", minInstances: 0 });

export const generateSheets = callable(generateSheetsHandler, { memory: "1GiB", timeoutSeconds: 300 });
export const resetSheets = callable(resetSheetsHandler, { timeoutSeconds: 300 });
export const cloneGame = callable(cloneGameHandler);
export const deleteGame = callable(deleteGameHandler, { timeoutSeconds: 300 });
export const deleteRound = callable(deleteRoundHandler);
export const redeemDisplayToken = callable(redeemDisplayTokenHandler);
/** Site admin panel (custom claim admin == true). */
export const admin = callable(adminHandler, { timeoutSeconds: 300, memory: "512MiB" });

export const autoEndStaleRounds = onSchedule({ schedule: "every day 04:00", timeZone: "UTC" }, async () => {
  const n = await autoEndStaleRoundsJob();
  logger.info(`Ended ${n} stale rounds`);
});

export const cleanupUnreferencedImages = onSchedule(
  { schedule: "every monday 05:00", timeZone: "UTC", timeoutSeconds: 540 },
  async () => {
    const r = await cleanupJob();
    logger.info(`Deleted ${r.images} unreferenced image folders and ${r.exports} old exports`);
  },
);

export { exportSheetsPdf } from "./pdf";
