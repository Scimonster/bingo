import { infoTextImages, parseInfoText } from "./markdown";
import type { Arrangement, Orientation, PaperSize, PrintLayout } from "./types";

/** Portrait paper dimensions in mm. */
export const PAPER_SIZES_MM: Record<PaperSize, { w: number; h: number }> = {
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 },
  Tabloid: { w: 279.4, h: 431.8 },
};

export const MIN_CELL_MM = 12;
/** Space reserved for the header (heading, serial, QR) and info area. */
export const HEADER_MM = 28;
export const INFO_MM = 22;
export const GAP_MM = 6;
export const LABEL_MM = 7;

export function pageSizeMm(paper: PaperSize, orientation: Orientation): { w: number; h: number } {
  const p = PAPER_SIZES_MM[paper];
  return orientation === "portrait" ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

/** Block id of the grid arrangement's info panel (serial, QR, heading, info) in `order`. */
export const INFO_BLOCK = -1;

/** Default block order: slots 0..n-1, then the info panel when the layout has one. */
export function defaultBlockOrder(arrangement: Arrangement, boardsPerSheet: number): number[] {
  const n = Math.max(1, boardsPerSheet);
  const slots = Array.from({ length: n }, (_, i) => i);
  return n > 1 && arrangement === "grid" && n < 4 ? [...slots, INFO_BLOCK] : slots;
}

/**
 * The layout's block order if it is a permutation of the default blocks for this arrangement
 * and board count; otherwise the default order.
 */
export function blockOrder(order: readonly number[] | undefined, arrangement: Arrangement, boardsPerSheet: number): number[] {
  const def = defaultBlockOrder(boardsPerSheet <= 1 ? "single" : arrangement, boardsPerSheet);
  if (!order || order.length !== def.length) return def;
  const want = [...def].sort((a, b) => a - b).join(",");
  return [...order].sort((a, b) => a - b).join(",") === want ? [...order] : def;
}

export interface LayoutMetrics {
  page: { w: number; h: number };
  /** Board width and height (mm), including the stretched case. */
  boardW: number;
  boardH: number;
  /** Cell width and height (mm); equal unless stretched. */
  cellW: number;
  cellH: number;
  /** Largest board edge (mm) and smallest cell edge (mm). */
  boardMm: number;
  cellMm: number;
  tooSmall: boolean;
  /** Grid 2×2 with 4 boards has no info area. */
  hasInfoArea: boolean;
}

/**
 * Approximate board and cell size for a print layout. Shared by the print preview warning
 * and the sheet renderer so both agree.
 */
export function layoutMetrics(opts: {
  paperSize: PaperSize;
  orientation: Orientation;
  arrangement: Arrangement;
  marginMm: number;
  boardsPerSheet: number;
  rows: number;
  cols: number;
  /** Fill the available box (non-square cells). */
  stretch?: boolean;
  /** Whether there is info text; without it a stretched layout reclaims the info area. */
  hasInfo?: boolean;
}): LayoutMetrics {
  const page = pageSizeMm(opts.paperSize, opts.orientation);
  const innerW = page.w - 2 * opts.marginMm;
  const innerH = page.h - 2 * opts.marginMm;
  const n = opts.boardsPerSheet;
  const arrangement = n === 1 ? "single" : opts.arrangement;
  const aspect = opts.cols / opts.rows; // board width / height (cells are square)
  let boxW: number;
  let boxH: number;
  let hasInfoArea = true;
  const info = opts.stretch && opts.hasInfo === false ? 0 : INFO_MM;
  switch (arrangement) {
    case "single":
      boxW = innerW;
      boxH = innerH - HEADER_MM - info - LABEL_MM;
      break;
    case "row":
      boxW = (innerW - GAP_MM * (n - 1)) / n;
      boxH = innerH - HEADER_MM - info - LABEL_MM;
      break;
    case "column":
      boxW = innerW;
      boxH = (innerH - HEADER_MM - info * 0.6 - GAP_MM * (n - 1)) / n - LABEL_MM;
      break;
    case "grid":
      hasInfoArea = n < 4;
      boxW = (innerW - GAP_MM) / 2;
      boxH = (innerH - (n === 4 ? 10 : 0) - GAP_MM) / 2 - LABEL_MM;
      break;
  }
  let boardW: number;
  let boardH: number;
  if (opts.stretch) {
    boardW = Math.max(0, boxW);
    boardH = Math.max(0, boxH);
  } else {
    boardW = Math.max(0, Math.min(boxW, boxH * aspect));
    boardH = (boardW / opts.cols) * opts.rows;
  }
  const cellW = boardW / opts.cols;
  const cellH = boardH / opts.rows;
  const cellMm = Math.min(cellW, cellH);
  const boardMm = Math.max(boardW, boardH);
  return { page, boardW, boardH, cellW, cellH, boardMm, cellMm, tooSmall: cellMm < MIN_CELL_MM, hasInfoArea };
}

/** Whether the info area shows the full image (image mode with an image set). */
export function infoShowsImage(pl: Pick<PrintLayout, "infoMode" | "infoImage">): boolean {
  return pl.infoMode === "image" && !!pl.infoImage;
}

/** Whether the info area has anything to show (text blocks or the full image). */
export function hasInfoContent(pl: Pick<PrintLayout, "infoText" | "infoMode" | "infoImage">): boolean {
  if (pl.infoMode === "image") return !!pl.infoImage;
  return parseInfoText(pl.infoText ?? "").length > 0;
}

/**
 * Image folders a print layout references (background, info-text images, full info image),
 * whichever mode is active, so image cleanup keeps them all.
 */
export function printLayoutImages(pl: Pick<PrintLayout, "infoText" | "infoImage" | "backgroundImage">): string[] {
  const out = new Set<string>(infoTextImages(pl.infoText ?? ""));
  if (pl.infoImage) out.add(pl.infoImage);
  if (pl.backgroundImage) out.add(pl.backgroundImage);
  return [...out];
}

/** Image folders a sheet render needs from the layout (only the active info mode). */
export function printLayoutRenderImages(pl: Pick<PrintLayout, "infoText" | "infoMode" | "infoImage" | "backgroundImage">): string[] {
  const out = new Set<string>();
  if (pl.backgroundImage) out.add(pl.backgroundImage);
  if (infoShowsImage(pl)) out.add(pl.infoImage!);
  else if (pl.infoMode !== "image") for (const p of infoTextImages(pl.infoText ?? "")) out.add(p);
  return [...out];
}
