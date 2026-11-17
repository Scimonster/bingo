import { useMemo } from "react";
import { BoardGrid, type Resolve } from "@bingo/sheet";
import { checkBoard, type Grid, type Pattern } from "@bingo/core";
import { useBoard } from "./content";
import { Spinner, cn } from "../ui";

/**
 * A sheet's board for the round's slot with drawn cells marked and the winning pattern
 * highlighted. Used for claim review (console) and the projector's win overlay.
 */
export function WinBoard({
  gameId, serial, slot, grid, drawnIds, patterns, patternIds, resolve, label, className, notFound = "Board not found",
}: {
  gameId: string;
  serial: string;
  slot: number;
  grid: Grid;
  drawnIds: readonly string[];
  patterns: readonly Pattern[];
  /** Highlight only these patterns' cells (falls back to every won pattern). */
  patternIds?: readonly (string | null)[];
  resolve: Resolve;
  label?: string;
  className?: string;
  notFound?: string;
}) {
  const board = useBoard(gameId, serial, slot);
  const cells = board.data?.cells;
  const view = useMemo(() => {
    if (!cells) return null;
    const r = checkBoard(cells, grid, drawnIds, patterns);
    const chosen = patternIds?.length ? r.won.filter((w) => patternIds.includes(w.pattern.id)) : [];
    const won = chosen.length ? chosen : r.won;
    return { marked: new Set(r.covered), highlighted: new Set(won.flatMap((w) => w.cells)) };
  }, [cells, grid, drawnIds, patterns, patternIds]);
  if (board.loading) return <Spinner className="m-4" />;
  if (!cells || !view) return <p className={cn("text-sm opacity-70", className)}>{notFound}</p>;
  return (
    <BoardGrid
      cells={cells}
      rows={grid.rows}
      cols={grid.cols}
      resolve={resolve}
      variant="screen"
      marked={view.marked}
      highlighted={view.highlighted}
      label={label}
      className={className}
    />
  );
}
