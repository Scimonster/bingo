/**
 * Deterministic text auto-fit. Font sizes are expressed as a fraction of the cell's width and
 * applied with container query units (`cqi`), so the same text gets the same relative size on
 * a phone, on screen and in the PDF — no DOM measuring, server and browser agree.
 */

/** Average glyph advance as a fraction of the font size (Heebo, mixed Hebrew/Latin). */
const CHAR_EM = 0.56;
const LINE_EM = 1.12;
/** Usable fraction of the cell edge after padding. */
const USABLE = 0.86;
const MAX_FRACTION = 0.3;
const MIN_FRACTION = 0.06;

function lineCount(words: number[], capacity: number): number {
  let lines = 1;
  let used = 0;
  for (const w of words) {
    // A word longer than a line breaks anywhere (overflow-wrap: anywhere).
    if (w > capacity) {
      if (used > 0) lines++;
      lines += Math.ceil(w / capacity) - 1;
      used = w % capacity || capacity;
      continue;
    }
    const need = used === 0 ? w : used + 1 + w;
    if (need <= capacity) used = need;
    else {
      lines++;
      used = w;
    }
  }
  return lines;
}

/**
 * Font size for `text` in a square cell, as a fraction of the cell width (0.06–0.3).
 * `heightRatio` (≤ 1) is the share of the cell height available (e.g. smaller for captions).
 */
export function fitFraction(text: string, heightRatio = 1, widthRatio = 1): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w].length);
  if (!words.length) return MAX_FRACTION;
  const w = USABLE * widthRatio;
  const h = USABLE * heightRatio;
  for (let f = MAX_FRACTION; f > MIN_FRACTION; f -= 0.005) {
    const capacity = Math.max(1, Math.floor(w / (CHAR_EM * f)));
    const longest = Math.max(...words);
    // Prefer not to break words: shrink until the longest word fits on one line.
    if (longest > capacity && f > 0.1) continue;
    if (lineCount(words, capacity) * LINE_EM * f <= h) return Math.round(f * 1000) / 1000;
  }
  return MIN_FRACTION;
}

/** CSS font-size for a cell (container query units of the cell). */
export function fitFontSize(text: string, heightRatio = 1, widthRatio = 1): string {
  return `${(fitFraction(text, heightRatio, widthRatio) * 100).toFixed(1)}cqi`;
}

/**
 * Font size in mm for a block of info text in a box of `w`×`h` mm. Estimates wrapped lines from
 * character counts; clamps between 2.4 and 4.2 mm.
 */
export function fitInfoFontMm(paragraphLengths: number[], w: number, h: number): number {
  if (!paragraphLengths.length || w <= 0 || h <= 0) return 3.6;
  for (let fs = 4.2; fs > 2.4; fs -= 0.1) {
    const perLine = Math.max(1, Math.floor(w / (fs * 0.52)));
    const lines = paragraphLengths.reduce((n, len) => n + Math.max(1, Math.ceil(len / perLine)), 0);
    if (lines * fs * 1.35 <= h) return Math.round(fs * 10) / 10;
  }
  return 2.4;
}
