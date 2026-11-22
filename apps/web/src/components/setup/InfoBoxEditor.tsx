import { useRef, useState } from "react";
import type { PrintLayout } from "@bingo/core";
import { useImageUrls } from "../../lib/hooks";
import { uploadImage } from "../../lib/images";
import { errorMessage } from "../../lib/callables";
import { Alert, Button, Label, Spinner, cn } from "../ui";
import { InfoTextEditor } from "./InfoTextEditor";

/**
 * The print layout's info box: rich text (with images), or one image that fills the box while
 * the serial and QR keep their place.
 */
export function InfoBoxEditor({ layout, uid, hasInfoArea, onChange }: { layout: PrintLayout; uid: string; hasInfoArea: boolean; onChange: (l: PrintLayout) => void }) {
  const mode = layout.infoMode ?? "text";
  const setMode = (m: "text" | "image") => onChange({ ...layout, infoMode: m === "text" ? undefined : m });
  return (
    <section className="space-y-2" aria-labelledby="pl-info-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id="pl-info-title" className="text-sm font-medium text-slate-700">
          Info box (same on every sheet)
        </span>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Info box content">
          {(["text", "image"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn("rounded-md px-3 py-1", mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              {m === "text" ? "Text" : "Full image"}
            </button>
          ))}
        </div>
      </div>
      {!hasInfoArea && <p className="text-xs text-amber-700">This layout has no info box (grid with 4 boards).</p>}
      {mode === "text" ? (
        <>
          <Label htmlFor="pl-info" className="sr-only">
            Info text
          </Label>
          <InfoTextEditor id="pl-info" uid={uid} value={layout.infoText} onChange={(v) => onChange({ ...layout, infoText: v })} />
          <p className="text-xs text-slate-500">Select text to format it. Click an image to resize or remove it.</p>
        </>
      ) : (
        <FullImageEditor layout={layout} uid={uid} onChange={onChange} />
      )}
    </section>
  );
}

function FullImageEditor({ layout, uid, onChange }: { layout: PrintLayout; uid: string; onChange: (l: PrintLayout) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const img = layout.infoImage;
  const urls = useImageUrls([img]);
  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const path = await uploadImage(uid, file);
      onChange({ ...layout, infoMode: "image", infoImage: path });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
          {img ? urls[img] ? <img src={urls[img]} alt="Info box image" className="size-full object-contain" /> : <Spinner className="size-4" /> : <span className="text-xs text-slate-400">No image</span>}
        </div>
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "Uploading…" : img ? "Replace image" : "Upload image"}
        </Button>
        {img && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...layout, infoImage: undefined, infoImageFit: undefined })}>
            Remove
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Info box image"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>
      {img && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={layout.infoImageFit === "cover"} onChange={(e) => onChange({ ...layout, infoImageFit: e.target.checked ? "cover" : undefined })} />
          Fill the box (crop the edges)
        </label>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      <p className="text-xs text-slate-500">The image replaces the info text; the sheet number and QR code stay. Your text is kept if you switch back.</p>
    </div>
  );
}
