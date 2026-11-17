import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pageSizeMm, type Game, type Item } from "@bingo/core";
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
