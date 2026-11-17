import type { Resolve } from "@bingo/sheet";
import { ItemTile } from "./content";
import { cn } from "../ui";

/**
 * Grid of items with drawn ones lit. `fit` sizes the grid to fill its container (projector);
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
  const n = itemIds.length;
  const cols = fit ? Math.max(1, Math.ceil(Math.sqrt(n * 1.7))) : 0;
  const rows = fit ? Math.max(1, Math.ceil(n / cols)) : 0;
  const style = fit
    ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }
    : { gridTemplateColumns: `repeat(auto-fill, minmax(${minCell}px, 1fr))` };
  return (
    <div className={cn("grid gap-1.5", fit && "h-full", className)} style={style}>
      {itemIds.map((id) => {
        const on = drawn.has(id);
        return (
          <div
            key={id}
            className={cn(
              "flex min-h-0 items-center justify-center rounded-md transition-all duration-700",
              theme === "dark"
                ? on ? "bg-white text-slate-950 shadow-[0_0_18px_rgba(250,204,21,0.55)]" : "bg-slate-800/60 text-slate-400 opacity-35"
                : on ? "bg-white ring-2 ring-indigo-500" : "bg-slate-100 opacity-40",
              id === latest && (theme === "dark" ? "ring-4 ring-yellow-400" : "ring-4 ring-amber-400"),
            )}
          >
            <ItemTile itemId={id} resolve={resolve} className={cn(fit ? "h-full max-h-full w-auto max-w-full" : "w-full")} />
          </div>
        );
      })}
    </div>
  );
}
