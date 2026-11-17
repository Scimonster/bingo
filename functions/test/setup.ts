import { getApps, initializeApp } from "firebase-admin/app";

// Admin SDK for the integration tests (emulator hosts come from `firebase emulators:exec`).
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  process.env.STORAGE_EMULATOR_HOST ??= `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
}
if (!getApps().length) initializeApp({ projectId: "demo-bingo", storageBucket: "demo-bingo.appspot.com" });
