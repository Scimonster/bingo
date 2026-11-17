/**
 * Pure helpers for the live round screens (host console, player app, projector).
 * No Firebase or React here so they can be unit-tested.
 */
import { FREE, formatSerial, parseSerial, type Session } from "@bingo/core";

/** Parses a scanned sheet QR (full URL or path `/s/{gameId}/{serial}`). Serial is zero-padded. */
export function parseSheetQr(text: string): { gameId: string; serial: string } | null {
  const t = text.trim();
  let path = t;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) path = new URL(t).pathname;
  } catch {
    return null;
  }
  const m = /^\/s\/([^/?#]+)\/([^/?#]+)\/?$/.exec(path);
  if (!m) return null;
  const n = parseSerial(decodeURIComponent(m[2]!));
  if (n === null) return null;
  return { gameId: decodeURIComponent(m[1]!), serial: formatSerial(n) };
}

/** Normalizes a typed serial ("42", "042", "№ 42") to the zero-padded form, or null. */
export function normalizeSerialInput(input: string): string | null {
  const n = parseSerial(input);
  return n === null ? null : formatSerial(n);
}

export type AutoDrawSession = Pick<Session, "status" | "mode" | "autoDraw" | "pendingClaims" | "totalItems"> & { drawCount: number };

/** Why auto-draw is not running right now (null = it is running). */
export function autoDrawBlocker(s: AutoDrawSession): "off" | "notLive" | "empty" | "claims" | null {
  if (s.mode !== "central" || !s.autoDraw.enabled) return "off";
  if (s.status !== "live") return "notLive";
  if (s.totalItems != null && s.drawCount >= s.totalItems) return "empty";
  if ((s.pendingClaims ?? 0) > 0) return "claims";
  return null;
}

/** True when the console should call `draw` with `auto: true` now. */
export function isAutoDrawDue(s: AutoDrawSession, now: number): boolean {
  if (autoDrawBlocker(s) !== null) return false;
  const at = s.autoDraw.nextDrawAt;
  return typeof at === "number" && now >= at;
}

/** Whole seconds left until the next auto draw (null when not scheduled). */
export function secondsUntil(at: number | null | undefined, now: number): number | null {
  if (typeof at !== "number") return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** localStorage key remembering the last joined round of a game. */
export const lastRoundKey = (gameId: string) => `bingo:lastRound:${gameId}`;

export function readLastRound(storage: Pick<Storage, "getItem"> | undefined, gameId: string): string | null {
  try {
    const raw = storage?.getItem(lastRoundKey(gameId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { sessionId?: unknown };
    return typeof v.sessionId === "string" && v.sessionId ? v.sessionId : null;
  } catch {
    return null;
  }
}

export function writeLastRound(storage: Pick<Storage, "setItem"> | undefined, gameId: string, sessionId: string): void {
  try {
    storage?.setItem(lastRoundKey(gameId), JSON.stringify({ sessionId }));
  } catch {
    /* storage unavailable */
  }
}

/** Cell indices of a board whose item has been drawn, plus the free space. */
export function coveredCells(cells: readonly string[], drawn: ReadonlySet<string>): Set<number> {
  const out = new Set<number>();
  cells.forEach((id, i) => {
    if (id === FREE || drawn.has(id)) out.add(i);
  });
  return out;
}

/** Toggles a cell in a marks array (sorted, unique). */
export function toggleMark(marks: readonly number[] | undefined, index: number): number[] {
  const s = new Set(marks ?? []);
  if (s.has(index)) s.delete(index);
  else s.add(index);
  return [...s].sort((a, b) => a - b);
}

/**
 * Delays (ms) between the frames of the spinner reveal: `frames` steps that slow down
 * (ease-out) and add up to about `totalMs`.
 */
export function spinSchedule(frames: number, totalMs: number): number[] {
  if (frames <= 0) return [];
  const weights = Array.from({ length: frames }, (_, i) => 1 + (i / Math.max(1, frames - 1)) ** 2 * 6);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.round((w / sum) * totalMs));
}

/** Picks `n` pseudo-random items from a pool for decorative spinner frames, avoiding immediate repeats. */
export function spinFrames<T>(pool: readonly T[], n: number, final: T, rand: () => number = Math.random): T[] {
  if (pool.length === 0) return [];
  const others = pool.filter((x) => x !== final);
  const out: T[] = [];
  let prev: T | undefined;
  for (let i = 0; i < n; i++) {
    const candidates = others.length > 1 ? others.filter((x) => x !== prev) : others.length ? others : pool;
    const pick = candidates[Math.floor(rand() * candidates.length)]!;
    out.push(pick);
    prev = pick;
  }
  return out;
}

/** "m:ss" for a duration in seconds. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
