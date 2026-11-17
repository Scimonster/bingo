import { logger } from "firebase-functions";
import { DAY_MS, LIMITS, type Game, type Session } from "@bingo/core";
import { bucket, db } from "../admin";
import { endRoundInternal } from "./round";

/** Ends lobby/live/paused rounds with no activity for 24 h. Returns the number ended. */
export async function autoEndStaleRounds(now = Date.now()): Promise<number> {
  const cutoff = now - LIMITS.staleRoundHours * 3600_000;
  let ended = 0;
  // Per-game queries use automatic single-field indexes (no collection-group index needed).
  const games = await db().collection("games").select().get();
  for (const g of games.docs) {
    const open = await g.ref.collection("sessions").where("status", "in", ["lobby", "live", "paused"]).get();
    for (const s of open.docs) {
      const sd = s.data() as Session;
      const last = sd.lastActivityAt ?? sd.createdAt ?? 0;
      if (last >= cutoff) continue;
      try {
        if (await endRoundInternal(g.id, s.id, now)) ended++;
      } catch (e) {
        logger.error("Failed to end stale round", { gameId: g.id, sessionId: s.id, e });
      }
    }
  }
  return ended;
}

const IMAGE_FOLDER = /^(users\/[^/]+\/images\/[^/]+)\//;

/**
 * Deletes image folders (users/{uid}/images/{id}/) older than a day that no item or free-space
 * content references, and export PDFs older than 7 days (backstop for the bucket lifecycle rule).
 */
export async function cleanupUnreferencedImages(now = Date.now()): Promise<{ images: number; exports: number }> {
  const referenced = new Set<string>();
  const items = await db().collectionGroup("items").select("storagePath").get();
  for (const d of items.docs) {
    const p = d.get("storagePath");
    if (typeof p === "string") referenced.add(p);
  }
  const games = await db().collection("games").select("settings").get();
  for (const d of games.docs) {
    const p = (d.data() as Partial<Game>).settings?.freeSpace?.content?.storagePath;
    if (typeof p === "string") referenced.add(p);
  }

  const b = bucket();
  const [files] = await b.getFiles({ prefix: "users/" });
  const folders = new Map<string, { newest: number; files: typeof files }>();
  for (const f of files) {
    const m = IMAGE_FOLDER.exec(f.name);
    if (!m) continue;
    const created = Date.parse(String(f.metadata.timeCreated ?? "")) || now;
    const entry = folders.get(m[1]!) ?? { newest: 0, files: [] };
    entry.newest = Math.max(entry.newest, created);
    entry.files.push(f);
    folders.set(m[1]!, entry);
  }
  let images = 0;
  for (const [folder, { newest, files: fs }] of folders) {
    if (referenced.has(folder) || now - newest < DAY_MS) continue;
    await Promise.all(fs.map((f) => f.delete({ ignoreNotFound: true })));
    images++;
  }

  let exports = 0;
  const [exportFiles] = await b.getFiles({ prefix: "exports/" });
  for (const f of exportFiles) {
    const created = Date.parse(String(f.metadata.timeCreated ?? "")) || now;
    if (now - created < LIMITS.exportRetentionDays * DAY_MS) continue;
    await f.delete({ ignoreNotFound: true });
    exports++;
  }
  return { images, exports };
}
