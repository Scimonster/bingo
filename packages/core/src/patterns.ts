import type { Pattern, PatternGroup } from "./types";

export interface Grid {
  rows: number;
  cols: number;
}

export const BUILTIN_PATTERNS: Pattern[] = [
  { id: "line", name: "Any line", group: "line" },
  { id: "row", name: "Any row", group: "row" },
  { id: "column", name: "Any column", group: "column" },
  { id: "diagonal", name: "Either diagonal", group: "diagonal" },
  { id: "corners", name: "Four corners", group: "corners" },
  { id: "blackout", name: "Blackout", group: "blackout" },
];

export const DEFAULT_PATTERNS: Pattern[] = [BUILTIN_PATTERNS[0]!];

export function rowCells(g: Grid, r: number): number[] {
  return Array.from({ length: g.cols }, (_, c) => r * g.cols + c);
}
export function colCells(g: Grid, c: number): number[] {
  return Array.from({ length: g.rows }, (_, r) => r * g.cols + c);
}
/** Diagonals only exist on square grids. */
export function diagonals(g: Grid): number[][] {
  if (g.rows !== g.cols) return [];
  const n = g.rows;
  return [
    Array.from({ length: n }, (_, i) => i * n + i),
    Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)),
  ];
}

function groupAlternatives(group: PatternGroup, g: Grid): number[][] {
  const rows = Array.from({ length: g.rows }, (_, r) => rowCells(g, r));
  const cols = Array.from({ length: g.cols }, (_, c) => colCells(g, c));
  switch (group) {
    case "row":
      return rows;
    case "column":
      return cols;
    case "diagonal":
      return diagonals(g);
    case "line":
      return [...rows, ...cols, ...diagonals(g)];
    case "corners":
      return [[0, g.cols - 1, (g.rows - 1) * g.cols, g.rows * g.cols - 1]];
    case "blackout":
      return [Array.from({ length: g.rows * g.cols }, (_, i) => i)];
  }
}

/** Expands a pattern into its alternatives: covering any one of them wins. */
export function expandPattern(p: Pattern, g: Grid): number[][] {
  if (p.group) return groupAlternatives(p.group, g);
  const n = g.rows * g.cols;
  const cells = [...new Set(p.cells ?? [])].filter((i) => Number.isInteger(i) && i >= 0 && i < n);
  return cells.length ? [cells.sort((a, b) => a - b)] : [];
}

/** True when a custom pattern's cells are valid for the grid. */
export function isValidCustomPattern(p: Pattern, g: Grid): boolean {
  if (p.group) return true;
  const n = g.rows * g.cols;
  return !!p.cells && p.cells.length > 0 && p.cells.every((i) => Number.isInteger(i) && i >= 0 && i < n);
}
