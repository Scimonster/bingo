import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  exportSheetsPdfRequestSchema,
  FREE,
  printLayoutRenderImages,
  type Board,
  type ExportSheetsPdfResponse,
  type Item,
} from "@bingo/core";
import type { ResolverItem } from "@bingo/sheet";
import { bucket } from "../admin";
import { requireOwner, type Ctx } from "../context";
import { fail, parse, toHttpsError } from "../errors";
import { heeboFontCss } from "./fonts";
import { renderSheetsPdf, type PdfSheet } from "./render";

/** Origin encoded in sheet QR codes. */
const APP_ORIGIN = defineString("APP_ORIGIN", { default: "https://bingo-5717e.web.app" });

const MAX_SHEETS = 500;

async function loadImages(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const b = bucket();
  const queue = [...paths];
  const worker = async () => {
    for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
      for (const variant of ["print.webp", "thumb.webp"]) {
        try {
          const [buf] = await b.file(`${p}/${variant}`).download();
          out[p] = `data:image/webp;base64,${buf.toString("base64")}`;
          break;
        } catch (e) {
          logger.warn(`Image ${p}/${variant} unavailable`, e);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

export async function exportSheetsPdfHandler(ctx: Ctx, data: unknown): Promise<ExportSheetsPdfResponse> {
  const req = parse(exportSheetsPdfRequestSchema, data);
  const { fromSerial: from, toSerial: to, gameId } = req;
  if (from > to) fail("invalid-argument", "invalid-range", "fromSerial must be ≤ toSerial");
  if (to - from + 1 > MAX_SHEETS) fail("invalid-argument", "range-too-large", `At most ${MAX_SHEETS} sheets per export`);
  const { ref, game } = await requireOwner(ctx, gameId);

  const [sheetSnaps, boardSnaps, itemSnaps] = await Promise.all([
    ref.collection("sheets").where("serial", ">=", from).where("serial", "<=", to).get(),
    ref.collection("boards").where("sheetSerial", ">=", from).where("sheetSerial", "<=", to).get(),
    ref.collection("items").get(),
  ]);
  if (sheetSnaps.empty) fail("not-found", "no-sheets", "No sheets in that range");

  const boardsBySerial = new Map<number, string[][]>();
  for (const d of boardSnaps.docs) {
    const b = d.data() as Board;
    const list = boardsBySerial.get(b.sheetSerial) ?? [];
    list[b.slot] = b.cells;
    boardsBySerial.set(b.sheetSerial, list);
  }
  const sheets: PdfSheet[] = sheetSnaps.docs
    .map((d) => {
      const serial = d.get("serial") as number;
      const boards = boardsBySerial.get(serial) ?? [];
      return { serial, boards: Array.from({ length: boards.length }, (_, i) => boards[i] ?? []) };
    })
    .filter((s) => s.boards.length > 0)
    .sort((a, b) => a.serial - b.serial);

  const items: Record<string, ResolverItem> = {};
  for (const d of itemSnaps.docs) {
    const it = d.data() as Item;
    items[d.id] = { type: it.type, text: it.text, storagePath: it.storagePath };
  }

  // Only fetch images that appear on the exported boards (plus the free space, background and info box).
  const used = new Set<string>();
  for (const s of sheets) for (const b of s.boards) for (const id of b) if (id !== FREE && items[id]?.storagePath) used.add(items[id]!.storagePath!);
  const free = game.settings.freeSpace;
  if (free.enabled && free.content?.type === "image" && free.content.storagePath) used.add(free.content.storagePath);
  for (const p of printLayoutRenderImages(game.printLayout)) used.add(p);
  const images = await loadImages([...used]);

  const pdf = await renderSheetsPdf({
    gameId,
    game,
    sheets,
    items,
    images,
    appOrigin: APP_ORIGIN.value(),
    fontCss: heeboFontCss(),
  });

  const storagePath = `exports/${gameId}/${Date.now()}-${from}-${to}.pdf`;
  await bucket().file(storagePath).save(Buffer.from(pdf), { contentType: "application/pdf", resumable: false });
  logger.info(`Exported ${sheets.length} sheets of ${gameId} to ${storagePath}`);
  return { storagePath, pages: sheets.length };
}

function ctxOf(req: CallableRequest): Ctx {
  const provider = (req.auth?.token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  return { uid: req.auth?.uid ?? null, isAnonymous: provider === "anonymous" };
}

export const exportSheetsPdf = onCall({ memory: "2GiB", timeoutSeconds: 300 }, async (req) => {
  try {
    return await exportSheetsPdfHandler(ctxOf(req), req.data);
  } catch (e) {
    throw toHttpsError(e);
  }
});
