export type Lang = "he" | "en";
export type PaperSize = "A5" | "A4" | "A3" | "Letter" | "Legal" | "Tabloid";
export type Orientation = "portrait" | "landscape";
export type Arrangement = "row" | "column" | "grid" | "single";
export type Medium = "paper" | "digital";
export type Mode = "central" | "self";
export type SessionStatus = "lobby" | "live" | "paused" | "ended";
export type Verification = "auto" | "host";
export type OnWin = "continue" | "end";
export type ClaimStatus = "pending" | "valid" | "invalid";

export interface CellContent {
  type: "text" | "image";
  text?: string;
  /** Storage folder of a resized image: users/{uid}/images/{imageId} (holds thumb.webp and print.webp). */
  storagePath?: string;
}

export interface FreeSpace {
  enabled: boolean;
  row: number;
  col: number;
  content?: CellContent;
}

export interface GameSettings {
  rows: number;
  cols: number;
  freeSpace: FreeSpace;
  boardsPerSheet: number;
}

export interface PrintLayout {
  heading?: string;
  slotLabels: string[];
  /** Sanitized Markdown subset: bold, italic, lists, line breaks. */
  infoText: string;
  paperSize: PaperSize;
  orientation: Orientation;
  arrangement: Arrangement;
  marginMm: number;
}

/**
 * A win pattern. Either a fixed set of cell indices (`cells`), or a built-in group that
 * expands to several alternatives for the game's grid (`group`, e.g. "line" = any row,
 * any column or either diagonal).
 */
export interface Pattern {
  id: string;
  name: string;
  cells?: number[];
  group?: PatternGroup;
}

export type PatternGroup = "line" | "row" | "column" | "diagonal" | "corners" | "blackout";

export interface Game {
  ownerId: string;
  title: string;
  createdAt?: unknown;
  playerLanguage: Lang;
  settings: GameSettings;
  printLayout: PrintLayout;
  /** Host-drawn custom patterns, reusable across rounds. */
  customPatterns?: Pattern[];
  contentLocked?: boolean;
  clonedFrom?: string;
}

export interface Item extends CellContent {
  id: string;
  createdAt?: unknown;
}

export interface Sheet {
  serial: number;
  boardIds: string[];
}

export interface Board {
  sheetSerial: number;
  slot: number;
  /** Flattened rows × cols; item IDs or FREE. */
  cells: string[];
  fingerprint: string;
}

export interface Draw {
  itemId: string;
  at: number;
}

export interface Winner {
  name: string;
  serial: string;
  pattern: string;
  patternId: string | null;
  claimId: string;
  at: number;
}

export interface Session {
  medium: Medium;
  mode: Mode;
  sheetSlot: number;
  status: SessionStatus;
  verification: Verification;
  boardsPerPlayer: number;
  autoMark: boolean;
  onWin: OnWin;
  patterns: Pattern[];
  autoDraw: { enabled: boolean; intervalSec: number; nextDrawAt?: number | null };
  draws: Draw[];
  /** serial (zero-padded) → uid */
  assignments: Record<string, string>;
  winners: Winner[];
  summary?: { drawCount: number; playerCount: number; durationSec: number };
  joinCode?: string | null;
  createdAt?: number;
  startedAt?: number | null;
  endedAt?: number | null;
  lastActivityAt?: number;
  totalItems?: number;
  waitingCount?: number;
  pendingClaims?: number;
}

export interface Player {
  name: string;
  sheets: string[];
  marks: Record<string, number[]>;
  waitingForSheets: number;
  joinedAt: number;
  expireAt?: unknown;
}

export interface Claim {
  serial: string;
  uid: string | null;
  playerName: string;
  matchedPattern: string | null;
  matchedPatternIds: string[];
  computedValid: boolean;
  status: ClaimStatus;
  drawCount: number;
  createdAt: number;
  decidedAt: number | null;
  byHost: boolean;
}

export interface Member {
  sessions: Record<string, "player" | "display">;
  expireAt?: unknown;
}
