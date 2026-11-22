/**
 * Site admin panel (`admin` callable). Reads across all hosts with the Admin SDK; every action
 * requires the `admin` custom claim. Moderation (ending/deleting rounds, deleting games) is done
 * with the ordinary owner callables, which admins pass.
 */
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import {
  adminRequestSchema,
  DAY_MS,
  type AdminGame,
  type AdminHost,
  type AdminResponses,
  type AdminRound,
  type AdminStats,
  type AdminStorageGame,
  type AdminStorageHost,
  type Game,
  type Session,
} from "@bingo/core";
import { adminApp, bucket, db } from "../admin";
import { requireAdmin, type Ctx } from "../context";
import { parse } from "../errors";
import { autoEndStaleRounds, cleanupUnreferencedImages } from "./scheduled";

export async function adminHandler(ctx: Ctx, data: unknown): Promise<AdminResponses[keyof AdminResponses]> {
  requireAdmin(ctx);
  const req = parse(adminRequestSchema, data);
  switch (req.action) {
    case "overview":
      return overview();
    case "storage":
      return storageUsage();
    case "runJob":
      if (req.job === "cleanupImages") {
        const r = await cleanupUnreferencedImages();
        return { job: "cleanupImages", deletedImageFolders: r.images, deletedExports: r.exports };
      }
      return { job: "endStaleRounds", endedRounds: await autoEndStaleRounds() };
  }
}

/** Epoch ms from a number, Firestore Timestamp or ISO/date string; null if absent. */
export function toMs(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Every Auth user, page by page. Fine at this app's scale (hosts plus anonymous players). */
async function allUsers(): Promise<UserRecord[]> {
  const auth = getAuth(adminApp());
  const out: UserRecord[] = [];
  let token: string | undefined;
  do {
    const page = await auth.listUsers(1000, token);
    out.push(...page.users);
    token = page.pageToken;
  } while (token);
  return out;
}

const isAnonymousUser = (u: UserRecord) => u.providerData.length === 0;

async function overview(): Promise<AdminResponses["overview"]> {
  const now = Date.now();
  const fs = db();
  const [users, gamesSnap, sessionsSnap, sheetsCount, playersCount] = await Promise.all([
    allUsers(),
    fs.collection("games").select("ownerId", "title", "createdAt", "contentLocked").get(),
    // Unfiltered collection-group reads need no composite index.
    fs.collectionGroup("sessions")
      .select("status", "medium", "mode", "createdAt", "lastActivityAt", "draws", "summary")
      .get(),
    fs.collectionGroup("sheets").count().get(),
    fs.collectionGroup("players").count().get(),
  ]);

  const byUid = new Map(users.map((u) => [u.uid, u]));
  const roundsByGame = new Map<string, AdminRound[]>();
  let activeRounds = 0, rounds7d = 0, rounds30d = 0, playersInEndedRounds = 0;
  for (const d of sessionsSnap.docs) {
    const gameId = d.ref.parent.parent?.id;
    if (!gameId) continue;
    const s = d.data() as Partial<Session>;
    const createdAt = toMs(s.createdAt);
    const status = s.status ?? "lobby";
    if (status !== "ended") activeRounds++;
    if (createdAt !== null && now - createdAt <= 7 * DAY_MS) rounds7d++;
    if (createdAt !== null && now - createdAt <= 30 * DAY_MS) rounds30d++;
    if (status === "ended") playersInEndedRounds += s.summary?.playerCount ?? 0;
    const round: AdminRound = {
      sessionId: d.id,
      status,
      medium: s.medium ?? "digital",
      mode: s.mode ?? "central",
      createdAt,
      lastActivityAt: toMs(s.lastActivityAt) ?? createdAt,
      drawCount: s.draws?.length ?? s.summary?.drawCount ?? 0,
      playerCount: s.summary?.playerCount ?? null,
    };
    const list = roundsByGame.get(gameId) ?? [];
    list.push(round);
    roundsByGame.set(gameId, list);
  }

  const games: AdminGame[] = await Promise.all(
    gamesSnap.docs.map(async (d) => {
      const g = d.data() as Partial<Game>;
      const [items, sheets] = await Promise.all([
        d.ref.collection("items").count().get(),
        d.ref.collection("sheets").count().get(),
      ]);
      const rounds = (roundsByGame.get(d.id) ?? []).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      const createdAt = toMs(g.createdAt);
      const lastActivityAt = Math.max(0, ...rounds.map((r) => r.lastActivityAt ?? 0)) || createdAt;
      return {
        gameId: d.id,
        title: g.title ?? "",
        ownerId: g.ownerId ?? "",
        ownerEmail: byUid.get(g.ownerId ?? "")?.email ?? null,
        createdAt,
        contentLocked: g.contentLocked === true,
        itemCount: items.data().count,
        sheetCount: sheets.data().count,
        rounds,
        lastActivityAt,
      };
    }),
  );
  games.sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));

  const gameCount = new Map<string, number>();
  for (const g of games) gameCount.set(g.ownerId, (gameCount.get(g.ownerId) ?? 0) + 1);

  const hosts: AdminHost[] = users
    .filter((u) => !isAnonymousUser(u))
    .map((u) => ({
      uid: u.uid,
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      createdAt: toMs(u.metadata.creationTime),
      lastSignInAt: toMs(u.metadata.lastSignInTime),
      disabled: u.disabled,
      isAdmin: u.customClaims?.admin === true,
      gameCount: gameCount.get(u.uid) ?? 0,
    }))
    .sort((a, b) => (b.lastSignInAt ?? 0) - (a.lastSignInAt ?? 0));

  const stats: AdminStats = {
    hosts: hosts.length,
    anonymousUsers: users.length - hosts.length,
    games: games.length,
    sheets: sheetsCount.data().count,
    rounds: sessionsSnap.size,
    activeRounds,
    rounds7d,
    rounds30d,
    playersStored: playersCount.data().count,
    playersInEndedRounds,
  };
  return { stats, hosts, games, generatedAt: now };
}

const IMAGE_FILE = /^users\/([^/]+)\/images\/([^/]+)\//;
const EXPORT_FILE = /^exports\/([^/]+)\//;

async function storageUsage(): Promise<AdminResponses["storage"]> {
  const [files] = await bucket().getFiles();
  const hosts = new Map<string, { folders: Set<string>; bytes: number }>();
  const exports = new Map<string, { files: number; bytes: number }>();
  let imageBytes = 0, exportBytes = 0, otherBytes = 0;
  for (const f of files) {
    const size = Number(f.metadata.size ?? 0) || 0;
    const img = IMAGE_FILE.exec(f.name);
    if (img) {
      const h = hosts.get(img[1]!) ?? { folders: new Set<string>(), bytes: 0 };
      h.folders.add(img[2]!);
      h.bytes += size;
      hosts.set(img[1]!, h);
      imageBytes += size;
      continue;
    }
    const exp = EXPORT_FILE.exec(f.name);
    if (exp) {
      const e = exports.get(exp[1]!) ?? { files: 0, bytes: 0 };
      e.files++;
      e.bytes += size;
      exports.set(exp[1]!, e);
      exportBytes += size;
      continue;
    }
    otherBytes += size;
  }

  const auth = getAuth(adminApp());
  const uids = [...hosts.keys()];
  const emails = new Map<string, string | null>();
  for (let i = 0; i < uids.length; i += 100) {
    const r = await auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of r.users) emails.set(u.uid, u.email ?? null);
  }
  const gameIds = [...exports.keys()];
  const titles = new Map<string, string | null>();
  if (gameIds.length) {
    const snaps = await db().getAll(...gameIds.map((id) => db().collection("games").doc(id)));
    for (const s of snaps) titles.set(s.id, s.exists ? ((s.get("title") as string | undefined) ?? null) : null);
  }

  const hostRows: AdminStorageHost[] = [...hosts]
    .map(([uid, h]) => ({ uid, email: emails.get(uid) ?? null, imageFolders: h.folders.size, imageBytes: h.bytes }))
    .sort((a, b) => b.imageBytes - a.imageBytes);
  const exportRows: AdminStorageGame[] = [...exports]
    .map(([gameId, e]) => ({ gameId, title: titles.get(gameId) ?? null, files: e.files, bytes: e.bytes }))
    .sort((a, b) => b.bytes - a.bytes);
  return {
    totalBytes: imageBytes + exportBytes + otherBytes,
    imageBytes,
    exportBytes,
    otherBytes,
    hosts: hostRows,
    exports: exportRows,
  };
}
