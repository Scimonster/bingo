import { z } from "zod";
import { DEFAULTS, LIMITS } from "./constants";
import { DEFAULT_PATTERNS } from "./patterns";
import type { GameSettings, PrintLayout } from "./types";

export const cellContentSchema = z.object({
  type: z.enum(["text", "image"]),
  text: z.string().max(LIMITS.textItemMax).optional(),
  storagePath: z.string().regex(/^users\/[^/]+\/images\/[^/]+$/).optional(),
});

export const gameSettingsSchema = z
  .object({
    rows: z.number().int().min(LIMITS.gridMin).max(LIMITS.gridMax),
    cols: z.number().int().min(LIMITS.gridMin).max(LIMITS.gridMax),
    freeSpace: z.object({
      enabled: z.boolean(),
      row: z.number().int().min(0),
      col: z.number().int().min(0),
      content: cellContentSchema.optional(),
    }),
    boardsPerSheet: z.number().int().min(LIMITS.boardsPerSheetMin).max(LIMITS.boardsPerSheetMax),
  })
  .refine((s) => s.freeSpace.row < s.rows && s.freeSpace.col < s.cols, "Free space outside the grid");

export const printLayoutSchema = z.object({
  heading: z.string().max(LIMITS.headingMax).optional(),
  slotLabels: z.array(z.string().max(LIMITS.slotLabelMax)).max(LIMITS.boardsPerSheetMax),
  infoText: z.string().max(LIMITS.infoTextMax),
  paperSize: z.enum(["A5", "A4", "A3", "Letter", "Legal", "Tabloid"]),
  orientation: z.enum(["portrait", "landscape"]),
  arrangement: z.enum(["row", "column", "grid", "single"]),
  marginMm: z.number().min(LIMITS.marginMinMm).max(LIMITS.marginMaxMm),
});

export const patternSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(60),
  cells: z.array(z.number().int().min(0).max(80)).max(81).optional(),
  group: z.enum(["line", "row", "column", "diagonal", "corners", "blackout"]).optional(),
});

export const playerNameSchema = z.string().trim().min(LIMITS.playerNameMin).max(LIMITS.playerNameMax);

export const textItemSchema = z.string().trim().min(1).max(LIMITS.textItemMax);

export function defaultSlotLabels(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Game ${i + 1}`);
}

export function defaultSettings(): GameSettings {
  return {
    rows: DEFAULTS.rows,
    cols: DEFAULTS.cols,
    freeSpace: { enabled: true, row: 2, col: 2 },
    boardsPerSheet: DEFAULTS.boardsPerSheet,
  };
}

export function defaultPrintLayout(boardsPerSheet: number = DEFAULTS.boardsPerSheet): PrintLayout {
  return {
    heading: "",
    slotLabels: defaultSlotLabels(boardsPerSheet),
    infoText: "",
    paperSize: "A4",
    orientation: "landscape",
    arrangement: boardsPerSheet === 1 ? "single" : "row",
    marginMm: DEFAULTS.marginMm,
  };
}

export const roundOptionsSchema = z.object({
  medium: z.enum(["paper", "digital"]),
  mode: z.enum(["central", "self"]),
  /** Default: next unplayed slot. */
  slot: z.number().int().min(0).max(LIMITS.boardsPerSheetMax - 1).optional(),
  verification: z.enum(["auto", "host"]).default("auto"),
  patterns: z.array(patternSchema).min(LIMITS.patternsPerRoundMin).max(LIMITS.patternsPerRoundMax).default(DEFAULT_PATTERNS),
  boardsPerPlayer: z.number().int().min(LIMITS.sheetsPerPlayerMin).max(LIMITS.sheetsPerPlayerMax).default(DEFAULTS.sheetsPerPlayer),
  autoMark: z.boolean().default(false),
  onWin: z.enum(["continue", "end"]).default("continue"),
  autoDrawIntervalSec: z.number().int().min(LIMITS.autoDrawMinSec).max(LIMITS.autoDrawMaxSec).default(DEFAULTS.autoDrawIntervalSec),
});
export type RoundOptions = z.input<typeof roundOptionsSchema>;
