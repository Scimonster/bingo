import { FREE } from "./constants";
import { expandPattern, type Grid } from "./patterns";
import type { Pattern } from "./types";

export interface PatternProgress {
  pattern: Pattern;
  /** Fewest cells still missing over the pattern's alternatives (0 = won). */
  missing: number;
  /** The best alternative's cells (the winning one when missing = 0). */
  cells: number[];
}

export interface CheckResult {
  won: PatternProgress[];
  unmet: PatternProgress[];
  /** Cell indices covered by draws or the free space. */
  covered: number[];
}

/**
 * Win checking. Returns the patterns fully covered by drawn items (plus the free space,
 * which is stored as FREE in the cells), and for each unmet pattern how many cells are
 * still missing. Used by the player app for highlighting and by submitClaim as the
 * authoritative check. Marks are never consulted.
 */
export function checkBoard(
  cells: readonly string[],
  grid: Grid,
  drawnItemIds: Iterable<string>,
  patterns: readonly Pattern[],
): CheckResult {
  const drawn = drawnItemIds instanceof Set ? (drawnItemIds as Set<string>) : new Set(drawnItemIds);
  const coveredSet = new Set<number>();
  cells.forEach((id, i) => {
    if (id === FREE || drawn.has(id)) coveredSet.add(i);
  });
  const won: PatternProgress[] = [];
  const unmet: PatternProgress[] = [];
  for (const pattern of patterns) {
    let best: PatternProgress | null = null;
    for (const alt of expandPattern(pattern, grid)) {
      const missing = alt.reduce((n, i) => n + (coveredSet.has(i) ? 0 : 1), 0);
      if (!best || missing < best.missing) best = { pattern, missing, cells: alt };
    }
    if (!best) continue;
    (best.missing === 0 ? won : unmet).push(best);
  }
  return { won, unmet, covered: [...coveredSet].sort((a, b) => a - b) };
}
