import { DEFAULTS, LIMITS, cellsPerBoard, defaultSlotLabels, varietyRatio, type GameSettings } from "@bingo/core";

/** Normalized key for duplicate detection (case- and whitespace-insensitive). */
export function itemKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export interface PasteResult {
  /** New, trimmed texts to add, in input order. */
  add: string[];
  /** Lines already present (in the game or earlier in the paste). */
  duplicates: string[];
  /** Lines longer than the limit (not added). */
  tooLong: string[];
}

/** Parses "paste many": one item per line, trims, drops blanks, ≤200 chars, dedupes. */
export function parsePasteMany(input: string, existing: Iterable<string> = [], max: number = LIMITS.textItemMax): PasteResult {
  const seen = new Set<string>();
  for (const e of existing) seen.add(itemKey(e));
  const res: PasteResult = { add: [], duplicates: [], tooLong: [] };
  for (const raw of input.split(/\r?\n/)) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > max) {
      res.tooLong.push(t);
      continue;
    }
    const k = itemKey(t);
    if (seen.has(k)) {
      res.duplicates.push(t);
      continue;
    }
    seen.add(k);
    res.add.push(t);
  }
  return res;
}

export type VarietyLevel = "error" | "warn" | "ok";

export interface Variety {
  level: VarietyLevel;
  ratio: number;
  cells: number;
  /** Items needed to reach the recommended ratio. */
  recommended: number;
  message: string;
}

/** Variety meter: error when there are fewer items than cells, warning below 2× items per cell. */
export function varietyStatus(itemCount: number, s: Pick<GameSettings, "rows" | "cols" | "freeSpace">): Variety {
  const cells = cellsPerBoard(s);
  const ratio = varietyRatio(itemCount, s);
  const recommended = Math.ceil(cells * DEFAULTS.varietyRatio);
  if (itemCount < cells) {
    return { level: "error", ratio, cells, recommended, message: `Not enough items: each board needs ${cells}, you have ${itemCount}. Add at least ${cells - itemCount} more.` };
  }
  if (ratio < DEFAULTS.varietyRatio) {
    return { level: "warn", ratio, cells, recommended, message: `Boards will look alike and sheets may be hard to generate. Aim for ${recommended}+ items (${recommended - itemCount} more).` };
  }
  return { level: "ok", ratio, cells, recommended, message: "Good variety." };
}

/** Keeps slot labels in sync with boards per sheet: keeps existing labels, fills defaults. */
export function syncSlotLabels(labels: readonly string[], n: number): string[] {
  const defaults = defaultSlotLabels(n);
  return defaults.map((d, i) => labels[i] ?? d);
}

/** Clamps the free-space position into a (possibly resized) grid; prefers the centre when out of range. */
export function clampFreeSpace(row: number, col: number, rows: number, cols: number): { row: number; col: number } {
  if (row < rows && col < cols) return { row, col };
  return { row: Math.floor((rows - 1) / 2), col: Math.floor((cols - 1) / 2) };
}

export function toggleCell(cells: readonly number[], i: number): number[] {
  return cells.includes(i) ? cells.filter((c) => c !== i) : [...cells, i].sort((a, b) => a - b);
}

/** Parses a serial range typed as numbers; returns null when invalid. */
export function parseSerialRange(from: string, to: string, maxSerial: number): { from: number; to: number } | null {
  const f = Number(from);
  const t = Number(to);
  if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < f || t > maxSerial) return null;
  return { from: f, to: t };
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${r}s` : `${r}s`;
}

/** Firestore Timestamp | number | undefined → epoch ms. */
export function toMillis(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}
