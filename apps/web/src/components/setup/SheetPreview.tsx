import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pageSizeMm, printLayoutRenderImages, type Game, type Item, type PrintLayout } from "@bingo/core";
import { SheetLayout, SheetStyles, makeResolver, qrSvg, type Resolve, type SheetLayoutProps } from "@bingo/sheet";
import { useImageUrls } from "../../lib/hooks";

const PX_PER_MM = 96 / 25.4;

/** Resolver for a game's items; images resolve to thumb (screen) or print URLs as they load. */
export function useSheetResolver(game: Pick<Game, "settings">, items: Item[], variant: "thumb" | "print" = "thumb"): Resolve {
  const free = game.settings.freeSpace.content;
  const urls = useImageUrls([...items.map((i) => i.storagePath), free?.storagePath], variant);
  return useMemo(() => {
    const map = Object.fromEntries(items.map((i) => [i.id, { type: i.type, text: i.text, storagePath: i.storagePath }]));
    return makeResolver(map, free, (p) => urls[p]);
  }, [items, free, urls]);
}

/** URL of the layout's background image (print variant), once loaded. */
export function useBackgroundUrl(layout: Pick<PrintLayout, "backgroundImage">): string | undefined {
  const urls = useImageUrls([layout.backgroundImage], "print");
  return layout.backgroundImage ? urls[layout.backgroundImage] : undefined;
}

/**
 * Resolver for the layout's info-box images (print variant), for `SheetLayoutProps.imageUrl`.
 * Stable while the URLs don't change.
 */
export function useLayoutImageUrl(layout: Parameters<typeof printLayoutRenderImages>[0]): (storagePath: string) => string | undefined {
  const urls = useImageUrls(printLayoutRenderImages(layout), "print");
  return useMemo(() => (p: string) => urls[p], [urls]);
}

/** QR SVG markup for a text (async). */
export function useQrSvg(text: string): string {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    qrSvg(text)
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [text]);
  return svg;
}

/** Renders a SheetLayout scaled to fit the container's width. */
export function ScaledSheet({ props, sample, maxHeightPx }: { props: SheetLayoutProps; sample?: boolean; maxHeightPx?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const page = pageSizeMm(props.printLayout.paperSize, props.printLayout.orientation);
  const pw = page.w * PX_PER_MM;
  const ph = page.h * PX_PER_MM;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  let scale = width ? width / pw : 0;
  if (maxHeightPx && ph * scale > maxHeightPx) scale = maxHeightPx / ph;
  return (
    <div ref={ref} className="w-full">
      <SheetStyles />
      <div className={sample ? "setup-sample relative mx-auto" : "relative mx-auto"} style={{ width: pw * scale, height: ph * scale }}>
        {scale > 0 && (
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: pw, height: ph, position: "absolute", left: 0, top: 0 }}>
            <SheetLayout {...props} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Full-window preview of one sheet, at 100% (1 mm = 1 CSS mm, the sheet's printed size on a
 * standard display) or fitted to the window.
 */
export function FullSizePreview({ props, sample, onClose }: { props: SheetLayoutProps; sample?: boolean; onClose: () => void }) {
  const [fit, setFit] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const page = pageSizeMm(props.printLayout.paperSize, props.printLayout.orientation);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Full-size sheet preview" className="fixed inset-0 z-50 flex flex-col bg-slate-800/95">
      <div className="flex flex-none items-center gap-2 bg-slate-900 px-4 py-2 text-sm text-white">
        <span className="font-medium">
          {props.printLayout.paperSize} {props.printLayout.orientation} · {Math.round(page.w)} × {Math.round(page.h)} mm
        </span>
        <div className="ms-auto flex rounded-lg bg-slate-700 p-0.5">
          {([false, true] as const).map((f) => (
            <button key={String(f)} type="button" aria-pressed={fit === f} onClick={() => setFit(f)} className={fit === f ? "rounded-md bg-white px-3 py-1 text-slate-900" : "px-3 py-1 text-slate-200"}>
              {f ? "Fit to window" : "Actual size"}
            </button>
          ))}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} className="rounded-md px-3 py-1 hover:bg-slate-700">
          Close
        </button>
      </div>
      {fit ? (
        <div className="min-h-0 flex-1 p-4">
          <FitSheet props={props} sample={sample} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <SheetStyles />
          <div className={sample ? "setup-sample mx-auto w-fit" : "mx-auto w-fit"}>
            <SheetLayout {...props} />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** A sheet scaled to fit both dimensions of its container. */
function FitSheet({ props, sample }: { props: SheetLayoutProps; sample?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-full">
      {h > 0 && <ScaledSheet props={props} sample={sample} maxHeightPx={h} />}
    </div>
  );
}

const PRINT_CSS = String.raw`
.setup-sample .bs-serial { visibility: hidden; position: relative; }
.setup-sample .bs-serial::after {
  content: "SAMPLE"; visibility: visible; position: absolute; inset-inline-end: 0; top: 50%;
  transform: translateY(-50%); font-size: 0.55em; letter-spacing: 0.08em; color: #b91c1c;
  border: 0.5mm solid #b91c1c; border-radius: 1mm; padding: 0 1.5mm; white-space: nowrap;
}
.setup-sample .bs-qr { opacity: 0.15; }
@media screen { .setup-print-root { display: none; } }
@media print {
  body.setup-printing .bs-page:not(.setup-print-root .bs-page) { display: none !important; }
}
`;

export function SetupSheetCss() {
  return (
    <style href="bingo-setup-sheet-css" precedence="default">
      {PRINT_CSS}
    </style>
  );
}

/**
 * Prints one sheet with window.print(): renders it unscaled into a body-level portal that is
 * hidden on screen, hides every other sheet in print, then cleans up after printing.
 */
export function PrintPortal({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    document.body.classList.add("setup-printing");
    const after = () => doneRef.current();
    window.addEventListener("afterprint", after);
    // Let images and the QR settle before opening the dialog.
    const t = setTimeout(() => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>(".setup-print-root img")];
      void Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r)))))).then(() => window.print());
    }, 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", after);
      document.body.classList.remove("setup-printing");
    };
  }, []);
  return createPortal(
    <div className="setup-print-root">
      <SheetStyles />
      {children}
    </div>,
    document.body,
  );
}
