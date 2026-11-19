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

export async function buildSheetPages(input: PdfInput): Promise<SheetLayoutProps[]> {
  const { game } = input;
  const freeContent = game.settings.freeSpace.enabled ? game.settings.freeSpace.content : undefined;
  const resolve = makeResolver(input.items, freeContent, (p) => input.images[p]);
  const origin = input.appOrigin.replace(/\/+$/, "");
  const bg = game.printLayout.backgroundImage;
  const backgroundUrl = bg ? input.images[bg] : undefined;
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
    })),
  );
}

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
export async function htmlToPdf(html: string, opts: LaunchOptions = {}): Promise<Uint8Array> {
  const browser = await launchBrowser(opts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 240_000 });
  } finally {
    await browser.close();
  }
}

export async function renderSheetsPdf(input: PdfInput, opts: LaunchOptions = {}): Promise<Uint8Array> {
  return htmlToPdf(await buildSheetsHtml(input), opts);
}
