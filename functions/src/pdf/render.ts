/**
 * Pure PDF rendering: sheet data in → PDF bytes out. No Firebase access, so it can be tested
 * with a local Chrome.
 */
import { sheetQrPath, type Game } from "@bingo/core";
import { makeResolver, qrSvg, renderSheetsHtml, type ResolverItem, type SheetLayoutProps } from "@bingo/sheet";
import type { Browser } from "puppeteer-core";

export interface PdfSheet {
  serial: number;
  /** Board cells per slot (index = slot). */
  boards: string[][];
}

export interface PdfInput {
  gameId: string;
  game: Pick<Game, "playerLanguage" | "settings" | "printLayout">;
  sheets: PdfSheet[];
  items: Record<string, ResolverItem>;
  /** Image folder (storagePath) → data URL of its print variant. */
  images: Record<string, string>;
  /** Absolute origin for QR links, e.g. https://bingo-5717e.web.app */
  appOrigin: string;
  /** @font-face CSS (data URLs). */
  fontCss: string;
}

/**
 * Placeholder origin for image URLs in the sheet HTML; htmlToPdf answers these requests from
 * memory. Inlining each image as a data URL at every use repeats it once per cell per sheet,
 * which for a few hundred sheets overflows V8's max string length and the Function's memory.
 */
const ASSET_ORIGIN = "https://assets.bingo-pdf.invalid";

export interface PdfAsset {
  contentType: string;
  body: Buffer;
}

export interface SheetsDocument {
  html: string;
  /** Placeholder URL → bytes, served while printing. */
  assets: Map<string, PdfAsset>;
}

/** Maps each image folder to a short placeholder URL and decodes its data URL into bytes. */
function imageAssets(images: Record<string, string>): { urls: Record<string, string>; assets: Map<string, PdfAsset> } {
  const urls: Record<string, string> = {};
  const assets = new Map<string, PdfAsset>();
  Object.entries(images).forEach(([path, dataUrl], i) => {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) {
      urls[path] = dataUrl; // already a fetchable URL
      return;
    }
    const url = `${ASSET_ORIGIN}/${i}`;
    urls[path] = url;
    assets.set(url, {
      contentType: m[1]!,
      body: m[2] ? Buffer.from(m[3]!, "base64") : Buffer.from(decodeURIComponent(m[3]!)),
    });
  });
  return { urls, assets };
}

export async function buildSheetPages(input: PdfInput, imageUrls: Record<string, string> = input.images): Promise<SheetLayoutProps[]> {
  const { game } = input;
  const freeContent = game.settings.freeSpace.enabled ? game.settings.freeSpace.content : undefined;
  const resolve = makeResolver(input.items, freeContent, (p) => imageUrls[p]);
  const origin = input.appOrigin.replace(/\/+$/, "");
  const bg = game.printLayout.backgroundImage;
  const backgroundUrl = bg ? imageUrls[bg] : undefined;
  return Promise.all(
    input.sheets.map(async (s) => ({
      serial: s.serial,
      boards: s.boards,
      settings: game.settings,
      printLayout: game.printLayout,
      lang: game.playerLanguage,
      resolve,
      qrSvg: game.printLayout.showQr === false ? "" : await qrSvg(`${origin}${sheetQrPath(input.gameId, s.serial)}`),
      backgroundUrl,
      imageUrl: (p: string) => imageUrls[p],
    })),
  );
}

/** Sheet HTML that references images by placeholder URL, plus the bytes to serve for them. */
export async function buildSheetsDocument(input: PdfInput): Promise<SheetsDocument> {
  const { urls, assets } = imageAssets(input.images);
  const pages = await buildSheetPages(input, urls);
  return { html: renderSheetsHtml({ pages, fontCss: input.fontCss, lang: input.game.playerLanguage }), assets };
}

/** Standalone HTML with images inlined as data URLs (for previews/debugging; not for large exports). */
export async function buildSheetsHtml(input: PdfInput): Promise<string> {
  const pages = await buildSheetPages(input);
  return renderSheetsHtml({ pages, fontCss: input.fontCss, lang: input.game.playerLanguage });
}

export interface LaunchOptions {
  /** Explicit Chrome binary; otherwise CHROME_PATH, the emulator default, or @sparticuz/chromium. */
  executablePath?: string;
}

export async function launchBrowser(opts: LaunchOptions = {}): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  const local =
    opts.executablePath ??
    process.env.CHROME_PATH ??
    (process.env.FUNCTIONS_EMULATOR === "true" ? "/usr/bin/google-chrome" : undefined);
  if (local) {
    return puppeteer.launch({
      executablePath: local,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  chromium.setGraphicsMode = false;
  return puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
}

/** Prints an HTML document (sized with CSS @page) to PDF. */
export async function htmlToPdf(
  html: string,
  opts: LaunchOptions = {},
  assets: Map<string, PdfAsset> = new Map(),
): Promise<Uint8Array> {
  const browser = await launchBrowser(opts);
  try {
    const page = await browser.newPage();
    if (assets.size) {
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const asset = assets.get(req.url());
        if (asset) void req.respond({ status: 200, contentType: asset.contentType, body: asset.body });
        else if (req.url().startsWith(ASSET_ORIGIN)) void req.respond({ status: 404, body: "" });
        else void req.continue();
      });
    }
    await page.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 240_000 });
  } finally {
    await browser.close();
  }
}

export async function renderSheetsPdf(input: PdfInput, opts: LaunchOptions = {}): Promise<Uint8Array> {
  const { html, assets } = await buildSheetsDocument(input);
  return htmlToPdf(html, opts, assets);
}
