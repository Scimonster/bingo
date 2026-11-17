import { cn } from "../ui";

/**
 * A rows×cols grid of toggle buttons (always LTR so cell order matches boards). Used for the
 * free-space position and the custom pattern editor.
 */
export function CellPicker({
  rows,
  cols,
  selected,
  onToggle,
  disabled,
  label,
  marker,
  dim,
}: {
  rows: number;
  cols: number;
  selected: ReadonlySet<number>;
  onToggle: (index: number) => void;
  disabled?: boolean;
  label: string;
  marker?: (index: number, on: boolean) => React.ReactNode;
  dim?: ReadonlySet<number>;
}) {
  return (
    <div role="group" aria-label={label} dir="ltr" className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 2.25rem)` }}>
      {Array.from({ length: rows * cols }, (_, i) => {
        const on = selected.has(i);
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={`Row ${Math.floor(i / cols) + 1}, column ${(i % cols) + 1}`}
            onClick={() => onToggle(i)}
            className={cn(
              "flex size-9 items-center justify-center rounded border text-sm transition-colors disabled:cursor-not-allowed",
              on ? "border-indigo-700 bg-indigo-600 text-white" : "border-slate-300 bg-white hover:bg-indigo-50",
              dim?.has(i) && !on && "bg-slate-100",
              disabled && "opacity-60",
            )}
          >
            {marker?.(i, on)}
          </button>
        );
      })}
    </div>
  );
}
