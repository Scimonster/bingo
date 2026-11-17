import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
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
  PLAYER2,
  seed,
  seedWorld,
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

describe("items: read", () => {
  it("owner and members can list and get items", async () => {
    await assertSucceeds(getDocs(collection(db(host(env, OWNER)), `${G}/items`)));
    await assertSucceeds(getDocs(collection(db(anon(env, PLAYER)), `${G}/items`)));
    await assertSucceeds(getDocs(collection(db(anon(env, DISPLAY)), `${G}/items`)));
    await assertSucceeds(getDoc(doc(db(anon(env, PLAYER)), paths.item("i1"))));
  });

  it("strangers and other hosts cannot", async () => {
    await assertFails(getDocs(collection(db(anon(env, STRANGER)), `${G}/items`)));
    await assertFails(getDoc(doc(db(host(env, OTHER_HOST)), paths.item("i1"))));
    await assertFails(getDoc(doc(db(env.unauthenticatedContext()), paths.item("i1"))));
  });
});

describe("items: write while unlocked", () => {
  const ownerItem = (id: string) => doc(db(host(env, OWNER)), paths.item(id));

  it("owner can create text and image items", async () => {
    await assertSucceeds(setDoc(ownerItem("t"), { type: "text", text: "Dog", createdAt: serverTimestamp() }));
    await assertSucceeds(
      setDoc(ownerItem("im"), { type: "image", storagePath: "users/owner/images/abc", createdAt: serverTimestamp() }),
    );
    await assertSucceeds(
      setDoc(ownerItem("im2"), { type: "image", storagePath: "users/owner/images/abc", text: "Caption", createdAt: serverTimestamp() }),
    );
  });

  it("validates item shape", async () => {
    const ts = serverTimestamp();
    await assertFails(setDoc(ownerItem("x"), { type: "text", text: "", createdAt: ts }));
    await assertFails(setDoc(ownerItem("x"), { type: "text", text: "x".repeat(201), createdAt: ts }));
    await assertSucceeds(setDoc(ownerItem("x"), { type: "text", text: "x".repeat(200), createdAt: ts }));
    await assertFails(setDoc(ownerItem("y"), { type: "text", createdAt: ts }));
    await assertFails(setDoc(ownerItem("y"), { type: "text", text: "a", storagePath: "users/owner/images/a", createdAt: ts }));
    await assertFails(setDoc(ownerItem("y"), { type: "image", createdAt: ts }));
    await assertFails(setDoc(ownerItem("y"), { type: "image", storagePath: "users/owner/images/a/thumb.webp", createdAt: ts }));
    await assertFails(setDoc(ownerItem("y"), { type: "image", storagePath: "exports/g1/x", createdAt: ts }));
    await assertFails(setDoc(ownerItem("y"), { type: "audio", text: "a", createdAt: ts }));
    await assertFails(setDoc(ownerItem("y"), { type: "text", text: "a", createdAt: ts, extra: 1 }));
    await assertFails(setDoc(ownerItem("y"), { type: "text", text: "a", createdAt: 5 }));
    await assertFails(setDoc(ownerItem("y"), { type: "text", text: "a" }));
  });

  it("owner can edit and delete items", async () => {
    await assertSucceeds(updateDoc(ownerItem("i1"), { text: "Cats" }));
    await assertSucceeds(updateDoc(ownerItem("i2"), { text: "A caption" }));
    await assertFails(updateDoc(ownerItem("i1"), { createdAt: 99 }));
    await assertFails(updateDoc(ownerItem("i1"), { text: "" }));
    await assertSucceeds(deleteDoc(ownerItem("i1")));
  });

  it("non-owners cannot write items", async () => {
    const data = { type: "text", text: "Hack", createdAt: serverTimestamp() };
    await assertFails(setDoc(doc(db(anon(env, PLAYER)), paths.item("h")), data));
    await assertFails(setDoc(doc(db(host(env, OTHER_HOST)), paths.item("h")), data));
    await assertFails(updateDoc(doc(db(anon(env, PLAYER)), paths.item("i1")), { text: "Hack" }));
    await assertFails(deleteDoc(doc(db(host(env, OTHER_HOST)), paths.item("i1"))));
  });
});

describe("items: locked game", () => {
  beforeEach(async () => {
    await seed(env, { [G]: gameData({ contentLocked: true }) });
  });
  const ownerItem = (id: string) => doc(db(host(env, OWNER)), paths.item(id));

  it("denies create, update and delete after lock", async () => {
    await assertFails(setDoc(ownerItem("new"), { type: "text", text: "Late", createdAt: serverTimestamp() }));
    await assertFails(updateDoc(ownerItem("i1"), { text: "Changed" }));
    await assertFails(deleteDoc(ownerItem("i1")));
  });

  it("still allows reads", async () => {
    await assertSucceeds(getDocs(collection(db(host(env, OWNER)), `${G}/items`)));
  });
});

describe("sheets and boards", () => {
  for (const sub of ["sheets", "boards"] as const) {
    const id = sub === "sheets" ? "001" : "b001-0";

    it(`${sub}: owner and members can read`, async () => {
      await assertSucceeds(getDocs(collection(db(host(env, OWNER)), `${G}/${sub}`)));
      await assertSucceeds(getDocs(collection(db(anon(env, PLAYER)), `${G}/${sub}`)));
      await assertSucceeds(getDoc(doc(db(anon(env, DISPLAY)), `${G}/${sub}/${id}`)));
    });

    it(`${sub}: strangers cannot read`, async () => {
      await assertFails(getDocs(collection(db(anon(env, STRANGER)), `${G}/${sub}`)));
      await assertFails(getDoc(doc(db(host(env, OTHER_HOST)), `${G}/${sub}/${id}`)));
    });

    it(`${sub}: nobody can write`, async () => {
      await assertFails(setDoc(doc(db(host(env, OWNER)), `${G}/${sub}/new`), { serial: 9 }));
      await assertFails(updateDoc(doc(db(host(env, OWNER)), `${G}/${sub}/${id}`), { fingerprint: "y" }));
      await assertFails(deleteDoc(doc(db(host(env, OWNER)), `${G}/${sub}/${id}`)));
      await assertFails(setDoc(doc(db(anon(env, PLAYER)), `${G}/${sub}/new`), { serial: 9 }));
    });
  }
});

describe("members", () => {
  it("a user can read their own membership", async () => {
    await assertSucceeds(getDoc(doc(db(anon(env, PLAYER)), `${G}/members/${PLAYER}`)));
  });

  it("the owner can read memberships", async () => {
    await assertSucceeds(getDoc(doc(db(host(env, OWNER)), `${G}/members/${PLAYER}`)));
  });

  it("users cannot read others' memberships or list them", async () => {
    await assertFails(getDoc(doc(db(anon(env, PLAYER)), `${G}/members/${PLAYER2}`)));
    await assertFails(getDocs(collection(db(anon(env, PLAYER)), `${G}/members`)));
    await assertFails(getDoc(doc(db(anon(env, STRANGER)), `${G}/members/${PLAYER}`)));
  });

  it("nobody can write memberships (not even to join themselves)", async () => {
    await assertFails(setDoc(doc(db(anon(env, STRANGER)), `${G}/members/${STRANGER}`), { sessions: { s1: "display" } }));
    await assertFails(updateDoc(doc(db(anon(env, PLAYER)), `${G}/members/${PLAYER}`), { "sessions.s1": "display" }));
    await assertFails(deleteDoc(doc(db(host(env, OWNER)), `${G}/members/${PLAYER}`)));
  });
});

describe("joinCodes", () => {
  it("no client access", async () => {
    await assertFails(getDoc(doc(db(anon(env, PLAYER)), "joinCodes/ABCDEF")));
    await assertFails(getDoc(doc(db(host(env, OWNER)), "joinCodes/ABCDEF")));
    await assertFails(getDocs(collection(db(host(env, OWNER)), "joinCodes")));
    await assertFails(setDoc(doc(db(host(env, OWNER)), "joinCodes/ZZZZZZ"), { gameId: "g1", sessionId: "s1", open: true }));
  });
});
