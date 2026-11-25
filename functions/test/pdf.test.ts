/**
 * Renders a real PDF with a local Chrome. Needs no emulators; skipped when no Chrome is found.
 * Set PDF_OUT=/path/file.pdf to keep the output for visual inspection.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { FREE, type GameSettings, type PrintLayout } from "@bingo/core";
import { heeboFontCssFrom } from "../src/pdf/fontCss";
import { buildSheetsDocument, buildSheetsHtml, renderSheetsPdf, type PdfInput } from "../src/pdf/render";

const chrome = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
  (p): p is string => !!p && existsSync(p),
);

const require = createRequire(import.meta.url);
const font = (name: string) =>
  readFileSync(require.resolve(`@fontsource/heebo/files/heebo-${name}-normal.woff2`)).toString("base64");

const svgImage = (fill: string, label: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" rx="10" fill="${fill}"/><circle cx="40" cy="40" r="22" fill="#fff"/><text x="70" y="50" font-size="28" fill="#fff">${label}</text></svg>`,
  ).toString("base64")}`;

const texts = [
  "תפוח", "Banana", "אבטיח אדום וענק", "Kiwi", "רימון", "Grapes", "מנגו", "Strawberry fields forever",
  "לימון", "Pear", "שזיף", "Cherry", "אננס", "Fig", "תמר", "Peach", "קלמנטינה", "Plum", "פפאיה", "Lime",
  "Ice cream sandwich with sprinkles on top", "ענבים ירוקים", "Coconut", "אגס", "Melon", "פסיפלורה", "Apricot",
  "Watermelon 🍉", "חבוש", "Blueberry",
];
const items: PdfInput["items"] = Object.fromEntries(texts.map((t, i) => [`t${i}`, { type: "text" as const, text: t }]));
items.img1 = { type: "image", storagePath: "users/u/images/1", text: "חתול" };
items.img2 = { type: "image", storagePath: "users/u/images/2" };
const ids = Object.keys(items);

const settings: GameSettings = {
  rows: 5,
  cols: 5,
  boardsPerSheet: 3,
  freeSpace: { enabled: true, row: 2, col: 2 },
};
const printLayout: PrintLayout = {
  heading: "בינגו משפחתי — Family Bingo Night",
  slotLabels: ["משחק 1", "Round two", ""],
  infoText:
    "**ברוכים הבאים!** סמנו כל פריט שהוכרז.\nהראשון שמשלים *שורה* צועק בינגו.\n\n- Mark each item when it is called\n- Show your sheet to the host\n\n1. פרס ראשון: עוגה\n2. Second prize: a <b>mug</b>",
  paperSize: "A4",
  orientation: "landscape",
  arrangement: "row",
  marginMm: 10,
};

function board(seed: number): string[] {
  const cells: string[] = [];
  for (let i = 0; i < 25; i++) cells.push(ids[(i * 7 + seed * 11) % ids.length]!);
  cells[12] = FREE;
  return cells;
}

const input: PdfInput = {
  gameId: "game123",
  game: { playerLanguage: "he", settings, printLayout },
  sheets: [1, 2, 3].map((serial) => ({ serial, boards: [0, 1, 2].map((s) => board(serial * 3 + s)) })),
  items,
  images: { "users/u/images/1": svgImage("#7c3aed", "cat"), "users/u/images/2": svgImage("#0e9f6e", "dog") },
  appOrigin: "https://bingo-5717e.web.app",
  fontCss: heeboFontCssFrom({
    hebrew400: font("hebrew-400"),
    hebrew700: font("hebrew-700"),
    latin400: font("latin-400"),
    latin700: font("latin-700"),
  }),
};

describe("PDF export rendering", () => {
  it("builds HTML with QR links and escaped user text", async () => {
    const html = await buildSheetsHtml(input);
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html.match(/class="bs-page /g)).toHaveLength(3);
    expect(html).not.toContain("<b>mug</b>");
    expect(html).toContain("data:image/svg+xml;base64");
  });

  it("references images by placeholder URL instead of inlining them per cell", async () => {
    const many: PdfInput = {
      ...input,
      sheets: Array.from({ length: 40 }, (_, i) => ({ serial: i + 1, boards: [0, 1, 2].map((s) => board(i * 3 + s)) })),
    };
    const { html, assets } = await buildSheetsDocument(many);
    expect(html).not.toContain("data:image/");
    expect(assets.size).toBe(2);
    const urls = [...assets.keys()];
    expect(html).toContain(`src="${urls[0]}"`);
    // Each image's bytes are held once, not once per use.
    expect(assets.get(urls[0]!)!.contentType).toBe("image/svg+xml");
    expect(assets.get(urls[0]!)!.body.toString()).toContain("<svg");
    // HTML size doesn't grow with image size (a 1 MB image used in hundreds of cells).
    const big = `data:image/png;base64,${"A".repeat(1_000_000)}`;
    const bigDoc = await buildSheetsDocument({ ...many, images: { ...many.images, "users/u/images/1": big } });
    expect(bigDoc.html.length).toBe(html.length);
  });

  it.skipIf(!chrome)(
    "serves placeholder image URLs to Chrome while printing",
    async () => {
      // 1×1 PNG: raster images show up as /Subtype /Image XObjects in the PDF.
      const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const withPng: PdfInput = { ...input, sheets: input.sheets.slice(0, 1), images: { ...input.images, "users/u/images/1": png } };
      const text = Buffer.from(await renderSheetsPdf(withPng, { executablePath: chrome })).toString("latin1");
      expect(text).toMatch(/\/Subtype\s*\/Image/);
    },
    120_000,
  );

  it("draws info-box images and the full info image from the loaded images", async () => {
    const rich: PdfInput = {
      ...input,
      game: {
        ...input.game,
        printLayout: { ...printLayout, arrangement: "grid", infoText: "# כללים\n\n{center} [Win]{red large} ++big++\n\n![m](users/u/images/2)" },
      },
    };
    const html = await buildSheetsHtml(rich);
    expect(html).toContain('<h2 dir="auto" class="bs-md-h1">כללים</h2>');
    expect(html).toContain(`<div class="bs-md-img bs-md-img--m" style="text-align:center"><img src="${input.images["users/u/images/2"]}"`);
    const full: PdfInput = {
      ...input,
      game: { ...input.game, printLayout: { ...printLayout, infoMode: "image", infoImage: "users/u/images/1" } },
    };
    const fullHtml = await buildSheetsHtml(full);
    expect(fullHtml).toContain(`<img class="bs-info-img" src="${input.images["users/u/images/1"]}"`);
    expect(fullHtml).not.toContain("ברוכים הבאים");
    if (chrome && process.env.PDF_OUT) {
      writeFileSync(`${process.env.PDF_OUT}.rich.pdf`, await renderSheetsPdf(rich, { executablePath: chrome }));
      writeFileSync(`${process.env.PDF_OUT}.full.pdf`, await renderSheetsPdf(full, { executablePath: chrome }));
    }
  }, 120_000);

  it.skipIf(!chrome)(
    "renders a 3-page PDF with a local Chrome",
    async () => {
      const pdf = await renderSheetsPdf(input, { executablePath: chrome });
      if (process.env.PDF_OUT) {
        writeFileSync(process.env.PDF_OUT, pdf);
        writeFileSync(`${process.env.PDF_OUT}.html`, await buildSheetsHtml(input));
      }
      const text = Buffer.from(pdf).toString("latin1");
      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(3);
      // A4 landscape ≈ 841.9 × 595.3 pt (Chrome rounds to whole CSS pixels)
      const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(text);
      expect(Number(box?.[1])).toBeCloseTo(841.9, 0);
      expect(Math.abs(Number(box?.[2]) - 595.3)).toBeLessThan(1);
    },
    120_000,
  );
});
