import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, getMetadata, listAll, ref, uploadBytes } from "firebase/storage";
import { anon, bucket, gameData, host, OTHER_HOST, OWNER, PLAYER, seed, setupEnv } from "./helpers";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await setupEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seed(env, { "games/g1": gameData() });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const st = bucket(ctx);
    await uploadBytes(ref(st, `users/${OWNER}/images/img1/thumb.webp`), bytes(10), { contentType: "image/webp" });
    await uploadBytes(ref(st, `exports/g1/sheets-1-10.pdf`), bytes(10), { contentType: "application/pdf" });
  });
});

function bytes(n: number): Uint8Array {
  return new Uint8Array(n);
}

const img = (uid: string, file = "thumb.webp", id = "img2") => `users/${uid}/images/${id}/${file}`;

describe("images: upload", () => {
  it("owner (host) can upload thumb and print variants of allowed types", async () => {
    const st = bucket(host(env, OWNER));
    await assertSucceeds(uploadBytes(ref(st, img(OWNER, "thumb.webp")), bytes(100), { contentType: "image/webp" }));
    await assertSucceeds(uploadBytes(ref(st, img(OWNER, "print.webp")), bytes(100), { contentType: "image/png" }));
    await assertSucceeds(uploadBytes(ref(st, img(OWNER, "print.webp", "img3")), bytes(100), { contentType: "image/jpeg" }));
    await assertSucceeds(uploadBytes(ref(st, img(OWNER, "print.webp", "img4")), bytes(100), { contentType: "image/gif" }));
  });

  it("owner can overwrite an existing image", async () => {
    const st = bucket(host(env, OWNER));
    await assertSucceeds(uploadBytes(ref(st, img(OWNER, "thumb.webp", "img1")), bytes(50), { contentType: "image/webp" }));
  });

  it("rejects other content types and file names", async () => {
    const st = bucket(host(env, OWNER));
    await assertFails(uploadBytes(ref(st, img(OWNER)), bytes(100), { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(st, img(OWNER)), bytes(100), { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(st, img(OWNER, "evil.html")), bytes(100), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(st, `users/${OWNER}/images/flat.webp`), bytes(100), { contentType: "image/webp" }));
  });

  it("rejects files of 10 MB or more", async () => {
    const st = bucket(host(env, OWNER));
    await assertFails(uploadBytes(ref(st, img(OWNER)), bytes(10 * 1024 * 1024), { contentType: "image/webp" }));
    await assertSucceeds(uploadBytes(ref(st, img(OWNER)), bytes(10 * 1024 * 1024 - 1), { contentType: "image/webp" }));
  });

  it("rejects uploads into someone else's folder, by anonymous users, or unauthenticated", async () => {
    await assertFails(uploadBytes(ref(bucket(host(env, OTHER_HOST)), img(OWNER)), bytes(10), { contentType: "image/webp" }));
    await assertFails(uploadBytes(ref(bucket(anon(env, PLAYER)), img(PLAYER)), bytes(10), { contentType: "image/webp" }));
    await assertFails(uploadBytes(ref(bucket(env.unauthenticatedContext()), img(OWNER)), bytes(10), { contentType: "image/webp" }));
  });

  it("nobody can delete images", async () => {
    await assertFails(deleteObject(ref(bucket(host(env, OWNER)), img(OWNER, "thumb.webp", "img1"))));
  });
});

describe("images: read", () => {
  const existing = img(OWNER, "thumb.webp", "img1");

  it("any signed-in user can get an image by path", async () => {
    await assertSucceeds(getBytes(ref(bucket(anon(env, PLAYER)), existing)));
    await assertSucceeds(getMetadata(ref(bucket(host(env, OTHER_HOST)), existing)));
    await assertSucceeds(getBytes(ref(bucket(host(env, OWNER)), existing)));
  });

  it("unauthenticated users cannot", async () => {
    await assertFails(getBytes(ref(bucket(env.unauthenticatedContext()), existing)));
  });

  it("only the owner can list", async () => {
    await assertSucceeds(listAll(ref(bucket(host(env, OWNER)), `users/${OWNER}/images`)));
    await assertSucceeds(listAll(ref(bucket(host(env, OWNER)), `users/${OWNER}/images/img1`)));
    await assertFails(listAll(ref(bucket(anon(env, PLAYER)), `users/${OWNER}/images`)));
    await assertFails(listAll(ref(bucket(host(env, OTHER_HOST)), `users/${OWNER}/images/img1`)));
  });
});

describe("exports", () => {
  const pdf = "exports/g1/sheets-1-10.pdf";

  it("the game owner can read exports", async () => {
    await assertSucceeds(getBytes(ref(bucket(host(env, OWNER)), pdf)));
  });

  it("others cannot read exports", async () => {
    await assertFails(getBytes(ref(bucket(host(env, OTHER_HOST)), pdf)));
    await assertFails(getBytes(ref(bucket(anon(env, PLAYER)), pdf)));
    await assertFails(getBytes(ref(bucket(env.unauthenticatedContext()), pdf)));
  });

  it("nobody can write exports", async () => {
    await assertFails(uploadBytes(ref(bucket(host(env, OWNER)), "exports/g1/new.pdf"), bytes(10), { contentType: "application/pdf" }));
    await assertFails(deleteObject(ref(bucket(host(env, OWNER)), pdf)));
  });
});
