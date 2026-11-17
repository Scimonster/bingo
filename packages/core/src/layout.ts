import type { Arrangement, Orientation, PaperSize } from "./types";

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

export interface LayoutMetrics {
  page: { w: number; h: number };
  /** Board square edge (mm) and cell edge (mm). */
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
  switch (arrangement) {
    case "single":
      boxW = innerW;
      boxH = innerH - HEADER_MM - INFO_MM - LABEL_MM;
      break;
    case "row":
      boxW = (innerW - GAP_MM * (n - 1)) / n;
      boxH = innerH - HEADER_MM - INFO_MM - LABEL_MM;
      break;
    case "column":
      boxW = innerW;
      boxH = (innerH - HEADER_MM - INFO_MM * 0.6 - GAP_MM * (n - 1)) / n - LABEL_MM;
      break;
    case "grid":
      hasInfoArea = n < 4;
      boxW = (innerW - GAP_MM) / 2;
      boxH = (innerH - (n === 4 ? 10 : 0) - GAP_MM) / 2 - LABEL_MM;
      break;
  }
  const boardW = Math.max(0, Math.min(boxW, boxH * aspect));
  const cellMm = boardW / opts.cols;
  const boardMm = Math.max(boardW, cellMm * opts.rows);
  return { page, boardMm, cellMm, tooSmall: cellMm < MIN_CELL_MM, hasInfoArea };
}
