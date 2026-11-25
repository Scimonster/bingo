// Bundles the Functions with esbuild so workspace packages (@bingo/core, @bingo/sheet) and
// React are inlined, then writes lib/ as a self-contained deploy source (firebase.json points
// at functions/lib). Cloud Build runs `npm install` there, so lib/package.json lists only the
// runtime deps: npm can't parse the `workspace:*` devDependencies in functions/package.json.
// Locally, lib/node_modules symlinks to functions/node_modules (see below).
import { build } from "esbuild";
import { copyFileSync, existsSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const runtimeDeps = Object.keys(pkg.dependencies);

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: runtimeDeps,
  // Fonts are embedded into the PDF HTML as data URLs.
  loader: { ".woff2": "base64", ".woff": "base64" },
  logLevel: "info",
});

writeFileSync(
  "lib/package.json",
  JSON.stringify(
    { name: pkg.name, private: true, main: "index.js", engines: pkg.engines, dependencies: pkg.dependencies },
    null,
    2,
  ) + "\n",
);

// The Firebase CLI looks for the Functions SDK in <source>/node_modules (no parent lookup), for
// both the emulator and deploy-time discovery. firebase.json ignores node_modules on upload.
if (!existsSync("lib/node_modules")) symlinkSync("../node_modules", "lib/node_modules", "dir");

// Firebase reads .env, .env.<project>, .env.local and .secret.local from the source directory.
for (const f of readdirSync(".")) {
  if (f.startsWith(".env") || f === ".secret.local") copyFileSync(f, `lib/${f}`);
}
