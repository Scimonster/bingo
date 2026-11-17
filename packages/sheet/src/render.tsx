import type { Lang } from "@bingo/core";
import { renderToStaticMarkup } from "react-dom/server";
import { sheetCss } from "./css";
import { SheetLayout, type SheetLayoutProps } from "./SheetLayout";

export interface RenderSheetsHtmlOptions {
  pages: SheetLayoutProps[];
  /** Extra CSS, typically @font-face rules for Heebo (data URLs). */
  fontCss: string;
  lang: Lang;
}

/** Text safe inside a <style> element. */
const styleText = (css: string) => css.replace(/<\/style/gi, "<\\/style");

/** A full HTML document with one page per sheet, for headless Chromium's page.pdf(). */
export function renderSheetsHtml({ pages, fontCss, lang }: RenderSheetsHtmlOptions): string {
  const body = pages.map((p) => renderToStaticMarkup(<SheetLayout {...p} />)).join("\n");
  const first = pages[0];
  const dir = lang === "he" ? "rtl" : "ltr";
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${first ? "Bingo sheets" : "Bingo"}</title>
<style>${styleText(fontCss)}</style>
<style>${styleText(sheetCss)}
html, body { margin: 0; padding: 0; background: #fff; }
</style>
</head>
<body class="bs-doc">
${body}
</body>
</html>`;
}
