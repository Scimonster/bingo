#!/usr/bin/env node
/**
 * Grants or revokes the site-admin custom claim (`admin: true`) for a host account.
 *
 *   pnpm admin:set <email> [--revoke] [--emulator] [--project <id>]
 *
 * --emulator targets the local Auth emulator (127.0.0.1:9099, project demo-bingo). Otherwise it
 * uses Application Default Credentials (`gcloud auth application-default login`) against the
 * project in .firebaserc. The user must sign out and in again (or wait up to an hour) for the
 * new claim to reach their ID token; the web app refreshes it when the admin page opens.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [, v] = args.splice(i, 2);
  return v;
};

const revoke = flag("--revoke");
const emulator = flag("--emulator");
let projectId = option("--project");
const email = args[0];
if (!email || args.length > 1) {
  console.error("Usage: pnpm admin:set <email> [--revoke] [--emulator] [--project <id>]");
  process.exit(2);
}

if (emulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  projectId ??= "demo-bingo";
} else if (!projectId) {
  const rc = resolve(dirname(fileURLToPath(import.meta.url)), "../../.firebaserc");
  projectId = JSON.parse(readFileSync(rc, "utf8")).projects.default;
}

initializeApp({ projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...(user.customClaims ?? {}) };
if (revoke) delete claims.admin;
else claims.admin = true;
await auth.setCustomUserClaims(user.uid, claims);
console.log(`${revoke ? "Revoked" : "Granted"} admin for ${email} (${user.uid}) in ${projectId}${emulator ? " (emulator)" : ""}.`);
