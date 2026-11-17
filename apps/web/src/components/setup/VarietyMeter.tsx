import { DEFAULTS, type GameSettings } from "@bingo/core";
import { cn } from "../ui";
import { varietyStatus } from "./helpers";

/** Items-per-cell meter: red below 1×, amber below 2×, green from 2×. */
export function VarietyMeter({ itemCount, settings, className }: { itemCount: number; settings: GameSettings; className?: string }) {
  const v = varietyStatus(itemCount, settings);
  const scaleMax = DEFAULTS.varietyRatio * 1.5; // bar spans 0–3×
  const pct = Math.min(100, (v.ratio / scaleMax) * 100);
  const color = { error: "bg-red-500", warn: "bg-amber-500", ok: "bg-emerald-500" }[v.level];
  const text = { error: "text-red-800", warn: "text-amber-800", ok: "text-emerald-800" }[v.level];
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Variety</span>
        <span className="text-slate-600">
          {itemCount} items · {v.cells} per board · <strong>{v.ratio.toFixed(1)}×</strong>
        </span>
      </div>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-slate-200"
        role="meter"
        aria-label="Items per cell"
        aria-valuemin={0}
        aria-valuemax={scaleMax}
        aria-valuenow={Number(v.ratio.toFixed(2))}
        aria-valuetext={`${v.ratio.toFixed(1)} items per cell`}
      >
        <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-px bg-slate-500" style={{ left: `${(1 / scaleMax) * 100}%` }} title="1× (minimum)" />
        <div className="absolute inset-y-0 w-px bg-slate-700" style={{ left: `${(DEFAULTS.varietyRatio / scaleMax) * 100}%` }} title="2× (recommended)" />
      </div>
      <p className={cn("text-sm", text)} role={v.level === "ok" ? undefined : "status"}>
        {v.message}
      </p>
    </div>
  );
}
