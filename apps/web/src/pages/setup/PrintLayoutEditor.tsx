import { useRef, useState } from "react";
import { INFO_BLOCK, LIMITS, MIN_CELL_MM, blockOrder, hasInfoContent, layoutMetrics, type Arrangement, type GameSettings, type Orientation, type PaperSize, type PrintLayout } from "@bingo/core";
import { Alert, Button, Input, Label, Select, Spinner } from "../../components/ui";
import { InfoBoxEditor } from "../../components/setup/InfoBoxEditor";
import { useImageUrls } from "../../lib/hooks";
import { uploadImage } from "../../lib/images";
import { errorMessage } from "../../lib/callables";

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

export function PrintLayoutEditor({ layout, settings, uid, onChange }: { layout: PrintLayout; settings: GameSettings; uid: string; onChange: (l: PrintLayout) => void }) {
  const set = <K extends keyof PrintLayout>(k: K, v: PrintLayout[K]) => onChange({ ...layout, [k]: v });
  const n = settings.boardsPerSheet;
  const m = layoutMetrics({ ...layout, boardsPerSheet: n, rows: settings.rows, cols: settings.cols, stretch: !!layout.stretch, hasInfo: hasInfoContent(layout) });
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
      <InfoBoxEditor layout={layout} uid={uid} hasInfoArea={m.hasInfoArea} onChange={onChange} />
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
          <Select id="pl-arr" className="w-full" value={n === 1 ? "single" : layout.arrangement} disabled={n === 1} onChange={(e) => onChange({ ...layout, arrangement: e.target.value as Arrangement, order: undefined })}>
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
      <BlockOrderEditor layout={layout} n={n} onChange={(order) => set("order", order)} />
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium text-slate-700">Options</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={layout.showQr !== false} onChange={(e) => set("showQr", e.target.checked ? undefined : false)} />
          Show QR code
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!layout.stretch} onChange={(e) => set("stretch", e.target.checked || undefined)} />
          Stretch boards to fill the space
        </label>
        {layout.showQr === false && <p className="text-xs text-slate-500">Players can't scan to link a sheet without the QR code; they can still play on paper.</p>}
      </fieldset>
      <BackgroundEditor layout={layout} uid={uid} onChange={onChange} />
      <p className="text-sm text-slate-600">
        Cells print at about{" "}
        <strong>{layout.stretch && Math.abs(m.cellW - m.cellH) > 0.05 ? `${m.cellW.toFixed(1)} × ${m.cellH.toFixed(1)} mm` : `${m.cellMm.toFixed(1)} mm`}</strong> (
        {layout.stretch ? `${m.boardW.toFixed(0)} × ${m.boardH.toFixed(0)} mm` : `${m.boardMm.toFixed(0)} mm`} boards).
      </p>
      {m.tooSmall && (
        <Alert kind="warn">
          Cells are smaller than {MIN_CELL_MM} mm and may be hard to read. Try the other orientation, a bigger paper size, a different arrangement or a smaller margin.
        </Alert>
      )}
    </div>
  );
}

/** Reorders the page blocks (boards and, for the grid, the info panel) with up/down buttons. */
function BlockOrderEditor({ layout, n, onChange }: { layout: PrintLayout; n: number; onChange: (order: number[] | undefined) => void }) {
  const arrangement = n === 1 ? "single" : layout.arrangement;
  const order = blockOrder(layout.order, arrangement, n);
  if (order.length < 2) return null;
  const name = (b: number) => (b === INFO_BLOCK ? "Info panel (serial, QR, info text)" : layout.slotLabels[b]?.trim() || `Game ${b + 1}`);
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    const isDefault = next.every((b, k) => b === blockOrder(undefined, arrangement, n)[k]);
    onChange(isDefault ? undefined : next);
  };
  const hint = arrangement === "grid" ? "Grid positions fill in reading order (row by row)." : arrangement === "column" ? "Top to bottom." : "In reading order (right to left for Hebrew).";
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">Order on the page</legend>
      <ol className="space-y-1">
        {order.map((b, i) => (
          <li key={b} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-sm">
            <span className="w-4 text-slate-400">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate" dir="auto">
              {name(b)}
            </span>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${name(b)} up`}>
              ↑
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${name(b)} down`}>
              ↓
            </Button>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </fieldset>
  );
}

function BackgroundEditor({ layout, uid, onChange }: { layout: PrintLayout; uid: string; onChange: (l: PrintLayout) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = useImageUrls([layout.backgroundImage]);
  const img = layout.backgroundImage;
  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const path = await uploadImage(uid, file);
      onChange({ ...layout, backgroundImage: path });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-slate-700">Background</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!layout.backgroundColor} onChange={(e) => onChange({ ...layout, backgroundColor: e.target.checked ? "#fef3c7" : undefined })} />
          Colour
        </label>
        {layout.backgroundColor && (
          <input type="color" aria-label="Background colour" className="h-8 w-12 cursor-pointer rounded border border-slate-300" value={layout.backgroundColor} onChange={(e) => onChange({ ...layout, backgroundColor: e.target.value })} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex size-14 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
          {img ? urls[img] ? <img src={urls[img]} alt="Background" className="size-full object-cover" /> : <Spinner className="size-4" /> : <span className="text-xs text-slate-400">No image</span>}
        </div>
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "Uploading…" : img ? "Replace image" : "Upload image"}
        </Button>
        {img && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...layout, backgroundImage: undefined, backgroundOpacity: undefined })}>
            Remove
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Background image"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>
      {img && (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="pl-bg-opacity" className="text-slate-700">
            Image strength
          </label>
          <input
            id="pl-bg-opacity"
            type="range"
            min={5}
            max={100}
            step={5}
            className="flex-1"
            value={Math.round((layout.backgroundOpacity ?? 1) * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              onChange({ ...layout, backgroundOpacity: v >= 1 ? undefined : v });
            }}
          />
          <span className="w-10 text-end tabular-nums">{Math.round((layout.backgroundOpacity ?? 1) * 100)}%</span>
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      <p className="text-xs text-slate-500">Boards keep a white background; the image fills the page and is cropped to fit.</p>
    </fieldset>
  );
}
