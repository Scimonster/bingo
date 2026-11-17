/**
 * Info-text Markdown subset: **bold**, *italic* / _italic_, "- " bullet lists, "1. " numbered
 * lists and line breaks. Parsed to an AST (never to HTML), so rendering is safe by construction.
 */
export type Inline = { t: "text"; v: string } | { t: "b"; c: Inline[] } | { t: "i"; c: Inline[] } | { t: "br" };
export type MdBlock = { t: "p"; c: Inline[] } | { t: "ul"; items: Inline[][] } | { t: "ol"; items: Inline[][] };

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "b", c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    const ch = src[i]!;
    if ((ch === "*" || ch === "_") && src[i + 1] !== ch) {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "i", c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;

export function parseInfoText(md: string): MdBlock[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    const c: Inline[] = [];
    para.forEach((l, idx) => {
      if (idx) c.push({ t: "br" });
      c.push(...parseInline(l));
    });
    blocks.push({ t: "p", c });
    para = [];
  };
  for (const line of lines) {
    const ul = UL.exec(line);
    const ol = ul ? null : OL.exec(line);
    if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = parseInline((ul ?? ol)![1]!);
      if (last && last.t === kind) last.items.push(item);
      else blocks.push({ t: kind, items: [item] } as MdBlock);
    } else if (!line.trim()) {
      flushPara();
    } else {
      para.push(line);
    }
  }
  flushPara();
  return blocks;
}

/** Strips anything outside the subset (HTML tags, links, headings markers) before storing. */
export function sanitizeInfoText(md: string, max = 1500): string {
  return md
    .replace(/\r\n?/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .slice(0, max);
}
