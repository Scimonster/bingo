/**
 * Converts between the stored info-text markup (via its AST in @bingo/core) and the editor's
 * ProseMirror/Tiptap JSON. Anything the format can't express (pasted colours outside the palette,
 * links, nested lists…) is dropped or flattened, so what the editor shows after a reload is
 * exactly what prints.
 */
import {
  INFO_COLORS,
  INFO_SIZES,
  IMAGE_PATH_RE,
  parseInfoText,
  inlineToRuns,
  runsToInline,
  serializeInfoText,
  type InfoAlign,
  type InfoColor,
  type InfoImageSize,
  type InfoSize,
  type Inline,
  type MdBlock,
  type Run,
} from "@bingo/core";

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

export const IMAGE_NODE = "infoImage";

/** CSS font-size value the editor uses for each size. */
export const sizeCss = (s: InfoSize) => `${INFO_SIZES[s]}em`;

function colorName(v: unknown): InfoColor | undefined {
  if (typeof v !== "string") return undefined;
  const hex = v.trim().toLowerCase();
  return (Object.keys(INFO_COLORS) as InfoColor[]).find((k) => INFO_COLORS[k] === hex);
}

function sizeName(v: unknown): InfoSize | undefined {
  if (typeof v !== "string" || !v.trim().endsWith("em")) return undefined;
  const n = parseFloat(v);
  return (Object.keys(INFO_SIZES) as InfoSize[]).find((k) => Math.abs(INFO_SIZES[k] - n) < 0.01);
}

function alignOf(n: PMNode): InfoAlign | undefined {
  const a = n.attrs?.textAlign;
  return a === "center" || a === "end" ? a : undefined;
}

/** Runs of an inline container; hard breaks become "br". */
function runsOf(n: PMNode): (Run | "br")[] {
  const out: (Run | "br")[] = [];
  for (const c of n.content ?? []) {
    if (c.type === "hardBreak") {
      out.push("br");
      continue;
    }
    if (c.type !== "text" || !c.text) continue;
    const r: Run = { text: c.text };
    for (const m of c.marks ?? []) {
      if (m.type === "bold") r.b = true;
      else if (m.type === "italic") r.i = true;
      else if (m.type === "underline") r.u = true;
      else if (m.type === "textStyle") {
        const color = colorName(m.attrs?.color);
        const size = sizeName(m.attrs?.fontSize);
        if (color) r.color = color;
        if (size) r.size = size;
      }
    }
    out.push(r);
  }
  return out;
}

const noBreaks = (runs: (Run | "br")[]): Run[] => runs.map((r) => (r === "br" ? { text: " " } : r));

/** Text of a list item (its paragraphs joined); nested lists become further items. */
function listItems(list: PMNode): Inline[][] {
  const items: Inline[][] = [];
  for (const li of list.content ?? []) {
    const runs: Run[] = [];
    const nested: Inline[][] = [];
    for (const c of li.content ?? []) {
      if (c.type === "bulletList" || c.type === "orderedList") nested.push(...listItems(c));
      else {
        if (runs.length) runs.push({ text: " " });
        runs.push(...noBreaks(runsOf(c)));
      }
    }
    if (runs.some((r) => r.text.trim())) items.push(runsToInline(runs));
    items.push(...nested);
  }
  return items;
}

export function docToBlocks(doc: PMNode): MdBlock[] {
  const blocks: MdBlock[] = [];
  for (const n of doc.content ?? []) {
    const align = alignOf(n);
    const a = align ? { align } : {};
    switch (n.type) {
      case "paragraph":
        blocks.push({ t: "p", c: runsToInline(runsOf(n)), ...a });
        break;
      case "heading":
        blocks.push({ t: "h", level: n.attrs?.level === 1 ? 1 : 2, c: runsToInline(noBreaks(runsOf(n))), ...a });
        break;
      case "bulletList":
      case "orderedList": {
        const items = listItems(n);
        if (items.length) blocks.push({ t: n.type === "bulletList" ? "ul" : "ol", items });
        break;
      }
      case IMAGE_NODE: {
        const path = n.attrs?.path;
        const size = n.attrs?.size;
        if (typeof path === "string" && IMAGE_PATH_RE.test(path)) {
          blocks.push({ t: "img", path, size: size === "s" || size === "l" ? size : "m", ...a });
        }
        break;
      }
    }
  }
  return blocks;
}

export const docToMarkup = (doc: PMNode): string => serializeInfoText(docToBlocks(doc));

function inlineToPM(c: Inline[]): PMNode[] {
  return inlineToRuns(c).map((r): PMNode => {
    if (r === "br") return { type: "hardBreak" };
    const marks: PMMark[] = [];
    if (r.b) marks.push({ type: "bold" });
    if (r.i) marks.push({ type: "italic" });
    if (r.u) marks.push({ type: "underline" });
    if (r.color || r.size) {
      marks.push({ type: "textStyle", attrs: { color: r.color ? INFO_COLORS[r.color] : null, fontSize: r.size ? sizeCss(r.size) : null } });
    }
    return marks.length ? { type: "text", text: r.text, marks } : { type: "text", text: r.text };
  });
}

const alignAttrs = (a?: InfoAlign) => ({ textAlign: a ?? null });

export function blocksToDoc(blocks: MdBlock[]): PMNode {
  const content: PMNode[] = blocks.map((b): PMNode => {
    switch (b.t) {
      case "p":
        return { type: "paragraph", attrs: alignAttrs(b.align), content: inlineToPM(b.c) };
      case "h":
        return { type: "heading", attrs: { level: b.level, ...alignAttrs(b.align) }, content: inlineToPM(b.c) };
      case "ul":
      case "ol":
        return {
          type: b.t === "ul" ? "bulletList" : "orderedList",
          content: b.items.map((it) => ({ type: "listItem", content: [{ type: "paragraph", content: inlineToPM(it) }] })),
        };
      case "img":
        return { type: IMAGE_NODE, attrs: { path: b.path, size: b.size as InfoImageSize, ...alignAttrs(b.align) } };
    }
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export const markupToDoc = (md: string): PMNode => blocksToDoc(parseInfoText(md));
