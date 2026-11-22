import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  anon,
  claimData,
  db,
  DISPLAY,
  host,
  OTHER_HOST,
  OTHER_SESSION,
  OWNER,
  paths,
  PLAYER,
  playerData,
  PLAYER2,
  seed,
  seedWorld,
  SESSION,
  sessionData,
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
  await seedWorld(env);
});

const G = paths.game;
const S = paths.session;

describe("sessions: read", () => {
  it("owner can get and list sessions", async () => {
    await assertSucceeds(getDoc(doc(db(host(env, OWNER)), S)));
    await assertSucceeds(getDocs(collection(db(host(env, OWNER)), `${G}/sessions`)));
  });

  it("members can get the rounds they joined", async () => {
    await assertSucceeds(getDoc(doc(db(anon(env, PLAYER)), S)));
    await assertSucceeds(getDoc(doc(db(anon(env, DISPLAY)), S)));
    await assertSucceeds(getDoc(doc(db(anon(env, PLAYER2)), paths.otherSession)));
  });

  it("a player cannot read another round's session", async () => {
    await assertFails(getDoc(doc(db(anon(env, PLAYER)), paths.otherSession)));
    await assertFails(getDoc(doc(db(anon(env, DISPLAY)), paths.otherSession)));
  });

  it("members cannot list sessions; strangers cannot read", async () => {
    await assertFails(getDocs(collection(db(anon(env, PLAYER)), `${G}/sessions`)));
    await assertFails(getDoc(doc(db(anon(env, STRANGER)), S)));
    await assertFails(getDoc(doc(db(host(env, OTHER_HOST)), S)));
  });
});

describe("sessions: write", () => {
  const ownerSession = () => doc(db(host(env, OWNER)), S);

  it("owner cannot create or delete sessions", async () => {
    await assertFails(setDoc(doc(db(host(env, OWNER)), `${G}/sessions/new`), sessionData()));
    await assertFails(deleteDoc(ownerSession()));
  });

  it("legal status transitions: lobby→live→paused→live", async () => {
    await assertSucceeds(updateDoc(ownerSession(), { status: "live" }));
    await assertSucceeds(updateDoc(ownerSession(), { status: "paused" }));
    await assertSucceeds(updateDoc(ownerSession(), { status: "live" }));
  });

  it("illegal status transitions", async () => {
    await assertFails(updateDoc(ownerSession(), { status: "paused" })); // lobby→paused
    await assertFails(updateDoc(ownerSession(), { status: "ended" })); // lobby→ended
    await assertFails(updateDoc(ownerSession(), { status: "bogus" }));
    await seed(env, { [S]: sessionData({ status: "live" }) });
    await assertFails(updateDoc(ownerSession(), { status: "ended" }));
    await assertFails(updateDoc(ownerSession(), { status: "lobby" }));
    await seed(env, { [S]: sessionData({ status: "paused" }) });
    await assertFails(updateDoc(ownerSession(), { status: "ended" }));
    await assertFails(updateDoc(ownerSession(), { status: "lobby" }));
  });

  it("owner can change round settings within range", async () => {
    await assertSucceeds(updateDoc(ownerSession(), { "autoDraw.enabled": true, "autoDraw.intervalSec": 5 }));
    await assertSucceeds(updateDoc(ownerSession(), { "autoDraw.intervalSec": 300 }));
    await assertSucceeds(
      updateDoc(ownerSession(), {
        patterns: [
          { id: "corners", name: "Corners", group: "corners" },
          { id: "c1", name: "Custom", cells: [0, 4, 20, 24] },
        ],
      }),
    );
    await assertSucceeds(
      updateDoc(ownerSession(), {
        patterns: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `Custom ${i}`, cells: [0, 1, 2, 3, 4], group: "row" })),
        status: "live",
        "autoDraw.enabled": true,
        verification: "host",
        boardsPerPlayer: 2,
        autoMark: true,
        onWin: "end",
      }),
    );
    await assertSucceeds(updateDoc(ownerSession(), { verification: "host" }));
    await assertSucceeds(updateDoc(ownerSession(), { boardsPerPlayer: 10 }));
    await assertSucceeds(updateDoc(ownerSession(), { autoMark: true }));
    await assertSucceeds(updateDoc(ownerSession(), { onWin: "end" }));
    await assertSucceeds(updateDoc(ownerSession(), { screenClaim: { claimId: "c1", serial: "004" } }));
    await assertSucceeds(updateDoc(ownerSession(), { screenClaim: null }));
    await assertSucceeds(updateDoc(ownerSession(), { autoShowClaims: false }));
  });

  it("rejects out-of-range values", async () => {
    await assertFails(updateDoc(ownerSession(), { "autoDraw.intervalSec": 4 }));
    await assertFails(updateDoc(ownerSession(), { "autoDraw.intervalSec": 301 }));
    await assertFails(updateDoc(ownerSession(), { "autoDraw.enabled": "yes" }));
    await assertFails(updateDoc(ownerSession(), { patterns: [] }));
    await assertFails(
      updateDoc(ownerSession(), { patterns: Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, name: "P", group: "line" })) }),
    );
    await assertFails(updateDoc(ownerSession(), { patterns: [{ id: "x", name: "No shape" }] }));
    await assertFails(updateDoc(ownerSession(), { patterns: [{ id: "x", name: "Bad", cells: "0,1" }] }));
    await assertFails(updateDoc(ownerSession(), { patterns: [{ id: 1, name: "Bad", group: "row" }] }));
    await assertFails(updateDoc(ownerSession(), { patterns: [{ id: "x", name: "Bad", group: "row", extra: true }] }));
    await assertFails(updateDoc(ownerSession(), { patterns: [{ name: "No id", group: "row" }] }));
    await assertFails(updateDoc(ownerSession(), { patterns: "line" }));
    await assertFails(updateDoc(ownerSession(), { verification: "none" }));
    await assertFails(updateDoc(ownerSession(), { boardsPerPlayer: 0 }));
    await assertFails(updateDoc(ownerSession(), { boardsPerPlayer: 11 }));
    await assertFails(updateDoc(ownerSession(), { autoMark: 1 }));
    await assertFails(updateDoc(ownerSession(), { onWin: "explode" }));
    await assertFails(updateDoc(ownerSession(), { screenClaim: "c1" }));
    await assertFails(updateDoc(ownerSession(), { screenClaim: { claimId: "c1" } }));
    await assertFails(updateDoc(ownerSession(), { screenClaim: { claimId: "c1", serial: "004", extra: 1 } }));
    await assertFails(updateDoc(ownerSession(), { screenClaim: { claimId: "", serial: "004" } }));
    await assertFails(updateDoc(ownerSession(), { autoShowClaims: "yes" }));
  });

  it("rejects Function-only fields", async () => {
    await assertFails(updateDoc(ownerSession(), { "autoDraw.nextDrawAt": Date.now() }));
    await assertFails(updateDoc(ownerSession(), { draws: [{ itemId: "i1", at: 1 }] }));
    await assertFails(updateDoc(ownerSession(), { assignments: {} }));
    await assertFails(updateDoc(ownerSession(), { winners: [{ name: "x", serial: "001", pattern: "Line", patternId: "line", claimId: "c1", at: 1 }] }));
    await assertFails(updateDoc(ownerSession(), { medium: "paper" }));
    await assertFails(updateDoc(ownerSession(), { mode: "self" }));
    await assertFails(updateDoc(ownerSession(), { sheetSlot: 1 }));
    await assertFails(updateDoc(ownerSession(), { pendingClaims: 1, status: "live" }));
    await assertFails(updateDoc(ownerSession(), { summary: { drawCount: 0, playerCount: 0, durationSec: 0 } }));
  });

  it("nothing is writable once the round has ended", async () => {
    await seed(env, { [S]: sessionData({ status: "ended" }) });
    await assertFails(updateDoc(ownerSession(), { status: "live" }));
    await assertFails(updateDoc(ownerSession(), { autoMark: true }));
    await assertFails(updateDoc(ownerSession(), { "autoDraw.enabled": false }));
  });

  it("non-owners cannot update the session", async () => {
    await assertFails(updateDoc(doc(db(anon(env, PLAYER)), S), { status: "live" }));
    await assertFails(updateDoc(doc(db(anon(env, DISPLAY)), S), { screenClaim: null }));
    await assertFails(updateDoc(doc(db(anon(env, DISPLAY)), S), { status: "live" }));
    await assertFails(updateDoc(doc(db(host(env, OTHER_HOST)), S), { status: "live" }));
  });
});

describe("private", () => {
  it("never readable or writable", async () => {
    for (const ctx of [host(env, OWNER), anon(env, PLAYER), anon(env, DISPLAY)]) {
      await assertFails(getDoc(doc(db(ctx), `${S}/private/drawState`)));
      await assertFails(getDoc(doc(db(ctx), `${S}/private/display`)));
      await assertFails(getDocs(collection(db(ctx), `${S}/private`)));
    }
    await assertFails(setDoc(doc(db(host(env, OWNER)), `${S}/private/drawState`), { remaining: [] }));
  });
});

describe("players: read", () => {
  it("owner and display can list players", async () => {
    await assertSucceeds(getDocs(collection(db(host(env, OWNER)), `${S}/players`)));
    await assertSucceeds(getDocs(collection(db(anon(env, DISPLAY)), `${S}/players`)));
  });

  it("a player can read only their own doc", async () => {
    await assertSucceeds(getDoc(doc(db(anon(env, PLAYER)), paths.player(PLAYER))));
    await assertFails(getDoc(doc(db(anon(env, PLAYER)), paths.player(PLAYER2))));
    await assertFails(getDocs(collection(db(anon(env, PLAYER)), `${S}/players`)));
  });

  it("a display of another round cannot list this round's players", async () => {
    await seed(env, { [`${G}/members/${DISPLAY}`]: { sessions: { [OTHER_SESSION]: "display", [SESSION]: "player" } } });
    await assertFails(getDocs(collection(db(anon(env, DISPLAY)), `${S}/players`)));
  });

  it("strangers cannot read players", async () => {
    await assertFails(getDocs(collection(db(anon(env, STRANGER)), `${S}/players`)));
    await assertFails(getDoc(doc(db(host(env, OTHER_HOST)), paths.player(PLAYER))));
  });
});

describe("players: write", () => {
  const self = () => doc(db(anon(env, PLAYER)), paths.player(PLAYER));

  it("player can update own name and marks on own sheets", async () => {
    await assertSucceeds(updateDoc(self(), { name: "Dana B" }));
    await assertSucceeds(updateDoc(self(), { marks: { "001": [0, 5, 12] } }));
    await assertSucceeds(updateDoc(self(), { "marks.001": [0, 5, 12, 13] }));
    await assertSucceeds(updateDoc(self(), { marks: {} }));
  });

  it("handles the maximum of 10 sheets within the expression budget", async () => {
    const sheets = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(3, "0"));
    await seed(env, { [paths.player(PLAYER)]: playerData({ sheets }) });
    const marks = Object.fromEntries(sheets.map((sh) => [sh, Array.from({ length: 81 }, (_, c) => c)]));
    await assertSucceeds(updateDoc(self(), { name: "Max", marks }));
    await assertFails(updateDoc(self(), { marks: { ...marks, "011": [1] } }));
  });

  it("player cannot mark a sheet they don't hold", async () => {
    await assertFails(updateDoc(self(), { marks: { "002": [1] } }));
    await assertFails(updateDoc(self(), { "marks.002": [1] }));
    await assertFails(updateDoc(self(), { marks: { "001": [1], "003": [2] } }));
  });

  it("validates name and mark values", async () => {
    await assertFails(updateDoc(self(), { name: "" }));
    await assertFails(updateDoc(self(), { name: "x".repeat(31) }));
    await assertSucceeds(updateDoc(self(), { name: "x".repeat(30) }));
    await assertFails(updateDoc(self(), { marks: { "001": "all" } }));
    await assertFails(updateDoc(self(), { marks: { "001": Array.from({ length: 82 }, (_, i) => i) } }));
    await assertFails(updateDoc(self(), { marks: ["001"] }));
  });

  it("player cannot change Function-only fields", async () => {
    await assertFails(updateDoc(self(), { sheets: ["001", "002"] }));
    await assertFails(updateDoc(self(), { waitingForSheets: 1, name: "x" }));
    await assertFails(updateDoc(self(), { joinedAt: 5 }));
    await assertFails(updateDoc(self(), { expireAt: null }));
  });

  it("player cannot create, delete, or touch another player's doc", async () => {
    await assertFails(setDoc(doc(db(anon(env, STRANGER)), paths.player(STRANGER)), { name: "x", sheets: [], marks: {} }));
    await assertFails(deleteDoc(self()));
    await assertFails(updateDoc(doc(db(anon(env, PLAYER)), paths.player(PLAYER2)), { name: "Hacked" }));
    await assertFails(updateDoc(doc(db(anon(env, PLAYER)), paths.player(PLAYER2)), { marks: {} }));
  });

  it("owner can rename but not mark or reassign", async () => {
    const owned = doc(db(host(env, OWNER)), paths.player(PLAYER));
    await assertSucceeds(updateDoc(owned, { name: "Renamed" }));
    await assertFails(updateDoc(owned, { name: "" }));
    await assertFails(updateDoc(owned, { marks: { "001": [1] } }));
    await assertFails(updateDoc(owned, { sheets: ["002"] }));
    await assertFails(deleteDoc(owned));
  });

  it("display and other hosts cannot write players", async () => {
    await assertFails(updateDoc(doc(db(anon(env, DISPLAY)), paths.player(PLAYER)), { name: "x" }));
    await assertFails(updateDoc(doc(db(host(env, OTHER_HOST)), paths.player(PLAYER)), { name: "x" }));
  });
});

describe("claims", () => {
  it("owner and display can list all claims", async () => {
    await assertSucceeds(getDocs(collection(db(host(env, OWNER)), `${S}/claims`)));
    await assertSucceeds(getDocs(collection(db(anon(env, DISPLAY)), `${S}/claims`)));
  });

  it("a player can query and get their own claims", async () => {
    const fs = db(anon(env, PLAYER));
    await assertSucceeds(getDocs(query(collection(fs, `${S}/claims`), where("uid", "==", PLAYER))));
    await assertSucceeds(getDoc(doc(fs, paths.claim("c1"))));
  });

  it("a player cannot read others' claims", async () => {
    const fs = db(anon(env, PLAYER));
    await assertFails(getDocs(collection(fs, `${S}/claims`)));
    await assertFails(getDocs(query(collection(fs, `${S}/claims`), where("uid", "==", PLAYER2))));
    await assertFails(getDoc(doc(fs, paths.claim("c2"))));
    await assertFails(getDoc(doc(fs, paths.claim("c3"))));
  });

  it("strangers cannot read claims", async () => {
    await assertFails(getDocs(collection(db(host(env, OTHER_HOST)), `${S}/claims`)));
    await assertFails(getDoc(doc(db(anon(env, STRANGER)), paths.claim("c1"))));
  });

  it("nobody can write claims", async () => {
    await assertFails(setDoc(doc(db(anon(env, PLAYER)), paths.claim("new")), claimData({ status: "valid" })));
    await assertFails(updateDoc(doc(db(anon(env, PLAYER)), paths.claim("c1")), { status: "valid" }));
    await assertFails(updateDoc(doc(db(host(env, OWNER)), paths.claim("c1")), { status: "valid" }));
    await assertFails(deleteDoc(doc(db(host(env, OWNER)), paths.claim("c1"))));
  });
});
