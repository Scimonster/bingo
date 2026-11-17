import { LIMITS, MIN_CELL_MM, layoutMetrics, type Arrangement, type GameSettings, type Orientation, type PaperSize, type PrintLayout } from "@bingo/core";
import { Alert, Input, Label, Select } from "../../components/ui";
import { InfoTextEditor } from "../../components/setup/InfoTextEditor";

const PAPERS: { id: PaperSize; label: string }[] = [
  { id: "A5", label: "A5" },
  { id: "A4", label: "A4" },
  { id: "A3", label: "A3" },
  { id: "Letter", label: "Letter" },
  { id: "Legal", label: "Legal" },
  { id: "Tabloid", label: "Tabloid (11×17 in)" },
];

const ARRANGEMENTS: { id: Arrangement; label: string; min?: number; max?: number }[] = [
  { id: "row", label: "Row (side by side)", min: 2 },
  { id: "column", label: "Column (stacked)", min: 2 },
  { id: "grid", label: "Grid 2×2", min: 2 },
  { id: "single", label: "Single", max: 1 },
];

export function PrintLayoutEditor({ layout, settings, onChange }: { layout: PrintLayout; settings: GameSettings; onChange: (l: PrintLayout) => void }) {
  const set = <K extends keyof PrintLayout>(k: K, v: PrintLayout[K]) => onChange({ ...layout, [k]: v });
  const n = settings.boardsPerSheet;
  const m = layoutMetrics({ ...layout, boardsPerSheet: n, rows: settings.rows, cols: settings.cols });
  const arrangements = ARRANGEMENTS.filter((a) => (a.min === undefined || n >= a.min) && (a.max === undefined || n <= a.max));
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="pl-heading">Heading</Label>
        <Input id="pl-heading" dir="auto" value={layout.heading ?? ""} maxLength={LIMITS.headingMax} onChange={(e) => set("heading", e.target.value)} placeholder="Printed at the top of every sheet" />
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Slot labels</legend>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: n }, (_, i) => (
            <Input
              key={i}
              dir="auto"
              aria-label={`Label for slot ${i + 1}`}
              value={layout.slotLabels[i] ?? ""}
              maxLength={LIMITS.slotLabelMax}
              onChange={(e) => {
                const labels = Array.from({ length: n }, (_, j) => layout.slotLabels[j] ?? "");
                labels[i] = e.target.value;
                set("slotLabels", labels);
              }}
              placeholder={`Game ${i + 1}`}
            />
          ))}
        </div>
      </fieldset>
      <div>
        <Label htmlFor="pl-info">Info text (same on every sheet)</Label>
        <InfoTextEditor id="pl-info" value={layout.infoText} onChange={(v) => set("infoText", v)} />
        <p className="mt-1 text-xs text-slate-500">**bold**, *italic*, "- " bullets, "1. " numbered lists. {!m.hasInfoArea && "This layout has no info area."}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pl-paper">Paper</Label>
          <Select id="pl-paper" className="w-full" value={layout.paperSize} onChange={(e) => set("paperSize", e.target.value as PaperSize)}>
            {PAPERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-orient">Orientation</Label>
          <Select id="pl-orient" className="w-full" value={layout.orientation} onChange={(e) => set("orientation", e.target.value as Orientation)}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-arr">Arrangement</Label>
          <Select id="pl-arr" className="w-full" value={n === 1 ? "single" : layout.arrangement} disabled={n === 1} onChange={(e) => set("arrangement", e.target.value as Arrangement)}>
            {arrangements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-margin">Margin (mm)</Label>
          <Input
            id="pl-margin"
            type="number"
            min={LIMITS.marginMinMm}
            max={LIMITS.marginMaxMm}
            value={layout.marginMm}
            onChange={(e) => set("marginMm", Math.min(LIMITS.marginMaxMm, Math.max(LIMITS.marginMinMm, Number(e.target.value) || 0)))}
          />
        </div>
      </div>
      <p className="text-sm text-slate-600">
        Cells print at about <strong>{m.cellMm.toFixed(1)} mm</strong> ({m.boardMm.toFixed(0)} mm boards).
      </p>
      {m.tooSmall && (
        <Alert kind="warn">
          Cells are smaller than {MIN_CELL_MM} mm and may be hard to read. Try landscape, a bigger paper size, a different arrangement or a smaller margin.
        </Alert>
      )}
    </div>
  );
}
