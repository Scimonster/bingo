import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FREE, pageSizeMm, type GameSettings, type PrintLayout } from "@bingo/core";
import {
  BoardGrid,
  InfoText,
  makeResolver,
  qrSvg,
  renderSheetsHtml,
  SheetLayout,
  fitFraction,
  type SheetLayoutProps,
} from "../src";

const items = {
  a: { type: "text" as const, text: "Apple" },
  b: { type: "text" as const, text: "תפוח עץ" },
  c: { type: "image" as const, storagePath: "users/u/images/c", text: "Cat" },
  x: { type: "text" as const, text: '<script>alert("x")</script> & <b>bold</b>' },
};
const urlFor = (p: string) => `https://img.test/${p}/print.webp`;

const settings = (over: Partial<GameSettings> = {}): GameSettings => ({
  rows: 3,
  cols: 3,
  boardsPerSheet: 3,
  freeSpace: { enabled: true, row: 1, col: 1 },
  ...over,
});
const layout = (over: Partial<PrintLayout> = {}): PrintLayout => ({
  heading: "Family Bingo",
  slotLabels: ["Game 1", "Game 2", "Game 3"],
  infoText: "",
  paperSize: "A4",
  orientation: "landscape",
  arrangement: "row",
  marginMm: 10,
  ...over,
});
const cells = ["a", "b", "c", "x", FREE, "a", "b", "c", "a"];

function props(over: Partial<SheetLayoutProps> = {}): SheetLayoutProps {
  return {
    serial: 42,
    boards: [cells, cells, cells],
    settings: settings(),
    printLayout: layout(),
    lang: "en",
    resolve: makeResolver(items, undefined, urlFor),
    qrSvg: "<svg></svg>",
    ...over,
  };
}

describe("makeResolver", () => {
  it("resolves text, image, missing and free cells", () => {
    const r = makeResolver(items, undefined, urlFor);
    expect(r("a")).toEqual({ kind: "text", text: "Apple" });
    expect(r("c")).toEqual({ kind: "image", url: "https://img.test/users/u/images/c/print.webp", caption: "Cat" });
    expect(r("nope")).toEqual({ kind: "text", text: "" });
    expect(r(FREE)).toEqual({ kind: "free" });
  });
  it("uses the free-space content", () => {
    expect(makeResolver(items, { type: "text", text: "Free!" }, urlFor)(FREE)).toEqual({ kind: "free", text: "Free!" });
    expect(makeResolver(items, { type: "image", storagePath: "users/u/images/f" }, urlFor)(FREE)).toEqual({
      kind: "free",
      url: "https://img.test/users/u/images/f/print.webp",
      text: undefined,
    });
  });
});

describe("BoardGrid", () => {
  const resolve = makeResolver(items, undefined, urlFor);
  const order = (html: string) => [...html.matchAll(/data-index="(\d+)"/g)].map((m) => Number(m[1]));

  it("keeps cell order and LTR direction regardless of page direction", () => {
    const ltr = renderToStaticMarkup(<BoardGrid cells={cells} rows={3} cols={3} resolve={resolve} />);
    const rtl = renderToStaticMarkup(
      <div dir="rtl" lang="he">
        <BoardGrid cells={cells} rows={3} cols={3} resolve={resolve} />
      </div>,
    );
    expect(order(ltr)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(order(rtl)).toEqual(order(ltr));
    expect(rtl).toMatch(/class="bs-board[^"]*"[^>]*dir="ltr"/);
    expect(ltr).toContain('dir="auto"');
  });

  it("renders tap targets with marked/highlighted state", () => {
    const html = renderToStaticMarkup(
      <BoardGrid
        cells={cells}
        rows={3}
        cols={3}
        resolve={resolve}
        marked={new Set([0])}
        highlighted={new Set([1])}
        onCellClick={() => {}}
        label="Game 1"
      />,
    );
    expect(html.match(/<button/g)).toHaveLength(9);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("bs-cell--marked");
    expect(html).toContain("bs-cell--hl");
    expect(html).toContain('aria-label="Game 1"');
    expect(html).toContain('aria-label="Free space"');
    expect(html).toContain('class="bs-star"');
  });

  it("escapes user text", () => {
    const html = renderToStaticMarkup(<BoardGrid cells={["x"]} rows={1} cols={1} resolve={resolve} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>bold");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("fitFraction", () => {
  it("shrinks with longer text and is deterministic", () => {
    expect(fitFraction("Hi")).toBeGreaterThan(fitFraction("A considerably longer item text"));
    expect(fitFraction("x".repeat(200))).toBeGreaterThanOrEqual(0.06);
    expect(fitFraction("שלום עולם")).toBe(fitFraction("שלום עולם"));
  });
});

describe("InfoText", () => {
  it("renders the markdown subset without raw HTML", () => {
    const html = renderToStaticMarkup(
      <InfoText md={"**Rules** are *simple*\nsecond line\n\n- one\n- two\n\n1. first\n2. <img src=x onerror=alert(1)>"} />,
    );
    expect(html).toContain("<b>Rules</b>");
    expect(html).toContain("<i>simple</i>");
    expect(html).toContain("<br/>");
    expect(html).toMatch(/<ul dir="auto"><li dir="auto">one<\/li><li dir="auto">two<\/li><\/ul>/);
    expect(html).toContain("<ol");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("renders nothing for empty text", () => {
    expect(renderToStaticMarkup(<InfoText md="  " />)).toBe("");
  });
});

describe("SheetLayout", () => {
  const size = (html: string) => {
    const m = /class="bs-page[^"]*" style="width:([\d.]+)mm;height:([\d.]+)mm/.exec(html);
    return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
  };

  it.each([
    ["row", "A4", "landscape", 3],
    ["column", "Letter", "portrait", 2],
    ["grid", "A3", "portrait", 3],
    ["grid", "A4", "portrait", 4],
    ["single", "A5", "portrait", 1],
  ] as const)("%s on %s %s with %d boards has the exact page size", (arrangement, paperSize, orientation, n) => {
    const html = renderToStaticMarkup(
      <SheetLayout
        {...props({
          boards: Array.from({ length: n }, () => cells),
          settings: settings({ boardsPerSheet: n }),
          printLayout: layout({ arrangement, paperSize, orientation, infoText: "Info" }),
        })}
      />,
    );
    const expected = pageSizeMm(paperSize, orientation);
    expect(size(html)).toEqual({ w: Math.round(expected.w * 100) / 100, h: Math.round(expected.h * 100) / 100 });
    expect(html).toContain(`@page{size:${Math.round(expected.w * 100) / 100}mm`);
    expect(html.match(/class="bs-board /g)).toHaveLength(n);
    // grid 2×2 with 4 boards has no info area
    expect(html.includes("bs-info")).toBe(!(arrangement === "grid" && n === 4));
  });

  it("puts serial, QR and info in the fourth quadrant for grid with 3 boards", () => {
    const html = renderToStaticMarkup(
      <SheetLayout {...props({ printLayout: layout({ arrangement: "grid", infoText: "Hello" }) })} />,
    );
    expect(html).toMatch(/<section class="bs-meta".*№ 042.*bs-qr.*Hello/);
    expect(html).not.toContain("<header");
  });

  it("places boards and the info panel in the layout's order", () => {
    const html = renderToStaticMarkup(
      <SheetLayout {...props({ printLayout: layout({ arrangement: "grid", order: [-1, 2, 0, 1], infoText: "Hello" }) })} />,
    );
    expect(html.indexOf("bs-meta")).toBeLessThan(html.indexOf("bs-quad"));
    const labels = [...html.matchAll(/aria-label="(Game \d)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["Game 3", "Game 1", "Game 2"]);
    const row = renderToStaticMarkup(<SheetLayout {...props({ printLayout: layout({ order: [1, 2, 0] }) })} />);
    expect([...row.matchAll(/aria-label="(Game \d)"/g)].map((m) => m[1])).toEqual(["Game 2", "Game 3", "Game 1"]);
  });

  it("hides the QR code when showQr is false", () => {
    for (const arrangement of ["row", "grid"] as const) {
      const html = renderToStaticMarkup(<SheetLayout {...props({ printLayout: layout({ arrangement, showQr: false }) })} />);
      expect(html).not.toContain("bs-qr");
      expect(html).toContain("№ 042");
    }
  });

  it("stretches boards to non-square cells", () => {
    const html = renderToStaticMarkup(<SheetLayout {...props({ printLayout: layout({ stretch: true }) })} />);
    const [, w, h] = html.match(/class="bs-board-box" style="width:([\d.]+)mm;height:([\d.]+)mm"/)!;
    expect(Number(h)).toBeGreaterThan(Number(w));
  });

  it("draws a background colour and image behind the content", () => {
    const html = renderToStaticMarkup(
      <SheetLayout
        {...props({
          printLayout: layout({ backgroundColor: "#ffeeaa", backgroundImage: "users/u/images/bg", backgroundOpacity: 0.4 }),
          backgroundUrl: "https://img.test/bg.webp",
        })}
      />,
    );
    expect(html).toContain("bs-page--bg");
    expect(html).toContain("background-color:#ffeeaa");
    expect(html).toMatch(/class="bs-bg"[^>]*background-image:url\(&quot;https:\/\/img.test\/bg.webp&quot;\);opacity:0.4/);
    const plain = renderToStaticMarkup(<SheetLayout {...props({ printLayout: layout({ backgroundColor: "red" }) })} />);
    expect(plain).not.toContain("bs-page--bg");
  });

  it("renders header, labels and info, with Hebrew direction", () => {
    const html = renderToStaticMarkup(
      <SheetLayout
        {...props({
          lang: "he",
          printLayout: layout({ heading: "בינגו <משפחתי>", slotLabels: ["", "סיבוב ב"], infoText: "**בהצלחה**" }),
        })}
      />,
    );
    expect(html).toContain('lang="he" dir="rtl"');
    expect(html).toContain("בינגו &lt;משפחתי&gt;");
    expect(html).toContain("משחק 1"); // default label for empty slot label
    expect(html).toContain("סיבוב ב");
    expect(html).toContain("משחק 3");
    expect(html).toContain("<b>בהצלחה</b>");
    expect(html).toMatch(/class="bs-serial" dir="ltr"[^>]*aria-label="№ 042"/);
  });
});

describe("qrSvg / renderSheetsHtml", () => {
  it("produces SVG markup", async () => {
    const svg = await qrSvg("https://bingo.test/s/g1/042");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
    expect(svg).toContain("<path");
  });

  it("renders a full document with one page per sheet", async () => {
    const qr = await qrSvg("https://bingo.test/s/g1/042");
    const html = renderSheetsHtml({
      pages: [props({ qrSvg: qr }), props({ serial: 43, qrSvg: qr })],
      fontCss: "@font-face{font-family:Heebo;src:url(data:font/woff2;base64,AA==)}</style><script>",
      lang: "he",
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html.match(/class="bs-page /g)).toHaveLength(2);
    expect(html).toContain("@page{size:297mm 210mm;margin:0}");
    expect(html).toContain("break-after: page");
    expect(html).not.toContain("</style><script>");
  });
});

describe("SheetStyles", () => {
  it("emits the stylesheet", async () => {
    const { SheetStyles } = await import("../src");
    const html = renderToStaticMarkup(
      <div>
        <SheetStyles />
        <SheetStyles />
      </div>,
    );
    expect(html.match(/\.bs-board/g)?.length).toBeGreaterThan(0);
    expect(html.split("bingo-sheet-css").length - 1).toBe(1);
  });
});
