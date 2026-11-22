import {
  blockOrder,
  formatSerial,
  hasInfoContent,
  INFO_BLOCK,
  infoShowsImage,
  parseInfoText,
  GAP_MM,
  HEADER_MM,
  LABEL_MM,
  layoutMetrics,
  type GameSettings,
  type Lang,
  type PrintLayout,
} from "@bingo/core";
import type { CSSProperties } from "react";
import { BoardGrid, InfoText } from "./components";
import { fitInfoFontMm, planInfo } from "./fit";
import type { Resolve } from "./resolve";

export interface SheetLayoutProps {
  serial: number;
  /** Board cells per slot (index = slot). */
  boards: string[][];
  settings: GameSettings;
  printLayout: PrintLayout;
  /** The game's player language: sets the page's lang/dir and default slot labels. */
  lang: Lang;
  resolve: Resolve;
  /** Trusted SVG markup from `qrSvg()` (inserted as HTML). */
  qrSvg: string;
  /** Resolved URL (or data URL) of `printLayout.backgroundImage`. */
  backgroundUrl?: string;
  /** Resolves info images (`infoImage` and images in the info text) to URLs (or data URLs). */
  imageUrl?: (storagePath: string) => string | undefined;
  className?: string;
  style?: CSSProperties;
}

const mm = (v: number) => `${Math.max(0, Math.round(v * 100) / 100)}mm`;

const STRINGS = {
  he: { slot: (n: number) => `משחק ${n}`, free: "משבצת חופשית", sheet: "דף" },
  en: { slot: (n: number) => `Game ${n}`, free: "Free space", sheet: "Sheet" },
} as const;

export function slotLabel(printLayout: PrintLayout, slot: number, lang: Lang): string {
  return printLayout.slotLabels[slot]?.trim() || STRINGS[lang].slot(slot + 1);
}

/** Largest font (mm) at which `text` fits `maxLines` lines of width `w` mm. */
function fitLineFont(text: string, w: number, maxLines: number, max: number, min: number): number {
  const len = [...text].length;
  for (let fs = max; fs > min; fs -= 0.25) {
    const perLine = Math.max(1, Math.floor(w / (fs * 0.55)));
    if (Math.ceil(len / perLine) <= maxLines) return fs;
  }
  return min;
}

/** Font size (mm) for the info text in a `w`×`h` mm box, leaving images their share. */
function infoFont(md: string, w: number, h: number): number {
  const plan = planInfo(parseInfoText(md), h);
  return plan.units.length ? fitInfoFontMm(plan.units, w, plan.textH) : 3.6;
}

const cssUrl = (u: string) => u.replace(/["\\\n]/g, "");

/** The full info-area image (image mode). */
function InfoImage({ url, fit, className, style }: { url?: string; fit?: "contain" | "cover"; className?: string; style?: CSSProperties }) {
  return (
    <div className={["bs-info", "bs-info--image", className].filter(Boolean).join(" ")} style={style}>
      {url ? <img className="bs-info-img" src={url} alt="" draggable={false} style={{ objectFit: fit === "cover" ? "cover" : "contain" }} /> : null}
    </div>
  );
}

function Serial({ serial, fontMm }: { serial: number; fontMm: number }) {
  return (
    <div className="bs-serial" dir="ltr" style={{ fontSize: mm(fontMm) }} aria-label={`№ ${formatSerial(serial)}`}>
      {/* "№" drawn from N + o: Heebo (embedded in the PDF) has no U+2116 glyph. */}
      <span className="bs-serial-no" aria-hidden="true">
        N<span className="bs-serial-o">o</span>
      </span>
      <span aria-hidden="true">{formatSerial(serial)}</span>
    </div>
  );
}

function Qr({ svg, sizeMm }: { svg: string; sizeMm: number }) {
  return (
    <div
      className="bs-qr"
      style={{ width: mm(sizeMm), height: mm(sizeMm) }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** One printable sheet at the exact paper size. */
export function SheetLayout(props: SheetLayoutProps) {
  const { serial, boards, settings, printLayout: pl, lang, resolve, qrSvg } = props;
  const { rows, cols } = settings;
  const n = Math.max(1, boards.length);
  const arrangement = n === 1 ? "single" : pl.arrangement;
  const margin = pl.marginMm;
  const heading = pl.heading?.trim() ?? "";
  const imageMode = pl.infoMode === "image";
  const showImage = infoShowsImage(pl);
  const info = imageMode ? "" : (pl.infoText?.trim() ?? "");
  const hasInfo = hasInfoContent(pl);
  const infoImageUrl = showImage ? props.imageUrl?.(pl.infoImage!) : undefined;
  const showQr = pl.showQr !== false;
  const order = blockOrder(pl.order, arrangement, n);
  const m = layoutMetrics({
    paperSize: pl.paperSize,
    orientation: pl.orientation,
    arrangement,
    marginMm: margin,
    boardsPerSheet: n,
    rows,
    cols,
    stretch: !!pl.stretch,
    hasInfo,
  });
  const { page } = m;
  const innerW = page.w - 2 * margin;
  const innerH = page.h - 2 * margin;
  const { boardW, boardH } = m;
  const cellAspect = m.cellW > 0 ? m.cellH / m.cellW : 1;
  const t = STRINGS[lang];
  const labelFont = Math.min(4.4, Math.max(2.8, LABEL_MM * 0.6));

  const slot = (cells: string[], i: number) => {
    const label = slotLabel(pl, i, lang);
    return (
      <div className="bs-slot" key={i} style={{ width: mm(boardW) }}>
        <div className="bs-label" style={{ height: mm(LABEL_MM), fontSize: mm(labelFont) }}>
          <span dir="auto">{label}</span>
        </div>
        <div className="bs-board-box" style={{ width: mm(boardW), height: mm(boardH) }}>
          <BoardGrid
            cells={cells}
            rows={rows}
            cols={cols}
            resolve={resolve}
            variant="print"
            label={label}
            freeLabel={t.free}
            cellAspect={cellAspect}
          />
        </div>
      </div>
    );
  };

  const bgColor = pl.backgroundColor && /^#[0-9a-f]{6}$/i.test(pl.backgroundColor) ? pl.backgroundColor : undefined;
  const bgUrl = pl.backgroundImage ? props.backgroundUrl : undefined;
  const hasBg = !!(bgColor || pl.backgroundImage);
  const pageStyle: CSSProperties = {
    width: mm(page.w),
    height: mm(page.h),
    padding: mm(margin),
    ...(bgColor ? { backgroundColor: bgColor } : null),
    ...props.style,
  };
  const pageCls = ["bs-page", `bs-page--${arrangement}`, hasBg && "bs-page--bg", props.className].filter(Boolean).join(" ");
  const pageRule = (
    <>
      <style>{`@page{size:${mm(page.w)} ${mm(page.h)};margin:0}`}</style>
      {bgUrl ? (
        <div
          className="bs-bg"
          aria-hidden="true"
          style={{ backgroundImage: `url("${cssUrl(bgUrl)}")`, opacity: Math.min(1, Math.max(0.05, pl.backgroundOpacity ?? 1)) }}
        />
      ) : null}
    </>
  );

  if (arrangement === "grid") {
    const qW = (innerW - GAP_MM) / 2;
    if (n >= 4) {
      const stripH = 10;
      const qr = stripH - 1.4;
      return (
        <div className={pageCls} style={pageStyle} lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
          {pageRule}
          <header className="bs-header bs-header--strip" style={{ height: mm(stripH - 1.5) }}>
            <h1 className="bs-heading" dir="auto" style={{ fontSize: mm(fitLineFont(heading, innerW - 40, 1, 5.5, 3)) }}>
              {heading}
            </h1>
            <div className="bs-id">
              <Serial serial={serial} fontMm={5.5} />
              {showQr ? <Qr svg={qrSvg} sizeMm={qr} /> : null}
            </div>
          </header>
          <div className="bs-grid" style={{ gap: mm(GAP_MM) }}>
            {order.map((i) => (
              <div className="bs-quad" key={i}>
                {slot(boards[i] ?? [], i)}
              </div>
            ))}
          </div>
        </div>
      );
    }
    const qH = (innerH - GAP_MM) / 2;
    const qrSize = Math.min(32, qH * 0.34, qW * 0.4);
    const serialFont = Math.min(12, qrSize * 0.4);
    const idH = showQr ? qrSize : serialFont * 1.2;
    const headingFont = heading ? fitLineFont(heading, qW - 8, 3, 7, 3.5) : 0;
    const headingH = heading ? headingFont * 1.15 * Math.min(3, Math.ceil(([...heading].length * headingFont * 0.55) / (qW - 8))) : 0;
    const infoH = qH - 4 - headingH - idH - (heading ? 3 : 0) - 3 - 2.3 - 1;
    const infoFontMm = info ? infoFont(info, qW - 8, infoH) : 0;
    const meta = (
      <>
        {heading ? (
          <h1 className="bs-heading" dir="auto" style={{ fontSize: mm(headingFont) }}>
            {heading}
          </h1>
        ) : null}
        <div className="bs-meta-id">
          <Serial serial={serial} fontMm={serialFont} />
          {showQr ? <Qr svg={qrSvg} sizeMm={qrSize} /> : null}
        </div>
        {showImage ? (
          <InfoImage url={infoImageUrl} fit={pl.infoImageFit} />
        ) : info ? (
          <InfoText md={info} className="bs-info" style={{ fontSize: mm(infoFontMm) }} imageUrl={props.imageUrl} boxHeightMm={infoH} />
        ) : null}
      </>
    );
    return (
      <div className={pageCls} style={pageStyle} lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
        {pageRule}
        <div className="bs-grid" style={{ gap: mm(GAP_MM) }}>
          {order.map((i) =>
            i === INFO_BLOCK ? (
              <section className="bs-meta" key="meta" style={n === 2 ? { gridColumn: "1 / -1" } : undefined}>
                {meta}
              </section>
            ) : (
              <div className="bs-quad" key={i}>
                {slot(boards[i] ?? [], i)}
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  // single / row / column: header on top, boards, info at the foot.
  const headerH = HEADER_MM - 2;
  const qrSize = headerH - 3;
  const serialFont = 9;
  const headingFont = heading ? fitLineFont(heading, innerW - (showQr ? qrSize : 0) - 45, 2, 9, 4) : 0;
  const boardsH =
    arrangement === "column" ? n * (LABEL_MM + boardH) + (n - 1) * GAP_MM : LABEL_MM + boardH;
  const infoH = innerH - HEADER_MM - boardsH - 4;
  const infoFontMm = info ? infoFont(info, innerW, infoH) : 0;
  return (
    <div className={pageCls} style={pageStyle} lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
      {pageRule}
      <header className="bs-header" style={{ height: mm(headerH) }}>
        <h1 className="bs-heading" dir="auto" style={{ fontSize: mm(headingFont || 6) }}>
          {heading}
        </h1>
        <div className="bs-id">
          <Serial serial={serial} fontMm={serialFont} />
          {showQr ? <Qr svg={qrSvg} sizeMm={qrSize} /> : null}
        </div>
      </header>
      <div
        className={`bs-boards bs-boards--${arrangement === "column" ? "column" : "row"}`}
        style={{ gap: mm(GAP_MM) }}
      >
        {order.map((i) => slot(boards[i] ?? [], i))}
      </div>
      {showImage ? (
        <InfoImage url={infoImageUrl} fit={pl.infoImageFit} className="bs-info--foot" style={{ height: mm(infoH + 2) }} />
      ) : info ? (
        <InfoText
          md={info}
          className="bs-info"
          style={{ fontSize: mm(infoFontMm), maxHeight: mm(infoH + 4) }}
          imageUrl={props.imageUrl}
          boxHeightMm={infoH}
        />
      ) : null}
    </div>
  );
}
