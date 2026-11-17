// Bundles the Functions with esbuild so workspace packages (@bingo/core, @bingo/sheet) and
// React are inlined: Cloud Build only installs the runtime deps in package.json.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["firebase-admin", "firebase-functions", "puppeteer-core", "@sparticuz/chromium"],
  // Fonts are embedded into the PDF HTML as data URLs.
  loader: { ".woff2": "base64", ".woff": "base64" },
  logLevel: "info",
});
