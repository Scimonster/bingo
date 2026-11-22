import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  anon,
  db,
  DISPLAY,
  gameData,
  host,
  OTHER_HOST,
  OWNER,
  paths,
  PLAYER,
  printLayout,
  seed,
  seedWorld,
  settings,
  setupEnv,
  STRANGER,
} from "./helpers";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await setupEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

function newGame(overrides: Record<string, unknown> = {}) {
  return { ...gameData(overrides), createdAt: serverTimestamp(), ...overrides };
}

const pattern = (i: number) => ({ id: `p${i}`, name: `Pattern ${i}`, cells: [0, 6, 12] });

describe("games: create", () => {
  let seq = 0;
  const create = (uid: string, data: Record<string, unknown>, anonymous = false) => {
    const ctx = anonymous ? anon(env, uid) : host(env, uid);
    return setDoc(doc(db(ctx), `games/new${++seq}`), data);
  };

  it("allows a signed-in host to create a valid game", async () => {
    await assertSucceeds(create(OWNER, newGame()));
  });

  it("allows optional customPatterns and free-space content", async () => {
    await assertSucceeds(
      create(
        OWNER,
        newGame({
          customPatterns: [pattern(1), pattern(2)],
          settings: settings({
            freeSpace: { enabled: true, row: 0, col: 4, content: { type: "image", storagePath: "users/owner/images/x", text: "Hi" } },
          }),
        }),
      ),
    );
  });

  it("accepts a maximal game (20 patterns, full layout, free-space image) within the expression budget", async () => {
    await assertSucceeds(
      create(
        OWNER,
        newGame({
          customPatterns: Array.from({ length: 20 }, (_, i) => ({ ...pattern(i), cells: Array.from({ length: 81 }, (_, c) => c) })),
          settings: settings({
            rows: 9,
            cols: 9,
            boardsPerSheet: 4,
            freeSpace: { enabled: true, row: 4, col: 4, content: { type: "image", storagePath: "users/owner/images/x", text: "Free" } },
          }),
          printLayout: printLayout({
            heading: "H",
            slotLabels: ["a", "b", "c", "d"],
            infoText: "x".repeat(3000),
            arrangement: "grid",
            infoMode: "image",
            infoImage: "users/owner/images/info",
            infoImageFit: "cover",
            backgroundColor: "#ffeeaa",
            backgroundImage: "users/owner/images/bg",
            backgroundOpacity: 0.5,
          }),
        }),
      ),
    );
  });

  it("accepts the grid and boards-per-sheet bounds", async () => {
    await assertSucceeds(create(OWNER, newGame({ settings: settings({ rows: 3, cols: 9, boardsPerSheet: 1, freeSpace: { enabled: false, row: 0, col: 0 } }) })));
    await assertSucceeds(create(OWNER, newGame({ settings: settings({ rows: 9, cols: 3, boardsPerSheet: 4, freeSpace: { enabled: true, row: 8, col: 2 } }) })));
  });

  it("denies anonymous users", async () => {
    await assertFails(create(PLAYER, newGame({ ownerId: PLAYER }), true));
  });

  it("denies unauthenticated users", async () => {
    await assertFails(setDoc(doc(db(env.unauthenticatedContext()), "games/new"), newGame()));
  });

  it("denies creating a game for someone else", async () => {
    await assertFails(create(OTHER_HOST, newGame()));
  });

  it("requires createdAt to be the server timestamp", async () => {
    await assertFails(create(OWNER, { ...newGame(), createdAt: 12345 }));
  });

  it("denies Function-only fields", async () => {
    await assertFails(create(OWNER, newGame({ contentLocked: false })));
    await assertFails(create(OWNER, newGame({ clonedFrom: "g0" })));
    await assertFails(create(OWNER, newGame({ extra: 1 })));
  });

  it("denies missing required keys", async () => {
    const { printLayout: _omit, ...rest } = newGame();
    void _omit;
    await assertFails(create(OWNER, rest));
  });

  it("validates title", async () => {
    await assertFails(create(OWNER, newGame({ title: "" })));
    await assertFails(create(OWNER, newGame({ title: "x".repeat(101) })));
    await assertSucceeds(create(OWNER, newGame({ title: "x".repeat(100) })));
    await assertFails(create(OWNER, newGame({ title: 5 })));
  });

  it("validates playerLanguage", async () => {
    await assertSucceeds(create(OWNER, newGame({ playerLanguage: "en" })));
    await assertFails(create(OWNER, newGame({ playerLanguage: "fr" })));
  });

  it("validates grid size and boards per sheet", async () => {
    await assertFails(create(OWNER, newGame({ settings: settings({ rows: 2 }) })));
    await assertFails(create(OWNER, newGame({ settings: settings({ cols: 10 }) })));
    await assertFails(create(OWNER, newGame({ settings: settings({ rows: 4.5 }) })));
    await assertFails(create(OWNER, newGame({ settings: settings({ boardsPerSheet: 0 }) })));
    await assertFails(create(OWNER, newGame({ settings: settings({ boardsPerSheet: 5 }) })));
    await assertFails(create(OWNER, newGame({ settings: { ...settings(), extra: true } })));
  });

  it("requires the free space inside the grid", async () => {
    await assertFails(create(OWNER, newGame({ settings: settings({ freeSpace: { enabled: true, row: 5, col: 0 } }) })));
    await assertFails(create(OWNER, newGame({ settings: settings({ freeSpace: { enabled: true, row: 0, col: 5 } }) })));
    await assertFails(create(OWNER, newGame({ settings: settings({ freeSpace: { enabled: true, row: -1, col: 0 } }) })));
    await assertFails(create(OWNER, newGame({ settings: settings({ freeSpace: { enabled: "yes", row: 0, col: 0 } }) })));
    await assertFails(
      create(OWNER, newGame({ settings: settings({ freeSpace: { enabled: true, row: 0, col: 0, content: { type: "video" } } }) })),
    );
    await assertFails(
      create(
        OWNER,
        newGame({ settings: settings({ freeSpace: { enabled: true, row: 0, col: 0, content: { type: "image", storagePath: "elsewhere/x" } } }) }),
      ),
    );
  });

  it("validates the print layout", async () => {
    await assertSucceeds(create(OWNER, newGame({ printLayout: printLayout({ infoText: "x".repeat(3000) }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ infoText: "x".repeat(3001) }) })));
    await assertSucceeds(create(OWNER, newGame({ printLayout: printLayout({ infoMode: "text", infoImageFit: "contain" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ infoMode: "html" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ infoImage: "https://evil.test/x.png" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ infoImageFit: "stretch" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ slotLabels: ["a", "b", "c", "d", "e"] }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ slotLabels: ["a", "x".repeat(41)] }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ slotLabels: ["a", 7] }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ heading: "x".repeat(121) }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ paperSize: "B5" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ orientation: "sideways" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ arrangement: "circle" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ marginMm: 31 }) })));
    await assertSucceeds(create(OWNER, newGame({ printLayout: printLayout({ marginMm: 7.5 }) })));
    const { heading: _h, ...noHeading } = printLayout();
    void _h;
    await assertSucceeds(create(OWNER, newGame({ printLayout: noHeading })));
  });

  it("validates print layout order, QR, stretch and background", async () => {
    await assertSucceeds(
      create(OWNER, newGame({ printLayout: printLayout({ order: [-1, 2, 0, 1], showQr: false, stretch: true, backgroundColor: "#AABBCC", backgroundImage: "users/u/images/bg", backgroundOpacity: 0.5 }) })),
    );
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ order: [0, 1, 2, 3, 4, 5] }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ showQr: "no" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ stretch: 1 }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ backgroundColor: "red" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ backgroundImage: "elsewhere/x" }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ backgroundOpacity: 0 }) })));
    await assertFails(create(OWNER, newGame({ printLayout: printLayout({ backgroundOpacity: 1.5 }) })));
  });

  it("limits custom patterns to a list of at most 20", async () => {
    await assertSucceeds(create(OWNER, newGame({ customPatterns: Array.from({ length: 20 }, (_, i) => pattern(i)) })));
    await assertFails(create(OWNER, newGame({ customPatterns: Array.from({ length: 21 }, (_, i) => pattern(i)) })));
    await assertFails(create(OWNER, newGame({ customPatterns: "nope" })));
  });
});

describe("games: read", () => {
  beforeEach(async () => {
    await seedWorld(env);
    await seed(env, { "games/g2": gameData({ ownerId: OTHER_HOST }) });
  });

  it("lets the owner get the game", async () => {
    await assertSucceeds(getDoc(doc(db(host(env, OWNER)), paths.game)));
  });

  it("lets members (player and display) get the game", async () => {
    await assertSucceeds(getDoc(doc(db(anon(env, PLAYER)), paths.game)));
    await assertSucceeds(getDoc(doc(db(anon(env, DISPLAY)), paths.game)));
  });

  it("denies strangers and other hosts", async () => {
    await assertFails(getDoc(doc(db(anon(env, STRANGER)), paths.game)));
    await assertFails(getDoc(doc(db(host(env, OTHER_HOST)), paths.game)));
    await assertFails(getDoc(doc(db(env.unauthenticatedContext()), paths.game)));
  });

  it("allows the owner's games query", async () => {
    const fs = db(host(env, OWNER));
    await assertSucceeds(getDocs(query(collection(fs, "games"), where("ownerId", "==", OWNER))));
    await assertSucceeds(getDocs(query(collection(fs, "games"), where("ownerId", "==", OWNER), orderBy("createdAt", "desc"))));
  });

  it("denies listing all games or someone else's", async () => {
    const fs = db(host(env, OWNER));
    await assertFails(getDocs(collection(fs, "games")));
    await assertFails(getDocs(query(collection(fs, "games"), where("ownerId", "==", OTHER_HOST))));
    await assertFails(getDocs(collection(db(anon(env, PLAYER)), "games")));
  });
});

describe("games: update and delete", () => {
  beforeEach(async () => {
    await seedWorld(env);
  });
  const ownerGame = () => doc(db(host(env, OWNER)), paths.game);

  it("lets the owner change title, language, settings, print layout and custom patterns", async () => {
    await assertSucceeds(updateDoc(ownerGame(), { title: "New title" }));
    await assertSucceeds(updateDoc(ownerGame(), { playerLanguage: "en" }));
    await assertSucceeds(updateDoc(ownerGame(), { settings: settings({ rows: 4, cols: 4, freeSpace: { enabled: false, row: 0, col: 0 } }) }));
    await assertSucceeds(updateDoc(ownerGame(), { "printLayout.infoText": "# Hello\n\n{center} ![m](users/owner/images/x)" }));
    await assertSucceeds(updateDoc(ownerGame(), { "printLayout.infoMode": "image", "printLayout.infoImage": "users/owner/images/x" }));
    await assertSucceeds(updateDoc(ownerGame(), { customPatterns: [pattern(1)] }));
  });

  it("validates changed values", async () => {
    await assertFails(updateDoc(ownerGame(), { title: "" }));
    await assertFails(updateDoc(ownerGame(), { "settings.rows": 10 }));
    await assertFails(updateDoc(ownerGame(), { "settings.freeSpace.row": 5 }));
    await assertFails(updateDoc(ownerGame(), { "printLayout.infoText": "x".repeat(3001) }));
    await assertFails(updateDoc(ownerGame(), { "printLayout.infoMode": 1 }));
    await assertFails(updateDoc(ownerGame(), { customPatterns: Array.from({ length: 21 }, (_, i) => pattern(i)) }));
  });

  it("denies Function-only and unknown keys", async () => {
    await assertFails(updateDoc(ownerGame(), { contentLocked: true }));
    await assertFails(updateDoc(ownerGame(), { clonedFrom: "g0" }));
    await assertFails(updateDoc(ownerGame(), { ownerId: OTHER_HOST }));
    await assertFails(updateDoc(ownerGame(), { createdAt: 5 }));
    await assertFails(updateDoc(ownerGame(), { extra: 1 }));
  });

  it("denies non-owners", async () => {
    await assertFails(updateDoc(doc(db(host(env, OTHER_HOST)), paths.game), { title: "Mine" }));
    await assertFails(updateDoc(doc(db(anon(env, PLAYER)), paths.game), { title: "Mine" }));
  });

  it("denies delete, even by the owner", async () => {
    await assertFails(deleteDoc(ownerGame()));
  });

  describe("once contentLocked", () => {
    beforeEach(async () => {
      await seed(env, { [paths.game]: gameData({ contentLocked: true }) });
    });

    it("freezes the board shape", async () => {
      await assertFails(updateDoc(ownerGame(), { "settings.rows": 4 }));
      await assertFails(updateDoc(ownerGame(), { "settings.cols": 4 }));
      await assertFails(updateDoc(ownerGame(), { "settings.boardsPerSheet": 2 }));
      await assertFails(updateDoc(ownerGame(), { "settings.freeSpace.enabled": false }));
      await assertFails(updateDoc(ownerGame(), { "settings.freeSpace.row": 0 }));
      await assertFails(updateDoc(ownerGame(), { "settings.freeSpace.col": 0 }));
    });

    it("keeps free-space content, title, language, layout and patterns editable", async () => {
      await assertSucceeds(updateDoc(ownerGame(), { "settings.freeSpace.content": { type: "text", text: "FREE!" } }));
      await assertSucceeds(updateDoc(ownerGame(), { settings: settings() }));
      await assertSucceeds(updateDoc(ownerGame(), { title: "Renamed" }));
      await assertSucceeds(updateDoc(ownerGame(), { playerLanguage: "en" }));
      await assertSucceeds(updateDoc(ownerGame(), { printLayout: printLayout({ orientation: "portrait", arrangement: "column" }) }));
      await assertSucceeds(updateDoc(ownerGame(), { customPatterns: [pattern(3)] }));
    });

    it("does not let the owner unlock", async () => {
      await assertFails(updateDoc(ownerGame(), { contentLocked: false }));
    });
  });

});
