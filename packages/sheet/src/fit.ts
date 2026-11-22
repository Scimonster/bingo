import { INFO_SIZES, inlineToRuns, type Inline, type MdBlock } from "@bingo/core";

/**
 * Deterministic text auto-fit. Font sizes are expressed as a fraction of the cell's width and
 * applied with container query units (`cqi`), so the same text gets the same relative size on
 * a phone, on screen and in the PDF — no DOM measuring, server and browser agree.
 */

/** Approximate glyph advance in em for Heebo semibold/bold. */
function charEm(ch: string): number {
  if (/[ilj.,'!|:;\u05D5\u05D9\u05DF\u05F3]/.test(ch)) return 0.3;
  if (/[ftrI()\-\u05D2\u05D6\u05E0]/.test(ch)) return 0.4;
  if (/[mwMW@]/.test(ch)) return 0.88;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[0-9]/.test(ch)) return 0.58;
  if (/[\u0590-\u05FF]/.test(ch)) return 0.6;
  if (/[a-z]/.test(ch)) return 0.57;
  if (/\p{Extended_Pictographic}/u.test(ch)) return 1.2;
  return 0.62;
}
const SPACE_EM = 0.25;
const LINE_EM = 1.12;
/** Usable fraction of the cell content box (cqi is relative to the content box, inside padding). */
const USABLE = 0.94;
const MAX_FRACTION = 0.3;
const MIN_FRACTION = 0.06;

/** Greedy wrap of words (widths in em) into lines of `capacity` em. */
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
    const need = used === 0 ? w : used + SPACE_EM + w;
    if (need <= capacity) used = need;
    else {
      lines++;
      used = w;
    }
  }
  return lines;
}

const wordEm = (w: string) => [...w].reduce((n, ch) => n + charEm(ch), 0);

/**
 * Font size for `text` in a square cell, as a fraction of the cell width (0.06–0.3).
 * `heightRatio` (≤ 1) is the share of the cell height available (e.g. smaller for captions).
 */
export function fitFraction(text: string, heightRatio = 1, widthRatio = 1): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(wordEm);
  if (!words.length) return MAX_FRACTION;
  const w = USABLE * widthRatio;
  const h = USABLE * heightRatio;
  const longest = Math.max(...words);
  for (let f = MAX_FRACTION; f > MIN_FRACTION; f -= 0.005) {
    const capacity = w / f; // line width in em
    // Prefer not to break words: shrink until the longest word fits on one line.
    if (longest > capacity && f > 0.08) continue;
    if (lineCount(words, capacity) * LINE_EM * f <= h) return Math.round(f * 1000) / 1000;
  }
  return MIN_FRACTION;
}

/** CSS font-size for a cell (container query units of the cell). */
export function fitFontSize(text: string, heightRatio = 1, widthRatio = 1): string {
  return `${(fitFraction(text, heightRatio, widthRatio) * 100).toFixed(1)}cqi`;
}

/** One wrapped unit of info text: its length in characters (weighted by size) and its size. */
export interface InfoFitUnit {
  len: number;
  /** Font-size multiple (1 = body text). */
  scale: number;
  /** Extra space after it, in lines of its own size. */
  after?: number;
}

/**
 * Font size in mm for a block of info text in a box of `w`×`h` mm. Estimates wrapped lines from
 * character counts; clamps between 2.4 and 4.2 mm. Plain numbers are body-size paragraphs.
 */
export function fitInfoFontMm(units: (number | InfoFitUnit)[], w: number, h: number): number {
  if (!units.length || w <= 0 || h <= 0) return 3.6;
  const us = units.map((u) => (typeof u === "number" ? { len: u, scale: 1, after: 0 } : u));
  for (let fs = 4.2; fs > 2.4; fs -= 0.1) {
    const perLine = Math.max(1, Math.floor(w / (fs * 0.52)));
    const height = us.reduce((n, u) => {
      const lines = Math.max(1, Math.ceil(u.len / perLine)); // len is already weighted by size
      return n + (lines + (u.after ?? 0)) * fs * 1.35 * u.scale;
    }, 0);
    if (height <= h) return Math.round(fs * 10) / 10;
  }
  return 2.4;
}

/** Font-size multiples of info headings. */
export const INFO_HEADING_SCALE = { 1: 1.5, 2: 1.2 } as const;
/** Share of the info box height an image may take, by size. */
const IMAGE_SHARE = { s: 0.25, m: 0.45, l: 0.75 } as const;
/** Max share of the box width, by size. */
export const IMAGE_WIDTH_SHARE = { s: 0.35, m: 0.65, l: 1 } as const;

function runsUnits(c: Inline[]): InfoFitUnit[] {
  const out: InfoFitUnit[] = [{ len: 0, scale: 1 }];
  for (const r of inlineToRuns(c)) {
    const cur = out[out.length - 1]!;
    if (r === "br") {
      out.push({ len: 0, scale: 1 });
      continue;
    }
    const sc = r.size ? INFO_SIZES[r.size] : 1;
    cur.len += [...r.text].length * sc;
    cur.scale = Math.max(cur.scale, sc);
  }
  return out;
}

export interface InfoPlan {
  /** Max height (mm) of each image block, in block order. */
  imageMm: number[];
  /** Height (mm) left for text. */
  textH: number;
  units: InfoFitUnit[];
}

/** Splits an info box of `h` mm between image blocks and text, and lists the text units. */
export function planInfo(blocks: MdBlock[], h: number): InfoPlan {
  const units: InfoFitUnit[] = [];
  const shares: number[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "p": {
        const us = runsUnits(b.c);
        us[us.length - 1]!.after = 0.45;
        units.push(...us);
        break;
      }
      case "h": {
        const scale = INFO_HEADING_SCALE[b.level];
        const len = inlineToRuns(b.c).reduce((n, r) => n + (r === "br" ? 1 : [...r.text].length * (r.size ? INFO_SIZES[r.size] : 1)), 0);
        units.push({ len: len * scale * 1.08, scale, after: 0.3 });
        break;
      }
      case "ul":
      case "ol":
        b.items.forEach((it, i) => {
          for (const u of runsUnits(it)) units.push({ ...u, len: u.len + 3, after: i === b.items.length - 1 ? 0.45 : 0 });
        });
        break;
      case "img":
        shares.push(IMAGE_SHARE[b.size]);
        break;
    }
  }
  const total = shares.reduce((a, b) => a + b, 0);
  // Leave at least ~40% of the box for text when there is any; images alone may use nearly all of it.
  const cap = units.length ? 0.6 : 0.92;
  const k = total > cap ? cap / total : 1;
  const imageMm = shares.map((s) => Math.max(0, h * s * k));
  const used = imageMm.reduce((a, b) => a + b, 0) + shares.length * 1.2;
  return { imageMm, textH: Math.max(0, h - used), units };
}
