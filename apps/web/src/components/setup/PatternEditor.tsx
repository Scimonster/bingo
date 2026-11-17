import { useMemo, useState } from "react";
import { LIMITS, type Pattern } from "@bingo/core";
import { Alert, Button, Input, Label } from "../ui";
import { CellPicker } from "./CellPicker";
import { toggleCell } from "./helpers";

/** Draw a custom win pattern by tapping cells; saves {id, name, cells}. */
export function PatternEditor({
  rows,
  cols,
  freeIndex,
  onSave,
  onCancel,
}: {
  rows: number;
  cols: number;
  freeIndex: number | null;
  onSave: (p: Pattern) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [cells, setCells] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => new Set(cells), [cells]);
  const dim = useMemo(() => new Set(freeIndex === null ? [] : [freeIndex]), [freeIndex]);
  const n = rows * cols;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ id: `custom-${crypto.randomUUID().slice(0, 8)}`, name: name.trim(), cells });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
      <div>
        <Label htmlFor="pattern-name">Pattern name</Label>
        <Input id="pattern-name" dir="auto" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Letter X" />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Tap cells that must be covered ({cells.length} selected)</p>
        <CellPicker rows={rows} cols={cols} selected={selected} dim={dim} label="Custom pattern cells" onToggle={(i) => setCells((c) => toggleCell(c, i))} marker={(i) => (i === freeIndex ? "★" : null)} />
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setCells(Array.from({ length: n }, (_, i) => i))}>
            All
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCells([])}>
            Clear
          </Button>
        </div>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={busy || !name.trim() || cells.length === 0}>
          Save pattern
        </Button>
      </div>
      <p className="text-xs text-slate-500">Saved patterns belong to this game (up to 20) and work on a {rows}×{cols} grid.</p>
    </div>
  );
}

export const MAX_CUSTOM_PATTERNS = 20;
export const MAX_ROUND_PATTERNS = LIMITS.patternsPerRoundMax;
