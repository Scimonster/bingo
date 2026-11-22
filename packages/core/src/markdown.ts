/**
 * Info-text markup: a small, Markdown-like format that is parsed to an AST (never to HTML), so
 * rendering is safe by construction. The host edits it in a WYSIWYG editor; the stored string
 * is what the editor serializes.
 *
 * Blocks (one per line, blank lines separate paragraphs):
 *   text                       paragraph; consecutive lines are joined with line breaks
 *   # Title / ## Subtitle      headings (### and deeper count as ##)
 *   - item / 1. item           bullet / numbered list items (also "* " and "• ", "1) ")
 *   ![m](users/u/images/id)    an image on its own line; size s | m | l
 *   {center} …                 alignment prefix on a paragraph, heading or image: start | center | end
 *
 * Inline:
 *   **bold**  _italic_ (or *italic*)  ++underline++  [text]{red large}  (colour and/or size)
 *   \x escapes any of the marker characters.
 */
export const INFO_COLORS = {
  red: "#c62828",
  orange: "#e65100",
  green: "#2e7d32",
  blue: "#1565c0",
  purple: "#6a1b9a",
  gray: "#616161",
} as const;
export type InfoColor = keyof typeof INFO_COLORS;

/** Text sizes, as a multiple of the info text's base size. */
export const INFO_SIZES = { small: 0.8, large: 1.3, xl: 1.7 } as const;
export type InfoSize = keyof typeof INFO_SIZES;

export type InfoAlign = "start" | "center" | "end";
export type InfoImageSize = "s" | "m" | "l";

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "u"; c: Inline[] }
  | { t: "span"; color?: InfoColor; size?: InfoSize; c: Inline[] }
  | { t: "br" };

export type MdBlock =
  | { t: "p"; c: Inline[]; align?: InfoAlign }
  | { t: "h"; level: 1 | 2; c: Inline[]; align?: InfoAlign }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "img"; path: string; size: InfoImageSize; align?: InfoAlign };

/** A flat run of text with its marks (the shape editors use). */
export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  color?: InfoColor;
  size?: InfoSize;
}

export const IMAGE_PATH_RE = /^users\/[^/\s()]+\/images\/[^/\s()]+$/;

const ESCAPABLE = new Set("\\*_+[]{}#-•.)!".split(""));
const isColor = (s: string): s is InfoColor => Object.prototype.hasOwnProperty.call(INFO_COLORS, s);
const isSize = (s: string): s is InfoSize => Object.prototype.hasOwnProperty.call(INFO_SIZES, s);

/** Index of the next unescaped `marker` at or after `from`, or -1. */
function findClose(src: string, from: number, marker: string): number {
  for (let i = from; i < src.length; i++) {
    if (src[i] === "\\") {
      i++;
      continue;
    }
    if (src.startsWith(marker, i)) return i;
  }
  return -1;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  const wrap = (open: number, len: number, marker: string, make: (c: Inline[]) => Inline): number => {
    const end = findClose(src, open + len, marker);
    if (end <= open + len) return -1;
    flush();
    out.push(make(parseInline(src.slice(open + len, end))));
    return end + marker.length;
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\\" && i + 1 < src.length && ESCAPABLE.has(src[i + 1]!)) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    let next = -1;
    if (src.startsWith("**", i)) next = wrap(i, 2, "**", (c) => ({ t: "b", c }));
    else if (src.startsWith("++", i)) next = wrap(i, 2, "++", (c) => ({ t: "u", c }));
    else if ((ch === "*" || ch === "_") && src[i + 1] !== ch) next = wrap(i, 1, ch, (c) => ({ t: "i", c }));
    else if (ch === "[") {
      const close = findClose(src, i + 1, "]");
      if (close > i && src[close + 1] === "{") {
        const attrEnd = src.indexOf("}", close + 2);
        if (attrEnd > close) {
          const span: { t: "span"; color?: InfoColor; size?: InfoSize; c: Inline[] } = { t: "span", c: [] };
          for (const tok of src.slice(close + 2, attrEnd).trim().split(/\s+/)) {
            if (isColor(tok)) span.color = tok;
            else if (isSize(tok)) span.size = tok;
          }
          flush();
          span.c = parseInline(src.slice(i + 1, close));
          if (span.color || span.size) out.push(span);
          else out.push(...span.c);
          next = attrEnd + 1;
        }
      }
    }
    if (next > i) {
      i = next;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  // Merge adjacent text nodes (from spans without attributes).
  return out.reduce<Inline[]>((acc, n) => {
    const last = acc[acc.length - 1];
    if (n.t === "text" && last?.t === "text") acc[acc.length - 1] = { t: "text", v: last.v + n.v };
    else acc.push(n);
    return acc;
  }, []);
}

const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const ALIGN = /^\{(start|center|end)\}\s?(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const IMAGE = /^!\[([a-z]*)\]\(([^()\s]+)\)\s*$/;

export function parseInfoText(md: string): MdBlock[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let paraAlign: InfoAlign | undefined;
  const flushPara = () => {
    if (!para.length) return;
    const c: Inline[] = [];
    para.forEach((l, idx) => {
      if (idx) c.push({ t: "br" });
      c.push(...parseInline(l));
    });
    blocks.push(paraAlign ? { t: "p", c, align: paraAlign } : { t: "p", c });
    para = [];
    paraAlign = undefined;
  };
  for (const raw of lines) {
    if (!raw.trim()) {
      flushPara();
      continue;
    }
    const al = ALIGN.exec(raw);
    const align = al ? (al[1] as InfoAlign) : undefined;
    const line = al ? al[2]! : raw;
    const alignAttr = align && align !== "start" ? { align } : {};
    const img = IMAGE.exec(line.trim());
    if (img && IMAGE_PATH_RE.test(img[2]!)) {
      flushPara();
      const size = img[1] === "s" || img[1] === "l" ? img[1] : "m";
      blocks.push({ t: "img", path: img[2]!, size, ...alignAttr });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flushPara();
      blocks.push({ t: "h", level: h[1]!.length === 1 ? 1 : 2, c: parseInline(h[2]!), ...alignAttr });
      continue;
    }
    const ul = al ? null : UL.exec(line);
    const ol = al || ul ? null : OL.exec(line);
    if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = parseInline((ul ?? ol)![1]!);
      if (last && last.t === kind) last.items.push(item);
      else blocks.push({ t: kind, items: [item] } as MdBlock);
      continue;
    }
    if (al) flushPara(); // an alignment prefix always starts a new paragraph
    if (!para.length) paraAlign = alignAttr.align;
    para.push(line);
  }
  flushPara();
  return blocks;
}

// ---------- Runs ⇄ inline tree ----------

export function inlineToRuns(nodes: Inline[], marks: Omit<Run, "text"> = {}): (Run | "br")[] {
  const out: (Run | "br")[] = [];
  for (const n of nodes) {
    switch (n.t) {
      case "text":
        if (n.v) out.push({ ...marks, text: n.v });
        break;
      case "br":
        out.push("br");
        break;
      case "b":
        out.push(...inlineToRuns(n.c, { ...marks, b: true }));
        break;
      case "i":
        out.push(...inlineToRuns(n.c, { ...marks, i: true }));
        break;
      case "u":
        out.push(...inlineToRuns(n.c, { ...marks, u: true }));
        break;
      case "span":
        out.push(...inlineToRuns(n.c, { ...marks, ...(n.color ? { color: n.color } : {}), ...(n.size ? { size: n.size } : {}) }));
        break;
    }
  }
  return out;
}

export function runsToInline(runs: (Run | "br")[]): Inline[] {
  return runs.map((r): Inline => {
    if (r === "br") return { t: "br" };
    let n: Inline = { t: "text", v: r.text };
    if (r.u) n = { t: "u", c: [n] };
    if (r.i) n = { t: "i", c: [n] };
    if (r.b) n = { t: "b", c: [n] };
    if (r.color || r.size) n = { t: "span", ...(r.color ? { color: r.color } : {}), ...(r.size ? { size: r.size } : {}), c: [n] };
    return n;
  });
}

// ---------- Serializer ----------

const escapeText = (s: string) => s.replace(/[\\*_+[\]{}]/g, (c) => `\\${c}`);

type Level = (r: Run) => string;
const LEVELS: { key: Level; open: (k: string) => string; close: (k: string) => string }[] = [
  { key: (r) => [r.color, r.size].filter(Boolean).join(" "), open: () => "[", close: (k) => `]{${k}}` },
  { key: (r) => (r.b ? "1" : ""), open: () => "**", close: () => "**" },
  { key: (r) => (r.i ? "1" : ""), open: () => "_", close: () => "_" },
  { key: (r) => (r.u ? "1" : ""), open: () => "++", close: () => "++" },
];

/** Serializes one line of runs, grouping neighbours that share a mark so markers nest cleanly. */
function serializeRuns(runs: Run[], level = 0): string {
  if (level >= LEVELS.length) return runs.map((r) => escapeText(r.text)).join("");
  const { key, open, close } = LEVELS[level]!;
  let out = "";
  for (let i = 0; i < runs.length; ) {
    const k = key(runs[i]!);
    let j = i + 1;
    while (j < runs.length && key(runs[j]!) === k) j++;
    const inner = serializeRuns(runs.slice(i, j), level + 1);
    out += k ? open(k) + inner + close(k) : inner;
    i = j;
  }
  return out;
}

/** Escapes a line start that would otherwise read as block syntax. */
function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)([#\-•!])/, "$1\\$2").replace(/^(\s*\d+)([.)])(\s)/, "$1\\$2$3");
}

function serializeLines(c: Inline[]): string[] {
  const lines: Run[][] = [[]];
  for (const r of inlineToRuns(c)) {
    if (r === "br") lines.push([]);
    else lines[lines.length - 1]!.push(r);
  }
  return lines.map((l) => escapeLineStart(serializeRuns(l)));
}

const oneLine = (c: Inline[]) => serializeLines(c).map((l) => l.trim()).filter(Boolean).join(" ");
const alignPrefix = (a?: InfoAlign) => (a && a !== "start" ? `{${a}} ` : "");

/** The stored string for a list of blocks. `parseInfoText(serializeInfoText(b))` returns `b`. */
export function serializeInfoText(blocks: MdBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "p": {
        const lines = serializeLines(b.c);
        // Lines that are empty would split the paragraph; drop them.
        const kept = lines.filter((l) => l.trim());
        if (kept.length) out.push(alignPrefix(b.align) + kept.join("\n"));
        break;
      }
      case "h": {
        const text = oneLine(b.c);
        if (text) out.push(`${alignPrefix(b.align)}${b.level === 1 ? "#" : "##"} ${text}`);
        break;
      }
      case "ul":
      case "ol": {
        const items = b.items.map(oneLine).filter(Boolean);
        if (items.length) out.push(items.map((it, i) => (b.t === "ul" ? `- ${it}` : `${i + 1}. ${it}`)).join("\n"));
        break;
      }
      case "img":
        if (IMAGE_PATH_RE.test(b.path)) out.push(`${alignPrefix(b.align)}![${b.size}](${b.path})`);
        break;
    }
  }
  return out.join("\n\n");
}

/** Image folders referenced by image lines in the info text. */
export function infoTextImages(md: string): string[] {
  const out: string[] = [];
  for (const b of parseInfoText(md)) if (b.t === "img" && !out.includes(b.path)) out.push(b.path);
  return out;
}

/**
 * Normalizes what a client stores: drops HTML tags and links (keeping their text) and anything
 * else outside the format, and cuts to `max` characters.
 */
export function sanitizeInfoText(md: string, max = 3000): string {
  return md
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const al = ALIGN.exec(line);
      const body = al ? al[2]! : line;
      const img = IMAGE.exec(body.trim());
      if (img && IMAGE_PATH_RE.test(img[2]!)) return line;
      return line
        .replace(/<[^>]*>/g, "")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^(\{(?:start|center|end)\}\s?)?#{3,}(\s)/, "$1##$2");
    })
    .join("\n")
    .slice(0, max);
}
