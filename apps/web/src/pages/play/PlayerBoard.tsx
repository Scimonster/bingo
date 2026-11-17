import { useMemo } from "react";
import { BoardGrid, type Resolve } from "@bingo/sheet";
import { FREE, checkBoard, type ClaimStatus, type Grid, type Mode, type Pattern } from "@bingo/core";
import { fmt, useT } from "../../lib/i18n";
import { cn } from "../../components/ui";
import { useBoard } from "../../components/live/content";
import { patternLabel } from "../../components/live/patterns";

export interface PlayerBoardProps {
  gameId: string;
  serial: string;
  slot: number;
  grid: Grid;
  resolve: Resolve;
  mode: Mode;
  drawnIds: readonly string[];
  patterns: readonly Pattern[];
  marks: readonly number[] | undefined;
  autoMark: boolean;
  onToggle: (serial: string, index: number) => void;
  /** Central mode only. */
  onClaim?: (serial: string) => void;
  claimBusy?: boolean;
  claimStatus?: ClaimStatus | null;
  canClaim: boolean;
}

export function PlayerBoard(p: PlayerBoardProps) {
  const t = useT();
  const board = useBoard(p.gameId, p.serial, p.slot);
  const cells = board.data?.cells;

  const view = useMemo(() => {
    if (!cells) return null;
    const drawn = new Set(p.drawnIds);
    const marked = new Set<number>(p.marks ?? []);
    cells.forEach((id, i) => {
      if (id === FREE || (p.autoMark && drawn.has(id))) marked.add(i);
    });
    // Near-win hints: central mode checks the draws (authoritative); self mode checks the player's own marks.
    const covering = p.mode === "central" ? p.drawnIds : cells.filter((_, i) => marked.has(i));
    const r = checkBoard(cells, p.grid, covering, p.patterns);
    const best = [...r.unmet].sort((a, b) => a.missing - b.missing)[0];
    let hint: { kind: "won" | "near"; text: string } | null = null;
    let highlighted = new Set<number>();
    if (r.won.length) {
      hint = { kind: "won", text: p.mode === "central" ? t("youHaveBingo") : t("bingo") };
      highlighted = new Set(r.won.flatMap((w) => w.cells));
    } else if (best && best.missing <= 2 && best.missing < best.cells.length) {
      const name = patternLabel(t, best.pattern);
      hint = { kind: "near", text: best.missing === 1 ? fmt(t("oneToGo"), { pattern: name }) : fmt(t("nToGo"), { n: best.missing, pattern: name }) };
    }
    return { marked, hint, highlighted };
  }, [cells, p.drawnIds, p.marks, p.autoMark, p.mode, p.grid, p.patterns, t]);

  return (
    <section className="flex w-full flex-col items-center gap-3" aria-label={fmt(t("sheetNo"), { serial: p.serial })}>
      <div className="flex w-full items-baseline justify-between px-1">
        <h2 className="font-mono text-lg font-bold" dir="ltr">№ {p.serial}</h2>
        {view?.hint && (
          <span className={cn("rounded-full px-3 py-1 text-sm font-bold", view.hint.kind === "won" ? "animate-pulse bg-emerald-500 text-white" : "bg-amber-100 text-amber-900")}>
            {view.hint.text}
          </span>
        )}
      </div>
      {!cells || !view ? (
        <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-slate-100">
          {board.loading ? <span className="inline-block size-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /> : t("error")}
        </div>
      ) : (
        <BoardGrid
          cells={cells}
          rows={p.grid.rows}
          cols={p.grid.cols}
          resolve={p.resolve}
          variant="screen"
          marked={view.marked}
          highlighted={view.highlighted}
          onCellClick={(i) => cells[i] !== FREE && p.onToggle(p.serial, i)}
          label={fmt(t("sheetNo"), { serial: p.serial })}
          className="w-full max-w-[min(100%,70dvh)] select-none"
        />
      )}
      {p.onClaim && (
        <div className="flex w-full flex-col items-center gap-2">
          <button
            onClick={() => p.onClaim?.(p.serial)}
            disabled={!p.canClaim || p.claimBusy || !cells}
            className={cn(
              "h-16 w-full max-w-sm rounded-2xl text-3xl font-black text-white shadow-lg transition active:scale-95 disabled:opacity-40",
              view?.hint?.kind === "won" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700",
            )}
          >
            {p.claimBusy ? t("checking") : t("bingo")}
          </button>
          {p.claimStatus && (
            <p role="status" className={cn("text-center font-semibold", p.claimStatus === "valid" ? "text-emerald-700" : p.claimStatus === "invalid" ? "text-rose-700" : "text-amber-700")}>
              {p.claimStatus === "valid" ? t("claimValid") : p.claimStatus === "invalid" ? t("claimInvalid") : t("claimPending")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
