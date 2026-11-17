// esbuild inlines these as base64 strings (see build.mjs / assets.d.ts).
import hebrew400 from "@fontsource/heebo/files/heebo-hebrew-400-normal.woff2";
import hebrew700 from "@fontsource/heebo/files/heebo-hebrew-700-normal.woff2";
import latin400 from "@fontsource/heebo/files/heebo-latin-400-normal.woff2";
import latin700 from "@fontsource/heebo/files/heebo-latin-700-normal.woff2";

const HEBREW = "U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F";
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

function face(base64: string, weight: number, range: string): string {
  return `@font-face{font-family:"Heebo";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${base64}) format("woff2");unicode-range:${range};}`;
}

/** Heebo 400/700 (Hebrew + Latin) as @font-face rules with data URLs. */
export function heeboFontCss(): string {
  return [
    face(hebrew400, 400, HEBREW),
    face(hebrew700, 700, HEBREW),
    face(latin400, 400, LATIN),
    face(latin700, 700, LATIN),
  ].join("\n");
}
