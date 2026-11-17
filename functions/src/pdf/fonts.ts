// esbuild inlines these as base64 strings (see build.mjs / assets.d.ts).
import hebrew400 from "@fontsource/heebo/files/heebo-hebrew-400-normal.woff2";
import hebrew700 from "@fontsource/heebo/files/heebo-hebrew-700-normal.woff2";
import latin400 from "@fontsource/heebo/files/heebo-latin-400-normal.woff2";
import latin700 from "@fontsource/heebo/files/heebo-latin-700-normal.woff2";
import { heeboFontCssFrom } from "./fontCss";

/** Heebo 400/700 (Hebrew + Latin) as @font-face rules with data URLs. */
export function heeboFontCss(): string {
  return heeboFontCssFrom({ hebrew400, hebrew700, latin400, latin700 });
}
