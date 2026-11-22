import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import {
  admin,
  ADMIN,
  db,
  gameData,
  host,
  OTHER_HOST,
  OWNER,
  paths,
  PLAYER,
  seed,
  seedWorld,
  settings,
  setupEnv,
} from "./helpers";

// Site admins (custom claim admin == true) pass every owner check, on every game, but get
// nothing that owners don't have (private docs, join codes, Function-only writes).

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
  await seed(env, { "games/g2": gameData({ ownerId: OTHER_HOST, title: "Other host's game" }) });
});

const adminDb = () => db(admin(env));
/** Anonymous account that somehow carries the claim: must not count as an admin. */
const anonAdminDb = () => db(env.authenticatedContext("anonAdmin", { firebase: { sign_in_provider: "anonymous" }, admin: true }));
/** Host with admin == false. */
const notAdminDb = () => db(env.authenticatedContext("notAdmin", { firebase: { sign_in_provider: "google.com" }, admin: false }));

describe("admin: games", () => {
  it("can get and list every host's games", async () => {
    await assertSucceeds(getDoc(doc(adminDb(), paths.game)));
    await assertSucceeds(getDoc(doc(adminDb(), "games/g2")));
    await assertSucceeds(getDocs(collection(adminDb(), "games")));
  });

  it("non-admins cannot list every game", async () => {
    await assertFails(getDocs(collection(db(host(env, OWNER)), "games")));
    await assertFails(getDocs(collection(notAdminDb(), "games")));
    await assertFails(getDocs(collection(anonAdminDb(), "games")));
    await assertFails(getDoc(doc(anonAdminDb(), paths.game)));
  });

  it("can update another host's game, but not its owner or Function-only fields", async () => {
    await assertSucceeds(updateDoc(doc(adminDb(), paths.game), { title: "Renamed by admin" }));
    await assertFails(updateDoc(doc(adminDb(), paths.game), { ownerId: ADMIN }));
    await assertFails(updateDoc(doc(adminDb(), paths.game), { contentLocked: true }));
    await assertFails(updateDoc(doc(adminDb(), paths.game), { title: "" }));
    await assertFails(updateDoc(doc(anonAdminDb(), paths.game), { title: "Nope" }));
  });

  it("still cannot change the board shape of a locked game", async () => {
    await seed(env, { [paths.game]: gameData({ contentLocked: true }) });
    await assertFails(updateDoc(doc(adminDb(), paths.game), { settings: settings({ rows: 4 }) }));
  });

  it("creates games only as their own owner, and cannot delete games directly", async () => {
    await assertFails(
      setDoc(doc(adminDb(), "games/new"), { ...gameData({ ownerId: OWNER }), createdAt: serverTimestamp() }),
    );
    await assertSucceeds(
      setDoc(doc(adminDb(), "games/new"), { ...gameData({ ownerId: ADMIN }), createdAt: serverTimestamp() }),
    );
    await assertFails(deleteDoc(doc(adminDb(), paths.game)));
  });
});

describe("admin: content", () => {
  it("can read and edit items of another host's unlocked game", async () => {
    await assertSucceeds(getDocs(collection(adminDb(), `${paths.game}/items`)));
    await assertSucceeds(setDoc(doc(adminDb(), paths.item("i9")), { type: "text", text: "Dog", createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(adminDb(), paths.item("i1"))));
    await assertFails(setDoc(doc(anonAdminDb(), paths.item("i9")), { type: "text", text: "Dog", createdAt: serverTimestamp() }));
  });

  it("cannot edit items once the game is locked", async () => {
    await seed(env, { [paths.game]: gameData({ contentLocked: true }) });
    await assertFails(deleteDoc(doc(adminDb(), paths.item("i1"))));
  });

  it("can read sheets, boards and members but not write them", async () => {
    await assertSucceeds(getDoc(doc(adminDb(), `${paths.game}/sheets/001`)));
    await assertSucceeds(getDoc(doc(adminDb(), `${paths.game}/boards/b001-0`)));
    await assertSucceeds(getDoc(doc(adminDb(), `${paths.game}/members/${PLAYER}`)));
    await assertFails(setDoc(doc(adminDb(), `${paths.game}/sheets/002`), { serial: 2, boardIds: [] }));
  });
});

describe("admin: rounds", () => {
  it("can read and list rounds, players and claims of any game", async () => {
    await assertSucceeds(getDoc(doc(adminDb(), paths.session)));
    await assertSucceeds(getDocs(collection(adminDb(), `${paths.game}/sessions`)));
    await assertSucceeds(getDocs(collection(adminDb(), `${paths.session}/players`)));
    await assertSucceeds(getDocs(collection(adminDb(), `${paths.session}/claims`)));
  });

  it("can control a round like its owner", async () => {
    await assertSucceeds(updateDoc(doc(adminDb(), paths.session), { status: "live" }));
    await assertSucceeds(updateDoc(doc(adminDb(), paths.player(PLAYER)), { name: "Renamed" }));
    await assertFails(updateDoc(doc(adminDb(), paths.session), { status: "ended" }));
    await assertFails(updateDoc(doc(adminDb(), paths.session), { draws: [{ itemId: "i1", at: 1 }] }));
    await assertFails(updateDoc(doc(adminDb(), paths.player(PLAYER)), { marks: { "001": [0] } }));
  });

  it("cannot read private round docs or join codes", async () => {
    await assertFails(getDoc(doc(adminDb(), `${paths.session}/private/drawState`)));
    await assertFails(getDoc(doc(adminDb(), "joinCodes/ABCDEF")));
  });

  it("an anonymous user with the claim gets no owner access", async () => {
    await assertFails(getDocs(collection(anonAdminDb(), `${paths.game}/sessions`)));
    await assertFails(updateDoc(doc(anonAdminDb(), paths.session), { status: "live" }));
  });
});
