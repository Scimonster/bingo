import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp, type Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";

export const PROJECT_ID = "demo-bingo";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function hostPort(envVar: string, fallbackPort: number): { host: string; port: number } {
  const value = process.env[envVar];
  if (value) {
    const idx = value.lastIndexOf(":");
    return { host: value.slice(0, idx), port: Number(value.slice(idx + 1)) };
  }
  return { host: "127.0.0.1", port: fallbackPort };
}

export async function setupEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(ROOT, "firestore.rules"), "utf8"),
      ...hostPort("FIRESTORE_EMULATOR_HOST", 8080),
    },
    storage: {
      rules: readFileSync(resolve(ROOT, "storage.rules"), "utf8"),
      ...hostPort("FIREBASE_STORAGE_EMULATOR_HOST", 9199),
    },
  });
}

// ---------------------------------------------------------------- identities

export const OWNER = "owner";
export const OTHER_HOST = "otherHost";
export const PLAYER = "player1";
export const PLAYER2 = "player2";
export const DISPLAY = "display1";
export const STRANGER = "stranger";
export const ADMIN = "siteAdmin";

export const GAME = "g1";
export const SESSION = "s1";
export const OTHER_SESSION = "s0";

export function host(env: RulesTestEnvironment, uid: string): RulesTestContext {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: "google.com" } });
}

/** A host with the site-admin custom claim (admin: true). */
export function admin(env: RulesTestEnvironment, uid = ADMIN): RulesTestContext {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: "google.com" }, admin: true });
}

export function anon(env: RulesTestEnvironment, uid: string): RulesTestContext {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } });
}

export function db(ctx: RulesTestContext): Firestore {
  return ctx.firestore() as unknown as Firestore;
}

export function bucket(ctx: RulesTestContext): FirebaseStorage {
  return ctx.storage() as unknown as FirebaseStorage;
}

// ---------------------------------------------------------------- fixtures

export function settings(overrides: Record<string, unknown> = {}) {
  return {
    rows: 5,
    cols: 5,
    freeSpace: { enabled: true, row: 2, col: 2 },
    boardsPerSheet: 3,
    ...overrides,
  };
}

export function printLayout(overrides: Record<string, unknown> = {}) {
  return {
    heading: "",
    slotLabels: ["Game 1", "Game 2", "Game 3"],
    infoText: "",
    paperSize: "A4",
    orientation: "landscape",
    arrangement: "row",
    marginMm: 10,
    ...overrides,
  };
}

/** A game doc as stored (createdAt as a plain number for seeding). */
export function gameData(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: OWNER,
    title: "Party bingo",
    createdAt: 1,
    playerLanguage: "he",
    settings: settings(),
    printLayout: printLayout(),
    ...overrides,
  };
}

export function sessionData(overrides: Record<string, unknown> = {}) {
  return {
    medium: "digital",
    mode: "central",
    sheetSlot: 0,
    status: "lobby",
    verification: "auto",
    boardsPerPlayer: 1,
    autoMark: false,
    onWin: "continue",
    patterns: [{ id: "line", name: "Line", group: "line" }],
    autoDraw: { enabled: false, intervalSec: 20, nextDrawAt: null },
    draws: [],
    assignments: { "001": PLAYER, "002": PLAYER2 },
    winners: [],
    joinCode: "ABCDEF",
    createdAt: 1,
    lastActivityAt: 1,
    totalItems: 30,
    waitingCount: 0,
    pendingClaims: 0,
    ...overrides,
  };
}

export function playerData(overrides: Record<string, unknown> = {}) {
  return {
    name: "Dana",
    sheets: ["001"],
    marks: {},
    waitingForSheets: 0,
    joinedAt: 1,
    ...overrides,
  };
}

export function claimData(overrides: Record<string, unknown> = {}) {
  return {
    serial: "001",
    uid: PLAYER,
    playerName: "Dana",
    matchedPattern: null,
    matchedPatternIds: [],
    computedValid: false,
    status: "invalid",
    drawCount: 3,
    createdAt: 1,
    decidedAt: 1,
    byHost: false,
    ...overrides,
  };
}

/** Writes documents with rules disabled. Keys are document paths. */
export async function seed(env: RulesTestEnvironment, docs: Record<string, Record<string, unknown>>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = db(ctx);
    for (const [path, data] of Object.entries(docs)) {
      await setDoc(doc(fs, path), data);
    }
  });
}

const g = `games/${GAME}`;
const s = `${g}/sessions/${SESSION}`;

/**
 * A standard world: an unlocked game owned by OWNER with two items, one sheet + board,
 * a lobby round s1 with PLAYER, PLAYER2 (players) and DISPLAY (display) as members, and an
 * older round s0 that only PLAYER2 joined.
 */
export async function seedWorld(env: RulesTestEnvironment, gameOverrides: Record<string, unknown> = {}) {
  const expireAt = Timestamp.fromMillis(Date.now() + 86_400_000);
  await seed(env, {
    [g]: gameData(gameOverrides),
    [`${g}/items/i1`]: { type: "text", text: "Cat", createdAt: 1 },
    [`${g}/items/i2`]: { type: "image", storagePath: `users/${OWNER}/images/img1`, createdAt: 1 },
    [`${g}/sheets/001`]: { serial: 1, boardIds: ["b001-0", "b001-1", "b001-2"] },
    [`${g}/boards/b001-0`]: { sheetSerial: 1, slot: 0, cells: [], fingerprint: "x" },
    [`${g}/members/${PLAYER}`]: { sessions: { [SESSION]: "player" } },
    [`${g}/members/${PLAYER2}`]: { sessions: { [SESSION]: "player", [OTHER_SESSION]: "player" } },
    [`${g}/members/${DISPLAY}`]: { sessions: { [SESSION]: "display" } },
    [s]: sessionData(),
    [`${g}/sessions/${OTHER_SESSION}`]: sessionData({ status: "ended" }),
    [`${s}/private/drawState`]: { remaining: ["i1", "i2"] },
    [`${s}/private/display`]: { tokenHash: "h", expiresAt: 1, used: false },
    [`${s}/players/${PLAYER}`]: playerData(),
    [`${s}/players/${PLAYER2}`]: playerData({ name: "Avi", sheets: ["002"] }),
    [`${s}/claims/c1`]: claimData(),
    [`${s}/claims/c2`]: claimData({ uid: PLAYER2, serial: "002", playerName: "Avi" }),
    [`${s}/claims/c3`]: claimData({ uid: null, serial: "003", playerName: "Paper", byHost: true }),
    [`joinCodes/ABCDEF`]: { gameId: GAME, sessionId: SESSION, open: true, expireAt },
  });
}

export const paths = {
  game: g,
  session: s,
  otherSession: `${g}/sessions/${OTHER_SESSION}`,
  item: (id: string) => `${g}/items/${id}`,
  player: (uid: string) => `${s}/players/${uid}`,
  claim: (id: string) => `${s}/claims/${id}`,
};
