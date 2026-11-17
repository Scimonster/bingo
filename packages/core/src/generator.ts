import { FREE } from "./constants";
import { boardFingerprint } from "./hash";
import { sample, type Rng } from "./rng";
import type { GameSettings } from "./types";

export interface GeneratedBoard {
  slot: number;
  cells: string[];
  fingerprint: string;
}

export interface GeneratedSheet {
  serial: number;
  boards: GeneratedBoard[];
}

export interface GenerateOptions {
  itemIds: readonly string[];
  settings: Pick<GameSettings, "rows" | "cols" | "freeSpace" | "boardsPerSheet">;
  count: number;
  /** Highest serial already used (0 when none). New serials continue from it. */
  startAfterSerial?: number;
  /** Fingerprints already used, per slot (index = slot). Includes earlier sheets. */
  existingFingerprints?: ReadonlyArray<ReadonlySet<string>>;
  rng: Rng;
  /** Max re-rolls per board before giving up. */
  maxAttempts?: number;
}

export class GenerationError extends Error {
  constructor(
    public code: "not-enough-items" | "uniqueness" | "overlap" | "bad-settings",
    message: string,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

export function cellsPerBoard(s: Pick<GameSettings, "rows" | "cols" | "freeSpace">): number {
  return s.rows * s.cols - (s.freeSpace.enabled ? 1 : 0);
}

export function freeIndex(s: Pick<GameSettings, "cols" | "freeSpace">): number | null {
  return s.freeSpace.enabled ? s.freeSpace.row * s.cols + s.freeSpace.col : null;
}

/**
 * Max items two boards on one sheet may share: about half their items. When the content is
 * too small for that to be likely, the bar rises to the expected random overlap so generation
 * cannot dead-lock (the content editor's variety meter warns about this case).
 */
export function maxSheetOverlap(cells: number, itemCount: number): number {
  return Math.max(Math.floor(cells / 2), Math.ceil((cells * cells) / Math.max(itemCount, 1)));
}

/** Items per cell; below DEFAULTS.varietyRatio (2) the UI warns boards will look alike. */
export function varietyRatio(itemCount: number, s: Pick<GameSettings, "rows" | "cols" | "freeSpace">): number {
  const c = cellsPerBoard(s);
  return c > 0 ? itemCount / c : 0;
}

function overlap(a: readonly string[], b: ReadonlySet<string>): number {
  let n = 0;
  for (const x of a) if (x !== FREE && b.has(x)) n++;
  return n;
}

export function makeBoard(itemIds: readonly string[], s: GenerateOptions["settings"], rng: Rng): string[] {
  const picked = sample(itemIds, cellsPerBoard(s), rng);
  const fi = freeIndex(s);
  if (fi !== null) picked.splice(fi, 0, FREE);
  return picked;
}

/**
 * Sheet generation (spec: generateSheets(items, settings, count, existingFingerprints)).
 * Every board is unique within its slot (across all sheets, including earlier ones), and
 * boards on the same sheet share at most about half their items.
 */
export function generateSheets(opts: GenerateOptions): GeneratedSheet[] {
  const { settings: s, rng, count } = opts;
  const itemIds = [...new Set(opts.itemIds)];
  const maxAttempts = opts.maxAttempts ?? 2000;
  if (s.rows < 1 || s.cols < 1 || s.boardsPerSheet < 1) throw new GenerationError("bad-settings", "Invalid grid");
  const fi = freeIndex(s);
  if (fi !== null && (fi < 0 || fi >= s.rows * s.cols)) throw new GenerationError("bad-settings", "Free space outside the grid");
  const cells = cellsPerBoard(s);
  if (itemIds.length < cells) {
    throw new GenerationError("not-enough-items", `Need at least ${cells} items, have ${itemIds.length}`);
  }
  const seen: Set<string>[] = Array.from({ length: s.boardsPerSheet }, (_, i) => new Set(opts.existingFingerprints?.[i] ?? []));
  const maxOverlap = maxSheetOverlap(cells, itemIds.length);
  const out: GeneratedSheet[] = [];
  let serial = opts.startAfterSerial ?? 0;
  for (let n = 0; n < count; n++) {
    serial++;
    const boards: GeneratedBoard[] = [];
    for (let slot = 0; slot < s.boardsPerSheet; slot++) {
      let attempts = 0;
      let uniqueFailures = 0;
      for (;;) {
        if (attempts++ >= maxAttempts) {
          throw uniqueFailures > attempts / 2
            ? new GenerationError("uniqueness", "Ran out of unique boards; add more items")
            : new GenerationError("overlap", "Could not keep boards on one sheet different enough; add more items");
        }
        const b = makeBoard(itemIds, s, rng);
        const fp = boardFingerprint(b);
        if (seen[slot]!.has(fp)) {
          uniqueFailures++;
          continue;
        }
        const ok = boards.every((other) => overlap(b, new Set(other.cells)) <= maxOverlap);
        if (!ok) continue;
        seen[slot]!.add(fp);
        boards.push({ slot, cells: b, fingerprint: fp });
        break;
      }
    }
    out.push({ serial, boards });
  }
  return out;
}
