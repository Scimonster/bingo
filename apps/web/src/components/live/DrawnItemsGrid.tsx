import { useEffect, useRef, useState } from "react";
import type { Resolve } from "@bingo/sheet";
import { ItemTile } from "./content";
import { bestGridColumns } from "./liveUtils";
import { cn } from "../ui";

const GAP = 6;

/**
 * Grid of items with drawn ones lit. `fit` sizes square cells to fill the container (projector);
 * otherwise cells flow at `minCell` px.
 */
export function DrawnItemsGrid({
  itemIds, drawn, resolve, latest, fit = false, minCell = 64, theme = "light", className,
}: {
  itemIds: readonly string[];
  drawn: ReadonlySet<string>;
  resolve: Resolve;
  latest?: string | null;
  fit?: boolean;
  minCell?: number;
  theme?: "light" | "dark";
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!fit || !box.current) return;
    const el = box.current;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  const layout = fit && dims ? bestGridColumns(itemIds.length, dims.w, dims.h, GAP) : null;
  const style = layout
    ? { gridTemplateColumns: `repeat(${layout.cols}, ${layout.size}px)`, gridAutoRows: `${layout.size}px`, gap: GAP }
    : { gridTemplateColumns: `repeat(auto-fill, minmax(${minCell}px, 1fr))`, gap: GAP };
  return (
    <div ref={box} className={cn(fit && "flex h-full w-full items-center justify-center", className)}>
      {(!fit || layout) && (
        <div className="grid content-center justify-center" style={style}>
          {itemIds.map((id) => {
            const on = drawn.has(id);
            return (
              <div
                key={id}
                className={cn(
                  "overflow-hidden rounded-md transition-all duration-700",
                  theme === "dark"
                    ? on ? "bg-white text-slate-950 shadow-[0_0_18px_rgba(250,204,21,0.55)]" : "bg-slate-800/60 text-slate-400 opacity-35"
                    : on ? "bg-white ring-2 ring-indigo-500" : "bg-slate-100 opacity-40",
                  id === latest && (theme === "dark" ? "ring-4 ring-yellow-400" : "ring-4 ring-amber-400"),
                )}
              >
                <ItemTile itemId={id} resolve={resolve} className="w-full" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
