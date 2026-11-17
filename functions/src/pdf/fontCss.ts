const HEBREW = "U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F";
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

export interface HeeboFiles {
  hebrew400: string;
  hebrew700: string;
  latin400: string;
  latin700: string;
}

function face(base64: string, weight: number, range: string): string {
  return `@font-face{font-family:"Heebo";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${base64}) format("woff2");unicode-range:${range};}`;
}

/** Heebo 400/700 (Hebrew + Latin subsets) as @font-face rules from base64 woff2 data. */
export function heeboFontCssFrom(f: HeeboFiles): string {
  return [
    face(f.hebrew400, 400, HEBREW),
    face(f.hebrew700, 700, HEBREW),
    face(f.latin400, 400, LATIN),
    face(f.latin700, 700, LATIN),
  ].join("\n");
}
